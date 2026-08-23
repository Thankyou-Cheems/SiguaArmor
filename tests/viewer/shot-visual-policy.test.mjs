import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shotResultRendersDirectTrace } from "../../lib/shot-visual-policy.ts";

function result({ penetration = 0, impact = 0, pointDamage = 0 } = {}) {
  return {
    ballistics: {
      penetrationAtRangeMm: penetration,
      impactDamageAtRange: impact,
    },
    layers: [{}],
    damage: [
      ...(pointDamage > 0
        ? [{ damageKind: "point", effectiveDamage: pointDamage }]
        : []),
      { damageKind: "radial", effectiveDamage: 500 },
    ],
  };
}

test("pure radial explosives do not render a direct shot trace", () => {
  assert.equal(shotResultRendersDirectTrace(result()), false);
});

test("penetration or effective point damage retains the direct trace", () => {
  assert.equal(shotResultRendersDirectTrace(result({ penetration: 650 })), true);
  assert.equal(shotResultRendersDirectTrace(result({ impact: 100, pointDamage: 100 })), true);
});

test("Runtime Viewer applies the direct-trace policy before exposing shot geometry", () => {
  const source = readFileSync(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /shotResultRendersDirectTrace\(result\)/u);
  assert.match(source, /shotDirectTraceState/u);
  assert.match(source, /rendersDirectTrace \? firstLayer\?\.surfaceProfileIndex \?\? null : null/u);
  assert.match(source, /shotHoveredSurfaceState/u);
});
