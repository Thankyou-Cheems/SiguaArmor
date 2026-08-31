import * as THREE from "three";

export type RuntimeVehicleTopDownPoint = [number, number];

export interface RuntimeVehicleTopDownOccurrenceInput {
  stableOccurrenceId: string;
  source: THREE.Object3D;
  matrix: readonly number[];
}

export interface RuntimeVehicleTopDownStationInput {
  id: string;
  parentId: string | null;
  depth: number;
  placementIds: readonly string[];
  barrelPlacementIds: readonly string[];
  yawPivot: readonly [number, number, number];
}

export interface RuntimeVehicleTopDownStationProjection {
  id: string;
  parentId: string | null;
  outline: RuntimeVehicleTopDownPoint[];
  pivot: RuntimeVehicleTopDownPoint;
  barrelEnd: RuntimeVehicleTopDownPoint;
}

export interface RuntimeVehicleTopDownProjection {
  state: "runtime-geometry";
  viewBox: [0, 0, 100, 100];
  hull: RuntimeVehicleTopDownPoint[];
  stations: RuntimeVehicleTopDownStationProjection[];
  sampledVertexCount: number;
  outputPointCount: number;
}

interface SourceSamples {
  points: THREE.Vector3[];
  sampledVertexCount: number;
}

const MAX_SAMPLES_PER_MESH = 256;
const PROJECTION_EXTENT = 62;
const sourceSampleCache = new WeakMap<THREE.Object3D, SourceSamples>();

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sampleSource(source: THREE.Object3D): SourceSamples {
  const cached = sourceSampleCache.get(source);
  if (cached) return cached;
  source.updateMatrixWorld(true);
  const sourceWorldInverse = source.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  let sampledVertexCount = 0;
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions || positions.count <= 0) return;
    const meshToSource = sourceWorldInverse
      .clone()
      .multiply(object.matrixWorld);
    const stride = Math.max(
      1,
      Math.ceil(positions.count / MAX_SAMPLES_PER_MESH),
    );
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += stride) {
      point.fromBufferAttribute(positions, index).applyMatrix4(meshToSource);
      points.push(point.clone());
      sampledVertexCount += 1;
    }
    const lastIndex = positions.count - 1;
    if (lastIndex % stride !== 0) {
      point.fromBufferAttribute(positions, lastIndex).applyMatrix4(meshToSource);
      points.push(point.clone());
      sampledVertexCount += 1;
    }
  });
  const samples = { points, sampledVertexCount };
  sourceSampleCache.set(source, samples);
  return samples;
}

function cross(
  origin: RuntimeVehicleTopDownPoint,
  left: RuntimeVehicleTopDownPoint,
  right: RuntimeVehicleTopDownPoint,
) {
  return (left[0] - origin[0]) * (right[1] - origin[1]) -
    (left[1] - origin[1]) * (right[0] - origin[0]);
}

function convexHull(
  values: readonly RuntimeVehicleTopDownPoint[],
): RuntimeVehicleTopDownPoint[] {
  const points = [...new Map(values.map((point) => [
    `${rounded(point[0])}:${rounded(point[1])}`,
    [rounded(point[0]), rounded(point[1])] as RuntimeVehicleTopDownPoint,
  ])).values()].sort(
    (left, right) => left[0] - right[0] || left[1] - right[1],
  );
  if (points.length <= 2) return points;
  const lower: RuntimeVehicleTopDownPoint[] = [];
  for (const point of points) {
    while (
      lower.length >= 2 &&
      cross(lower.at(-2)!, lower.at(-1)!, point) <= 0
    ) lower.pop();
    lower.push(point);
  }
  const upper: RuntimeVehicleTopDownPoint[] = [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    while (
      upper.length >= 2 &&
      cross(upper.at(-2)!, upper.at(-1)!, point) <= 0
    ) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function topDownPoint(point: THREE.Vector3): RuntimeVehicleTopDownPoint {
  return [point.z, -point.x];
}

function farthestPoint(
  points: readonly RuntimeVehicleTopDownPoint[],
  pivot: RuntimeVehicleTopDownPoint,
) {
  return points.reduce(
    (best, point) => {
      const distanceSquared =
        (point[0] - pivot[0]) ** 2 + (point[1] - pivot[1]) ** 2;
      return distanceSquared > best.distanceSquared
        ? { point, distanceSquared }
        : best;
    },
    { point: pivot, distanceSquared: 0 },
  ).point;
}

export function buildRuntimeVehicleTopDownProjection({
  occurrences,
  stations,
}: {
  occurrences: readonly RuntimeVehicleTopDownOccurrenceInput[];
  stations: readonly RuntimeVehicleTopDownStationInput[];
}): RuntimeVehicleTopDownProjection | null {
  const occurrencePoints = new Map<string, RuntimeVehicleTopDownPoint[]>();
  let sampledVertexCount = 0;
  for (const occurrence of occurrences) {
    if (occurrence.matrix.length !== 16) continue;
    const samples = sampleSource(occurrence.source);
    const matrix = new THREE.Matrix4().fromArray([...occurrence.matrix]);
    const points = samples.points.map((point) =>
      topDownPoint(point.clone().applyMatrix4(matrix))
    );
    if (points.length === 0) continue;
    occurrencePoints.set(occurrence.stableOccurrenceId, points);
    sampledVertexCount += samples.sampledVertexCount;
  }
  if (occurrencePoints.size === 0) return null;

  const stationInputs = [...stations].sort(
    (left, right) => right.depth - left.depth || left.id.localeCompare(right.id),
  );
  const ownerByOccurrence = new Map<string, string>();
  for (const station of stationInputs) {
    for (const placementId of station.placementIds) {
      if (
        occurrencePoints.has(placementId) &&
        !ownerByOccurrence.has(placementId)
      ) ownerByOccurrence.set(placementId, station.id);
    }
  }
  const allPoints = [...occurrencePoints.values()].flat();
  const staticPoints = [...occurrencePoints]
    .filter(([occurrenceId]) => !ownerByOccurrence.has(occurrenceId))
    .flatMap(([, points]) => points);
  const hullRaw = convexHull(staticPoints.length > 0 ? staticPoints : allPoints);
  if (hullRaw.length < 3) return null;

  const stationRaw = stations.map((station) => {
    const ownedPoints = station.placementIds.flatMap((placementId) =>
      ownerByOccurrence.get(placementId) === station.id
        ? occurrencePoints.get(placementId) ?? []
        : []
    );
    const fallbackPoints = station.placementIds.flatMap(
      (placementId) => occurrencePoints.get(placementId) ?? [],
    );
    const points = ownedPoints.length > 0 ? ownedPoints : fallbackPoints;
    const pivot = topDownPoint(new THREE.Vector3(...station.yawPivot));
    const barrelPoints = station.barrelPlacementIds.flatMap(
      (placementId) => occurrencePoints.get(placementId) ?? [],
    );
    return {
      id: station.id,
      parentId: station.parentId,
      outline: convexHull(points),
      pivot,
      barrelEnd: farthestPoint(
        barrelPoints.length > 0 ? barrelPoints : points,
        pivot,
      ),
    };
  });

  const boundsPoints = [
    ...hullRaw,
    ...stationRaw.flatMap(({ outline, pivot, barrelEnd }) => [
      ...outline,
      pivot,
      barrelEnd,
    ]),
  ];
  const minimumX = Math.min(...boundsPoints.map((point) => point[0]));
  const maximumX = Math.max(...boundsPoints.map((point) => point[0]));
  const minimumY = Math.min(...boundsPoints.map((point) => point[1]));
  const maximumY = Math.max(...boundsPoints.map((point) => point[1]));
  const span = Math.max(maximumX - minimumX, maximumY - minimumY);
  if (!Number.isFinite(span) || span <= 1e-6) return null;
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  const scale = PROJECTION_EXTENT / span;
  const normalize = (point: RuntimeVehicleTopDownPoint) => [
    rounded(50 + (point[0] - centerX) * scale),
    rounded(50 + (point[1] - centerY) * scale),
  ] as RuntimeVehicleTopDownPoint;

  const hull = hullRaw.map(normalize);
  const projectedStations = stationRaw.map((station) => ({
    ...station,
    outline: station.outline.map(normalize),
    pivot: normalize(station.pivot),
    barrelEnd: normalize(station.barrelEnd),
  }));
  const outputPointCount = hull.length + projectedStations.reduce(
    (count, station) => count + station.outline.length + 2,
    0,
  );
  return {
    state: "runtime-geometry",
    viewBox: [0, 0, 100, 100],
    hull,
    stations: projectedStations,
    sampledVertexCount,
    outputPointCount,
  };
}
