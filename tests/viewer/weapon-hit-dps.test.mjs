import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateWeaponHitDps,
  selectPrimaryWeaponHitDpsEstimate,
  selectPrimaryWeaponHitDpsTarget,
  singleShotWeaponHitTarget,
  targetPoolsForShot,
  vehicleTargetBurningProfile,
} from "../../lib/weapon-hit-dps.ts";

test("an earlier ammo-rack loss replaces the later hull depletion headline", () => {
  const estimates = estimateWeaponHitDps(
    {
      id: "nm225",
      label: "NM225",
      sourceLabel: "test vehicle",
      assignmentId: "autocannon",
      sourceCardId: "test--vehicle",
      sourceRawName: "BP_TestVehicle",
      damagePerShot: 1,
      timeBetweenShotsSeconds: 1,
      magazineSize: 30,
      tacticalReloadSeconds: 5,
      dryReloadSeconds: 5,
      overheat: null,
    },
    {
      damage: [{
        poolIndex: 0,
        poolId: "vehicle-hull",
        poolKind: "hull",
        maxHealth: 2000,
        effectiveDamage: 100,
        certainty: "resolved",
      }, {
        poolIndex: 2,
        poolId: "ammo-rack",
        poolKind: "ammo-rack",
        maxHealth: 2000,
        effectiveDamage: 525,
        certainty: "resolved",
      }],
    },
    { targetHealth: 1, horizonSeconds: 60, useMagazineReload: true },
  );

  const primary = selectPrimaryWeaponHitDpsEstimate(estimates, "armor");
  assert.equal(primary?.poolKind, "ammo-rack");
  assert.equal(
    primary?.optimization.recommended?.result.killTimeSeconds ??
      primary?.optimization.burn.result.killTimeSeconds,
    3,
  );
});

test("vehicle burning facts resolve through the exact burning damage resistance", () => {
  const targetBurning = vehicleTargetBurningProfile({
    burning: {
      state: "observed",
      vehicleState: "normal",
      sourceBuildId: "sdk-test",
      startHealthFraction: 0.1,
      healthFractionPerSecond: 0.0033,
      tickIntervalSeconds: 1,
      startDelaySeconds: 1,
      damageClass: "SQBurningDamage",
    },
    damageResistances: [
      { damageClass: "BP_Kinetic_DamageType_C", modifier: 0.1 },
      { damageClass: "SQBurningDamage", modifier: 0.5 },
    ],
  });
  assert.deepEqual(targetBurning, {
    state: "ready",
    reason: null,
    profile: {
      state: "observed",
      vehicleState: "normal",
      startHealthFraction: 0.1,
      healthFractionPerSecond: 0.0033,
      damageModifier: 0.5,
      tickIntervalSeconds: 1,
      startDelaySeconds: 1,
    },
  });

  const targets = targetPoolsForShot({
    damage: [{
      poolIndex: 0,
      poolId: "vehicle-hull",
      poolKind: "hull",
      maxHealth: 1000,
      effectiveDamage: 950,
      certainty: "resolved",
    }, {
      poolIndex: 1,
      poolId: "engine",
      poolKind: "engine",
      maxHealth: 300,
      effectiveDamage: 100,
      certainty: "resolved",
    }],
  }, targetBurning.profile);
  assert.deepEqual(targets[0].targetBurning, targetBurning.profile);
  assert.equal(targets[1].targetBurning, undefined);
});

test("missing burning resistance fails closed instead of becoming an exact direct-only time", () => {
  const resolution = vehicleTargetBurningProfile({
    burning: {
      state: "derived",
      vehicleState: "normal",
      sourceBuildId: "sdk-test",
      startHealthFraction: 0.1,
      healthFractionPerSecond: 0.0033,
      tickIntervalSeconds: 1,
      startDelaySeconds: 1,
      damageClass: "SQBurningDamage",
    },
    damageResistances: [],
  });
  assert.equal(resolution.state, "unavailable");
  assert.equal(resolution.profile, null);
  assert.match(resolution.reason, /燃烧伤害抗性/u);
});

test("a clicked hit exposes independent hull and module target pools", () => {
  const targets = targetPoolsForShot({
    damage: [
      {
        poolIndex: 0,
        poolId: "vehicle-hull",
        poolKind: "hull",
        maxHealth: 1000,
        effectiveDamage: 120,
        certainty: "resolved",
      },
      {
        poolIndex: 3,
        poolId: "engine",
        poolKind: "engine",
        maxHealth: 300,
        effectiveDamage: 80,
        certainty: "resolved",
      },
      {
        poolIndex: 0,
        poolId: "vehicle-hull",
        poolKind: "hull",
        maxHealth: 1000,
        effectiveDamage: 120,
        certainty: "resolved",
      },
      {
        poolIndex: 4,
        poolId: "unknown",
        poolKind: "ammo-rack",
        maxHealth: null,
        effectiveDamage: 50,
        certainty: "resolved",
      },
    ],
  });
  assert.deepEqual(targets, [
    { key: "0:vehicle-hull", poolKind: "hull", maxHealth: 1000, damagePerShot: 240 },
    { key: "3:engine", poolKind: "engine", maxHealth: 300, damagePerShot: 80 },
  ]);
  assert.equal(selectPrimaryWeaponHitDpsTarget(targets, "engine")?.poolKind, "engine");
  assert.equal(selectPrimaryWeaponHitDpsTarget(targets, "armor")?.poolKind, "hull");
  assert.equal(selectPrimaryWeaponHitDpsTarget(targets, null)?.poolKind, "hull");
  assert.equal(singleShotWeaponHitTarget(targets, "engine"), null);
  assert.deepEqual(
    singleShotWeaponHitTarget([
      { key: "3:engine", poolKind: "engine", maxHealth: 300, damagePerShot: 300 },
      { key: "0:hull", poolKind: "hull", maxHealth: 1000, damagePerShot: 120 },
    ], "engine"),
    { key: "3:engine", poolKind: "engine", maxHealth: 300, damagePerShot: 300 },
  );

  const multiTarget = estimateWeaponHitDps(
    {
      id: "9m113",
      label: "9M113",
      sourceLabel: "BMP-2",
      assignmentId: "missile",
      sourceCardId: "afu--bmp-2--ifv",
      sourceRawName: "BP_BMP2_AFU",
      damagePerShot: 1,
      timeBetweenShotsSeconds: 12,
      magazineSize: 1,
      tacticalReloadSeconds: 12,
      dryReloadSeconds: 12,
      overheat: null,
    },
    {
      damage: [
        {
          poolIndex: 0,
          poolId: "vehicle-hull",
          poolKind: "hull",
          maxHealth: 1250,
          effectiveDamage: 1000,
          certainty: "resolved",
        },
        {
          poolIndex: 3,
          poolId: "left-track",
          poolKind: "track",
          maxHealth: 600,
          effectiveDamage: 600,
          certainty: "resolved",
        },
      ],
    },
    { targetHealth: 1, horizonSeconds: 60, useMagazineReload: true },
  );
  assert.equal(multiTarget.find(({ poolKind }) => poolKind === "track")?.optimization.recommended?.result.killTimeSeconds, 0);
  assert.equal(multiTarget.find(({ poolKind }) => poolKind === "hull")?.optimization.recommended?.result.killTimeSeconds, 12);
});

test("DPS does not publish a precise drivetrain time without native radial hits", () => {
  const damage = [
    {
      poolIndex: 0,
      poolId: "hull",
      poolKind: "hull",
      maxHealth: 1250,
      effectiveDamage: 100,
      certainty: "resolved",
    },
    {
      poolIndex: 1,
      poolId: "left-track",
      poolKind: "track",
      maxHealth: 600,
      effectiveDamage: 150,
      certainty: "resolved",
    },
  ];
  const partial = targetPoolsForShot({
    damage,
    radial: {
      layers: [{}],
      componentFanout: "native-query-required",
    },
  });
  assert.deepEqual(partial.map(({ poolKind }) => poolKind), ["hull"]);

  const resolved = targetPoolsForShot({
    damage,
    radial: {
      layers: [{}],
      componentFanout: "drivetrain-resolved",
    },
  });
  assert.deepEqual(resolved.map(({ poolKind }) => poolKind), ["hull", "track"]);
});
