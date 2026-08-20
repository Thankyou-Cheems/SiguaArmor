import assert from "node:assert/strict";
import test from "node:test";

import {
  selectPrimaryWeaponHitDpsTarget,
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
});
