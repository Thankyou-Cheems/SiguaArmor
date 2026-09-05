import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import {
  planNarvaSchoolEnvironment, decodeSchoolTerrain, narvaPlacementMatrix, createNarvaSchoolEnvironment,
} from "../../lib/runtime-narva-school-environment.ts";
import { schoolResourceFile } from "../../tools/dev/serve-narva-school.mjs";

function fixture() {
  const placement = (stableId, translationMeters) => ({ stableId, prototypeId: "school-p453",
    sourceTransform: { translationMeters, rotationQuaternion: [0, 0, 0, 1], scale3d: [1, 1, 1] } });
  const scene = {
    schemaVersion: "sigua-infantry-narva-scene/v2", id: "school-football", sourceBuildId: "test",
    fixtures: { footballPitch: { boundsSourceMeters: [99, -538, 171, -492], goalpostStableIds: [10541, 10568] } },
    prototypes: [{ id: "school-p453", meshPath: "/Game/Goalpost.Goalpost" }],
    placements: [placement(10541, [100, -515, 2.0703125]), placement(10568, [168, -515, 2.0703125])],
    terrain: { url: "/assets/terrain.sgnt", bytes: 86,
      grid: { width: 3, height: 3, originSourceMeters: [134, -516], stepMeters: 1 }, layerNames: ["Grass", "Asphalt"] },
  };
  const display = { schemaVersion: "sigua-narva-fixed-display/v1", policy: { cameraDistanceLod: false },
    prototypes: [{ prototypeId: 425, meshPath: "/Game/Goalpost.Goalpost", renderRoute: "fixed-display-geometry",
      geometry: { url: "/assets/goalpost.sgfd", bytes: 99 } }] };
  const buffer = new ArrayBuffer(86), view = new DataView(buffer);
  new Uint8Array(buffer, 0, 4).set(new TextEncoder().encode("SGNT"));
  [3, 3, 3].forEach((value, index) => view.setUint32(4 + index * 4, value, true));
  view.setInt32(16, 134, true); view.setInt32(20, -516, true);
  view.setFloat32(24, 1, true); view.setUint32(28, 2, true);
  for (let index = 0; index < 9; index++) {
    view.setFloat32(32 + index * 4, 2.0703125 + (index === 0 ? 4 : 0), true);
    view.setUint8(68 + index * 2, index % 2 ? 0 : 255);
    view.setUint8(69 + index * 2, index % 2 ? 255 : 0);
  }
  return { scene, display, buffer };
}

test("school joins exact mesh paths, not incompatible prototype ordinals, and reuses instances", () => {
  const { scene, display } = fixture();
  const plan = planNarvaSchoolEnvironment(scene, display);
  assert.deepEqual(plan.centerSourceMeters, [135, -515]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].placements.length, 2);
  assert.equal(plan.resourceBytes, 86 + 99);
});

test("missing, ambiguous, LOD and incomplete-pitch inputs fail visibly", () => {
  const { scene, display } = fixture();
  assert.throws(() => planNarvaSchoolEnvironment(scene, { ...display, prototypes: [] }), /缺少/);
  assert.throws(() => planNarvaSchoolEnvironment(scene, { ...display, prototypes: [...display.prototypes, ...display.prototypes] }), /缺少/);
  assert.throws(() => planNarvaSchoolEnvironment(scene, { ...display, policy: { cameraDistanceLod: true } }), /无 LOD/);
  assert.throws(() => planNarvaSchoolEnvironment({ ...scene, placements: scene.placements.slice(1) }, display), /完整足球场/);
});

test("source terrain keeps relief and already-composed Landscape height, with correct up winding", () => {
  const { scene, buffer } = fixture();
  const terrain = decodeSchoolTerrain(scene, buffer, [135, -515]);
  assert.deepEqual(terrain.anchorSourceMeters, [135, -515, 2.0703125]);
  assert.deepEqual([...terrain.positions.slice(12, 15)], [0, 0, 0]);
  assert.equal(terrain.positions[1], 4);
  assert.notDeepEqual([...terrain.colorsRgb.slice(0, 3)], [...terrain.colorsRgb.slice(3, 6)]);
  const points = [...terrain.indices.slice(0, 3)].map((index) => new THREE.Vector3().fromArray(terrain.positions, index * 3));
  assert.ok(points[1].sub(points[0]).cross(points[2].sub(points[0])).y > 0);
  assert.throws(() => decodeSchoolTerrain(scene, buffer.slice(0, -1), [135, -515]), /不匹配/);
  assert.throws(() => decodeSchoolTerrain(scene, buffer, [200, -515]), /中心/);
});

test("source placement rotation, nonuniform scale and translation use Armor's Y-up metre frame once", () => {
  const { scene } = fixture();
  const placement = scene.placements[0];
  placement.sourceTransform = { translationMeters: [136, -513, 5],
    rotationQuaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale3d: [2, 3, 4] };
  const point = new THREE.Vector3(1, 3, 2).applyMatrix4(narvaPlacementMatrix(placement, [135, -515, 2]));
  assert.ok(point.distanceTo(new THREE.Vector3(-5, 15, 4)) < 1e-6);
});

test("environment uses one draw per shared geometry, has no LOD or textures, and does not mutate cached data", () => {
  const { scene, display, buffer } = fixture();
  const plan = planNarvaSchoolEnvironment(scene, display);
  const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]), colorsRgb: new Uint8Array(9).fill(255) };
  const data = { plan, terrain: decodeSchoolTerrain(scene, buffer, plan.centerSourceMeters), meshes: new Map([[plan.groups[0].resource.url, mesh]]) };
  const root = createNarvaSchoolEnvironment(data);
  assert.equal(root.children.length, 2);
  assert.equal(root.children[1].isInstancedMesh, true);
  assert.equal(root.children[1].count, 2);
  assert.equal(root.children[1].material.map, null);
  assert.equal(root.userData.collisionAuthority, false);
  assert.equal(root.userData.cameraDistanceLod, false);
  assert.deepEqual([...mesh.positions], [0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual([...mesh.indices], [0, 1, 2]);
  root.traverse((object) => { if (object.isInstancedMesh) object.dispose(); object.geometry?.dispose(); });
  root.children[0].material.dispose();
});

test("private scene preview only serves named browser assets, not research custody or arbitrary files", () => {
  assert.ok(schoolResourceFile("/data/maps/narva/fixed-display.json", "D:/display", "D:/wiki").endsWith("fixed-display.json"));
  assert.equal(schoolResourceFile("/../config/packaging-keys/key.json", "D:/display", "D:/wiki"), null);
  assert.equal(schoolResourceFile("/data/maps/narva/ballistic-query.json", "D:/display", "D:/wiki"), null);
  assert.equal(schoolResourceFile("/assets/maps/narva/fixed-display/../../private.json", "D:/display", "D:/wiki"), null);
});

test("viewer replaces GridHelper without scaling scenery or including it in vehicle fit/hit roots", async () => {
  const source = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new THREE\.GridHelper|environmentRoot\.scale|modelGroup\.add\(environmentRoot/);
  assert.match(source, /scene\.add\(environmentRoot\)/);
  assert.match(source, /environmentRoot\.position\.set\(vehicleCameraTarget\.x, groundY, vehicleCameraTarget\.z\)/);
  assert.match(source, /object instanceof THREE\.InstancedMesh\) object\.dispose/);
});
