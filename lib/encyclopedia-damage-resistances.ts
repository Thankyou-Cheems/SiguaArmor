import type { ReferenceDamageResistance } from "../app/catalog-types";

const DAMAGE_RESISTANCE_EPSILON = 0.001;
const AMMO_BOX_DAMAGE_CLASS = "BP_AmmoBox_Damage_C";

export const VEHICLE_EXPLOSION_DAMAGE_CLASSES = Object.freeze([
  "BP_Fragmentation_DamageType_C",
  "BP_BasicHeatDamageType_C",
  "BP_HAT_DamageType_C",
  "BP_Explosives_Damagetype_C",
  "SQDamageType_Thermite",
] as const);

export function completeVehicleExplosionDamageClasses(
  damageResistances: readonly ReferenceDamageResistance[],
): ReferenceDamageResistance[] {
  if (damageResistances.length === 0) return [];

  const completed = damageResistances.map((item) => ({ ...item }));
  const configuredClasses = new Set(
    completed.map(({ damageClass }) => damageClass),
  );

  for (const damageClass of VEHICLE_EXPLOSION_DAMAGE_CLASSES) {
    if (configuredClasses.has(damageClass)) continue;
    completed.push({
      damageClass,
      modifier: 0,
    });
  }
  return completed;
}

export function visibleDamageResistanceOverrides(
  damageResistances: readonly ReferenceDamageResistance[],
): ReferenceDamageResistance[] {
  return completeVehicleExplosionDamageClasses(damageResistances).filter(
    (item) =>
      item.damageClass !== AMMO_BOX_DAMAGE_CLASS &&
      item.modifier !== null &&
      Math.abs(item.modifier - 1) > DAMAGE_RESISTANCE_EPSILON,
  );
}
