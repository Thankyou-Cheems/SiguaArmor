import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeRuntimeScene, retainCachedRuntimeSceneResources } from "../../lib/runtime-scene-resources.ts";

test("disposing either reference-soldier clone preserves cached resources used by the other", () => {
  const source = new THREE.Group();
  const bone = new THREE.Bone();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  source.add(mesh);
  retainCachedRuntimeSceneResources(source);
  const left = clone(source), right = clone(source);
  const leftMesh = left.children[0], rightMesh = right.children[0];
  assert.equal(leftMesh.geometry, rightMesh.geometry, "no per-viewer geometry copy");
  assert.equal(leftMesh.material, rightMesh.material, "no per-viewer material copy");
  assert.equal(leftMesh.material.map, rightMesh.material.map, "no per-viewer texture copy");
  assert.notEqual(leftMesh.skeleton, rightMesh.skeleton);
  leftMesh.skeleton.computeBoneTexture();
  rightMesh.skeleton.computeBoneTexture();
  const counts = { geometry: 0, material: 0, texture: 0, leftSkeleton: 0, rightSkeleton: 0, owned: 0 };
  for (const [name, resource] of Object.entries({ geometry, material, texture,
    leftSkeleton: leftMesh.skeleton.boneTexture, rightSkeleton: rightMesh.skeleton.boneTexture })) {
    resource.addEventListener("dispose", () => { counts[name]++; });
  }
  const ownGeometry = new THREE.BoxGeometry(1, 1, 1);
  ownGeometry.addEventListener("dispose", () => { counts.owned++; });
  left.add(new THREE.Mesh(ownGeometry, new THREE.MeshBasicMaterial()));
  disposeRuntimeScene(left);
  assert.deepEqual(counts, { geometry: 0, material: 0, texture: 0, leftSkeleton: 1, rightSkeleton: 0, owned: 1 });
  assert.ok(rightMesh.skeleton.boneTexture, "other consumer's bone texture remains alive");
  disposeRuntimeScene(right);
  assert.deepEqual(counts, { geometry: 0, material: 0, texture: 0, leftSkeleton: 1, rightSkeleton: 1, owned: 1 });
});

test("standalone scene cleanup still frees owned shared-within-scene resources once", () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const scene = new THREE.Group();
  const instance = new THREE.InstancedMesh(geometry, material, 1);
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), instance);
  const disposed = [];
  instance.addEventListener("dispose", () => disposed.push("instance"));
  for (const [name, resource] of Object.entries({ geometry, material, texture })) resource.addEventListener("dispose", () => disposed.push(name));
  disposeRuntimeScene(scene);
  assert.deepEqual(disposed.sort(), ["geometry", "instance", "material", "texture"]);
});

test("reference cache marks ownership before publishing clones; viewer uses ownership-aware cleanup", async () => {
  const reference = await readFile(new URL("../../app/runtime-reference-soldier.ts", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
  assert.match(reference, /retainCachedRuntimeSceneResources\(scene\);\s*return \{ scene, dataset, modelUrl, glassRebind \};/u);
  assert.match(viewer, /import \{ disposeRuntimeScene as disposeScene \} from "\.\.\/lib\/runtime-scene-resources"/u);
});
