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
  let dueAtMs: number | null = null;

  const clearScheduledAttempt = () => {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  };
  const runAttempt = () => {
    timerId = null;
    if (!active) return;
    // Browser timers accept integral milliseconds and may wake before a
    // fractional source deadline. Waiting is not a failed trigger attempt.
    if (dueAtMs !== null && nowMs() < dueAtMs) {
      timerId = setTimer(runAttempt, Math.max(1, Math.ceil(dueAtMs - nowMs())));
      return;
    }
    const { nextAttemptAtMs } = attempt();
    dueAtMs = nextAttemptAtMs;
    if (nextAttemptAtMs === null) {
      active = false;
      return;
    }
    const delayMs = Math.ceil(Math.max(minimumDelayMs, nextAttemptAtMs - nowMs()));
    timerId = setTimer(runAttempt, delayMs);
  };

  return {
    start() {
      if (active) return;
      active = true;
      dueAtMs = null;
      runAttempt();
    },
    stop() {
      active = false;
      dueAtMs = null;
      clearScheduledAttempt();
    },
    isActive() {
      return active;
    },
  };
}
