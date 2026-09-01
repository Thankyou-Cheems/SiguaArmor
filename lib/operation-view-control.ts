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
