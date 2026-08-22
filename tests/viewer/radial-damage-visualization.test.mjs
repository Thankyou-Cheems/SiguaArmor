import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRadialDamageVisualizationPlan,
  radialDamageCoverageState,
  radialDamageLegendPlacement,
  RADIAL_DAMAGE_VISUAL_TIMING_MS,
} from "../../lib/radial-damage-visualization.ts";

test("dynamic explosion coverage distinguishes damage, clear space, and unknown queries", () => {
  assert.equal(radialDamageCoverageState(radialShot()), "covered");
  const resistedShot = radialShot();
  resistedShot.damage[0].poolDamage = 0;
  resistedShot.damage[0].effectiveDamage = 0;
  assert.equal(
    radialDamageCoverageState(resistedShot),
    "covered",
    "a resolved radial dispatch still means the blast covered the vehicle when resistance reduces health damage to zero",
  );
  assert.equal(
    radialDamageCoverageState(radialShot({ withResolvedHullDamage: false })),
    "unknown",
  );
  const clearShot = radialShot({ withResolvedHullDamage: false });
  clearShot.radial.state = "resolved";
  clearShot.radial.componentFanout = "drivetrain-resolved";
  assert.equal(radialDamageCoverageState(clearShot), "clear");
});

function radialShot({ withResolvedHullDamage = true } = {}) {
  return {
    resolution: "resolved",
    ballistics: {
      explosiveLayers: [
        {
          layerId: "secondary",
          label: "次爆层",
          shortLabel: "次爆",
          damageTypePath: "/Game/Gameplay/DamageTypes/BP_Explosives_DamageType_C",
          baseDamage: 450,
          minimumDamage: 30,
          innerRadiusCm: 300,
          outerRadiusCm: 2000,
          falloff: 3.5,
          impactNormalOffsetCm: 20,
          onlyDamageMeshes: true,
          orderEvidence: "runtime",
        },
      ],
    },
    layers: [
      {
        componentIndex: 4,
        componentId: "SQArmorMesh",
        semanticKind: "armor",
      },
    ],
    damage: withResolvedHullDamage
      ? [
          {
            damageKind: "radial",
            certainty: "resolved",
            incomingDamage: 450,
            effectiveDamage: 450,
            poolDamage: 450,
            poolIndex: 0,
            poolId: "vehicle-root-health",
            poolKind: "hull",
            sourceComponentIndex: 4,
            radialLayerId: "secondary",
            route: "radial-indirect",
          },
        ]
      : [],
    radial: {
      layers: [
        {
          layerId: "secondary",
          label: "次爆层",
          shortLabel: "次爆",
          damageTypePath: "/Game/Gameplay/DamageTypes/BP_Explosives_DamageType_C",
          explosionOriginOffsetCm: 20,
          baseDamage: 450,
          minimumDamage: 30,
        },
      ],
      componentFanout: "native-unknown",
    },
  };
}

test("radial visualization separates the struck component from resolved target pools", () => {
  const components = Array.from({ length: 5 }, () => ({}));
  components[2] = {
    componentId: "vehicle-hull",
    componentPath: "BP_M1A1.SQArmorMesh",
    semanticKind: "armor",
    directDamagePoolIndex: { value: 0 },
  };
  components[4] = {
    componentId: "SQArmorMesh",
    componentPath: "BP_M1A1_Turret.SQArmorMesh",
    semanticKind: "armor",
    directDamagePoolIndex: { value: 6 },
  };
  const plan = buildRadialDamageVisualizationPlan(radialShot(), components);
  assert.ok(plan);
  assert.equal(
    plan.geometry,
    "smooth-camera-far-hemisphere-with-exact-ring",
  );
  assert.equal(plan.visualClip, "camera-far-hemisphere");
  assert.equal(plan.surfaceHemisphere, "camera-opposite");
  assert.equal(
    plan.legendPlacement,
    "camera-opposite-staggered-on-exact-ring",
  );
  assert.equal(
    plan.exactRadiusReference,
    "horizontal-outer-boundary-ring",
  );
  assert.equal(plan.radiusPresentation, "exact");
  assert.equal(
    plan.targetSelection,
    "root-actor-impact-topology",
  );
  assert.deepEqual(plan.origin, {
    componentIndex: 4,
    componentId: "SQArmorMesh",
    componentLabel: "炮塔装甲",
  });
  assert.deepEqual(
    plan.layers.map(({ innerRadiusM, outerRadiusM, originOffsetM }) => ({
      innerRadiusM,
      outerRadiusM,
      originOffsetM,
    })),
    [{ innerRadiusM: 3, outerRadiusM: 20, originOffsetM: 0.2 }],
  );
  assert.deepEqual(plan.outcomes, [
    {
      poolIndex: 0,
      poolId: "vehicle-root-health",
      poolKind: "hull",
      sourceComponentIndex: 4,
      radialLayerId: "secondary",
      route: "radial-indirect",
      effectiveDamage: 450,
      componentIndices: [2],
    },
  ]);
  assert.equal(plan.outcomeState, "partial");
  assert.equal(plan.componentFanout, "native-unknown");
});

test("radial layers expose only exact radii without a compressed render radius", () => {
  const plan = buildRadialDamageVisualizationPlan(radialShot());
  assert.ok(plan);
  assert.equal(plan.layers[0].innerRadiusM, 3);
  assert.equal(plan.layers[0].outerRadiusM, 20);
  assert.equal("innerDiagramRadiusM" in plan.layers[0], false);
  assert.equal("outerDiagramRadiusM" in plan.layers[0], false);
});

test("radial animation slows expansion and staggers legends across the far side", () => {
  assert.deepEqual(RADIAL_DAMAGE_VISUAL_TIMING_MS, {
    layerDelay: 110,
    expansion: 620,
    fade: 260,
  });
  assert.deepEqual(
    Array.from({ length: 4 }, (_, layerIndex) =>
      radialDamageLegendPlacement(layerIndex)
    ),
    [
      { angleOffsetRad: -0.28 },
      { angleOffsetRad: -0.5 },
      { angleOffsetRad: -0.72 },
      { angleOffsetRad: -0.94 },
    ],
  );
});

test("unknown component fan-out stays visibly unknown instead of becoming fake damage", () => {
  const plan = buildRadialDamageVisualizationPlan(radialShot({
    withResolvedHullDamage: false,
  }));
  assert.ok(plan);
  assert.equal(plan.outcomeState, "native-unknown");
  assert.deepEqual(plan.outcomes, []);
});

test("non-radial shots do not create a radial presentation plan", () => {
  const result = radialShot();
  result.radial.layers = [];
  assert.equal(buildRadialDamageVisualizationPlan(result), null);
});

test("radial visualization supports a detached origin without penetration layers", () => {
  const result = radialShot();
  result.layers = [];
  result.radial.componentFanout = "drivetrain-resolved";
  result.radial.layers[0].explosionOriginOffsetCm = 0;
  result.damage[0].sourceComponentIndex = 2;
  const plan = buildRadialDamageVisualizationPlan(result, [
    {},
    {},
    { componentId: "hull-query", semanticKind: "armor" },
  ]);
  assert.equal(plan?.origin.componentIndex, 2);
  assert.equal(plan?.origin.componentLabel, "自由爆心");
  assert.equal(plan?.outcomeState, "resolved");
});
