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

/**
 * Presentation contract shared by the WebGL surface/ring and result panel.
 *
 * It deliberately separates the struck component that seeds the explosion
 * origin from the health pools that actually receive radial damage. The
 * browser may display resolved pool outcomes, but it must not invent native
 * overlap/visibility component fan-out when the hit model marks it unknown.
 */
export interface RadialDamageVisualizationPlan {
  geometry: "smooth-full-sphere-with-exact-ring";
  exactRadiusReference: "horizontal-outer-boundary-ring";
  targetSelection: "per-component-native-overlap-visibility";
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
  if (result.radial.layers.length === 0 || result.layers.length === 0) {
    return null;
  }

  const firstImpact = result.layers[0];
  const originComponent = components[firstImpact.componentIndex] ?? firstImpact;
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
  const outcomeState: RadialDamageOutcomeState = outcomes.length > 0
    ? "resolved"
    : result.radial.componentFanout === "native-unknown"
      ? "native-unknown"
      : "resolved-no-damage";

  return {
    geometry: "smooth-full-sphere-with-exact-ring",
    exactRadiusReference: "horizontal-outer-boundary-ring",
    targetSelection: "per-component-native-overlap-visibility",
    radiusPresentation: "exact",
    origin: {
      componentIndex: firstImpact.componentIndex,
      componentId: originComponent.componentId ?? firstImpact.componentId,
      componentLabel: playerHitComponentLabel(originComponent),
    },
    layers,
    outcomes,
    outcomeState,
    componentFanout: result.radial.componentFanout,
  };
}
