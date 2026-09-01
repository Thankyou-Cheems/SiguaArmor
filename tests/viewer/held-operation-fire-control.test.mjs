import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeldOperationFireController,
} from "../../lib/held-operation-fire-control.ts";

function fakeClock() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    nowMs: () => now,
    setTimer(callback, delayMs) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, atMs: now + delayMs });
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
  assert.deepEqual(attempts, [0]);
  clock.advanceTo(350);
  assert.deepEqual(attempts, [0, 100, 200, 300]);
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
