import assert from "node:assert/strict";
import test from "node:test";

import {
  operationViewKeyAction,
  operationViewScenePresentation,
} from "../../lib/operation-view-control.ts";

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
