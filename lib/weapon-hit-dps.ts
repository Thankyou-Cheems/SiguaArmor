import {
  editorNativeEffectiveDamageAmount,
  type EditorNativeShotResult,
} from "./editor-native-hit-model.ts";
import {
  optimizeWeaponRhythm,
  type WeaponDpsOptimization,
  type WeaponDpsOptimizationOptions,
  type WeaponDpsWeapon,
} from "./weapon-dps-model.ts";

export interface WeaponHitDpsTarget {
  key: string;
  poolKind: string;
  maxHealth: number;
  damagePerShot: number;
}

export interface WeaponHitDpsEstimate extends WeaponHitDpsTarget {
  optimization: WeaponDpsOptimization;
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

/**
 * Collapse one clicked ray's resolved damage events by exact health-pool
 * identity. The result is deliberately per-pool: hull and engine damage from
 * the same shell must never become one fake target.
 */
export function targetPoolsForShot(
  result: Pick<EditorNativeShotResult, "damage">,
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
    });
  }
  return [...targets.values()].sort((left, right) => left.key.localeCompare(right.key, "en"));
}

export function estimateWeaponHitDps(
  weapon: WeaponDpsWeapon,
  result: Pick<EditorNativeShotResult, "damage">,
  options: WeaponDpsOptimizationOptions,
): WeaponHitDpsEstimate[] {
  return targetPoolsForShot(result).map((target) => ({
    ...target,
    optimization: optimizeWeaponRhythm(
      { ...weapon, damagePerShot: target.damagePerShot },
      { ...options, targetHealth: target.maxHealth },
    ),
  }));
}
