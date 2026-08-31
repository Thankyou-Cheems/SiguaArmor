export interface OperationViewKeyInput {
  code: string;
  driverView: boolean;
  repeat: boolean;
  zoomIndex: number;
  zoomCount: number;
}

export type OperationViewKeyAction =
  | { kind: "pose"; yawDelta: number; pitchDelta: number }
  | { kind: "zoom"; zoomIndex: number };

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
    case "KeyW":
      return { kind: "pose", yawDelta: 0, pitchDelta: 0.5 };
    case "KeyS":
      return { kind: "pose", yawDelta: 0, pitchDelta: -0.5 };
    case "KeyA":
      return { kind: "pose", yawDelta: -1, pitchDelta: 0 };
    case "KeyD":
      return { kind: "pose", yawDelta: 1, pitchDelta: 0 };
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
