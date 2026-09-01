import * as THREE from "three";

export type RuntimeVehicleTopDownPoint = [number, number];

export interface RuntimeVehicleTopDownOccurrenceInput {
  stableOccurrenceId: string;
  source: THREE.Object3D;
  matrix: readonly number[];
  bodyCandidate?: boolean;
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
  /** Largest contour retained for older callers and compact diagnostics. */
  outline: RuntimeVehicleTopDownPoint[];
  /** Topology-aware projected contours, including disconnected components and holes. */
  outlines: RuntimeVehicleTopDownPoint[][];
  pivot: RuntimeVehicleTopDownPoint;
  /** Farthest explicit barrel endpoint retained as the primary drag handle. */
  barrelEnd: RuntimeVehicleTopDownPoint;
  barrels: RuntimeVehicleTopDownBarrelProjection[];
}

export interface RuntimeVehicleTopDownBarrelProjection {
  placementId: string;
  start: RuntimeVehicleTopDownPoint;
  end: RuntimeVehicleTopDownPoint;
}

export interface RuntimeVehicleTopDownProjection {
  state: "runtime-geometry";
  viewBox: [0, 0, 100, 100];
  /** Largest contour retained for older callers and compact diagnostics. */
  hull: RuntimeVehicleTopDownPoint[];
  /** Topology-aware vehicle-body contours rendered with the even-odd fill rule. */
  hullOutlines: RuntimeVehicleTopDownPoint[][];
  stations: RuntimeVehicleTopDownStationProjection[];
  sampledVertexCount: number;
  sampledTriangleCount: number;
  outputPointCount: number;
}

type RuntimeVehicleTopDownTriangle = readonly [
  RuntimeVehicleTopDownPoint,
  RuntimeVehicleTopDownPoint,
  RuntimeVehicleTopDownPoint,
];

interface SourcePrimitive {
  points: THREE.Vector3[];
  triangles: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3][];
}

interface SourceSamples {
  primitives: SourcePrimitive[];
  points: THREE.Vector3[];
  sampledVertexCount: number;
  sampledTriangleCount: number;
}

interface OccurrenceProjectionGeometry {
  points: RuntimeVehicleTopDownPoint[];
  triangles: RuntimeVehicleTopDownTriangle[];
}

const MAX_POINTS_PER_MESH = 2_048;
const MAX_TRIANGLES_PER_MESH = 8_192;
const PROJECTION_EXTENT = 62;
const PROJECTION_GRID_SIZE = 192;
const PROJECTION_SIMPLIFY_TOLERANCE = 0.32;
const MINIMUM_CONTOUR_AREA = 0.08;
const sourceSampleCache = new WeakMap<THREE.Object3D, SourceSamples>();

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sampleSource(source: THREE.Object3D): SourceSamples {
  const cached = sourceSampleCache.get(source);
  if (cached) return cached;
  source.updateMatrixWorld(true);
  const sourceWorldInverse = source.matrixWorld.clone().invert();
  const primitives: SourcePrimitive[] = [];
  const points: THREE.Vector3[] = [];
  let sampledVertexCount = 0;
  let sampledTriangleCount = 0;
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions || positions.count <= 0) return;
    const meshToSource = sourceWorldInverse
      .clone()
      .multiply(object.matrixWorld);
    const primitivePoints: THREE.Vector3[] = [];
    const pointStride = Math.max(
      1,
      Math.ceil(positions.count / MAX_POINTS_PER_MESH),
    );
    if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    const transformedPoint = (positionIndex: number) => {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, positionIndex);
      if (object instanceof THREE.SkinnedMesh) {
        object.applyBoneTransform(positionIndex, point);
      }
      return point.applyMatrix4(meshToSource);
    };
    for (let index = 0; index < positions.count; index += pointStride) {
      primitivePoints.push(transformedPoint(index));
      sampledVertexCount += 1;
    }
    const lastIndex = positions.count - 1;
    if (lastIndex % pointStride !== 0) {
      primitivePoints.push(transformedPoint(lastIndex));
      sampledVertexCount += 1;
    }
    points.push(...primitivePoints);

    const indexAttribute = geometry.getIndex();
    const sourceIndexCount = indexAttribute?.count ?? positions.count;
    const triangleCount = Math.floor(sourceIndexCount / 3);
    const triangleStride = Math.max(
      1,
      Math.ceil(triangleCount / MAX_TRIANGLES_PER_MESH),
    );
    const triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
    const trianglePoint = (triangleIndex: number, corner: number) => {
      const sourceIndex = triangleIndex * 3 + corner;
      const positionIndex = indexAttribute
        ? indexAttribute.getX(sourceIndex)
        : sourceIndex;
      return transformedPoint(positionIndex);
    };
    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += triangleStride
    ) {
      triangles.push([
        trianglePoint(triangleIndex, 0),
        trianglePoint(triangleIndex, 1),
        trianglePoint(triangleIndex, 2),
      ]);
      sampledTriangleCount += 1;
    }
    const finalTriangleIndex = triangleCount - 1;
    if (
      finalTriangleIndex >= 0 &&
      finalTriangleIndex % triangleStride !== 0
    ) {
      triangles.push([
        trianglePoint(finalTriangleIndex, 0),
        trianglePoint(finalTriangleIndex, 1),
        trianglePoint(finalTriangleIndex, 2),
      ]);
      sampledTriangleCount += 1;
    }
    primitives.push({ points: primitivePoints, triangles });
  });
  const samples = {
    primitives,
    points,
    sampledVertexCount,
    sampledTriangleCount,
  };
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

function signedPolygonArea(points: readonly RuntimeVehicleTopDownPoint[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function pointToSegmentDistanceSquared(
  point: RuntimeVehicleTopDownPoint,
  start: RuntimeVehicleTopDownPoint,
  end: RuntimeVehicleTopDownPoint,
) {
  const spanX = end[0] - start[0];
  const spanY = end[1] - start[1];
  const spanSquared = spanX ** 2 + spanY ** 2;
  if (spanSquared <= 1e-12) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const progress = Math.max(0, Math.min(
    1,
    ((point[0] - start[0]) * spanX + (point[1] - start[1]) * spanY) /
      spanSquared,
  ));
  const nearestX = start[0] + spanX * progress;
  const nearestY = start[1] + spanY * progress;
  return (point[0] - nearestX) ** 2 + (point[1] - nearestY) ** 2;
}

function simplifyOpenPolyline(
  points: readonly RuntimeVehicleTopDownPoint[],
  toleranceSquared: number,
): RuntimeVehicleTopDownPoint[] {
  if (points.length <= 2) return [...points];
  let farthestIndex = -1;
  let farthestDistanceSquared = toleranceSquared;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distanceSquared = pointToSegmentDistanceSquared(
      points[index],
      points[0],
      points.at(-1)!,
    );
    if (distanceSquared > farthestDistanceSquared) {
      farthestDistanceSquared = distanceSquared;
      farthestIndex = index;
    }
  }
  if (farthestIndex < 0) return [points[0], points.at(-1)!];
  const left = simplifyOpenPolyline(
    points.slice(0, farthestIndex + 1),
    toleranceSquared,
  );
  const right = simplifyOpenPolyline(
    points.slice(farthestIndex),
    toleranceSquared,
  );
  return [...left.slice(0, -1), ...right];
}

function simplifyClosedContour(
  points: readonly RuntimeVehicleTopDownPoint[],
): RuntimeVehicleTopDownPoint[] {
  if (points.length <= 4) return [...points];
  let splitIndex = 1;
  let maximumDistanceSquared = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distanceSquared =
      (points[index][0] - points[0][0]) ** 2 +
      (points[index][1] - points[0][1]) ** 2;
    if (distanceSquared > maximumDistanceSquared) {
      maximumDistanceSquared = distanceSquared;
      splitIndex = index;
    }
  }
  const toleranceSquared = PROJECTION_SIMPLIFY_TOLERANCE ** 2;
  const first = simplifyOpenPolyline(
    points.slice(0, splitIndex + 1),
    toleranceSquared,
  );
  const second = simplifyOpenPolyline(
    [...points.slice(splitIndex), points[0]],
    toleranceSquared,
  );
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function maskIndex(x: number, y: number) {
  return y * PROJECTION_GRID_SIZE + x;
}

function rasterizeLine(
  mask: Uint8Array,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const stepCount = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(endX - startX), Math.abs(endY - startY))),
  );
  for (let step = 0; step <= stepCount; step += 1) {
    const progress = step / stepCount;
    const x = Math.max(0, Math.min(
      PROJECTION_GRID_SIZE - 1,
      Math.round(startX + (endX - startX) * progress),
    ));
    const y = Math.max(0, Math.min(
      PROJECTION_GRID_SIZE - 1,
      Math.round(startY + (endY - startY) * progress),
    ));
    mask[maskIndex(x, y)] = 1;
  }
}

function rasterizeTriangle(
  mask: Uint8Array,
  triangle: RuntimeVehicleTopDownTriangle,
) {
  const gridTriangle = triangle.map(([x, y]) => [
    x / 100 * PROJECTION_GRID_SIZE,
    y / 100 * PROJECTION_GRID_SIZE,
  ] as RuntimeVehicleTopDownPoint);
  for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
    const start = gridTriangle[edgeIndex];
    const end = gridTriangle[(edgeIndex + 1) % 3];
    rasterizeLine(mask, start[0], start[1], end[0], end[1]);
  }
  const minimumY = Math.max(
    0,
    Math.floor(Math.min(...gridTriangle.map((point) => point[1]))),
  );
  const maximumY = Math.min(
    PROJECTION_GRID_SIZE - 1,
    Math.ceil(Math.max(...gridTriangle.map((point) => point[1]))),
  );
  for (let y = minimumY; y <= maximumY; y += 1) {
    const scanY = y + 0.5;
    const intersections: number[] = [];
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const start = gridTriangle[edgeIndex];
      const end = gridTriangle[(edgeIndex + 1) % 3];
      if (!(
        (start[1] <= scanY && end[1] > scanY) ||
        (end[1] <= scanY && start[1] > scanY)
      )) continue;
      intersections.push(
        start[0] +
          (scanY - start[1]) / (end[1] - start[1]) *
          (end[0] - start[0]),
      );
    }
    if (intersections.length < 2) continue;
    intersections.sort((left, right) => left - right);
    const minimumX = Math.max(0, Math.floor(intersections[0]));
    const maximumX = Math.min(
      PROJECTION_GRID_SIZE - 1,
      Math.ceil(intersections.at(-1)!),
    );
    for (let x = minimumX; x <= maximumX; x += 1) {
      mask[maskIndex(x, y)] = 1;
    }
  }
}

type GridEdge = readonly [
  readonly [number, number],
  readonly [number, number],
];

function gridPointKey(point: readonly [number, number]) {
  return `${point[0]}:${point[1]}`;
}

function contourTurnScore(
  previous: GridEdge,
  candidate: GridEdge,
) {
  const previousX = previous[1][0] - previous[0][0];
  const previousY = previous[1][1] - previous[0][1];
  const candidateX = candidate[1][0] - candidate[0][0];
  const candidateY = candidate[1][1] - candidate[0][1];
  return Math.atan2(
    previousX * candidateY - previousY * candidateX,
    previousX * candidateX + previousY * candidateY,
  );
}

function traceMaskContours(mask: Uint8Array) {
  const isFilled = (x: number, y: number) =>
    x >= 0 && y >= 0 &&
    x < PROJECTION_GRID_SIZE && y < PROJECTION_GRID_SIZE &&
    mask[maskIndex(x, y)] === 1;
  const edges: GridEdge[] = [];
  for (let y = 0; y < PROJECTION_GRID_SIZE; y += 1) {
    for (let x = 0; x < PROJECTION_GRID_SIZE; x += 1) {
      if (!isFilled(x, y)) continue;
      if (!isFilled(x, y - 1)) edges.push([[x, y], [x + 1, y]]);
      if (!isFilled(x + 1, y)) edges.push([[x + 1, y], [x + 1, y + 1]]);
      if (!isFilled(x, y + 1)) edges.push([[x + 1, y + 1], [x, y + 1]]);
      if (!isFilled(x - 1, y)) edges.push([[x, y + 1], [x, y]]);
    }
  }
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = gridPointKey(edge[0]);
    const values = outgoing.get(key) ?? [];
    values.push(index);
    outgoing.set(key, values);
  });
  const visited = new Uint8Array(edges.length);
  const contours: RuntimeVehicleTopDownPoint[][] = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    if (visited[edgeIndex]) continue;
    const firstEdge = edges[edgeIndex];
    const firstKey = gridPointKey(firstEdge[0]);
    const gridContour: [number, number][] = [[...firstEdge[0]]];
    let currentIndex = edgeIndex;
    let closed = false;
    for (let step = 0; step <= edges.length; step += 1) {
      if (visited[currentIndex]) break;
      visited[currentIndex] = 1;
      const current = edges[currentIndex];
      gridContour.push([...current[1]]);
      const currentKey = gridPointKey(current[1]);
      if (currentKey === firstKey) {
        closed = true;
        break;
      }
      const candidates = (outgoing.get(currentKey) ?? [])
        .filter((candidateIndex) => !visited[candidateIndex]);
      if (candidates.length === 0) break;
      currentIndex = candidates.reduce((bestIndex, candidateIndex) =>
        contourTurnScore(current, edges[candidateIndex]) >
            contourTurnScore(current, edges[bestIndex])
          ? candidateIndex
          : bestIndex
      );
    }
    if (!closed || gridContour.length < 5) continue;
    gridContour.pop();
    const contour = simplifyClosedContour(gridContour.map(([x, y]) => [
      rounded(x / PROJECTION_GRID_SIZE * 100),
      rounded(y / PROJECTION_GRID_SIZE * 100),
    ]));
    if (
      contour.length >= 3 &&
      Math.abs(signedPolygonArea(contour)) >= MINIMUM_CONTOUR_AREA
    ) contours.push(contour);
  }
  return contours.sort(
    (left, right) =>
      Math.abs(signedPolygonArea(right)) - Math.abs(signedPolygonArea(left)),
  );
}

function projectedContours(
  triangles: readonly RuntimeVehicleTopDownTriangle[],
  fallbackPoints: readonly RuntimeVehicleTopDownPoint[],
) {
  if (triangles.length === 0) {
    const fallback = convexHull(fallbackPoints);
    return fallback.length >= 3 ? [fallback] : [];
  }
  const mask = new Uint8Array(
    PROJECTION_GRID_SIZE * PROJECTION_GRID_SIZE,
  );
  triangles.forEach((triangle) => rasterizeTriangle(mask, triangle));
  const contours = traceMaskContours(mask);
  if (contours.length > 0) return contours;
  const fallback = convexHull(fallbackPoints);
  return fallback.length >= 3 ? [fallback] : [];
}

function geometryFootprintArea(geometry: OccurrenceProjectionGeometry) {
  if (geometry.points.length === 0) return 0;
  const minimumX = Math.min(...geometry.points.map((point) => point[0]));
  const maximumX = Math.max(...geometry.points.map((point) => point[0]));
  const minimumY = Math.min(...geometry.points.map((point) => point[1]));
  const maximumY = Math.max(...geometry.points.map((point) => point[1]));
  return (maximumX - minimumX) * (maximumY - minimumY);
}

export function buildRuntimeVehicleTopDownProjection({
  occurrences,
  stations,
}: {
  occurrences: readonly RuntimeVehicleTopDownOccurrenceInput[];
  stations: readonly RuntimeVehicleTopDownStationInput[];
}): RuntimeVehicleTopDownProjection | null {
  const occurrenceGeometry = new Map<
    string,
    OccurrenceProjectionGeometry
  >();
  let sampledVertexCount = 0;
  let sampledTriangleCount = 0;
  for (const occurrence of occurrences) {
    if (occurrence.matrix.length !== 16) continue;
    const samples = sampleSource(occurrence.source);
    const matrix = new THREE.Matrix4().fromArray([...occurrence.matrix]);
    const points = samples.points.map((point) =>
      topDownPoint(point.clone().applyMatrix4(matrix))
    );
    if (points.length === 0) continue;
    const triangles = samples.primitives.flatMap((primitive) =>
      primitive.triangles.map((triangle) => triangle.map((point) =>
        topDownPoint(point.clone().applyMatrix4(matrix))
      ) as unknown as RuntimeVehicleTopDownTriangle)
    );
    occurrenceGeometry.set(occurrence.stableOccurrenceId, {
      points,
      triangles,
    });
    sampledVertexCount += samples.sampledVertexCount;
    sampledTriangleCount += samples.sampledTriangleCount;
  }
  if (occurrenceGeometry.size === 0) return null;

  const stationInputs = [...stations].sort(
    (left, right) => right.depth - left.depth || left.id.localeCompare(right.id),
  );
  const largestFootprintOccurrenceId = [...occurrenceGeometry]
    .sort((left, right) =>
      geometryFootprintArea(right[1]) - geometryFootprintArea(left[1]) ||
      left[0].localeCompare(right[0])
    )[0]?.[0] ?? null;
  const explicitChassisOccurrenceIds = new Set(
    occurrences
      .filter(({ bodyCandidate, stableOccurrenceId }) =>
        bodyCandidate === true && occurrenceGeometry.has(stableOccurrenceId)
      )
      .map(({ stableOccurrenceId }) => stableOccurrenceId),
  );
  const fallbackChassisOccurrenceId = explicitChassisOccurrenceIds.size === 0
    ? largestFootprintOccurrenceId
    : null;
  const chassisOccurrenceIds = explicitChassisOccurrenceIds.size > 0
    ? explicitChassisOccurrenceIds
    : new Set(
        fallbackChassisOccurrenceId ? [fallbackChassisOccurrenceId] : [],
      );
  const ownerByOccurrence = new Map<string, string>();
  for (const station of stationInputs) {
    for (const placementId of station.placementIds) {
      if (
        !chassisOccurrenceIds.has(placementId) &&
        occurrenceGeometry.has(placementId) &&
        !ownerByOccurrence.has(placementId)
      ) ownerByOccurrence.set(placementId, station.id);
    }
  }
  const allPoints = [...occurrenceGeometry.values()]
    .flatMap(({ points }) => points);
  let hullGeometry = [...occurrenceGeometry]
    .filter(([occurrenceId]) => !ownerByOccurrence.has(occurrenceId))
    .map(([, geometry]) => geometry);
  if (hullGeometry.length === 0) {
    const largestGeometry = [...occurrenceGeometry.values()].sort(
      (left, right) =>
        geometryFootprintArea(right) - geometryFootprintArea(left),
    )[0];
    if (largestGeometry) hullGeometry = [largestGeometry];
  }
  const hullPointsRaw = hullGeometry.flatMap(({ points }) => points);
  if (convexHull(hullPointsRaw).length < 3) return null;

  const stationRaw = stations.map((station) => {
    const ownedGeometry = station.placementIds.flatMap((placementId) =>
      ownerByOccurrence.get(placementId) === station.id
        ? [occurrenceGeometry.get(placementId)].filter(
            (geometry): geometry is OccurrenceProjectionGeometry =>
              geometry !== undefined,
          )
        : []
    );
    const fallbackGeometry = station.placementIds.flatMap(
      (placementId) => chassisOccurrenceIds.has(placementId)
        ? []
        : [occurrenceGeometry.get(placementId)].filter(
            (geometry): geometry is OccurrenceProjectionGeometry =>
              geometry !== undefined,
          ),
    );
    const geometry = ownedGeometry.length > 0
      ? ownedGeometry
      : fallbackGeometry;
    const points = geometry.flatMap((entry) => entry.points);
    const triangles = geometry.flatMap((entry) => entry.triangles);
    const pivot = topDownPoint(new THREE.Vector3(...station.yawPivot));
    const barrels = [...new Set(station.barrelPlacementIds)].flatMap(
      (placementId) => {
        const barrelPoints = occurrenceGeometry.get(placementId)?.points ?? [];
        if (barrelPoints.length === 0) return [];
        return [{
          placementId,
          start: pivot,
          end: farthestPoint(barrelPoints, pivot),
        }];
      },
    );
    if (barrels.length === 0 && points.length > 0) {
      barrels.push({
        placementId: `${station.id}:fallback`,
        start: pivot,
        end: farthestPoint(points, pivot),
      });
    }
    const barrelEnd = farthestPoint(
      barrels.map(({ end }) => end),
      pivot,
    );
    return {
      id: station.id,
      parentId: station.parentId,
      points,
      triangles,
      pivot,
      barrelEnd,
      barrels,
    };
  });

  const boundsPoints = [
    ...allPoints,
    ...stationRaw.flatMap(({ pivot, barrelEnd }) => [
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
  const normalizeTriangle = (
    triangle: RuntimeVehicleTopDownTriangle,
  ) => triangle.map(normalize) as unknown as RuntimeVehicleTopDownTriangle;

  const normalizedHullPoints = hullPointsRaw.map(normalize);
  const hullOutlines = projectedContours(
    hullGeometry.flatMap(({ triangles }) =>
      triangles.map(normalizeTriangle)
    ),
    normalizedHullPoints,
  );
  if (hullOutlines.length === 0) return null;
  const hull = hullOutlines[0];
  const projectedStations = stationRaw.map((station) => {
    const outlines = projectedContours(
      station.triangles.map(normalizeTriangle),
      station.points.map(normalize),
    );
    const pivot = normalize(station.pivot);
    const barrels = station.barrels.map((barrel) => ({
      placementId: barrel.placementId,
      start: normalize(barrel.start),
      end: normalize(barrel.end),
    }));
    return {
      id: station.id,
      parentId: station.parentId,
      outline: outlines[0] ?? [],
      outlines,
      pivot,
      barrelEnd: normalize(station.barrelEnd),
      barrels,
    };
  });
  const outputPointCount = hullOutlines.reduce(
    (count, outline) => count + outline.length,
    0,
  ) + projectedStations.reduce(
    (count, station) =>
      count +
      station.outlines.reduce(
        (outlineCount, outline) => outlineCount + outline.length,
        0,
      ) +
      1 +
      station.barrels.length * 2,
    0,
  );
  return {
    state: "runtime-geometry",
    viewBox: [0, 0, 100, 100],
    hull,
    hullOutlines,
    stations: projectedStations,
    sampledVertexCount,
    sampledTriangleCount,
    outputPointCount,
  };
}
