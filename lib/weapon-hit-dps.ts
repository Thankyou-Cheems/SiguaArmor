import {
  editorNativeEffectiveDamageAmount,
  type EditorNativeShotResult,
} from "./editor-native-hit-model.ts";
import {
  optimizeWeaponRhythm,
  type WeaponDpsOptimization,
  type WeaponDpsOptimizationOptions,
  type WeaponDpsTargetBurningProfile,
  type WeaponDpsWeapon,
} from "./weapon-dps-model.ts";

export interface WeaponHitDpsTarget {
  key: string;
  poolKind: string;
  maxHealth: number;
  damagePerShot: number;
  targetBurning?: WeaponDpsTargetBurningProfile | null;
}

export interface WeaponHitDpsEstimate extends WeaponHitDpsTarget {
  optimization: WeaponDpsOptimization;
}

interface VehicleTargetBurningSource {
  burning: null | {
    state: "observed" | "derived" | "projected" | "unknown";
    startHealthFraction: number;
    healthFractionPerSecond: number;
    tickIntervalSeconds: number;
    startDelaySeconds: number;
    damageClass: string;
  };
  damageResistances: readonly {
    damageClass: string;
    modifier: number | null;
  }[];
}

export function vehicleTargetBurningProfile(
  source: VehicleTargetBurningSource | null | undefined,
): WeaponDpsTargetBurningProfile | null {
  const burning = source?.burning;
  if (!burning || burning.state === "unknown") return null;
  const damageProfiles = source.damageResistances.filter(
    ({ damageClass }) => damageClass === burning.damageClass,
  );
  if (damageProfiles.length !== 1) return null;
  const damageModifier = damageProfiles[0].modifier;
  if (
    damageModifier === null ||
    !Number.isFinite(damageModifier) ||
    damageModifier < 0
  ) return null;
  return {
    state: burning.state,
    startHealthFraction: burning.startHealthFraction,
    healthFractionPerSecond: burning.healthFractionPerSecond,
    damageModifier,
    tickIntervalSeconds: burning.tickIntervalSeconds,
    startDelaySeconds: burning.startDelaySeconds,
  };
}

function poolKindForClickedSemanticKind(semanticKind: string | null) {
  if (semanticKind === "armor" || semanticKind === "penetration-blocker") return "hull";
  if (
    semanticKind === "engine" ||
    semanticKind === "ammo-rack" ||
    semanticKind === "track" ||
    semanticKind === "wheel" ||
    semanticKind === "seat"
  ) return semanticKind;
  return null;
}

export function selectPrimaryWeaponHitDpsTarget<T extends WeaponHitDpsTarget>(
  targets: readonly T[],
  clickedSemanticKind: string | null,
): T | null {
  const preferredPoolKind = poolKindForClickedSemanticKind(clickedSemanticKind);
  return (
    (preferredPoolKind
      ? targets.find(({ poolKind }) => poolKind === preferredPoolKind)
      : null) ??
    targets.find(({ poolKind }) => poolKind === "hull") ??
    targets[0] ??
    null
  );
}

export function singleShotWeaponHitTarget<T extends WeaponHitDpsTarget>(
  targets: readonly T[],
  clickedSemanticKind: string | null,
): T | null {
  const primary = selectPrimaryWeaponHitDpsTarget(targets, clickedSemanticKind);
  return primary && primary.damagePerShot >= primary.maxHealth ? primary : null;
}

/**
 * Collapse one clicked ray's resolved damage events by exact health-pool
 * identity. The result is deliberately per-pool: hull and engine damage from
 * the same shell must never become one fake target.
 */
export function targetPoolsForShot(
  result: Pick<EditorNativeShotResult, "damage">,
  targetBurning: WeaponDpsTargetBurningProfile | null = null,
): WeaponHitDpsTarget[] {
  const targets = new Map<string, WeaponHitDpsTarget>();
  for (const event of result.damage) {
    const damage = editorNativeEffectiveDamageAmount(event);
    if (
      damage <= 0 ||
      event.maxHealth === null ||
      !Number.isFinite(event.maxHealth) ||
      event.maxHealth <= 0
    ) continue;
    const key = `${event.poolIndex}:${event.poolId}`;
    const existing = targets.get(key);
    if (existing) {
      existing.damagePerShot += damage;
      continue;
    }
    targets.set(key, {
      key,
      poolKind: event.poolKind,
      maxHealth: event.maxHealth,
      damagePerShot: damage,
      ...(event.poolKind === "hull" && targetBurning
        ? { targetBurning }
        : {}),
    });
  }
  return [...targets.values()].sort((left, right) => left.key.localeCompare(right.key, "en"));
}

export function estimateWeaponHitDps(
  weapon: WeaponDpsWeapon,
  result: Pick<EditorNativeShotResult, "damage">,
  options: WeaponDpsOptimizationOptions,
): WeaponHitDpsEstimate[] {
  return targetPoolsForShot(result, options.targetBurning ?? null).map((target) => ({
    ...target,
    optimization: optimizeWeaponRhythm(
      { ...weapon, damagePerShot: target.damagePerShot },
      {
        ...options,
        targetHealth: target.maxHealth,
        targetBurning: target.targetBurning ?? null,
      },
    ),
  }));
}
