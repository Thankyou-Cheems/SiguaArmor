import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeldOperationFireController,
} from "../../lib/held-operation-fire-control.ts";
import {
  createVehicleWeaponOperation,
  fireVehicleWeaponOperation,
  nextVehicleWeaponFireAtMs,
} from "../../lib/vehicle-weapon-operation-state.ts";

function fakeClock({ truncateTimers = false } = {}) {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    nowMs: () => now,
    setTimer(callback, delayMs) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, atMs: now + (truncateTimers ? Math.floor(delayMs) : delayMs) });
      return timerId;
    },
    clearTimer(timerId) {
      timers.delete(timerId);
    },
    advanceTo(targetMs) {
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.atMs <= targetMs)
          .sort((left, right) => left[1].atMs - right[1].atMs)[0];
        if (!next) break;
        const [timerId, timer] = next;
        timers.delete(timerId);
        now = timer.atMs;
        timer.callback();
      }
      now = targetMs;
    },
    timerCount: () => timers.size,
  };
}

test("held fire attempts immediately and follows absolute weapon cadence", () => {
  const clock = fakeClock();
  const attempts = [];
  const controller = createHeldOperationFireController({
    attempt() {
      attempts.push(clock.nowMs());
      return { nextAttemptAtMs: clock.nowMs() + 100 };
    },
    nowMs: clock.nowMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  controller.start();
  assert.deepEqual(attempts, [0]);
  clock.advanceTo(350);
  assert.deepEqual(attempts, [0, 100, 200, 300]);
});

test("a premature timer wake waits for the deadline without attempting or publishing another shot", () => {
  let now = 0, callback;
  const attempts = [];
  const controller = createHeldOperationFireController({
    nowMs: () => now,
    setTimer: (fn) => { callback = fn; return 1; },
    clearTimer() {},
    attempt() { attempts.push(now); return { nextAttemptAtMs: now + 100 }; },
  });
  controller.start();
  now = 99.9;
  callback();
  assert.deepEqual(attempts, [0]);
  now = 100;
  callback();
  assert.deepEqual(attempts, [0, 100]);
  controller.stop();
});

test("held automatic fire never surfaces cooldown attempts when browser timers truncate fractional milliseconds", () => {
  const clock = fakeClock({ truncateTimers: true });
  const spec = { numberOfMags: 2, magazineSize: 100, tacticalReloadSeconds: 2,
    dryReloadSeconds: 3, roundsPerMinute: 700, timeBetweenShotsSeconds: 60 / 700 };
  let state = createVehicleWeaponOperation(spec, 0);
  const blocked = [], shots = [];
  const controller = createHeldOperationFireController({
    ...clock,
    attempt() {
      const result = fireVehicleWeaponOperation(state, spec, clock.nowMs());
      state = result.state;
      if (result.fired) shots.push(clock.nowMs());
      else blocked.push(result.reason);
      return { nextAttemptAtMs: nextVehicleWeaponFireAtMs(state, spec, clock.nowMs()) };
    },
  });
  controller.start();
  clock.advanceTo(2000);
  controller.stop();
  assert.deepEqual(blocked, [], "normal held fire must not call the UI with weapon-cooldown");
  assert.equal(shots.length, 24);
  assert.ok(shots.slice(1).every((time, i) => time - shots[i] >= 60000 / 700), "never exceed source cadence");
  assert.equal(clock.timerCount(), 0);
});

test("releasing held fire cancels the scheduled shot", () => {
  const clock = fakeClock();
  let attempts = 0;
  const controller = createHeldOperationFireController({
    attempt() {
      attempts += 1;
      return { nextAttemptAtMs: 500 };
    },
    nowMs: clock.nowMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  controller.stop();
  clock.advanceTo(600);
  assert.equal(attempts, 1);
  assert.equal(clock.timerCount(), 0);
  assert.equal(controller.isActive(), false);
});

test("an exhausted weapon ends a held-fire cycle without polling", () => {
  const clock = fakeClock();
  const controller = createHeldOperationFireController({
    attempt: () => ({ nextAttemptAtMs: null }),
    nowMs: clock.nowMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  assert.equal(controller.isActive(), false);
  assert.equal(clock.timerCount(), 0);
});
