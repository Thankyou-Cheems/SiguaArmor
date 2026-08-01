import type {
  EditorEvidenceLike,
  EditorField,
  EditorNativeModel,
} from "./editor-native-hit-model.ts";

export const RUNTIME_EXPLOSIVE_CATEGORY_ORDER = [
  "deployable",
  "landmine",
  "hand-grenade",
  "grenade-launcher",
  "rifle-grenade",
  "rocket-launcher",
  "guided-missile",
  "mortar",
  "artillery",
  "vehicle-cannon",
  "vehicle-rocket",
] as const;

export const RUNTIME_EXPLOSIVE_CATALOG_SHA256 =
  "82443a781cd2598b9ba00e48029885ab5ee2f4f18fcf2b6fe37d68c648c06693";

export type RuntimeExplosiveCategory =
  (typeof RUNTIME_EXPLOSIVE_CATEGORY_ORDER)[number];

export interface RuntimeExplosiveLayer {
  id: string;
  label: string;
  shortLabel: string;
  baseDamage: number;
  minimumDamage: number;
  killZoneRadiusMeters: number;
  innerRadiusMeters: number;
  outerRadiusMeters: number;
  falloff: number;
  damageType: string;
  damageTypeClassPath: string | null;
  originNormalOffsetMeters: number;
  onlyDamageMeshes: boolean;
}

export interface RuntimeExplosiveSource {
  id: string;
  label: string;
  shortLabel: string;
  canonicalName: string;
  category: RuntimeExplosiveCategory;
  categoryLabel: string;
  assetPath: string;
  generatedClassPath: string | null;
  nativeClass: string;
  shipping: boolean;
  layers: RuntimeExplosiveLayer[];
  layerOrderEvidence: string;
  impact: {
    damage: number;
    damageType: string;
    damageTypeClassPath: string | null;
    state: "native-unknown";
  } | null;
  weapons: {
    weaponKey: string;
    displayName: string;
    groupDisplayName: string | null;
    type: string | null;
    factions: string[];
  }[];
  factions: string[];
  searchText: string;
  variantAssetPaths: string[];
  maximumRadiusMeters: number;
  maximumBaseDamage: number;
}

export interface RuntimeExplosiveCatalog {
  schemaVersion: "sigua-infantry-explosive-catalog/v1";
  source: {
    censusRunId: string;
    censusProbeSha256: string;
    censusEvidenceSha256: string;
    censusProbeScriptSha256: string;
    editorExecutableSha256: string;
    projectSha256: string;
    runtimePluginSha256: string;
    wikiDataRevision: string;
    readOnlyCdoCensus: true;
    focusedRuntimeEvidence?: {
      c4ActualDetonationRunId: string;
      c4ActualDetonationProbeSha256: string;
      c4SpatialSweepRunId: string;
      c4SpatialSweepProbeSha256: string;
      iedActualDetonationRunId: string;
      iedActualDetonationProbeSha256: string;
      deployableLayerOrderValidationSha256: string;
      deployableLayerOrderStaticRunId: string;
      deployableLayerOrderStaticProbeSha256: string;
      deployableLayerOrderGenericRunId: string;
      deployableLayerOrderGenericProbeSha256: string;
      deployableLayerOrderSensitiveRunId: string;
      deployableLayerOrderSensitiveProbeSha256: string;
    };
  };
  counts: {
    blueprintAssets: number;
    candidates: number;
    censusExplosiveSources: number;
    detonatingSources: number;
    catalogSources: number;
    shippingSources: number;
    linkedWeaponConfigurations: number;
  };
  damageTypes: {
    classPath: string;
    name: string;
    state: string;
    canCauseBleeding: boolean | null;
    damageImpulse: number | null;
    radialDamageVelocityChange: boolean | null;
  }[];
  sources: RuntimeExplosiveSource[];
}

const CATEGORY_SET = new Set<string>(RUNTIME_EXPLOSIVE_CATEGORY_ORDER);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid runtime explosive catalog: ${message}`);
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function validateLayer(layer: RuntimeExplosiveLayer, sourceId: string) {
  assert(layer.id.length > 0, `${sourceId} contains an unnamed layer`);
  assert(
    Number.isFinite(layer.baseDamage) && layer.baseDamage > 0,
    `${sourceId}/${layer.id} base damage is not positive`,
  );
  assert(
    Number.isFinite(layer.minimumDamage) && layer.minimumDamage >= 0,
    `${sourceId}/${layer.id} minimum damage is negative`,
  );
  assert(
    Number.isFinite(layer.innerRadiusMeters) &&
      Number.isFinite(layer.outerRadiusMeters) &&
      layer.innerRadiusMeters >= 0 &&
      layer.outerRadiusMeters >= layer.innerRadiusMeters &&
      layer.outerRadiusMeters > 0,
    `${sourceId}/${layer.id} radii are invalid`,
  );
  assert(
    Number.isFinite(layer.falloff) && layer.falloff >= 0,
    `${sourceId}/${layer.id} falloff is invalid`,
  );
}

export function validateRuntimeExplosiveCatalog(
  value: unknown,
): RuntimeExplosiveCatalog {
  const catalog = value as RuntimeExplosiveCatalog;
  assert(
    catalog?.schemaVersion === "sigua-infantry-explosive-catalog/v1",
    "schema version drifted",
  );
  assert(catalog.source?.readOnlyCdoCensus === true, "census is not read-only");
  for (const [field, hash] of Object.entries({
    censusProbeSha256: catalog.source.censusProbeSha256,
    censusEvidenceSha256: catalog.source.censusEvidenceSha256,
    censusProbeScriptSha256: catalog.source.censusProbeScriptSha256,
    editorExecutableSha256: catalog.source.editorExecutableSha256,
    projectSha256: catalog.source.projectSha256,
    runtimePluginSha256: catalog.source.runtimePluginSha256,
    wikiDataRevision: catalog.source.wikiDataRevision,
  })) {
    assert(isSha256(hash), `${field} is not a SHA-256 digest`);
  }
  assert(
    Array.isArray(catalog.sources) &&
      catalog.counts.catalogSources === catalog.sources.length,
    "catalog source count drifted",
  );
  assert(
    catalog.counts.shippingSources ===
      catalog.sources.filter(({ shipping }) => shipping).length,
    "shipping source count drifted",
  );

  const ids = new Set<string>();
  const canonicalNames = new Set<string>();
  for (const source of catalog.sources) {
    assert(source.id.length > 0 && !ids.has(source.id), `duplicate id ${source.id}`);
    assert(
      source.canonicalName.length > 0 &&
        !canonicalNames.has(source.canonicalName),
      `duplicate canonical name ${source.canonicalName}`,
    );
    assert(
      CATEGORY_SET.has(source.category),
      `${source.canonicalName} has an unknown category`,
    );
    assert(
      Array.isArray(source.layers) && source.layers.length > 0,
      `${source.canonicalName} has no radial layers`,
    );
    for (const layer of source.layers) validateLayer(layer, source.canonicalName);
    ids.add(source.id);
    canonicalNames.add(source.canonicalName);
  }
  return catalog;
}

export function runtimeExplosiveCanonicalName(value: string | null) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^Class'/u, "")
    .replace(/'$/u, "")
    .split(/[/.]/u)
    .at(-1)
    ?.replace(/_C$/u, "") ?? "";
}

export function runtimeExplosiveDamageTypePaths(
  source: RuntimeExplosiveSource,
) {
  return source.layers.map(({ damageTypeClassPath }) => damageTypeClassPath);
}

export function runtimeExplosiveLayerOrderIsClosed(
  source: RuntimeExplosiveSource,
) {
  return !source.layerOrderEvidence.includes("unknown");
}

function editorFieldValue<T>(field: EditorField<T>): T | null {
  if (field === null) return null;
  if (
    typeof field === "object" &&
    "state" in field &&
    "value" in field
  ) {
    return (field as EditorEvidenceLike<T>).value;
  }
  return field as T;
}

export function withRuntimeExplosiveSourceBallistics(
  model: EditorNativeModel,
  weaponIndex: number,
  source: Pick<
    RuntimeExplosiveSource,
    "id" | "layers" | "layerOrderEvidence"
  >,
): EditorNativeModel {
  const weapon = model.weapons[weaponIndex];
  if (!weapon) {
    throw new Error(
      `Cannot attach radial source ${source.id}: weapon index ${weaponIndex} is missing`,
    );
  }
  const projectileIndex = editorFieldValue(weapon.projectileIndex);
  if (
    typeof projectileIndex !== "number" ||
    !Number.isInteger(projectileIndex) ||
    projectileIndex < 0
  ) {
    throw new Error(
      `Cannot attach radial source ${source.id}: projectile index is unresolved`,
    );
  }
  const projectile = model.projectiles[projectileIndex];
  if (!projectile) {
    throw new Error(
      `Cannot attach radial source ${source.id}: projectile ${projectileIndex} is missing`,
    );
  }
  const explosiveFlag = editorFieldValue(projectile.isExplosive);
  if (explosiveFlag === false) {
    throw new Error(
      `Cannot attach radial source ${source.id}: projectile is explicitly non-explosive`,
    );
  }
  const [primaryLayer] = source.layers;
  if (!primaryLayer) {
    throw new Error(
      `Cannot attach radial source ${source.id}: radial layer table is empty`,
    );
  }
  const explosiveLayers = source.layers.map((layer) => ({
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
    impactNormalOffsetCm:
      layer.originNormalOffsetMeters * 100,
    onlyDamageMeshes: layer.onlyDamageMeshes,
    orderEvidence: source.layerOrderEvidence,
  }));
  return {
    ...model,
    projectiles: model.projectiles.map((candidate, index) =>
      index === projectileIndex
        ? {
            ...candidate,
            isExplosive:
              explosiveFlag === true
                ? candidate.isExplosive
                : {
                    state: "derived",
                    value: true,
                    reason: `canonical radial source ${source.id}`,
                  },
            explosiveBaseDamage: primaryLayer.baseDamage,
            explosiveMinimumDamage: primaryLayer.minimumDamage,
            explosiveInnerRadiusCm:
              primaryLayer.innerRadiusMeters * 100,
            explosiveOuterRadiusCm:
              primaryLayer.outerRadiusMeters * 100,
            explosiveFalloff: primaryLayer.falloff,
            impactNormalOffsetCm:
              primaryLayer.originNormalOffsetMeters * 100,
            explosiveLayerOrderEvidence:
              source.layerOrderEvidence,
            explosiveLayers,
          }
        : candidate,
    ),
  };
}
