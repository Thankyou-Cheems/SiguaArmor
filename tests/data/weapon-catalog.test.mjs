import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertInventorySnapshot,
  isStrictValidation,
} from "../../tools/validation-profile.mjs";
import { inflatePublicFactionCatalog } from "../../lib/public-faction-catalog.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const STRICT_VALIDATION = isStrictValidation();
const CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "weapon-catalog.json",
);
const VEHICLE_CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "vehicle-catalog.json",
);
const RUNTIME_SOURCE_PATH = path.join(
  ROOT,
  "app",
  "runtime-weapon-source-index.json",
);
const WIKI_VEHICLES_PATH = path.join(
  ROOT,
  "generated",
  "wiki-vehicles.json",
);
const INTERNATIONAL_CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "international-catalog.json",
);
const OBSOLETE_PATHS = [
  "generated/wiki-weapons.json",
  "app/wiki-infantry-weapon-ballistics-index.json",
  "app/infantry-kinetic-weapons.json",
  "app/infantry-explosive-catalog.json",
  "app/infantry-explosive-delivery-bindings.json",
  "app/infantry-weapon-selector-index.json",
  "app/runtime-weapon-selector-index.json",
  "app/runtime-production-explosive-weapons.json",
  "app/runtime-probe-weapon-label-index.json",
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function revision(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function uniqueIds(records, label) {
  const ids = records.map(({ id }) => id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `${label} ids must be unique`,
  );
  assert.ok(
    ids.every((id) => typeof id === "string" && id.length > 0),
    `${label} ids must be non-empty`,
  );
  return new Set(ids);
}

const [
  catalogText,
  vehicleCatalogText,
  runtimeSourceText,
  wikiVehiclesText,
  internationalCatalogText,
] =
  await Promise.all([
    readFile(CATALOG_PATH, "utf8"),
    readFile(VEHICLE_CATALOG_PATH, "utf8"),
    readFile(RUNTIME_SOURCE_PATH, "utf8"),
    readFile(WIKI_VEHICLES_PATH, "utf8"),
    readFile(INTERNATIONAL_CATALOG_PATH, "utf8"),
  ]);
const catalog = JSON.parse(catalogText);
const vehicleCatalog = JSON.parse(vehicleCatalogText);
const runtimeSource = JSON.parse(runtimeSourceText);
const wikiVehicles = JSON.parse(wikiVehiclesText);
const internationalCatalog = JSON.parse(internationalCatalogText);

test("the Editor-refreshed canonical catalog is the complete weapon inventory", () => {
  assert.equal(catalog.schemaVersion, "sigua-weapon-catalog/v2");
  assert.match(catalog.catalogRevision, /^[a-f0-9]{64}$/u);
  assert.equal(
    catalog.catalogRevision,
    revision(
      Object.fromEntries(
        Object.entries(catalog).filter(
          ([key]) => key !== "catalogRevision",
        ),
      ),
    ),
  );
  assert.equal(catalog.audit.referenceClosure, true);
  assert.equal(catalog.audit.noLegacySnapshots, true);
  assert.equal(catalog.audit.noCompatibilityPayloads, true);
  assert.equal(
    catalog.evidenceBoundary.pie,
    "not-run-for-same-name-audit",
  );
  assert.equal(
    catalog.evidenceBoundary.dedicatedServer,
    "native-unknown",
  );

  assertInventorySnapshot(
    assert,
    catalog.counts.wikiFamilies,
    236,
    "Wiki weapon families",
  );
  assertInventorySnapshot(
    assert,
    catalog.counts.wikiConfigurations,
    588,
    "Wiki weapon configurations",
  );
  assertInventorySnapshot(
    assert,
    catalog.counts.wikiTemplates,
    11,
    "Wiki weapon templates",
  );
  assertInventorySnapshot(
    assert,
    catalog.counts.selectorFamilies,
    356,
    "selector families",
  );
  assertInventorySnapshot(
    assert,
    catalog.counts.shippingVariants,
    518,
    "shipping selector variants",
  );
  assertInventorySnapshot(
    assert,
    catalog.counts.exactCurves,
    28,
    "Editor exact curves",
  );
});

test("Kornet keeps native mixed field ownership and point-before-radial order", () => {
  const variant = catalog.selector.variants.find(
    ({ qualifier }) => qualifier === "BMP2M Kornet Desert",
  );
  assert.ok(variant, "BMP-2M Kornet selector variant is missing");
  const directModel = catalog.mechanics.directDamageModels.find(
    ({ id }) => id === variant.directDamageModelId,
  );
  assert.ok(directModel, "BMP-2M Kornet direct model is missing");
  assert.equal(directModel.directImpactDamage, 1800);
  assert.equal(directModel.penetrationMm, 900);
  assert.equal(directModel.traceDistanceAfterPenetrationM, 1.5);
  assert.equal(directModel.weaponTraceDistanceAfterPenetrationM, 10);
  assert.equal(directModel.impactRadialOrder, "point-before-radial");
  assert.deepEqual(variant.editorVerification.nativeRouteEvidence, {
    state: "derived-from-same-build-native-route",
    proofProbeRunId: "bmp2m-kornet-native-field-20260802-r4",
    penetrationTraceDistanceM: 1.5,
    projectileArmorPenetrationMm: 900,
    postPenetrationTraceDistanceM: 10,
    impactRadialOrder: "point-before-radial",
    sameTargetRadialDamageApplied: 0,
    auditSha256:
      "b65368b896c9750bec2f3df1a46a5f3fc96c15991c29ba91646381df5275a660",
  });
  assert.equal(
    variant.editorVerification.evidenceBoundary.dedicatedServer,
    "observed",
  );
});

test("BM-21 preserves its Blueprint secondary-radial impact order", () => {
  const variant = catalog.selector.variants.find(
    ({ familyLabel }) => familyLabel === "9M22U 122 毫米 火箭弹",
  );
  assert.ok(variant, "BM-21 selector variant is missing");
  const directModel = catalog.mechanics.directDamageModels.find(
    ({ id }) => id === variant.directDamageModelId,
  );
  assert.ok(directModel, "BM-21 direct model is missing");
  assert.equal(directModel.directImpactDamage, 1200);
  assert.equal(directModel.penetrationMm, 900);
  assert.equal(directModel.traceDistanceAfterPenetrationM, 100);
  assert.equal(directModel.weaponTraceDistanceAfterPenetrationM, 1);
  assert.equal(
    directModel.impactRadialOrder,
    "secondary-radial-before-point-before-primary-radial",
  );
});

test("GAU-17/A and M134 retain platform-specific projectile radial routes", () => {
  const variants = Object.fromEntries(
    catalog.selector.variants
      .filter(({ qualifier }) =>
        ["M134 Loach Dual", "M134 DoorGun", "M134 Weapon CPV"].includes(
          qualifier,
        ),
      )
      .map((variant) => [variant.qualifier, variant]),
  );
  assert.deepEqual(Object.keys(variants).sort(), [
    "M134 DoorGun",
    "M134 Loach Dual",
    "M134 Weapon CPV",
  ]);
  const loach = variants["M134 Loach Dual"];
  const loachDirect = catalog.mechanics.directDamageModels.find(
    ({ id }) => id === loach.directDamageModelId,
  );
  assert.equal(loach.radialAssetId, "explosive-bbbb88db8414e67c");
  assert.equal(loachDirect.impactRadialOrder, "radial-before-point");
  assert.match(loachDirect.damageType, /SmallArms/iu);
  assert.equal(loach.editorVerification.staticRadialEvidence, null);
  assert.deepEqual(loach.editorVerification.nativeRouteEvidence, {
    state: "derived-from-exact-shared-native-route",
    graphProbeRunId: "gau17-blueprint-route-20260802-r3",
    proofProbeRunId: "infantry-m1a2-ap-native-impact-runtime-order-r29",
    nativeClass: "SQProjectile",
    impactRadialOrder: "radial-before-point",
    minigunActuallyFired: false,
    auditSha256:
      "55fe196d97f7e6bba65f1f0c64522d4c856584e8b08d49e751bb9be516402960",
  });
  for (const qualifier of ["M134 DoorGun", "M134 Weapon CPV"]) {
    const variant = variants[qualifier];
    const directModel = catalog.mechanics.directDamageModels.find(
      ({ id }) => id === variant.directDamageModelId,
    );
    assert.equal(variant.radialAssetId, null, qualifier);
    assert.equal(directModel.impactRadialOrder, "not-applicable", qualifier);
    assert.match(directModel.damageType, /SmallArms/iu);
    assert.equal(variant.editorVerification.staticRadialEvidence, null);
    assert.equal(variant.editorVerification.nativeRouteEvidence, null);
  }
});

test("100 mm HE-fragmentation uses projectile penetration instead of the weapon default", () => {
  const variant = catalog.selector.variants.find(
    ({ qualifier }) => qualifier === "BMD4M 2A70 HEFrag / BMP3M 2A70 HEFrag",
  );
  assert.ok(variant, "BMP-3M 2A70 HE-fragmentation variant is missing");
  const directModel = catalog.mechanics.directDamageModels.find(
    ({ id }) => id === variant.directDamageModelId,
  );
  assert.ok(directModel, "BMP-3M 2A70 direct model is missing");
  assert.equal(directModel.directImpactDamage, 200);
  assert.equal(directModel.penetrationMm, 10);
  assert.equal(
    directModel.traceDistanceAfterPenetrationM,
    0.10000000149011612,
  );
  assert.equal(directModel.weaponTraceDistanceAfterPenetrationM, 2);
  assert.deepEqual(variant.editorVerification.nativeRouteEvidence, {
    state: "derived-from-same-build-native-route",
    proofProbeRunId: "technical-100mm-frag-20260802-a2",
    penetrationTraceDistanceM: 0.10000000149011612,
    projectileArmorPenetrationMm: 10,
    postPenetrationTraceDistanceM: 2,
    referenceArmorMm: 9,
    referenceEffectivePenetrationMm: 8.99857,
    referencePenetrated: false,
    impactRadialOrder: "point-before-radial",
    sameTargetPointDamageApplied: 0,
    sameTargetRadialDamageApplied: 75,
    auditSha256:
      "dfb274efe1dcfceef13f865a7c413d560e8bee962551efa15e638611772a57eb",
  });
  assert.equal(
    variant.editorVerification.evidenceBoundary.pie,
    "isolated-fixed-dedicated-pie",
  );
  assert.equal(
    variant.editorVerification.evidenceBoundary.dedicatedServer,
    "observed",
  );

  const proofVariants = catalog.selector.variants.filter(
    ({ editorVerification }) =>
      editorVerification?.nativeRouteEvidence?.proofProbeRunId ===
      "technical-100mm-frag-20260802-a2",
  );
  assert.deepEqual(
    proofVariants.map(({ qualifier }) => qualifier).sort(),
    [
      "BMD4M 2A70 HEFrag / BMP3M 2A70 HEFrag",
      "ZBD04A 2A70 HEFrag",
    ],
  );
  assert.ok(
    proofVariants.every(({ editorVerification }) =>
      editorVerification.exactAssetPaths.every((assetPath) =>
        assetPath.endsWith("2A70_HEFrag"),
      ),
    ),
    "the 100 mm native proof must not leak to unrelated projectile classes",
  );
});

test("every Wiki configuration is grouped once and linked to canonical variants", () => {
  const configurationKeys = catalog.wiki.configurations.map(
    ({ weaponKey }) => weaponKey,
  );
  assert.equal(
    new Set(configurationKeys).size,
    configurationKeys.length,
  );
  const groupedKeys = catalog.wiki.families.flatMap((family) => {
    assert.equal(
      family.variantCount,
      family.weaponKeys.length,
      family.displayName,
    );
    return family.weaponKeys;
  });
  assert.deepEqual(
    [...groupedKeys].sort(),
    [...configurationKeys].sort(),
  );

  const variantIds = uniqueIds(
    catalog.selector.variants,
    "selector variants",
  );
  for (const configuration of catalog.wiki.configurations) {
    assert.ok(configuration.weaponKey);
    assert.ok(configuration.displayName);
    assert.ok(Array.isArray(configuration.factions));
    assert.ok(configuration.inventoryInfo);
    assert.ok(
      configuration.selectorVariantIds.every((id) =>
        variantIds.has(id),
      ),
      configuration.weaponKey,
    );
    assert.deepEqual(
      catalog.indexes.configurationVariantIds[
        configuration.weaponKey
      ],
      configuration.selectorVariantIds,
    );
  }
});

test("new Editor-only configurations and retained detailed mechanics are present", () => {
  const configurationByKey = new Map(
    catalog.wiki.configurations.map((configuration) => [
      configuration.weaponKey,
      configuration,
    ]),
  );
  for (const weaponKey of [
    "BP_AK74_45rnd",
    "BP_QBZ192_IronSights_Grippod_Suppressor",
    "BP_G3A3_Drum",
    "BP_G3A3_Drum_Optic",
  ]) {
    const configuration = configurationByKey.get(weaponKey);
    assert.ok(configuration, weaponKey);
    assert.ok(
      configuration.editorVerification.rawCandidateCount > 0,
      weaponKey,
    );
    assert.match(
      configuration.editorVerification.mechanicalSemanticRevision,
      /^[a-f0-9]{64}$/u,
    );
  }

  const c6 = configurationByKey.get("BP_C6");
  assert.equal(c6.displayName, "C6");
  assert.equal(c6.weaponInfo.numberOfMags, 8);
  assert.equal(c6.weaponInfo.magSize, 75);
  assert.equal(c6.weaponInfo.muzzleVelocity, 85300);
  assert.equal(c6.weaponInfo.armorPenMM, 7);
  assert.equal(
    c6.weaponInfo.projectileInfo.damageType,
    "BP_SmallArms_DamageType_C",
  );
  assert.equal(c6.staticInfo.hasBipod, true);
  assert.ok(c6.exactCurveIds.length > 0);
  const curveIds = new Set(
    catalog.mechanics.curves.map(({ curveId }) => curveId),
  );
  assert.ok(
    c6.exactCurveIds.every((curveId) => curveIds.has(curveId)),
  );
});

test("selector, damage models, factions, and source evidence form one closed graph", () => {
  const familyIds = uniqueIds(
    catalog.selector.families,
    "selector families",
  );
  const variantIds = uniqueIds(
    catalog.selector.variants,
    "selector variants",
  );
  const directModelIds = uniqueIds(
    catalog.mechanics.directDamageModels,
    "direct models",
  );
  const radialModelIds = uniqueIds(
    catalog.mechanics.radialDamageModels,
    "radial models",
  );
  const radialAssetIds = uniqueIds(
    catalog.mechanics.radialAssets,
    "radial assets",
  );
  const sourceRefIds = uniqueIds(
    catalog.sources.refs,
    "source refs",
  );
  const factionClaimIds = uniqueIds(
    catalog.sources.factionClaims,
    "faction claims",
  );

  for (const family of catalog.selector.families) {
    assert.ok(
      family.variantIds.every((id) => variantIds.has(id)),
      family.id,
    );
  }
  for (const variant of catalog.selector.variants) {
    assert.ok(familyIds.has(variant.familyId), variant.id);
    assert.ok(
      variant.sourceRefIds.every((id) => sourceRefIds.has(id)),
      variant.id,
    );
    assert.ok(
      variant.factionClaimIds.every((id) =>
        factionClaimIds.has(id),
      ),
      variant.id,
    );
    assert.ok(
      variant.directDamageModelId === null ||
        directModelIds.has(variant.directDamageModelId),
      variant.id,
    );
    assert.ok(
      variant.radialAssetId === null ||
        radialAssetIds.has(variant.radialAssetId),
      variant.id,
    );
    if (variant.selectorVisibility === "shipping") {
      assert.ok(variant.factionIds.length > 0, variant.displayLabel);
    }
  }
  for (const asset of catalog.mechanics.radialAssets) {
    assert.ok(
      radialModelIds.has(asset.radialDamageModelId),
      asset.id,
    );
  }
});

test("vehicle equipment selector relations are classified and fail closed", () => {
  const variantIds = new Set(
    catalog.selector.variants.map(({ id }) => id),
  );
  const sourceRefById = new Map(
    catalog.sources.refs.map((sourceRef) => [
      sourceRef.id,
      sourceRef,
    ]),
  );
  const rawNamesByCardId = new Map(
    internationalCatalog.factions.flatMap((faction) =>
      faction.cards.map((card) => [
        card.cardId,
        new Set(card.variants.map(({ rawName }) => rawName)),
      ]),
    ),
  );
  const countsByState = new Map([
    ["exact", 0],
    ["normalized", 0],
    ["non-selector", 0],
    ["evidence-required", 0],
  ]);
  let ambiguous = 0;

  for (const binding of catalog.relations
    .vehicleEquipmentBindings) {
    const relation = binding.selectorRelation;
    assert.ok(countsByState.has(relation.state), binding.id);
    countsByState.set(
      relation.state,
      countsByState.get(relation.state) + 1,
    );
    assert.ok(
      rawNamesByCardId.get(binding.cardId)?.has(binding.rawName),
      binding.id,
    );
    assert.ok(
      relation.sourceRefIds.every((id) => sourceRefById.has(id)),
      binding.id,
    );
    assert.ok(
      relation.candidateVariantIds.every((id) =>
        variantIds.has(id),
      ),
      binding.id,
    );
    if (
      relation.state === "exact" ||
      relation.state === "normalized"
    ) {
      assert.equal(binding.weaponVariantIds.length, 1, binding.id);
      assert.deepEqual(relation.reasonCodes, [], binding.id);
      assert.ok(
        relation.candidateVariantIds.includes(
          binding.weaponVariantIds[0],
        ),
        binding.id,
      );
      for (const sourceRefId of relation.sourceRefIds) {
        const sourceRef = sourceRefById.get(sourceRefId);
        assert.ok(
          (sourceRef.exactCardIds ?? []).includes(binding.cardId) ||
            sourceRef.exactCardId === binding.cardId,
          binding.id,
        );
        assert.ok(
          rawNamesByCardId
            .get(binding.cardId)
            ?.has(sourceRef.sourceRawName),
          binding.id,
        );
      }
      if (relation.state === "exact") {
        assert.deepEqual(
          relation.sourceRawNames,
          [binding.rawName],
          binding.id,
        );
      } else {
        assert.ok(
          relation.sourceRawNames.every(
            (rawName) => rawName !== binding.rawName,
          ),
          binding.id,
        );
      }
    } else {
      assert.deepEqual(binding.weaponVariantIds, [], binding.id);
      assert.ok(relation.reasonCodes.length > 0, binding.id);
    }
    if (relation.reasonCodes.includes("ambiguous-selector-variant")) {
      ambiguous += 1;
    }
  }

  assert.equal(
    Object.hasOwn(
      catalog.counts,
      "unmodeledVehicleEquipmentBindings",
    ),
    false,
  );
  assert.equal(
    catalog.counts.referencedVehicleEquipmentBindings,
    countsByState.get("exact") + countsByState.get("normalized"),
  );
  assert.equal(
    catalog.counts.exactVehicleEquipmentSelectorRelations,
    countsByState.get("exact"),
  );
  assert.equal(
    catalog.counts.normalizedVehicleEquipmentSelectorRelations,
    countsByState.get("normalized"),
  );
  assert.equal(
    catalog.counts.nonSelectorVehicleEquipmentBindings,
    countsByState.get("non-selector"),
  );
  assert.equal(
    catalog.counts.evidenceRequiredVehicleEquipmentBindings,
    countsByState.get("evidence-required"),
  );
  assert.equal(
    catalog.counts.ambiguousVehicleEquipmentSelectorRelations,
    ambiguous,
  );
  assert.equal(catalog.audit.vehicleEquipmentSelectorRelationClosure, true);
  assert.equal(
    catalog.audit.vehicleEquipmentSelectorResolutionUnambiguous,
    true,
  );

  for (const [actual, expected, label] of [
    [catalog.counts.vehicleEquipmentBindings, 1374, "equipment bindings"],
    [
      catalog.counts.referencedVehicleEquipmentBindings,
      706,
      "selector-referenced equipment bindings",
    ],
    [
      catalog.counts.exactVehicleEquipmentSelectorRelations,
      540,
      "exact selector relations",
    ],
    [
      catalog.counts.normalizedVehicleEquipmentSelectorRelations,
      166,
      "normalized selector relations",
    ],
    [
      catalog.counts.nonSelectorVehicleEquipmentBindings,
      493,
      "non-selector equipment bindings",
    ],
    [
      catalog.counts.evidenceRequiredVehicleEquipmentBindings,
      175,
      "evidence-required equipment bindings",
    ],
    [
      catalog.counts.ambiguousVehicleEquipmentSelectorRelations,
      0,
      "ambiguous selector relations",
    ],
  ]) {
    assertInventorySnapshot(assert, actual, expected, label);
  }
});

test("M1151 TOW raw variants resolve to the canonical BGM-71 selector", () => {
  const towVariant = catalog.selector.variants.find(
    (variant) =>
      variant.familyLabel === "BGM-71 TOW" &&
      variant.qualifier === "BGM71TOW MATV",
  );
  assert.ok(towVariant);
  const expectedNormalized = new Set([
    "adf--m1151-tow--td\u0000BP_M1151_Light_TOW_Woodland",
    "baf--m1151-tow--td\u0000BP_M1151_Light_TOW_Woodland",
    "caf--m1151-tow--td\u0000BP_M1151_Light_TOW_Woodland",
    "usa--m1151-tow--td\u0000BP_M1151_Light_TOW_Woodland",
    "usmc--m1151-tow--td\u0000BP_M1151_Light_TOW_Woodland",
  ]);
  const bindings = catalog.relations.vehicleEquipmentBindings.filter(
    (binding) =>
      binding.weaponClass === "BP_BGM71TOW_MATV" &&
      binding.cardId.includes("m1151-tow"),
  );
  assertInventorySnapshot(
    assert,
    bindings.length,
    13,
    "M1151 TOW equipment bindings",
  );
  assert.ok(bindings.length > 0);
  for (const binding of bindings) {
    assert.deepEqual(binding.weaponVariantIds, [towVariant.id], binding.id);
    const key = `${binding.cardId}\u0000${binding.rawName}`;
    if (expectedNormalized.has(key)) {
      assert.equal(binding.selectorRelation.state, "normalized", key);
      assert.deepEqual(binding.selectorRelation.sourceRawNames, [
        "BP_M1151_Light_TOW",
      ]);
      expectedNormalized.delete(key);
    } else {
      assert.equal(binding.selectorRelation.state, "exact", key);
    }
  }
  assert.deepEqual([...expectedNormalized], []);
});

test("vehicle encyclopedia and Runtime Viewer store references instead of weapon copies", async () => {
  const variantIds = new Set(
    catalog.selector.variants.map(({ id }) => id),
  );
  const bindingIds = new Set(
    catalog.relations.vehicleEquipmentBindings.map(({ id }) => id),
  );
  const canonicalBindingById = new Map(
    vehicleCatalog.identities.catalogBindings.map((binding) => [
      binding.id,
      binding,
    ]),
  );
  const vehicleIds = new Set(
    vehicleCatalog.identities.vehicles.map(({ id }) => id),
  );
  const runtimeVehicleIds = new Set(
    vehicleCatalog.runtime.vehicles.map(({ id }) => id),
  );

  assert.equal(wikiVehicles.schemaVersion, "sigua-wiki-vehicles/v3");
  assert.equal(
    wikiVehicles.vehicleCatalogRevision,
    vehicleCatalog.catalogRevision,
  );
  assert.equal(
    wikiVehicles.weaponCatalogRevision,
    catalog.catalogRevision,
  );
  assert.equal(wikiVehicles.summary.catalogVariants, 604);
  assert.equal(wikiVehicles.summary.sourceVehicles, 470);
  assert.equal(wikiVehicles.summary.runtimeVehicles, 471);
  assert.equal(wikiVehicles.items.length, 604);
  assert.equal(
    new Set(
      wikiVehicles.items.map(({ catalogBindingRef }) =>
        catalogBindingRef),
    ).size,
    604,
  );
  for (const vehicle of wikiVehicles.items) {
    const canonicalBinding = canonicalBindingById.get(
      vehicle.catalogBindingRef,
    );
    assert.ok(canonicalBinding, vehicle.catalogBindingRef);
    assert.equal(canonicalBinding.cardId, vehicle.cardId);
    assert.equal(canonicalBinding.rawName, vehicle.rawName);
    assert.equal(canonicalBinding.vehicleRef, vehicle.vehicleRef);
    assert.equal(
      canonicalBinding.runtimeVehicleRef,
      vehicle.runtimeVehicleRef,
    );
    assert.ok(vehicleIds.has(vehicle.vehicleRef), vehicle.vehicleRef);
    assert.ok(
      runtimeVehicleIds.has(vehicle.runtimeVehicleRef),
      vehicle.runtimeVehicleRef,
    );
    assert.ok(
      vehicle.weaponVariantIds.every((id) => variantIds.has(id)),
      vehicle.catalogBindingRef,
    );
    assert.equal(
      "weapons" in vehicle,
      false,
      vehicle.catalogBindingRef,
    );
    assert.equal(
      "vehicleHealth" in vehicle,
      false,
      vehicle.catalogBindingRef,
    );
    assert.equal(
      "details" in vehicle,
      false,
      vehicle.catalogBindingRef,
    );
  }

  for (const relativePath of [
    "public/catalog-data/factions/pla.json",
    "public/catalog-data/factions/usa.json",
    "public/catalog-data/china/factions/shenzhou.json",
  ]) {
    const document = inflatePublicFactionCatalog(
      JSON.parse(
        await readFile(path.join(ROOT, relativePath), "utf8"),
      ),
    );
    for (const record of document.records) {
      const entries = [
        record.data
          ? {
              sourceRawName: record.mapping.selectedRawName,
              data: record.data,
            }
          : null,
        ...record.variants,
      ].filter(Boolean);
      for (const variant of entries) {
        assert.ok(
          variant.data.weaponBindingIds.every((id) =>
            bindingIds.has(id),
          ),
          `${relativePath}/${variant.sourceRawName}`,
        );
        assert.equal("weapons" in variant.data, false);
      }
    }
  }
});

test("the runtime source index references canonical variants and contains no mechanics copy", () => {
  const variantIds = new Set(
    catalog.selector.variants.map(({ id }) => id),
  );
  assert.equal(
    runtimeSource.schemaVersion,
    "sigua-runtime-weapon-source-index/v1",
  );
  assert.equal(
    runtimeSource.catalog.catalogRevision,
    catalog.catalogRevision,
  );
  assert.equal(runtimeSource.counts.bindings, 604);
  assert.equal(runtimeSource.counts.attackSources, 174);
  assert.equal(runtimeSource.counts.attackWeapons, 521);
  for (const source of runtimeSource.attackSources) {
    for (const weapon of source.weapons) {
      assert.ok(variantIds.has(weapon.weaponVariantId));
      assert.equal("ballisticsModel" in weapon, false);
      assert.equal("ballisticsSource" in weapon, false);
    }
  }
});

test("obsolete weapon projections and compatibility files are deleted", async () => {
  for (const relativePath of OBSOLETE_PATHS) {
    await assert.rejects(
      access(path.join(ROOT, ...relativePath.split("/"))),
      { code: "ENOENT" },
      relativePath,
    );
  }
  assert.doesNotMatch(
    catalogText,
    /generated\/wiki-weapons\.json|app\/infantry-|app\/runtime-probe-weapon-label-index/u,
  );
});

test("every visible Wiki family retains a local icon", async () => {
  const iconPaths = [
    ...new Set(
      catalog.wiki.families.map(({ imagePath }) => imagePath),
    ),
  ];
  assertInventorySnapshot(
    assert,
    iconPaths.length,
    205,
    "published weapon icons",
  );
  const pathsToCheck = STRICT_VALIDATION
    ? iconPaths
    : [
        iconPaths[0],
        "/icons/Weapon Icons/m67.webp",
        iconPaths.at(-1),
      ];
  for (const imagePath of new Set(pathsToCheck)) {
    assert.match(
      imagePath,
      /^\/icons\/Weapon Icons\/[^/]+\.webp$/u,
    );
    const bytes = await readFile(
      path.join(ROOT, "public", imagePath.replace(/^\/+/u, "")),
    );
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  }
});
