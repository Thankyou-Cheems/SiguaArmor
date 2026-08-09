import type {
  EditorEvidenceLike,
  EditorField,
  EditorNativeImpactRadialOrder,
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
  impactRadialOrder?: EditorNativeImpactRadialOrder,
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
            ...(impactRadialOrder
              ? { impactRadialOrder }
              : {}),
            explosiveLayers,
          }
        : candidate,
    ),
  };
}
