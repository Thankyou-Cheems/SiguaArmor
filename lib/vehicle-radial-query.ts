export type RadialQueryPoint = readonly [number, number, number];

export type VehicleRadialQueryShape =
  | { kind: "triangles"; positionsM: readonly number[]; indices: readonly number[] }
  | { kind: "sphere"; centerM: RadialQueryPoint; radiusM: number }
  | { kind: "capsule"; startM: RadialQueryPoint; endM: RadialQueryPoint; radiusM: number };

export interface VehicleRadialQueryComponent {
  componentId: string;
  componentName: string;
  componentClassPath: string;
  collisionProfile: string | null;
  objectChannelIndex: number;
  bounds: { minM: RadialQueryPoint; maxM: RadialQueryPoint; originM: RadialQueryPoint };
  shapes: readonly VehicleRadialQueryShape[];
}

export interface VehicleRadialQuerySource {
  schemaVersion: "sigua-vehicle-radial-query-source/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  rawName: string;
  targetPackage: string;
  generatedClass: string;
  queryContract: { objectMask: 71; onlyDamageMeshes: true };
  counts: { admittedComponents: number };
  components: readonly VehicleRadialQueryComponent[];
}

export interface VehicleRadialQueryHit {
  candidateComponentId: string;
  hitComponentId: string;
  impactPointM: RadialQueryPoint;
  route: "kill-zone-bypass" | "same-owner-visibility-hit";
}

const EPSILON = 1e-9;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SiguaWiki 径向查询数据无效：${message}`);
}

function point(value: unknown, label: string): RadialQueryPoint {
  invariant(
    Array.isArray(value) && value.length === 3 && value.every(Number.isFinite),
    `${label} 必须包含三个有限数值`,
  );
  return value as unknown as RadialQueryPoint;
}

const subtract = (left: RadialQueryPoint, right: RadialQueryPoint): RadialQueryPoint => [
  left[0] - right[0], left[1] - right[1], left[2] - right[2],
];
const addScaled = (origin: RadialQueryPoint, direction: RadialQueryPoint, scale: number): RadialQueryPoint => [
  origin[0] + direction[0] * scale,
  origin[1] + direction[1] * scale,
  origin[2] + direction[2] * scale,
];
const dot = (left: RadialQueryPoint, right: RadialQueryPoint) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const cross = (left: RadialQueryPoint, right: RadialQueryPoint): RadialQueryPoint => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
const lengthSquared = (value: RadialQueryPoint) => dot(value, value);

function distancePointSegmentSquared(value: RadialQueryPoint, start: RadialQueryPoint, end: RadialQueryPoint) {
  const segment = subtract(end, start);
  const denominator = lengthSquared(segment);
  if (denominator <= EPSILON) return lengthSquared(subtract(value, start));
  const fraction = Math.max(0, Math.min(1, dot(subtract(value, start), segment) / denominator));
  return lengthSquared(subtract(value, addScaled(start, segment, fraction)));
}

function distancePointTriangleSquared(value: RadialQueryPoint, a: RadialQueryPoint, b: RadialQueryPoint, c: RadialQueryPoint) {
  const ab = subtract(b, a); const ac = subtract(c, a); const ap = subtract(value, a);
  const d1 = dot(ab, ap); const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return lengthSquared(ap);
  const bp = subtract(value, b); const d3 = dot(ab, bp); const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return lengthSquared(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return lengthSquared(subtract(value, addScaled(a, ab, d1 / (d1 - d3))));
  const cp = subtract(value, c); const d5 = dot(ab, cp); const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return lengthSquared(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return lengthSquared(subtract(value, addScaled(a, ac, d2 / (d2 - d6))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return lengthSquared(subtract(value, addScaled(b, subtract(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))));
  }
  const denominator = 1 / (va + vb + vc);
  return lengthSquared(subtract(value, addScaled(addScaled(a, ab, vb * denominator), ac, vc * denominator)));
}

function vertex(values: readonly number[], index: number): RadialQueryPoint {
  return [values[index * 3], values[index * 3 + 1], values[index * 3 + 2]];
}

function rayTriangleFraction(origin: RadialQueryPoint, delta: RadialQueryPoint, a: RadialQueryPoint, b: RadialQueryPoint, c: RadialQueryPoint) {
  const edge1 = subtract(b, a); const edge2 = subtract(c, a); const h = cross(delta, edge2);
  const determinant = dot(edge1, h);
  if (Math.abs(determinant) <= EPSILON) return null;
  const inverse = 1 / determinant; const s = subtract(origin, a); const u = inverse * dot(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross(s, edge1); const v = inverse * dot(delta, q);
  if (v < 0 || u + v > 1) return null;
  const fraction = inverse * dot(edge2, q);
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}

function raySphereFraction(origin: RadialQueryPoint, delta: RadialQueryPoint, center: RadialQueryPoint, radius: number) {
  const offset = subtract(origin, center); const a = lengthSquared(delta);
  const b = 2 * dot(offset, delta); const c = lengthSquared(offset) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (a <= EPSILON || discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((value) => value >= 0 && value <= 1);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function rayCapsuleFraction(origin: RadialQueryPoint, delta: RadialQueryPoint, start: RadialQueryPoint, end: RadialQueryPoint, radius: number) {
  const segmentLength = Math.sqrt(lengthSquared(delta));
  if (segmentLength <= EPSILON) return null;
  const direction = delta.map((value) => value / segmentLength) as unknown as RadialQueryPoint;
  const ba = subtract(end, start); const oa = subtract(origin, start);
  const baba = dot(ba, ba); const bard = dot(ba, direction); const baoa = dot(ba, oa);
  const rdoa = dot(direction, oa); const oaoa = dot(oa, oa);
  const coefficientA = baba - bard * bard;
  const coefficientB = baba * rdoa - baoa * bard;
  const coefficientC = baba * oaoa - baoa * baoa - radius * radius * baba;
  const discriminant = coefficientB * coefficientB - coefficientA * coefficientC;
  const distances: number[] = [];
  if (Math.abs(coefficientA) > EPSILON && discriminant >= 0) {
    const distance = (-coefficientB - Math.sqrt(discriminant)) / coefficientA;
    const y = baoa + distance * bard;
    if (distance >= 0 && distance <= segmentLength && y > 0 && y < baba) distances.push(distance);
  }
  for (const center of [start, end]) {
    const fraction = raySphereFraction(origin, delta, center, radius);
    if (fraction !== null) distances.push(fraction * segmentLength);
  }
  return distances.length > 0 ? Math.min(...distances) / segmentLength : null;
}

function shapeDistanceSquared(shape: VehicleRadialQueryShape, origin: RadialQueryPoint) {
  if (shape.kind === "sphere") {
    const distance = Math.max(0, Math.sqrt(lengthSquared(subtract(origin, point(shape.centerM, "sphere.centerM")))) - shape.radiusM);
    return distance * distance;
  }
  if (shape.kind === "capsule") {
    const distance = Math.max(0, Math.sqrt(distancePointSegmentSquared(origin, point(shape.startM, "capsule.startM"), point(shape.endM, "capsule.endM"))) - shape.radiusM);
    return distance * distance;
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < shape.indices.length; index += 3) {
    nearest = Math.min(nearest, distancePointTriangleSquared(
      origin,
      vertex(shape.positionsM, shape.indices[index]),
      vertex(shape.positionsM, shape.indices[index + 1]),
      vertex(shape.positionsM, shape.indices[index + 2]),
    ));
  }
  return nearest;
}

function shapeRayFraction(shape: VehicleRadialQueryShape, origin: RadialQueryPoint, delta: RadialQueryPoint) {
  if (shape.kind === "sphere") return raySphereFraction(origin, delta, shape.centerM, shape.radiusM);
  if (shape.kind === "capsule") return rayCapsuleFraction(origin, delta, shape.startM, shape.endM, shape.radiusM);
  let nearest: number | null = null;
  for (let index = 0; index < shape.indices.length; index += 3) {
    const fraction = rayTriangleFraction(
      origin,
      delta,
      vertex(shape.positionsM, shape.indices[index]),
      vertex(shape.positionsM, shape.indices[index + 1]),
      vertex(shape.positionsM, shape.indices[index + 2]),
    );
    if (fraction !== null && (nearest === null || fraction < nearest)) nearest = fraction;
  }
  return nearest;
}

function pointAabbDistance(origin: RadialQueryPoint, bounds: VehicleRadialQueryComponent["bounds"]) {
  return Math.sqrt(origin.reduce((sum, value, axis) => {
    const delta = value < bounds.minM[axis]
      ? bounds.minM[axis] - value
      : value > bounds.maxM[axis]
        ? value - bounds.maxM[axis]
        : 0;
    return sum + delta * delta;
  }, 0));
}

export function validateVehicleRadialQuerySource(value: unknown): VehicleRadialQuerySource {
  const source = value as VehicleRadialQuerySource;
  invariant(source?.schemaVersion === "sigua-vehicle-radial-query-source/v1", "schemaVersion 不受支持");
  invariant(source.sourceBuildId === "squad-sdk-v10.5.3-17c100ea5182370e", "sourceBuildId 不匹配");
  invariant(source.queryContract?.objectMask === 0x47 && source.queryContract.onlyDamageMeshes === true, "query contract 不匹配");
  invariant(source.counts?.admittedComponents === source.components?.length, "组件计数不闭合");
  for (const [index, component] of source.components.entries()) {
    invariant(typeof component.componentId === "string" && component.componentId.length > 0, `组件 ${index} 身份缺失`);
    point(component.bounds?.originM, `组件 ${index} bounds origin`);
    invariant(Array.isArray(component.shapes) && component.shapes.length > 0, `组件 ${index} shapes 为空`);
  }
  return source;
}

export function resolveVehicleRadialQuery({
  source,
  originM,
  outerRadiusM,
  killZoneRadiusM = 0,
}: {
  source: VehicleRadialQuerySource;
  originM: RadialQueryPoint;
  outerRadiusM: number;
  killZoneRadiusM?: number;
}) {
  validateVehicleRadialQuerySource(source);
  const origin = point(originM, "originM");
  invariant(Number.isFinite(outerRadiusM) && outerRadiusM >= 0, "outerRadiusM 无效");
  invariant(Number.isFinite(killZoneRadiusM) && killZoneRadiusM >= 0, "killZoneRadiusM 无效");
  const radiusSquared = outerRadiusM * outerRadiusM;
  const candidates = source.components.filter((component) =>
    component.shapes.some((shape) => shapeDistanceSquared(shape, origin) <= radiusSquared));
  const hits: VehicleRadialQueryHit[] = [];
  for (const candidate of candidates) {
    if (pointAabbDistance(origin, candidate.bounds) < killZoneRadiusM) {
      hits.push({ candidateComponentId: candidate.componentId, hitComponentId: candidate.componentId, impactPointM: candidate.bounds.originM, route: "kill-zone-bypass" });
      continue;
    }
    const delta = subtract(candidate.bounds.originM, origin);
    let nearest: { fraction: number; hitComponent: VehicleRadialQueryComponent } | null = null;
    for (const hitComponent of source.components) {
      for (const shape of hitComponent.shapes) {
        const fraction = shapeRayFraction(shape, origin, delta);
        if (fraction !== null && (nearest === null || fraction < nearest.fraction)) nearest = { fraction, hitComponent };
      }
    }
    if (nearest) {
      hits.push({
        candidateComponentId: candidate.componentId,
        hitComponentId: nearest.hitComponent.componentId,
        impactPointM: addScaled(origin, delta, nearest.fraction),
        route: "same-owner-visibility-hit",
      });
    }
  }
  return { sourceBuildId: source.sourceBuildId, candidateCount: candidates.length, hits };
}

export function buildVehicleRadialLayerHitSets({
  source,
  model,
  impactPointM,
  impactNormal,
  layers,
  componentPoseByModelIndex,
}: {
  source: VehicleRadialQuerySource;
  model: {
    owners?: readonly { kind: "vehicle-root" | "seat" }[];
    components: readonly {
      componentId: string;
      classPath?: string;
      componentPath?: string;
      ownerIndex: number;
    }[];
  };
  impactPointM: RadialQueryPoint;
  impactNormal: RadialQueryPoint;
  layers: readonly {
    layerId: string;
    outerRadiusCm: number;
    killZoneRadiusCm: number;
    impactNormalOffsetCm: number;
  }[];
  componentPoseByModelIndex?: ReadonlyMap<number, readonly number[]>;
}) {
  validateVehicleRadialQuerySource(source);
  const rootOwnerIndices = (model.owners ?? []).flatMap((owner, index) =>
    owner.kind === "vehicle-root" ? [index] : []);
  invariant(rootOwnerIndices.length === 1, "命中模型必须包含一个根载具 owner");
  const rootOwnerIndex = rootOwnerIndices[0];
  const queryById = new Map(source.components.map((component) => [component.componentId, component]));
  const modelIndexByQueryId = new Map<string, number>();
  for (const queryComponent of source.components) {
    const matches = model.components.flatMap((component, index) => {
      const componentName = component.componentPath?.split(".").at(-1);
      return component.ownerIndex === rootOwnerIndex &&
        component.classPath === queryComponent.componentClassPath &&
        componentName === queryComponent.componentName
        ? [index]
        : [];
    });
    if (matches.length === 1) modelIndexByQueryId.set(queryComponent.componentId, matches[0]);
  }
  const transformPoint = (value: RadialQueryPoint, matrix: readonly number[]): RadialQueryPoint => [
    matrix[0] * value[0] + matrix[4] * value[1] + matrix[8] * value[2] + matrix[12],
    matrix[1] * value[0] + matrix[5] * value[1] + matrix[9] * value[2] + matrix[13],
    matrix[2] * value[0] + matrix[6] * value[1] + matrix[10] * value[2] + matrix[14],
  ];
  const posedSource: VehicleRadialQuerySource = componentPoseByModelIndex?.size
    ? {
        ...source,
        components: source.components.map((component) => {
          const modelIndex = modelIndexByQueryId.get(component.componentId);
          const matrix = modelIndex === undefined
            ? null
            : componentPoseByModelIndex.get(modelIndex) ?? null;
          if (!matrix) return component;
          invariant(matrix.length === 16 && matrix.every(Number.isFinite), `${component.componentName} 姿态矩阵无效`);
          const axisScales = [
            Math.hypot(matrix[0], matrix[1], matrix[2]),
            Math.hypot(matrix[4], matrix[5], matrix[6]),
            Math.hypot(matrix[8], matrix[9], matrix[10]),
          ];
          invariant(Math.max(...axisScales) - Math.min(...axisScales) <= 1e-5, `${component.componentName} 姿态包含非均匀缩放`);
          const boundsCorners: RadialQueryPoint[] = [];
          for (const x of [component.bounds.minM[0], component.bounds.maxM[0]]) {
            for (const y of [component.bounds.minM[1], component.bounds.maxM[1]]) {
              for (const z of [component.bounds.minM[2], component.bounds.maxM[2]]) {
                boundsCorners.push(transformPoint([x, y, z], matrix));
              }
            }
          }
          return {
            ...component,
            bounds: {
              minM: [0, 1, 2].map((axis) => Math.min(...boundsCorners.map((point) => point[axis]))) as unknown as RadialQueryPoint,
              maxM: [0, 1, 2].map((axis) => Math.max(...boundsCorners.map((point) => point[axis]))) as unknown as RadialQueryPoint,
              originM: transformPoint(component.bounds.originM, matrix),
            },
            shapes: component.shapes.map((shape): VehicleRadialQueryShape => {
              if (shape.kind === "sphere") {
                return { ...shape, centerM: transformPoint(shape.centerM, matrix), radiusM: shape.radiusM * axisScales[0] };
              }
              if (shape.kind === "capsule") {
                return {
                  ...shape,
                  startM: transformPoint(shape.startM, matrix),
                  endM: transformPoint(shape.endM, matrix),
                  radiusM: shape.radiusM * axisScales[0],
                };
              }
              const positionsM = [];
              for (let index = 0; index < shape.positionsM.length; index += 3) {
                positionsM.push(...transformPoint([
                  shape.positionsM[index],
                  shape.positionsM[index + 1],
                  shape.positionsM[index + 2],
                ], matrix));
              }
              return { ...shape, positionsM };
            }),
          };
        }),
      }
    : source;
  return layers.map((layer) => {
    invariant(typeof layer.layerId === "string" && layer.layerId.length > 0, "layerId 缺失");
    const originM = impactPointM.map(
      (value, axis) => value + impactNormal[axis] * layer.impactNormalOffsetCm / 100,
    ) as unknown as RadialQueryPoint;
    const query = resolveVehicleRadialQuery({
      source: posedSource,
      originM,
      outerRadiusM: layer.outerRadiusCm / 100,
      killZoneRadiusM: layer.killZoneRadiusCm / 100,
    });
    return {
      layerId: layer.layerId,
      evidence: "native-reconstructed" as const,
      sourceBuildId: source.sourceBuildId,
      originCm: originM.map((value) => value * 100) as unknown as RadialQueryPoint,
      componentHits: query.hits.map((hit) => {
        const queryComponent = queryById.get(hit.hitComponentId);
        invariant(queryComponent, `查询命中组件 ${hit.hitComponentId} 不存在`);
        return {
          componentIndex: modelIndexByQueryId.get(hit.hitComponentId) ?? null,
          ownerIndex: rootOwnerIndex,
          queryComponentId: hit.hitComponentId,
          nativeClassPath: queryComponent.componentClassPath,
          impactPointCm: hit.impactPointM.map((value) => value * 100) as unknown as RadialQueryPoint,
        };
      }),
    };
  });
}
