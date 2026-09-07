import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSchoolNativeRay, raycastSchoolNativeMesh, schoolNativeRayResult } from "../../lib/runtime-school-native-ray.ts";

const pose = { translationCm: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], scale3d: [1, 1, 1] };
function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([10,-2,-2,10,0,2,10,2,-2],3));
  geometry.setIndex([0,1,2,0,1,2]);
  const bounds=[10,-2,-2,10,2,2];
  return {geometry,tree:{nodes:[{bounds:[bounds,bounds],children:[1,0],counts:[0,1]},
    {bounds:[bounds,bounds],children:[1,-1],counts:[1,0]}]}};
}

test("native BVH visits immediate leaves before stacked children and replaces tied faces", () => {
  const {geometry,tree}=fixture();
  const hit=raycastSchoolNativeMesh(geometry,tree,true,new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(1,0,0)),20);
  assert.equal(hit.faceIndex,1);assert.equal(hit.distance,10);assert.equal(hit.normal.x,-1);
  assert.equal(raycastSchoolNativeMesh(geometry,tree,true,new THREE.Ray(new THREE.Vector3(20,0,0),new THREE.Vector3(-1,0,0)),20),null);
  assert.equal(raycastSchoolNativeMesh(geometry,tree,true,new THREE.Ray(new THREE.Vector3(0,3,0),new THREE.Vector3(1,0,0)),20),null);
});

test("raw centimetre endpoints survive display-unit round trips and use a float length divisor", () => {
  const segment={startCm:[18857.55058425604,-56898.42449282568,781.5887487131608],endCm:[18858.499082641054,-56898.48667671859,777.7033293050276]};
  const input=createSchoolNativeRay(segment,pose);
  assert.deepEqual(input.ray.origin.toArray(),segment.startCm);
  const delta=new THREE.Vector3(...segment.endCm).sub(new THREE.Vector3(...segment.startCm));
  assert.equal(input.worldLength,Math.fround(delta.length()));
  assert.deepEqual(input.ray.direction.toArray(),delta.multiplyScalar(1/input.worldLength).toArray());
});

test("scaled shapes round local coordinates and inverse scale before double ray traversal", () => {
  const segment={startCm:[123.456789,22.34567,-9.876543],endCm:[223.123456,24.56,10.1]};
  const scaled={...pose,scale3d:[.2,43.317263,1]};
  const input=createSchoolNativeRay(segment,scaled);
  assert.deepEqual(input.ray.origin.toArray(),segment.startCm.map((v,i)=>Math.fround(Math.fround(v)*Math.fround(1/Math.fround(scaled.scale3d[i])))));
  assert.equal(createSchoolNativeRay(segment,{...pose,scale3d:[.999999,1.000001,1]}).scaled,false);
  const atEnd={faceIndex:0,distance:input.far,point:new THREE.Vector3(),normal:new THREE.Vector3(1,0,0)};
  assert.equal(schoolNativeRayResult(atEnd,input,segment,scaled),null);
});

test("Location uses rounded Time while ImpactPoint and cache Distance remain separate", () => {
  const segment={startCm:[100.1,200.2,300.3],endCm:[140.456,225.1,379.8]},input=createSchoolNativeRay(segment,pose);
  const hit={faceIndex:0,distance:21.987654321,point:new THREE.Vector3(101,202,303),normal:new THREE.Vector3(1,0,0)};
  const result=schoolNativeRayResult(hit,input,segment,pose);
  assert.deepEqual(result.pointCm.toArray(),[101,202,303]);
  assert.equal(result.distanceCm,Math.fround(hit.distance));
  assert.deepEqual(result.locationCm.toArray(),segment.startCm.map((v,i)=>v+(segment.endCm[i]-v)*result.time));
  assert.notEqual(result.locationCm.distanceTo(new THREE.Vector3(...segment.startCm)),result.distanceCm);
});
