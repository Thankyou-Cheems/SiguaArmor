import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATION_VIEW_STANDARD_ASPECT_RATIO,
  OPERATION_VIEW_STANDARD_HORIZONTAL_FOV_DEGREES,
  createOperationViewPoseCommitScheduler,
  operationViewContinuousPoseDelta,
  operationViewEquipmentRefs,
  operationViewKeyAction,
  operationViewHorizontalFovForMagnification,
  operationViewScenePresentation,
} from "../../lib/operation-view-control.ts";

test("operation weapon slots preserve Station Graph order and append only known fallbacks", () => {
  assert.deepEqual(operationViewEquipmentRefs({
    stationEquipmentRefs: ["coax", "main", "smoke", "missile"],
    sightEquipmentRefs: ["main", "coax"],
    playableEquipmentRefs: ["missile", "main", "fallback"],
  }), ["coax", "main", "missile", "fallback"]);
});

function fakeCommitTimer() {
  let nextHandle = 0;
  const callbacks = new Map();
  return {
    setTimer(callback) {
      const handle = ++nextHandle;
      callbacks.set(handle, callback);
      return handle;
    },
    clearTimer(handle) {
      callbacks.delete(handle);
    },
    runAll() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback();
    },
    get pendingCount() {
      return callbacks.size;
    },
  };
}

test("operation pose commits coalesce while WASD input is still arriving", () => {
  const timer = fakeCommitTimer();
  const commits = [];
  const scheduler = createOperationViewPoseCommitScheduler({
    delayMs: 250,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  scheduler.schedule(() => commits.push("first"));
  scheduler.schedule(() => commits.push("latest"));
  assert.equal(timer.pendingCount, 1);
  assert.deepEqual(commits, []);

  timer.runAll();
  assert.deepEqual(commits, ["latest"]);
});

test("operation pose commit can be cancelled or flushed before leaving the view", () => {
  const timer = fakeCommitTimer();
  const commits = [];
  const scheduler = createOperationViewPoseCommitScheduler({
    delayMs: 250,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  scheduler.schedule(() => commits.push("cancelled"));
  scheduler.cancel();
  timer.runAll();
  assert.deepEqual(commits, []);

  scheduler.schedule(() => commits.push("flushed"));
  scheduler.flush();
  assert.equal(timer.pendingCount, 0);
  assert.deepEqual(commits, ["flushed"]);
});

test("held operation keys produce frame-rate-independent continuous motion", () => {
  const t72Rates = {
    yawDegreesPerSecond: 30,
    pitchDegreesPerSecond: 40,
  };
  assert.deepEqual(
    operationViewContinuousPoseDelta(["KeyW"], 1 / 60, t72Rates),
    { yawDelta: 0, pitchDelta: 2 / 3 },
  );
  assert.deepEqual(
    operationViewContinuousPoseDelta(["KeyA", "KeyW"], 1 / 60, t72Rates),
    { yawDelta: -0.5, pitchDelta: 2 / 3 },
  );
  assert.equal(
    operationViewContinuousPoseDelta(["KeyA", "KeyD"], 1 / 60, t72Rates),
    null,
  );
  assert.equal(operationViewContinuousPoseDelta(["KeyW"], 0, t72Rates), null);
});

test("continuous operation motion consumes each station's published motion limits", () => {
  assert.deepEqual(
    operationViewContinuousPoseDelta(["KeyD", "KeyS"], 0.05, {
      yawDegreesPerSecond: 90,
      pitchDegreesPerSecond: 60,
    }),
    { yawDelta: 4.5, pitchDelta: -3 },
  );
  assert.equal(
    operationViewContinuousPoseDelta(["KeyD"], 1 / 60, {
      yawDegreesPerSecond: null,
      pitchDegreesPerSecond: 40,
    }),
    null,
  );
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
    analysisDepthOccludersVisible: true,
    suppressHitAnalysis: false,
  });
  const active = operationViewScenePresentation(true);
  assert.equal(active.clearAlpha, 1);
  assert.equal(active.groundGridScale, 20);
  assert.ok(active.clearColor > 0x121212);
  assert.equal(active.analysisDepthOccludersVisible, false);
  assert.equal(active.suppressHitAnalysis, true);
});

test("continuous motion owns WASD and discrete input only cycles magnification", () => {
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
    assert.equal(operationViewKeyAction({
      code,
      driverView: false,
      repeat: true,
      zoomIndex: 0,
      zoomCount: 2,
    }), null);
  }
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

test("number keys select authentic station weapon slots without stealing WASD", () => {
  const equipmentRefs = [
    "equipment:main-gun",
    "equipment:coax",
    "equipment:missile",
  ];
  assert.deepEqual(operationViewKeyAction({
    code: "Digit2",
    driverView: false,
    repeat: false,
    zoomIndex: 0,
    zoomCount: 2,
    equipmentRefs,
  }), {
    kind: "weapon",
    equipmentRef: "equipment:coax",
    slotNumber: 2,
  });
  assert.deepEqual(operationViewKeyAction({
    code: "Numpad3",
    driverView: false,
    repeat: false,
    zoomIndex: 0,
    zoomCount: 2,
    equipmentRefs,
  }), {
    kind: "weapon",
    equipmentRef: "equipment:missile",
    slotNumber: 3,
  });
  assert.equal(operationViewKeyAction({
    code: "Digit4",
    driverView: false,
    repeat: false,
    zoomIndex: 0,
    zoomCount: 2,
    equipmentRefs,
  }), null);
  assert.equal(operationViewKeyAction({
    code: "Digit1",
    driverView: false,
    repeat: true,
    zoomIndex: 0,
    zoomCount: 2,
    equipmentRefs,
  }), null);
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
