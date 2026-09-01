export interface HeldOperationFireAttempt {
  nextAttemptAtMs: number | null;
}

export interface HeldOperationFireController {
  start(): void;
  stop(): void;
  isActive(): boolean;
}

interface HeldOperationFireControllerOptions {
  attempt: () => HeldOperationFireAttempt;
  nowMs: () => number;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
  minimumDelayMs?: number;
}

export function createHeldOperationFireController({
  attempt,
  nowMs,
  setTimer,
  clearTimer,
  minimumDelayMs = 8,
}: HeldOperationFireControllerOptions): HeldOperationFireController {
  let active = false;
  let timerId: number | null = null;

  const clearScheduledAttempt = () => {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  };
  const runAttempt = () => {
    timerId = null;
    if (!active) return;
    const { nextAttemptAtMs } = attempt();
    if (nextAttemptAtMs === null) {
      active = false;
      return;
    }
    const delayMs = Math.max(minimumDelayMs, nextAttemptAtMs - nowMs());
    timerId = setTimer(runAttempt, delayMs);
  };

  return {
    start() {
      if (active) return;
      active = true;
      runAttempt();
    },
    stop() {
      active = false;
      clearScheduledAttempt();
    },
    isActive() {
      return active;
    },
  };
}
