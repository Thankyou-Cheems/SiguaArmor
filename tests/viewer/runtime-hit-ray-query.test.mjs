import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { prepareRuntimeHitRayQuery } from "../../lib/runtime-hit-ray-query.ts";

function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -2, -2, 0, 2, -2, 0, 0, 2, 0,
    -2, -2, 2, 2, -2, 2, 0, 2, 2,
  ], 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  mesh.raycast = acceleratedRaycast;
  const group = new THREE.Group(); group.add(mesh);
  const parsed = {
    triangleComponentIndex: new Uint16Array([3, 7]),
    triangleSurfaceProfileIndex: new Uint16Array([11, 19]),
    faceNormals: new Float32Array([0, 0, 1, 0, 0, 1]),
  };
  const caster = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
  caster.firstHitOnly = false;
  return { group, mesh, parsed, caster };
}

test("prepared query retains every ordered armor layer and source identity", () => {
  const { group, mesh, parsed, caster } = fixture();
  const query = prepareRuntimeHitRayQuery(group, parsed, mesh);
  assert.deepEqual(query(caster), [
    { triangleIndex: 1, componentIndex: 7, surfaceProfileIndex: 19, distanceFromRayOriginM: 8, point: [0, 0, 2], faceNormal: [0, 0, 1], incidenceFactor: 1 },
    { triangleIndex: 0, componentIndex: 3, surfaceProfileIndex: 11, distanceFromRayOriginM: 10, point: [0, 0, 0], faceNormal: [0, 0, 1], incidenceFactor: 1 },
  ]);
  caster.ray.origin.x = 10;
  assert.deepEqual(query(caster), []);
});

test("one batch updates scene matrices once and the next batch sees a changed pose", () => {
  const { group, mesh, parsed, caster } = fixture();
  const original = group.updateMatrixWorld.bind(group); let updates = 0;
  group.updateMatrixWorld = (...args) => { updates++; return original(...args); };
  const query = prepareRuntimeHitRayQuery(group, parsed, mesh);
  for (let i = 0; i < 100; i++) assert.equal(query(caster)[0].distanceFromRayOriginM, 8);
  assert.equal(updates, 1);
  group.position.z = 1;
  const nextBatch = prepareRuntimeHitRayQuery(group, parsed, mesh);
  assert.equal(nextBatch(caster)[0].distanceFromRayOriginM, 7);
  assert.equal(updates, 2);
});

test("fresh queries preserve inverse-transpose normals under scaled and mirrored parents", () => {
  for (const scale of [[2, 3, 0.5], [-2, 3, 0.5]]) {
    const { group, mesh, parsed, caster } = fixture();
    group.scale.set(...scale); group.rotation.set(0.31, -0.47, 0.22); group.position.set(3, -2, 1);
    const query = prepareRuntimeHitRayQuery(group, parsed, mesh);
    caster.ray.origin.set(0, 0, 10).applyMatrix4(mesh.matrixWorld);
    caster.ray.direction.set(0, 0, -1).transformDirection(mesh.matrixWorld);
    const hits = query(caster);
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map(h => h.triangleIndex), [1, 0]);
    const normal = new THREE.Vector3(0, 0, 1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
    for (const hit of hits) {
      assert.deepEqual(hit.faceNormal, normal.toArray());
      assert.equal(hit.incidenceFactor, -caster.ray.direction.dot(normal));
    }
  }
});
