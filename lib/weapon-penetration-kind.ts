export type WeaponPenetrationKind = "kinetic" | "shaped-charge";

/** Squad exposes shaped-charge projectiles through its basic HEAT and HAT damage types. */
export function weaponPenetrationKindForDamageTypePath(
  damageTypePath: string | null,
): WeaponPenetrationKind {
  if (
    damageTypePath &&
    /(?:BP_BasicHeatDamageType|BP_HAT_DamageType)(?:\.|_|$)/iu.test(damageTypePath)
  ) {
    return "shaped-charge";
  }
  return "kinetic";
}
