import assert from "node:assert/strict";
import test from "node:test";

import { runtimeShotPathLayerPresentation } from "../../lib/runtime-shot-path-presentation.ts";

test("forced ricochet ends the displayed path without leftover penetration or fake absorption", () => {
  assert.deepEqual(
    runtimeShotPathLayerPresentation({
      penetrated: false,
      incidenceFactor: 0.174,
      availablePenetrationMm: 139.2,
      damageAbsorbedAfterHit: 300,
      stopReason: "available penetration is not greater than thickness",
    }),
    {
      remainingPenetrationMm: null,
      absorbedDamage: null,
      terminalLabel: "强制跳弹",
    },
  );
});

test("a penetrated layer keeps its carried penetration and applied absorption", () => {
  assert.deepEqual(
    runtimeShotPathLayerPresentation({
      penetrated: true,
      incidenceFactor: 0.8,
      availablePenetrationMm: 640,
      damageAbsorbedAfterHit: 300,
      stopReason: null,
    }),
    {
      remainingPenetrationMm: 640,
      absorbedDamage: 300,
      terminalLabel: null,
    },
  );
});

test("an ordinary armor stop is labeled as insufficient penetration", () => {
  assert.deepEqual(
    runtimeShotPathLayerPresentation({
      penetrated: false,
      incidenceFactor: 0.5,
      availablePenetrationMm: 400,
      damageAbsorbedAfterHit: 300,
      stopReason: "available penetration is not greater than thickness",
    }),
    {
      remainingPenetrationMm: null,
      absorbedDamage: null,
      terminalLabel: "穿深不足",
    },
  );
});
