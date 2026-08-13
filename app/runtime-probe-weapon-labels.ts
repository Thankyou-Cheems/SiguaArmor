import { weaponNameZh } from "../lib/weapon-display-name.ts";
import {
  editorNativeDamageWeaponIndices,
  type EditorNativeModel,
} from "../lib/editor-native-hit-model.ts";
import {
  runtimeExplosiveCanonicalName,
  runtimeExplosiveLayerOrderIsClosed,
  type RuntimeExplosiveCategory,
  type RuntimeExplosiveSource,
} from "../lib/runtime-explosive-catalog.ts";
import {
  weaponCatalogBallisticProfileForVariant,
  weaponCatalogCurves,
  weaponCatalogDirectModelForVariant,
  weaponCatalogRadialAssetForVariant,
  weaponCatalogRadialModelForAsset,
  weaponCatalogShippingVariants,
  weaponCatalogSourceRefsForVariant,
  weaponCatalogVariantsForExactVehicle,
  weaponCatalogWikiConfigurationForKey,
  type WeaponCatalogVariant,
} from "../lib/weapon-catalog.ts";
import {
  buildRuntimeAttackSourceShareSlug,
  normalizeRuntimeAttackSourceShareSlug,
} from "../lib/runtime-attack-source-share.mjs";
import type {
  CatalogSearchRecord,
  CatalogTopologyIndex,
} from "./catalog-types.ts";
import catalogIndexJson from "../generated/catalog-index.json";
import { loadWikiFactionCatalog, loadWikiVehicleCatalog } from "../lib/wiki-source.ts";
import { buildCatalogIndexFromWiki } from "./wiki-vehicle-catalog.ts";
import { composeCatalogVariantBallisticsModel } from "./runtime-attack-ballistics-model.ts";

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
  variantRawNames: string[];
  catalogCompletedWeaponCount: number;
  weapons: RuntimeAttackSourceWeaponRecord[];
}

interface RuntimeAttackBallisticsSource {
  kind:
    | "encyclopedia-weapon-closure"
    | "editor-explosive-catalog";
}

interface RuntimeAttackSourceWeaponRecord {
  weaponIndex: number;
  weaponId: string;
  runtimeAssetPath: string | null;
  gunName: string;
  displayName: string;
  projectileName: string | null;
  matchBasis: string;
  ballisticsId: string;
  ballisticsWeaponIndex: 0;
  ballisticsModel: EditorNativeModel;
  ballisticsSource: RuntimeAttackBallisticsSource;
  sourceCardId: string;
  sourceRawName: string;
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

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

const runtimeExplosiveCatalog = {
  sources: weaponCatalogShippingVariants
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
        ),
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
  const ballisticProfile = weaponCatalogBallisticProfileForVariant(variant);
  const profileWeapon = ballisticProfile?.model.weapons.length === 1
    ? ballisticProfile.model.weapons[0]
    : null;
  const exactCurves = (configuration?.exactCurveIds ?? [])
    .map((curveId) => weaponCatalogCurves[curveId])
    .filter(Boolean);
  return composeCatalogVariantBallisticsModel({
    variantId: variant.id,
    directModel,
    ballisticProfile: profileWeapon ? ballisticProfile : null,
    configurationCurves: exactCurves,
    radialSource,
  });
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
  sourceKind: RuntimeAttackSourceWeapon["sourceKind"] =
    "explosive-catalog",
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
    },
    sourceCardId,
    sourceRawName: selectorVariant.familyLabel,
    displayNameZh: weaponNameZh(selectorVariant.displayLabel),
    displayNameEnglish: selectorVariant.label,
    sourceKind,
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
      weaponNameZh(selectorVariant.familyLabel),
      selectorVariant.label,
      weaponNameZh(selectorVariant.label),
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

const attackSourceById = new Map<string, RuntimeAttackSource>();
const productCatalogIndex = buildCatalogIndexFromWiki(
  await loadWikiVehicleCatalog(),
  await loadWikiFactionCatalog(),
  catalogIndexJson as unknown as CatalogTopologyIndex,
  "international",
);
if (
  productCatalogIndex.schemaVersion !== "1.0.0" ||
  !Array.isArray(productCatalogIndex.records)
) {
  throw new Error("Invalid Armor card catalog");
}

const groupOrderById = new Map(
  productCatalogIndex.groups.map(({ id, order }) => [id, order]),
);

function vehicleWeaponVariants(record: CatalogSearchRecord) {
  const byId = new Map<string, WeaponCatalogVariant>();
  for (const variant of record.variants) {
    for (
      const weapon of weaponCatalogVariantsForExactVehicle(
        record.promoEntryId,
        variant.sourceRawName,
      )
    ) {
      if (
        weapon.selectorVisibility === "shipping" &&
        (weapon.directDamageModelId !== null ||
          weapon.radialAssetId !== null)
      ) {
        byId.set(weapon.id, weapon);
      }
    }
  }
  for (const weapon of weaponCatalogShippingVariants) {
    if (
      isVehicleDeliveredRadialCatalogVariant(weapon) &&
      weapon.exactCardIds.includes(record.promoEntryId)
    ) {
      byId.set(weapon.id, weapon);
    }
  }
  return [...byId.values()];
}

function vehicleAttackSource(
  record: CatalogSearchRecord,
): RuntimeAttackSource | null {
  const variants = vehicleWeaponVariants(record);
  const firstVariant = record.variants[0];
  const canonicalRawName =
    record.selectedRawName ?? firstVariant?.sourceRawName;
  if (!firstVariant || !canonicalRawName || variants.length === 0) {
    return null;
  }
  const cardIds = uniqueSorted(
    record.variants.map(({ cardId }) => cardId),
  );
  const cardId = cardIds.includes(record.defaultCardId)
    ? record.defaultCardId
    : firstVariant.cardId;
  const shareSlug = buildRuntimeAttackSourceShareSlug({
    groupId: record.official.groupId,
    canonicalRawName,
  });
  if (
    normalizeRuntimeAttackSourceShareSlug(shareSlug) !== shareSlug ||
    attackSourceById.has(record.promoEntryId) ||
    cardIds.some((candidate) => attackSourceById.has(candidate)) ||
    attackSourceById.has(shareSlug)
  ) {
    throw new Error(`Duplicate Armor attack source: ${record.promoEntryId}`);
  }
  const weapons = variants.map((variant) =>
    runtimeCatalogAttackSourceWeapon(variant, cardId, "vehicle"),
  );
  const source: RuntimeAttackSource = {
    cardId,
    cardIds,
    shareSlug,
    sourceKind: "vehicle",
    sourceCategory: "vehicle",
    displayName:
      record.selectedDisplayName ?? record.official.nameZh,
    groupId: record.official.groupId,
    groupName: record.official.groupNameZh,
    groupOrder:
      groupOrderById.get(record.official.groupId) ??
      Number.MAX_SAFE_INTEGER,
    type: record.official.typeZh,
    types: uniqueSorted([
      record.official.typeZh,
      ...variants.map(({ type }) => type),
    ]),
    canonicalRawName,
    variantRawNames: uniqueSorted(
      record.variants.map(({ sourceRawName }) => sourceRawName),
    ),
    catalogCompletedWeaponCount: weapons.length,
    weapons,
  };
  for (const candidate of cardIds) {
    attackSourceById.set(candidate, source);
  }
  attackSourceById.set(record.promoEntryId, source);
  attackSourceById.set(shareSlug, source);
  return source;
}

const runtimeVehicleAttackSources: readonly RuntimeAttackSource[] =
  productCatalogIndex.records
    .map(vehicleAttackSource)
    .filter((source): source is RuntimeAttackSource => source !== null);

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
      },
      sourceCardId: WIKI_INFANTRY_ATTACK_SOURCE_CARD_ID,
      sourceRawName: selectorVariant.familyLabel,
      displayNameZh: weaponNameZh(selectorVariant.displayLabel),
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
        weaponNameZh(selectorVariant.familyLabel),
        selectorVariant.label,
        weaponNameZh(selectorVariant.label),
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
  variantRawNames: uniqueSorted(
    wikiInfantryCatalogVariants.map(
      ({ familyLabel }) => familyLabel,
    ),
  ),
  catalogCompletedWeaponCount: wikiInfantryAttackSourceWeapons.length,
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
    variantRawNames: uniqueSorted(
      variants.map((variant) => variant.displayLabel),
    ),
    catalogCompletedWeaponCount: weapons.length,
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
