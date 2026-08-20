import assert from "node:assert/strict";
import test from "node:test";

import {
  compareWeaponRhythms,
  optimizeWeaponRhythm,
  simulateWeaponRhythm,
} from "../../lib/weapon-dps-model.ts";

const cannon = {
  id: "weapon-2a42-ap",
  label: "2A42 AP",
  sourceLabel: "BMP-2",
  assignmentId: "assignment-2a42-ap",
  sourceCardId: "afu--bmp-2--ifv",
  sourceRawName: "BP_BMP2_AFU",
  damagePerShot: 300,
  timeBetweenShotsSeconds: 0.092,
  magazineSize: 100,
  tacticalReloadSeconds: 4,
  dryReloadSeconds: 4,
  overheat: {
    state: "observed",
    heatPerShot: 3.4,
    temperatureMin: 60,
    temperatureMax: 120,
    coolingRatePerSecond: 15,
    triggerStep: 6,
    shutdownTemperature: 105,
    triggerAt: 108,
    unlockTemperature: 102,
  },
};

test("the model reaches the replicated trigger and then unlocks through cooling", () => {
  const result = simulateWeaponRhythm(cannon, {
    targetHealth: 100_000,
    horizonSeconds: 20,
    mode: "burn",
    burstSize: 6,
    pauseSeconds: 0.5,
    useMagazineReload: false,
  });
  assert.equal(result.thermalState, "observed");
  assert.ok(result.firstOverheatSeconds !== null);
  assert.ok(result.overheatCount >= 1);
  assert.ok(result.events.some(({ kind }) => kind === "unlock"));
  assert.ok(result.totalDamage > 0);
});

test("short pauses are compared as a separate schedule and can prevent a thermal lock", () => {
  const [row] = compareWeaponRhythms([cannon], {
    targetHealth: 100_000,
    horizonSeconds: 20,
    burstSize: 6,
    pauseSeconds: 0.8,
    useMagazineReload: false,
  });
  assert.ok(row.controlled.totalDamage > 0);
  assert.ok(row.burn.totalDamage > 0);
  assert.ok(row.controlled.overheatCount <= row.burn.overheatCount);
});

test("missing Wiki heat data fails closed without inventing thermal output", () => {
  const result = simulateWeaponRhythm(
    { ...cannon, overheat: null },
    {
      targetHealth: 1000,
      horizonSeconds: 5,
      mode: "burn",
      burstSize: 6,
      pauseSeconds: 0.5,
      useMagazineReload: false,
    },
  );
  assert.equal(result.thermalState, "unavailable");
  assert.equal(result.overheatCount, 0);
  assert.equal(result.firstOverheatSeconds, null);
  assert.equal(result.unavailableReason, null);
  assert.ok(result.totalDamage > 0);
});

test("a lethal first shot resolves without cadence or thermal data", () => {
  const result = simulateWeaponRhythm(
    {
      ...cannon,
      damagePerShot: 1500,
      timeBetweenShotsSeconds: null,
      magazineSize: null,
      tacticalReloadSeconds: null,
      dryReloadSeconds: null,
      overheat: null,
    },
    {
      targetHealth: 1000,
      horizonSeconds: 60,
      mode: "burn",
      burstSize: 1,
      pauseSeconds: 0,
      useMagazineReload: true,
    },
  );
  assert.equal(result.unavailableReason, null);
  assert.equal(result.thermalState, "unavailable");
  assert.equal(result.shots, 1);
  assert.equal(result.killTimeSeconds, 0);
  assert.equal(result.totalDamage, 1500);
  assert.deepEqual(result.events.map(({ kind, timeSeconds }) => ({ kind, timeSeconds })), [
    { kind: "shot", timeSeconds: 0 },
  ]);
});

test("single-round reload and fire interval overlap instead of doubling missile time", () => {
  const result = simulateWeaponRhythm(
    {
      ...cannon,
      id: "9m113",
      damagePerShot: 1125,
      timeBetweenShotsSeconds: 12,
      magazineSize: 1,
      tacticalReloadSeconds: 12,
      dryReloadSeconds: 12,
      overheat: null,
    },
    {
      targetHealth: 1250,
      horizonSeconds: 60,
      mode: "burn",
      burstSize: 1,
      pauseSeconds: 0,
      useMagazineReload: true,
    },
  );
  assert.equal(result.shots, 2);
  assert.equal(result.reloads, 1);
  assert.equal(result.killTimeSeconds, 12);
  const reload = result.events.find(({ kind }) => kind === "reload");
  assert.equal(reload?.startTimeSeconds, 0);
  assert.equal(reload?.timeSeconds, 12);
  assert.equal(
    result.timeline.filter(({ state }) => state === "reloading").length,
    12,
  );
  assert.equal(result.timeline.at(-1)?.state, "firing");
  assert.deepEqual(
    result.events.map(({ kind, timeSeconds }) => ({ kind, timeSeconds })),
    [
      { kind: "shot", timeSeconds: 0 },
      { kind: "reload", timeSeconds: 12 },
      { kind: "shot", timeSeconds: 12 },
    ],
  );
});

test("automatic rhythm optimization chooses the fastest schedule instead of exposing a fixed user pause", () => {
  const result = optimizeWeaponRhythm(cannon, {
    targetHealth: 100_000,
    horizonSeconds: 20,
    useMagazineReload: false,
  });
  assert.ok(result.best);
  const killed = result.candidates
    .map(({ result: candidate }) => candidate.killTimeSeconds)
    .filter((value) => value !== null);
  if (killed.length > 0) {
    assert.equal(result.best.result.killTimeSeconds, Math.min(...killed));
  } else {
    assert.equal(
      result.best.result.totalDamage,
      Math.max(...result.candidates.map(({ result: candidate }) => candidate.totalDamage)),
    );
  }
  assert.ok(result.candidates.length > 2);
});

test("a mathematically faster pause is rejected when the field advantage is below the practical threshold", () => {
  const result = optimizeWeaponRhythm(cannon, {
    targetHealth: 9000,
    horizonSeconds: 20,
    useMagazineReload: false,
  });
  assert.equal(result.best?.plan.mode, "controlled");
  assert.equal(result.practical.meaningful, false);
  assert.equal(result.recommended?.plan.mode, "burn");
  assert.equal(result.practical.reason, "burn-equivalent");
});

test("heat curve uses one point per shot instead of a histogram bucket", () => {
  const result = simulateWeaponRhythm(
    { ...cannon, overheat: null, damagePerShot: 1, timeBetweenShotsSeconds: 0.1 },
    {
      targetHealth: 1000,
      horizonSeconds: 10,
      mode: "burn",
      burstSize: 32,
      pauseSeconds: 0,
      useMagazineReload: false,
    },
  );
  assert.equal(result.shots, 100);
  assert.equal(result.heatCurve.length, 100);
  assert.equal(result.heatCurve[0].shotNumber, 1);
  assert.equal(result.heatCurve.at(-1).shotNumber, 100);
});
