import * as THREE from "three";
import { ExtendedTriangle, MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import { normalizeHitIntersections } from "./hit-intersection-ordering.ts";
import { type SchoolScene } from "./runtime-narva-school-environment.ts";
import type { NativeProjectileSweep, ProjectileVector3 } from "./vehicle-projectile-playback.ts";
import { raycastSchoolConvex, type SchoolNativeConvex } from "./runtime-school-native-convex.ts";
import type { NativeArmorHitKey, NativeTraceReceiver } from "./editor-native-hit-state.ts";
import { createSchoolNativeRay, raycastSchoolNativeMesh, schoolNativeRayResult,
  type NativeMeshTree, type NativeSchoolPose, type NativeSchoolSegment } from "./runtime-school-native-ray.ts";
import { createSchoolNativeSphereSweep } from "./runtime-school-native-sweep-frame.ts";

type Section = { byteOffset: number; byteLength: number; elementCount: number; componentType: string };
type Resource = { url: string; bytes: number };
export type SchoolSurfaceProfile = {
  sourceMaterialSlot: number;
  physicalMaterialPath: string | null;
  armorThicknessMm: number | null;
  considerForPenetration: boolean | null;
  allowPenetration: boolean | null;
  damageAbsorbed: number | null;
  damageParentActor?: boolean;
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
  /** Native Location-to-TraceStart distance, retained through component refine. */
  traceDistanceM?: number;
  point: THREE.Vector3;
  faceNormal: THREE.Vector3;
  incidenceFactor: number;
  elementIndex?: number;
  externalFaceIndex?: number;
  queryUncertainty?: string;
  receiver?: NativeTraceReceiver;
  nativeHitKey?: NativeArmorHitKey;
  /** Exact Unreal world cm, before display anchoring/conversion. */
  sourcePointCm?: readonly [number, number, number];
};
export type SchoolSweepHit = { timeFraction: number; normal: ProjectileVector3; impactNormal: ProjectileVector3; sceneHit: SchoolRayHit };
export type SchoolCollision = {
  geometry: THREE.BufferGeometry;
  tree: MeshBVH;
  profiles: SchoolSurfaceProfile[];
  profileIndices: Uint16Array | Uint32Array;
  normals: Float32Array;
  nativeCooked?: { cullsBackFace: boolean; externalFaceIndices: Int32Array; elementIndex: number; triangleVisitRanks?: Uint32Array; nativeTree?: NativeMeshTree };
};
export type SchoolQueryPlacement = {
  id: string; label: string;
  simple: SchoolCollision | null; complex: SchoolCollision | null;
  movementKind: "simple" | "complex";
  matrix: THREE.Matrix4;
  surface: (profile: SchoolSurfaceProfile) => SchoolSurfaceProfile;
  isInstanced?: boolean;
  nativeConvexes?: SchoolNativeConvex[];
  simpleSurface?: SchoolSurfaceProfile;
  queryUncertainty?: string;
  receiver?: NativeTraceReceiver;
  nativePose?: NativeSchoolPose;
  nativeHeightfield?: boolean;
};

/** PhysicsCore FindFaceIndex searches within 1 cm of a positive-time contact.
 * Chaos chooses the most opposing nearby face, independently of GJK's support
 * feature. Strict distance and native BVH visitation resolve admission/ties.
 * This candidate uses the query transform's precision, not display geometry. */
export function selectSchoolSweepFace(parsed: SchoolCollision, matrix: THREE.Matrix4,
  point: THREE.Vector3, direction: THREE.Vector3, originalIndex: number) {
  if (!parsed.nativeCooked) return originalIndex;
  const box = new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3(.02, .02, .02))
    .applyMatrix4(matrix.clone().invert());
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const triangle = new ExtendedTriangle(), normal = new THREE.Vector3(), closest = new THREE.Vector3();
  let bestDot = Infinity, bestRank = Infinity, result = originalIndex;
  parsed.tree.shapecast({
    intersectsBounds: bounds => bounds.intersectsBox(box),
    intersectsTriangle: (candidate, index) => {
      triangle.a.copy(candidate.a).applyMatrix4(matrix);
      triangle.b.copy(candidate.b).applyMatrix4(matrix);
      triangle.c.copy(candidate.c).applyMatrix4(matrix);
      triangle.needsUpdate = true;
      triangle.closestPointToPoint(point, closest);
      if (closest.distanceToSquared(point) >= .0001) return false;
      candidate.getNormal(normal).applyMatrix3(normalMatrix).normalize();
      const dot = normal.dot(direction), rank = parsed.nativeCooked?.triangleVisitRanks?.[index] ?? index;
      if (dot < bestDot || dot === bestDot && rank < bestRank) {
        bestDot = dot; bestRank = rank; result = index;
      }
      return false;
    },
  });
  return result;
}

/** v10.5.3 ProcessSimpleAndComplexTraces. Native Time is a fraction of the
 * whole trace, not metres. Raw Complex anchors remain even if not considered. */
export function mergeSchoolPenetrationQueries(
  complex: readonly SchoolRayHit[], simple: readonly SchoolRayHit[], lengthM: number,
  isInstanced: (hit: SchoolRayHit) => boolean | undefined,
  refine: (hit: SchoolRayHit) => SchoolRayHit | null,
) {
  const output: SchoolRayHit[] = [];
  const time = (hit: SchoolRayHit) => hit.nativeHitKey?.timeFraction ?? Math.fround(hit.distanceM / lengthM);
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
export function sweepSchoolTriangle(triangle: ExtendedTriangle, start: THREE.Vector3, end: THREE.Vector3, radius: number, ignoreSeparating = true) {
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
    if (ignoreSeparating && initial.dot(delta) >= 0) return null;
    return { timeFraction: 0, penetrationDepth: Math.max(0, radius - initial.length()), point: surface.clone(), normal: initial.normalize() };
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
    convexes: row.nativeConvexes?.map(shape => {
      let local = shape.matrix;
      if (shape.isBox && row.nativePose) {
        const [x,y,z] = row.nativePose.scale3d;
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
        shape.matrix.decompose(position,rotation,scale);
        // FKBoxElem::GetFinalScaled: scale center and axis extents separately,
        // then apply the box rotation. A matrix product S*R would shear the box.
        local = new THREE.Matrix4().makeTranslation(position.x,position.y,position.z)
          .multiply(new THREE.Matrix4().makeScale(1/x,1/y,1/z))
          .multiply(new THREE.Matrix4().compose(new THREE.Vector3(),rotation,new THREE.Vector3(x,y,z)));
      }
      const matrix = row.matrix.clone().multiply(local);
      return { ...shape, matrix, inverse: matrix.clone().invert(), normalMatrix: new THREE.Matrix3().getNormalMatrix(matrix) };
    }),
    bounds: new THREE.Box3().union(row.simple?.geometry.boundingBox ?? new THREE.Box3()).union(row.complex?.geometry.boundingBox ?? new THREE.Box3()).applyMatrix4(row.matrix) }));
  const surfaceHit = (row: typeof rows[number], parsed: SchoolCollision, index: number, point: THREE.Vector3, start: THREE.Vector3,
    direction: THREE.Vector3, offset: THREE.Vector3): SchoolRayHit => {
    const faceNormal = new THREE.Vector3().fromArray(parsed.normals, index * 3).applyMatrix3(row.normalMatrix).normalize();
    const profileIndex = parsed.profileIndices[index];
    return { componentId: row.id, label: row.label, triangleIndex: index, surfaceProfileIndex: profileIndex,
      surface: row.surface(parsed.profiles[profileIndex]), distanceM: point.distanceTo(start),
      traceDistanceM: parsed.nativeCooked ? point.distanceTo(start) : undefined, point: point.clone().add(offset),
      faceNormal, incidenceFactor: -direction.dot(faceNormal), queryUncertainty: row.queryUncertainty, receiver: row.receiver,
      elementIndex: parsed.nativeCooked?.elementIndex, externalFaceIndex: parsed.nativeCooked?.externalFaceIndices[index] };
  };
  const api = {
    toSourcePointCm(point: THREE.Vector3, offset = new THREE.Vector3()): [number,number,number] {
      return [(point.x-offset.x)*100,(point.z-offset.z)*100,(point.y-offset.y)*100];
    },
    placementCount: rows.length,
    raycast(origin: THREE.Vector3, direction: THREE.Vector3, far: number, offset = new THREE.Vector3(), kind: "simple" | "complex" = "complex", sourceSegment?: NativeSchoolSegment) {
      const start = origin.clone().sub(offset), unit = direction.clone().normalize();
      const end = start.clone().addScaledVector(unit, far), worldRay = new THREE.Ray(start, unit);
      const hits: SchoolRayHit[] = [];
      for (const row of rows) {
        // Native simple hulls can extend beyond the complex/display bounds.
        if (kind === "simple" && row.movementKind === "simple" && row.convexes) {
          for (const shape of row.convexes) {
            const localStart = start.clone().applyMatrix4(shape.inverse);
            const delta = end.clone().applyMatrix4(shape.inverse).sub(localStart), length = delta.length();
            if (length < 1e-10) continue;
            const hit = raycastSchoolConvex(shape.planes, localStart, delta.divideScalar(length), length);
            if (!hit) continue;
            const point = hit.point.applyMatrix4(shape.matrix);
            const faceNormal = hit.normal.applyMatrix3(shape.normalMatrix).normalize();
            if (!row.simpleSurface) throw new Error(`场景缺少简单碰撞材质：${row.id}`);
            hits.push({ componentId: row.id, label: row.label, triangleIndex: -1, surfaceProfileIndex: 0,
              surface: row.simpleSurface, distanceM: point.distanceTo(start), traceDistanceM: point.distanceTo(start), point: point.add(offset), faceNormal,
              incidenceFactor: -unit.dot(faceNormal), elementIndex: shape.elementIndex, externalFaceIndex: -1,
              queryUncertainty: row.queryUncertainty, receiver: row.receiver,
              sourcePointCm:[(point.x-offset.x)*100,(point.z-offset.z)*100,(point.y-offset.y)*100] });
          }
          continue;
        }
        const parsed = kind === "complex" ? row.complex ?? row.simple : row[row.movementKind];
        if (!parsed) continue;
        if (parsed.nativeCooked?.nativeTree && row.nativePose && sourceSegment) {
          const input = createSchoolNativeRay(sourceSegment, row.nativePose);
          if (!input) continue;
          const hit = raycastSchoolNativeMesh(parsed.geometry, parsed.nativeCooked.nativeTree, parsed.nativeCooked.cullsBackFace, input.ray, input.far);
          const result = hit && schoolNativeRayResult(hit, input, sourceSegment, row.nativePose);
          if (!hit || !result) continue;
          const point = new THREE.Vector3(result.pointCm.x / 100, result.pointCm.z / 100, result.pointCm.y / 100);
          const faceNormal = new THREE.Vector3(result.normal.x, result.normal.z, result.normal.y);
          hits.push({ ...surfaceHit(row, parsed, hit.faceIndex, point, start, unit, offset),
            distanceM: result.distanceCm / 100, traceDistanceM: result.locationCm.distanceTo(new THREE.Vector3(...sourceSegment.startCm)) / 100, faceNormal,
            incidenceFactor: -unit.dot(faceNormal), sourcePointCm: result.pointCm.toArray() as [number, number, number], nativeHitKey: { distanceCm: result.distanceCm, timeFraction: result.time,
              impactPointCm: result.pointCm.toArray() as [number, number, number] } });
          continue;
        }
        if (!worldRay.intersectsBox(row.bounds)) continue;
        const localStart = start.clone().applyMatrix4(row.inverse);
        const delta = end.clone().applyMatrix4(row.inverse).sub(localStart), length = delta.length();
        if (length < 1e-10) continue;
        const ray = new THREE.Ray(localStart, delta.divideScalar(length));
        const native = parsed.nativeCooked;
        const candidates = native ? [parsed.tree.raycastFirst(ray, native.cullsBackFace ? THREE.FrontSide : THREE.DoubleSide, 0, length)]
          : parsed.tree.raycast(ray, THREE.DoubleSide, .000001, length);
        for (const hit of candidates) {
          if (!hit) continue;
          if (hit.faceIndex == null) continue;
          const point = hit.point.applyMatrix4(row.matrix);
          const result=surfaceHit(row, parsed, hit.faceIndex, point, start, unit, offset);
          if (row.nativeHeightfield && result.faceNormal.dot(unit)>0) {
            result.faceNormal.negate();result.incidenceFactor=-unit.dot(result.faceNormal);
          }
          if (row.nativeHeightfield) result.sourcePointCm=api.toSourcePointCm(result.point,offset);
          hits.push(result);
        }
      }
      // Never collapse different native shape contacts by component/position.
      const nativeHits = hits.filter(hit => hit.elementIndex !== undefined);
      for (const hit of nativeHits) hit.nativeHitKey ??= {
        distanceCm: Math.fround(hit.traceDistanceM! * 100), timeFraction: Math.fround(hit.distanceM / far),
        impactPointCm: hit.sourcePointCm ?? [(hit.point.x-offset.x)*100,(hit.point.z-offset.z)*100,(hit.point.y-offset.y)*100],
      };
      const legacyHits = hits.filter(hit => hit.elementIndex === undefined);
      return [...nativeHits, ...normalizeHitIntersections(legacyHits.map((hit, index) => ({ index, componentId: hit.componentId,
        surfaceProfileIndex: hit.surfaceProfileIndex, sourceFaceId: hit.triangleIndex, distanceM: hit.distanceM,
        point: hit.point.toArray() as [number, number, number], faceNormal: hit.faceNormal.toArray() as [number, number, number] })))
        .map(({ hit }) => legacyHits[hit.index])].sort((a, b) => a.distanceM - b.distanceM);
    },
    postImpact(origin: THREE.Vector3, direction: THREE.Vector3, far: number, offset = new THREE.Vector3(), sourceSegment?: NativeSchoolSegment) {
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
      const merge = (start: THREE.Vector3, forward: THREE.Vector3, segment?: NativeSchoolSegment) => {
        const nativeOrCandidate = (hits: SchoolRayHit[]) => [
          ...hits.filter(hit => hit.elementIndex !== undefined),
          ...nearest(hits.filter(hit => hit.elementIndex === undefined)),
        ].sort((a, b) => a.distanceM - b.distanceM);
        const complex = nativeOrCandidate(api.raycast(start, forward, far, offset, "complex", segment));
        const simple = nativeOrCandidate(api.raycast(start, forward, far, offset, "simple", segment));
        return mergeSchoolPenetrationQueries(complex, simple, far,
          hit => rows.find(row => row.id === hit.componentId)?.isInstanced,
          hit => {
            const remaining = far - hit.distanceM;
            if (remaining <= 0) return null;
            const refinedSegment: NativeSchoolSegment | undefined = segment && hit.sourcePointCm ? {startCm:[...hit.sourcePointCm], endCm:segment.endCm} : undefined;
            const refined = nativeOrCandidate(api.raycast(hit.point, forward, remaining, offset, "complex", refinedSegment))
              .find(candidate => candidate.componentId === hit.componentId);
            return refined ? { ...refined, distanceM: hit.distanceM + refined.distanceM,
              nativeHitKey: refined.nativeHitKey && hit.nativeHitKey
                ? { ...refined.nativeHitKey, timeFraction: hit.nativeHitKey.timeFraction } : undefined } : null;
          });
      };
      const forward = merge(origin, unit, sourceSegment), reverse = merge(end, unit.clone().negate(),
        sourceSegment ? {startCm:sourceSegment.endCm,endCm:sourceSegment.startCm} : undefined);
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
      let firstDistance = Infinity;
      let firstRowId: string | null = null, firstRank = Infinity;
      const triangle = new ExtendedTriangle();
      for (const row of rows) {
        if (!row.bounds.intersectsBox(worldBox)) continue;
        // Projectile TraceComplexOnMove selects this query. The school's
        // placementSupport flag belongs to grounding, not projectile movement.
        const parsed = traceComplex ? row.complex ?? row.simple : row[row.movementKind];
        if (!parsed) throw new Error(`场景缺少移动碰撞：${row.id}`);
        const localBox = worldBox.clone().applyMatrix4(row.inverse);
        const nativeSweep = parsed.nativeCooked && row.nativePose ? createSchoolNativeSphereSweep({
          startCm:[input.startCm.x-offset.x*100,input.startCm.y-offset.z*100,input.startCm.z-offset.y*100],
          endCm:[input.endCm.x-offset.x*100,input.endCm.y-offset.z*100,input.endCm.z-offset.y*100],
        },row.nativePose,input.sphereRadiusCm,row.nativeHeightfield) : null;
        parsed.tree.shapecast({
          intersectsBounds: bounds => bounds.intersectsBox(localBox),
          intersectsTriangle: (candidate, index) => {
            // Chaos triangle sweep visitor uses a scaled face normal and a
            // signed 1e-4 facing tolerance. The nearly-parallel band may supply
            // an initial MTD, but cannot supply a later entering contact.
            const facing = candidate.getNormal(new THREE.Vector3()).applyMatrix3(row.normalMatrix).normalize().dot(direction);
            if (parsed.nativeCooked?.cullsBackFace && facing > Math.fround(.0001)) return false;
            triangle.a.copy(candidate.a).applyMatrix4(row.matrix);
            triangle.b.copy(candidate.b).applyMatrix4(row.matrix);
            triangle.c.copy(candidate.c).applyMatrix4(row.matrix);
            triangle.needsUpdate = true;
            const nativeHit = nativeSweep?.(candidate);
            const hit = nativeSweep ? nativeHit : sweepSchoolTriangle(triangle, start, end, radius, !parsed.nativeCooked);
            if (parsed.nativeCooked?.cullsBackFace && hit && hit.timeFraction > 0 && facing >= -Math.fround(.0001)) return false;
            let distance = nativeHit?.signedDistanceM ?? (hit ? hit.timeFraction * start.distanceTo(end) - (hit.penetrationDepth ?? 0) : Infinity);
            if (parsed.nativeCooked) distance = Math.fround(distance * 100) / 100;
            const rank = parsed.nativeCooked?.triangleVisitRanks?.[index] ?? Infinity;
            if (hit && (distance < firstDistance || distance === firstDistance && row.id === firstRowId && rank < firstRank)) {
              firstDistance = distance;
              firstRowId = row.id; firstRank = rank;
              const sceneHit = surfaceHit(row, parsed, index, hit.point, start, direction, offset);
              if (nativeHit) sceneHit.sourcePointCm = nativeHit.sourcePointCm;
              const normal = parsed.nativeCooked && hit.timeFraction > 0 ? sceneHit.faceNormal : hit.normal;
              first = { timeFraction: hit.timeFraction, normal: { x: hit.normal.x, y: hit.normal.z, z: hit.normal.y },
                impactNormal: { x: normal.x, y: normal.z, z: normal.y }, sceneHit };
            }
            return false;
          },
        });
      }
      // TypeScript does not follow assignments made by the shapecast callback.
      const result = first as SchoolSweepHit | null;
      if (result && result.timeFraction > 0) {
        const row = rows.find(row => row.id === result.sceneHit.componentId)!;
        const parsed = traceComplex ? row.complex ?? row.simple : row[row.movementKind];
        if (parsed?.nativeCooked) {
          const point = result.sceneHit.point.clone().sub(offset);
          const index = selectSchoolSweepFace(parsed, row.matrix, point, direction, result.sceneHit.triangleIndex);
          const selected = surfaceHit(row, parsed, index, point, start, direction, offset);
          result.sceneHit = { ...selected, distanceM: result.sceneHit.distanceM, sourcePointCm:result.sceneHit.sourcePointCm };
          result.impactNormal = { x: selected.faceNormal.x, y: selected.faceNormal.z, z: selected.faceNormal.y };
        }
      }
      return result;
    },
  };
  return api;
}

let queryRequest: Promise<ReturnType<typeof createSchoolQuery>> | null = null;
export function loadNarvaSchoolQuery() {
  queryRequest ??= import("./runtime-school-native-loader.ts").then(module=>module.loadSchoolNativeQuery())
    .catch(error=>{queryRequest=null;throw error;});
  return queryRequest;
}
