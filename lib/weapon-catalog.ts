import type { EditorNativeModel } from "./editor-native-hit-model";
import { createWeaponCatalogIdentityResolver } from "./weapon-catalog-identity.mjs";
import { loadWikiWeaponCatalog } from "./wiki-source.ts";

export type WeaponCatalogJsonValue =
  | boolean
  | number
  | string
  | null
  | WeaponCatalogJsonValue[]
  | { [key: string]: WeaponCatalogJsonValue };

export type WeaponCatalogJsonObject = {
  [key: string]: WeaponCatalogJsonValue;
};

export type WeaponVariantKind =
  | "direct-fire"
  | "radial-only"
  | "composite";

export interface WeaponCatalogOverheatProfile {
  state: "observed" | "projected" | "unknown";
  heatPerShot: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  coolingRatePerSecond: number | null;
  triggerStep: number | null;
  shutdownTemperature: number | null;
  triggerAt: number | null;
  unlockTemperature: number | null;
  effectTriggerLower?: number | null;
  effectTriggerUpper?: number | null;
  sourceBuildId?: string;
  sourceAssetPaths?: string[];
  propertyNames?: string[];
  networkTriggerDelayState?: "deferred" | "observed" | "unknown";
  evidence?: string | null;
}

export interface WeaponCatalogWikiFamily {
  displayName: string;
  factions?: string[];
  fullName: string;
  imagePath: string;
  order: number;
  type: string;
  variantCount: number;
  weaponKeys: string[];
  selectorFamilyIds: string[];
}

export type WeaponCatalogWikiConfiguration =
  WeaponCatalogJsonObject & {
    weaponKey: string;
    factions: string[];
    displayName: string;
    selectorVariantIds: string[];
    ballisticsId: string | null;
    exactCurveIds: string[];
    editorVerification: {
      state: string;
      wholeConfigurationVerified: boolean;
      mechanicalSemanticRevision: string;
      rawCandidateCount: number;
      identityMatchedCandidateCount: number;
      identityRejectedCandidates: WeaponCatalogJsonValue[];
    };
  };

export type WeaponCatalogWikiTemplate =
  WeaponCatalogJsonObject & {
    weaponKey: string;
  };

export interface WeaponCatalogFamily {
  id: string;
  label: string;
  sourceKind:
    | "wiki-family"
    | "editor-verified-family"
    | "delivery-family"
    | "radial-asset-family";
  variantIds: string[];
  sourceRefIds: string[];
  wikiSource: {
    configurationKeys: string[];
  } | null;
  factionConflictId: string | null;
}

export interface WeaponCatalogVariant {
  id: string;
  familyId: string;
  familyLabel: string;
  label: string;
  qualifier: string;
  displayLabel: string;
  kind: WeaponVariantKind;
  platformKind:
    | "infantry"
    | "tank"
    | "vehicle"
    | "emplaced"
    | "airstrike";
  type: string;
  selectorVisibility: "shipping" | "debug";
  directDamageModelId: string | null;
  radialAssetId: string | null;
  penetrationKind: "kinetic" | "shaped-charge" | null;
  damageType: string;
  sourceIdentity: {
    kind: string;
    configurationKeys: string[];
    sourceRefIds: string[];
  };
  sourceRefIds: string[];
  identitySourceRefIds?: string[];
  ballisticsSourceRefs: Array<{
    sourceRefId: string;
    configurationKey: string | null;
    ballisticsId: string;
  }>;
  factionClaimIds: string[];
  factionResolution: {
    kind: string;
    factionIds: string[];
    byScope: Record<string, string[]>;
  };
  sourceCounts: {
    wikiConfigurations: number;
    vehicleWeaponSources: number;
    deliverySources: number;
  };
  sourceLabels: string[];
  familyCardIds: string[];
  searchText: string;
  editorVerification: {
    targetId: string;
    qualifier: string;
    exactAssetPaths?: string[];
    evidenceSnapshotRevision?: string;
    evidenceSourceSha256?: string;
    evidenceBoundary: {
      proven: string;
      pie: string;
      dedicatedServer: string;
    };
  } | null;
  configurationKeys: string[];
  ballisticsIds: string[];
  ballisticProfileIds: string[];
  exactCardIds: string[];
  factionIds: string[];
  factionByScope: Record<string, string[]>;
  /** Optional exact or shared thermal facts published by SiguaWiki. */
  overheat?: WeaponCatalogOverheatProfile;
}

export interface WeaponCatalogDirectDamageModel {
  id: string;
  modelRevision: string;
  directImpactDamage: number;
  penetrationMm: number | null;
  penetrationKind: "kinetic" | "shaped-charge" | null;
  traceDistanceAfterPenetrationM: number;
  weaponTraceDistanceAfterPenetrationM?: number;
  maxDistanceM: number;
  damageType: string;
  impactRadialOrder:
    | "not-applicable"
    | "point-before-radial"
    | "secondary-radial-before-point-before-primary-radial";
}

export interface WeaponCatalogRadialLayer {
  id: string;
  label: string;
  shortLabel?: string;
  baseDamage: number;
  minimumDamage: number;
  killZoneRadiusMeters?: number;
  innerRadiusMeters: number;
  outerRadiusMeters: number;
  falloff?: number;
  damageType: string;
  damageTypeClassPath?: string;
  originNormalOffsetMeters?: number;
  onlyDamageMeshes?: boolean;
}

export interface WeaponCatalogRadialDamageModel {
  id: string;
  modelRevision: string;
  layers: WeaponCatalogRadialLayer[];
  layerOrderEvidence: string;
  maximumRadiusMeters: number;
}

export interface WeaponCatalogRadialAsset {
  id: string;
  sourceIdentity: {
    assetPath: string;
    generatedClassPath: string | null;
    canonicalName: string;
  };
  label: string;
  shortLabel: string;
  category: string;
  categoryLabel: string;
  assetPath: string;
  generatedClassPath: string | null;
  variantAssetPaths: string[];
  shipping: boolean;
  selectorVisibility: "shipping" | "debug";
  radialDamageModelId: string;
  damageSummary: {
    mode: "single-layer" | "layered";
    primaryLayer: WeaponCatalogRadialLayer;
    secondaryLayers: WeaponCatalogRadialLayer[];
    displayText: string;
    summedDamage: null;
  };
  impact: {
    damage: number;
    damageType: string;
    damageTypeClassPath: string | null;
    state: "native-unknown";
  } | null;
  evidenceBoundary: string;
}

export interface WeaponCatalogBallisticProfile {
  id: string;
  modelRevision: string;
  model: EditorNativeModel;
  evidence: {
    kind: string;
    catalogFingerprintSha256: string;
    runtimeRecordSha256: string | null;
    runtimeWeaponIndex: number | null;
    curveEvidenceCount: number;
    baseCurveFallbackCount: number;
  };
}

export interface WeaponCatalogSourceRef {
  id: string;
  scope: string;
  exactCardId?: string;
  exactCardIds?: string[];
  familyCardIds?: string[];
  configurationKey?: string;
  ballisticsId?: string;
  sourceRawName?: string;
  weaponClass?: string;
  weaponAssetPath?: string | null;
  generatedClassPath?: string | null;
  projectileClassPath?: string | null;
  factionId?: string;
  [key: string]: unknown;
}

export interface WeaponCatalogVehicleEquipment {
  gunName: string;
  displayName: string;
  turretName: string | null;
  numberOfMags: number | null;
  magSize: number | null;
  muzzleVelocityMps: number | null;
  tacticalReloadDurationSeconds: number | null;
  dryReloadDurationSeconds: number | null;
  roundsPerMinute: number | null;
  projectileName: string | null;
  maxDamageToApply: number | null;
  minDamageToApply: number | null;
  armorPenetrationMm: number | null;
  armorPenetrationCurve: string | null;
  traceDistanceAfterPenM: number | null;
  projectile: {
    impactDamage: number | null;
    damageType: string | null;
    explosiveBaseDamage: number | null;
  };
  mechanics: {
    equipDurationSeconds: number | null;
    timeBetweenShotsSeconds: number | null;
    damageFalloffCurve: string | null;
    minimumRearmSeconds: number | null;
    rearmOneMagazineAtATime: boolean | null;
    rearmByRounds: boolean | null;
    roundsPerRearm: number | null;
  };
}

export interface WeaponCatalogVehicleEquipmentBinding {
  id: string;
  cardId: string;
  rawName: string;
  weaponClass: string;
  turretName: string | null;
  projectileClass: string | null;
  sourceIndex: number;
  weaponVariantIds: string[];
  selectorRelation: {
    state:
      | "exact"
      | "normalized"
      | "non-selector"
      | "evidence-required";
    basis:
      | "exact-card-raw-weapon-projectile-source-ref"
      | "exact-card-variant-ballistics-source-ref"
      | "selector-policy"
      | "fail-closed";
    sourceRefIds: string[];
    sourceRawNames: string[];
    ballisticsIds: string[];
    candidateVariantIds: string[];
    reasonCodes: string[];
  };
  /** Exact assignment-level thermal facts; never infer from a sibling variant. */
  overheat?: WeaponCatalogOverheatProfile;
  equipment: WeaponCatalogVehicleEquipment;
}

interface WeaponCatalog {
  schemaVersion: "sigua-weapon-catalog/v2";
  counts: {
    wikiFamilies: number;
    wikiConfigurations: number;
    wikiTemplates: number;
    selectorFamilies: number;
    selectorVariants: number;
    shippingVariants: number;
    directDamageModels: number;
    radialDamageModels: number;
    radialAssets: number;
    sourceRefs: number;
    factionClaims: number;
    factionConflicts: number;
    exactCurves: number;
    curveBindings: number;
    runtimeBallisticProfiles: number;
    runtimeWeapons: number;
    vehicleEquipmentBindings: number;
    referencedVehicleEquipmentBindings: number;
    exactVehicleEquipmentSelectorRelations: number;
    normalizedVehicleEquipmentSelectorRelations: number;
    nonSelectorVehicleEquipmentBindings: number;
    evidenceRequiredVehicleEquipmentBindings: number;
    ambiguousVehicleEquipmentSelectorRelations: number;
  };
  wiki: {
    summary: {
      groups: number;
      configurations: number;
      templates: number;
      exactCurves: number;
    };
    families: WeaponCatalogWikiFamily[];
    configurations: WeaponCatalogWikiConfiguration[];
    templates: WeaponCatalogWikiTemplate[];
  };
  selector: {
    families: WeaponCatalogFamily[];
    variants: WeaponCatalogVariant[];
  };
  mechanics: {
    directDamageModels: WeaponCatalogDirectDamageModel[];
    radialDamageModels: WeaponCatalogRadialDamageModel[];
    radialAssets: WeaponCatalogRadialAsset[];
    ballisticProfiles: WeaponCatalogBallisticProfile[];
    curves: Array<{
      curveId: string;
      inputUnit: string;
      outputUnit: string;
      keys: Array<{ time: number; value: number }>;
    }>;
    curveBindings: Array<{
      weaponKey: string;
      curves: Array<{ objectPath: string }>;
    }>;
  };
  sources: {
    refs: WeaponCatalogSourceRef[];
    factionClaims: Array<{ id: string }>;
    factionConflicts: Array<{ id: string }>;
  };
  relations: {
    vehicleEquipmentBindings: WeaponCatalogVehicleEquipmentBinding[];
  };
  indexes: {
    configurationVariantIds: Record<string, string[]>;
  };
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Invalid weapon catalog: ${message}`);
  }
}

const weaponCatalog =
  (await loadWikiWeaponCatalog()) as unknown as WeaponCatalog;

assert(
  weaponCatalog.schemaVersion === "sigua-weapon-catalog/v2" &&
    weaponCatalog.counts.selectorVariants ===
      weaponCatalog.selector.variants.length &&
    weaponCatalog.counts.vehicleEquipmentBindings ===
      weaponCatalog.relations.vehicleEquipmentBindings.length,
  "Wiki catalog shape drifted",
);

export const weaponCatalogWikiFamilies =
  weaponCatalog.wiki.families as readonly WeaponCatalogWikiFamily[];
export const weaponCatalogWikiConfigurations =
  weaponCatalog.wiki
    .configurations as readonly WeaponCatalogWikiConfiguration[];
export const weaponCatalogWikiTemplates =
  weaponCatalog.wiki
    .templates as readonly WeaponCatalogWikiTemplate[];
export const weaponCatalogFamilies =
  weaponCatalog.selector
    .families as readonly WeaponCatalogFamily[];
export const weaponCatalogVariants =
  weaponCatalog.selector
    .variants as readonly WeaponCatalogVariant[];
export const weaponCatalogShippingVariants =
  weaponCatalog.selector.variants.filter(
    ({ selectorVisibility }) => selectorVisibility === "shipping",
  );
export const weaponCatalogDirectDamageModels =
  weaponCatalog.mechanics
    .directDamageModels as readonly WeaponCatalogDirectDamageModel[];
export const weaponCatalogRadialDamageModels =
  weaponCatalog.mechanics
    .radialDamageModels as readonly WeaponCatalogRadialDamageModel[];
export const weaponCatalogRadialAssets =
  weaponCatalog.mechanics
    .radialAssets as readonly WeaponCatalogRadialAsset[];
export const weaponCatalogSourceRefs =
  weaponCatalog.sources.refs as readonly WeaponCatalogSourceRef[];
export const weaponCatalogBallisticProfiles =
  weaponCatalog.mechanics
    .ballisticProfiles as readonly WeaponCatalogBallisticProfile[];
export const weaponCatalogVehicleEquipmentBindings =
  weaponCatalog.relations
    .vehicleEquipmentBindings as readonly WeaponCatalogVehicleEquipmentBinding[];
export const weaponCatalogCurves = Object.fromEntries(
  weaponCatalog.mechanics.curves.map((curve) => [
    curve.curveId,
    curve,
  ]),
);

const wikiConfigurationByKey = new Map(
  weaponCatalog.wiki.configurations.map((configuration) => [
    configuration.weaponKey,
    configuration,
  ]),
);
const familyById = new Map(
  weaponCatalog.selector.families.map((family) => [
    family.id,
    family,
  ]),
);
const identityResolver =
  createWeaponCatalogIdentityResolver(weaponCatalog);
const variantById = new Map(
  weaponCatalog.selector.variants.map((variant) => [
    variant.id,
    variant,
  ]),
);
const directModelById = new Map(
  weaponCatalog.mechanics.directDamageModels.map((model) => [
    model.id,
    model,
  ]),
);
const radialModelById = new Map(
  weaponCatalog.mechanics.radialDamageModels.map((model) => [
    model.id,
    model,
  ]),
);
const radialAssetById = new Map(
  weaponCatalog.mechanics.radialAssets.map((asset) => [
    asset.id,
    asset,
  ]),
);
const ballisticProfileById = new Map(
  weaponCatalog.mechanics.ballisticProfiles.map((profile) => [
    profile.id,
    profile,
  ]),
);
const sourceRefById = new Map(
  weaponCatalog.sources.refs.map((sourceRef) => [
    sourceRef.id,
    sourceRef,
  ]),
);
const vehicleEquipmentBindingById = new Map(
  weaponCatalog.relations.vehicleEquipmentBindings.map(
    (binding) => [binding.id, binding],
  ),
);
const vehicleEquipmentBindingsByIdentity = new Map<
  string,
  WeaponCatalogVehicleEquipmentBinding[]
>();
for (const binding of weaponCatalog.relations
  .vehicleEquipmentBindings) {
  assert(
    binding.weaponVariantIds.every((variantId) =>
      variantById.has(variantId),
    ),
    `${binding.id} references a missing weapon variant`,
  );
  const key = `${binding.cardId}\u0000${binding.rawName}`;
  const bindings =
    vehicleEquipmentBindingsByIdentity.get(key) ?? [];
  bindings.push(binding);
  vehicleEquipmentBindingsByIdentity.set(key, bindings);
}
const familyByWikiConfigurationKey = new Map<
  string,
  WeaponCatalogFamily
>();

for (const family of weaponCatalog.selector.families) {
  for (
    const configurationKey of
      family.wikiSource?.configurationKeys ?? []
  ) {
    familyByWikiConfigurationKey.set(configurationKey, family);
  }
}

export function weaponCatalogWikiConfigurationForKey(
  weaponKey: string,
) {
  return wikiConfigurationByKey.get(weaponKey) ?? null;
}

export function weaponCatalogVariantForId(id: string) {
  return identityResolver.variantForId(id) as
    | WeaponCatalogVariant
    | null;
}

export function weaponCatalogVehicleEquipmentBindingForId(
  id: string,
) {
  return vehicleEquipmentBindingById.get(id) ?? null;
}

export function weaponCatalogVehicleEquipmentBindingsForExactVehicle(
  cardId: string,
  rawName: string,
) {
  return (
    vehicleEquipmentBindingsByIdentity.get(
      `${cardId}\u0000${rawName}`,
    ) ?? []
  );
}

export function weaponCatalogVehicleEquipmentForExactVehicle(
  cardId: string,
  rawName: string,
) {
  return weaponCatalogVehicleEquipmentBindingsForExactVehicle(
    cardId,
    rawName,
  ).map(({ equipment }) => equipment);
}

export function weaponCatalogFamilyForVariant(
  variant: WeaponCatalogVariant,
) {
  return familyById.get(variant.familyId) ?? null;
}

export function weaponCatalogFamilyForWikiConfiguration(
  configurationKey: string,
) {
  return familyByWikiConfigurationKey.get(configurationKey) ?? null;
}

export function weaponCatalogVariantsForWikiConfigurations(
  configurationKeys: readonly string[],
) {
  return identityResolver.variantsForWikiConfigurations(
    configurationKeys,
  ) as WeaponCatalogVariant[];
}

export function weaponCatalogVariantForWiki(
  configurationKey: string,
  ballisticsId: string,
) {
  return identityResolver.variantForWiki(
    configurationKey,
    ballisticsId,
  ) as WeaponCatalogVariant | null;
}

export function weaponCatalogVariantsForExactVehicle(
  cardId: string,
  rawName: string,
) {
  return identityResolver.variantsForExactVehicle(
    cardId,
    rawName,
  ) as WeaponCatalogVariant[];
}

export function weaponCatalogVariantForVehicle(
  cardId: string,
  rawName: string,
  ballisticsId: string,
) {
  return identityResolver.variantForVehicle(
    cardId,
    rawName,
    ballisticsId,
  ) as WeaponCatalogVariant | null;
}

export function weaponCatalogBallisticProfileForId(
  ballisticsId: string,
) {
  return ballisticProfileById.get(ballisticsId) ?? null;
}

export function weaponCatalogBallisticProfileForVariant(
  variant: WeaponCatalogVariant | null,
  preferredBallisticsId?: string | null,
) {
  if (!variant) return null;
  if (
    preferredBallisticsId &&
    variant.ballisticProfileIds.includes(preferredBallisticsId)
  ) {
    return (
      ballisticProfileById.get(preferredBallisticsId) ?? null
    );
  }
  return variant.ballisticProfileIds.length === 1
    ? ballisticProfileById.get(variant.ballisticProfileIds[0]) ??
        null
    : null;
}

export function weaponCatalogDirectModelForVariant(
  variant: WeaponCatalogVariant | null,
) {
  return variant?.directDamageModelId
    ? directModelById.get(variant.directDamageModelId) ?? null
    : null;
}

export function weaponCatalogRadialAssetForVariant(
  variant: WeaponCatalogVariant | null,
) {
  return variant?.radialAssetId
    ? radialAssetById.get(variant.radialAssetId) ?? null
    : null;
}

export function weaponCatalogRadialModelForAsset(
  asset: WeaponCatalogRadialAsset | null,
) {
  return asset
    ? radialModelById.get(asset.radialDamageModelId) ?? null
    : null;
}

export function weaponCatalogSourceRefsForVariant(
  variant: WeaponCatalogVariant,
) {
  return variant.sourceRefIds.map((sourceRefId) => {
    const sourceRef = sourceRefById.get(sourceRefId);
    assert(sourceRef, `${variant.id} has no source ${sourceRefId}`);
    return sourceRef;
  });
}
