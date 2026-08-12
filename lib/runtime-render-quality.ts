export type RuntimeRenderQualityTier = "balanced" | "compatibility";
export type RuntimeRenderQualityReason =
  | "forced"
  | "integrated-or-mobile-gpu"
  | "low-memory"
  | "low-core-count"
  | "default";

export interface RuntimeRenderQualitySignals {
  devicePixelRatio: number;
  rendererName: string | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
}

export interface RuntimeRenderQualityProfile {
  tier: RuntimeRenderQualityTier;
  reason: RuntimeRenderQualityReason;
  pixelRatio: number;
  assetLoadConcurrency: number;
  textureAnisotropy: number;
  textureMipmaps: boolean;
}

const INTEGRATED_OR_MOBILE_GPU_PATTERNS = [
  /intel(?:\(r\))?.*(?:hd|uhd|iris)/iu,
  /intel(?:\(r\))?.*arc(?:\(tm\))?\s+graphics(?:\s|\))/iu,
  /(?:amd|ati).*radeon(?:\(tm\))?\s+(?:graphics|\d{3,4}[ms]?\s+graphics)/iu,
  /(?:amd|ati).*vega\s+\d+\s+graphics/iu,
  /mali|adreno|powervr|swiftshader|llvmpipe|basic render/iu,
] as const;

function constrainedRenderer(rendererName: string | null) {
  return rendererName !== null &&
    INTEGRATED_OR_MOBILE_GPU_PATTERNS.some((pattern) => pattern.test(rendererName));
}

export function runtimeRenderQualityProfile(
  signals: RuntimeRenderQualitySignals,
  forcedTier: RuntimeRenderQualityTier | null = null,
): RuntimeRenderQualityProfile {
  const reason: RuntimeRenderQualityReason = forcedTier
    ? "forced"
    : constrainedRenderer(signals.rendererName)
      ? "integrated-or-mobile-gpu"
      : signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4
        ? "low-memory"
        : signals.hardwareConcurrency !== null && signals.hardwareConcurrency <= 4
          ? "low-core-count"
          : "default";
  const constrained = forcedTier
    ? forcedTier === "compatibility"
    : reason !== "default";
  const tier: RuntimeRenderQualityTier =
    forcedTier ?? (constrained ? "compatibility" : "balanced");
  const pixelRatioCap = constrained ? 1 : 1.25;
  const devicePixelRatio =
    Number.isFinite(signals.devicePixelRatio) && signals.devicePixelRatio > 0
      ? signals.devicePixelRatio
      : 1;

  return {
    tier,
    reason,
    pixelRatio: Math.min(devicePixelRatio, pixelRatioCap),
    assetLoadConcurrency: constrained ? 2 : 4,
    textureAnisotropy: constrained ? 1 : 4,
    textureMipmaps: !constrained,
  };
}
