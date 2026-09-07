import * as THREE from "three";
import { sweepSphereTriangle, type SweepVector } from "./runtime-school-native-sweep.ts";
import type { NativeSchoolPose, NativeSchoolSegment } from "./runtime-school-native-ray.ts";

/** Construct once per placement/query, sharing the cooked prototype geometry.
 * Sphere radius remains in cm: scale the triangle, not the sphere/direction. */
export function createSchoolNativeSphereSweep(segment: NativeSchoolSegment, pose: NativeSchoolPose, radius: number) {
  const f=Math.fround, quaternion=pose.rotationQuaternion.map(f);
  const rotate=(v: THREE.Vector3, inverse=false) => {
    const sign=inverse?-1:1, axis=new THREE.Vector3(quaternion[0]*sign,quaternion[1]*sign,quaternion[2]*sign);
    const turn=axis.clone().cross(v).multiplyScalar(2);
    return v.addScaledVector(turn,quaternion[3]).add(axis.cross(turn));
  };
  const translation=new THREE.Vector3(...pose.translationCm);
  const start=new THREE.Vector3(...segment.startCm), delta=new THREE.Vector3(...segment.endCm).sub(start);
  const length=f(delta.length());
  if (!(length>0) || !(radius>0)) return null;
  const direction=rotate(delta.divideScalar(length),true).toArray().map(f) as SweepVector;
  const origin=rotate(start.sub(translation),true).toArray().map(f) as SweepVector;
  const scale=pose.scale3d.every(v=>Math.abs(v-1)<f(.0001)) ? [1,1,1] : pose.scale3d.map(f);
  if (scale.some(v=>!(v>0))) throw new Error("Unsupported native school scale");
  return (triangle: THREE.Triangle) => {
    const vertices=[triangle.a,triangle.b,triangle.c].map(v=>v.toArray().map((x,i)=>f(x*scale[i])) as SweepVector) as [SweepVector,SweepVector,SweepVector];
    const hit=sweepSphereTriangle({vertices,origin,direction,length,radius});
    if (!hit) return null;
    const p=rotate(new THREE.Vector3(...hit.point)).add(translation).divideScalar(100);
    const n=rotate(new THREE.Vector3(...hit.normal));
    return {timeFraction:f(Math.max(0,hit.distance)/length),signedDistanceM:hit.distance/100,
      penetrationDepth:Math.max(0,-hit.distance)/100,
      point:new THREE.Vector3(p.x,p.z,p.y),normal:new THREE.Vector3(n.x,n.z,n.y)};
  };
}
