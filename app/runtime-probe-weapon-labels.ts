import { weaponDisplayNameZh } from "../lib/weapon-display-name.ts";
import type {
  RuntimeWeaponLabel,
  RuntimeWeaponLabelMatchBasis,
} from "../lib/runtime-weapon-label-options.ts";
import {
  editorNativeDamageWeaponIndices,
  type EditorNativeModel,
} from "../lib/editor-native-hit-model.ts";
import {
  distinctInfantryHitAnalysisWeaponGroups,
  infantryHitAnalysisWeaponGroupLabels,
} from "../lib/infantry-hit-analysis-weapons.ts";
import {
  RUNTIME_EXPLOSIVE_CATALOG_SHA256,
  RUNTIME_EXPLOSIVE_CATEGORY_ORDER,
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
  validateRuntimeExplosiveCatalog,
  type RuntimeExplosiveCategory,
  type RuntimeExplosiveSource,
} from "../lib/runtime-explosive-catalog.ts";
import { runtimeHitRecordReferenceForVariant } from "./runtime-probe-preview-data";
import {
  buildRuntimeAttackSourceShareSlug,
  normalizeRuntimeAttackSourceShareSlug,
} from "../lib/runtime-attack-source-share.mjs";
import explosiveCatalogJson from "./infantry-explosive-catalog.json";
import productionExplosiveWeaponsJson from "./runtime-production-explosive-weapons.json";
import wikiInfantryWeaponIndexJson from "./wiki-infantry-weapon-ballistics-index.json";
import weaponLabelIndexJson from "./runtime-probe-weapon-label-index.json";

export type {
  RuntimeWeaponLabel,
  RuntimeWeaponLabelMatchBasis,
} from "../lib/runtime-weapon-label-options.ts";

interface RuntimeWeaponLabelRecord {
  weaponIndex: number;
  weaponId: string;
  runtimeAssetPath: string;
  gunName: string;
  displayName: string;
  projectileName: string | null;
  matchBasis: RuntimeWeaponLabelMatchBasis;
}

interface RuntimeWeaponLabelBinding {
  bindingKey: string;
  cardId: string;
  rawName: string;
  recordSha256: string;
  weapons: RuntimeWeaponLabelRecord[];
  unmatchedWeaponIndices: number[];
}

interface RuntimeAttackSourceRecord {
  cardId: string;
  cardIds: string[];
  displayName: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  type: string;
  types: string[];
  canonicalRawName: string;
  catalogSelectedRawName: string;
  canonicalSelectionBasis:
    | "max-distinct-direct-encyclopedia-weapons-then-card-id-within-faction-display-name"
    | "wiki-infantry-configuration-order"
    | "editor-explosive-catalog-shipping-order";
  variantRawNames: string[];
  vehicleId: string;
  recordUrl: string;
  recordSha256: string;
  recordBytes: number;
  directWeaponCount: number;
  runtimeBackedWeaponCount: number;
  catalogCompletedWeaponCount: number;
  baseCurveFallbackWeaponCount: number;
  weapons: RuntimeAttackSourceWeaponRecord[];
}

interface RuntimeAttackBallisticsSource {
  kind:
    | "exact-runtime-record"
    | "encyclopedia-weapon-closure"
    | "editor-explosive-catalog"
    | "editor-production-explosive";
  catalogFingerprintSha256: string;
  runtimeRecordSha256?: string;
  runtimeWeaponIndex?: number;
  projectileEvidence: {
    recordSha256: string;
    projectileIndex: number;
    assetPath: string;
  } | null;
  curveEvidence: {
    role: "armor-penetration" | "impact-damage";
    recordSha256: string;
    curveIndex: number;
    assetPath: string;
  }[];
  baseCurveFallbacks: {
    role: "armor-penetration" | "impact-damage";
    assetName: string;
  }[];
}

interface RuntimeAttackSourceWeaponRecord
  extends Omit<RuntimeWeaponLabelRecord, "runtimeAssetPath"> {
  runtimeAssetPath: string | null;
  ballisticsId: string;
  ballisticsWeaponIndex: 0;
  ballisticsModel: EditorNativeModel;
  ballisticsSource: RuntimeAttackBallisticsSource;
  sourceCardId: string;
  sourceRawName: string;
  sourceVehicleId: string;
  sourceRecordUrl: string;
  sourceRecordSha256: string;
  sourceRecordBytes: number;
}

export const INFANTRY_WEAPON_CATEGORIES = [
  {
    id: "anti-armor",
    label: "反装甲",
    description: "专用反装甲武器与弹药",
  },
  {
    id: "high-penetration",
    label: "高穿弹",
    description: "高穿深弹药，可对轻装甲目标造成威胁",
  },
  {
    id: "light-weapons",
    label: "轻武器",
    description: "可对补给载具等轻装车辆造成有限威胁",
  },
  {
    id: "low-penetration",
    label: "低穿武器",
    description: "穿深较低，几乎无法击穿载具",
  },
] as const;

export type InfantryWeaponCategoryId =
  (typeof INFANTRY_WEAPON_CATEGORIES)[number]["id"];

export function infantryWeaponCategoryForPenetration(
  penetrationMm: number,
): InfantryWeaponCategoryId {
  if (penetrationMm >= 300) return "anti-armor";
  if (penetrationMm >= 8) return "high-penetration";
  if (penetrationMm > 2) return "light-weapons";
  return "low-penetration";
}

export interface RuntimeAttackSourceWeapon extends RuntimeAttackSourceWeaponRecord {
  displayNameZh: string;
  displayNameEnglish: string;
  sourceKind: "vehicle" | "wiki-infantry" | "explosive-catalog";
  infantryCategory?: InfantryWeaponCategoryId;
  explosiveCategory?: RuntimeExplosiveCategory;
  explosiveCategoryLabel?: string;
  explosiveLayerOrderEvidence?: string;
  explosiveLayerOrderClosed?: boolean;
  explosiveLayerCount?: number;
  directFireRoute: boolean;
  searchAliases?: string[];
}

export interface RuntimeAttackSource extends Omit<RuntimeAttackSourceRecord, "weapons"> {
  shareSlug: string;
  sourceKind: "vehicle" | "wiki-infantry" | "explosive-catalog";
  weapons: RuntimeAttackSourceWeapon[];
}

interface WikiInfantryWeaponBallisticsRecord {
  weaponKey: string;
  displayName: string;
  groupDisplayName: string;
  groupFullName: string;
  type: string;
  factions: string[];
  projectileName: string | null;
  muzzleVelocityMps: number;
  maxDistanceM: number;
  penetrationMm: number;
  traceDistanceAfterPenetrationM: number;
  directImpactDamage: number;
  damageTypePath: string;
  isExplosive: boolean;
  damageCurveName: string | null;
  searchAliases: string[];
  ballisticsId: string;
}

interface WikiInfantryWeaponBallisticsIndex {
  schemaVersion: "sigua-infantry-weapon-ballistics/v1";
  dataRevision: string;
  sourceDataRevision: string;
  damageCurveSampleIntervalM: number;
  damageCurves: Record<string, number[]>;
  counts: {
    sourceConfigurations: number;
    penetratingConfigurations: number;
    radialOnlyConfigurations: number;
  };
  weapons: WikiInfantryWeaponBallisticsRecord[];
}

interface RuntimeProductionExplosiveWeaponRecord {
  id: string;
  label: string;
  groupLabel: string;
  groupLabels: string[];
  type: string;
  platformKind: "vehicle" | "emplaced" | "airstrike";
  penetrationKind: "kinetic" | "shaped-charge";
  projectileName: string;
  projectileCanonicalName: string;
  directImpactDamage: number;
  penetrationMm: number;
  traceDistanceAfterPenetrationM: number;
  maxDistanceM: number;
  damageType: string;
  radialExplosiveId: string;
  impactRadialOrder: string;
  ballisticsIds: string[];
  factions: string[];
  sourceCardIds: string[];
  sourceLabels: string[];
  runtimeAssetPaths: string[];
  configurationCount: number;
  searchText: string;
}

interface RuntimeProductionExplosiveDelivery {
  id: string;
  kind: "commander-airstrike" | "vehicle-mounted" | "emplaced";
  factionId: string;
  cardIds: string[];
  platformName: string;
  platformType: string;
  actorClass: string;
  actorAssetPath: string;
  weaponClass: string;
  weaponAssetPath: string;
  gameplayAuthorityPath: string;
}

interface RuntimeProductionExplosiveDeliveryBinding {
  explosiveId: string;
  canonicalName: string;
  projectileClass: string;
  category: "vehicle-cannon" | "vehicle-rocket" | "guided-missile";
  deliveryKinds: RuntimeProductionExplosiveDelivery["kind"][];
  factions: string[];
  cardIds: string[];
  deliveries: RuntimeProductionExplosiveDelivery[];
  searchText: string;
}

interface RuntimeProductionExplosiveWeaponIndex {
  schemaVersion: "runtime-production-explosive-weapons/v1";
  dataRevision: string;
  source: {
    productionFilter: string;
    kineticWeaponsSha256: string;
    explosiveDeliveryBindingsSha256: string;
    explosiveCatalogSha256: string;
    targetRuntimeWeaponLabelIndexSha256: string;
    targetWikiWeaponBallisticsIndexSha256: string;
  };
  counts: {
    productionExplosiveSources: number;
    directFireWeapons: number;
    deliveryBindings: number;
    deliveries: number;
  };
  productionExplosiveIds: string[];
  directFireWeapons: RuntimeProductionExplosiveWeaponRecord[];
  deliveryBindings: RuntimeProductionExplosiveDeliveryBinding[];
}

interface RuntimeWeaponLabelIndex {
  schemaVersion: "runtime-hit-weapon-label-index/v4";
  counts: {
    bindings: number;
    vehicleCards: number;
    runtimeWeapons: number;
    matchedWeapons: number;
    exactAssetMatches: number;
    exactFingerprintMatches: number;
    unmatchedWeapons: number;
    encyclopediaDirectWeapons: number;
    attackSources: number;
    attackWeapons: number;
    runtimeBackedAttackWeapons: number;
    catalogCompletedAttackWeapons: number;
    baseCurveFallbackAttackWeapons: number;
    multiRecordAttackSources: number;
    armedVehicleCards: number;
    excludedNoDirectWeaponCards: number;
    collapsedVariantBindings: number;
    collapsedSameNameAttackCards: number;
  };
  attackSources: RuntimeAttackSourceRecord[];
  bindings: RuntimeWeaponLabelBinding[];
}

const wikiInfantryWeaponIndex =
  wikiInfantryWeaponIndexJson as unknown as WikiInfantryWeaponBallisticsIndex;
const runtimeExplosiveCatalog = validateRuntimeExplosiveCatalog(
  explosiveCatalogJson,
);
const runtimeProductionExplosiveWeaponIndex =
  productionExplosiveWeaponsJson as unknown as RuntimeProductionExplosiveWeaponIndex;
const runtimeExplosiveSourceByProjectileName =
  new Map<string, RuntimeExplosiveSource>();
for (const source of runtimeExplosiveCatalog.sources) {
  for (const candidate of [
    source.canonicalName,
    source.assetPath,
    source.generatedClassPath,
    ...source.variantAssetPaths,
  ]) {
    const canonicalName = runtimeExplosiveCanonicalName(candidate);
    if (!canonicalName) continue;
    const existing = runtimeExplosiveSourceByProjectileName.get(canonicalName);
    if (existing && existing.id !== source.id) {
      throw new Error(
        `Explosive projectile ${canonicalName} maps to both ${existing.id} and ${source.id}`,
      );
    }
    runtimeExplosiveSourceByProjectileName.set(canonicalName, source);
  }
}
if (
  runtimeProductionExplosiveWeaponIndex.schemaVersion !==
    "runtime-production-explosive-weapons/v1" ||
  runtimeProductionExplosiveWeaponIndex.source.productionFilter !==
    "catalogShipping=true; catalogDebug=false; selectorVisibility=shipping; directEvidenceKind=exact-projectile-cdo; deliveryState=bound" ||
  runtimeProductionExplosiveWeaponIndex.source.explosiveCatalogSha256 !==
    RUNTIME_EXPLOSIVE_CATALOG_SHA256 ||
  !/^[0-9a-f]{64}$/u.test(
    runtimeProductionExplosiveWeaponIndex.dataRevision,
  ) ||
  runtimeProductionExplosiveWeaponIndex.counts.directFireWeapons !==
    runtimeProductionExplosiveWeaponIndex.directFireWeapons.length ||
  runtimeProductionExplosiveWeaponIndex.counts.productionExplosiveSources !==
    runtimeProductionExplosiveWeaponIndex.productionExplosiveIds.length ||
  runtimeProductionExplosiveWeaponIndex.counts.deliveryBindings !==
    runtimeProductionExplosiveWeaponIndex.deliveryBindings.length ||
  runtimeProductionExplosiveWeaponIndex.counts.deliveries !==
    runtimeProductionExplosiveWeaponIndex.deliveryBindings.reduce(
      (total, binding) => total + binding.deliveries.length,
      0,
    ) ||
  runtimeProductionExplosiveWeaponIndex.counts.directFireWeapons !== 8
) {
  throw new Error("Invalid production explosive weapon index");
}
const runtimeProductionExplosiveIds = new Set(
  runtimeProductionExplosiveWeaponIndex.productionExplosiveIds,
);
if (
  runtimeProductionExplosiveIds.size !==
    runtimeProductionExplosiveWeaponIndex.productionExplosiveIds.length ||
  runtimeProductionExplosiveWeaponIndex.productionExplosiveIds.some(
    (id) =>
      !runtimeExplosiveCatalog.sources.some(
        (source) => source.id === id && source.shipping,
      ),
  )
) {
  throw new Error("Invalid production explosive source allowlist");
}
const runtimeProductionExplosiveDeliveryByProjectileName =
  new Map<string, RuntimeProductionExplosiveDeliveryBinding>();
for (const binding of runtimeProductionExplosiveWeaponIndex.deliveryBindings) {
  const canonicalName = runtimeExplosiveCanonicalName(binding.canonicalName);
  if (
    !canonicalName ||
    runtimeProductionExplosiveDeliveryByProjectileName.has(canonicalName) ||
    binding.deliveries.length === 0 ||
    binding.deliveryKinds.length === 0 ||
    binding.factions.length === 0 ||
    "shipping" in binding ||
    "state" in binding ||
    /(?:generic|test|original|nosound)/iu.test(binding.canonicalName)
  ) {
    throw new Error(
      `Invalid production explosive delivery: ${binding.canonicalName}`,
    );
  }
  runtimeProductionExplosiveDeliveryByProjectileName.set(
    canonicalName,
    binding,
  );
}
const runtimeProductionExplosiveWeaponByProjectileName =
  new Map<string, RuntimeProductionExplosiveWeaponRecord>();
for (
  const record of runtimeProductionExplosiveWeaponIndex.directFireWeapons
) {
  const canonicalName = runtimeExplosiveCanonicalName(
    record.projectileCanonicalName,
  );
  const radialSource = runtimeExplosiveCatalog.sources.find(
    ({ id }) => id === record.radialExplosiveId,
  );
  const delivery =
    runtimeProductionExplosiveDeliveryByProjectileName.get(canonicalName);
  if (
    !canonicalName ||
    runtimeProductionExplosiveWeaponByProjectileName.has(canonicalName) ||
    !radialSource?.shipping ||
    !runtimeProductionExplosiveIds.has(record.radialExplosiveId) ||
    radialSource.id !== delivery?.explosiveId ||
    !Number.isFinite(record.directImpactDamage) ||
    record.directImpactDamage < 0 ||
    !Number.isFinite(record.penetrationMm) ||
    record.penetrationMm < 0 ||
    !Number.isFinite(record.traceDistanceAfterPenetrationM) ||
    record.traceDistanceAfterPenetrationM < 0 ||
    record.ballisticsIds.length === 0 ||
    record.factions.length === 0 ||
    "selectorVisibility" in record ||
    "directEvidenceKind" in record ||
    /(?:generic|test|original|nosound)/iu.test(
      record.projectileCanonicalName,
    )
  ) {
    throw new Error(
      `Invalid production explosive direct-fire record: ${record.projectileCanonicalName}`,
    );
  }
  runtimeProductionExplosiveWeaponByProjectileName.set(
    canonicalName,
    record,
  );
}
if (
  runtimeProductionExplosiveWeaponByProjectileName.size !==
    runtimeProductionExplosiveDeliveryByProjectileName.size
) {
  throw new Error("Production explosive weapon and delivery sets differ");
}
if (
  wikiInfantryWeaponIndex.schemaVersion !== "sigua-infantry-weapon-ballistics/v1" ||
  !/^[0-9a-f]{64}$/u.test(wikiInfantryWeaponIndex.dataRevision) ||
  !/^[0-9a-f]{64}$/u.test(wikiInfantryWeaponIndex.sourceDataRevision) ||
  wikiInfantryWeaponIndex.damageCurveSampleIntervalM !== 50 ||
  wikiInfantryWeaponIndex.counts.penetratingConfigurations !==
    wikiInfantryWeaponIndex.weapons.length ||
  new Set(wikiInfantryWeaponIndex.weapons.map(({ weaponKey }) => weaponKey)).size !==
    wikiInfantryWeaponIndex.weapons.length
) {
  throw new Error("Invalid Wiki infantry weapon ballistics index");
}
if (
  runtimeExplosiveCatalog.source.wikiDataRevision !==
    wikiInfantryWeaponIndex.sourceDataRevision
) {
  throw new Error(
    "Explosive catalog and Wiki weapon data revisions do not match",
  );
}

function wikiInfantryWeaponBallisticsModel(
  record: WikiInfantryWeaponBallisticsRecord,
  radialSource: RuntimeExplosiveSource | null,
): EditorNativeModel {
  const sourceCurve = record.damageCurveName
    ? wikiInfantryWeaponIndex.damageCurves[record.damageCurveName]
    : null;
  if (record.damageCurveName && !sourceCurve) {
    throw new Error(`Missing Wiki infantry damage curve: ${record.damageCurveName}`);
  }
  const damageCurveKeys = sourceCurve
    ? sourceCurve.map((value, index) => ({
        time: index *
          wikiInfantryWeaponIndex.damageCurveSampleIntervalM *
          100,
        value,
      }))
    : record.maxDistanceM > 0
      ? [
          { time: 0, value: record.directImpactDamage },
          { time: record.maxDistanceM * 100, value: record.directImpactDamage },
        ]
      : null;
  const firstRadialLayer = radialSource?.layers[0] ?? null;
  const explosiveFields = radialSource && firstRadialLayer
    ? {
        explosiveBaseDamage: firstRadialLayer.baseDamage,
        explosiveMinimumDamage: firstRadialLayer.minimumDamage,
        explosiveInnerRadiusCm: firstRadialLayer.innerRadiusMeters * 100,
        explosiveOuterRadiusCm: firstRadialLayer.outerRadiusMeters * 100,
        explosiveFalloff: firstRadialLayer.falloff,
        impactNormalOffsetCm:
          firstRadialLayer.originNormalOffsetMeters * 100,
        explosiveLayerOrderEvidence: radialSource.layerOrderEvidence,
        explosiveLayers: radialSource.layers.map((layer) => ({
          layerId: layer.id,
          label: layer.label,
          shortLabel: layer.shortLabel,
          damageTypePath:
            layer.damageTypeClassPath ?? layer.damageType,
          baseDamage: layer.baseDamage,
          minimumDamage: layer.minimumDamage,
          innerRadiusCm: layer.innerRadiusMeters * 100,
          outerRadiusCm: layer.outerRadiusMeters * 100,
          falloff: layer.falloff,
          impactNormalOffsetCm: layer.originNormalOffsetMeters * 100,
          onlyDamageMeshes: layer.onlyDamageMeshes,
          orderEvidence: radialSource.layerOrderEvidence,
        })),
      }
    : {};
  return {
    healthPools: [],
    components: [],
    surfaceProfiles: [],
    weapons: [{
      weaponId: record.weaponKey,
      role: "wiki-infantry-direct-hit",
      projectileIndex: 0,
      armorPenetrationDepthMm: record.penetrationMm,
      armorPenetrationCurveIndex: { value: null, state: "absent" },
      damageFalloffCurveIndex: damageCurveKeys
        ? 0
        : { value: null, state: "absent" },
      maxDamage: record.directImpactDamage,
      minDamage: sourceCurve?.at(-1) ?? record.directImpactDamage,
      traceDistanceAfterPenetrationMeters: record.traceDistanceAfterPenetrationM,
    }],
    projectiles: [{
      projectileId: record.projectileName ?? `${record.weaponKey}:projectile`,
      role: "wiki-infantry-projectile",
      damageTypePath: record.damageTypePath,
      armorPenetrationDepthMm: record.penetrationMm,
      impactDamage: record.directImpactDamage,
      isExplosive: record.isExplosive,
      traceDistanceAfterPenetrationMeters: record.traceDistanceAfterPenetrationM,
      ...explosiveFields,
    }],
    curves: damageCurveKeys ? [{
      curveId: record.damageCurveName ?? `${record.weaponKey}:constant-damage`,
      inputUnit: "unreal-centimeters",
      outputUnit: "damage",
      keys: damageCurveKeys,
    }] : [],
  };
}

function runtimeExplosiveBallisticsModel(
  source: RuntimeExplosiveSource,
): EditorNativeModel {
  const firstLayer = source.layers[0];
  if (!firstLayer) {
    throw new Error(`Explosive catalog source has no layers: ${source.id}`);
  }
  const firstDamageTypePath =
    firstLayer.damageTypeClassPath ?? firstLayer.damageType;
  return {
    healthPools: [],
    components: [],
    surfaceProfiles: [],
    weapons: [{
      weaponId: source.canonicalName,
      role: "editor-explosive-catalog",
      projectileIndex: 0,
      armorPenetrationDepthMm: 0,
      armorPenetrationCurveIndex: { value: null, state: "absent" },
      damageFalloffCurveIndex: { value: null, state: "absent" },
      maxDamage: 0,
      minDamage: 0,
      traceDistanceAfterPenetrationMeters: 0,
    }],
    projectiles: [{
      projectileId: source.canonicalName,
      role: "editor-explosive-catalog",
      damageTypePath: firstDamageTypePath,
      armorPenetrationDepthMm: 0,
      impactDamage: 0,
      isExplosive: true,
      traceDistanceAfterPenetrationMeters: 0,
      explosiveBaseDamage: firstLayer.baseDamage,
      explosiveMinimumDamage: firstLayer.minimumDamage,
      explosiveInnerRadiusCm: firstLayer.innerRadiusMeters * 100,
      explosiveOuterRadiusCm: firstLayer.outerRadiusMeters * 100,
      explosiveFalloff: firstLayer.falloff,
      impactNormalOffsetCm: firstLayer.originNormalOffsetMeters * 100,
      explosiveLayerOrderEvidence: source.layerOrderEvidence,
      explosiveLayers: source.layers.map((layer) => ({
        layerId: layer.id,
        label: layer.label,
        shortLabel: layer.shortLabel,
        damageTypePath:
          layer.damageTypeClassPath ?? layer.damageType,
        baseDamage: layer.baseDamage,
        minimumDamage: layer.minimumDamage,
        innerRadiusCm: layer.innerRadiusMeters * 100,
        outerRadiusCm: layer.outerRadiusMeters * 100,
        falloff: layer.falloff,
        impactNormalOffsetCm: layer.originNormalOffsetMeters * 100,
        onlyDamageMeshes: layer.onlyDamageMeshes,
        orderEvidence: source.layerOrderEvidence,
      })),
    }],
    curves: [],
  };
}

function runtimeProductionExplosiveBallisticsModel(
  record: RuntimeProductionExplosiveWeaponRecord,
  source: RuntimeExplosiveSource,
): EditorNativeModel {
  const firstLayer = source.layers[0];
  if (!firstLayer) {
    throw new Error(
      `Production explosive source has no radial layers: ${record.projectileCanonicalName}`,
    );
  }
  return {
    healthPools: [],
    components: [],
    surfaceProfiles: [],
    weapons: [{
      weaponId: record.id,
      role: "production-explosive-direct-hit",
      projectileIndex: 0,
      armorPenetrationDepthMm: record.penetrationMm,
      armorPenetrationCurveIndex: { value: null, state: "absent" },
      damageFalloffCurveIndex: { value: null, state: "absent" },
      maxDamage: record.directImpactDamage,
      minDamage: record.directImpactDamage,
      traceDistanceAfterPenetrationMeters:
        record.traceDistanceAfterPenetrationM,
    }],
    projectiles: [{
      projectileId: record.projectileName,
      role: "production-explosive-projectile",
      damageTypePath: record.damageType,
      armorPenetrationDepthMm: record.penetrationMm,
      impactDamage: record.directImpactDamage,
      isExplosive: true,
      traceDistanceAfterPenetrationMeters:
        record.traceDistanceAfterPenetrationM,
      explosiveBaseDamage: firstLayer.baseDamage,
      explosiveMinimumDamage: firstLayer.minimumDamage,
      explosiveInnerRadiusCm: firstLayer.innerRadiusMeters * 100,
      explosiveOuterRadiusCm: firstLayer.outerRadiusMeters * 100,
      explosiveFalloff: firstLayer.falloff,
      impactNormalOffsetCm: firstLayer.originNormalOffsetMeters * 100,
      explosiveLayerOrderEvidence: source.layerOrderEvidence,
      explosiveLayers: source.layers.map((layer) => ({
        layerId: layer.id,
        label: layer.label,
        shortLabel: layer.shortLabel,
        damageTypePath:
          layer.damageTypeClassPath ?? layer.damageType,
        baseDamage: layer.baseDamage,
        minimumDamage: layer.minimumDamage,
        innerRadiusCm: layer.innerRadiusMeters * 100,
        outerRadiusCm: layer.outerRadiusMeters * 100,
        falloff: layer.falloff,
        impactNormalOffsetCm: layer.originNormalOffsetMeters * 100,
        onlyDamageMeshes: layer.onlyDamageMeshes,
        orderEvidence: source.layerOrderEvidence,
      })),
    }],
    curves: [],
  };
}

function bindingKey(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

const weaponLabelIndex = weaponLabelIndexJson as unknown as RuntimeWeaponLabelIndex;
if (weaponLabelIndex.schemaVersion !== "runtime-hit-weapon-label-index/v4") {
  throw new Error("Unsupported runtime weapon label index schema");
}
if (
  weaponLabelIndex.counts.bindings !== weaponLabelIndex.bindings.length ||
  weaponLabelIndex.counts.attackSources !== weaponLabelIndex.attackSources.length ||
  weaponLabelIndex.counts.attackWeapons !== weaponLabelIndex.attackSources.reduce(
    (total, source) => total + source.weapons.length,
    0,
  ) ||
  weaponLabelIndex.counts.runtimeBackedAttackWeapons +
      weaponLabelIndex.counts.catalogCompletedAttackWeapons !==
    weaponLabelIndex.counts.attackWeapons ||
  weaponLabelIndex.counts.armedVehicleCards +
      weaponLabelIndex.counts.excludedNoDirectWeaponCards !==
    weaponLabelIndex.counts.vehicleCards ||
  weaponLabelIndex.counts.attackSources +
      weaponLabelIndex.counts.collapsedSameNameAttackCards !==
    weaponLabelIndex.counts.armedVehicleCards ||
  weaponLabelIndex.counts.matchedWeapons + weaponLabelIndex.counts.unmatchedWeapons !==
    weaponLabelIndex.counts.runtimeWeapons
) {
  throw new Error("Runtime weapon label index counts are not closed");
}

const bindingByIdentity = new Map<string, RuntimeWeaponLabelBinding>();
for (const binding of weaponLabelIndex.bindings) {
  const identity = bindingKey(binding.cardId, binding.rawName);
  if (binding.bindingKey !== identity || bindingByIdentity.has(identity)) {
    throw new Error(`Invalid runtime weapon label identity: ${binding.cardId} / ${binding.rawName}`);
  }
  bindingByIdentity.set(identity, binding);
}

const attackSourceById = new Map<string, RuntimeAttackSource>();
const runtimeVehicleAttackSources: readonly RuntimeAttackSource[] =
  weaponLabelIndex.attackSources.map((source) => {
    const duplicateCardId = source.cardIds.some((cardId) => attackSourceById.has(cardId));
    const shareSlug = buildRuntimeAttackSourceShareSlug(source);
    const canonicalReleaseRecord = runtimeHitRecordReferenceForVariant(
      source.cardId,
      source.canonicalRawName,
    );
    if (
      duplicateCardId ||
      normalizeRuntimeAttackSourceShareSlug(shareSlug) !== shareSlug ||
      attackSourceById.has(shareSlug) ||
      !canonicalReleaseRecord ||
      canonicalReleaseRecord.vehicleId !== source.vehicleId ||
      source.cardIds.length === 0 ||
      new Set(source.cardIds).size !== source.cardIds.length ||
      !source.cardIds.includes(source.cardId) ||
      source.cardIds.some((cardId) => !cardId.startsWith(`${source.groupId}--`)) ||
      !source.variantRawNames.includes(source.canonicalRawName) ||
      source.weapons.length === 0 ||
      source.directWeaponCount !== source.weapons.length ||
      source.runtimeBackedWeaponCount + source.catalogCompletedWeaponCount !==
        source.directWeaponCount ||
      source.baseCurveFallbackWeaponCount > source.catalogCompletedWeaponCount ||
      source.recordBytes <= 0 ||
      !/^vehicle-[0-9a-f]{64}$/.test(source.vehicleId) ||
      !/^[0-9a-f]{64}$/.test(source.recordSha256) ||
      source.recordUrl !==
        `/assets/runtime-probe/hit-runtime/records/${source.recordSha256}.json`
    ) {
      throw new Error(`Invalid runtime attack source: ${source.cardId}`);
    }
    const ballisticsIds = new Set<string>();
    const normalized: RuntimeAttackSource = {
      ...source,
      shareSlug,
      sourceKind: "vehicle",
      vehicleId: canonicalReleaseRecord.vehicleId,
      recordUrl: canonicalReleaseRecord.recordUrl,
      recordSha256: canonicalReleaseRecord.recordSha256,
      recordBytes: canonicalReleaseRecord.recordBytes,
      weapons: source.weapons.map((weapon) => {
        const sourceIdentity = weapon.ballisticsId;
        const releaseRecord = runtimeHitRecordReferenceForVariant(
          weapon.sourceCardId,
          weapon.sourceRawName,
        );
        if (
          ballisticsIds.has(sourceIdentity) ||
          !releaseRecord ||
          releaseRecord.vehicleId !== weapon.sourceVehicleId ||
          !source.cardIds.includes(weapon.sourceCardId) ||
          !source.variantRawNames.includes(weapon.sourceRawName) ||
          weapon.sourceRecordBytes <= 0 ||
          !/^vehicle-[0-9a-f]{64}$/.test(weapon.sourceVehicleId) ||
          !/^[0-9a-f]{64}$/.test(weapon.sourceRecordSha256) ||
          weapon.sourceRecordUrl !==
            `/assets/runtime-probe/hit-runtime/records/${weapon.sourceRecordSha256}.json` ||
          !/^[0-9a-f]{64}$/.test(weapon.ballisticsId) ||
          weapon.ballisticsWeaponIndex !== 0 ||
          weapon.ballisticsModel.weapons?.length !== 1 ||
          weapon.ballisticsModel.projectiles?.length !== 1 ||
          !Array.isArray(weapon.ballisticsModel.curves) ||
          !/^[0-9a-f]{64}$/.test(weapon.ballisticsSource.catalogFingerprintSha256) ||
          !Array.isArray(weapon.ballisticsSource.curveEvidence) ||
          !Array.isArray(weapon.ballisticsSource.baseCurveFallbacks) ||
          (
            weapon.ballisticsSource.kind === "exact-runtime-record" &&
            (
              weapon.weaponIndex < 0 ||
              !weapon.runtimeAssetPath ||
              weapon.ballisticsSource.runtimeRecordSha256 !==
                weapon.sourceRecordSha256 ||
              weapon.ballisticsSource.runtimeWeaponIndex !== weapon.weaponIndex
            )
          ) ||
          (
            weapon.ballisticsSource.kind === "encyclopedia-weapon-closure" &&
            (weapon.weaponIndex !== -1 || weapon.runtimeAssetPath !== null)
          )
        ) {
          throw new Error(`Invalid runtime attack weapon: ${source.cardId}/${weapon.weaponIndex}`);
        }
        ballisticsIds.add(sourceIdentity);
        return {
          ...weapon,
          sourceKind: "vehicle",
          directFireRoute: true,
          sourceVehicleId: releaseRecord.vehicleId,
          sourceRecordUrl: releaseRecord.recordUrl,
          sourceRecordSha256: releaseRecord.recordSha256,
          sourceRecordBytes: releaseRecord.recordBytes,
          displayNameZh: weaponDisplayNameZh(weapon),
          displayNameEnglish: weapon.displayName || weapon.gunName,
        };
      }),
    };
    for (const cardId of source.cardIds) attackSourceById.set(cardId, normalized);
    attackSourceById.set(shareSlug, normalized);
    return normalized;
  });

const WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID = "wiki--infantry-weapons";
const wikiInfantryAttackSourceWeaponGroups =
  distinctInfantryHitAnalysisWeaponGroups(
    wikiInfantryWeaponIndex.weapons,
    wikiInfantryWeaponIndex.damageCurves,
  );
const wikiInfantryAttackSourceWeaponLabels =
  infantryHitAnalysisWeaponGroupLabels(wikiInfantryAttackSourceWeaponGroups);
const wikiInfantryAttackSourceWeapons: RuntimeAttackSourceWeapon[] =
  wikiInfantryAttackSourceWeaponGroups.map((group, groupIndex) => {
    const record = group.canonical;
    const radialSource = record.projectileName
      ? runtimeExplosiveSourceByProjectileName.get(
          runtimeExplosiveCanonicalName(record.projectileName),
        ) ?? null
      : null;
    return {
      weaponIndex: -1,
      weaponId: record.weaponKey,
      runtimeAssetPath: null,
      gunName: record.groupDisplayName,
      displayName: record.displayName,
      projectileName: record.projectileName,
      matchBasis: "exact-encyclopedia-weapon-ballistics",
      ballisticsId: record.ballisticsId,
      ballisticsWeaponIndex: 0,
      ballisticsModel: wikiInfantryWeaponBallisticsModel(record, radialSource),
      ballisticsSource: {
        kind: "encyclopedia-weapon-closure",
        catalogFingerprintSha256: wikiInfantryWeaponIndex.sourceDataRevision,
        projectileEvidence: null,
        curveEvidence: [],
        baseCurveFallbacks: [],
      },
      sourceCardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
      sourceRawName: record.groupFullName,
      sourceVehicleId: `wiki-infantry-${wikiInfantryWeaponIndex.dataRevision}`,
      sourceRecordUrl: "/data/wiki-weapons.json",
      sourceRecordSha256: wikiInfantryWeaponIndex.sourceDataRevision,
      sourceRecordBytes: 0,
      displayNameZh: wikiInfantryAttackSourceWeaponLabels[groupIndex],
      displayNameEnglish: record.displayName,
      sourceKind: "wiki-infantry",
      directFireRoute: true,
      infantryCategory: infantryWeaponCategoryForPenetration(record.penetrationMm),
      explosiveCategory: radialSource?.category,
      explosiveCategoryLabel: radialSource?.categoryLabel,
      explosiveLayerOrderEvidence: radialSource?.layerOrderEvidence,
      explosiveLayerOrderClosed: radialSource
        ? runtimeExplosiveLayerOrderIsClosed(radialSource)
        : undefined,
      explosiveLayerCount: radialSource?.layers.length,
      searchAliases: group.searchAliases,
    };
  });

const wikiInfantryAttackSource: RuntimeAttackSource = {
  sourceKind: "wiki-infantry",
  cardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
  cardIds: [WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID],
  shareSlug: "inf-weapons",
  displayName: "步兵武器",
  groupId: "infantry-weapons",
  groupName: "步兵",
  groupOrder: Number.MAX_SAFE_INTEGER,
  type: "Infantry Weapon",
  types: ["Infantry Weapon", "Small Arms", "步兵武器"],
  canonicalRawName: "Infantry Weapons",
  catalogSelectedRawName: "Infantry Weapons",
  canonicalSelectionBasis: "wiki-infantry-configuration-order",
  variantRawNames: [
    ...new Set(wikiInfantryWeaponIndex.weapons.map(({ groupDisplayName }) => groupDisplayName)),
  ],
  vehicleId: `wiki-infantry-${wikiInfantryWeaponIndex.dataRevision}`,
  recordUrl: "/data/wiki-weapons.json",
  recordSha256: wikiInfantryWeaponIndex.sourceDataRevision,
  recordBytes: 0,
  directWeaponCount: wikiInfantryAttackSourceWeapons.length,
  runtimeBackedWeaponCount: 0,
  catalogCompletedWeaponCount: wikiInfantryAttackSourceWeapons.length,
  baseCurveFallbackWeaponCount: 0,
  weapons: wikiInfantryAttackSourceWeapons,
};
if (
  normalizeRuntimeAttackSourceShareSlug(wikiInfantryAttackSource.shareSlug) !==
    wikiInfantryAttackSource.shareSlug ||
  attackSourceById.has(wikiInfantryAttackSource.shareSlug)
) {
  throw new Error("Invalid Wiki infantry attack source share slug");
}
attackSourceById.set(WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID, wikiInfantryAttackSource);
attackSourceById.set(wikiInfantryAttackSource.shareSlug, wikiInfantryAttackSource);

const EXPLOSIVE_CATALOG_ATTACK_SOURCE_CARD_ID = "catalog--explosives";
const coveredExplosiveCanonicalNames = new Set(
  [
    ...runtimeVehicleAttackSources.flatMap(({ weapons }) =>
      weapons.map(({ projectileName }) => projectileName)
    ),
    ...wikiInfantryAttackSourceWeapons.map(
      ({ projectileName }) => projectileName,
    ),
  ].map(runtimeExplosiveCanonicalName).filter(Boolean),
);
const missingShippingExplosiveSources = runtimeExplosiveCatalog.sources
  .filter(
    (source) =>
      runtimeProductionExplosiveIds.has(source.id) &&
      !coveredExplosiveCanonicalNames.has(
        runtimeExplosiveCanonicalName(source.canonicalName),
      ),
  )
  .sort((left, right) => {
    const categoryDifference =
      RUNTIME_EXPLOSIVE_CATEGORY_ORDER.indexOf(left.category) -
      RUNTIME_EXPLOSIVE_CATEGORY_ORDER.indexOf(right.category);
    if (categoryDifference !== 0) return categoryDifference;
    return left.label.localeCompare(right.label, "zh-CN");
  });
if (missingShippingExplosiveSources.length !== 45) {
  throw new Error(
    `Explosive selector closure drifted: expected 45 missing production sources, got ${missingShippingExplosiveSources.length}`,
  );
}

const explosiveCatalogAttackSourceWeapons: RuntimeAttackSourceWeapon[] =
  missingShippingExplosiveSources.map((source) => {
    const canonicalName = runtimeExplosiveCanonicalName(source.canonicalName);
    const productionRecord =
      runtimeProductionExplosiveWeaponByProjectileName.get(canonicalName) ??
        null;
    const deliveryBinding = productionRecord
      ? runtimeProductionExplosiveDeliveryByProjectileName.get(canonicalName) ??
        null
      : null;
    if (productionRecord && !deliveryBinding) {
      throw new Error(
        `Missing production delivery for ${productionRecord.projectileCanonicalName}`,
      );
    }
    const directFireRoute = productionRecord !== null;
    const sourceRecordSha256 = directFireRoute
      ? runtimeProductionExplosiveWeaponIndex.dataRevision
      : RUNTIME_EXPLOSIVE_CATALOG_SHA256;
    return {
      weaponIndex: -1,
      weaponId: productionRecord?.id ?? source.canonicalName,
      runtimeAssetPath: source.assetPath,
      gunName: productionRecord?.groupLabel ?? source.label,
      displayName: productionRecord?.label ?? source.shortLabel,
      projectileName:
        productionRecord?.projectileName ?? source.canonicalName,
      matchBasis: directFireRoute
        ? "exact-editor-projectile-cdo"
        : "exact-editor-explosive-catalog",
      ballisticsId:
        productionRecord?.ballisticsIds[0] ?? source.id,
      ballisticsWeaponIndex: 0,
      ballisticsModel: productionRecord
        ? runtimeProductionExplosiveBallisticsModel(
            productionRecord,
            source,
          )
        : runtimeExplosiveBallisticsModel(source),
      ballisticsSource: {
        kind: directFireRoute
          ? "editor-production-explosive"
          : "editor-explosive-catalog",
        catalogFingerprintSha256: sourceRecordSha256,
        projectileEvidence: {
          recordSha256: sourceRecordSha256,
          projectileIndex: 0,
          assetPath: source.assetPath,
        },
        curveEvidence: [],
        baseCurveFallbacks: [],
      },
      sourceCardId: EXPLOSIVE_CATALOG_ATTACK_SOURCE_CARD_ID,
      sourceRawName:
        productionRecord?.groupLabel ?? source.canonicalName,
      sourceVehicleId: directFireRoute
        ? `production-explosive-${runtimeProductionExplosiveWeaponIndex.dataRevision}`
        : `explosive-catalog-${RUNTIME_EXPLOSIVE_CATALOG_SHA256}`,
      sourceRecordUrl: directFireRoute
        ? "embedded:app/runtime-production-explosive-weapons.json"
        : "embedded:app/infantry-explosive-catalog.json",
      sourceRecordSha256,
      sourceRecordBytes: 0,
      displayNameZh: productionRecord
        ? `${productionRecord.label} · ${productionRecord.groupLabel}`
        : source.label,
      displayNameEnglish: source.shortLabel,
      sourceKind: "explosive-catalog",
      directFireRoute,
      explosiveCategory: source.category,
      explosiveCategoryLabel: source.categoryLabel,
      explosiveLayerOrderEvidence: source.layerOrderEvidence,
      explosiveLayerOrderClosed: runtimeExplosiveLayerOrderIsClosed(source),
      explosiveLayerCount: source.layers.length,
      searchAliases: [
        source.canonicalName,
        source.nativeClass,
        source.categoryLabel,
        source.searchText,
        ...source.factions,
        ...(productionRecord
          ? [
              productionRecord.projectileCanonicalName,
              productionRecord.groupLabel,
              productionRecord.searchText,
              ...productionRecord.groupLabels,
              ...productionRecord.factions,
              ...productionRecord.sourceCardIds,
              ...productionRecord.sourceLabels,
              ...productionRecord.runtimeAssetPaths,
            ]
          : []),
        ...(deliveryBinding
          ? [
              deliveryBinding.searchText,
              ...deliveryBinding.factions,
              ...deliveryBinding.deliveryKinds,
              ...deliveryBinding.deliveries.flatMap((delivery) => [
                delivery.factionId,
                delivery.platformName,
                delivery.platformType,
                delivery.actorClass,
                delivery.weaponClass,
                delivery.gameplayAuthorityPath,
              ]),
            ]
          : []),
        ...source.weapons.flatMap((weapon) => [
          weapon.weaponKey,
          weapon.displayName,
          weapon.groupDisplayName ?? "",
          weapon.type ?? "",
          ...weapon.factions,
        ]),
        ...source.layers.flatMap((layer) => [
          layer.label,
          layer.shortLabel,
          layer.damageType,
          layer.damageTypeClassPath ?? "",
        ]),
      ].filter(Boolean),
    };
  });

const explosiveCatalogAttackSource: RuntimeAttackSource = {
  sourceKind: "explosive-catalog",
  cardId: EXPLOSIVE_CATALOG_ATTACK_SOURCE_CARD_ID,
  cardIds: [EXPLOSIVE_CATALOG_ATTACK_SOURCE_CARD_ID],
  shareSlug: "catalog-explosives",
  displayName: "爆炸物",
  groupId: "explosives",
  groupName: "爆炸物",
  groupOrder: Number.MAX_SAFE_INTEGER - 1,
  type: "Explosive",
  types: [
    "Explosive",
    "Explosion",
    "爆炸物",
    ...new Set(
      missingShippingExplosiveSources.map(({ categoryLabel }) => categoryLabel),
    ),
  ],
  canonicalRawName: "Explosive Catalog",
  catalogSelectedRawName: "Explosive Catalog",
  canonicalSelectionBasis: "editor-explosive-catalog-shipping-order",
  variantRawNames: missingShippingExplosiveSources.map(
    ({ canonicalName }) => canonicalName,
  ),
  vehicleId:
    `explosive-catalog-${RUNTIME_EXPLOSIVE_CATALOG_SHA256}`,
  recordUrl: "embedded:app/infantry-explosive-catalog.json",
  recordSha256: RUNTIME_EXPLOSIVE_CATALOG_SHA256,
  recordBytes: 0,
  directWeaponCount: explosiveCatalogAttackSourceWeapons.length,
  runtimeBackedWeaponCount: 0,
  catalogCompletedWeaponCount: explosiveCatalogAttackSourceWeapons.length,
  baseCurveFallbackWeaponCount: 0,
  weapons: explosiveCatalogAttackSourceWeapons,
};
if (
  normalizeRuntimeAttackSourceShareSlug(
    explosiveCatalogAttackSource.shareSlug,
  ) !== explosiveCatalogAttackSource.shareSlug ||
  attackSourceById.has(explosiveCatalogAttackSource.shareSlug)
) {
  throw new Error("Invalid explosive catalog attack source share slug");
}
attackSourceById.set(
  EXPLOSIVE_CATALOG_ATTACK_SOURCE_CARD_ID,
  explosiveCatalogAttackSource,
);
attackSourceById.set(
  explosiveCatalogAttackSource.shareSlug,
  explosiveCatalogAttackSource,
);

export const runtimeAttackSources: readonly RuntimeAttackSource[] = [
  ...runtimeVehicleAttackSources,
  wikiInfantryAttackSource,
  explosiveCatalogAttackSource,
];

export function runtimeAttackWeaponSupportsHitAnalysis(
  weapon: RuntimeAttackSourceWeapon,
) {
  return editorNativeDamageWeaponIndices(weapon.ballisticsModel).includes(
    weapon.ballisticsWeaponIndex,
  );
}

export function runtimeAttackSourceForId(id: string) {
  return attackSourceById.get(id) ?? null;
}

export function runtimeWeaponLabelFor({
  cardId,
  rawName,
  recordSha256,
  weaponIndex,
  weaponId,
  runtimeAssetPath,
}: {
  cardId: string;
  rawName: string;
  recordSha256: string;
  weaponIndex: number;
  weaponId: string;
  runtimeAssetPath: string;
}): RuntimeWeaponLabel | null {
  const binding = bindingByIdentity.get(bindingKey(cardId, rawName));
  if (!binding || binding.recordSha256 !== recordSha256) return null;
  const weapon = binding.weapons.find((candidate) => candidate.weaponIndex === weaponIndex);
  if (
    !weapon ||
    weapon.weaponId !== weaponId ||
    weapon.runtimeAssetPath !== runtimeAssetPath
  ) {
    return null;
  }
  return {
    displayNameZh: weaponDisplayNameZh(weapon),
    displayNameEnglish: weapon.displayName || weapon.gunName,
    gunName: weapon.gunName,
    projectileName: weapon.projectileName,
    matchBasis: weapon.matchBasis,
  };
}
