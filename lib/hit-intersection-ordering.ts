/**
 * Geometry-only normalization for the intersections produced by one ray.
 *
 * This deliberately does not infer any cross-component/actor gameplay rule. It
 * only removes the duplicate triangle hits that a raycaster can report when a
 * ray lands on a shared edge or vertex.
 */

export type HitVector3 = readonly [x: number, y: number, z: number];

export interface HitIntersectionOrderingInput {
  distanceM: number;
  componentId: string | number;
  surfaceProfileIndex: number;
  sourceFaceId: number;
  point: HitVector3;
  faceNormal: HitVector3;
}

export interface HitIntersectionOrderingOptions {
  /** Maximum ray-distance difference for an edge/vertex duplicate. */
  distanceEpsilonM?: number;
  /** Maximum Euclidean distance between the reported hit points. */
  pointEpsilonM?: number;
  /** Maximum distance from either hit point to the other triangle plane. */
  planeEpsilonM?: number;
  /** Minimum same-facing normal dot product. Opposite faces never deduplicate. */
  minimumNormalDot?: number;
}

export interface NormalizedHitIntersection<T extends HitIntersectionOrderingInput> {
  /** The nearest hit is retained as the canonical intersection. */
  hit: T;
  /** Every source triangle represented by this intersection, in hit order. */
  sourceFaceIds: number[];
  /** Original input positions for deterministic diagnostics. */
  sourceHitIndices: number[];
}

/** 0.1 mm matches the analysis geometry's allowed intersection tolerance. */
export const DEFAULT_HIT_INTERSECTION_ORDERING_OPTIONS = Object.freeze({
  distanceEpsilonM: 0.0001,
  pointEpsilonM: 0.0001,
  planeEpsilonM: 0.00001,
  minimumNormalDot: 0.99999,
});

interface PreparedHit<T extends HitIntersectionOrderingInput> {
  hit: T;
  inputIndex: number;
  unitNormal: [number, number, number];
}

interface MutableNormalizedHit<T extends HitIntersectionOrderingInput>
  extends NormalizedHitIntersection<T> {
  unitNormal: [number, number, number];
}

function validateNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}

function validateVector(name: string, vector: HitVector3) {
  if (vector.length !== 3 || vector.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${name} must contain three finite numbers`);
  }
}

function normalized(vector: HitVector3): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length === 0) {
    throw new TypeError("faceNormal must have a finite, non-zero length");
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dot(a: HitVector3, b: HitVector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a: HitVector3, b: HitVector3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function distance(a: HitVector3, b: HitVector3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isCoplanarDuplicate<T extends HitIntersectionOrderingInput>(
  candidate: PreparedHit<T>,
  existing: MutableNormalizedHit<T>,
  options: Required<HitIntersectionOrderingOptions>,
) {
  if (candidate.hit.componentId !== existing.hit.componentId) return false;
  if (candidate.hit.surfaceProfileIndex !== existing.hit.surfaceProfileIndex) return false;

  // Same-facing is intentional. It prevents a very thin plate's real entry and
  // exit faces from being collapsed even when they are closer than the distance
  // epsilon.
  if (dot(candidate.unitNormal, existing.unitNormal) < options.minimumNormalDot) {
    return false;
  }
  if (distance(candidate.hit.point, existing.hit.point) > options.pointEpsilonM) {
    return false;
  }

  const existingToCandidate = subtract(candidate.hit.point, existing.hit.point);
  if (Math.abs(dot(existing.unitNormal, existingToCandidate)) > options.planeEpsilonM) {
    return false;
  }
  if (Math.abs(dot(candidate.unitNormal, existingToCandidate)) > options.planeEpsilonM) {
    return false;
  }
  return true;
}

/**
 * Sort and normalize the triangle intersections for a single ray.
 *
 * Ordering is ascending by exact distance. Equal distances retain input order.
 * Only same-component, same-surface, same-facing coplanar hits within the
 * explicit tolerances are merged. No gameplay or repeating-actor behavior is
 * implied by this function.
 */
export function normalizeHitIntersections<T extends HitIntersectionOrderingInput>(
  hits: readonly T[],
  overrides: HitIntersectionOrderingOptions = {},
): NormalizedHitIntersection<T>[] {
  const options: Required<HitIntersectionOrderingOptions> = {
    ...DEFAULT_HIT_INTERSECTION_ORDERING_OPTIONS,
    ...overrides,
  };

  validateNonNegativeFinite("distanceEpsilonM", options.distanceEpsilonM);
  validateNonNegativeFinite("pointEpsilonM", options.pointEpsilonM);
  validateNonNegativeFinite("planeEpsilonM", options.planeEpsilonM);
  if (
    !Number.isFinite(options.minimumNormalDot) ||
    options.minimumNormalDot < -1 ||
    options.minimumNormalDot > 1
  ) {
    throw new RangeError("minimumNormalDot must be between -1 and 1");
  }

  const prepared = hits.map<PreparedHit<T>>((hit, inputIndex) => {
    validateNonNegativeFinite(`hits[${inputIndex}].distanceM`, hit.distanceM);
    validateVector(`hits[${inputIndex}].point`, hit.point);
    validateVector(`hits[${inputIndex}].faceNormal`, hit.faceNormal);
    if (!Number.isInteger(hit.sourceFaceId) || hit.sourceFaceId < 0) {
      throw new RangeError(`hits[${inputIndex}].sourceFaceId must be a non-negative integer`);
    }
    if (!Number.isInteger(hit.surfaceProfileIndex) || hit.surfaceProfileIndex < 0) {
      throw new RangeError(
        `hits[${inputIndex}].surfaceProfileIndex must be a non-negative integer`,
      );
    }
    return { hit, inputIndex, unitNormal: normalized(hit.faceNormal) };
  });

  prepared.sort((a, b) => a.hit.distanceM - b.hit.distanceM || a.inputIndex - b.inputIndex);

  const normalizedHits: MutableNormalizedHit<T>[] = [];
  for (const candidate of prepared) {
    let duplicate: MutableNormalizedHit<T> | undefined;
    for (let index = normalizedHits.length - 1; index >= 0; index -= 1) {
      const existing = normalizedHits[index];
      if (candidate.hit.distanceM - existing.hit.distanceM > options.distanceEpsilonM) break;
      if (isCoplanarDuplicate(candidate, existing, options)) {
        duplicate = existing;
        break;
      }
    }

    if (duplicate) {
      duplicate.sourceFaceIds.push(candidate.hit.sourceFaceId);
      duplicate.sourceHitIndices.push(candidate.inputIndex);
      continue;
    }

    normalizedHits.push({
      hit: candidate.hit,
      sourceFaceIds: [candidate.hit.sourceFaceId],
      sourceHitIndices: [candidate.inputIndex],
      unitNormal: candidate.unitNormal,
    });
  }

  return normalizedHits.map((intersection) => ({
    hit: intersection.hit,
    sourceFaceIds: intersection.sourceFaceIds,
    sourceHitIndices: intersection.sourceHitIndices,
  }));
}

