import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_VIEWER_CAMERA_VIEWS,
  RUNTIME_VIEWER_INFANTRY_DISTANCES_M,
  SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
  SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M,
  runtimeViewerInfantryCameraPosition,
  verticalFovForHorizontalFov,
} from "../../lib/runtime-viewer-camera-presets.ts";

test("camera presets expose five numbered views without a bottom view", () => {
  assert.deepEqual(
    RUNTIME_VIEWER_CAMERA_VIEWS.map(({ id, shortcut }) => [id, shortcut]),
    [
      ["front", "1"],
      ["left", "2"],
      ["rear", "3"],
      ["right", "4"],
      ["top", "5"],
    ],
  );
  assert.equal(RUNTIME_VIEWER_CAMERA_VIEWS.some(({ id }) => id === "bottom"), false);
});

test("Squad's 90 degree horizontal FOV is converted for the Three.js viewport", () => {
  assert.equal(SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG, 90);
  assert.ok(
    Math.abs(verticalFovForHorizontalFov(90, 16 / 9) - 58.71550708558255) < 1e-10,
  );
  assert.ok(
    Math.abs(verticalFovForHorizontalFov(90, 4 / 3) - 73.73979529168804) < 1e-10,
  );
});

test("distance preview keeps real scale and uses the derived standing viewpoint", () => {
  assert.deepEqual(RUNTIME_VIEWER_INFANTRY_DISTANCES_M, [8, 50, 100, 200]);
  assert.equal(SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M, 1.6);
  const [x, y, z] = runtimeViewerInfantryCameraPosition({
    yawDegrees: 90,
    distanceM: 100,
    groundY: -1,
  });
  assert.ok(Math.abs(x - 100) < 1e-12);
  assert.ok(Math.abs(y - 0.6) < 1e-12);
  assert.ok(Math.abs(z) < 1e-12);
});
