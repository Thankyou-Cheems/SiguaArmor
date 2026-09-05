"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { wikiUrl } from "../lib/wiki-source";
import {
  gunnerSightLayerFallbackKind,
  gunnerSightLayerPlacement,
} from "../lib/gunner-sight-layout";
import {
  gunnerSightMaskPolygon,
  loadGunnerSightMaskFrame,
} from "../lib/gunner-sight-mask";
import {
  compileGunnerSightRenderLayers,
  gunnerSightProjectionIsVisible,
} from "../lib/gunner-sight-presentation";
import {
  gunnerSightDynamicPresentationSettled,
  interpolateGunnerSightDynamicPresentation,
  resolveGunnerSightDynamicBinding,
  resolveGunnerSightDynamicBindingGroup,
  type GunnerSightDynamicPresentation,
  type GunnerSightRuntimeState,
} from "../lib/gunner-sight-runtime-state";
import type {
  RuntimeTurretPoseSnapshot,
  RuntimeTurretPoseStore,
} from "../lib/runtime-turret-pose-store";
import {
  createVehicleWeaponOperation,
  presentVehicleWeaponOperation,
  type VehicleWeaponOperationSpec,
} from "../lib/vehicle-weapon-operation-state";
import type {
  RuntimeVehicleWeaponOperationStore,
} from "../lib/runtime-vehicle-weapon-operation-store";
import type {
  GunnerSightDynamicBinding,
  GunnerSightLayer,
  GunnerSightProjection,
  GunnerSightStage,
  GunnerSightStation,
  GunnerSightTextLayer,
  GunnerSightWeaponMode,
} from "../lib/vehicle-gunner-sight";

export interface GunnerSightStationPoseBinding {
  stationId: string;
  seatPawnClassPath: string;
  parentStationId: string | null;
  role: string;
}

export interface GunnerSightOperationState {
  rangeMeters: number | null;
  roundsRemaining: number | null;
  magazineCapacity: number | null;
  magazinesRemaining: number | null;
  reloadProgress: number;
  weaponReady: boolean;
  weaponReloading: boolean;
  stabilized: boolean;
  guidanceActive: boolean;
  currentWeaponLabel: string;
  currentFireModeSourceValue: number | null;
  currentWeaponClassPath: string;
  commanderOverride: boolean;
  weaponOverheated: boolean;
}

export interface GunnerSightWeaponOperationRuntime {
  store: RuntimeVehicleWeaponOperationStore;
  equipmentRef: string;
  spec: VehicleWeaponOperationSpec | null;
  guidanceActiveUntilMs: number;
  infiniteAmmoEnabled?: boolean;
}

function operationClockMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function useLiveGunnerSightOperationState(
  baseState: GunnerSightOperationState,
  weaponOperation: GunnerSightWeaponOperationRuntime,
) {
  const operationSnapshot = useSyncExternalStore(
    weaponOperation.store.subscribe,
    weaponOperation.store.getSnapshot,
    weaponOperation.store.getSnapshot,
  );
  const operationState = useMemo(
    () => weaponOperation.spec && weaponOperation.equipmentRef
      ? operationSnapshot.states.get(weaponOperation.equipmentRef) ??
        createVehicleWeaponOperation(weaponOperation.spec, 0, weaponOperation.infiniteAmmoEnabled)
      : null,
    [
      operationSnapshot,
      weaponOperation.equipmentRef,
      weaponOperation.spec,
      weaponOperation.infiniteAmmoEnabled,
    ],
  );
  const [clockMs, setClockMs] = useState(operationClockMs);
  const operationEndsAtMs = Math.max(
    operationState?.nextShotAtMs ?? 0,
    operationState?.reloadEndsAtMs ?? 0,
    weaponOperation.guidanceActiveUntilMs,
  );

  useEffect(() => {
    setClockMs(operationClockMs());
  }, [
    weaponOperation.guidanceActiveUntilMs,
    weaponOperation.equipmentRef,
    weaponOperation.spec,
    operationState,
  ]);
  useEffect(() => {
    if (operationClockMs() >= operationEndsAtMs) return;
    const timer = window.setInterval(() => {
      const nextClockMs = operationClockMs();
      setClockMs(nextClockMs);
      if (nextClockMs >= operationEndsAtMs) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [operationEndsAtMs]);

  const presentation = useMemo(
    () => operationState && weaponOperation.spec
      ? presentVehicleWeaponOperation(
          operationState,
          weaponOperation.spec,
          clockMs,
        )
      : null,
    [clockMs, operationState, weaponOperation.spec],
  );
  return useMemo<GunnerSightOperationState>(() => presentation
    ? {
        ...baseState,
        roundsRemaining: presentation.roundsRemaining,
        magazineCapacity: presentation.magazineCapacity,
        magazinesRemaining: presentation.magazinesRemaining,
        reloadProgress: presentation.reloadProgress,
        weaponReady: presentation.weaponReady,
        weaponReloading: presentation.weaponReloading,
        guidanceActive: weaponOperation.guidanceActiveUntilMs > clockMs,
      }
    : {
        ...baseState,
        guidanceActive: weaponOperation.guidanceActiveUntilMs > clockMs,
      }, [
    baseState,
    clockMs,
    presentation,
    weaponOperation.guidanceActiveUntilMs,
  ]);
}

function classNameFromPath(value: string) {
  return value.split(".").at(-1) ?? value.split("/").at(-1) ?? value;
}

function stationWorldYaw(
  stationId: string,
  poseSnapshot: RuntimeTurretPoseSnapshot,
  stationById: ReadonlyMap<string, GunnerSightStationPoseBinding>,
  visited = new Set<string>(),
): number {
  if (visited.has(stationId)) return poseSnapshot[stationId]?.yawDegrees ?? 0;
  visited.add(stationId);
  const station = stationById.get(stationId);
  const localYaw = poseSnapshot[stationId]?.yawDegrees ?? 0;
  return station?.parentStationId
    ? localYaw + stationWorldYaw(
        station.parentStationId,
        poseSnapshot,
        stationById,
        visited,
      )
    : localYaw;
}

function layerBindingNames(layer: GunnerSightLayer | GunnerSightTextLayer) {
  return [
    ...(layer.layout?.steps.flatMap(({ widgetName, parentWidgetName }) =>
      [widgetName, parentWidgetName].filter((value): value is string => Boolean(value))
    ) ?? []),
    layer.widgetName,
  ];
}

function dynamicBindingsForLayer(
  station: GunnerSightStation,
  layer: GunnerSightLayer | GunnerSightTextLayer,
) {
  const names = layerBindingNames(layer);
  const order = new Map(names.map((name, index) => [name, index]));
  return station.dynamicBindings
    .filter((binding) =>
      binding.semantic !== "excluded-damage-state-indicator" &&
      order.has(binding.targetWidgetName)
    )
    .sort((left, right) =>
      (order.get(left.targetWidgetName) ?? 0) -
      (order.get(right.targetWidgetName) ?? 0)
    );
}

function resolveLayerDynamicPresentation(
  station: GunnerSightStation,
  layer: GunnerSightLayer | GunnerSightTextLayer,
  bindingPresentations: ReadonlyMap<string, GunnerSightDynamicPresentation>,
) {
  const resolved: GunnerSightDynamicPresentation = {
    visible:
      !["Collapsed", "Hidden"].includes(layer.visibility ?? "Visible") &&
      layer.renderOpacity !== 0,
  };
  for (const binding of dynamicBindingsForLayer(station, layer)) {
    const value = bindingPresentations.get(binding.id);
    if (value) Object.assign(resolved, value);
  }
  return resolved;
}

function useInterpolatedDynamicPresentations(
  station: GunnerSightStation,
  state: GunnerSightRuntimeState,
) {
  const targets = useMemo(() => {
    const targetMap = new Map<string, GunnerSightDynamicPresentation>();
    const selectionGroups = new Map<string, GunnerSightDynamicBinding[]>();
    for (const binding of station.dynamicBindings) {
      if (binding.semantic === "excluded-damage-state-indicator") continue;
      if (binding.semantic !== "current-weapon-selection-indicator") {
        const presentation = resolveGunnerSightDynamicBinding(binding, state);
        if (presentation) targetMap.set(binding.id, presentation);
        continue;
      }
      const key = [
        binding.targetWidgetName,
        binding.property,
        binding.semantic,
      ].join("|");
      const group = selectionGroups.get(key) ?? [];
      group.push(binding);
      selectionGroups.set(key, group);
    }
    for (const group of selectionGroups.values()) {
      const presentation = resolveGunnerSightDynamicBindingGroup(group, state);
      if (!presentation) continue;
      for (const binding of group) targetMap.set(binding.id, presentation);
    }
    return targetMap;
  }, [state, station.dynamicBindings]);
  const targetRef = useRef(targets);
  const interpolatedRef = useRef(new Map<string, GunnerSightDynamicPresentation>());
  const [interpolatedSnapshot, setInterpolatedSnapshot] = useState<{
    stationId: string;
    values: Map<string, GunnerSightDynamicPresentation>;
  }>(() => ({ stationId: station.stationId, values: new Map() }));

  useEffect(() => {
    targetRef.current = targets;
  }, [targets]);

  useEffect(() => {
    interpolatedRef.current.clear();
    let previousMs = performance.now();
    let frame = 0;
    const update = (nowMs: number) => {
      const elapsedSeconds = Math.min(0.05, Math.max(0, (nowMs - previousMs) / 1_000));
      previousMs = nowMs;
      let changed = false;
      for (const binding of station.dynamicBindings) {
        const speed = binding.valueModel?.interpolationSpeedPerSecond;
        if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
          continue;
        }
        const target = targetRef.current.get(binding.id);
        if (!target) {
          if (interpolatedRef.current.delete(binding.id)) changed = true;
          continue;
        }
        const current = interpolatedRef.current.get(binding.id);
        if (!current) {
          interpolatedRef.current.set(binding.id, target);
          continue;
        }
        const next = interpolateGunnerSightDynamicPresentation(
          current,
          target,
          speed,
          elapsedSeconds,
        );
        if (!gunnerSightDynamicPresentationSettled(current, next)) {
          interpolatedRef.current.set(binding.id, next);
          changed = true;
        }
      }
      if (changed) {
        setInterpolatedSnapshot({
          stationId: station.stationId,
          values: new Map(interpolatedRef.current),
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [station.dynamicBindings, station.stationId]);

  const rendered = new Map(targets);
  for (const binding of station.dynamicBindings) {
    const speed = binding.valueModel?.interpolationSpeedPerSecond;
    const interpolated = interpolatedSnapshot.stationId === station.stationId
      ? interpolatedSnapshot.values.get(binding.id)
      : undefined;
    if (
      typeof speed === "number" && speed > 0 && interpolated
    ) rendered.set(binding.id, interpolated);
  }
  return rendered;
}

function dynamicRotationTransform(
  layer: GunnerSightLayer | GunnerSightTextLayer,
  width: number,
  height: number,
  dynamic: GunnerSightDynamicPresentation,
) {
  if (!Number.isFinite(dynamic.angleDegrees)) return null;
  const baseAngle = layer.renderTransform?.Angle ?? 0;
  const pivot = layer.renderTransformPivot ?? { X: 0.5, Y: 0.5 };
  return `rotate(${dynamic.angleDegrees! - baseAngle} ${width * pivot.X} ${height * pivot.Y})`;
}

function dynamicFilterId(...parts: string[]) {
  return `gunner-sight-${parts.join("-").replace(/[^a-z0-9_-]+/giu, "-")}`;
}

function stageProjection(
  stage: GunnerSightStage | undefined,
  projections: Map<string, GunnerSightProjection>,
) {
  return stage?.projectionRef ? projections.get(stage.projectionRef) ?? null : null;
}

function stageLabel(stage: GunnerSightStage, magnificationLevels: number[]) {
  const magnification = magnificationLevels[stage.zoomIndex];
  return Number.isFinite(magnification)
    ? `${magnification}×`
    : `倍率 ${stage.zoomIndex + 1}`;
}

function GunnerSightLayerImage({
  layer,
  projection,
  dynamic,
}: {
  layer: GunnerSightLayer | null;
  projection: GunnerSightProjection;
  dynamic: GunnerSightDynamicPresentation;
}) {
  const placement = layer ? gunnerSightLayerPlacement(layer) : null;
  const source = wikiUrl(projection.assetUrl);
  const role = layer?.role ?? "reticle";
  if (dynamic.visible === false) return null;
  if (!placement) {
    const fallbackKind = gunnerSightLayerFallbackKind(layer);
    if (!fallbackKind) return null;
    return (
      <img
        className={`gunner-sight-overlay__fallback gunner-sight-overlay__${fallbackKind}`}
        data-layout-role={role}
        data-layout-state="fallback-no-source-layout"
        data-widget-name={layer?.widgetName}
        src={source}
        alt=""
        draggable={false}
        style={{ opacity: dynamic.opacity }}
      />
    );
  }
  const rotationTransform = layer
    ? dynamicRotationTransform(
        layer,
        placement.width,
        placement.height,
        dynamic,
      )
    : null;
  const filterId = dynamic.color && layer
    ? dynamicFilterId(layer.widgetName, projection.id)
    : null;
  return (
    <svg
      className="gunner-sight-overlay__layout"
      data-layout-role={role}
      data-layout-state={layer?.layout?.state}
      data-widget-name={layer?.widgetName}
      viewBox={placement.viewBox.join(" ")}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {filterId && dynamic.color ? (
        <defs>
          <filter id={filterId} colorInterpolationFilters="linearRGB">
            <feComponentTransfer>
              <feFuncR type="linear" slope={dynamic.color.R} />
              <feFuncG type="linear" slope={dynamic.color.G} />
              <feFuncB type="linear" slope={dynamic.color.B} />
              <feFuncA type="linear" slope={dynamic.color.A} />
            </feComponentTransfer>
          </filter>
        </defs>
      ) : null}
      <g transform={placement.transform}>
        <g transform={rotationTransform ?? undefined}>
          <image
            className={`gunner-sight-overlay__${role === "reticle" ? "reticle" : "screen"}`}
            data-layout-role={role}
            href={source}
            width={placement.width}
            height={placement.height}
            preserveAspectRatio="none"
            filter={filterId ? `url(#${filterId})` : undefined}
            opacity={dynamic.opacity}
          />
        </g>
      </g>
    </svg>
  );
}

function linearChannelToSrgbByte(value: number) {
  const linear = Math.min(1, Math.max(0, value));
  const srgb = linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function linearColorCss(
  color: { R: number; G: number; B: number; A: number } | null | undefined,
  opacity = 1,
) {
  if (!color) return `rgba(255, 255, 255, ${opacity})`;
  return `rgba(${linearChannelToSrgbByte(color.R)}, ${linearChannelToSrgbByte(color.G)}, ${linearChannelToSrgbByte(color.B)}, ${Math.min(1, Math.max(0, color.A * opacity))})`;
}

function GunnerSightSolidLayer({
  layer,
  dynamic,
}: {
  layer: GunnerSightLayer;
  dynamic: GunnerSightDynamicPresentation;
}) {
  const placement = gunnerSightLayerPlacement(layer);
  if (!placement || dynamic.visible === false) return null;
  const rotationTransform = dynamicRotationTransform(
    layer,
    placement.width,
    placement.height,
    dynamic,
  );
  return (
    <svg
      className="gunner-sight-overlay__layout"
      data-layout-role="auxiliary-static"
      data-layer-kind="observed-solid-brush"
      data-layout-state={layer.layout?.state}
      data-widget-name={layer.widgetName}
      viewBox={placement.viewBox.join(" ")}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g transform={placement.transform}>
        <g transform={rotationTransform ?? undefined}>
          <rect
            width={placement.width}
            height={placement.height}
            fill={linearColorCss(
              dynamic.color ?? layer.colorAndOpacity,
              dynamic.opacity ?? layer.renderOpacity ?? 1,
            )}
          />
        </g>
      </g>
    </svg>
  );
}

function textAnchor(justification: GunnerSightTextLayer["justification"]) {
  if (justification === "Center") return "middle";
  if (justification === "Right") return "end";
  return "start";
}

function GunnerSightTextLayerVisual({
  layer,
  dynamic,
}: {
  layer: GunnerSightTextLayer;
  dynamic: GunnerSightDynamicPresentation;
}) {
  const placement = gunnerSightLayerPlacement(layer);
  const fontSize = layer.font.size;
  if (
    !placement ||
    !Number.isFinite(fontSize) ||
    !fontSize ||
    dynamic.visible === false
  ) return null;
  const anchor = textAnchor(layer.justification);
  const x = anchor === "middle" ? placement.width / 2 : anchor === "end" ? placement.width : 0;
  const lines = (dynamic.text ?? layer.text).split(/\r?\n/u);
  const lineHeight = fontSize * 1.08;
  const firstY = placement.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const outlineSize = layer.font.outline?.OutlineSize ?? 0;
  const mono = /Mono|Digital/iu.test(
    `${layer.font.objectRef ?? ""} ${layer.font.materialRef ?? ""}`,
  );
  const shadow = layer.shadowColorAndOpacity && layer.shadowColorAndOpacity.A > 0
    ? `drop-shadow(${layer.shadowOffset?.X ?? 1}px ${layer.shadowOffset?.Y ?? 1}px 0 ${linearColorCss(layer.shadowColorAndOpacity)})`
    : undefined;
  return (
    <svg
      className="gunner-sight-overlay__layout"
      data-layout-role="instrument-text"
      data-layer-kind="instrument-text"
      data-layout-state={layer.layout?.state}
      data-widget-name={layer.widgetName}
      viewBox={placement.viewBox.join(" ")}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g transform={placement.transform}>
        <g transform={dynamicRotationTransform(
          layer,
          placement.width,
          placement.height,
          dynamic,
        ) ?? undefined}>
        <text
          x={x}
          y={firstY}
          textAnchor={anchor}
          dominantBaseline="middle"
          fill={linearColorCss(
            dynamic.color ?? layer.colorAndOpacity,
            dynamic.opacity ?? layer.renderOpacity ?? 1,
          )}
          stroke={outlineSize > 0
            ? linearColorCss(layer.font.outline?.OutlineColor)
            : "none"}
          strokeWidth={outlineSize}
          style={{
            fontFamily: mono
              ? "ui-monospace, Consolas, monospace"
              : "Arial, sans-serif",
            fontSize,
            fontWeight: 600,
            letterSpacing: `${(layer.font.letterSpacing ?? 0) / 1000}em`,
            paintOrder: "stroke fill",
            filter: shadow,
          }}
        >
          {lines.map((line, index) => (
            <tspan x={x} dy={index === 0 ? 0 : lineHeight} key={`${index}:${line}`}>
              {line}
            </tspan>
          ))}
        </text>
        </g>
      </g>
    </svg>
  );
}

export function GunnerSightOverlay({
  station,
  projections,
  stationLabel,
  magnificationLevels,
  zoomHorizontalFovDegrees,
  activeZoomIndex,
  activeEquipmentRef,
  activeStationId,
  poseStore,
  stationPoseBindings,
  operationState,
  weaponOperation,
  onZoomStageChange,
}: {
  station: GunnerSightStation;
  projections: GunnerSightProjection[];
  stationLabel: string;
  magnificationLevels: number[];
  zoomHorizontalFovDegrees: Array<number | null>;
  activeZoomIndex: number;
  activeEquipmentRef: string;
  activeStationId: string;
  poseStore: RuntimeTurretPoseStore;
  stationPoseBindings: GunnerSightStationPoseBinding[];
  operationState: GunnerSightOperationState;
  weaponOperation: GunnerSightWeaponOperationRuntime;
  onZoomStageChange: (zoomIndex: number) => void;
}) {
  const poseSnapshot = useSyncExternalStore(
    poseStore.subscribe,
    poseStore.getSnapshot,
    poseStore.getSnapshot,
  );
  const liveOperationState = useLiveGunnerSightOperationState(
    operationState,
    weaponOperation,
  );
  const dynamicRuntimeState = useMemo<GunnerSightRuntimeState>(() => {
    const stationById = new Map(
      stationPoseBindings.map((binding) => [binding.stationId, binding]),
    );
    const relatedStationRelativeYawDegrees = new Map<string, number>();
    for (const binding of stationPoseBindings) {
      const yawDegrees = stationWorldYaw(
        binding.stationId,
        poseSnapshot,
        stationById,
      );
      relatedStationRelativeYawDegrees.set(binding.seatPawnClassPath, yawDegrees);
      relatedStationRelativeYawDegrees.set(
        classNameFromPath(binding.seatPawnClassPath),
        yawDegrees,
      );
      if (!relatedStationRelativeYawDegrees.has(`role:${binding.role}`)) {
        relatedStationRelativeYawDegrees.set(`role:${binding.role}`, yawDegrees);
      }
    }
    const activePose = poseSnapshot[activeStationId] ?? {
      yawDegrees: 0,
      pitchDegrees: 0,
    };
    return {
      ...liveOperationState,
      stationRelativeYawDegrees: stationWorldYaw(
        activeStationId,
        poseSnapshot,
        stationById,
      ),
      stationPitchDegrees: activePose.pitchDegrees,
      relatedStationRelativeYawDegrees,
      currentSeatPawnClassPath: station.seatPawnClassPath,
      activeZoomIndex,
    };
  }, [
    activeStationId,
    activeZoomIndex,
    liveOperationState,
    poseSnapshot,
    station.seatPawnClassPath,
    stationPoseBindings,
  ]);
  const dynamicBindingPresentations = useInterpolatedDynamicPresentations(
    station,
    dynamicRuntimeState,
  );
  const {
    projectionById,
    activeMode,
    stages,
    activeStage,
    renderLayers,
  } = useMemo(() => {
    const nextProjectionById = new Map(
      projections.map((projection) => [projection.id, projection]),
    );
    const nextModes = station.weaponModes.filter((mode) =>
      mode.zoomStages.some((stage) =>
        stageProjection(stage, nextProjectionById)
      )
    );
    const nextActiveMode: GunnerSightWeaponMode | null =
      nextModes.find((mode) => mode.equipmentRef === activeEquipmentRef) ??
      (activeEquipmentRef ? null : nextModes[0] ?? null);
    const nextStages = nextActiveMode?.zoomStages.length
      ? nextActiveMode.zoomStages
      : station.defaultZoomStages;
    const nextActiveStage = nextStages.find(
      (stage) => stage.zoomIndex === activeZoomIndex,
    ) ?? nextStages[0];
    return {
      projectionById: nextProjectionById,
      modes: nextModes,
      activeMode: nextActiveMode,
      stages: nextStages,
      activeStage: nextActiveStage,
      renderLayers: compileGunnerSightRenderLayers(
        station,
        nextActiveStage,
        projections,
      ),
    };
  }, [activeEquipmentRef, activeZoomIndex, projections, station]);
  const frameMaskId = dynamicFilterId("viewport-frame", useId());
  const frameCandidates = useMemo(() => renderLayers.flatMap((renderLayer) => {
    if (renderLayer.kind !== "image" || renderLayer.layer.role !== "viewport-screen") {
      return [];
    }
    const placement = gunnerSightLayerPlacement(renderLayer.layer);
    return placement ? [{
      layer: renderLayer.layer,
      placement,
      source: wikiUrl(renderLayer.projection.assetUrl),
    }] : [];
  }), [renderLayers]);
  const [closedFrameSources, setClosedFrameSources] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    let cancelled = false;
    void Promise.all(frameCandidates.map(async ({ source }) =>
      [source, await loadGunnerSightMaskFrame(source)] as const
    )).then((classifications) => {
      if (!cancelled) setClosedFrameSources(new Set(
        classifications.filter(([, closed]) => closed).map(([source]) => source),
      ));
    });
    return () => { cancelled = true; };
  }, [frameCandidates]);
  const reticleProjection = stageProjection(activeStage, projectionById) ??
    station.layers
      .filter((layer) => layer.role === "reticle" && layer.visibility !== "Collapsed")
      .map((layer) => layer.projectionRef && projectionById.get(layer.projectionRef))
      .find(Boolean) ?? null;
  const reticleLayoutLayer = station.layers.find((layer) =>
    layer.widgetName === "MainReticle" &&
      gunnerSightLayerPlacement(layer)
  ) ?? station.layers.find((layer) =>
    layer.resourceRef === activeStage?.sourceObjectPath &&
      gunnerSightLayerPlacement(layer)
  ) ?? station.layers.find((layer) =>
    layer.role === "reticle" && gunnerSightLayerPlacement(layer)
  ) ?? null;
  const renderLayerPresentations = new Map(
    renderLayers.map((renderLayer) => [
      renderLayer.widgetName,
      resolveLayerDynamicPresentation(
        station,
        renderLayer.layer,
        dynamicBindingPresentations,
      ),
    ]),
  );
  const activeProjectionRendered = reticleProjection
    ? gunnerSightProjectionIsVisible(
        renderLayers,
        reticleProjection.id,
        new Map(
          [...renderLayerPresentations].map(([widgetName, presentation]) => [
            widgetName,
            presentation.visible !== false,
          ]),
        ),
      )
    : true;
  const framePolygons = frameCandidates.flatMap(({ layer, placement, source }) => {
    const dynamic = renderLayerPresentations.get(layer.widgetName);
    if (!closedFrameSources.has(source) || dynamic?.visible === false ||
      dynamic?.opacity === 0 || dynamic?.color?.A === 0) return [];
    const angle = Number.isFinite(dynamic?.angleDegrees)
      ? dynamic!.angleDegrees! - (layer.renderTransform?.Angle ?? 0)
      : 0;
    return [gunnerSightMaskPolygon(
      placement, angle, layer.renderTransformPivot ?? undefined,
    )];
  });

  return (
    <section
      className="gunner-sight-overlay"
      data-station-id={station.stationId}
      data-weapon-mode={activeMode?.weaponClassPath ?? "default"}
      data-zoom-index={activeStage?.zoomIndex ?? 0}
      data-instrument-layer-count={station.textLayers?.length ?? 0}
      data-dynamic-binding-count={station.dynamicBindings.length}
      data-dynamic-range-meters={dynamicRuntimeState.rangeMeters ?? undefined}
      data-dynamic-rounds-remaining={
        dynamicRuntimeState.roundsRemaining ?? undefined
      }
      data-dynamic-reloading={dynamicRuntimeState.weaponReloading || undefined}
      data-dynamic-yaw-degrees={
        dynamicRuntimeState.stationRelativeYawDegrees
      }
      data-dynamic-pitch-degrees={dynamicRuntimeState.stationPitchDegrees}
      data-zoom-fov-authority="standard-16:9-90-horizontal-baseline"
      aria-label={`${stationLabel} 炮镜视野`}
      title="静态炮镜与视口遮罩；不表示光学损坏、失明或命中机制。"
    >
      <div className="gunner-sight-overlay__layers" aria-hidden="true">
        {framePolygons.length ? (
          <svg className="gunner-sight-overlay__layout gunner-sight-overlay__frame-backdrop"
            viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <mask id={frameMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
                <rect width="1920" height="1080" fill="white" />
                {/* Union of visible source footprints: a second small frame must
                    not crop another frame's aperture. Original art paints above. */}
                {framePolygons.map((polygon, index) => (
                  <polygon key={index} points={polygon.map((point) => point.join(",")).join(" ")} fill="black" />
                ))}
              </mask>
            </defs>
            <rect width="1920" height="1080" fill="black" mask={`url(#${frameMaskId})`} />
          </svg>
        ) : null}
        {renderLayers.map((renderLayer) => {
          const dynamic = renderLayerPresentations.get(
            renderLayer.widgetName,
          ) ?? { visible: true };
          if (renderLayer.kind === "image") {
            return (
              <GunnerSightLayerImage
                layer={renderLayer.layer}
                projection={renderLayer.projection}
                dynamic={dynamic}
                key={`image:${renderLayer.widgetName}:${renderLayer.projection.id}`}
              />
            );
          }
          if (renderLayer.kind === "solid") {
            return (
              <GunnerSightSolidLayer
                layer={renderLayer.layer}
                dynamic={dynamic}
                key={`solid:${renderLayer.widgetName}`}
              />
            );
          }
          return (
            <GunnerSightTextLayerVisual
              layer={renderLayer.layer}
              dynamic={dynamic}
              key={`text:${renderLayer.widgetName}:${renderLayer.layer.paintOrder}`}
            />
          );
        })}
        {reticleProjection && !activeProjectionRendered ? (
          <GunnerSightLayerImage
            layer={reticleLayoutLayer}
            projection={reticleProjection}
            dynamic={{ visible: true }}
          />
        ) : null}
      </div>
      <div className="gunner-sight-overlay__controls">
        <span className="gunner-sight-overlay__identity">
          <b>{stationLabel}</b>
        </span>
        {stages.length > 1 ? (
          <div className="gunner-sight-overlay__zoom" role="group" aria-label="切换炮镜倍率">
            {stages.map((stage) => (
              <button
                type="button"
                data-active={stage.zoomIndex === activeStage?.zoomIndex || undefined}
                aria-pressed={stage.zoomIndex === activeStage?.zoomIndex}
                disabled={
                  !stageProjection(stage, projectionById) ||
                  zoomHorizontalFovDegrees[stage.zoomIndex] === null ||
                  zoomHorizontalFovDegrees[stage.zoomIndex] === undefined
                }
                data-horizontal-fov-degrees={
                  zoomHorizontalFovDegrees[stage.zoomIndex] ?? undefined
                }
                onClick={() => onZoomStageChange(stage.zoomIndex)}
                key={`${stage.zoomIndex}:${stage.sourceObjectPath}`}
              >
                {stageLabel(stage, magnificationLevels)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
