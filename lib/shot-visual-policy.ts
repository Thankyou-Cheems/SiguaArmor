export interface ShotVisualPolicyResult {
  ballistics: {
    penetrationAtRangeMm: number | null;
    impactDamageAtRange: number | null;
  };
  layers: readonly unknown[];
  damage: readonly {
    damageKind: string;
    effectiveDamage: number | null;
  }[];
}

export function shotResultRendersDirectTrace(result: ShotVisualPolicyResult) {
  const penetrationMm = result.ballistics.penetrationAtRangeMm ?? 0;
  const impactDamage = result.ballistics.impactDamageAtRange ?? 0;
  const effectivePointDamage = result.damage.some(
    (event) =>
      event.damageKind === "point" &&
      (event.effectiveDamage ?? 0) > 0,
  );
  return penetrationMm > 0 || impactDamage > 0 || effectivePointDamage;
}
