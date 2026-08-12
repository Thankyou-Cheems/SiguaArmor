export const RUNTIME_FORCED_RICOCHET_MAX_INCIDENCE_FACTOR = 0.28;

interface RuntimeShotPathLayerInput {
  penetrated: boolean | null;
  incidenceFactor: number;
  availablePenetrationMm: number;
  damageAbsorbedAfterHit: number | null;
  stopReason: string | null;
}

export interface RuntimeShotPathLayerPresentation {
  remainingPenetrationMm: number | null;
  absorbedDamage: number | null;
  terminalLabel: string | null;
}

export function isRuntimeForcedRicochetLayer(
  layer: Pick<RuntimeShotPathLayerInput, "penetrated" | "incidenceFactor" | "stopReason">,
) {
  return layer.penetrated === false
    && layer.stopReason === "available penetration is not greater than thickness"
    && layer.incidenceFactor < RUNTIME_FORCED_RICOCHET_MAX_INCIDENCE_FACTOR;
}

export function runtimeShotPathLayerPresentation(
  layer: RuntimeShotPathLayerInput,
): RuntimeShotPathLayerPresentation {
  if (layer.penetrated === true) {
    return {
      remainingPenetrationMm: layer.availablePenetrationMm,
      absorbedDamage: layer.damageAbsorbedAfterHit,
      terminalLabel: null,
    };
  }

  if (layer.penetrated === null) {
    return {
      remainingPenetrationMm: null,
      absorbedDamage: null,
      terminalLabel: "无法确认",
    };
  }

  const terminalLabel = layer.stopReason === "penetration is disabled by the Editor surface"
    ? "不可穿透"
    : layer.stopReason === "post-penetration trace distance is exhausted"
      ? "后效结束"
      : layer.stopReason === "remaining damage is exhausted"
        ? "伤害耗尽"
        : isRuntimeForcedRicochetLayer(layer)
          ? "强制跳弹"
          : "穿深不足";

  return {
    remainingPenetrationMm: null,
    absorbedDamage: null,
    terminalLabel,
  };
}
