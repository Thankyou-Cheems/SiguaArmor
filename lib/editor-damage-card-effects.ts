export type EditorDamageCardEffectId =
  | "track-destroyed"
  | "wheel-destroyed"
  | "engine-destroyed"
  | "ammo-rack-destroyed"
  | "stabilization-lost"
  | "turret-locked";

export interface EditorDamageCardEffect {
  id: EditorDamageCardEffectId;
  label: string;
}

const DESTROYED_EFFECTS: Readonly<Record<string, EditorDamageCardEffect>> = {
  track: { id: "track-destroyed", label: "断履" },
  wheel: { id: "wheel-destroyed", label: "车轮击毁" },
  engine: { id: "engine-destroyed", label: "发动机摧毁" },
  "ammo-rack": { id: "ammo-rack-destroyed", label: "弹药架摧毁" },
};

const STABILIZATION_LOST_EFFECT: EditorDamageCardEffect = {
  id: "stabilization-lost",
  label: "炮塔失稳",
};

const TURRET_LOCKED_EFFECT: EditorDamageCardEffect = {
  id: "turret-locked",
  label: "锁死",
};

const DAMAGE_THRESHOLD_EPSILON = 1e-6;

function reachesThreshold(
  poolDamage: number,
  maxHealth: number,
  threshold: number,
) {
  return poolDamage / maxHealth + DAMAGE_THRESHOLD_EPSILON >= threshold;
}

export function editorDamageCardEffect(
  poolKind: string,
  poolDamage: number,
  maxHealth: number | null,
): EditorDamageCardEffect | null {
  if (
    maxHealth === null ||
    !Number.isFinite(maxHealth) ||
    maxHealth <= 0 ||
    !Number.isFinite(poolDamage) ||
    poolDamage <= 0
  ) {
    return null;
  }

  if (poolKind === "seat") {
    if (reachesThreshold(poolDamage, maxHealth, 1)) {
      return TURRET_LOCKED_EFFECT;
    }
    if (reachesThreshold(poolDamage, maxHealth, 0.5)) {
      return STABILIZATION_LOST_EFFECT;
    }
    return null;
  }

  if (!reachesThreshold(poolDamage, maxHealth, 1)) return null;
  return DESTROYED_EFFECTS[poolKind] ?? null;
}
