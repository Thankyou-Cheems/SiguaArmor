import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUNTIME_EXPLOSIVE_CATEGORY_ORDER,
  runtimeExplosiveLayerOrderIsClosed,
  withRuntimeExplosiveSourceBallistics,
} from "../../lib/runtime-explosive-catalog.ts";
import {
  resolveEditorNativeBallistics,
} from "../../lib/editor-native-hit-model.ts";
import {
  VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS,
  explosiveDamageTypeIconKinds,
  vehicleDamageTypeIconKindForPath,
} from "../../lib/vehicle-damage-type-icons.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const [catalogText, adapterSource, viewerSource] =
  await Promise.all([
    readFile(
      path.join(
        ROOT,
        "generated",
        "internal",
        "weapon-catalog.json",
      ),
      "utf8",
    ),
    readFile(
      path.join(ROOT, "app", "runtime-probe-weapon-labels.ts"),
      "utf8",
    ),
    readFile(
      path.join(ROOT, "app", "RuntimeVehicleViewer.tsx"),
      "utf8",
    ),
  ]);
const catalog = JSON.parse(catalogText);

test("canonical radial assets and models replace the standalone explosive catalog", () => {
  assert.equal(catalog.counts.radialAssets, 109);
  assert.equal(catalog.counts.radialDamageModels, 58);
  const modelById = new Map(
    catalog.mechanics.radialDamageModels.map((model) => [
      model.id,
      model,
    ]),
  );
  for (const asset of catalog.mechanics.radialAssets) {
    const model = modelById.get(asset.radialDamageModelId);
    assert.ok(model, asset.id);
    assert.ok(model.layers.length > 0, asset.id);
    assert.equal(
      asset.damageSummary.summedDamage,
      null,
      asset.id,
    );
  }
});

test("all shipping explosive effects retain source-backed icon kinds", () => {
  const shippingRadialAssetIds = new Set(
    catalog.selector.variants
      .filter(
        ({ selectorVisibility, radialAssetId }) =>
          selectorVisibility === "shipping" &&
          radialAssetId !== null,
      )
      .map(({ radialAssetId }) => radialAssetId),
  );
  const modelById = new Map(
    catalog.mechanics.radialDamageModels.map((model) => [
      model.id,
      model,
    ]),
  );
  const observedCategories = new Set();
  for (const asset of catalog.mechanics.radialAssets) {
    if (!shippingRadialAssetIds.has(asset.id)) continue;
    observedCategories.add(asset.category);
    const model = modelById.get(asset.radialDamageModelId);
    for (const layer of model.layers) {
      assert.ok(
        explosiveDamageTypeIconKinds(
          true,
          layer.damageTypeClassPath ?? layer.damageType,
        ).length > 0,
        `${asset.id}/${layer.id}`,
      );
    }
  }
  assert.deepEqual(
    [...observedCategories].sort(
      (left, right) =>
        RUNTIME_EXPLOSIVE_CATEGORY_ORDER.indexOf(left) -
        RUNTIME_EXPLOSIVE_CATEGORY_ORDER.indexOf(right),
    ),
    RUNTIME_EXPLOSIVE_CATEGORY_ORDER.filter((category) =>
      observedCategories.has(category),
    ),
  );
});

test("every exposed non-point direct damage type carries radial damage", () => {
  let radialExpectedVariants = 0;
  let shapedChargeVariants = 0;
  for (const variant of catalog.selector.variants) {
    if (
      variant.selectorVisibility !== "shipping" ||
      variant.directDamageModelId === null
    ) {
      continue;
    }
    const damageTypeKind = vehicleDamageTypeIconKindForPath(
      variant.damageType,
    );
    const knownPointOnly =
      damageTypeKind === "kinetic" ||
      damageTypeKind === "small-arms" ||
      /(?:BP_Melee(?:\.|_|$)|(?:^|[/.])SQDamageType(?:_C)?$)/iu.test(
        variant.damageType,
      );
    const radialExpected =
      damageTypeKind !== null &&
      VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS.includes(
        damageTypeKind,
      );
    assert.ok(
      knownPointOnly || radialExpected,
      `${variant.displayLabel} has an unclassified direct damage type: ${variant.damageType}`,
    );
    if (variant.penetrationKind === "shaped-charge") {
      shapedChargeVariants += 1;
      assert.equal(
        radialExpected,
        true,
        `${variant.displayLabel} shaped-charge damage type`,
      );
    }
    if (!radialExpected) continue;
    radialExpectedVariants += 1;
    assert.ok(
      variant.radialAssetId,
      `${variant.displayLabel} has no radial damage asset`,
    );
  }
  assert.ok(radialExpectedVariants > 0);
  assert.ok(shapedChargeVariants > 0);
});

test("closed and unknown multi-layer ordering remain distinguishable", () => {
  const modelById = new Map(
    catalog.mechanics.radialDamageModels.map((model) => [
      model.id,
      model,
    ]),
  );
  const multiLayerAssets = catalog.mechanics.radialAssets
    .filter(({ selectorVisibility }) => selectorVisibility === "shipping")
    .map((asset) => ({
      ...asset,
      layers: modelById.get(asset.radialDamageModelId).layers,
      layerOrderEvidence:
        modelById.get(asset.radialDamageModelId).layerOrderEvidence,
    }))
    .filter(({ layers }) => layers.length > 1);
  assert.ok(multiLayerAssets.length > 0);
  assert.ok(
    multiLayerAssets.some(runtimeExplosiveLayerOrderIsClosed),
  );
  assert.ok(
    multiLayerAssets.some(
      (source) => !runtimeExplosiveLayerOrderIsClosed(source),
    ),
  );
});

test("canonical radial layers complete every exposed direct ballistic profile", () => {
  const radialAssetById = new Map(
    catalog.mechanics.radialAssets.map((asset) => [asset.id, asset]),
  );
  const radialModelById = new Map(
    catalog.mechanics.radialDamageModels.map((model) => [model.id, model]),
  );
  const ballisticProfileById = new Map(
    catalog.mechanics.ballisticProfiles.map((profile) => [profile.id, profile]),
  );
  let completedProfiles = 0;
  let shapedChargeProfiles = 0;
  let profilesMissingInlineRadialFields = 0;
  for (const variant of catalog.selector.variants) {
    if (
      variant.selectorVisibility !== "shipping" ||
      variant.radialAssetId === null ||
      variant.ballisticProfileIds.length === 0
    ) {
      continue;
    }
    const asset = radialAssetById.get(variant.radialAssetId);
    assert.ok(asset, variant.id);
    const radialModel = radialModelById.get(asset.radialDamageModelId);
    assert.ok(radialModel, asset.id);
    const source = {
      id: asset.id,
      layerOrderEvidence: radialModel.layerOrderEvidence,
      layers: radialModel.layers.map((layer) => ({
        id: layer.id,
        label: layer.label,
        shortLabel: layer.shortLabel ?? layer.label,
        baseDamage: layer.baseDamage,
        minimumDamage: layer.minimumDamage,
        killZoneRadiusMeters: layer.killZoneRadiusMeters ?? 0,
        innerRadiusMeters: layer.innerRadiusMeters,
        outerRadiusMeters: layer.outerRadiusMeters,
        falloff: layer.falloff ?? 1,
        damageType: layer.damageType,
        damageTypeClassPath: layer.damageTypeClassPath ?? null,
        originNormalOffsetMeters: layer.originNormalOffsetMeters ?? 0,
        onlyDamageMeshes: layer.onlyDamageMeshes ?? false,
      })),
    };
    for (const profileId of variant.ballisticProfileIds) {
      const profile = ballisticProfileById.get(profileId);
      assert.ok(profile, `${variant.id}/${profileId}`);
      const before = resolveEditorNativeBallistics(profile.model, 0, 0);
      if (before.explosiveLayers.length === 0) {
        profilesMissingInlineRadialFields += 1;
      }
      const completedModel = withRuntimeExplosiveSourceBallistics(
        profile.model,
        0,
        source,
      );
      const completed = resolveEditorNativeBallistics(
        completedModel,
        0,
        0,
      );
      assert.equal(completed.isExplosive, true, variant.displayLabel);
      assert.equal(
        completed.explosiveLayers.length,
        radialModel.layers.length,
        variant.displayLabel,
      );
      for (const [layerIndex, expected] of radialModel.layers.entries()) {
        const actual = completed.explosiveLayers[layerIndex];
        assert.equal(actual.layerId, expected.id, variant.displayLabel);
        assert.equal(actual.baseDamage, expected.baseDamage, variant.displayLabel);
        assert.equal(
          actual.outerRadiusCm,
          expected.outerRadiusMeters * 100,
          variant.displayLabel,
        );
        assert.equal(
          actual.damageTypePath,
          expected.damageTypeClassPath ?? expected.damageType,
          variant.displayLabel,
        );
      }
      completedProfiles += 1;
      if (variant.penetrationKind === "shaped-charge") {
        shapedChargeProfiles += 1;
      }
    }
  }
  assert.ok(completedProfiles > 0);
  assert.ok(shapedChargeProfiles > 0);
  assert.ok(
    profilesMissingInlineRadialFields > 0,
    "fixture no longer exercises split direct/radial mechanics",
  );
});

test("the Runtime Viewer creates explosive attack sources from canonical variants", () => {
  assert.match(
    adapterSource,
    /const runtimeExplosiveCatalog = \{/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogShippingVariants/u,
  );
  assert.match(
    adapterSource,
    /weaponCatalogRadialModelForAsset/u,
  );
  assert.match(
    adapterSource,
    /withRuntimeExplosiveSourceBallistics\(\s*ballisticProfile\.model,\s*weapon\.ballisticsWeaponIndex,\s*radialSource,\s*directModel\?\.impactRadialOrder === "not-applicable"\s*\?\s*undefined\s*:\s*directModel\?\.impactRadialOrder,\s*\)/u,
  );
  assert.match(
    adapterSource,
    /sourceKind: "explosive-catalog"/u,
  );
  assert.match(
    viewerSource,
    /搜索全部武器或弹种/u,
  );
  assert.doesNotMatch(
    adapterSource,
    /runtime-production-explosive-weapons|infantry-explosive-catalog\.json/u,
  );
});
