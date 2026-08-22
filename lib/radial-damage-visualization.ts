import {
  editorNativeEffectiveDamageAmount,
  type EditorNativeDamageEvent,
  type EditorNativeShotResult,
} from "./editor-native-hit-model.ts";
import { playerHitComponentLabel } from "./runtime-component-labels.ts";

export interface RadialDamageVisualizationComponent {
  componentId?: string | null;
  componentPath?: string | null;
  semanticKind?: string | null;
  directDamagePoolIndex?:
    | number
    | { value?: number | null }
    | null;
}

export type RadialDamageOutcomeState =
  | "resolved"
  | "partial"
  | "resolved-no-damage"
  | "native-unknown";

export interface RadialDamageVisualizationLayer {
  layerId: string;
  label: string;
  shortLabel: string;
  damageTypePath: string;
  innerRadiusM: number;
  outerRadiusM: number;
  originOffsetM: number;
  baseDamage: number;
  minimumDamage: number;
}

export interface RadialDamageVisualizationOrigin {
  componentIndex: number;
  componentId: string;
  componentLabel: string;
}

export interface RadialDamageVisualizationOutcome {
  poolIndex: number;
  poolId: string;
  poolKind: string;
  sourceComponentIndex: number;
  radialLayerId: string | null;
  route: EditorNativeDamageEvent["route"];
  effectiveDamage: number;
  componentIndices: number[];
}

export const RADIAL_DAMAGE_VISUAL_TIMING_MS = Object.freeze({
  layerDelay: 110,
  expansion: 620,
  fade: 260,
});

export function radialDamageGroundIntersectionRadiusM(
  radiusM: number,
  heightAboveGroundM: number,
) {
  const radius = Math.max(0, radiusM);
  const height = Math.max(0, heightAboveGroundM);
  if (height >= radius) return 0;
  return Math.sqrt(Math.max(0, radius * radius - height * height));
}

export interface RadialDamageLegendPlacement {
  angleOffsetRad: number;
}

export type RadialDamageCoverageState = "covered" | "clear" | "unknown";

export function radialDamageCoverageState(
  result: EditorNativeShotResult,
): RadialDamageCoverageState {
  if (
    result.damage.some(
      (event) =>
        event.damageKind === "radial" &&
        event.certainty !== "native-unknown" &&
        event.incomingDamage > 0,
    )
  ) return "covered";
  if (
    result.radial.state === "native-unknown" ||
    result.radial.componentFanout === "native-unknown" ||
    result.damage.some(
      (event) =>
        event.damageKind === "radial" && event.certainty === "native-unknown",
    )
  ) return "unknown";
  return "clear";
}

export function radialDamageLegendPlacement(
  layerIndex: number,
): RadialDamageLegendPlacement {
  const safeLayerIndex = Number.isInteger(layerIndex) && layerIndex >= 0
    ? layerIndex
    : 0;
  return {
    angleOffsetRad: -(28 + safeLayerIndex * 22) / 100,
  };
}

/**
 * Presentation contract shared by the WebGL surface/ring and result panel.
 *
 * It deliberately separates the struck component that seeds the explosion
 * origin from the health pools that actually receive radial damage. The
 * browser may display resolved pool outcomes, but it must not invent native
 * overlap/visibility component fan-out when the hit model marks it unknown.
 */
export interface RadialDamageVisualizationPlan {
  geometry: "smooth-camera-far-hemisphere-with-exact-ring";
  visualClip: "camera-far-hemisphere";
  surfaceHemisphere: "camera-opposite";
  legendPlacement: "camera-opposite-staggered-on-exact-ring";
  exactRadiusReference: "horizontal-outer-boundary-ring";
  targetSelection: "root-actor-impact-topology";
  radiusPresentation: "exact";
  origin: RadialDamageVisualizationOrigin;
  layers: RadialDamageVisualizationLayer[];
  outcomes: RadialDamageVisualizationOutcome[];
  outcomeState: RadialDamageOutcomeState;
  componentFanout: EditorNativeShotResult["radial"]["componentFanout"];
}

function resolvedRadialOutcomes(
  result: EditorNativeShotResult,
  components: readonly RadialDamageVisualizationComponent[],
): RadialDamageVisualizationOutcome[] {
  return result.damage.flatMap((event) => {
    if (event.damageKind !== "radial" || event.certainty !== "resolved") {
      return [];
    }
    const effectiveDamage = editorNativeEffectiveDamageAmount(event);
    if (effectiveDamage <= 0) return [];
    const componentIndices = components.flatMap((component, componentIndex) => {
      const poolEvidence = component.directDamagePoolIndex;
      const poolIndex = typeof poolEvidence === "number"
        ? poolEvidence
        : poolEvidence?.value;
      return poolIndex === event.poolIndex ? [componentIndex] : [];
    });
    return [{
      poolIndex: event.poolIndex,
      poolId: event.poolId,
      poolKind: event.poolKind,
      sourceComponentIndex: event.sourceComponentIndex,
      radialLayerId: event.radialLayerId ?? null,
      route: event.route,
      effectiveDamage,
      componentIndices,
    }];
  });
}

export function buildRadialDamageVisualizationPlan(
  result: EditorNativeShotResult,
  components: readonly RadialDamageVisualizationComponent[] = [],
): RadialDamageVisualizationPlan | null {
  if (result.radial.layers.length === 0) {
    return null;
  }

  const firstImpact = result.layers[0] ?? null;
  const radialSourceComponentIndex = result.damage.find(
    (event) => event.damageKind === "radial",
  )?.sourceComponentIndex ?? 0;
  const originComponentIndex = firstImpact?.componentIndex ?? radialSourceComponentIndex;
  const originComponent = components[originComponentIndex] ?? firstImpact;
  const layers = result.radial.layers.flatMap((radialLayer) => {
    const ballisticsLayer = result.ballistics.explosiveLayers.find(
      (candidate) => candidate.layerId === radialLayer.layerId,
    );
    if (!ballisticsLayer) return [];
    const innerRadiusM = Math.max(0, ballisticsLayer.innerRadiusCm / 100);
    const outerRadiusM = Math.max(0, ballisticsLayer.outerRadiusCm / 100);
    return [{
      layerId: radialLayer.layerId,
      label: radialLayer.label,
      shortLabel: radialLayer.shortLabel,
      damageTypePath: radialLayer.damageTypePath,
      innerRadiusM,
      outerRadiusM,
      originOffsetM: radialLayer.explosionOriginOffsetCm / 100,
      baseDamage: radialLayer.baseDamage,
      minimumDamage: radialLayer.minimumDamage,
    }];
  });
  if (layers.length === 0) return null;

  const outcomes = resolvedRadialOutcomes(result, components);
  const unresolvedFanout = result.radial.componentFanout === "native-unknown" ||
    result.radial.componentFanout === "native-query-required";
  const outcomeState: RadialDamageOutcomeState = outcomes.length > 0
    ? unresolvedFanout ? "partial" : "resolved"
    : unresolvedFanout
      ? "native-unknown"
      : "resolved-no-damage";

  return {
    geometry: "smooth-camera-far-hemisphere-with-exact-ring",
    visualClip: "camera-far-hemisphere",
    surfaceHemisphere: "camera-opposite",
    legendPlacement: "camera-opposite-staggered-on-exact-ring",
    exactRadiusReference: "horizontal-outer-boundary-ring",
    targetSelection: "root-actor-impact-topology",
    radiusPresentation: "exact",
    origin: {
      componentIndex: originComponentIndex,
      componentId:
        originComponent?.componentId ?? firstImpact?.componentId ?? "radial-origin",
      componentLabel: firstImpact
        ? playerHitComponentLabel(originComponent)
        : "自由爆心",
    },
    layers,
    outcomes,
    outcomeState,
    componentFanout: result.radial.componentFanout,
  };
}
