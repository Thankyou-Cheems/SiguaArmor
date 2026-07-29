export type EditorNativePenetrationPrefilter =
  | "include"
  | "skip"
  | "native-unknown";

export interface EditorNativePenetrationArithmetic {
  distanceFromFirstHitM: number;
  postPenetrationTraceFactor: number;
  remainingDamage: number;
  remainingDamageRatio: number;
  availablePenetrationMm: number;
}

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
  traceDistanceAfterPenetrationM,
  baseDamage,
  cumulativeDamageAbsorbed,
  penetrationAtRangeMm,
  incidenceFactor,
}: {
  distanceFromRayOriginM: number;
  firstDistanceFromRayOriginM: number;
  traceDistanceAfterPenetrationM: number;
  baseDamage: number;
  cumulativeDamageAbsorbed: number;
  penetrationAtRangeMm: number;
  incidenceFactor: number;
}): EditorNativePenetrationArithmetic {
  const f32 = Math.fround;
  const distanceFromFirstHitM = f32(
    distanceFromRayOriginM - firstDistanceFromRayOriginM,
  );
  const postPenetrationTraceFactor =
    traceDistanceAfterPenetrationM > 0
      ? f32(
          f32(traceDistanceAfterPenetrationM - distanceFromFirstHitM) /
            traceDistanceAfterPenetrationM,
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
