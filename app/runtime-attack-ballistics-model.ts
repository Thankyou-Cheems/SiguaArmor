import {
  maxEditorNativeWeaponDistanceM,
  type EditorField,
  type EditorNativeCurveRecord,
  type EditorNativeModel,
  type EditorNativeProjectileRecord,
} from "../lib/editor-native-hit-model.ts";
import type { RuntimeExplosiveSource } from "../lib/runtime-explosive-catalog.ts";
import type {
  WeaponCatalogBallisticProfile,
  WeaponCatalogDirectDamageModel,
  WeaponCatalogSourceRef,
  WeaponCatalogVariant,
} from "../lib/weapon-catalog.ts";
import { MAX_VIEWER_TARGET_DISTANCE_M } from "../lib/catalog-navigation.mjs";

function fieldValue<T>(field: EditorField<T>) {
  if (field !== null && typeof field === "object" && "value" in field) {
    return field.value;
  }
  return field;
}

export type RuntimeAttackDecayState = "available" | "none" | "unknown";

export interface RuntimeAttackDistanceControl {
  damageDecay: RuntimeAttackDecayState;
  penetrationDecay: RuntimeAttackDecayState;
  enabled: boolean;
  maxDistanceM: number;
}

export function preferredBallisticsIdForExactCard(
  variant: Pick<WeaponCatalogVariant, "ballisticsIds">,
  sourceRefs: readonly Pick<
    WeaponCatalogSourceRef,
    "exactCardId" | "exactCardIds" | "ballisticsId"
  >[],
  cardId: string,
) {
  const variantBallisticsIds = new Set(variant.ballisticsIds);
  const candidates = new Set(
    sourceRefs
      .filter((sourceRef) =>
        sourceRef.exactCardId === cardId ||
        sourceRef.exactCardIds?.includes(cardId),
      )
      .map((sourceRef) => sourceRef.ballisticsId ?? null)
      .filter((ballisticsId): ballisticsId is string =>
        ballisticsId !== null && variantBallisticsIds.has(ballisticsId),
      ),
  );
  return candidates.size === 1 ? [...candidates][0] : null;
}

function curveDecayState(
  field: EditorField<number>,
  curves: readonly EditorNativeCurveRecord[],
): RuntimeAttackDecayState {
  if (
    field !== null &&
    typeof field === "object" &&
    "state" in field &&
    field.state === "absent"
  ) return "none";
  const index = fieldValue(field);
  if (typeof index !== "number") return "unknown";
  const curve = curves[index];
  const keys = curve ? fieldValue(curve.keys) : null;
  return Array.isArray(keys) && keys.length > 0 ? "available" : "unknown";
}

export function runtimeAttackDistanceControl(
  model: EditorNativeModel,
  weaponIndex: number,
): RuntimeAttackDistanceControl {
  const weapon = model.weapons[weaponIndex];
  if (!weapon) {
    return {
      damageDecay: "unknown",
      penetrationDecay: "unknown",
      enabled: false,
      maxDistanceM: 0,
    };
  }
  const damageDecay = curveDecayState(weapon.damageFalloffCurveIndex, model.curves);
  const penetrationDecay = curveDecayState(
    weapon.armorPenetrationCurveIndex,
    model.curves,
  );
  const curveDistanceM = Math.min(
    MAX_VIEWER_TARGET_DISTANCE_M,
    maxEditorNativeWeaponDistanceM(model, weaponIndex),
  );
  const enabled = curveDistanceM > 0 && (
    damageDecay === "available" || penetrationDecay === "available"
  );
  return {
    damageDecay,
    penetrationDecay,
    enabled,
    maxDistanceM: enabled ? curveDistanceM : 0,
  };
}

export function runtimeAttackTargetDistanceLimitM(
  model: EditorNativeModel,
  weaponIndex: number,
) {
  return runtimeAttackDistanceControl(model, weaponIndex).maxDistanceM;
}

export function composeCatalogVariantBallisticsModel({
  variantId,
  directModel,
  ballisticProfile,
  configurationCurves,
  radialSource,
}: {
  variantId: string;
  directModel: WeaponCatalogDirectDamageModel;
  ballisticProfile: WeaponCatalogBallisticProfile | null;
  configurationCurves: readonly EditorNativeCurveRecord[];
  radialSource: RuntimeExplosiveSource | null;
}): EditorNativeModel {
  const profileWeapon = ballisticProfile?.model.weapons.length === 1
    ? ballisticProfile.model.weapons[0]
    : null;
  const profileProjectileIndex = profileWeapon
    ? fieldValue(profileWeapon.projectileIndex)
    : null;
  const profileProjectile =
    typeof profileProjectileIndex === "number"
      ? ballisticProfile?.model.projectiles[profileProjectileIndex] ?? null
      : ballisticProfile?.model.projectiles.length === 1
        ? ballisticProfile.model.projectiles[0]
        : null;
  const sourcePenetrationCurve = configurationCurves.find(
    ({ outputUnit }) => outputUnit === "millimeters",
  ) ?? null;
  const sourceDamageCurve = configurationCurves.find(
    ({ outputUnit }) => outputUnit === "damage",
  ) ?? null;
  const curves = profileWeapon
    ? [...ballisticProfile!.model.curves]
    : [];
  const penetrationCurveIndex = profileWeapon
    ? profileWeapon.armorPenetrationCurveIndex
    : sourcePenetrationCurve
      ? curves.push(sourcePenetrationCurve) - 1
      : null;
  const damageCurveIndex = profileWeapon
    ? profileWeapon.damageFalloffCurveIndex
    : sourceDamageCurve
      ? curves.push(sourceDamageCurve) - 1
      : null;
  const sourceDamageKeys = sourceDamageCurve
    ? fieldValue(sourceDamageCurve.keys)
    : null;
  const firstRadialLayer = radialSource?.layers[0] ?? null;
  const explosiveFields: Partial<EditorNativeProjectileRecord> =
    radialSource && firstRadialLayer
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
            damageTypePath: layer.damageTypeClassPath ?? layer.damageType,
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
      ...profileWeapon,
      weaponId: variantId,
      role: "wiki-catalog-direct-hit",
      projectileIndex: 0,
      armorPenetrationDepthMm:
        profileWeapon?.armorPenetrationDepthMm ?? directModel.penetrationMm ?? 0,
      armorPenetrationCurveIndex: penetrationCurveIndex === null
        ? { value: null, state: "absent" }
        : penetrationCurveIndex,
      damageFalloffCurveIndex: damageCurveIndex === null
        ? { value: null, state: "absent" }
        : damageCurveIndex,
      maxDamage: profileWeapon?.maxDamage ?? directModel.directImpactDamage,
      minDamage:
        profileWeapon?.minDamage ??
        sourceDamageKeys?.at(-1)?.value ??
        directModel.directImpactDamage,
      traceDistanceAfterPenetrationMeters:
        profileWeapon?.traceDistanceAfterPenetrationMeters ??
        directModel.weaponTraceDistanceAfterPenetrationM ??
        directModel.traceDistanceAfterPenetrationM,
    }],
    projectiles: [{
      ...profileProjectile,
      projectileId: `${variantId}:projectile`,
      role: "wiki-catalog-projectile",
      damageTypePath:
        profileProjectile?.damageTypePath ?? directModel.damageType,
      armorPenetrationDepthMm:
        profileProjectile?.armorPenetrationDepthMm ??
        directModel.penetrationMm ?? 0,
      impactDamage:
        profileProjectile?.impactDamage ?? (
          penetrationCurveIndex !== null || damageCurveIndex !== null
            ? { value: null, state: "absent" }
            : directModel.directImpactDamage
        ),
      isExplosive: radialSource !== null,
      impactRadialOrder:
        directModel.impactRadialOrder === "not-applicable"
          ? null
          : directModel.impactRadialOrder,
      traceDistanceAfterPenetrationMeters:
        profileProjectile?.traceDistanceAfterPenetrationMeters ??
        directModel.traceDistanceAfterPenetrationM,
      ...explosiveFields,
    }],
    curves,
  };
}
