export const RUNTIME_GROUND_SCALE_TICK_INTERVAL_M = 0.5;
export const RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M = 1;

export function runtimeGroundScaleLengthM(modelSpanM: number) {
  if (!Number.isFinite(modelSpanM) || modelSpanM <= 0) return 1;
  return Math.max(
    RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M,
    Math.ceil(modelSpanM / RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M)
      * RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M,
  );
}
