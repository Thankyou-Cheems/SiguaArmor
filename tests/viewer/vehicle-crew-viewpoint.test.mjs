import assert from "node:assert/strict";
import test from "node:test";

import {
  crewViewBasePose,
  crewViewHorizontalFovForZoom,
  preferredCrewViewStation,
  transformCrewViewPose,
} from "../../lib/vehicle-crew-viewpoint.ts";

const frame = (translationCm, rotationQuaternion = { x: 0, y: 0, z: 0, w: 1 }) => ({
  state: "derived",
  value: {
    translationCm,
    rotationQuaternion,
    scale3D: { x: 1, y: 1, z: 1 },
  },
  reason: null,
});

test("crew view converts exact UE vehicle-local camera pose into glTF space", () => {
  const pose = crewViewBasePose({
    vehicleLocalFrame: frame({ x: 100, y: 20, z: 250 }),
    baseHorizontalFovDegrees: { state: "observed", value: 90 },
  });
  assert.deepEqual(pose, {
    position: [1, 2.5, 0.2],
    forward: [1, 0, 0],
    up: [0, 1, 0],
    horizontalFovDegrees: 90,
  });
});

test("crew view preserves authored camera yaw instead of aiming at vehicle center", () => {
  const half = Math.SQRT1_2;
  const pose = crewViewBasePose({
    vehicleLocalFrame: frame(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: half, w: half },
    ),
    baseHorizontalFovDegrees: { state: "observed", value: 75 },
  });
  assert.ok(Math.abs(pose.forward[0]) < 1e-12);
  assert.ok(Math.abs(pose.forward[1]) < 1e-12);
  assert.ok(Math.abs(pose.forward[2] - 1) < 1e-12);
  assert.equal(pose.horizontalFovDegrees, 75);
});

test("crew view follows current articulation while retaining an orthonormal basis", () => {
  const pose = crewViewBasePose({
    vehicleLocalFrame: frame({ x: 100, y: 0, z: 0 }),
    baseHorizontalFovDegrees: { state: "observed", value: 90 },
  });
  const yawPositiveNinety = [
    0, 0, 1, 0,
    0, 1, 0, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1,
  ];
  const moved = transformCrewViewPose(pose, [yawPositiveNinety]);
  assert.ok(Math.abs(moved.position[0]) < 1e-12);
  assert.ok(Math.abs(moved.position[2] - 1) < 1e-12);
  assert.ok(Math.abs(moved.forward[0]) < 1e-12);
  assert.ok(Math.abs(moved.forward[2] - 1) < 1e-12);
  assert.ok(Math.abs(
    moved.forward[0] * moved.up[0] +
    moved.forward[1] * moved.up[1] +
    moved.forward[2] * moved.up[2]
  ) < 1e-12);
});

test("F2 gunner is the preferred viewpoint without erasing other station views", () => {
  const stations = [
    { id: "f3", seat: { index: 3, role: "commander" }, view: {} },
    { id: "f4", seat: { index: 4, role: "machine-gunner" }, view: {} },
    { id: "f2", seat: { index: 2, role: "gunner" }, view: {} },
  ];
  assert.equal(preferredCrewViewStation(stations)?.id, "f2");
  assert.deepEqual(stations.map(({ id }) => id), ["f3", "f4", "f2"]);
});

test("crew zoom resolves the source magnification's native-formula candidate", () => {
  const view = {
    baseHorizontalFovDegrees: { state: "observed", value: 50 },
    magnificationLevels: [3, 6, 12],
    formulaProjectedHorizontalFovDegrees: [
      { magnification: 3, horizontalDegrees: 17.670239745980904, state: "derived-formula-candidate" },
      { magnification: 6, horizontalDegrees: 8.88795433968634, state: "derived-formula-candidate" },
      { magnification: 12, horizontalDegrees: 4.450670829010194, state: "derived-formula-candidate" },
    ],
  };
  assert.equal(crewViewHorizontalFovForZoom(view, 0), 17.670239745980904);
  assert.equal(crewViewHorizontalFovForZoom(view, 2), 4.450670829010194);
});

test("crew zoom rejects a stage whose magnification relation is missing", () => {
  assert.equal(crewViewHorizontalFovForZoom({
    baseHorizontalFovDegrees: { state: "observed", value: 90 },
    magnificationLevels: [1, 5],
    formulaProjectedHorizontalFovDegrees: [
      { magnification: 1, horizontalDegrees: 90, state: "derived-formula-candidate" },
    ],
  }, 1), null);
});

test("crew zoom rejects a projection without the native-formula candidate state", () => {
  assert.equal(crewViewHorizontalFovForZoom({
    baseHorizontalFovDegrees: { state: "observed", value: 90 },
    magnificationLevels: [5],
    formulaProjectedHorizontalFovDegrees: [
      { magnification: 5, horizontalDegrees: 22.619864948040426, state: "unresolved" },
    ],
  }, 0), null);
});
