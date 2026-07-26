export interface AnalysisVisualPlacementIdentity {
  readonly name?: string | null;
  readonly sourceMeshPath?: string | null;
}

export interface AnalysisVisualSurfaceEvidence extends AnalysisVisualPlacementIdentity {
  readonly stableOccurrenceId: string;
  readonly actor: string;
  readonly geometryScore: number;
  readonly materialRequiresStableSurface: boolean;
}

export type AnalysisVisualStableSurfaceReason =
  | "identity"
  | "source-material"
  | "actor-absent-from-hit"
  | "subordinate-geometry";

const STABLE_ANALYSIS_SURFACE_IDENTITY =
  /(?:decor|deco|glass|window|windshield|water[_\s-]?shield|camo)/i;
const SUBORDINATE_GEOMETRY_RATIO = 0.9;
export const ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR = 1;
export const ANALYSIS_VISUAL_DEPTH_BIAS_UNITS = 1;

/**
 * Thin appearance-only surfaces often sit directly on top of the hit mesh.
 * They need a stable overlay pass in analysis modes or depth precision and
 * transparent-object sorting can make them disappear at grazing angles.
 */
export function isStableAnalysisVisualSurfacePlacement(
  placement: AnalysisVisualPlacementIdentity,
): boolean {
  return STABLE_ANALYSIS_SURFACE_IDENTITY.test(
    `${placement.name ?? ""}\n${placement.sourceMeshPath ?? ""}`,
  );
}

function hitActorFromComponentPath(componentPath: string) {
  return /:PersistentLevel\.([^.]+)\./.exec(componentPath)?.[1] ?? null;
}

/**
 * Resolve appearance-only surfaces from runtime evidence rather than a
 * vehicle-specific allowlist. Material and identity evidence catch thin sheets;
 * hit actor closure catches child meshes that do not exist in the collision
 * model; geometry rank catches small attachments sharing a structural actor.
 */
export function analysisVisualStableSurfaceReasons(
  placements: readonly AnalysisVisualSurfaceEvidence[],
  hitComponentPaths: readonly string[],
): ReadonlyMap<string, readonly AnalysisVisualStableSurfaceReason[]> {
  const hitActors = new Set(
    hitComponentPaths
      .map(hitActorFromComponentPath)
      .filter((actor): actor is string => Boolean(actor)),
  );
  const byActor = new Map<string, AnalysisVisualSurfaceEvidence[]>();
  for (const placement of placements) {
    const actorPlacements = byActor.get(placement.actor) ?? [];
    actorPlacements.push(placement);
    byActor.set(placement.actor, actorPlacements);
  }

  const reasons = new Map<string, readonly AnalysisVisualStableSurfaceReason[]>();
  for (const placement of placements) {
    const placementReasons: AnalysisVisualStableSurfaceReason[] = [];
    if (isStableAnalysisVisualSurfacePlacement(placement)) {
      placementReasons.push("identity");
    }
    if (placement.materialRequiresStableSurface) {
      placementReasons.push("source-material");
    }
    if (hitActors.size > 0 && !hitActors.has(placement.actor)) {
      placementReasons.push("actor-absent-from-hit");
    }
    const actorPlacements = byActor.get(placement.actor) ?? [];
    const largestGeometryScore = actorPlacements.reduce(
      (largest, candidate) => Math.max(largest, candidate.geometryScore),
      0,
    );
    if (
      actorPlacements.length > 1 &&
      largestGeometryScore > 0 &&
      placement.geometryScore < largestGeometryScore * SUBORDINATE_GEOMETRY_RATIO
    ) {
      placementReasons.push("subordinate-geometry");
    }
    if (placementReasons.length > 0) {
      reasons.set(placement.stableOccurrenceId, placementReasons);
    }
  }
  return reasons;
}
