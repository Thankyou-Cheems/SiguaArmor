export type RuntimeViewerCameraViewId =
  | "front"
  | "left"
  | "rear"
  | "right"
  | "top";

export interface RuntimeViewerCameraView {
  id: RuntimeViewerCameraViewId;
  label: string;
  shortcut: "1" | "2" | "3" | "4" | "5";
  yawDegrees: number;
  pitchDegrees: number;
}

/** v10.5.2 SQPlayerCameraManager/SQSoldier world-view horizontal FOV. */
export const SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG = 90;

/** Derived standing viewpoint: 96 cm capsule half-height + 64 cm camera offset. */
export const SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M = 1.6;

export const RUNTIME_VIEWER_CAMERA_VIEWS: readonly RuntimeViewerCameraView[] = [
  { id: "front", label: "前", shortcut: "1", yawDegrees: 90, pitchDegrees: 10 },
  { id: "left", label: "左", shortcut: "2", yawDegrees: 0, pitchDegrees: 10 },
  { id: "rear", label: "后", shortcut: "3", yawDegrees: -90, pitchDegrees: 10 },
  { id: "right", label: "右", shortcut: "4", yawDegrees: 180, pitchDegrees: 10 },
  { id: "top", label: "顶", shortcut: "5", yawDegrees: 90, pitchDegrees: 85 },
] as const;

/** 8 m matches the SQVehicle third-person spring arm; later values are scale checkpoints. */
export const RUNTIME_VIEWER_INFANTRY_DISTANCES_M = [8, 50, 100, 200] as const;

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI;
}

/** Three.js accepts vertical FOV while Squad/Unreal exposes horizontal world FOV. */
export function verticalFovForHorizontalFov(
  horizontalFovDegrees: number,
  aspectRatio: number,
) {
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : 1;
  const clampedHorizontal = Math.min(175, Math.max(1, horizontalFovDegrees));
  return radiansToDegrees(
    2 * Math.atan(
      Math.tan(degreesToRadians(clampedHorizontal) / 2) / safeAspect,
    ),
  );
}

export function runtimeViewerInfantryCameraPosition({
  yawDegrees,
  distanceM,
  groundY,
  eyeHeightM = SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M,
}: {
  yawDegrees: number;
  distanceM: number;
  groundY: number;
  eyeHeightM?: number;
}): [x: number, y: number, z: number] {
  const yawRadians = degreesToRadians(yawDegrees);
  return [
    Math.sin(yawRadians) * distanceM,
    groundY + eyeHeightM,
    Math.cos(yawRadians) * distanceM,
  ];
}
