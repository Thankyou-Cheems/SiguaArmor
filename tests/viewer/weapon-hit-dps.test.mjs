import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateWeaponHitDps,
  selectPrimaryWeaponHitDpsTarget,
  singleShotWeaponHitTarget,
  targetPoolsForShot,
} from "../../lib/weapon-hit-dps.ts";

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
