import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";

import { createRuntimeHitBufferLoader } from "../../lib/runtime-hit-buffer.ts";
import { editorNativePenetrationPrefilter } from "../../lib/editor-native-penetration.ts";
import { normalizeHitIntersections } from "../../lib/hit-intersection-ordering.ts";
import { loadRuntimeHitScene } from "../../lib/runtime-hit-scene.ts";

const SHA256_01020304 = "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";
const SHA256_010203040506 = "7192385c3c0605de55bb9476ce1d90748190ecb32a8eed7f5207b30cf6a1fe89";

test("raw hit buffers return their verified decoded bytes", async () => {
  const loader = createRuntimeHitBufferLoader({
    read: async (url) => {
      assert.equal(url, "/assets/hit/geometry.bin");
      return Uint8Array.from([1, 2, 3, 4]).buffer;
    },
  });

  const buffer = await loader.load({
    encoding: "raw",
    url: "/assets/hit/geometry.bin",
    decodedByteLength: 4,
    decodedSha256: SHA256_01020304,
  });

  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3, 4]);
});

test("meshopt-v1 restores packed uint16 tail bytes before verifying the decoded buffer", async () => {
  await MeshoptEncoder.ready;
  const first = MeshoptEncoder.encodeGltfBuffer(
    Uint8Array.from([1, 2, 3, 4]),
    1,
    4,
    "ATTRIBUTES",
  );
  const paddedTail = MeshoptEncoder.encodeGltfBuffer(
    Uint8Array.from([5, 6, 0, 0]),
    1,
    4,
    "ATTRIBUTES",
  );
  const source = new Uint8Array(first.byteLength + paddedTail.byteLength);
  source.set(first, 0);
  source.set(paddedTail, first.byteLength);
  const loader = createRuntimeHitBufferLoader({
    read: async () => source.buffer,
  });

  const buffer = await loader.load({
    encoding: "meshopt-v1",
    url: "/assets/hit/geometry.meshopt.bin",
    decodedByteLength: 6,
    decodedSha256: SHA256_010203040506,
    chunks: [{
      sourceByteOffset: 0,
      sourceByteLength: first.byteLength,
      decodedByteOffset: 0,
      decodedByteLength: 4,
      decodedByteStride: 4,
      count: 1,
      byteStride: 4,
      mode: "ATTRIBUTES",
      filter: "NONE",
    }, {
      sourceByteOffset: first.byteLength,
      sourceByteLength: paddedTail.byteLength,
      decodedByteOffset: 4,
      decodedByteLength: 2,
      decodedByteStride: 2,
      count: 1,
      byteStride: 4,
      mode: "ATTRIBUTES",
      filter: "NONE",
    }],
  });

  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3, 4, 5, 6]);
});

test("meshopt-v1 removes per-element uint16 padding instead of slicing the padded stream", async () => {
  await MeshoptEncoder.ready;
  const padded = Uint8Array.from([
    1, 2, 0, 0,
    3, 4, 0, 0,
    5, 6, 0, 0,
  ]);
  const source = MeshoptEncoder.encodeGltfBuffer(padded, 3, 4, "ATTRIBUTES");
  const loader = createRuntimeHitBufferLoader({
    read: async () => source.buffer,
  });

  const buffer = await loader.load({
    encoding: "meshopt-v1",
    url: "/assets/hit/geometry.meshopt.bin",
    decodedByteLength: 6,
    decodedSha256: SHA256_010203040506,
    chunks: [{
      sourceByteOffset: 0,
      sourceByteLength: source.byteLength,
      decodedByteOffset: 0,
      decodedByteLength: 6,
      decodedByteStride: 2,
      count: 3,
      byteStride: 4,
      mode: "ATTRIBUTES",
      filter: "NONE",
    }],
  });

  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3, 4, 5, 6]);
});

test("meshopt-v1 rejects an unsupported encoded stride before decode", async () => {
  let decodeCalls = 0;
  const loader = createRuntimeHitBufferLoader({
    read: async () => Uint8Array.from([0]).buffer,
    meshoptDecoder: {
      ready: Promise.resolve(),
      decodeGltfBuffer: () => { decodeCalls += 1; },
    },
  });

  await assert.rejects(
    loader.load({
      encoding: "meshopt-v1",
      url: "/assets/hit/malformed.meshopt.bin",
      decodedByteLength: 4,
      decodedSha256: SHA256_01020304,
      chunks: [{
        sourceByteOffset: 0,
        sourceByteLength: 1,
        decodedByteOffset: 0,
        decodedByteLength: 4,
        decodedByteStride: 4,
        count: 1,
        byteStride: 8,
        mode: "ATTRIBUTES",
        filter: "NONE",
      }],
    }),
    /encoded stride is invalid/u,
  );
  assert.equal(decodeCalls, 0);
});

test("equal decoded hashes share one in-flight read", async () => {
  let readCount = 0;
  let resolveRead;
  const waitingForBytes = new Promise((resolve) => {
    resolveRead = resolve;
  });
  const loader = createRuntimeHitBufferLoader({
    read: async () => {
      readCount += 1;
      return waitingForBytes;
    },
  });
  const ref = {
    encoding: "raw",
    url: "/assets/hit/shared.bin",
    decodedByteLength: 4,
    decodedSha256: SHA256_01020304,
  };

  const first = loader.load(ref);
  const second = loader.load({ ...ref, url: "/assets/hit/duplicate.bin" });
  assert.strictEqual(second, first);
  assert.equal(readCount, 1);

  resolveRead(Uint8Array.from([1, 2, 3, 4]).buffer);
  await first;
});

test("a pre-started source promise bypasses a second loader read", async () => {
  let resolveSource;
  const source = new Promise((resolve) => {
    resolveSource = resolve;
  });
  const loader = createRuntimeHitBufferLoader({
    read: async () => assert.fail("loader must use the supplied source promise"),
  });

  const pending = loader.load({
    encoding: "raw",
    url: "/assets/hit/prestarted.bin",
    decodedByteLength: 4,
    decodedSha256: SHA256_01020304,
  }, source);
  resolveSource(Uint8Array.from([1, 2, 3, 4]).buffer);

  assert.deepEqual([...new Uint8Array(await pending)], [1, 2, 3, 4]);
});

test("failed decoded hashes are not cached and can retry", async () => {
  let readCount = 0;
  const loader = createRuntimeHitBufferLoader({
    read: async () => {
      readCount += 1;
      if (readCount === 1) return Uint8Array.from([9, 2, 3, 4]).buffer;
      return Uint8Array.from([1, 2, 3, 4]).buffer;
    },
  });
  const ref = {
    encoding: "raw",
    url: "/assets/hit/retry.bin",
    decodedByteLength: 4,
    decodedSha256: SHA256_01020304,
  };

  await assert.rejects(loader.load(ref), /decoded SHA-256 does not match/u);
  const recovered = await loader.load(ref);

  assert.equal(readCount, 2);
  assert.deepEqual([...new Uint8Array(recovered)], [1, 2, 3, 4]);
});

function sha256(buffer) {
  return createHash("sha256")
    .update(new Uint8Array(buffer))
    .digest("hex");
}

function runtimeHitFixture({ invalidGeometryHash = false } = {}) {
  const vehicleId = `vehicle-${"a".repeat(64)}`;
  const geometryBuffer = new ArrayBuffer(64);
  new Float32Array(geometryBuffer, 0, 9).set([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  new Uint32Array(geometryBuffer, 36, 3).set([0, 1, 2]);
  new Uint16Array(geometryBuffer, 48, 1).set([0]);
  new Uint16Array(geometryBuffer, 50, 1).set([0]);
  new Float32Array(geometryBuffer, 52, 3).set([0, 0, 1]);

  const analysisGeometry = new THREE.BufferGeometry();
  analysisGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(geometryBuffer, 0, 9), 3),
  );
  analysisGeometry.setIndex(
    new THREE.BufferAttribute(new Uint32Array(geometryBuffer, 36, 3), 1),
  );
  const serialized = MeshBVH.serialize(
    new MeshBVH(analysisGeometry, { indirect: true }),
    { cloneBuffers: true },
  );
  const rootByteLength = serialized.roots.reduce(
    (total, root) => total + root.byteLength,
    0,
  );
  const indirect = Uint32Array.from(serialized.indirectBuffer);
  const indirectByteLength = indirect.byteLength;
  const bvhBuffer = new ArrayBuffer(rootByteLength + indirectByteLength);
  const bvhBytes = new Uint8Array(bvhBuffer);
  let byteOffset = 0;
  const roots = serialized.roots.map((root) => {
    bvhBytes.set(new Uint8Array(root), byteOffset);
    const section = {
      byteOffset,
      byteLength: root.byteLength,
      elementCount: root.byteLength,
      componentType: "bytes",
      itemSize: 1,
    };
    byteOffset += root.byteLength;
    return section;
  });
  bvhBytes.set(
    new Uint8Array(indirect.buffer, indirect.byteOffset, indirect.byteLength),
    byteOffset,
  );

  const record = {
    schemaVersion: "1.0.0",
    formatVersion: "hit-scene-runtime/v1",
    vehicleId,
    header: {
      formatVersion: "hit-scene-record/v1",
      vehicleId,
      identitySha256: "b".repeat(64),
      counts: {
        vertices: 3,
        triangles: 1,
        components: 1,
        surfaceProfiles: 1,
        bvhNodes: 1,
      },
      weapons: [],
      components: [{}],
      surfaceProfiles: [{}],
    },
    geometry: {
      path: "/assets/hit/geometry.bin",
      sha256: invalidGeometryHash ? SHA256_01020304 : sha256(geometryBuffer),
      bytes: geometryBuffer.byteLength,
      sections: {
        positions: {
          byteOffset: 0,
          byteLength: 36,
          elementCount: 9,
          componentType: "float32",
          itemSize: 3,
        },
        indices: {
          byteOffset: 36,
          byteLength: 12,
          elementCount: 3,
          componentType: "uint32",
          itemSize: 1,
        },
        triangleComponentIndex: {
          byteOffset: 48,
          byteLength: 2,
          elementCount: 1,
          componentType: "uint16",
          itemSize: 1,
        },
        triangleSurfaceProfileIndex: {
          byteOffset: 50,
          byteLength: 2,
          elementCount: 1,
          componentType: "uint16",
          itemSize: 1,
        },
        faceNormals: {
          byteOffset: 52,
          byteLength: 12,
          elementCount: 3,
          componentType: "float32",
          itemSize: 3,
        },
      },
    },
    bvh: {
      path: "/assets/hit/bvh.bin",
      sha256: sha256(bvhBuffer),
      bytes: bvhBuffer.byteLength,
      serializationVersion: 1,
      indirect: true,
      roots,
      indirectBuffer: {
        byteOffset,
        byteLength: indirectByteLength,
        elementCount: indirect.length,
        componentType: "uint32",
        itemSize: 1,
      },
    },
  };

  return {
    descriptor: {
      accessStatus: "public",
      reason: "fixture",
      formatVersion: "hit-scene-runtime/v1",
      vehicleId,
      recordUrl: "/assets/hit/record.json",
      geometryUrl: "/assets/hit/geometry.bin",
      bvhUrl: "/assets/hit/bvh.bin",
      triangles: 1,
      components: 1,
      surfaceProfiles: 1,
      bvhNodes: 1,
    },
    responses: new Map([
      ["/assets/hit/record.json", new TextEncoder().encode(JSON.stringify(record)).buffer],
      ["/assets/hit/geometry.bin", geometryBuffer],
      ["/assets/hit/bvh.bin", bvhBuffer],
    ]),
  };
}

test("legacy geometryUrl fails closed when its decoded hash disagrees with the record", async () => {
  const fixture = runtimeHitFixture({ invalidGeometryHash: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    const bytes = fixture.responses.get(pathname);
    assert.ok(bytes, `unexpected request ${pathname}`);
    return new Response(bytes, { status: 200 });
  };

  try {
    await assert.rejects(
      loadRuntimeHitScene(fixture.descriptor),
      /decoded SHA-256 does not match/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy geometryUrl remains a verified raw hit-scene source", async () => {
  const fixture = runtimeHitFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    const bytes = fixture.responses.get(pathname);
    assert.ok(bytes, `unexpected request ${pathname}`);
    return new Response(bytes, { status: 200 });
  };

  try {
    const scene = await loadRuntimeHitScene(fixture.descriptor);
    assert.deepEqual([...scene.indices], [0, 1, 2]);
    assert.equal(scene.boundsTree.indirect, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meshopt-v1 geometry feeds the unchanged hit-scene parser", async () => {
  const fixture = runtimeHitFixture();
  await MeshoptEncoder.ready;
  const rawGeometry = fixture.responses.get("/assets/hit/geometry.bin");
  const sections = [
    { offset: 0, length: 36, count: 3, byteStride: 12 },
    { offset: 36, length: 12, count: 3, byteStride: 4 },
    { offset: 48, length: 2, count: 1, byteStride: 4, padded: true },
    { offset: 50, length: 2, count: 1, byteStride: 4, padded: true },
    { offset: 52, length: 12, count: 1, byteStride: 12 },
  ];
  const encodedSections = sections.map((section) => {
    const source = new Uint8Array(section.padded ? 4 : section.length);
    source.set(new Uint8Array(rawGeometry, section.offset, section.length));
    return MeshoptEncoder.encodeGltfBuffer(
      source,
      section.count,
      section.byteStride,
      "ATTRIBUTES",
    );
  });
  const encoded = new Uint8Array(
    encodedSections.reduce((total, section) => total + section.byteLength, 0),
  );
  let sourceByteOffset = 0;
  const chunks = encodedSections.map((encodedSection, index) => {
    const section = sections[index];
    encoded.set(encodedSection, sourceByteOffset);
    const chunk = {
      sourceByteOffset,
      sourceByteLength: encodedSection.byteLength,
      decodedByteOffset: section.offset,
      decodedByteLength: section.length,
      decodedByteStride: section.padded ? 2 : section.byteStride,
      count: section.count,
      byteStride: section.byteStride,
      mode: "ATTRIBUTES",
      filter: "NONE",
    };
    sourceByteOffset += encodedSection.byteLength;
    return chunk;
  });
  fixture.descriptor.geometry = {
    encoding: "meshopt-v1",
    url: "/assets/hit/geometry.meshopt.bin",
    decodedByteLength: rawGeometry.byteLength,
    decodedSha256: sha256(rawGeometry),
    chunks,
  };
  delete fixture.descriptor.geometryUrl;
  fixture.responses.set("/assets/hit/geometry.meshopt.bin", encoded.buffer);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    const bytes = fixture.responses.get(pathname);
    assert.ok(bytes, `unexpected request ${pathname}`);
    return new Response(bytes, { status: 200 });
  };

  try {
    const scene = await loadRuntimeHitScene(fixture.descriptor);
    assert.deepEqual([...scene.positions], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual([...scene.indices], [0, 1, 2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function semanticRayIntersections(scene) {
  // This is the same public-consumer mapping used by RuntimeVehicleViewer:
  // raycast the parsed analysis mesh, then resolve each source face through
  // the parsed component/profile tables. It intentionally has no access to
  // the descriptor's transport encoding or compressed bytes.
  const mesh = new THREE.Mesh(
    scene.analysisGeometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  mesh.raycast = acceleratedRaycast;
  mesh.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0.25, 0.25, 3),
    new THREE.Vector3(0, 0, -1),
  );
  raycaster.firstHitOnly = false;
  const rayIntersections = raycaster.intersectObject(mesh, false).map((intersection) => {
    const triangleIndex = intersection.faceIndex;
    assert.notEqual(triangleIndex, undefined, "BVH raycast must retain the source face");
    const componentIndex = scene.triangleComponentIndex[triangleIndex];
    const surfaceProfileIndex = scene.triangleSurfaceProfileIndex[triangleIndex];
    const component = scene.header.components[componentIndex];
    const surface = scene.header.surfaceProfiles[surfaceProfileIndex];
    assert.ok(component, `missing component ${componentIndex}`);
    assert.ok(surface, `missing surface ${surfaceProfileIndex}`);
    const normal = new THREE.Vector3()
      .fromArray(scene.faceNormals, triangleIndex * 3)
      .normalize();
    return {
      record: scene.record.vehicleId,
      component: component.componentId,
      surface: surface.surfaceProfileId,
      sourceFace: triangleIndex,
      triangle: intersection.faceIndex,
      distance: intersection.distance,
      point: intersection.point.toArray(),
      normal: normal.toArray(),
      accepted: editorNativePenetrationPrefilter(
        surface.considerForPenetration.state === "observed"
          ? surface.considerForPenetration.value
          : null,
      ) !== "skip",
      componentIndex,
      surfaceProfileIndex,
    };
  });
  const intersections = normalizeHitIntersections(
    rayIntersections.map((intersection) => ({
      ...intersection,
      distanceM: intersection.distance,
      componentId: intersection.componentIndex,
      sourceFaceId: intersection.sourceFace,
      faceNormal: intersection.normal,
    })),
  ).map(({ hit }) => ({
    record: hit.record,
    component: hit.component,
    surface: hit.surface,
    sourceFace: hit.sourceFace,
    triangle: hit.triangle,
    distance: hit.distance,
    point: hit.point,
    normal: hit.normal,
    accepted: hit.accepted,
  }));
  return {
    intersections,
    firstAccepted: intersections.find((intersection) => intersection.accepted) ?? null,
  };
}

function multiLayerRuntimeHitFixture() {
  const vehicleId = `vehicle-${"c".repeat(64)}`;
  const geometryBuffer = new ArrayBuffer(192);
  new Float32Array(geometryBuffer, 0, 27).set([
    0, 0, 2, 1, 0, 2, 0, 1, 2,
    0, 0, 1, 1, 0, 1, 0, 1, 1,
    0, 0, 0, 1, 0, 0, 0, 1, 0,
  ]);
  new Uint32Array(geometryBuffer, 108, 9).set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  new Uint16Array(geometryBuffer, 144, 3).set([0, 1, 2]);
  new Uint16Array(geometryBuffer, 150, 3).set([0, 1, 2]);
  new Float32Array(geometryBuffer, 156, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);

  const analysisGeometry = new THREE.BufferGeometry();
  analysisGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(geometryBuffer, 0, 27), 3),
  );
  analysisGeometry.setIndex(
    new THREE.BufferAttribute(new Uint32Array(geometryBuffer, 108, 9), 1),
  );
  const serialized = MeshBVH.serialize(
    new MeshBVH(analysisGeometry, { indirect: true }),
    { cloneBuffers: true },
  );
  const rootByteLength = serialized.roots.reduce(
    (total, root) => total + root.byteLength,
    0,
  );
  const indirect = Uint32Array.from(serialized.indirectBuffer);
  const bvhBuffer = new ArrayBuffer(rootByteLength + indirect.byteLength);
  const bvhBytes = new Uint8Array(bvhBuffer);
  let byteOffset = 0;
  const roots = serialized.roots.map((root) => {
    bvhBytes.set(new Uint8Array(root), byteOffset);
    const section = {
      byteOffset,
      byteLength: root.byteLength,
      elementCount: root.byteLength,
      componentType: "bytes",
      itemSize: 1,
    };
    byteOffset += root.byteLength;
    return section;
  });
  bvhBytes.set(
    new Uint8Array(indirect.buffer, indirect.byteOffset, indirect.byteLength),
    byteOffset,
  );

  const components = ["outer-skin", "spaced-plate", "core-armor"].map((componentId, index) => ({
    componentId,
    componentPath: `/fixture/${componentId}`,
    classPath: "/fixture/HitComponent",
    ownerIndex: 0,
    semanticKind: "armor",
    placementState: "resolved",
    geometryAssetIndex: index,
    directDamagePoolIndex: { state: "absent", value: null },
    collisionProfile: { state: "observed", value: "BlockAll" },
  }));
  const surfaceProfiles = [false, true, true].map((considerForPenetration, index) => ({
    surfaceProfileId: `surface-${index}`,
    componentIndex: index,
    sourceMaterialSlot: index,
    physicalMaterialPath: { state: "observed", value: `/fixture/material-${index}` },
    armorThicknessMm: { state: "observed", value: 10 + index },
    considerForPenetration: { state: "observed", value: considerForPenetration },
    allowPenetration: { state: "observed", value: true },
    damageParentActor: { state: "observed", value: false },
    armorDamageMultiplier: { state: "observed", value: 1 },
    damageAbsorbed: { state: "observed", value: 0 },
  }));
  const record = {
    schemaVersion: "1.0.0",
    formatVersion: "hit-scene-runtime/v1",
    vehicleId,
    header: {
      formatVersion: "hit-scene-record/v1",
      vehicleId,
      identitySha256: "d".repeat(64),
      counts: {
        vertices: 9,
        triangles: 3,
        components: 3,
        surfaceProfiles: 3,
        bvhNodes: 1,
      },
      weapons: [],
      components,
      surfaceProfiles,
    },
    geometry: {
      path: "/assets/hit/multilayer.bin",
      sha256: sha256(geometryBuffer),
      bytes: geometryBuffer.byteLength,
      sections: {
        positions: { byteOffset: 0, byteLength: 108, elementCount: 27, componentType: "float32", itemSize: 3 },
        indices: { byteOffset: 108, byteLength: 36, elementCount: 9, componentType: "uint32", itemSize: 1 },
        triangleComponentIndex: { byteOffset: 144, byteLength: 6, elementCount: 3, componentType: "uint16", itemSize: 1 },
        triangleSurfaceProfileIndex: { byteOffset: 150, byteLength: 6, elementCount: 3, componentType: "uint16", itemSize: 1 },
        faceNormals: { byteOffset: 156, byteLength: 36, elementCount: 9, componentType: "float32", itemSize: 3 },
      },
    },
    bvh: {
      path: "/assets/hit/multilayer.bvh.bin",
      sha256: sha256(bvhBuffer),
      bytes: bvhBuffer.byteLength,
      serializationVersion: 1,
      indirect: true,
      roots,
      indirectBuffer: {
        byteOffset,
        byteLength: indirect.byteLength,
        elementCount: indirect.length,
        componentType: "uint32",
        itemSize: 1,
      },
    },
  };
  return {
    descriptor: {
      accessStatus: "public",
      reason: "deterministic semantic fixture",
      formatVersion: "hit-scene-runtime/v1",
      vehicleId,
      recordUrl: "/assets/hit/multilayer.record.json",
      geometryUrl: "/assets/hit/multilayer.bin",
      bvhUrl: "/assets/hit/multilayer.bvh.bin",
      triangles: 3,
      components: 3,
      surfaceProfiles: 3,
      bvhNodes: 1,
    },
    geometryBuffer,
    responses: new Map([
      ["/assets/hit/multilayer.record.json", new TextEncoder().encode(JSON.stringify(record)).buffer],
      ["/assets/hit/multilayer.bin", geometryBuffer],
      ["/assets/hit/multilayer.bvh.bin", bvhBuffer],
    ]),
  };
}

async function loadFixtureScene(fixture, descriptor = fixture.descriptor) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    const bytes = fixture.responses.get(pathname);
    assert.ok(bytes, `unexpected request ${pathname}`);
    return new Response(bytes, { status: 200 });
  };
  try {
    return await loadRuntimeHitScene(descriptor);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("raw and meshopt hit scenes retain identical ordered semantic BVH ray intersections", async () => {
  const fixture = multiLayerRuntimeHitFixture();
  await MeshoptEncoder.ready;
  const rawGeometry = fixture.geometryBuffer;
  const sections = [
    { offset: 0, length: 108, count: 9, byteStride: 12 },
    { offset: 108, length: 36, count: 9, byteStride: 4 },
    { offset: 144, length: 6, count: 3, byteStride: 4, decodedByteStride: 2 },
    { offset: 150, length: 6, count: 3, byteStride: 4, decodedByteStride: 2 },
    { offset: 156, length: 36, count: 3, byteStride: 12 },
  ];
  const encodedSections = sections.map((section) => {
    const source = section.decodedByteStride
      ? Uint8Array.from({ length: section.count * section.byteStride }, (_, index) => {
        const sourceIndex = Math.floor(index / section.byteStride) * section.decodedByteStride +
          (index % section.byteStride);
        return index % section.byteStride < section.decodedByteStride
          ? new Uint8Array(rawGeometry, section.offset, section.length)[sourceIndex]
          : 0;
      })
      : new Uint8Array(rawGeometry, section.offset, section.length);
    return MeshoptEncoder.encodeGltfBuffer(
      source,
      section.count,
      section.byteStride,
      "ATTRIBUTES",
    );
  });
  const encoded = new Uint8Array(encodedSections.reduce((total, section) => total + section.byteLength, 0));
  let sourceByteOffset = 0;
  const chunks = encodedSections.map((encodedSection, index) => {
    const section = sections[index];
    encoded.set(encodedSection, sourceByteOffset);
    const chunk = {
      sourceByteOffset,
      sourceByteLength: encodedSection.byteLength,
      decodedByteOffset: section.offset,
      decodedByteLength: section.length,
      decodedByteStride: section.decodedByteStride ?? section.byteStride,
      count: section.count,
      byteStride: section.byteStride,
      mode: "ATTRIBUTES",
      filter: "NONE",
    };
    sourceByteOffset += encodedSection.byteLength;
    return chunk;
  });
  const meshoptDescriptor = {
    ...fixture.descriptor,
    geometry: {
      encoding: "meshopt-v1",
      url: "/assets/hit/multilayer.meshopt.bin",
      decodedByteLength: rawGeometry.byteLength,
      decodedSha256: sha256(rawGeometry),
      chunks,
    },
  };
  delete meshoptDescriptor.geometryUrl;
  fixture.responses.set("/assets/hit/multilayer.meshopt.bin", encoded.buffer);

  // Load compressed first so this assertion necessarily exercises decode before
  // the decoded-byte cache can serve the identical raw reference.
  const meshoptSemantic = semanticRayIntersections(
    await loadFixtureScene(fixture, meshoptDescriptor),
  );
  const rawSemantic = semanticRayIntersections(await loadFixtureScene(fixture));

  assert.deepEqual(meshoptSemantic, rawSemantic);
  assert.deepEqual(meshoptSemantic, {
    intersections: [
      {
        record: fixture.descriptor.vehicleId,
        component: "outer-skin",
        surface: "surface-0",
        sourceFace: 0,
        triangle: 0,
        distance: 1,
        point: [0.25, 0.25, 2],
        normal: [0, 0, 1],
        accepted: false,
      },
      {
        record: fixture.descriptor.vehicleId,
        component: "spaced-plate",
        surface: "surface-1",
        sourceFace: 1,
        triangle: 1,
        distance: 2,
        point: [0.25, 0.25, 1],
        normal: [0, 0, 1],
        accepted: true,
      },
      {
        record: fixture.descriptor.vehicleId,
        component: "core-armor",
        surface: "surface-2",
        sourceFace: 2,
        triangle: 2,
        distance: 3,
        point: [0.25, 0.25, 0],
        normal: [0, 0, 1],
        accepted: true,
      },
    ],
    firstAccepted: {
      record: fixture.descriptor.vehicleId,
      component: "spaced-plate",
      surface: "surface-1",
      sourceFace: 1,
      triangle: 1,
      distance: 2,
      point: [0.25, 0.25, 1],
      normal: [0, 0, 1],
      accepted: true,
    },
  });
});

test("hit record, geometry source, and BVH source requests start together", async () => {
  const fixture = runtimeHitFixture({ invalidGeometryHash: true });
  const originalFetch = globalThis.fetch;
  const requestedPaths = [];
  let releaseRecord;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    requestedPaths.push(pathname);
    const bytes = fixture.responses.get(pathname);
    assert.ok(bytes, `unexpected request ${pathname}`);
    if (pathname === "/assets/hit/record.json") {
      return new Promise((resolve) => {
        releaseRecord = () => resolve(new Response(bytes, { status: 200 }));
      });
    }
    return new Response(bytes, { status: 200 });
  };

  try {
    const pending = loadRuntimeHitScene(fixture.descriptor);
    await Promise.resolve();
    const requestsBeforeRecord = [...requestedPaths];
    releaseRecord();
    await assert.rejects(pending, /decoded SHA-256 does not match/u);

    assert.deepEqual(requestsBeforeRecord, [
      "/assets/hit/record.json",
      "/assets/hit/geometry.bin",
      "/assets/hit/bvh.bin",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
