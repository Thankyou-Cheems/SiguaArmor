// Keep scheduling separate from the sample order and shot calculation.
const INITIAL_RAYS = 512;
const MAX_RAYS = 8192;
const MAX_VISITS = 32768;
const MAX_FRAME_MS = 6;

export interface ProtectionFrameLimits {
  rays: number;
  milliseconds: number;
}

export function runtimeProtectionMapFrameHasBudget({
  sampledRays,
  visitedCells,
  elapsedMs,
  limits,
}: {
  sampledRays: number;
  visitedCells: number;
  elapsedMs: number;
  limits: ProtectionFrameLimits;
}) {
  // One visit guarantees progress even when matrix preparation exhausted the
  // budget. Subsequent visits (including cached cells) always check the clock.
  if (visitedCells === 0) return true;
  return visitedCells < MAX_VISITS && sampledRays < limits.rays &&
    elapsedMs < limits.milliseconds;
}

export function createProtectionFrameBudget() {
  let rays = INITIAL_RAYS;
  let tailReserveMs = 0.5;
  let milliseconds = MAX_FRAME_MS;

  return {
    begin(): ProtectionFrameLimits {
      // Target at most 8 ms including recent reconstruction/paint overhead,
      // with the existing 6 ms sampling deadline as an independent ceiling.
      // Do not infer CPU capacity from monitor refresh rate or a paused RAF.
      milliseconds = Math.max(2, Math.min(MAX_FRAME_MS, 8 - tailReserveMs));
      return { rays, milliseconds };
    },
    finish(sampledRays: number, samplingMs: number, totalMs: number, transitioned = false) {
      if (![samplingMs, totalMs].every(Number.isFinite)) {
        rays = INITIAL_RAYS;
        tailReserveMs = MAX_FRAME_MS;
        return;
      }
      // Precision transitions allocate a whole level/grid only once; charging
      // that setup to every subsequent frame causes a feedback collapse.
      if (!transitioned) tailReserveMs = Math.max(0.5,
        Math.min(6, 0.5 * (totalMs - samplingMs) + 0.5 * tailReserveMs));
      if (sampledRays < 16) return;
      const predicted = Math.floor(sampledRays * milliseconds * 0.85 /
        Math.max(0.1, samplingMs));
      // At most double after a cheap batch, but reduce immediately when slow.
      // The per-visit time check still wins over every count limit.
      rays = Math.max(16, Math.min(MAX_RAYS, rays * 2, predicted));
    },
  };
}
