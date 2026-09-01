export interface OperationViewKeyInput {
  code: string;
  driverView: boolean;
  repeat: boolean;
  zoomIndex: number;
  zoomCount: number;
}

export const OPERATION_VIEW_STANDARD_ASPECT_RATIO = 16 / 9;
export const OPERATION_VIEW_STANDARD_HORIZONTAL_FOV_DEGREES = 90;
const OPERATION_VIEW_MAX_FRAME_SECONDS = 0.05;

export interface OperationViewMotionRates {
  yawDegreesPerSecond: number | null | undefined;
  pitchDegreesPerSecond: number | null | undefined;
}

export interface OperationViewInputDynamics {
  hasAcceleration: boolean;
  maxYawSpeedDegreesPerSecond: number;
  maxPitchSpeedDegreesPerSecond: number;
  inputAccelerationDegreesPerSecondSquared: {
    yaw: number;
    pitch: number;
  } | null;
  noInputDecelerationDegreesPerSecondSquared: number | null;
  oppositeDirectionDecelerationDegreesPerSecondSquared: number | null;
  maxMoveDeltaTimeSeconds: number | null;
}

export interface OperationViewMotionState {
  yawVelocityDegreesPerSecond: number;
  pitchVelocityDegreesPerSecond: number;
}

export interface OperationViewMotionStepResult extends OperationViewMotionState {
  yawDelta: number;
  pitchDelta: number;
  settled: boolean;
}

export interface OperationViewPoseCommitScheduler {
  schedule: (commit: () => void) => void;
  cancel: () => void;
  flush: () => void;
}

export interface OperationViewPoseCommitSchedulerOptions {
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const OPERATION_VIEW_POSE_COMMIT_DELAY_MS = 250;

export function createOperationViewPoseCommitScheduler({
  delayMs = OPERATION_VIEW_POSE_COMMIT_DELAY_MS,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
}: OperationViewPoseCommitSchedulerOptions = {}): OperationViewPoseCommitScheduler {
  let timerHandle: unknown = null;
  let pendingCommit: (() => void) | null = null;

  const cancelTimer = () => {
    if (timerHandle === null) return;
    clearTimer(timerHandle);
    timerHandle = null;
  };
  const cancel = () => {
    cancelTimer();
    pendingCommit = null;
  };
  const flush = () => {
    cancelTimer();
    const commit = pendingCommit;
    pendingCommit = null;
    commit?.();
  };
  const schedule = (commit: () => void) => {
    cancelTimer();
    pendingCommit = commit;
    timerHandle = setTimer(() => {
      timerHandle = null;
      flush();
    }, Math.max(0, delayMs));
  };

  return { schedule, cancel, flush };
}

export function operationViewHorizontalFovForMagnification(
  magnification: number | null | undefined,
) {
  if (
    typeof magnification !== "number" ||
    !Number.isFinite(magnification) ||
    magnification <= 0
  ) return null;
  const baseHalfAngleRadians =
    OPERATION_VIEW_STANDARD_HORIZONTAL_FOV_DEGREES * Math.PI / 360;
  return 2 * Math.atan(
    Math.tan(baseHalfAngleRadians) / magnification,
  ) * 180 / Math.PI;
}

export function operationViewContinuousPoseDelta(
  heldCodes: readonly string[],
  elapsedSeconds: number,
  motionRates: OperationViewMotionRates,
): { yawDelta: number; pitchDelta: number } | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;
  const held = new Set(heldCodes);
  const yawDirection = Number(held.has("KeyD")) - Number(held.has("KeyA"));
  const pitchDirection = Number(held.has("KeyW")) - Number(held.has("KeyS"));
  if (yawDirection === 0 && pitchDirection === 0) return null;
  const yawRate = motionRates.yawDegreesPerSecond;
  const pitchRate = motionRates.pitchDegreesPerSecond;
  if (
    (yawDirection !== 0 &&
      (typeof yawRate !== "number" || !Number.isFinite(yawRate) || yawRate < 0)) ||
    (pitchDirection !== 0 &&
      (typeof pitchRate !== "number" || !Number.isFinite(pitchRate) || pitchRate < 0))
  ) return null;
  const frameSeconds = Math.min(
    elapsedSeconds,
    OPERATION_VIEW_MAX_FRAME_SECONDS,
  );
  return {
    yawDelta: yawDirection * (yawRate ?? 0) * frameSeconds,
    pitchDelta: pitchDirection * (pitchRate ?? 0) * frameSeconds,
  };
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function moveVelocityTowardZero(velocity: number, maximumDelta: number) {
  const current = finiteOrZero(velocity);
  const delta = Math.max(0, finiteOrZero(maximumDelta));
  if (Math.abs(current) <= delta) return 0;
  return current - Math.sign(current) * delta;
}

function operationViewAxisVelocity({
  direction,
  currentVelocity,
  maximumSpeed,
  acceleration,
  noInputDeceleration,
  oppositeDirectionDeceleration,
  elapsedSeconds,
  accelerated,
}: {
  direction: number;
  currentVelocity: number;
  maximumSpeed: number;
  acceleration: number;
  noInputDeceleration: number;
  oppositeDirectionDeceleration: number;
  elapsedSeconds: number;
  accelerated: boolean;
}) {
  const speedLimit = Math.max(0, finiteOrZero(maximumSpeed));
  if (!accelerated) return direction * speedLimit;
  if (direction === 0) {
    return moveVelocityTowardZero(
      currentVelocity,
      Math.abs(noInputDeceleration) * elapsedSeconds,
    );
  }
  const signedAcceleration = direction * finiteOrZero(acceleration);
  if (
    currentVelocity !== 0 &&
    signedAcceleration !== 0 &&
    Math.sign(currentVelocity) !== Math.sign(signedAcceleration)
  ) {
    return moveVelocityTowardZero(
      currentVelocity,
      Math.abs(oppositeDirectionDeceleration) * elapsedSeconds,
    );
  }
  return Math.max(
    -speedLimit,
    Math.min(
      speedLimit,
      finiteOrZero(currentVelocity) + signedAcceleration * elapsedSeconds,
    ),
  );
}

export function operationViewMotionStep(
  heldCodes: readonly string[],
  elapsedSeconds: number,
  dynamics: OperationViewInputDynamics,
  state: OperationViewMotionState,
): OperationViewMotionStepResult {
  const currentYaw = finiteOrZero(state.yawVelocityDegreesPerSecond);
  const currentPitch = finiteOrZero(state.pitchVelocityDegreesPerSecond);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return {
      yawDelta: 0,
      pitchDelta: 0,
      yawVelocityDegreesPerSecond: currentYaw,
      pitchVelocityDegreesPerSecond: currentPitch,
      settled: currentYaw === 0 && currentPitch === 0,
    };
  }
  const authoredMaximumDelta = dynamics.maxMoveDeltaTimeSeconds;
  const maximumDelta =
    typeof authoredMaximumDelta === "number" &&
      Number.isFinite(authoredMaximumDelta) &&
      authoredMaximumDelta > 0
      ? authoredMaximumDelta
      : OPERATION_VIEW_MAX_FRAME_SECONDS;
  const frameSeconds = Math.min(elapsedSeconds, maximumDelta);
  const held = new Set(heldCodes);
  const yawDirection = Number(held.has("KeyD")) - Number(held.has("KeyA"));
  const pitchDirection = Number(held.has("KeyW")) - Number(held.has("KeyS"));
  const acceleration = dynamics.inputAccelerationDegreesPerSecondSquared;
  const yawVelocity = operationViewAxisVelocity({
    direction: yawDirection,
    currentVelocity: currentYaw,
    maximumSpeed: dynamics.maxYawSpeedDegreesPerSecond,
    acceleration: acceleration?.yaw ?? 0,
    noInputDeceleration:
      dynamics.noInputDecelerationDegreesPerSecondSquared ?? 0,
    oppositeDirectionDeceleration:
      dynamics.oppositeDirectionDecelerationDegreesPerSecondSquared ?? 0,
    elapsedSeconds: frameSeconds,
    accelerated: dynamics.hasAcceleration && acceleration !== null,
  });
  const pitchVelocity = operationViewAxisVelocity({
    direction: pitchDirection,
    currentVelocity: currentPitch,
    maximumSpeed: dynamics.maxPitchSpeedDegreesPerSecond,
    acceleration: acceleration?.pitch ?? 0,
    noInputDeceleration:
      dynamics.noInputDecelerationDegreesPerSecondSquared ?? 0,
    oppositeDirectionDeceleration:
      dynamics.oppositeDirectionDecelerationDegreesPerSecondSquared ?? 0,
    elapsedSeconds: frameSeconds,
    accelerated: dynamics.hasAcceleration && acceleration !== null,
  });
  return {
    yawDelta: yawVelocity * frameSeconds,
    pitchDelta: pitchVelocity * frameSeconds,
    yawVelocityDegreesPerSecond: yawVelocity,
    pitchVelocityDegreesPerSecond: pitchVelocity,
    settled:
      yawDirection === 0 &&
      pitchDirection === 0 &&
      yawVelocity === 0 &&
      pitchVelocity === 0,
  };
}

export type OperationViewKeyAction = { kind: "zoom"; zoomIndex: number };

export function operationViewScenePresentation(active: boolean) {
  return active
    ? {
        clearColor: 0x27312b,
        clearAlpha: 1,
        groundGridScale: 20,
      }
    : {
        clearColor: 0x000000,
        clearAlpha: 0,
        groundGridScale: 1,
      };
}

export function operationViewKeyAction({
  code,
  driverView,
  repeat,
  zoomIndex,
  zoomCount,
}: OperationViewKeyInput): OperationViewKeyAction | null {
  if (driverView) return null;
  switch (code) {
    case "KeyQ":
      if (repeat || zoomCount <= 1) return null;
      return {
        kind: "zoom",
        zoomIndex: (Math.max(0, zoomIndex) + 1) % zoomCount,
      };
    default:
      return null;
  }
}
