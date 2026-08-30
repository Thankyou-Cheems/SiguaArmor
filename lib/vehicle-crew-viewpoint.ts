import type { RuntimeCrewSeatView } from "./vehicle-crew-seat-runtime";

export type CrewViewVector3 = [number, number, number];

export interface CrewViewPose {
  position: CrewViewVector3;
  forward: CrewViewVector3;
  up: CrewViewVector3;
  horizontalFovDegrees: number;
}

function finiteVector(values: readonly number[]) {
  return values.length === 3 && values.every(Number.isFinite);
}

function normalize(vector: CrewViewVector3): CrewViewVector3 {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new Error("Crew viewpoint direction is invalid");
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function rotateUeVector(
  vector: CrewViewVector3,
  quaternion: { x: number; y: number; z: number; w: number },
): CrewViewVector3 {
  const magnitude = Math.hypot(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w,
  );
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new Error("Crew viewpoint quaternion is invalid");
  }
  const qx = quaternion.x / magnitude;
  const qy = quaternion.y / magnitude;
  const qz = quaternion.z / magnitude;
  const qw = quaternion.w / magnitude;
  const tx = 2 * (qy * vector[2] - qz * vector[1]);
  const ty = 2 * (qz * vector[0] - qx * vector[2]);
  const tz = 2 * (qx * vector[1] - qy * vector[0]);
  return [
    vector[0] + qw * tx + (qy * tz - qz * ty),
    vector[1] + qw * ty + (qz * tx - qx * tz),
    vector[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

function ueVectorToGltf([x, y, z]: CrewViewVector3): CrewViewVector3 {
  return [x, z, y];
}

export function crewViewBasePose(
  view: Pick<
    RuntimeCrewSeatView,
    "vehicleLocalFrame" | "baseHorizontalFovDegrees"
  >,
): CrewViewPose {
  const frame = view.vehicleLocalFrame;
  const value = frame?.value;
  if (
    !value ||
    !["observed", "derived", "derived-with-fallback"].includes(frame.state)
  ) {
    throw new Error("Crew viewpoint vehicle-local frame is unavailable");
  }
  const translation = value.translationCm;
  const position: CrewViewVector3 = [
    translation.x / 100,
    translation.z / 100,
    translation.y / 100,
  ];
  if (!finiteVector(position)) {
    throw new Error("Crew viewpoint position is invalid");
  }
  const forward = normalize(ueVectorToGltf(rotateUeVector(
    [1, 0, 0],
    value.rotationQuaternion,
  )));
  const up = normalize(ueVectorToGltf(rotateUeVector(
    [0, 0, 1],
    value.rotationQuaternion,
  )));
  const horizontalFovDegrees = view.baseHorizontalFovDegrees?.value;
  return {
    position,
    forward,
    up,
    horizontalFovDegrees:
      Number.isFinite(horizontalFovDegrees) &&
        horizontalFovDegrees! > 1 &&
        horizontalFovDegrees! < 179
        ? horizontalFovDegrees!
        : 90,
  };
}

function transformPoint(
  matrix: readonly number[],
  point: CrewViewVector3,
): CrewViewVector3 {
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) {
    throw new Error("Crew viewpoint articulation matrix is invalid");
  }
  return [
    matrix[0] * point[0] + matrix[4] * point[1] +
      matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] +
      matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] +
      matrix[10] * point[2] + matrix[14],
  ];
}

function transformDirection(
  matrix: readonly number[],
  direction: CrewViewVector3,
): CrewViewVector3 {
  return normalize([
    matrix[0] * direction[0] + matrix[4] * direction[1] +
      matrix[8] * direction[2],
    matrix[1] * direction[0] + matrix[5] * direction[1] +
      matrix[9] * direction[2],
    matrix[2] * direction[0] + matrix[6] * direction[1] +
      matrix[10] * direction[2],
  ]);
}

export function transformCrewViewPose(
  pose: CrewViewPose,
  matrices: readonly (readonly number[])[],
): CrewViewPose {
  let position = pose.position;
  let forward = pose.forward;
  let up = pose.up;
  for (const matrix of matrices) {
    position = transformPoint(matrix, position);
    forward = transformDirection(matrix, forward);
    up = transformDirection(matrix, up);
  }
  const projection =
    forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2];
  up = normalize([
    up[0] - forward[0] * projection,
    up[1] - forward[1] * projection,
    up[2] - forward[2] * projection,
  ]);
  return {
    position,
    forward,
    up,
    horizontalFovDegrees: pose.horizontalFovDegrees,
  };
}

export function crewViewHorizontalFovForZoom(
  view: Pick<
    RuntimeCrewSeatView,
    | "baseHorizontalFovDegrees"
    | "magnificationLevels"
    | "formulaProjectedHorizontalFovDegrees"
  >,
  zoomIndex: number,
) {
  if (!Number.isSafeInteger(zoomIndex) || zoomIndex < 0) return null;
  const magnification = view.magnificationLevels[zoomIndex];
  if (!Number.isFinite(magnification) || magnification <= 0) return null;
  const stage = view.formulaProjectedHorizontalFovDegrees.find(
    (candidate) => candidate.magnification === magnification,
  );
  return stage &&
      stage.state === "derived-formula-candidate" &&
      Number.isFinite(stage.horizontalDegrees) &&
      stage.horizontalDegrees > 1 &&
      stage.horizontalDegrees < 179
    ? stage.horizontalDegrees
    : null;
}

export function preferredCrewViewStation<
  T extends {
    seat: { index: number; role: string };
    view: unknown | null;
  },
>(stations: readonly T[]): T | null {
  const available = stations.filter((station) => station.view !== null);
  return available.find(
    ({ seat }) => seat.index === 2 && seat.role === "gunner",
  ) ?? available.find(({ seat }) => seat.role === "gunner") ??
    available.find(({ seat }) => seat.index === 2) ?? available[0] ?? null;
}
