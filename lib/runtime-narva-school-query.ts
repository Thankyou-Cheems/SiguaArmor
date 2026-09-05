import * as THREE from "three";
import { ExtendedTriangle, MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import { normalizeHitIntersections } from "./hit-intersection-ordering.ts";
import { decodeSchoolTerrain, fetchNarvaSchoolResource, loadNarvaSchoolSource, type SchoolScene } from "./runtime-narva-school-environment.ts";
import type { NativeProjectileSweep, ProjectileVector3 } from "./vehicle-projectile-playback.ts";

type Section = { byteOffset: number; byteLength: number; elementCount: number; componentType: string };
type Resource = { url: string; bytes: number };
export type SchoolSurfaceProfile = {
  sourceMaterialSlot: number;
  physicalMaterialPath: string | null;
  armorThicknessMm: number | null;
  considerForPenetration: boolean | null;
  allowPenetration: boolean | null;
  damageAbsorbed: number | null;
};
export type SchoolCollisionDescriptor = {
  sourceKind: "simple" | "complex";
  counts: { vertices: number; triangles: number };
  geometry: Resource & { sections: Record<"positions" | "indices" | "faceNormals" | "triangleSurfaceProfileIndex", Section> };
  bvh: Resource & { serializationVersion: number; indirect: boolean; roots: Section[]; indirectBuffer: Section };
  surfaceProfiles: SchoolSurfaceProfile[];
};
export type SchoolQueryScene = Omit<SchoolScene, "prototypes" | "placements" | "terrain"> & {
  prototypes: Array<SchoolScene["prototypes"][number] & {
    normalization: { sourceCenterMeters: { x: number; y: number }; sourceBaseZMeters: number; scale: number };
    collision: { simple: SchoolCollisionDescriptor | null; complex: SchoolCollisionDescriptor | null };
    placementSupport: { geometryKind: "simple" | "complex" };
  }>;
  placements: Array<SchoolScene["placements"][number] & {
    queryState: string;
    placementSupport: { queryEnabled: boolean };
    surfaceBindings: Array<{ slotIndex: number; physicalMaterialPath: string; queryDisposition: string }>;
  }>;
  physicalMaterialProfiles: SchoolSurfaceProfile[];
  terrain: SchoolScene["terrain"] & {
    layerInfoProfiles: Array<{ physicalMaterialPath: string; physicalMaterialProperties: Record<string, unknown> }>;
  };
};
export type SchoolRayHit = {
  componentId: string;
  label: string;
  triangleIndex: number;
  surfaceProfileIndex: number;
  surface: SchoolSurfaceProfile;
  distanceM: number;
  point: THREE.Vector3;
  faceNormal: THREE.Vector3;
  incidenceFactor: number;
  queryUncertainty?: string;
};
export type SchoolSweepHit = { timeFraction: number; impactNormal: ProjectileVector3; sceneHit: SchoolRayHit };
export type SchoolCollision = {
  geometry: THREE.BufferGeometry;
  tree: MeshBVH;
  profiles: SchoolSurfaceProfile[];
  profileIndices: Uint16Array | Uint32Array;
  normals: Float32Array;
};
export type SchoolQueryPlacement = {
  id: string; label: string;
  simple: SchoolCollision | null; complex: SchoolCollision | null;
  movementKind: "simple" | "complex";
  matrix: THREE.Matrix4;
  surface: (profile: SchoolSurfaceProfile) => SchoolSurfaceProfile;
  isInstanced?: boolean;
  queryUncertainty?: string;
};

/** v10.5.3 ProcessSimpleAndComplexTraces. Native Time is a fraction of the
 * whole trace, not metres. Raw Complex anchors remain even if not considered. */
export function mergeSchoolPenetrationQueries(
  complex: readonly SchoolRayHit[], simple: readonly SchoolRayHit[], lengthM: number,
  isInstanced: (hit: SchoolRayHit) => boolean | undefined,
  refine: (hit: SchoolRayHit) => SchoolRayHit | null,
) {
  const output: SchoolRayHit[] = [];
  const time = (hit: SchoolRayHit) => Math.fround(hit.distanceM / lengthM);
  const tolerance = Math.fround(.075);
  for (let c = 0; c < complex.length; c++) {
    const anchor = complex[c];
    if (anchor.surface.considerForPenetration !== false) output.push(anchor);
    const lo = time(anchor), hi = complex[c + 1] ? time(complex[c + 1]) : lo;
    for (const hit of simple) {
      const instanced = isInstanced(hit);
      if (instanced === true) continue;
      const t = time(hit), lowGap = Math.abs(Math.fround(t - lo)), highGap = Math.abs(Math.fround(hi - t));
      const between = lo <= t && t <= hi && lowGap >= tolerance && highGap >= tolerance;
      const afterLast = c === complex.length - 1 && hi <= t && lowGap >= tolerance;
      if (!between && !afterLast) continue;
      if (instanced === undefined) {
        output.push({ ...hit, queryUncertainty: "简单碰撞组件类型尚未确认" });
        continue;
      }
      const refined = refine(hit);
      if (refined && refined.surface.considerForPenetration !== false) output.push(refined);
    }
  }
  return output;
}

export function decodeSchoolCollision(descriptor: SchoolCollisionDescriptor, payload: ArrayBuffer, bvh: ArrayBuffer): SchoolCollision {
  const array = (section: Section) => {
    const Type = section.componentType === "float32" ? Float32Array : section.componentType === "uint16" ? Uint16Array : Uint32Array;
    if (section.byteLength !== section.elementCount * Type.BYTES_PER_ELEMENT || section.byteOffset < 0 ||
        section.byteOffset + section.byteLength > payload.byteLength) throw new Error("场景碰撞数据段不完整");
    return new Type(payload, section.byteOffset, section.elementCount);
  };
  if (payload.byteLength !== descriptor.geometry.bytes || bvh.byteLength !== descriptor.bvh.bytes ||
      descriptor.bvh.serializationVersion !== 1 || !descriptor.bvh.indirect) throw new Error("场景碰撞/BVH 格式不匹配");
  const sections = descriptor.geometry.sections;
  const positions = array(sections.positions) as Float32Array;
  const indices = array(sections.indices) as Uint32Array;
  const profileIndices = array(sections.triangleSurfaceProfileIndex) as Uint16Array | Uint32Array;
  const normals = array(sections.faceNormals) as Float32Array;
  if (positions.length !== descriptor.counts.vertices * 3 || indices.length !== descriptor.counts.triangles * 3 ||
      profileIndices.length !== descriptor.counts.triangles || normals.length !== descriptor.counts.triangles * 3 ||
      profileIndices.some(index => index >= descriptor.surfaceProfiles.length) || indices.some(index => index >= descriptor.counts.vertices)) {
    throw new Error("场景碰撞的三角形/材质映射不匹配");
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const indirect = descriptor.bvh.indirectBuffer;
  const tree = MeshBVH.deserialize({ version: 1,
    roots: descriptor.bvh.roots.map(row => bvh.slice(row.byteOffset, row.byteOffset + row.byteLength)),
    index: indices, indirectBuffer: new Uint32Array(bvh, indirect.byteOffset, indirect.elementCount),
  } as SerializedBVH, geometry, { setIndex: false });
  geometry.computeBoundingBox();
  return { geometry, tree, profiles: descriptor.surfaceProfiles, profileIndices, normals };
}

const axes = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
export function schoolQueryPlacementMatrix(placement: SchoolScene["placements"][number],
  normalization: SchoolQueryScene["prototypes"][number]["normalization"], anchor: number[]) {
  const transform = placement.sourceTransform;
  const source = new THREE.Matrix4().compose(new THREE.Vector3(...transform.translationMeters).sub(new THREE.Vector3(...anchor)),
    new THREE.Quaternion(...transform.rotationQuaternion).normalize(), new THREE.Vector3(...transform.scale3d));
  const unnormalize = new THREE.Matrix4().makeTranslation(normalization.sourceCenterMeters.x, normalization.sourceCenterMeters.y,
    normalization.sourceBaseZMeters).multiply(new THREE.Matrix4().makeScale(1 / normalization.scale, 1 / normalization.scale, 1 / normalization.scale));
  // Query vertices are source XYZ, already normalized by the publisher. Unlike
  // FixedDisplay, they must be unnormalized before their source instance pose.
  return axes.clone().multiply(source).multiply(unnormalize);
}

// Swept sphere/triangle time of impact, including thin faces, edges and corners.
// The distance to a convex triangle along a segment is convex. Find its minimum
// then bisect only the entering interval; this cannot tunnel between frames.
export function sweepSchoolTriangle(triangle: ExtendedTriangle, start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const delta = end.clone().sub(start), length = delta.length();
  if (length < 1e-10) return null;
  const ray = new THREE.Ray(start, delta.clone().divideScalar(length));
  const surface = new THREE.Vector3(), center = new THREE.Vector3();
  const crossing = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, surface);
  let minimumT: number;
  if (crossing && surface.distanceTo(start) <= length) minimumT = surface.distanceTo(start) / length;
  else {
    if (triangle.closestPointToSegment(new THREE.Line3(start, end), surface, center) > radius + 1e-9) return null;
    minimumT = delta.dot(center.sub(start)) / (length * length);
  }
  triangle.closestPointToPoint(start, surface);
  const initial = start.clone().sub(surface);
  if (initial.length() <= radius + 1e-8) {
    if (initial.dot(delta) >= 0) return null; // separating contact, including a previous bounce
    return { timeFraction: 0, point: surface.clone(), normal: initial.normalize() };
  }
  if (radius === 0) {
    if (!crossing) return null;
    return { timeFraction: minimumT, point: ray.at(minimumT * length, surface), normal: triangle.getNormal(center).multiplyScalar(triangle.getNormal(center).dot(delta) > 0 ? -1 : 1) };
  }
  let low = 0, high = minimumT;
  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;
    center.copy(start).addScaledVector(delta, middle);
    triangle.closestPointToPoint(center, surface);
    if (center.distanceToSquared(surface) <= radius * radius) high = middle;
    else low = middle;
  }
  center.copy(start).addScaledVector(delta, high);
  triangle.closestPointToPoint(center, surface);
  return { timeFraction: high, point: surface.clone(), normal: center.sub(surface).normalize() };
}

export function createSchoolQuery(placements: SchoolQueryPlacement[]) {
  const rows = placements.map(row => ({ ...row, inverse: row.matrix.clone().invert(), normalMatrix: new THREE.Matrix3().getNormalMatrix(row.matrix),
    bounds: new THREE.Box3().union(row.simple?.geometry.boundingBox ?? new THREE.Box3()).union(row.complex?.geometry.boundingBox ?? new THREE.Box3()).applyMatrix4(row.matrix) }));
  const surfaceHit = (row: typeof rows[number], parsed: SchoolCollision, index: number, point: THREE.Vector3, start: THREE.Vector3,
    direction: THREE.Vector3, offset: THREE.Vector3): SchoolRayHit => {
    const faceNormal = new THREE.Vector3().fromArray(parsed.normals, index * 3).applyMatrix3(row.normalMatrix).normalize();
    const profileIndex = parsed.profileIndices[index];
    return { componentId: row.id, label: row.label, triangleIndex: index, surfaceProfileIndex: profileIndex,
      surface: row.surface(parsed.profiles[profileIndex]), distanceM: point.distanceTo(start), point: point.clone().add(offset),
      faceNormal, incidenceFactor: -direction.dot(faceNormal), queryUncertainty: row.queryUncertainty };
  };
  const api = {
    placementCount: rows.length,
    raycast(origin: THREE.Vector3, direction: THREE.Vector3, far: number, offset = new THREE.Vector3(), kind: "simple" | "complex" = "complex") {
      const start = origin.clone().sub(offset), unit = direction.clone().normalize();
      const end = start.clone().addScaledVector(unit, far), worldRay = new THREE.Ray(start, unit);
      const hits: SchoolRayHit[] = [];
      for (const row of rows) {
        if (!worldRay.intersectsBox(row.bounds)) continue;
        const parsed = kind === "complex" ? row.complex ?? row.simple : row[row.movementKind];
        if (!parsed) continue;
        const localStart = start.clone().applyMatrix4(row.inverse);
        const delta = end.clone().applyMatrix4(row.inverse).sub(localStart), length = delta.length();
        if (length < 1e-10) continue;
        const ray = new THREE.Ray(localStart, delta.divideScalar(length));
        for (const hit of parsed.tree.raycast(ray, THREE.DoubleSide, .000001, length)) {
          if (hit.faceIndex == null) continue;
          const point = hit.point.applyMatrix4(row.matrix);
          hits.push(surfaceHit(row, parsed, hit.faceIndex, point, start, unit, offset));
        }
      }
      return normalizeHitIntersections(hits.map((hit, index) => ({ index, componentId: hit.componentId,
        surfaceProfileIndex: hit.surfaceProfileIndex, sourceFaceId: hit.triangleIndex, distanceM: hit.distanceM,
        point: hit.point.toArray() as [number, number, number], faceNormal: hit.faceNormal.toArray() as [number, number, number] })))
        .map(({ hit }) => hits[hit.index]).sort((a, b) => a.distanceM - b.distanceM);
    },
    postImpact(origin: THREE.Vector3, direction: THREE.Vector3, far: number, offset = new THREE.Vector3()) {
      // The exported meshes do not yet prove native per-primitive cardinality.
      // Keep one bounded *candidate* per placement, but never admit an ambiguous
      // triangle list as verified penetration. Reverse candidates carry exits.
      const nearest = (hits: SchoolRayHit[]) => {
        const seen = new Set<string>();
        const counts = new Map<string,number>();
        hits.forEach(hit => counts.set(hit.componentId,(counts.get(hit.componentId) ?? 0)+1));
        return hits.filter(hit => { if (seen.has(hit.componentId)) return false; seen.add(hit.componentId); return true; })
          .map(hit => ({ ...hit, queryUncertainty:hit.queryUncertainty ?? (hit.incidenceFactor < 0
            ? "背面查询采纳尚未确认" : (counts.get(hit.componentId) ?? 0) > 1
              ? "原生命中列表尚未确认" : undefined) }));
      };
      const unit = direction.clone().normalize();
      const end = origin.clone().addScaledVector(unit, far);
      const merge = (start: THREE.Vector3, forward: THREE.Vector3) => {
        const complex = nearest(api.raycast(start, forward, far, offset));
        const simple = nearest(api.raycast(start, forward, far, offset, "simple"));
        return mergeSchoolPenetrationQueries(complex, simple, far,
          hit => rows.find(row => row.id === hit.componentId)?.isInstanced,
          hit => {
            const remaining = far - hit.distanceM;
            if (remaining <= 0) return null;
            const refined = nearest(api.raycast(hit.point, forward, remaining, offset))
              .find(candidate => candidate.componentId === hit.componentId);
            return refined ? { ...refined, distanceM: hit.distanceM + refined.distanceM } : null;
          });
      };
      const forward = merge(origin, unit), reverse = merge(end, unit.clone().negate());
      const traces: Array<{ hit: SchoolRayHit; exit: SchoolRayHit | null }> = [];
      for (let index = 0; index < forward.length; index++) {
        const hit = forward[index];
        traces.push({ hit, exit: reverse[reverse.length - 1 - index] ?? null });
        if (hit.surface.allowPenetration === false) break;
      }
      return traces;
    },
    sweepSphere(input: Parameters<NativeProjectileSweep>[0], offset = new THREE.Vector3(), traceComplex = true): SchoolSweepHit | null {
      const fromCm = (p: ProjectileVector3) => new THREE.Vector3(p.x / 100, p.z / 100, p.y / 100).sub(offset);
      const start = fromCm(input.startCm), end = fromCm(input.endCm);
      const direction = end.clone().sub(start).normalize(), radius = Math.max(0, input.sphereRadiusCm / 100);
      const worldBox = new THREE.Box3().setFromPoints([start, end]).expandByScalar(radius);
      let first: SchoolSweepHit | null = null;
      const triangle = new ExtendedTriangle();
      for (const row of rows) {
        if (!row.bounds.intersectsBox(worldBox)) continue;
        // Projectile TraceComplexOnMove selects this query. The school's
        // placementSupport flag belongs to grounding, not projectile movement.
        const parsed = traceComplex ? row.complex ?? row.simple : row[row.movementKind];
        if (!parsed) throw new Error(`场景缺少移动碰撞：${row.id}`);
        const localBox = worldBox.clone().applyMatrix4(row.inverse);
        parsed.tree.shapecast({
          intersectsBounds: bounds => bounds.intersectsBox(localBox),
          intersectsTriangle: (candidate, index) => {
            triangle.a.copy(candidate.a).applyMatrix4(row.matrix);
            triangle.b.copy(candidate.b).applyMatrix4(row.matrix);
            triangle.c.copy(candidate.c).applyMatrix4(row.matrix);
            triangle.needsUpdate = true;
            const hit = sweepSchoolTriangle(triangle, start, end, radius);
            if (hit && (!first || hit.timeFraction < first.timeFraction)) {
              first = { timeFraction: hit.timeFraction, impactNormal: { x: hit.normal.x, y: hit.normal.z, z: hit.normal.y },
                sceneHit: surfaceHit(row, parsed, index, hit.point, start, direction, offset) };
            }
            return false;
          },
        });
      }
      return first;
    },
  };
  return api;
}

let queryRequest: Promise<ReturnType<typeof createSchoolQuery>> | null = null;
export function loadNarvaSchoolQuery() {
  queryRequest ??= (async () => {
    const source = await loadNarvaSchoolSource();
    const scene = source.scene as SchoolQueryScene;
    if (scene.schemaVersion !== "sigua-infantry-narva-scene/v2") throw new Error("场景碰撞需要学校 v2 数据");
    const pitch = scene.fixtures.footballPitch.boundsSourceMeters;
    const terrain = decodeSchoolTerrain(scene, source.terrainBuffer, [(pitch[0] + pitch[2]) / 2, (pitch[1] + pitch[3]) / 2]);
    const requests = new Map<string, SchoolCollisionDescriptor>();
    for (const prototype of scene.prototypes) for (const kind of ["simple", "complex"] as const) {
      const descriptor = prototype.collision[kind];
      if (descriptor) requests.set(descriptor.geometry.url, descriptor);
    }
    const parsed = new Map<string, SchoolCollision>();
    const queue = [...requests.values()];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (next < queue.length) {
        const descriptor = queue[next++];
        const [geometry, bvh] = await Promise.all([descriptor.geometry, descriptor.bvh].map(async resource =>
          (await fetchNarvaSchoolResource(resource.url)).arrayBuffer()));
        parsed.set(descriptor.geometry.url, decodeSchoolCollision(descriptor, geometry, bvh));
      }
    }));
    const rows: SchoolQueryPlacement[] = scene.placements.filter(row => row.placementSupport.queryEnabled).map(placement => {
      if (placement.queryState !== "exact-current-editor") throw new Error(`场景碰撞未验证：${placement.stableId}`);
      const prototype = scene.prototypes.find(row => row.id === placement.prototypeId)!;
      const kind = (name: "simple" | "complex") => prototype.collision[name] ? parsed.get(prototype.collision[name]!.geometry.url)! : null;
      return { id: `narva-${placement.stableId}`, label: prototype.meshPath.split("/").at(-1)!, simple: kind("simple"), complex: kind("complex"),
        movementKind: prototype.placementSupport.geometryKind,
        // School v2 supplies winding normals, not a native FHitResult normal
        // witness. Source helper arithmetic must not conceal that distinction.
        queryUncertainty: "该表面的游戏内穿透行为尚未核实",
        matrix: schoolQueryPlacementMatrix(placement, prototype.normalization, terrain.anchorSourceMeters),
        surface: original => {
          const binding = placement.surfaceBindings.find(row => row.slotIndex === original.sourceMaterialSlot);
          if (!binding) return original;
          const profile = scene.physicalMaterialProfiles.find(row => row.physicalMaterialPath === binding.physicalMaterialPath);
          if (!profile) throw new Error(`场景缺少材质：${binding.physicalMaterialPath}`);
          return { ...profile, sourceMaterialSlot: original.sourceMaterialSlot,
            considerForPenetration: binding.queryDisposition === "not-considered" ? false : profile.considerForPenetration,
            allowPenetration: binding.queryDisposition === "terminal-blocker" ? false : profile.allowPenetration };
        } };
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(terrain.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(terrain.indices, 1));
    geometry.computeBoundingBox();
    const tree = new MeshBVH(geometry, { indirect: true });
    const profiles = scene.terrain.layerInfoProfiles.map((row, index) => {
      const fields = row.physicalMaterialProperties;
      return { sourceMaterialSlot: index, physicalMaterialPath: row.physicalMaterialPath,
        armorThicknessMm: Number(fields.ArmorThicknessMillimeters), damageAbsorbed: Number(fields.DamageAbsorbed),
        allowPenetration: Boolean(fields.bAllowPenetration), considerForPenetration: Boolean(fields.bConsiderForPenetration) };
    });
    const weights = new Uint8Array(source.terrainBuffer, 32 + terrain.positions.length / 3 * 4);
    const profileIndices = new Uint16Array(terrain.indices.length / 3), normals = new Float32Array(terrain.indices.length);
    const tri = new THREE.Triangle(), normal = new THREE.Vector3();
    for (let index = 0; index < profileIndices.length; index++) {
      const vertex = terrain.indices[index * 3];
      let selected = 0;
      for (let layer = 1; layer < profiles.length; layer++) if (weights[vertex * profiles.length + layer] > weights[vertex * profiles.length + selected]) selected = layer;
      profileIndices[index] = selected;
      tri.a.fromArray(terrain.positions, vertex * 3);
      tri.b.fromArray(terrain.positions, terrain.indices[index * 3 + 1] * 3);
      tri.c.fromArray(terrain.positions, terrain.indices[index * 3 + 2] * 3);
      tri.getNormal(normal).toArray(normals, index * 3);
    }
    const ground = { geometry, tree, profiles, profileIndices, normals };
    rows.push({ id: "narva-terrain", label: "Narva 地形", simple: ground, complex: ground, movementKind: "simple", matrix: new THREE.Matrix4(), surface: profile => profile });
    return createSchoolQuery(rows);
  })().catch(error => { queryRequest = null; throw error; });
  return queryRequest;
}
