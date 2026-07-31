import weaponCatalogJson from "../app/wiki-weapon-catalog.json";
import type {
  WeaponCatalogDirectDamageModel,
  WeaponCatalogFamily,
  WeaponCatalogJsonObject,
  WeaponCatalogJsonValue,
  WeaponCatalogRadialAsset,
  WeaponCatalogRadialDamageModel,
  WeaponCatalogVariant,
  WeaponCatalogWikiConfiguration,
  WeaponCatalogWikiFamily,
  WeaponCatalogWikiTemplate,
} from "./weapon-catalog";

export type {
  WeaponCatalogJsonObject,
  WeaponCatalogJsonValue,
  WeaponCatalogVariant,
  WeaponCatalogWikiConfiguration,
  WeaponCatalogWikiFamily,
  WeaponCatalogWikiTemplate,
};

interface WikiWeaponProjection {
  schemaVersion: "sigua-weapon-client-projection/v1";
  projectionKind: "wiki";
  projectionRevision: string;
  catalog: {
    schemaVersion: "sigua-weapon-catalog/v2";
    catalogRevision: string;
    dataRevision: string;
    sourceBuildId: string;
    bytes: number;
    sha256: string;
  };
  counts: {
    wikiFamilies: number;
    wikiConfigurations: number;
    wikiTemplates: number;
    selectorFamilies: number;
    selectorVariants: number;
    directDamageModels: number;
    radialDamageModels: number;
    radialAssets: number;
    curves: number;
  };
  data: {
    wikiFamilies: WeaponCatalogWikiFamily[];
    wikiConfigurations: WeaponCatalogWikiConfiguration[];
    wikiTemplates: WeaponCatalogWikiTemplate[];
    selectorFamilies: WeaponCatalogFamily[];
    selectorVariants: WeaponCatalogVariant[];
    directDamageModels: WeaponCatalogDirectDamageModel[];
    radialDamageModels: WeaponCatalogRadialDamageModel[];
    radialAssets: WeaponCatalogRadialAsset[];
    curves: Array<{
      curveId: string;
      inputUnit: string;
      outputUnit: string;
      keys: Array<{ time: number; value: number }>;
    }>;
  };
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Wiki weapon projection: ${message}`);
  }
}

const projection =
  weaponCatalogJson as unknown as WikiWeaponProjection;
assert(
  projection.schemaVersion ===
    "sigua-weapon-client-projection/v1" &&
    projection.projectionKind === "wiki" &&
    projection.catalog.schemaVersion ===
      "sigua-weapon-catalog/v2" &&
    /^[a-f0-9]{64}$/u.test(
      projection.catalog.catalogRevision,
    ) &&
    /^[a-f0-9]{64}$/u.test(projection.catalog.sha256) &&
    /^[a-f0-9]{64}$/u.test(projection.projectionRevision),
  "identity drifted",
);
assert(
  projection.counts.wikiFamilies ===
      projection.data.wikiFamilies.length &&
    projection.counts.wikiConfigurations ===
      projection.data.wikiConfigurations.length &&
    projection.counts.wikiTemplates ===
      projection.data.wikiTemplates.length &&
    projection.counts.selectorFamilies ===
      projection.data.selectorFamilies.length &&
    projection.counts.selectorVariants ===
      projection.data.selectorVariants.length &&
    projection.counts.directDamageModels ===
      projection.data.directDamageModels.length &&
    projection.counts.radialDamageModels ===
      projection.data.radialDamageModels.length &&
    projection.counts.radialAssets ===
      projection.data.radialAssets.length &&
    projection.counts.curves ===
      projection.data.curves.length,
  "counts drifted",
);

export const weaponCatalogSummary = {
  schemaVersion: projection.catalog.schemaVersion,
  catalogRevision: projection.catalog.catalogRevision,
  dataRevision: projection.catalog.dataRevision,
  sourceBuildId: projection.catalog.sourceBuildId,
  projectionRevision: projection.projectionRevision,
  counts: {
    wikiFamilies: projection.counts.wikiFamilies,
    wikiConfigurations:
      projection.counts.wikiConfigurations,
    wikiTemplates: projection.counts.wikiTemplates,
    exactCurves: projection.counts.curves,
  },
} as const;

export const weaponCatalogWikiFamilies =
  projection.data.wikiFamilies as readonly WeaponCatalogWikiFamily[];
export const weaponCatalogWikiConfigurations =
  projection.data
    .wikiConfigurations as readonly WeaponCatalogWikiConfiguration[];
export const weaponCatalogWikiTemplates =
  projection.data
    .wikiTemplates as readonly WeaponCatalogWikiTemplate[];
export const weaponCatalogCurves = Object.fromEntries(
  projection.data.curves.map((curve) => [
    curve.curveId,
    curve,
  ]),
);

const variantById = new Map(
  projection.data.selectorVariants.map((variant) => [
    variant.id,
    variant,
  ]),
);
const variantsByWikiConfiguration = new Map<
  string,
  WeaponCatalogVariant[]
>();
for (const variant of projection.data.selectorVariants) {
  for (const configurationKey of variant.configurationKeys) {
    const variants =
      variantsByWikiConfiguration.get(configurationKey) ?? [];
    variants.push(variant);
    variantsByWikiConfiguration.set(
      configurationKey,
      variants,
    );
  }
}
const directModelById = new Map(
  projection.data.directDamageModels.map((model) => [
    model.id,
    model,
  ]),
);
const radialAssetById = new Map(
  projection.data.radialAssets.map((asset) => [
    asset.id,
    asset,
  ]),
);

export function weaponCatalogVariantForId(id: string) {
  return variantById.get(id) ?? null;
}

export function weaponCatalogVariantsForWikiConfigurations(
  configurationKeys: readonly string[],
) {
  const variants = new Map<string, WeaponCatalogVariant>();
  for (const configurationKey of configurationKeys) {
    for (
      const variant of
        variantsByWikiConfiguration.get(configurationKey) ?? []
    ) {
      variants.set(variant.id, variant);
    }
  }
  return [...variants.values()];
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
