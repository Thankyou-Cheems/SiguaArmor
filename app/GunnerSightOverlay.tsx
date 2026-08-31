"use client";

import { useEffect, useMemo } from "react";

import { wikiUrl } from "../lib/wiki-source";
import { gunnerSightLayerPlacement } from "../lib/gunner-sight-layout";
import type {
  GunnerSightLayer,
  GunnerSightProjection,
  GunnerSightStage,
  GunnerSightStation,
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
  role,
}: {
  layer: GunnerSightLayer | null;
  projection: GunnerSightProjection;
  role: "viewport-screen" | "reticle";
}) {
  const placement = layer ? gunnerSightLayerPlacement(layer) : null;
  const source = wikiUrl(projection.assetUrl);
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
  const screenLayers = station.layers
    .filter((layer) =>
      layer.role === "viewport-screen" &&
      layer.visibility !== "Collapsed" &&
      layer.projectionRef !== null
    )
    .flatMap((layer) => {
      const projection = projectionById.get(layer.projectionRef!);
      return projection ? [{ layer, projection }] : [];
    });

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
      data-zoom-fov-authority="standard-16:9-90-horizontal-baseline"
      aria-label={`${stationLabel} 炮镜视野`}
      title="静态炮镜与视口遮罩；不表示光学损坏、失明或命中机制。"
    >
      <div className="gunner-sight-overlay__layers" aria-hidden="true">
        {screenLayers.map(({ layer, projection }) => (
          <GunnerSightLayerImage
            layer={layer}
            projection={projection}
            role="viewport-screen"
            key={`${layer.widgetName}:${projection.id}`}
          />
        ))}
        {reticleProjection ? (
          <GunnerSightLayerImage
            layer={reticleLayoutLayer}
            projection={reticleProjection}
            role="reticle"
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
