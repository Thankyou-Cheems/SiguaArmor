export interface VehicleWeaponOperationSpec {
  numberOfMags: number;
  magazineSize: number;
  tacticalReloadSeconds: number;
  dryReloadSeconds: number;
  roundsPerMinute: number;
  timeBetweenShotsSeconds: number;
  timeBetweenSingleShotsSeconds?: number;
  fireControl?: VehicleWeaponFireControl;
}

export interface VehicleWeaponFireMode {
  sourceValue: number;
  kind: "continuous" | "single" | "burst";
  roundsPerTrigger: number | null;
}

export interface VehicleWeaponFireControl {
  defaultModeIndex: number;
  modes: VehicleWeaponFireMode[];
  resetBurstOnTriggerRelease: boolean;
}

export interface VehicleWeaponOperationState {
  roundsRemaining: number;
  reserveMagazines: number;
  nextShotAtMs: number;
  reloadStartedAtMs: number | null;
  reloadEndsAtMs: number | null;
  triggerActive: boolean;
  roundsFiredThisTrigger: number;
}

export interface VehicleWeaponOperationPresentation {
  roundsRemaining: number;
  magazineCapacity: number;
  magazinesRemaining: number;
  reloadProgress: number;
  weaponReady: boolean;
  weaponReloading: boolean;
}

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

function nonNegativeSeconds(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function magazineCapacity(spec: VehicleWeaponOperationSpec) {
  return positiveInteger(spec.magazineSize, 1);
}

export function vehicleWeaponShotIntervalMs(spec: VehicleWeaponOperationSpec) {
  const authored = nonNegativeSeconds(spec.timeBetweenShotsSeconds);
  const singleShotMinimum = defaultFireMode(spec).kind === "single"
    ? nonNegativeSeconds(spec.timeBetweenSingleShotsSeconds ?? 0)
    : 0;
  const rate = Number.isFinite(spec.roundsPerMinute) && spec.roundsPerMinute > 0
    ? 60 / spec.roundsPerMinute
    : 0;
  return Math.max(authored, singleShotMinimum, rate) * 1_000;
}

function defaultFireMode(spec: VehicleWeaponOperationSpec): VehicleWeaponFireMode {
  const modes = spec.fireControl?.modes;
  const authored = modes?.[spec.fireControl?.defaultModeIndex ?? 0];
  return authored ?? {
    sourceValue: 0,
    kind: "continuous",
    roundsPerTrigger: null,
  };
}

function roundsPerTrigger(spec: VehicleWeaponOperationSpec) {
  const mode = defaultFireMode(spec);
  if (mode.kind === "continuous") return null;
  return positiveInteger(mode.roundsPerTrigger ?? 1, 1);
}

function triggerCycleComplete(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
) {
  const limit = roundsPerTrigger(spec);
  return limit !== null && state.roundsFiredThisTrigger >= limit;
}

function dryReloadMs(spec: VehicleWeaponOperationSpec) {
  return nonNegativeSeconds(spec.dryReloadSeconds) * 1_000;
}

function tacticalReloadMs(spec: VehicleWeaponOperationSpec) {
  return nonNegativeSeconds(spec.tacticalReloadSeconds) * 1_000;
}

export function createVehicleWeaponOperation(
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): VehicleWeaponOperationState {
  return {
    roundsRemaining: magazineCapacity(spec),
    reserveMagazines: Math.max(
      0,
      positiveInteger(spec.numberOfMags, 1) - 1,
    ),
    nextShotAtMs: nowMs,
    reloadStartedAtMs: null,
    reloadEndsAtMs: null,
    triggerActive: false,
    roundsFiredThisTrigger: 0,
  };
}

export function advanceVehicleWeaponOperation(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): VehicleWeaponOperationState {
  if (state.reloadEndsAtMs === null || nowMs < state.reloadEndsAtMs) {
    return state;
  }
  return {
    ...state,
    roundsRemaining: magazineCapacity(spec),
    reserveMagazines: Math.max(0, state.reserveMagazines - 1),
    nextShotAtMs: Math.max(state.nextShotAtMs, state.reloadEndsAtMs),
    reloadStartedAtMs: null,
    reloadEndsAtMs: null,
  };
}

export function fireVehicleWeaponOperation(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): { fired: boolean; state: VehicleWeaponOperationState; reason: string | null } {
  const advanced = advanceVehicleWeaponOperation(state, spec, nowMs);
  const mode = defaultFireMode(spec);
  const current = advanced.triggerActive
    ? advanced
    : {
        ...advanced,
        triggerActive: true,
        roundsFiredThisTrigger:
          mode.kind === "burst" &&
            !spec.fireControl?.resetBurstOnTriggerRelease
            ? advanced.roundsFiredThisTrigger
            : 0,
      };
  if (triggerCycleComplete(current, spec)) {
    return { fired: false, state: current, reason: "trigger-cycle-complete" };
  }
  if (current.reloadEndsAtMs !== null) {
    return { fired: false, state: current, reason: "weapon-reloading" };
  }
  if (current.roundsRemaining <= 0) {
    return { fired: false, state: current, reason: "weapon-empty" };
  }
  if (nowMs < current.nextShotAtMs) {
    return { fired: false, state: current, reason: "weapon-cooldown" };
  }
  const roundsRemaining = current.roundsRemaining - 1;
  const nextShotAtMs = nowMs + vehicleWeaponShotIntervalMs(spec);
  if (roundsRemaining > 0 || current.reserveMagazines <= 0) {
    return {
      fired: true,
      reason: null,
      state: {
        ...current,
        roundsRemaining,
        nextShotAtMs,
        roundsFiredThisTrigger: current.roundsFiredThisTrigger + 1,
      },
    };
  }
  const reloadDurationMs = dryReloadMs(spec);
  return {
    fired: true,
    reason: null,
    state: {
      ...current,
      roundsRemaining: 0,
      nextShotAtMs,
      reloadStartedAtMs: nowMs,
      reloadEndsAtMs: nowMs + reloadDurationMs,
      roundsFiredThisTrigger: current.roundsFiredThisTrigger + 1,
    },
  };
}

export function nextVehicleWeaponFireAtMs(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): number | null {
  const current = advanceVehicleWeaponOperation(state, spec, nowMs);
  if (triggerCycleComplete(current, spec)) return null;
  if (current.reloadEndsAtMs !== null) return current.reloadEndsAtMs;
  if (current.roundsRemaining <= 0) return null;
  if (
    current.nextShotAtMs <= nowMs &&
    vehicleWeaponShotIntervalMs(spec) <= 0
  ) return null;
  return Math.max(nowMs, current.nextShotAtMs);
}

export function releaseVehicleWeaponTrigger(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): VehicleWeaponOperationState {
  const current = advanceVehicleWeaponOperation(state, spec, nowMs);
  const mode = defaultFireMode(spec);
  const resetProgress =
    mode.kind !== "burst" ||
    Boolean(spec.fireControl?.resetBurstOnTriggerRelease) ||
    triggerCycleComplete(current, spec);
  return {
    ...current,
    triggerActive: false,
    roundsFiredThisTrigger: resetProgress
      ? 0
      : current.roundsFiredThisTrigger,
  };
}

export function reloadVehicleWeaponOperation(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): { started: boolean; state: VehicleWeaponOperationState; reason: string | null } {
  const current = advanceVehicleWeaponOperation(state, spec, nowMs);
  if (current.reloadEndsAtMs !== null) {
    return { started: false, state: current, reason: "weapon-reloading" };
  }
  if (current.reserveMagazines <= 0) {
    return { started: false, state: current, reason: "no-reserve-magazines" };
  }
  if (current.roundsRemaining >= magazineCapacity(spec)) {
    return { started: false, state: current, reason: "magazine-full" };
  }
  const reloadDurationMs = current.roundsRemaining <= 0
    ? dryReloadMs(spec)
    : tacticalReloadMs(spec);
  return {
    started: true,
    reason: null,
    state: {
      ...current,
      reloadStartedAtMs: nowMs,
      reloadEndsAtMs: nowMs + reloadDurationMs,
    },
  };
}

export function presentVehicleWeaponOperation(
  state: VehicleWeaponOperationState,
  spec: VehicleWeaponOperationSpec,
  nowMs: number,
): VehicleWeaponOperationPresentation {
  const current = advanceVehicleWeaponOperation(state, spec, nowMs);
  const weaponReloading = current.reloadEndsAtMs !== null;
  const reloadDuration = weaponReloading && current.reloadStartedAtMs !== null
    ? current.reloadEndsAtMs! - current.reloadStartedAtMs
    : 0;
  const reloadProgress = reloadDuration > 0
    ? Math.min(
        1,
        Math.max(0, (nowMs - current.reloadStartedAtMs!) / reloadDuration),
      )
    : 0;
  return {
    roundsRemaining: current.roundsRemaining,
    magazineCapacity: magazineCapacity(spec),
    magazinesRemaining: current.reserveMagazines,
    reloadProgress,
    weaponReady:
      !weaponReloading &&
      current.roundsRemaining > 0 &&
      nowMs >= current.nextShotAtMs,
    weaponReloading,
  };
}
