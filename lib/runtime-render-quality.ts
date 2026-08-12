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
  assetLoadConcurrency: number;
  textureAnisotropy: number;
  textureMipmaps: boolean;
}

const INTEGRATED_OR_MOBILE_GPU =
  /(?:intel(?:\(r\))?.*(?:hd|uhd|iris)|(?:amd|ati).*(?:radeon(?:\(tm\))? graphics|vega \d+ graphics)|mali|adreno|powervr|swiftshader|llvmpipe|basic render)/iu;

export function runtimeRenderQualityProfile(
  signals: RuntimeRenderQualitySignals,
  forcedTier: RuntimeRenderQualityTier | null = null,
): RuntimeRenderQualityProfile {
  const constrained = forcedTier
    ? forcedTier === "compatibility"
    : (signals.rendererName !== null &&
        INTEGRATED_OR_MOBILE_GPU.test(signals.rendererName)) ||
      (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4) ||
      (signals.hardwareConcurrency !== null && signals.hardwareConcurrency <= 4);
  const tier: RuntimeRenderQualityTier =
    forcedTier ?? (constrained ? "compatibility" : "balanced");
  const pixelRatioCap = constrained ? 1 : 1.25;
  const devicePixelRatio =
    Number.isFinite(signals.devicePixelRatio) && signals.devicePixelRatio > 0
      ? signals.devicePixelRatio
      : 1;

  return {
    tier,
    pixelRatio: Math.min(devicePixelRatio, pixelRatioCap),
    assetLoadConcurrency: constrained ? 2 : 4,
    textureAnisotropy: constrained ? 1 : 4,
    textureMipmaps: !constrained,
  };
}
