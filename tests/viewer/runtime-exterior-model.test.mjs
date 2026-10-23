import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { validateRuntimeExteriorModel } from "../../lib/runtime-exterior-model.ts";

test("controlled exterior source rejects empty scenes and incomplete domains", () => {
  assert.throws(() => validateRuntimeExteriorModel(new THREE.Group()), /为空/);
  const model = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry());
  model.add(mesh);
  assert.doesNotThrow(() => validateRuntimeExteriorModel(model));
  mesh.geometry.attributes.position.setX(0, NaN);
  assert.throws(() => validateRuntimeExteriorModel(model), /顶点/);
  mesh.geometry.attributes.position.setX(0, 0);
  mesh.geometry.attributes.normal.setX(0, NaN);
  assert.throws(() => validateRuntimeExteriorModel(model), /属性/);
  mesh.geometry.attributes.normal.setX(0, 1);
  mesh.geometry.index.setX(0, mesh.geometry.attributes.position.count);
  assert.throws(() => validateRuntimeExteriorModel(model), /索引/);
});

test("full source matrices remain untouched and invalid skin is explicit", () => {
  const model = new THREE.Group(), bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry());
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); model.add(mesh);
  assert.throws(() => validateRuntimeExteriorModel(model), /影响域缺失/);
  const vertices = mesh.geometry.attributes.position.count;
  mesh.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertices * 4), 4));
  mesh.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Float32Array.from({ length: vertices * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
  model.matrixAutoUpdate = false;
  model.matrix.elements[4] = 0.25;
  const before = model.matrix.elements.slice();
  assert.doesNotThrow(() => validateRuntimeExteriorModel(model));
  assert.deepEqual(model.matrix.elements, before);
  mesh.geometry.attributes.skinIndex.setX(0, 1);
  assert.throws(() => validateRuntimeExteriorModel(model), /影响域无效/);
  mesh.geometry.attributes.skinIndex.setX(0, 0);
  mesh.skeleton.boneInverses[0].elements[0] = NaN;
  assert.throws(() => validateRuntimeExteriorModel(model), /骨架/);
});
