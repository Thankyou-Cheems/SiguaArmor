import * as THREE from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import type {
  Evidence,
  HitSceneComponent,
  HitSceneRecordHeader,
  HitSceneSurfaceProfile,
  ParsedHitSceneRecord,
} from "./hit-scene-record.ts";
import {
  runtimeHitBufferLoader,
  type RawRuntimeHitBufferRef,
  type RuntimeHitBufferRef,
} from "./runtime-hit-buffer.ts";
import { runtimeWikiAssetUrl } from "./runtime-visual-lazy-load.ts";

export type {
  Evidence,
  HitSceneComponent,
  HitSceneSurfaceProfile,
} from "./hit-scene-record.ts";


export interface RuntimeHitArtifactDescriptor {
  accessStatus: "public";
  reason: string;
  formatVersion: "hit-scene-runtime/v1";
  vehicleId: string;
  recordUrl: string;
  geometryUrl?: string;
  geometry?: RuntimeHitBufferRef;
  bvhUrl: string;
  triangles: number;
  components: number;
  surfaceProfiles: number;
  bvhNodes: number;
}

export type RuntimeHitRecordDescriptor = Pick<
  RuntimeHitArtifactDescriptor,
  "vehicleId" | "recordUrl"
>;

export type RuntimeHitEvidence<T> = Evidence<T>;
export type RuntimeHitComponent = HitSceneComponent;
export type RuntimeHitSurfaceProfile = HitSceneSurfaceProfile;
export type ParsedHitSceneRuntime = ParsedHitSceneRecord;

interface RuntimeSection {
  byteOffset: number;
  byteLength: number;
  elementCount: number;
  componentType: "bytes" | "float32" | "uint16" | "uint32";
  itemSize: number;
}

export interface RuntimeHitRecord {
  schemaVersion: "1.0.0";
  formatVersion: "hit-scene-runtime/v1";
  vehicleId: string;
  header: HitSceneRecordHeader & {
    identitySha256: string;
    counts: HitSceneRecordHeader["counts"] & { bvhNodes: number };
  };
  geometry: {
    path: string;
    sha256: string;
    bytes: number;
    sections: {
      positions: RuntimeSection;
      indices: RuntimeSection;
      triangleComponentIndex: RuntimeSection;
      triangleSurfaceProfileIndex: RuntimeSection;
      faceNormals: RuntimeSection;
    };
  };
  bvh: {
    path: string;
    sha256: string;
    bytes: number;
    serializationVersion: 1;
    indirect: true;
    roots: RuntimeSection[];
    indirectBuffer: RuntimeSection;
  };
}

export interface ParsedRuntimeHitScene extends ParsedHitSceneRecord {
  record: RuntimeHitRecord;
  positions: Float32Array;
  indices: Uint32Array;
  triangleComponentIndex: Uint16Array | Uint32Array;
  triangleSurfaceProfileIndex: Uint16Array | Uint32Array;
  faceNormals: Float32Array;
  analysisGeometry: THREE.BufferGeometry;
  boundsTree: MeshBVH;
}


function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid hit runtime: ${message}`);
}


async function fetchRuntimeAsset(url: string, label: string) {
  assert(/^\/[A-Za-z0-9_./-]+$/.test(url) && !url.includes(".."), `${label} URL is unsafe`);
  const wikiUrl = runtimeWikiAssetUrl(url);
  const response = await fetch(wikiUrl, { cache: "force-cache" });
  assert(response.ok, `${label} request returned HTTP ${response.status}`);
  return response.arrayBuffer();
}

function rawHitBufferRef(
  url: string,
  decodedByteLength: number,
  decodedSha256: string,
): RawRuntimeHitBufferRef {
  return {
    encoding: "raw",
    url,
    decodedByteLength,
    decodedSha256,
  };
}

function geometryHitBufferRef(
  descriptor: RuntimeHitArtifactDescriptor,
  record: RuntimeHitRecord,
): RuntimeHitBufferRef {
  assert(
    !(descriptor.geometry && descriptor.geometryUrl),
    "descriptor provides both geometry and geometry URL",
  );
  const ref = descriptor.geometry ?? (
    descriptor.geometryUrl
      ? rawHitBufferRef(
        descriptor.geometryUrl,
        record.geometry.bytes,
        record.geometry.sha256,
      )
      : null
  );
  assert(ref, "descriptor geometry is missing");
  assert(
    ref.decodedByteLength === record.geometry.bytes,
    "descriptor geometry byte length mismatch",
  );
  assert(
    ref.decodedSha256 === record.geometry.sha256,
    "descriptor geometry SHA-256 mismatch",
  );
  return ref;
}

function geometrySourceUrl(descriptor: RuntimeHitArtifactDescriptor): string {
  assert(
    !(descriptor.geometry && descriptor.geometryUrl),
    "descriptor provides both geometry and geometry URL",
  );
  const url = descriptor.geometry?.url ?? descriptor.geometryUrl;
  assert(url, "descriptor geometry is missing");
  return url;
}

function bvhHitBufferRef(
  descriptor: RuntimeHitArtifactDescriptor,
  record: RuntimeHitRecord,
): RawRuntimeHitBufferRef {
  return rawHitBufferRef(
    descriptor.bvhUrl,
    record.bvh.bytes,
    record.bvh.sha256,
  );
}


function validateSection(
  section: RuntimeSection,
  buffer: ArrayBuffer,
  type: RuntimeSection["componentType"] | RuntimeSection["componentType"][],
  itemSize: number,
  label: string,
) {
  const allowed = Array.isArray(type) ? type : [type];
  assert(section && allowed.includes(section.componentType), `${label} component type mismatch`);
  assert(section.itemSize === itemSize, `${label} item size mismatch`);
  const width = section.componentType === "bytes"
    ? 1
    : section.componentType === "uint16"
      ? 2
      : 4;
  assert(section.byteLength === section.elementCount * width, `${label} byte length is inconsistent`);
  assert(section.byteOffset >= 0 && section.byteOffset + section.byteLength <= buffer.byteLength, `${label} exceeds its artifact`);
  return section;
}


function typedSection(
  buffer: ArrayBuffer,
  section: RuntimeSection,
  label: string,
): Float32Array | Uint16Array | Uint32Array {
  if (section.componentType === "float32") {
    return new Float32Array(buffer, section.byteOffset, section.elementCount);
  }
  if (section.componentType === "uint16") {
    return new Uint16Array(buffer, section.byteOffset, section.elementCount);
  }
  assert(section.componentType === "uint32", `${label} is not a typed numeric section`);
  return new Uint32Array(buffer, section.byteOffset, section.elementCount);
}


function rootSection(buffer: ArrayBuffer, section: RuntimeSection) {
  return buffer.slice(section.byteOffset, section.byteOffset + section.byteLength);
}

function parseRuntimeHitRecord(
  recordBuffer: ArrayBuffer,
  descriptor: RuntimeHitRecordDescriptor,
) {
  const record = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(recordBuffer),
  ) as RuntimeHitRecord;
  assert(record.schemaVersion === "1.0.0", "record schema mismatch");
  assert(record.formatVersion === "hit-scene-runtime/v1", "record format mismatch");
  assert(record.header.formatVersion === "hit-scene-record/v1", "semantic record format mismatch");
  assert(
    record.vehicleId === descriptor.vehicleId && record.header.vehicleId === descriptor.vehicleId,
    "record identity mismatch",
  );
  assert(Array.isArray(record.header.weapons), "record weapons are missing");
  return record;
}

export async function loadRuntimeHitRecord(
  descriptor: RuntimeHitRecordDescriptor,
): Promise<RuntimeHitRecord> {
  assert(/^vehicle-[0-9a-f]{64}$/.test(descriptor.vehicleId), "descriptor identity is not exact");
  const recordBuffer = await fetchRuntimeAsset(
    descriptor.recordUrl,
    "record",
  );
  return parseRuntimeHitRecord(recordBuffer, descriptor);
}


export async function loadRuntimeHitScene(
  descriptor: RuntimeHitArtifactDescriptor,
): Promise<ParsedRuntimeHitScene> {
  assert(descriptor.formatVersion === "hit-scene-runtime/v1", "descriptor format mismatch");
  assert(/^vehicle-[0-9a-f]{64}$/.test(descriptor.vehicleId), "descriptor identity is not exact");
  const [recordBuffer, geometrySource, bvhSource] = await Promise.all([
    fetchRuntimeAsset(descriptor.recordUrl, "record"),
    fetchRuntimeAsset(geometrySourceUrl(descriptor), "geometry"),
    fetchRuntimeAsset(descriptor.bvhUrl, "BVH"),
  ]);
  const record = parseRuntimeHitRecord(recordBuffer, descriptor);
  const [geometryBuffer, bvhBuffer] = await Promise.all([
    runtimeHitBufferLoader.load(
      geometryHitBufferRef(descriptor, record),
      geometrySource,
    ),
    runtimeHitBufferLoader.load(bvhHitBufferRef(descriptor, record), bvhSource),
  ]);

  const sections = record.geometry.sections;
  const positions = typedSection(
    geometryBuffer,
    validateSection(sections.positions, geometryBuffer, "float32", 3, "positions"),
    "positions",
  ) as Float32Array;
  const indices = typedSection(
    geometryBuffer,
    validateSection(sections.indices, geometryBuffer, "uint32", 1, "indices"),
    "indices",
  ) as Uint32Array;
  const triangleComponentIndex = typedSection(
    geometryBuffer,
    validateSection(sections.triangleComponentIndex, geometryBuffer, ["uint16", "uint32"], 1, "triangle component index"),
    "triangle component index",
  ) as Uint16Array | Uint32Array;
  const triangleSurfaceProfileIndex = typedSection(
    geometryBuffer,
    validateSection(sections.triangleSurfaceProfileIndex, geometryBuffer, ["uint16", "uint32"], 1, "triangle profile index"),
    "triangle profile index",
  ) as Uint16Array | Uint32Array;
  const faceNormals = typedSection(
    geometryBuffer,
    validateSection(sections.faceNormals, geometryBuffer, "float32", 3, "face normals"),
    "face normals",
  ) as Float32Array;
  const counts = record.header.counts;
  assert(positions.length === counts.vertices * 3, "vertex count mismatch");
  assert(indices.length === counts.triangles * 3, "triangle count mismatch");
  assert(triangleComponentIndex.length === counts.triangles, "triangle component count mismatch");
  assert(triangleSurfaceProfileIndex.length === counts.triangles, "triangle profile count mismatch");
  assert(faceNormals.length === counts.triangles * 3, "face normal count mismatch");
  assert(record.header.components.length === counts.components, "component table count mismatch");
  assert(record.header.surfaceProfiles.length === counts.surfaceProfiles, "surface table count mismatch");

  const analysisGeometry = new THREE.BufferGeometry();
  analysisGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  analysisGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const roots = record.bvh.roots.map((section, index) =>
    rootSection(
      bvhBuffer,
      validateSection(section, bvhBuffer, "bytes", 1, `BVH root ${index}`),
    )
  );
  assert(roots.length > 0, "BVH has no roots");
  const indirectBuffer = typedSection(
    bvhBuffer,
    validateSection(record.bvh.indirectBuffer, bvhBuffer, "uint32", 1, "BVH indirect buffer"),
    "BVH indirect buffer",
  ) as Uint32Array;
  assert(indirectBuffer.length === counts.triangles, "BVH indirect count mismatch");
  const boundsTree = MeshBVH.deserialize(
    {
      version: 1,
      roots,
      index: indices,
      indirectBuffer,
    } as SerializedBVH,
    analysisGeometry,
    { setIndex: false },
  );
  assert(boundsTree.indirect === true, "deserialized BVH is not indirect");
  analysisGeometry.boundsTree = boundsTree;
  analysisGeometry.computeBoundingBox();
  analysisGeometry.computeBoundingSphere();
  return {
    record,
    header: record.header,
    positions,
    indices,
    triangleComponentIndex,
    triangleSurfaceProfileIndex,
    faceNormals,
    bvh: {
      version: 1,
      roots,
      index: indices,
      indirectBuffer,
      indirect: true,
    },
    analysisGeometry,
    boundsTree,
  };
}


export function observedValue<T>(evidence: RuntimeHitEvidence<T> | undefined): T | null {
  return evidence &&
    (evidence.state === "observed" || evidence.state === "derived") &&
    evidence.value !== null
    ? evidence.value
    : null;
}
