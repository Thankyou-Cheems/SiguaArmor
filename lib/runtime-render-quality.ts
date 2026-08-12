export type RuntimeRenderQualityTier = "balanced" | "compatibility";

export interface RuntimeRenderQualitySignals {
  devicePixelRatio: number;
  rendererName: string | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
}

export interface RuntimeRenderQualityProfile {
  tier: RuntimeRenderQualityTier;
  pixelRatio: number;
}

const INTEGRATED_OR_MOBILE_GPU =
  /(?:intel(?:\(r\))?.*(?:hd|uhd|iris)|mali|adreno|powervr)/iu;

export function runtimeRenderQualityProfile(
  signals: RuntimeRenderQualitySignals,
): RuntimeRenderQualityProfile {
  const constrained =
    (signals.rendererName !== null &&
      INTEGRATED_OR_MOBILE_GPU.test(signals.rendererName)) ||
    (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4) ||
    (signals.hardwareConcurrency !== null && signals.hardwareConcurrency <= 4);
  const tier: RuntimeRenderQualityTier = constrained
    ? "compatibility"
    : "balanced";
  const pixelRatioCap = constrained ? 1 : 1.25;
  const devicePixelRatio =
    Number.isFinite(signals.devicePixelRatio) && signals.devicePixelRatio > 0
      ? signals.devicePixelRatio
      : 1;

  return {
    tier,
    pixelRatio: Math.min(devicePixelRatio, pixelRatioCap),
  };
}
