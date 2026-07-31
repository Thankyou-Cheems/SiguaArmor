import { weaponDisplayNameZh } from "../lib/weapon-display-name.ts";
import type {
  RuntimeWeaponLabel,
  RuntimeWeaponLabelMatchBasis,
} from "../lib/runtime-weapon-label-options.ts";
import {
  editorNativeDamageWeaponIndices,
  type EditorNativeCurveKey,
  type EditorNativeModel,
} from "../lib/editor-native-hit-model.ts";
import {
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
  type RuntimeExplosiveCategory,
  type RuntimeExplosiveSource,
} from "../lib/runtime-explosive-catalog.ts";
import {
  weaponCatalogBallisticProfileForId,
  weaponCatalogCurves,
  weaponCatalogDirectModelForVariant,
  weaponCatalogRadialAssetForVariant,
  weaponCatalogRadialModelForAsset,
  weaponCatalogShippingVariants,
  weaponCatalogSourceRefsForVariant,
  weaponCatalogSummary,
  weaponCatalogVariantForId,
  weaponCatalogWikiConfigurationForKey,
  type WeaponCatalogVariant,
} from "../lib/weapon-catalog.ts";
import { runtimeHitRecordReferenceForVariant } from "./runtime-probe-preview-data";
import {
  buildRuntimeAttackSourceShareSlug,
  normalizeRuntimeAttackSourceShareSlug,
} from "../lib/runtime-attack-source-share.mjs";
import runtimeWeaponSourceIndexJson from "./runtime-weapon-source-index.json";

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
    | "editor-weapon-catalog-category-order";
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
  selectorVariant: WeaponCatalogVariant | null;
  infantryCategory?: InfantryWeaponCategoryId;
  explosiveCategory?: RuntimeExplosiveCategory;
  explosiveCategoryLabel?: string;
  explosiveLayerOrderEvidence?: string;
  explosiveLayerOrderClosed?: boolean;
  explosiveLayerCount?: number;
  directFireRoute: boolean;
  searchAliases?: string[];
}

export type RuntimeAttackSourceCategory =
  | "vehicle"
  | "infantry"
  | "emplaced"
  | "commander-support";

export interface RuntimeAttackSource extends Omit<RuntimeAttackSourceRecord, "weapons"> {
  shareSlug: string;
  sourceKind: "vehicle" | "wiki-infantry" | "explosive-catalog";
  sourceCategory: RuntimeAttackSourceCategory;
  weapons: RuntimeAttackSourceWeapon[];
}

interface WikiInfantryExactCurve {
  curveId: string;
  inputUnit: string;
  outputUnit: string;
  keys: EditorNativeCurveKey[];
}

interface RuntimeWeaponSourceWeaponRecord
  extends Omit<
    RuntimeAttackSourceWeaponRecord,
    "ballisticsModel" | "ballisticsSource"
  > {
  weaponVariantId: string;
  evidence: {
    kind: RuntimeAttackBallisticsSource["kind"];
    catalogFingerprintSha256: string;
    runtimeRecordSha256: string | null;
    runtimeWeaponIndex: number | null;
  };
}

interface RuntimeWeaponSourceRecord
  extends Omit<RuntimeAttackSourceRecord, "weapons"> {
  weapons: RuntimeWeaponSourceWeaponRecord[];
}

interface RuntimeWeaponSourceIndex {
  schemaVersion: "sigua-runtime-weapon-source-index/v1";
  catalog: {
    schemaVersion: "sigua-weapon-catalog/v2";
    catalogRevision: string;
    bytes: number;
    sha256: string;
  };
  counts: {
    bindings: number;
    attackSources: number;
    attackWeapons: number;
    resolvedCatalogVariants: number;
  };
  attackSources: RuntimeWeaponSourceRecord[];
  bindings: RuntimeWeaponLabelBinding[];
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

const runtimeWeaponSourceIndex =
  runtimeWeaponSourceIndexJson as unknown as RuntimeWeaponSourceIndex;
if (
  runtimeWeaponSourceIndex.schemaVersion !==
    "sigua-runtime-weapon-source-index/v1" ||
  runtimeWeaponSourceIndex.catalog.schemaVersion !==
    weaponCatalogSummary.schemaVersion ||
  runtimeWeaponSourceIndex.catalog.catalogRevision !==
    weaponCatalogSummary.catalogRevision ||
  runtimeWeaponSourceIndex.counts.bindings !==
    runtimeWeaponSourceIndex.bindings.length ||
  runtimeWeaponSourceIndex.counts.attackSources !==
    runtimeWeaponSourceIndex.attackSources.length ||
  runtimeWeaponSourceIndex.counts.attackWeapons !==
    runtimeWeaponSourceIndex.attackSources.reduce(
      (total, source) => total + source.weapons.length,
      0,
    ) ||
  runtimeWeaponSourceIndex.counts.resolvedCatalogVariants !==
    runtimeWeaponSourceIndex.counts.attackWeapons
) {
  throw new Error("Invalid runtime weapon source index");
}

const runtimeExplosiveCatalog = {
  sources: weaponCatalogSummary.counts.radialAssets > 0
    ? weaponCatalogShippingVariants
        .filter(
          ({ radialAssetId }) => radialAssetId !== null,
        )
        .map(
          (
            variant,
          ): RuntimeExplosiveSource | null => {
          const asset =
            weaponCatalogRadialAssetForVariant(variant);
          if (!asset) return null;
          const model = weaponCatalogRadialModelForAsset(asset);
          if (!model) {
            throw new Error(
              `Missing radial model for ${asset.id}`,
            );
          }
          const configurations = variant.configurationKeys
            .map((weaponKey) =>
              weaponCatalogWikiConfigurationForKey(weaponKey),
            )
            .filter((configuration) => configuration !== null);
          return {
            id: asset.id,
            label: asset.label,
            shortLabel: asset.shortLabel,
            canonicalName:
              asset.sourceIdentity.canonicalName ||
              runtimeExplosiveCanonicalName(asset.assetPath),
            category: asset.category as RuntimeExplosiveCategory,
            categoryLabel: asset.categoryLabel,
            assetPath: asset.assetPath,
            generatedClassPath: asset.generatedClassPath,
            nativeClass:
              asset.generatedClassPath ??
              asset.sourceIdentity.canonicalName,
            shipping:
              asset.selectorVisibility === "shipping",
            layers: model.layers.map((layer) => ({
              id: layer.id,
              label: layer.label,
              shortLabel:
                layer.shortLabel ?? layer.label,
              baseDamage: layer.baseDamage,
              minimumDamage: layer.minimumDamage,
              killZoneRadiusMeters:
                layer.killZoneRadiusMeters ?? 0,
              innerRadiusMeters: layer.innerRadiusMeters,
              outerRadiusMeters: layer.outerRadiusMeters,
              falloff: layer.falloff ?? 1,
              damageType: layer.damageType,
              damageTypeClassPath:
                layer.damageTypeClassPath ?? null,
              originNormalOffsetMeters:
                layer.originNormalOffsetMeters ?? 0,
              onlyDamageMeshes:
                layer.onlyDamageMeshes ?? false,
            })),
            layerOrderEvidence: model.layerOrderEvidence,
            impact: asset.impact,
            weapons: configurations.map((configuration) => ({
              weaponKey: configuration.weaponKey,
              displayName: configuration.displayName,
              groupDisplayName: variant.familyLabel,
              type:
                typeof configuration.weaponInfo === "object" &&
                configuration.weaponInfo !== null &&
                !Array.isArray(configuration.weaponInfo)
                  ? String(
                      configuration.weaponInfo.type ?? "",
                    ) || null
                  : null,
              factions: configuration.factions,
            })),
            factions: variant.factionIds,
            searchText: variant.searchText,
            variantAssetPaths: asset.variantAssetPaths,
            maximumRadiusMeters: model.maximumRadiusMeters,
            maximumBaseDamage: Math.max(
              ...model.layers.map(({ baseDamage }) => baseDamage),
            ),
            } satisfies RuntimeExplosiveSource;
          },
        )
        .filter(
          (source): source is RuntimeExplosiveSource =>
            source !== null,
        )
        .filter(
          (source, index, sources) =>
            sources.findIndex(({ id }) => id === source.id) ===
            index,
        )
    : [],
};
function catalogVariantBallisticsModel(
  variant: WeaponCatalogVariant,
  radialSource: RuntimeExplosiveSource | null,
): EditorNativeModel {
  const directModel = weaponCatalogDirectModelForVariant(variant);
  if (!directModel) {
    throw new Error(
      `Catalog variant has no direct model: ${variant.id}`,
    );
  }
  const configuration =
    variant.configurationKeys
      .map((weaponKey) =>
        weaponCatalogWikiConfigurationForKey(weaponKey),
      )
      .find(Boolean) ?? null;
  const exactCurves = (configuration?.exactCurveIds ?? [])
    .map((curveId) => weaponCatalogCurves[curveId])
    .filter(Boolean);
  const sourcePenetrationCurve =
    exactCurves.find(
      ({ outputUnit }) => outputUnit === "millimeters",
    ) ?? null;
  const sourceDamageCurve =
    exactCurves.find(({ outputUnit }) => outputUnit === "damage") ??
    null;
  const curves: WikiInfantryExactCurve[] = [];
  const penetrationCurveIndex = sourcePenetrationCurve
    ? curves.push(sourcePenetrationCurve) - 1
    : null;
  const damageCurveIndex = sourceDamageCurve
    ? curves.push(sourceDamageCurve) - 1
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
      weaponId: variant.id,
      role: "wiki-infantry-direct-hit",
      projectileIndex: 0,
      armorPenetrationDepthMm:
        directModel.penetrationMm ?? 0,
      armorPenetrationCurveIndex: penetrationCurveIndex === null
        ? { value: null, state: "absent" }
        : penetrationCurveIndex,
      damageFalloffCurveIndex: damageCurveIndex === null
        ? { value: null, state: "absent" }
        : damageCurveIndex,
      maxDamage: directModel.directImpactDamage,
      minDamage:
        sourceDamageCurve?.keys.at(-1)?.value ??
        directModel.directImpactDamage,
      traceDistanceAfterPenetrationMeters:
        directModel.traceDistanceAfterPenetrationM,
    }],
    projectiles: [{
      projectileId: `${variant.id}:projectile`,
      role: "wiki-infantry-projectile",
      damageTypePath: directModel.damageType,
      armorPenetrationDepthMm:
        directModel.penetrationMm ?? 0,
      impactDamage: directModel.directImpactDamage,
      isExplosive: radialSource !== null,
      traceDistanceAfterPenetrationMeters:
        directModel.traceDistanceAfterPenetrationM,
      ...explosiveFields,
    }],
    curves,
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

function runtimeCatalogAttackSourceWeapon(
  selectorVariant: WeaponCatalogVariant,
  sourceCardId: string,
): RuntimeAttackSourceWeapon {
  const directModel =
    weaponCatalogDirectModelForVariant(selectorVariant);
  const radialSource = selectorVariant.radialAssetId
    ? runtimeExplosiveCatalog.sources.find(
        ({ id }) => id === selectorVariant.radialAssetId,
      ) ?? null
    : null;
  if (!directModel && !radialSource) {
    throw new Error(
      `Catalog category variant has no damage model: ${selectorVariant.id}`,
    );
  }
  const directFireRoute = directModel !== null;
  const sourceRefs = weaponCatalogSourceRefsForVariant(selectorVariant);
  const weaponId = directFireRoute
    ? selectorVariant.id
    : radialSource!.canonicalName;
  return {
    weaponIndex: -1,
    weaponId,
    runtimeAssetPath: radialSource?.assetPath ?? null,
    gunName: selectorVariant.familyLabel,
    displayName: selectorVariant.label,
    projectileName: radialSource?.canonicalName ?? null,
    matchBasis: directFireRoute
      ? "exact-editor-ballistic-fingerprint"
      : "exact-editor-explosive-catalog",
    ballisticsId:
      selectorVariant.ballisticsIds[0] ??
      radialSource?.id ??
      selectorVariant.directDamageModelId ??
      selectorVariant.id,
    ballisticsWeaponIndex: 0,
    ballisticsModel: directFireRoute
      ? catalogVariantBallisticsModel(selectorVariant, radialSource)
      : runtimeExplosiveBallisticsModel(radialSource!),
    ballisticsSource: {
      kind: directFireRoute
        ? "encyclopedia-weapon-closure"
        : "editor-explosive-catalog",
      catalogFingerprintSha256:
        weaponCatalogSummary.catalogRevision,
      projectileEvidence: radialSource
        ? {
            recordSha256: weaponCatalogSummary.catalogRevision,
            projectileIndex: 0,
            assetPath: radialSource.assetPath,
          }
        : null,
      curveEvidence: [],
      baseCurveFallbacks: [],
    },
    sourceCardId,
    sourceRawName: selectorVariant.familyLabel,
    sourceVehicleId:
      `weapon-catalog-${weaponCatalogSummary.catalogRevision}`,
    sourceRecordUrl:
      "catalog:generated/internal/weapon-catalog.json",
    sourceRecordSha256: weaponCatalogSummary.catalogRevision,
    sourceRecordBytes: 0,
    displayNameZh: selectorVariant.displayLabel,
    displayNameEnglish: selectorVariant.label,
    sourceKind: "explosive-catalog",
    selectorVariant,
    directFireRoute,
    explosiveCategory: radialSource?.category,
    explosiveCategoryLabel: radialSource?.categoryLabel,
    explosiveLayerOrderEvidence: radialSource?.layerOrderEvidence,
    explosiveLayerOrderClosed: radialSource
      ? runtimeExplosiveLayerOrderIsClosed(radialSource)
      : undefined,
    explosiveLayerCount: radialSource?.layers.length,
    searchAliases: [
      selectorVariant.searchText,
      selectorVariant.familyLabel,
      selectorVariant.label,
      selectorVariant.qualifier,
      ...(selectorVariant.sourceLabels ?? []),
      ...(selectorVariant.factionIds ?? []),
      ...(radialSource
        ? [
            radialSource.canonicalName,
            radialSource.nativeClass,
            radialSource.categoryLabel,
            radialSource.searchText,
            ...radialSource.factions,
          ]
        : []),
      ...sourceRefs.flatMap((sourceRef) => [
        sourceRef.scope,
        sourceRef.factionId ?? "",
        sourceRef.weaponClass ?? "",
        sourceRef.weaponAssetPath ?? "",
        ...(sourceRef.exactCardIds ?? []),
        ...(sourceRef.familyCardIds ?? []),
      ]),
    ].filter(Boolean),
  };
}

function isReassignableRadialCatalogVariant(
  variant: WeaponCatalogVariant,
) {
  return (
    variant.kind === "radial-only" &&
    variant.radialAssetId !== null &&
    variant.platformKind !== "emplaced" &&
    !isCommanderSupportCatalogVariant(variant)
  );
}

function isVehicleDeliveredRadialCatalogVariant(
  variant: WeaponCatalogVariant,
) {
  return (
    isReassignableRadialCatalogVariant(variant) &&
    variant.platformKind === "vehicle" &&
    variant.exactCardIds.length > 0
  );
}

function isInfantryDeliveredRadialCatalogVariant(
  variant: WeaponCatalogVariant,
) {
  return (
    isReassignableRadialCatalogVariant(variant) &&
    variant.platformKind === "infantry"
  );
}

function bindingKey(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

const bindingByIdentity = new Map<string, RuntimeWeaponLabelBinding>();
for (const binding of runtimeWeaponSourceIndex.bindings) {
  const identity = bindingKey(binding.cardId, binding.rawName);
  if (binding.bindingKey !== identity || bindingByIdentity.has(identity)) {
    throw new Error(`Invalid runtime weapon label identity: ${binding.cardId} / ${binding.rawName}`);
  }
  bindingByIdentity.set(identity, binding);
}

const attackSourceById = new Map<string, RuntimeAttackSource>();
const runtimeVehicleAttackSources: readonly RuntimeAttackSource[] =
  runtimeWeaponSourceIndex.attackSources.map((source) => {
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
    const catalogRadialVariants =
      weaponCatalogShippingVariants.filter(
        (variant) =>
          isVehicleDeliveredRadialCatalogVariant(variant) &&
          variant.exactCardIds.some((cardId) =>
            source.cardIds.includes(cardId),
          ) &&
          !source.weapons.some(
            (weapon) => weapon.weaponVariantId === variant.id,
          ),
      );
    const normalized: RuntimeAttackSource = {
      ...source,
      shareSlug,
      sourceKind: "vehicle",
      sourceCategory: "vehicle",
      types: uniqueSorted([
        ...source.types,
        ...catalogRadialVariants.map((variant) => variant.type),
      ]),
      directWeaponCount:
        source.directWeaponCount + catalogRadialVariants.length,
      catalogCompletedWeaponCount:
        source.catalogCompletedWeaponCount +
        catalogRadialVariants.length,
      vehicleId: canonicalReleaseRecord.vehicleId,
      recordUrl: canonicalReleaseRecord.recordUrl,
      recordSha256: canonicalReleaseRecord.recordSha256,
      recordBytes: canonicalReleaseRecord.recordBytes,
      weapons: [
        ...source.weapons.map((weapon): RuntimeAttackSourceWeapon => {
          const sourceIdentity = weapon.ballisticsId;
          const selectorVariant = weaponCatalogVariantForId(
            weapon.weaponVariantId,
          );
          const ballisticProfile =
            weaponCatalogBallisticProfileForId(
              weapon.ballisticsId,
            );
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
            !selectorVariant ||
            !selectorVariant.ballisticProfileIds.includes(
              weapon.ballisticsId,
            ) ||
            !ballisticProfile ||
            ballisticProfile.model.weapons?.length !== 1 ||
            ballisticProfile.model.projectiles?.length !== 1 ||
            !Array.isArray(ballisticProfile.model.curves) ||
            !/^[0-9a-f]{64}$/.test(
              weapon.evidence.catalogFingerprintSha256,
            ) ||
            (
              weapon.evidence.kind === "exact-runtime-record" &&
              (
                weapon.weaponIndex < 0 ||
                !weapon.runtimeAssetPath ||
                weapon.evidence.runtimeRecordSha256 !==
                  weapon.sourceRecordSha256 ||
                weapon.evidence.runtimeWeaponIndex !==
                  weapon.weaponIndex
              )
            ) ||
            (
              weapon.evidence.kind ===
                "encyclopedia-weapon-closure" &&
              (weapon.weaponIndex !== -1 || weapon.runtimeAssetPath !== null)
            )
          ) {
            throw new Error(`Invalid runtime attack weapon: ${source.cardId}/${weapon.weaponIndex}`);
          }
          ballisticsIds.add(sourceIdentity);
          return {
            ...weapon,
            ballisticsModel: ballisticProfile.model,
            ballisticsSource: {
              kind: weapon.evidence.kind,
              catalogFingerprintSha256:
                weapon.evidence.catalogFingerprintSha256,
              runtimeRecordSha256:
                weapon.evidence.runtimeRecordSha256 ?? undefined,
              runtimeWeaponIndex:
                weapon.evidence.runtimeWeaponIndex ?? undefined,
              projectileEvidence: null,
              curveEvidence: [],
              baseCurveFallbacks: [],
            },
            sourceKind: "vehicle",
            selectorVariant,
            directFireRoute: true,
            sourceVehicleId: releaseRecord.vehicleId,
            sourceRecordUrl: releaseRecord.recordUrl,
            sourceRecordSha256: releaseRecord.recordSha256,
            sourceRecordBytes: releaseRecord.recordBytes,
            displayNameZh: weaponDisplayNameZh(weapon),
            displayNameEnglish: weapon.displayName || weapon.gunName,
          };
        }),
        ...catalogRadialVariants.map((variant) =>
          runtimeCatalogAttackSourceWeapon(
            variant,
            source.cardId,
          ),
        ),
      ],
    };
    for (const cardId of source.cardIds) attackSourceById.set(cardId, normalized);
    attackSourceById.set(shareSlug, normalized);
    return normalized;
  });

function isCommanderSupportCatalogVariant(
  variant: WeaponCatalogVariant,
) {
  return (
    variant.platformKind === "airstrike" ||
    variant.type === "火炮与航弹" ||
    (variant.factionByScope["commander-action"]?.length ?? 0) > 0
  );
}

function runtimeCommanderSupportCatalogVariant(
  variant: WeaponCatalogVariant,
): WeaponCatalogVariant {
  if (
    variant.type !== "迫击炮" ||
    (variant.factionByScope["commander-action"]?.length ?? 0) === 0
  ) {
    return variant;
  }
  return {
    ...variant,
    familyLabel: "120 mm 重型迫击炮弹",
    label: "120 mm 重型迫击炮弹",
    qualifier: "指挥官迫击炮支援",
    displayLabel: "120 mm 重型迫击炮弹 · 指挥官迫击炮支援",
    sourceLabels: [
      ...new Set([
        ...variant.sourceLabels,
        "指挥官迫击炮支援",
      ]),
    ],
    searchText: [
      variant.searchText,
      "120 mm",
      "指挥官迫击炮支援",
      "民兵",
      "IMF",
    ].join(" "),
  };
}

const emplacedCatalogVariants =
  weaponCatalogShippingVariants
    .filter((variant) => variant.platformKind === "emplaced")
    .sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel, "zh-CN"),
    );
const commanderSupportCatalogVariants =
  weaponCatalogShippingVariants
    .filter(isCommanderSupportCatalogVariant)
    .map(runtimeCommanderSupportCatalogVariant)
    .sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel, "zh-CN"),
    );

const WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID = "wiki--infantry-weapons";
const wikiInfantryDirectCatalogVariants =
  weaponCatalogShippingVariants.filter(
    (variant) =>
      variant.configurationKeys.length > 0 &&
      variant.directDamageModelId !== null &&
      variant.platformKind !== "emplaced" &&
      !isCommanderSupportCatalogVariant(variant),
  );
const wikiInfantryDirectAttackSourceWeapons: RuntimeAttackSourceWeapon[] =
  wikiInfantryDirectCatalogVariants.map((selectorVariant) => {
    const directModel =
      weaponCatalogDirectModelForVariant(selectorVariant);
    if (!directModel) {
      throw new Error(
        `Wiki catalog variant has no direct model: ${selectorVariant.id}`,
      );
    }
    const configuration =
      selectorVariant.configurationKeys
        .map((weaponKey) =>
          weaponCatalogWikiConfigurationForKey(weaponKey),
        )
        .find(Boolean) ?? null;
    if (!configuration) {
      throw new Error(
        `Wiki catalog variant has no configuration: ${selectorVariant.id}`,
      );
    }
    const weaponInfo =
      typeof configuration.weaponInfo === "object" &&
      configuration.weaponInfo !== null &&
      !Array.isArray(configuration.weaponInfo)
        ? configuration.weaponInfo
        : null;
    const projectileName =
      typeof weaponInfo?.projectile === "string"
        ? weaponInfo.projectile
        : null;
    const radialSource = selectorVariant.radialAssetId
      ? runtimeExplosiveCatalog.sources.find(
          ({ id }) => id === selectorVariant.radialAssetId,
        ) ?? null
      : null;
    const ballisticsId =
      configuration.ballisticsId ??
      selectorVariant.ballisticsIds[0] ??
      selectorVariant.id;
    return {
      weaponIndex: -1,
      weaponId: selectorVariant.id,
      runtimeAssetPath: null,
      gunName: selectorVariant.familyLabel,
      displayName: configuration.displayName,
      projectileName,
      matchBasis: "exact-encyclopedia-weapon-ballistics",
      ballisticsId,
      ballisticsWeaponIndex: 0,
      ballisticsModel: catalogVariantBallisticsModel(
        selectorVariant,
        radialSource,
      ),
      ballisticsSource: {
        kind: "encyclopedia-weapon-closure",
        catalogFingerprintSha256:
          weaponCatalogSummary.catalogRevision,
        projectileEvidence: null,
        curveEvidence: [],
        baseCurveFallbacks: [],
      },
      sourceCardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
      sourceRawName: selectorVariant.familyLabel,
      sourceVehicleId:
        `weapon-catalog-${weaponCatalogSummary.catalogRevision}`,
      sourceRecordUrl:
        "catalog:generated/internal/weapon-catalog.json",
      sourceRecordSha256: weaponCatalogSummary.catalogRevision,
      sourceRecordBytes: 0,
      displayNameZh: selectorVariant.displayLabel,
      displayNameEnglish: configuration.displayName,
      sourceKind: "wiki-infantry",
      selectorVariant,
      directFireRoute: true,
      infantryCategory: infantryWeaponCategoryForPenetration(
        directModel.penetrationMm ?? 0,
      ),
      explosiveCategory: radialSource?.category,
      explosiveCategoryLabel: radialSource?.categoryLabel,
      explosiveLayerOrderEvidence: radialSource?.layerOrderEvidence,
      explosiveLayerOrderClosed: radialSource
        ? runtimeExplosiveLayerOrderIsClosed(radialSource)
        : undefined,
      explosiveLayerCount: radialSource?.layers.length,
      searchAliases: [
        selectorVariant.searchText,
        selectorVariant.familyLabel,
        selectorVariant.label,
        configuration.weaponKey,
        configuration.displayName,
        ...configuration.factions,
      ],
    };
  });

const wikiInfantryRadialCatalogVariants =
  weaponCatalogShippingVariants
    .filter(isInfantryDeliveredRadialCatalogVariant)
    .sort((left, right) =>
      left.displayLabel.localeCompare(right.displayLabel, "zh-CN"),
    );

const wikiInfantryCatalogVariants = [
  ...wikiInfantryDirectCatalogVariants,
  ...wikiInfantryRadialCatalogVariants,
];

const wikiInfantryAttackSourceWeapons: RuntimeAttackSourceWeapon[] = [
  ...wikiInfantryDirectAttackSourceWeapons,
  ...wikiInfantryRadialCatalogVariants.map((variant) =>
    runtimeCatalogAttackSourceWeapon(
      variant,
      WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
    ),
  ),
];

const wikiInfantryAttackSource: RuntimeAttackSource = {
  sourceKind: "wiki-infantry",
  sourceCategory: "infantry",
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
  variantRawNames: uniqueSorted(
    wikiInfantryCatalogVariants.map(
      ({ familyLabel }) => familyLabel,
    ),
  ),
  vehicleId:
    `weapon-catalog-${weaponCatalogSummary.catalogRevision}`,
  recordUrl: "catalog:generated/internal/weapon-catalog.json",
  recordSha256: weaponCatalogSummary.catalogRevision,
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

function registerCatalogCategoryAttackSource({
  cardId,
  shareSlug,
  sourceCategory,
  displayName,
  groupId,
  type,
  types,
  groupOrder,
  variants,
}: {
  cardId: string;
  shareSlug: string;
  sourceCategory: "emplaced" | "commander-support";
  displayName: string;
  groupId: string;
  type: string;
  types: string[];
  groupOrder: number;
  variants: WeaponCatalogVariant[];
}): RuntimeAttackSource {
  if (
    variants.length === 0 ||
    normalizeRuntimeAttackSourceShareSlug(shareSlug) !== shareSlug ||
    attackSourceById.has(cardId) ||
    attackSourceById.has(shareSlug)
  ) {
    throw new Error(`Invalid catalog category attack source: ${cardId}`);
  }
  const weapons = variants.map((variant) =>
    runtimeCatalogAttackSourceWeapon(variant, cardId),
  );
  const source: RuntimeAttackSource = {
    sourceKind: "explosive-catalog",
    sourceCategory,
    cardId,
    cardIds: [cardId],
    shareSlug,
    displayName,
    groupId,
    groupName: displayName,
    groupOrder,
    type,
    types: uniqueSorted([
      type,
      displayName,
      ...types,
      ...variants.map((variant) => variant.type),
    ]),
    canonicalRawName: displayName,
    catalogSelectedRawName: displayName,
    canonicalSelectionBasis: "editor-weapon-catalog-category-order",
    variantRawNames: uniqueSorted(
      variants.map((variant) => variant.displayLabel),
    ),
    vehicleId:
      `weapon-catalog-${weaponCatalogSummary.catalogRevision}`,
    recordUrl: "catalog:generated/internal/weapon-catalog.json",
    recordSha256: weaponCatalogSummary.catalogRevision,
    recordBytes: 0,
    directWeaponCount: weapons.length,
    runtimeBackedWeaponCount: 0,
    catalogCompletedWeaponCount: weapons.length,
    baseCurveFallbackWeaponCount: 0,
    weapons,
  };
  attackSourceById.set(cardId, source);
  attackSourceById.set(shareSlug, source);
  return source;
}

const emplacedAttackSource = registerCatalogCategoryAttackSource({
  cardId: "catalog--emplaced-weapons",
  shareSlug: "emplaced-weapons",
  sourceCategory: "emplaced",
  displayName: "架设式武器",
  groupId: "emplaced-weapons",
  type: "Emplaced Weapon",
  types: ["Emplacement", "架设武器", "架设式武器"],
  groupOrder: Number.MAX_SAFE_INTEGER - 2,
  variants: emplacedCatalogVariants,
});

const commanderSupportAttackSource =
  registerCatalogCategoryAttackSource({
    cardId: "catalog--commander-support",
    shareSlug: "commander-support",
    sourceCategory: "commander-support",
    displayName: "指挥官支援",
    groupId: "commander-support",
    type: "Commander Support",
    types: ["Commander Ability", "Airstrike", "Artillery", "指挥官支援"],
    groupOrder: Number.MAX_SAFE_INTEGER - 3,
    variants: commanderSupportCatalogVariants,
  });

export const runtimeAttackSources: readonly RuntimeAttackSource[] = [
  ...runtimeVehicleAttackSources,
  wikiInfantryAttackSource,
  emplacedAttackSource,
  commanderSupportAttackSource,
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
