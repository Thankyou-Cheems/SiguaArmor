import type {
  CompiledVehicleStationGraph,
  StationGraphStation,
} from "./vehicle-station-graph";

export interface GunnerSightProjection {
  id: string;
  sourceObjectPath: string;
  materialTemplateObjectPath: string | null;
  kind: "lossless-rgba-webp" | "lossless-ui-material-projection-webp";
  assetUrl: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  pixelAbsoluteError: 0;
}

export interface GunnerSightStage {
  zoomIndex: number;
  sourceObjectPath: string;
  projectionBindingKey: string;
  presentation:
    | { kind: "direct-resource" }
    | {
        kind: "material-texture-parameter";
        targetWidgetName: string;
        materialTemplateRef: string;
        parameterName: "Texture";
        setterNodes: string[];
      };
  projectionRef: string | null;
}

export interface GunnerSightWeaponMode {
  equipmentRef: string;
  weaponClassPath: string;
  weaponClassName: string;
  displayName: string;
  state: "observed-class-to-reticle-select-route";
  source: {
    graphPath: string;
    comparisonNodes: string[];
    selectNodes: string[];
    routeKind: "EqualEqual_ClassClass-to-K2Node_Select";
  };
  zoomStages: GunnerSightStage[];
}

export interface GunnerSightLayer {
  widgetName: string;
  role: "viewport-screen" | "reticle" | "auxiliary-static" | "damage-overlay";
  state: string;
  resourceRef: string | null;
  projectionRef: string | null;
  imageSize: { X: number; Y: number } | null;
  brushDrawAs: "Image" | "Box" | "Border" | string | null;
  tintColor: { R: number; G: number; B: number; A: number } | null;
  colorAndOpacity: { R: number; G: number; B: number; A: number } | null;
  visibility: string | null;
  renderOpacity: number | null;
  slot: {
    layoutData: {
      Offsets?: { Left: number; Top: number; Right: number; Bottom: number };
      Anchors?: {
        Minimum: { X: number; Y: number };
        Maximum: { X: number; Y: number };
      };
      Alignment?: { X: number; Y: number };
    } | null;
    autoSize: boolean | null;
    zOrder: number | null;
  } | null;
  renderTransform: {
    Translation: { X: number; Y: number };
    Scale: { X: number; Y: number };
    Shear: { X: number; Y: number };
    Angle: number;
  } | null;
  renderTransformPivot: { X: number; Y: number } | null;
  paintOrder: number | null;
  layout?: GunnerSightLayerLayout | null;
}

export interface GunnerSightTextLayer {
  widgetName: string;
  role: "instrument-text";
  state: "observed-default-text";
  text: string;
  sourceText: string | null;
  font: {
    objectRef: string | null;
    materialRef: string | null;
    typeface: string | null;
    size: number | null;
    letterSpacing: number | null;
    skewAmount: number | null;
    forceMonospaced: boolean | null;
    monospacedWidth: number | null;
    outline: {
      OutlineSize?: number;
      OutlineColor?: { R: number; G: number; B: number; A: number };
    } | null;
  };
  colorAndOpacity: { R: number; G: number; B: number; A: number } | null;
  shadowColorAndOpacity: { R: number; G: number; B: number; A: number } | null;
  shadowOffset: { X: number; Y: number } | null;
  justification: "Left" | "Center" | "Right" | string | null;
  visibility: string | null;
  renderOpacity: number | null;
  paintOrder: number | null;
  slot: GunnerSightLayer["slot"];
  renderTransform: GunnerSightLayer["renderTransform"];
  renderTransformPivot: GunnerSightLayer["renderTransformPivot"];
  layout?: GunnerSightLayerLayout | null;
}

export type GunnerSightDynamicSemantic =
  | "commander-override-indicator"
  | "current-weapon-label"
  | "current-weapon-selection-indicator"
  | "excluded-damage-state-indicator"
  | "guidance-indicator"
  | "local-clock-text"
  | "magazine-rounds-dial-angle"
  | "magazine-rounds-display-color"
  | "magazine-rounds-remaining"
  | "optic-tunnel-parallax"
  | "rangefinder-distance-meters"
  | "rangefinder-indicator"
  | "related-station-relative-yaw-degrees"
  | "render-quality-text"
  | "stabilization-indicator"
  | "stabilization-status"
  | "station-pitch-degrees"
  | "station-pitch-translation"
  | "station-relative-yaw-degrees"
  | "weapon-empty-indicator"
  | "weapon-not-ready-indicator"
  | "weapon-overheat-indicator"
  | "weapon-and-ammo-label"
  | "weapon-fire-mode-label"
  | "weapon-ready-indicator"
  | "weapon-ready-status"
  | "weapon-reloading-indicator"
  | "weapon-reticle-offset"
  | "zoom-stage-label"
  | "zoom-label-layout"
  | "zoom-stage-visibility";

export interface GunnerSightDynamicBinding {
  id: string;
  state: "observed-blueprint-property-route";
  semantic: GunnerSightDynamicSemantic;
  targetWidgetName: string;
  property:
    | "text"
    | "render-angle-degrees"
    | "render-translation"
    | "color-and-opacity"
    | "visibility"
    | "render-opacity";
  relatedSeatPawnClassPaths: string[];
  valueModel: {
    kind?: string;
    minimum?: number;
    maximum?: number;
    emptyWhenNegative?: boolean;
    color?: { R: number; G: number; B: number; A: number };
    falseColor?: { R: number; G: number; B: number; A: number };
    trueColor?: { R: number; G: number; B: number; A: number };
    interpolationSpeedPerSecond?: number | null;
    anglesDegrees?: number[];
    sourceCdoProperty?: string;
  } | null;
  source: {
    declaringClassPath: string;
    graphPath: string;
    setterNode: string;
    setterFunction: string;
    contextFunctions: string[];
    contextVariables: string[];
    contextPins?: string[];
    inheritedDepth: number;
    aliasNode: string | null;
  };
}

export interface GunnerSightLayerLayoutStep {
  parentWidgetName: string | null;
  widgetName: string;
  widgetClassPath: string;
  slotClassPath: string;
  layoutMode: "canvas-panel" | "fill-parent";
  layoutData: {
    Offsets: { Left: number; Top: number; Right: number; Bottom: number };
    Anchors: {
      Minimum: { X: number; Y: number };
      Maximum: { X: number; Y: number };
    };
    Alignment: { X: number; Y: number };
  } | null;
  autoSize: boolean | null;
  zOrder: number | null;
  renderTransform: {
    Translation: { X: number; Y: number };
    Scale: { X: number; Y: number };
    Shear: { X: number; Y: number };
    Angle: number;
  } | null;
  renderTransformPivot: { X: number; Y: number } | null;
}

export interface GunnerSightLayerLayout {
  state:
    | "observed-canvas-panel-path"
    | "derived-hd-canvas-panel-path"
    | string;
  reason?: string | null;
  rootWidgetName?: string | null;
  referenceCanvas: {
    state?: string;
    width: number | null;
    height: number | null;
  };
  steps: GunnerSightLayerLayoutStep[];
}

export interface GunnerSightStation {
  stationId: string;
  catalogSeatIndex: number;
  seatPawnClassPath: string;
  equipmentRefs: string[];
  state:
    | "observed-static-presentation"
    | "observed-dynamic-presentation"
    | "absent-no-turret-overlay"
    | "absent-dynamic-widget-no-static-image"
    | "unresolved-no-web-projection";
  absenceReason?:
    | "no-turret-overlay"
    | "observed-widget-has-no-image-layer"
    | null;
  overlayClassPath: string | null;
  widgetPackage: string | null;
  widgetParentClassPath: string | null;
  selectionState?: string;
  layers: GunnerSightLayer[];
  textLayers: GunnerSightTextLayer[];
  defaultZoomStages: GunnerSightStage[];
  weaponModes: GunnerSightWeaponMode[];
  unmatchedEquipmentRefs: string[];
  orphanWidgetWeaponClassPaths: string[];
  dynamicChannels: string[];
  dynamicBindings: GunnerSightDynamicBinding[];
  projectionRefs?: string[];
}

export interface VehicleGunnerSightRecord {
  schemaVersion: "sigua-vehicle-gunner-sight/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceVehicleRef: string;
  sourceDataRevision: string;
  stationGraphDataRevision: string;
  runtimeVehicleRefs: string[];
  catalogBindingRefs: string[];
  rawName: string;
  targetPackage: string;
  generatedClass: string;
  evidence: {
    state: "sdk-blueprint-static-projection-and-local-dynamic-binding";
    blueprintSourceBuildId: string;
    network: "out-of-scope";
    hitMechanics: "not-applicable-presentation-only";
    damageBlindnessMechanic: "not-claimed";
  };
  stations: GunnerSightStation[];
  projectionRefs: string[];
  projections: GunnerSightProjection[];
}

export interface CompiledVehicleGunnerSight {
  schemaVersion: "sigua-vehicle-gunner-sight/v1";
  sourceVehicleRef: string;
  sourceDataRevision: string;
  stations: GunnerSightStation[];
  projections: GunnerSightProjection[];
}

function sameValues(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const dynamicSemantics = new Set<GunnerSightDynamicSemantic>([
  "commander-override-indicator",
  "current-weapon-label",
  "current-weapon-selection-indicator",
  "excluded-damage-state-indicator",
  "guidance-indicator",
  "local-clock-text",
  "magazine-rounds-dial-angle",
  "magazine-rounds-remaining",
  "optic-tunnel-parallax",
  "rangefinder-distance-meters",
  "rangefinder-indicator",
  "related-station-relative-yaw-degrees",
  "render-quality-text",
  "stabilization-indicator",
  "stabilization-status",
  "station-pitch-degrees",
  "station-pitch-translation",
  "station-relative-yaw-degrees",
  "weapon-empty-indicator",
  "weapon-not-ready-indicator",
  "weapon-overheat-indicator",
  "weapon-ready-indicator",
  "weapon-ready-status",
  "weapon-reloading-indicator",
  "weapon-reticle-offset",
  "zoom-label-layout",
  "zoom-stage-visibility",
]);

function presentationTargetNames(sight: GunnerSightStation) {
  return new Set([
    ...sight.layers.map(({ widgetName }) => widgetName),
    ...sight.textLayers.map(({ widgetName }) => widgetName),
    ...sight.layers.flatMap(({ layout }) =>
      layout?.steps.flatMap(({ widgetName, parentWidgetName }) =>
        [widgetName, parentWidgetName].filter((value): value is string => Boolean(value))
      ) ?? []
    ),
    ...sight.textLayers.flatMap(({ layout }) =>
      layout?.steps.flatMap(({ widgetName, parentWidgetName }) =>
        [widgetName, parentWidgetName].filter((value): value is string => Boolean(value))
      ) ?? []
    ),
  ]);
}

function validateStation(
  sight: GunnerSightStation,
  graph: StationGraphStation,
  projectionIds: Set<string>,
) {
  if (
    sight.stationId !== graph.id ||
    sight.catalogSeatIndex !== graph.catalogSeatIndex ||
    sight.seatPawnClassPath !== graph.seatPawnClassPath ||
    !sameValues(sight.equipmentRefs, graph.equipmentRefs)
  ) throw new Error(`SiguaWiki gunner sight differs for ${graph.id}`);
  if (sight.state === "absent-no-turret-overlay") {
    if (
      sight.overlayClassPath !== null ||
      sight.layers.length !== 0 ||
      sight.weaponModes.length !== 0 ||
      sight.dynamicBindings.length !== 0
    ) throw new Error(`SiguaWiki gunner sight inferred an absent overlay for ${graph.id}`);
    return;
  }
  if (sight.state === "absent-dynamic-widget-no-static-image") {
    if (
      !sight.overlayClassPath?.startsWith("/Game/") ||
      !sight.widgetPackage?.startsWith("/Game/") ||
      sight.absenceReason !== "observed-widget-has-no-image-layer" ||
      sight.layers.length !== 0 ||
      sight.defaultZoomStages.length !== 0 ||
      sight.weaponModes.length !== 0 ||
      sight.dynamicBindings.length === 0
    ) throw new Error(`SiguaWiki gunner sight dynamic-only absence differs for ${graph.id}`);
  }
  if (!sight.overlayClassPath?.startsWith("/Game/") || !sight.widgetPackage?.startsWith("/Game/")) {
    throw new Error(`SiguaWiki gunner sight overlay is invalid for ${graph.id}`);
  }
  const equipmentRefs = new Set(graph.equipmentRefs);
  for (const mode of sight.weaponModes) {
    if (
      !equipmentRefs.has(mode.equipmentRef) ||
      mode.source.routeKind !== "EqualEqual_ClassClass-to-K2Node_Select" ||
      mode.zoomStages.length === 0
    ) throw new Error(`SiguaWiki gunner sight weapon mode is invalid for ${graph.id}`);
    for (const stage of mode.zoomStages) {
      if (stage.projectionRef !== null && !projectionIds.has(stage.projectionRef)) {
        throw new Error(`SiguaWiki gunner sight zoom projection is missing for ${graph.id}`);
      }
    }
  }
  for (const layer of sight.layers) {
    if (layer.projectionRef !== null && !projectionIds.has(layer.projectionRef)) {
      throw new Error(`SiguaWiki gunner sight layer projection is missing for ${graph.id}`);
    }
    if (
      layer.state === "excluded-default-collapsed-damage-layer" &&
      (layer.role !== "damage-overlay" ||
        layer.visibility !== "Collapsed" ||
        layer.projectionRef !== null)
    ) throw new Error(`SiguaWiki gunner sight enabled a damage overlay for ${graph.id}`);
  }
  const targets = presentationTargetNames(sight);
  const bindingIds = new Set<string>();
  for (const binding of sight.dynamicBindings) {
    if (
      bindingIds.has(binding.id) ||
      binding.state !== "observed-blueprint-property-route" ||
      !dynamicSemantics.has(binding.semantic) ||
      !targets.has(binding.targetWidgetName) ||
      !binding.source.declaringClassPath.startsWith("/Game/") ||
      !binding.source.graphPath.startsWith("/Game/") ||
      !Number.isSafeInteger(binding.source.inheritedDepth) ||
      binding.relatedSeatPawnClassPaths.some((classPath) =>
        !classPath.startsWith("/Game/") || !classPath.endsWith("_C")
      )
    ) throw new Error(`SiguaWiki gunner sight dynamic binding differs for ${graph.id}`);
    bindingIds.add(binding.id);
  }
  const expectedDynamicChannels = [...new Set([
    ...(sight.state === "observed-static-presentation"
      ? ["zoom-change", "weapon-change"]
      : []),
    ...sight.dynamicBindings.map(({ semantic }) => semantic),
  ])].sort();
  if (!sameValues(sight.dynamicChannels, expectedDynamicChannels)) {
    throw new Error(`SiguaWiki gunner sight dynamic channels differ for ${graph.id}`);
  }
}

export function compileVehicleGunnerSight(
  record: VehicleGunnerSightRecord | null,
  stationGraph: CompiledVehicleStationGraph,
): CompiledVehicleGunnerSight | null {
  if (!record) return null;
  if (
    record.schemaVersion !== "sigua-vehicle-gunner-sight/v1" ||
    record.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
    record.sourceVehicleRef !== stationGraph.sourceVehicleRef ||
    record.stationGraphDataRevision !== stationGraph.sourceDataRevision ||
    !/^[a-f0-9]{64}$/u.test(record.sourceDataRevision) ||
    record.evidence?.state !==
      "sdk-blueprint-static-projection-and-local-dynamic-binding" ||
    record.evidence?.network !== "out-of-scope" ||
    record.evidence?.hitMechanics !== "not-applicable-presentation-only" ||
    record.evidence?.damageBlindnessMechanic !== "not-claimed" ||
    record.stations.length !== stationGraph.stations.length
  ) throw new Error("SiguaWiki gunner-sight record differs from the Station Graph");
  const projectionIds = new Set<string>();
  for (const projection of record.projections) {
    if (
      projectionIds.has(projection.id) ||
      !/^gunner-sight-projection-[a-f0-9]{24}$/u.test(projection.id) ||
      !/^\/assets\/vehicle-gunner-sights\/reticle-[a-f0-9]{64}\.webp$/u.test(
        projection.assetUrl,
      ) ||
      !/^[a-f0-9]{64}$/u.test(projection.sha256) ||
      projection.pixelAbsoluteError !== 0
    ) throw new Error(`SiguaWiki gunner-sight projection ${projection.id} is invalid`);
    projectionIds.add(projection.id);
  }
  if (!sameValues([...projectionIds].sort(), [...record.projectionRefs].sort())) {
    throw new Error("SiguaWiki gunner-sight projection closure differs");
  }
  const stationById = new Map(
    record.stations.map((station) => [station.stationId, station]),
  );
  if (stationById.size !== record.stations.length) {
    throw new Error("SiguaWiki gunner-sight stations repeat");
  }
  for (const graphStation of stationGraph.stations) {
    const sight = stationById.get(graphStation.id);
    if (!sight) throw new Error(`SiguaWiki gunner sight is missing for ${graphStation.id}`);
    validateStation(sight, graphStation, projectionIds);
  }
  if (/[A-Z]:\\|AppData|\/Temp\//iu.test(JSON.stringify(record))) {
    throw new Error("SiguaWiki gunner-sight record leaks a local path");
  }
  return {
    schemaVersion: record.schemaVersion,
    sourceVehicleRef: record.sourceVehicleRef,
    sourceDataRevision: record.sourceDataRevision,
    stations: record.stations,
    projections: record.projections,
  };
}
