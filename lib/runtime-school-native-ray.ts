import * as THREE from "three";

export type NativeMeshNode = {
  bounds: [number[], number[]]; children: [number, number]; counts: [number, number];
};
export type NativeMeshTree = { nodes: NativeMeshNode[] };
export type NativeSchoolPose = {
  translationCm: [number, number, number]; rotationQuaternion: [number, number, number, number];
  scale3d: [number, number, number];
};
export type NativeSchoolSegment = { startCm: [number, number, number]; endCm: [number, number, number] };

const f = Math.fround, epsilon = f(1e-8);

/** SDK 10.5.3 Chaos zero-thickness triangle-mesh raycast. Raw cooked cm
 * vertices and native BVH order are required. No display-space tolerance. */
export function raycastSchoolNativeMesh(geometry: THREE.BufferGeometry, tree: NativeMeshTree,
  cullsBackFace: boolean, ray: THREE.Ray, far: number) {
  const positions = geometry.getAttribute("position"), indices = geometry.getIndex();
  if (!indices || !tree.nodes.length || !(far > 0)) return null;
  const origin = ray.origin.toArray().map(f), direction = ray.direction.toArray().map(f);
  const zero = direction.map(value => Math.abs(value) < epsilon);
  const inverse = direction.map((value, axis) => zero[axis] ? 0 : f(1 / value));
  let maximum = f(far);
  let best: { faceIndex: number; distance: number; point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  const slab = (bounds: number[]) => {
    let entry = 0, exit = maximum;
    for (let axis = 0; axis < 3; axis++) {
      if (zero[axis]) {
        if (origin[axis] < bounds[axis] || origin[axis] > bounds[axis + 3]) return false;
        continue;
      }
      const lo = f(f(bounds[axis] - origin[axis]) * inverse[axis]);
      const hi = f(f(bounds[axis + 3] - origin[axis]) * inverse[axis]);
      entry = Math.max(entry, Math.min(lo, hi)); exit = Math.min(exit, Math.max(lo, hi));
    }
    return exit >= entry;
  };
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), normal = a.clone(), relative = a.clone(), cross = a.clone();
  const visit = (index: number) => {
    a.fromBufferAttribute(positions, indices.getX(index * 3));
    b.fromBufferAttribute(positions, indices.getX(index * 3 + 1));
    c.fromBufferAttribute(positions, indices.getX(index * 3 + 2));
    // Exact raw-vertex min/max equals every captured leaf bound (r26).
    if (!slab([Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z),
      Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z)])) return;
    b.sub(a); c.sub(a); normal.crossVectors(b, c);
    const denominator = -normal.dot(ray.direction);
    if (cullsBackFace && denominator < 0 || Math.abs(denominator) < epsilon) return;
    relative.copy(ray.origin).sub(a);
    const reciprocal = 1 / denominator, distance = relative.dot(normal) * reciprocal;
    if (distance < 0 || distance > maximum) return;
    cross.copy(ray.direction).negate().cross(relative);
    const u = cross.dot(c) * reciprocal, v = cross.dot(b) * reciprocal;
    if (u < -epsilon || u > 1.00000001 || v > epsilon || u - v > 1.00000001) return;
    // Native traversal replaces an earlier hit within the rounded upper bound.
    maximum = f(distance);
    best = { faceIndex: index, distance, point: ray.at(distance, new THREE.Vector3()),
      normal: normal.clone().normalize().multiplyScalar(Math.sign(denominator)) };
  };
  const stack = [0];
  while (stack.length) {
    const node = tree.nodes[stack.pop()!];
    for (let side = 0; side < 2; side++) {
      const child = node.children[side], count = node.counts[side];
      if (child < 0 || !slab(node.bounds[side])) continue;
      if (!count) stack.push(child);
      else for (let index = child; index < child + count; index++) visit(index);
    }
  }
  return best as { faceIndex: number; distance: number; point: THREE.Vector3; normal: THREE.Vector3 } | null;
}

function rotate(vector: THREE.Vector3, pose: NativeSchoolPose, inverse = false) {
  const q = pose.rotationQuaternion.map(f), sign = inverse ? -1 : 1;
  const axis = new THREE.Vector3(q[0] * sign, q[1] * sign, q[2] * sign);
  const turn = axis.clone().cross(vector).multiplyScalar(2);
  return vector.addScaledVector(turn, q[3]).add(axis.cross(turn));
}

/** Engine ray length is f32; its direction divides the original cm delta by
 * that rounded length. Scaled shapes cast O/D to f32 before inverse scaling. */
export function createSchoolNativeRay(segment: NativeSchoolSegment, pose: NativeSchoolPose) {
  const origin = new THREE.Vector3(...segment.startCm);
  const direction = new THREE.Vector3(...segment.endCm).sub(origin);
  const worldLength = f(direction.length());
  if (!(worldLength > 0)) return null;
  rotate(origin.sub(new THREE.Vector3(...pose.translationCm)), pose, true);
  rotate(direction.multiplyScalar(1 / worldLength), pose, true);
  const scaled = !pose.scale3d.every(value => Math.abs(value - 1) < f(.0001));
  const scale = scaled ? pose.scale3d.map(f) : [1, 1, 1];
  // The school's observed scale components are positive and far from zero.
  // Unsupported transforms must be rejected by the source artifact compiler.
  if (scale.some(value => !(value > 0))) throw new Error("Unsupported native school scale");
  const inverse = scale.map(value => f(1 / value));
  if (scaled) {
    origin.set(...origin.toArray().map((value, axis) => f(f(value) * inverse[axis])) as [number, number, number]);
    direction.set(...direction.toArray().map((value, axis) => f(f(value) * inverse[axis])) as [number, number, number]);
  }
  const lengthScale = scaled ? direction.length() : 1;
  direction.multiplyScalar(1 / lengthScale);
  return { ray: new THREE.Ray(origin, direction), far: worldLength * lengthScale, worldLength, lengthScale, scaled, scale, inverse };
}

export function schoolNativeRayResult(hit: NonNullable<ReturnType<typeof raycastSchoolNativeMesh>>,
  input: NonNullable<ReturnType<typeof createSchoolNativeRay>>, segment: NativeSchoolSegment, pose: NativeSchoolPose) {
  const distance = hit.distance / input.lengthScale;
  if (input.scaled && distance !== 0 && distance >= input.worldLength) return null;
  const point = hit.point.clone(), normal = hit.normal.clone();
  if (input.scaled && distance === 0) {
    point.copy(input.ray.origin); // overwritten below with exact world start
    normal.fromArray(segment.startCm).sub(new THREE.Vector3(...segment.endCm)).multiplyScalar(1 / input.worldLength);
    return { pointCm: new THREE.Vector3(...segment.startCm), locationCm: new THREE.Vector3(...segment.startCm), normal, distanceCm: 0, time: 0 };
  }
  if (input.scaled) {
    point.set(...point.toArray().map((value, axis) => f(f(value) * input.scale[axis])) as [number, number, number]);
    normal.set(...normal.toArray().map((value, axis) => f(f(value) * input.inverse[axis])) as [number, number, number]);
    normal.normalize();
  }
  rotate(point, pose).add(new THREE.Vector3(...pose.translationCm));
  rotate(normal, pose);
  const time = f(f(distance) / input.worldLength);
  // ConvertQueryImpactHit derives Location from rounded Time and the original
  // double segment; it need not equal ImpactPoint or float Distance.
  const locationCm = new THREE.Vector3(...segment.endCm).sub(new THREE.Vector3(...segment.startCm))
    .multiplyScalar(time).add(new THREE.Vector3(...segment.startCm));
  return { pointCm: point, locationCm, normal, distanceCm: f(distance), time };
}
