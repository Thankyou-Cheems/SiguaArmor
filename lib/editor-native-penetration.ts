export type EditorNativePenetrationPrefilter =
  | "include"
  | "skip"
  | "native-unknown";

export interface EditorNativePenetrationArithmetic {
  distanceFromFirstHitM: number;
  distanceFromPenetrationTraceStartM: number;
  postPenetrationTraceFactor: number;
  remainingDamage: number;
  remainingDamageRatio: number;
  availablePenetrationMm: number;
}

// ASQWeapon::DealDamage builds the armor-test trace 1 cm before the first
// impact surface. DidPenetrateArmor measures every hit from that trace start,
// so even the first armor layer consumes 1 cm of the projectile penetration
// trace. Same-build 2A70/100 mm Frag Dedicated PIE read back 0.01 m exactly.
export const EDITOR_NATIVE_ARMOR_TRACE_ENTRY_OFFSET_M = Math.fround(0.01);

export function editorNativeTraceIncludesDistance({
  distanceFromFirstHitM,
  traceDistanceAfterPenetrationM,
}: {
  distanceFromFirstHitM: number;
  traceDistanceAfterPenetrationM: number;
}) {
  return (
    Math.fround(distanceFromFirstHitM) <=
    Math.max(0, Math.fround(traceDistanceAfterPenetrationM))
  );
}

export function editorNativeTraceTerminalDistanceM({
  traceDistanceAfterPenetrationM,
  stoppedDistanceFromFirstHitM,
}: {
  traceDistanceAfterPenetrationM: number;
  stoppedDistanceFromFirstHitM: number | null;
}) {
  const maximumDistanceM = Math.max(
    0,
    Math.fround(traceDistanceAfterPenetrationM),
  );
  if (stoppedDistanceFromFirstHitM === null) return maximumDistanceM;
  return Math.min(
    maximumDistanceM,
    Math.max(0, Math.fround(stoppedDistanceFromFirstHitM)),
  );
}

export function editorNativePenetrationPrefilter(
  considerForPenetration: boolean | null,
): EditorNativePenetrationPrefilter {
  if (considerForPenetration === false) return "skip";
  if (considerForPenetration === true) return "include";
  return "native-unknown";
}

export function resolveEditorNativePenetrationArithmetic({
  distanceFromRayOriginM,
  firstDistanceFromRayOriginM,
  penetrationTraceDistanceM,
  baseDamage,
  cumulativeDamageAbsorbed,
  penetrationAtRangeMm,
  incidenceFactor,
}: {
  distanceFromRayOriginM: number;
  firstDistanceFromRayOriginM: number;
  penetrationTraceDistanceM: number;
  baseDamage: number;
  cumulativeDamageAbsorbed: number;
  penetrationAtRangeMm: number;
  incidenceFactor: number;
}): EditorNativePenetrationArithmetic {
  const f32 = Math.fround;
  const distanceFromFirstHitM = f32(
    distanceFromRayOriginM - firstDistanceFromRayOriginM,
  );
  const distanceFromPenetrationTraceStartM = f32(
    EDITOR_NATIVE_ARMOR_TRACE_ENTRY_OFFSET_M + distanceFromFirstHitM,
  );
  const postPenetrationTraceFactor =
    penetrationTraceDistanceM > 0
      ? f32(
          f32(
            penetrationTraceDistanceM -
              distanceFromPenetrationTraceStartM,
          ) / penetrationTraceDistanceM,
        )
      : 0;
  const remainingDamage = f32(baseDamage - cumulativeDamageAbsorbed);
  const remainingDamageRatio =
    baseDamage !== 0 ? f32(remainingDamage / baseDamage) : 0;
  const availablePenetrationMm = f32(
    f32(
      f32(penetrationAtRangeMm * f32(incidenceFactor)) *
        postPenetrationTraceFactor,
    ) * remainingDamageRatio,
  );
  return {
    distanceFromFirstHitM,
    distanceFromPenetrationTraceStartM,
    postPenetrationTraceFactor,
    remainingDamage,
    remainingDamageRatio,
    availablePenetrationMm,
  };
}

export function editorNativeDidPenetrateArmor(
  availablePenetrationMm: number,
  armorThicknessMm: number,
) {
  return availablePenetrationMm > armorThicknessMm;
}
