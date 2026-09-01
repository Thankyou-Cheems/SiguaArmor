export type RuntimeViewerCameraViewId =
  | "front"
  | "left"
  | "rear"
  | "right"
  | "top";

export interface RuntimeViewerCameraView {
  id: RuntimeViewerCameraViewId;
  label: string;
  yawDegrees: number;
  pitchDegrees: number;
  kind: "soldier-ground" | "overhead";
}

export interface RuntimeViewerCameraPose {
  position: [x: number, y: number, z: number];
  target: [x: number, y: number, z: number];
}

/** v10.5.2 SQPlayerCameraManager/SQSoldier world-view horizontal FOV. */
export const SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG = 90;

/** Derived standing viewpoint: 96 cm capsule half-height + 64 cm camera offset. */
export const SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M = 1.6;

export const RUNTIME_VIEWER_CAMERA_VIEWS: readonly RuntimeViewerCameraView[] = [
  { id: "front", label: "前", yawDegrees: 90, pitchDegrees: 0, kind: "soldier-ground" },
  { id: "left", label: "左", yawDegrees: 0, pitchDegrees: 0, kind: "soldier-ground" },
  { id: "rear", label: "后", yawDegrees: -90, pitchDegrees: 0, kind: "soldier-ground" },
  { id: "right", label: "右", yawDegrees: 180, pitchDegrees: 0, kind: "soldier-ground" },
  { id: "top", label: "顶", yawDegrees: 90, pitchDegrees: 89.5, kind: "overhead" },
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

function nearZero(value: number) {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

export function runtimeViewerCameraPose({
  viewId,
  distanceM,
  groundY,
  vehicleTarget,
}: {
  viewId: RuntimeViewerCameraViewId;
  distanceM: number;
  groundY: number;
  vehicleTarget: [x: number, y: number, z: number];
}): RuntimeViewerCameraPose {
  const view = RUNTIME_VIEWER_CAMERA_VIEWS.find(({ id }) => id === viewId);
  if (
    !view ||
    !Number.isFinite(distanceM) ||
    distanceM <= 0 ||
    !Number.isFinite(groundY) ||
    vehicleTarget.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("runtime viewer camera pose inputs are invalid");
  }
  if (view.kind === "soldier-ground") {
    const eyeY = groundY + SQUAD_INFANTRY_STANDING_EYE_HEIGHT_M;
    const [offsetX, , offsetZ] = runtimeViewerInfantryCameraPosition({
      yawDegrees: view.yawDegrees,
      distanceM,
      groundY: 0,
      eyeHeightM: 0,
    });
    return {
      position: [
        vehicleTarget[0] + nearZero(offsetX),
        eyeY,
        vehicleTarget[2] + nearZero(offsetZ),
      ],
      target: [vehicleTarget[0], eyeY, vehicleTarget[2]],
    };
  }

  const yawRadians = degreesToRadians(view.yawDegrees);
  const pitchRadians = degreesToRadians(view.pitchDegrees);
  const horizontalDistance = Math.cos(pitchRadians) * distanceM;
  return {
    position: [
      vehicleTarget[0] + nearZero(Math.sin(yawRadians) * horizontalDistance),
      vehicleTarget[1] + Math.sin(pitchRadians) * distanceM,
      vehicleTarget[2] + nearZero(Math.cos(yawRadians) * horizontalDistance),
    ],
    target: [...vehicleTarget],
  };
}
