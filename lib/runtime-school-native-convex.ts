import * as THREE from "three";

/** Cooked Chaos planes in the primitive's own centimetre frame. Shape identity
 * survives overlapping hulls: WorldMulti returns one contact per shape. */
export type SchoolNativeConvex = {
  elementIndex: number;
  planes: readonly number[];
  matrix: THREE.Matrix4;
  /** FKBoxElem scales extents before rotating; non-uniform scale cannot shear it. */
  isBox?: boolean;
};

/** v10.5.3 FConvex::RaycastFast, zero thickness. A starts-inside ray returns
 * Time=0 and -Direction; it must not be replaced by the hull's exit. */
export function raycastSchoolConvex(planes: readonly number[], start: THREE.Vector3,
  direction: THREE.Vector3, length: number) {
  if (!planes.length || planes.length % 6 || !(length > 0)) return null;
  let enter = 0, exit = length, enteringPlane = -1;
  for (let p = 0; p < planes.length; p += 6) {
    const nx = planes[p + 3], ny = planes[p + 4], nz = planes[p + 5];
    const denominator = ny * direction.y + nx * direction.x + nz * direction.z;
    const distance = (start.y - planes[p + 1]) * ny + (start.x - planes[p]) * nx + (start.z - planes[p + 2]) * nz;
    if (denominator === 0) { if (distance > 0) return null; }
    else {
      const t = -distance / denominator;
      if (denominator >= 0) exit = Math.min(exit, t);
      else if (t > enter) { enter = t; enteringPlane = p; }
    }
    if (exit < enter) return null;
  }
  const normal = enteringPlane < 0 ? direction.clone().negate()
    : new THREE.Vector3().fromArray(planes, enteringPlane + 3);
  return { distance: enter, point: start.clone().addScaledVector(direction, enter), normal };
}
