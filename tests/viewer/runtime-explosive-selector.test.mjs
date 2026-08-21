import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
} from "../../lib/runtime-explosive-catalog.ts";
import { resolveEditorNativeBallistics } from "../../lib/editor-native-hit-model.ts";
import {
  composeCatalogVariantBallisticsModel,
  preferredBallisticsIdForExactCard,
  runtimeAttackDistanceControl,
  runtimeAttackTargetDistanceLimitM,
} from "../../app/runtime-attack-ballistics-model.ts";

const [adapterSource, ballisticsModelSource, viewerSource, catalogIndexText] = await Promise.all([
  readFile(new URL("../../app/runtime-probe-weapon-labels.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/runtime-attack-ballistics-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../generated/catalog-index.json", import.meta.url), "utf8"),
]);
const catalogIndex = JSON.parse(catalogIndexText);

test("global weapon options preserve exact penetration and damage falloff curves", () => {
  const model = composeCatalogVariantBallisticsModel({
    variantId: "dtc10",
    directModel: {
      damageType: "BP_Kinetic_DamageType_C",
      directImpactDamage: 8000,
      penetrationMm: 800,
      traceDistanceAfterPenetrationM: 50,
      weaponTraceDistanceAfterPenetrationM: 50,
      impactRadialOrder: "not-applicable",
    },
    ballisticProfile: {
      model: {
        healthPools: [], components: [], surfaceProfiles: [],
        weapons: [{
          weaponId: "profile-weapon", role: "profile",
          projectileIndex: { state: "derived", value: 0 },
          armorPenetrationDepthMm: { state: "observed", value: 800 },
          armorPenetrationCurveIndex: { state: "derived", value: 0 },
          damageFalloffCurveIndex: { state: "derived", value: 1 },
          maxDamage: { state: "observed", value: 60 },
          minDamage: { state: "observed", value: 10 },
          traceDistanceAfterPenetrationMeters: { state: "observed", value: 50 },
        }],
        projectiles: [{
          projectileId: "profile-projectile", role: "profile",
          damageTypePath: { state: "observed", value: "BP_Kinetic_DamageType_C" },
          armorPenetrationDepthMm: { state: "observed", value: 0 },
          impactDamage: { state: "absent", value: null },
          isExplosive: { state: "observed", value: false },
          traceDistanceAfterPenetrationMeters: { state: "observed", value: 0 },
        }],
        curves: [
          { curveId: "penetration", inputUnit: "meters", outputUnit: "millimeters", keys: { state: "observed", value: [
            { time: 0, value: 800 }, { time: 3000, value: 500 },
          ] } },
          { curveId: "damage", inputUnit: "unreal-centimeters", outputUnit: "damage", keys: { state: "observed", value: [
            { time: 10000, value: 8000 }, { time: 400000, value: 1000 },
          ] } },
        ],
      },
    },
    configurationCurves: [],
    radialSource: null,
  });

  const atZero = resolveEditorNativeBallistics(model, 0, 0);
  const atFourKilometers = resolveEditorNativeBallistics(model, 0, 4000);
  assert.deepEqual(
    [atZero.penetrationAtRangeMm, atZero.impactDamageAtRange],
    [800, 8000],
  );
  assert.deepEqual(
    [atFourKilometers.penetrationAtRangeMm, atFourKilometers.impactDamageAtRange],
    [500, 1000],
  );
});

test("global vehicle sources resolve the selected card's exact ballistic profile", () => {
  const variant = {
    ballisticsIds: ["ballistics-bmd4", "ballistics-bmp2"],
  };
  const sourceRefs = [
    { id: "bmd4", exactCardIds: ["vdv--bmd-4m--ifv"], ballisticsId: "ballistics-bmd4" },
    { id: "bmp2", exactCardIds: ["afu--bmp-2--ifv"], ballisticsId: "ballistics-bmp2" },
  ];
  assert.equal(
    preferredBallisticsIdForExactCard(variant, sourceRefs, "afu--bmp-2--ifv"),
    "ballistics-bmp2",
  );
  assert.equal(
    preferredBallisticsIdForExactCard(variant, sourceRefs, "unknown--vehicle"),
    null,
  );
});

test("distance control disables weapons with no damage or penetration decay", () => {
  const model = composeCatalogVariantBallisticsModel({
    variantId: "m830a1",
    directModel: {
      damageType: "BP_BasicHeatDamageType_C",
      directImpactDamage: 1900,
      penetrationMm: 400,
      traceDistanceAfterPenetrationM: 2,
      weaponTraceDistanceAfterPenetrationM: 2,
      impactRadialOrder: "point-before-radial",
    },
    ballisticProfile: null,
    configurationCurves: [],
    radialSource: null,
  });

  assert.deepEqual(runtimeAttackDistanceControl(model, 0), {
    damageDecay: "none",
    penetrationDecay: "none",
    enabled: false,
    maxDistanceM: 0,
  });
  assert.equal(runtimeAttackTargetDistanceLimitM(model, 0), 0);
  assert.equal(runtimeAttackTargetDistanceLimitM(model, 1), 0);
  assert.deepEqual(
    [
      resolveEditorNativeBallistics(model, 0, 0).penetrationAtRangeMm,
      resolveEditorNativeBallistics(model, 0, 4000).penetrationAtRangeMm,
    ],
    [400, 400],
    "constant weapons remain truthful when the distance control is disabled",
  );
});

test("a damage-only curve stays adjustable and takes priority over static projectile damage", () => {
  const model = composeCatalogVariantBallisticsModel({
    variantId: "ak74",
    directModel: {
      damageType: "BP_Kinetic_DamageType_C",
      directImpactDamage: 60,
      penetrationMm: 5,
      traceDistanceAfterPenetrationM: 1,
      weaponTraceDistanceAfterPenetrationM: 1,
      impactRadialOrder: "not-applicable",
    },
    ballisticProfile: null,
    configurationCurves: [{
      curveId: "ak74-damage",
      inputUnit: "unreal-centimeters",
      outputUnit: "damage",
      keys: { state: "observed", value: [
        { time: 0, value: 60 },
        { time: 45000, value: 35 },
      ] },
    }],
    radialSource: null,
  });

  assert.deepEqual(runtimeAttackDistanceControl(model, 0), {
    damageDecay: "available",
    penetrationDecay: "none",
    enabled: true,
    maxDistanceM: 450,
  });
  assert.equal(resolveEditorNativeBallistics(model, 0, 450).impactDamageAtRange, 35);
  assert.equal(resolveEditorNativeBallistics(model, 0, 450).penetrationAtRangeMm, 5);
});

test("a penetration-only curve stays adjustable and reports constant damage separately", () => {
  const model = composeCatalogVariantBallisticsModel({
    variantId: "penetration-only",
    directModel: {
      damageType: "BP_Kinetic_DamageType_C",
      directImpactDamage: 100,
      penetrationMm: 50,
      traceDistanceAfterPenetrationM: 1,
      weaponTraceDistanceAfterPenetrationM: 1,
      impactRadialOrder: "not-applicable",
    },
    ballisticProfile: null,
    configurationCurves: [{
      curveId: "penetration-only",
      inputUnit: "meters",
      outputUnit: "millimeters",
      keys: { state: "observed", value: [
        { time: 0, value: 50 },
        { time: 1000, value: 20 },
      ] },
    }],
    radialSource: null,
  });

  assert.deepEqual(runtimeAttackDistanceControl(model, 0), {
    damageDecay: "none",
    penetrationDecay: "available",
    enabled: true,
    maxDistanceM: 1000,
  });
  assert.equal(resolveEditorNativeBallistics(model, 0, 1000).penetrationAtRangeMm, 20);
  assert.equal(resolveEditorNativeBallistics(model, 0, 1000).impactDamageAtRange, 100);
});

test("a curve that reaches zero closes the distance control at its final key", () => {
  const model = composeCatalogVariantBallisticsModel({
    variantId: "zero-at-two-kilometers",
    directModel: {
      damageType: "BP_Kinetic_DamageType_C",
      directImpactDamage: 300,
      penetrationMm: 95,
      traceDistanceAfterPenetrationM: 1,
      weaponTraceDistanceAfterPenetrationM: 1,
      impactRadialOrder: "not-applicable",
    },
    ballisticProfile: null,
    configurationCurves: [{
      curveId: "penetration-to-zero",
      inputUnit: "meters",
      outputUnit: "millimeters",
      keys: { state: "observed", value: [
        { time: 0, value: 95 },
        { time: 1000, value: 40 },
        { time: 2000, value: 0 },
      ] },
    }],
    radialSource: null,
  });

  assert.equal(runtimeAttackTargetDistanceLimitM(model, 0), 2000);
  assert.equal(resolveEditorNativeBallistics(model, 0, 2000).penetrationAtRangeMm, 0);
  assert.equal(
    resolveEditorNativeBallistics(model, 0, 2500).penetrationAtRangeMm,
    0,
    "the final curve value remains closed even if a stale URL supplies a longer range",
  );
});

test("the slider explains each missing decay type and the fully constant state", () => {
  assert.match(viewerSource, /伤害无距离衰减/u);
  assert.match(viewerSource, /穿深无距离衰减/u);
  assert.match(viewerSource, /当前武器无伤害\/穿深距离衰减/u);
  assert.match(viewerSource, /runtimeAttackDistanceControl/u);
  assert.match(
    viewerSource,
    /runtimeAttackDistanceControl\(\s*selectedAttackWeapon\.ballisticsModel,\s*selectedAttackWeapon\.ballisticsWeaponIndex/u,
  );
});

test("explosive identities and evidence state stay explicit", () => {
  assert.equal(
    runtimeExplosiveCanonicalName("Class'/Game/Weapons/BP_Test.BP_Test_C'"),
    "BP_Test",
  );
  assert.equal(
    runtimeExplosiveLayerOrderIsClosed({ layerOrderEvidence: "editor-verified" }),
    true,
  );
  assert.equal(
    runtimeExplosiveLayerOrderIsClosed({ layerOrderEvidence: "native-unknown" }),
    false,
  );
});

test("the Runtime Viewer builds explosive choices from the Wiki weapon catalog", () => {
  assert.match(adapterSource, /const runtimeExplosiveCatalog = \{/u);
  assert.match(adapterSource, /weaponCatalogShippingVariants/u);
  assert.match(adapterSource, /weaponCatalogRadialModelForAsset/u);
  assert.match(adapterSource, /explosiveKillZoneRadiusCm/u);
  assert.match(adapterSource, /killZoneRadiusCm/u);
  assert.match(ballisticsModelSource, /explosiveKillZoneRadiusCm/u);
  assert.match(ballisticsModelSource, /killZoneRadiusCm/u);
  assert.match(adapterSource, /sourceKind: "explosive-catalog"/u);
  assert.match(viewerSource, /搜索全部武器或弹种/u);
  assert.doesNotMatch(
    adapterSource,
    /generated\/internal|runtime-production-explosive-weapons|infantry-explosive-catalog\.json/u,
  );
});

test("vehicle attack sources join Wiki weapons through the exact Wiki source card", () => {
  const ztz99 = catalogIndex.records.find(
    ({ promoEntryId }) => promoEntryId === "pla--ztz99a--mbt",
  );
  assert.ok(ztz99, "ZTZ99A product mapping is missing");
  assert.notEqual(
    ztz99.promoEntryId,
    ztz99.variants[0].cardId,
    "the regression fixture must distinguish product and presentation ids",
  );
  assert.match(
    adapterSource,
    /const wikiSourceCardId = record\.wikiSourceCardId \?\? record\.promoEntryId/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogVariantsForExactVehicle\(\s*wikiSourceCardId,\s*variant\.sourceRawName,\s*\)/u,
  );
  assert.match(
    adapterSource,
    /runtimeCatalogAttackSourceWeapon\(\s*variant,\s*wikiSourceCardId,\s*"vehicle",\s*\)/u,
  );
  assert.match(adapterSource, /weapon\.exactCardIds\.includes\(wikiSourceCardId\)/u);
  const usmcFa18 = catalogIndex.records.find(
    ({ promoEntryId }) => promoEntryId === "usmc--fa18--cas",
  );
  assert.equal(usmcFa18?.wikiSourceCardId, "adf--fa18--cas");
});

test("product vehicle ids remain attack-source aliases for card selection and direct routes", () => {
  assert.ok(
    adapterSource.includes("attackSourceById.set(record.promoEntryId, source);"),
    "the product id emitted by card navigation must resolve to its exact vehicle attack source",
  );
});

test("vehicle weapon distance keeps the exact Wiki ballistic profile", () => {
  assert.match(adapterSource, /weaponCatalogBallisticProfileForVariant/u);
  assert.match(
    ballisticsModelSource,
    /profileWeapon\.armorPenetrationCurveIndex/u,
  );
  assert.match(
    ballisticsModelSource,
    /profileWeapon\.damageFalloffCurveIndex/u,
  );
  assert.match(ballisticsModelSource, /\.\.\.ballisticProfile!\.model\.curves/u);
});
