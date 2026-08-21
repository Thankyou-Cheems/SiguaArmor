import assert from "node:assert/strict";
import test from "node:test";

import { summarizeEditorDamageSettlements } from "../../lib/editor-damage-settlement.ts";

function damageEvent(overrides) {
  return {
    poolIndex: 1,
    poolId: "health:turret",
    poolKind: "seat",
    maxHealth: 2000,
    sourceComponentIndex: 7,
    incomingDamage: 8000,
    modifier: 0.1,
    damageTypeModifier: 0.1,
    routeMultiplier: 1,
    modifierSourcePoolIndex: 1,
    route: "direct",
    damageKind: "point",
    poolDamage: 800,
    effectiveDamage: 800,
    certainty: "resolved",
    ...overrides,
  };
}

test("forwarded component damage is one causal amount instead of an additive total", () => {
  const settlements = summarizeEditorDamageSettlements([
    damageEvent({}),
    damageEvent({
      poolIndex: 0,
      poolId: "health:hull",
      poolKind: "hull",
      maxHealth: 3000,
      modifierSourcePoolIndex: 0,
      route: "seat-forwarded-to-hull",
    }),
  ]);

  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].effectiveDamage, 800);
  assert.deepEqual(settlements[0].targets, [
    {
      poolId: "health:turret",
      poolKind: "seat",
      effectiveDamage: 800,
      forwarded: false,
    },
    {
      poolId: "health:hull",
      poolKind: "hull",
      effectiveDamage: 800,
      forwarded: true,
    },
  ]);
});

test("damage chain preserves overkill beyond each component's own health", () => {
  for (const { maxHealth, damage } of [
    { maxHealth: 600, damage: 800 },
    { maxHealth: 1000, damage: 1200 },
  ]) {
    const settlements = summarizeEditorDamageSettlements([
      damageEvent({
        maxHealth,
        poolDamage: damage,
        effectiveDamage: maxHealth,
      }),
      damageEvent({
        poolIndex: 0,
        poolId: "health:hull",
        poolKind: "hull",
        maxHealth: 3000,
        modifierSourcePoolIndex: 0,
        route: "seat-forwarded-to-hull",
        poolDamage: damage,
        effectiveDamage: damage,
      }),
    ]);

    assert.equal(settlements.length, 1);
    assert.equal(settlements[0].effectiveDamage, damage);
    assert.deepEqual(settlements[0].targets, [
      {
        poolId: "health:turret",
        poolKind: "seat",
        effectiveDamage: damage,
        forwarded: false,
      },
      {
        poolId: "health:hull",
        poolKind: "hull",
        effectiveDamage: damage,
        forwarded: true,
      },
    ]);
  }
});

test("radial drivetrain multiplicity remains visible in the settlement formula", () => {
  const settlements = summarizeEditorDamageSettlements([
    damageEvent({
      poolId: "health:left-track",
      poolKind: "track",
      damageKind: "radial",
      route: "radial-indirect",
      incomingDamage: 92.4058609008789,
      damageTypeModifier: 1.25,
      routeMultiplier: 1,
      radialDispatchCount: 8,
      poolDamage: 924.05859375,
      effectiveDamage: 600,
    }),
  ]);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].dispatchCount, 8);
  assert.equal(settlements[0].effectiveDamage, 924.05859375);
});
