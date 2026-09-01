import type {
  GunnerSightLayer,
  GunnerSightProjection,
  GunnerSightStage,
  GunnerSightStation,
  GunnerSightTextLayer,
} from "./vehicle-gunner-sight";

export type GunnerSightRenderLayer =
  | {
      kind: "image";
      widgetName: string;
      layer: GunnerSightLayer;
      projection: GunnerSightProjection;
    }
  | {
      kind: "solid";
      widgetName: string;
      layer: GunnerSightLayer;
    }
  | {
      kind: "text";
      widgetName: string;
      layer: GunnerSightTextLayer;
    };

function visible(layer: { visibility: string | null; renderOpacity: number | null }) {
  return !["Collapsed", "Hidden"].includes(layer.visibility ?? "Visible") &&
    layer.renderOpacity !== 0;
}

function comparePaintOrder(left: GunnerSightRenderLayer, right: GunnerSightRenderLayer) {
  const difference = (left.layer.paintOrder ?? 0) -
    (right.layer.paintOrder ?? 0);
  if (difference !== 0) return difference;
  return left.widgetName.localeCompare(right.widgetName, "en");
}

function activeReticleTarget(
  station: GunnerSightStation,
  activeStage: GunnerSightStage | undefined,
) {
  if (activeStage?.presentation.kind === "material-texture-parameter") {
    return activeStage.presentation.targetWidgetName;
  }
  const exact = station.layers.find(({ resourceRef }) =>
    resourceRef === activeStage?.sourceObjectPath
  );
  return exact?.widgetName ??
    station.layers.find(({ widgetName }) => widgetName === "MainReticle")?.widgetName ??
    station.layers.find(({ role }) => role === "reticle")?.widgetName ??
    null;
}

export function compileGunnerSightRenderLayers(
  station: GunnerSightStation,
  activeStage: GunnerSightStage | undefined,
  projections: GunnerSightProjection[],
): GunnerSightRenderLayer[] {
  const projectionById = new Map(
    projections.map((projection) => [projection.id, projection]),
  );
  const activeProjection = activeStage?.projectionRef
    ? projectionById.get(activeStage.projectionRef) ?? null
    : null;
  const targetWidgetName = activeReticleTarget(station, activeStage);
  const result: GunnerSightRenderLayer[] = [];
  for (const layer of station.layers) {
    if (!visible(layer) || layer.role === "damage-overlay") continue;
    if (layer.state === "observed-solid-brush") {
      result.push({ kind: "solid", widgetName: layer.widgetName, layer });
      continue;
    }
    const projection = layer.widgetName === targetWidgetName && activeProjection
      ? activeProjection
      : layer.projectionRef
        ? projectionById.get(layer.projectionRef) ?? null
        : null;
    if (projection) {
      result.push({ kind: "image", widgetName: layer.widgetName, layer, projection });
    }
  }
  for (const layer of station.textLayers ?? []) {
    if (!visible(layer) || !layer.text || !Number.isFinite(layer.font?.size)) continue;
    result.push({ kind: "text", widgetName: layer.widgetName, layer });
  }
  return result.sort(comparePaintOrder);
}
