import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATION_VIEW_STANDARD_ASPECT_RATIO,
  OPERATION_VIEW_STANDARD_HORIZONTAL_FOV_DEGREES,
  operationViewContinuousPoseDelta,
  operationViewKeyAction,
  operationViewHorizontalFovForMagnification,
  operationViewScenePresentation,
} from "../../lib/operation-view-control.ts";

test("held operation keys produce frame-rate-independent continuous motion", () => {
  assert.deepEqual(
    operationViewContinuousPoseDelta(["KeyW"], 1 / 60),
    { yawDelta: 0, pitchDelta: 0.25 },
  );
  assert.deepEqual(
    operationViewContinuousPoseDelta(["KeyA", "KeyW"], 1 / 60),
    { yawDelta: -0.5, pitchDelta: 0.25 },
  );
  assert.equal(
    operationViewContinuousPoseDelta(["KeyA", "KeyD"], 1 / 60),
    null,
  );
  assert.equal(operationViewContinuousPoseDelta(["KeyW"], 0), null);
});

test("operation view uses a 16:9 90-degree horizontal-FOV reference", () => {
  assert.equal(OPERATION_VIEW_STANDARD_ASPECT_RATIO, 16 / 9);
  assert.equal(OPERATION_VIEW_STANDARD_HORIZONTAL_FOV_DEGREES, 90);
  assert.equal(operationViewHorizontalFovForMagnification(1), 90);
  assert.ok(
    Math.abs(
      operationViewHorizontalFovForMagnification(2.1) -
        50.92669012374322,
    ) < 1e-10,
  );
  assert.equal(operationViewHorizontalFovForMagnification(0), null);
});

test("operation view uses a visible world reference instead of a transparent black scene", () => {
  assert.deepEqual(operationViewScenePresentation(false), {
    clearColor: 0x000000,
    clearAlpha: 0,
    groundGridScale: 1,
  });
  const active = operationViewScenePresentation(true);
  assert.equal(active.clearAlpha, 1);
  assert.equal(active.groundGridScale, 20);
  assert.ok(active.clearColor > 0x121212);
});

test("WASD adjusts a weapon station and Q cycles magnification", () => {
  assert.deepEqual(operationViewKeyAction({
    code: "KeyW",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
  }), { kind: "pose", yawDelta: 0, pitchDelta: 0.5 });
  assert.deepEqual(operationViewKeyAction({
    code: "KeyS",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
  }), { kind: "pose", yawDelta: 0, pitchDelta: -0.5 });
  assert.deepEqual(operationViewKeyAction({
    code: "KeyA",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
  }), { kind: "pose", yawDelta: -1, pitchDelta: 0 });
  assert.deepEqual(operationViewKeyAction({
    code: "KeyD",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
  }), { kind: "pose", yawDelta: 1, pitchDelta: 0 });
  assert.deepEqual(operationViewKeyAction({
    code: "KeyQ",
    driverView: false,
    repeat: false,
    zoomIndex: 0,
    zoomCount: 2,
  }), { kind: "zoom", zoomIndex: 1 });
  assert.deepEqual(operationViewKeyAction({
    code: "KeyQ",
    driverView: false,
    repeat: false,
    zoomIndex: 1,
    zoomCount: 2,
  }), { kind: "zoom", zoomIndex: 0 });
});

test("driver fixed view and repeated Q do not mutate weapon-station controls", () => {
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ"]) {
    assert.equal(operationViewKeyAction({
      code,
      driverView: true,
      repeat: false,
      zoomIndex: 0,
      zoomCount: 2,
    }), null);
  }
  assert.equal(operationViewKeyAction({
    code: "KeyQ",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
  }), null);
  assert.equal(operationViewKeyAction({
    code: "KeyQ",
    driverView: false,
    repeat: false,
    zoomIndex: 0,
    zoomCount: 1,
  }), null);
});
