"use client";

import { useEffect, useMemo } from "react";

import { wikiUrl } from "../lib/wiki-source";
import { gunnerSightLayerPlacement } from "../lib/gunner-sight-layout";
import { compileGunnerSightRenderLayers } from "../lib/gunner-sight-presentation";
import type {
  GunnerSightLayer,
  GunnerSightProjection,
  GunnerSightStage,
  GunnerSightStation,
  GunnerSightTextLayer,
  GunnerSightWeaponMode,
} from "../lib/vehicle-gunner-sight";

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
}: {
  layer: GunnerSightLayer | null;
  projection: GunnerSightProjection;
}) {
  const placement = layer ? gunnerSightLayerPlacement(layer) : null;
  const source = wikiUrl(projection.assetUrl);
  const role = layer?.role ?? "reticle";
  if (!placement) {
    return (
      <img
        className={`gunner-sight-overlay__fallback gunner-sight-overlay__${role === "reticle" ? "reticle" : "screen"}`}
        data-layout-role={role}
        data-layout-state="fallback-no-source-layout"
        data-widget-name={layer?.widgetName}
        src={source}
        alt=""
        draggable={false}
      />
    );
  }
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
      <image
        className={`gunner-sight-overlay__${role === "reticle" ? "reticle" : "screen"}`}
        data-layout-role={role}
        href={source}
        width={placement.width}
        height={placement.height}
        transform={placement.transform}
        preserveAspectRatio="none"
      />
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

function GunnerSightSolidLayer({ layer }: { layer: GunnerSightLayer }) {
  const placement = gunnerSightLayerPlacement(layer);
  if (!placement) return null;
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
      <rect
        width={placement.width}
        height={placement.height}
        transform={placement.transform}
        fill={linearColorCss(layer.colorAndOpacity, layer.renderOpacity ?? 1)}
      />
    </svg>
  );
}

function textAnchor(justification: GunnerSightTextLayer["justification"]) {
  if (justification === "Center") return "middle";
  if (justification === "Right") return "end";
  return "start";
}

function GunnerSightTextLayerVisual({ layer }: { layer: GunnerSightTextLayer }) {
  const placement = gunnerSightLayerPlacement(layer);
  const fontSize = layer.font.size;
  if (!placement || !Number.isFinite(fontSize) || !fontSize) return null;
  const anchor = textAnchor(layer.justification);
  const x = anchor === "middle" ? placement.width / 2 : anchor === "end" ? placement.width : 0;
  const lines = layer.text.split(/\r?\n/u);
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
        <text
          x={x}
          y={firstY}
          textAnchor={anchor}
          dominantBaseline="middle"
          fill={linearColorCss(layer.colorAndOpacity, layer.renderOpacity ?? 1)}
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
  onEquipmentChange,
  onZoomStageChange,
}: {
  station: GunnerSightStation;
  projections: GunnerSightProjection[];
  stationLabel: string;
  magnificationLevels: number[];
  zoomHorizontalFovDegrees: Array<number | null>;
  activeZoomIndex: number;
  activeEquipmentRef: string;
  onEquipmentChange: (equipmentRef: string) => void;
  onZoomStageChange: (zoomIndex: number) => void;
}) {
  const projectionById = useMemo(
    () => new Map(projections.map((projection) => [projection.id, projection])),
    [projections],
  );
  const modes = station.weaponModes.filter((mode) =>
    mode.zoomStages.some((stage) => stageProjection(stage, projectionById))
  );
  const defaultEquipmentRef = modes[0]?.equipmentRef ?? "";
  const activeMode: GunnerSightWeaponMode | null =
    modes.find((mode) => mode.equipmentRef === activeEquipmentRef) ??
    modes[0] ?? null;
  const stages = activeMode?.zoomStages.length
    ? activeMode.zoomStages
    : station.defaultZoomStages;
  const activeStage = stages.find(
    (stage) => stage.zoomIndex === activeZoomIndex,
  ) ?? stages[0];
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
  const renderLayers = useMemo(
    () => compileGunnerSightRenderLayers(station, activeStage, projections),
    [activeStage, projections, station],
  );
  const activeProjectionRendered = reticleProjection
    ? renderLayers.some((layer) =>
        layer.kind === "image" && layer.projection.id === reticleProjection.id
      )
    : true;

  useEffect(() => {
    if (
      defaultEquipmentRef &&
      !modes.some((mode) => mode.equipmentRef === activeEquipmentRef)
    ) {
      onEquipmentChange(defaultEquipmentRef);
    }
  }, [activeEquipmentRef, defaultEquipmentRef, modes, onEquipmentChange]);

  return (
    <section
      className="gunner-sight-overlay"
      data-station-id={station.stationId}
      data-weapon-mode={activeMode?.weaponClassPath ?? "default"}
      data-zoom-index={activeStage?.zoomIndex ?? 0}
      data-instrument-layer-count={station.textLayers?.length ?? 0}
      data-zoom-fov-authority="standard-16:9-90-horizontal-baseline"
      aria-label={`${stationLabel} 炮镜视野`}
      title="静态炮镜与视口遮罩；不表示光学损坏、失明或命中机制。"
    >
      <div className="gunner-sight-overlay__layers" aria-hidden="true">
        {renderLayers.map((renderLayer) => {
          if (renderLayer.kind === "image") {
            return (
              <GunnerSightLayerImage
                layer={renderLayer.layer}
                projection={renderLayer.projection}
                key={`image:${renderLayer.widgetName}:${renderLayer.projection.id}`}
              />
            );
          }
          if (renderLayer.kind === "solid") {
            return (
              <GunnerSightSolidLayer
                layer={renderLayer.layer}
                key={`solid:${renderLayer.widgetName}`}
              />
            );
          }
          return (
            <GunnerSightTextLayerVisual
              layer={renderLayer.layer}
              key={`text:${renderLayer.widgetName}:${renderLayer.layer.paintOrder}`}
            />
          );
        })}
        {reticleProjection && !activeProjectionRendered ? (
          <GunnerSightLayerImage
            layer={reticleLayoutLayer}
            projection={reticleProjection}
          />
        ) : null}
      </div>
      <div className="gunner-sight-overlay__controls">
        <span className="gunner-sight-overlay__identity">
          <b>{stationLabel}</b>
        </span>
        {modes.length > 1 ? (
          <label>
            <span>武器分划</span>
            <select
              value={activeMode?.equipmentRef ?? ""}
              onChange={(event) => {
                const nextEquipmentRef = event.currentTarget.value;
                onEquipmentChange(nextEquipmentRef);
                const nextMode = modes.find(
                  (mode) => mode.equipmentRef === nextEquipmentRef,
                );
                const nextStage = nextMode?.zoomStages[0] ??
                  station.defaultZoomStages[0];
                if (nextStage) onZoomStageChange(nextStage.zoomIndex);
              }}
              aria-label="切换当前站位武器分划"
            >
              {modes.map((mode) => (
                <option value={mode.equipmentRef} key={mode.equipmentRef}>
                  {mode.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="gunner-sight-overlay__weapon">
            {activeMode?.displayName ?? "固定炮镜分划"}
          </span>
        )}
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
