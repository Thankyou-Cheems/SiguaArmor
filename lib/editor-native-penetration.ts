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

// Entry-offset model for the legacy straight-ray fixture. Native PostImpact
// backsteps 1 cm from ImpactPoint, but component refinement creates a different
// TraceStart. Use nativeTraceDistanceM when consuming real query records.
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
  nativeTraceDistanceM,
}: {
  distanceFromRayOriginM: number;
  firstDistanceFromRayOriginM: number;
  penetrationTraceDistanceM: number;
  baseDamage: number;
  cumulativeDamageAbsorbed: number;
  penetrationAtRangeMm: number;
  incidenceFactor: number;
  /** Exact query distance; legacy analytical rays use the entry-offset model. */
  nativeTraceDistanceM?: number;
}): EditorNativePenetrationArithmetic {
  const f32 = Math.fround;
  const distanceFromFirstHitM = f32(
    distanceFromRayOriginM - firstDistanceFromRayOriginM,
  );
  const distanceFromPenetrationTraceStartM = nativeTraceDistanceM ?? f32(
    EDITOR_NATIVE_ARMOR_TRACE_ENTRY_OFFSET_M + distanceFromFirstHitM,
  );
  const capacityCm = f32(f32(penetrationTraceDistanceM) * 100);
  const postPenetrationTraceFactor = nativeTraceDistanceM !== undefined
    ? capacityCm > 0 ? f32((capacityCm - nativeTraceDistanceM * 100) / capacityCm) : 0
    : penetrationTraceDistanceM > 0
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
