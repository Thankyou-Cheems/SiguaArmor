"use client";

import { CircleAlert, CircleDot, Crosshair, RotateCcw } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import { acceleratedRaycast } from "three-mesh-bvh";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  ARMOR_THICKNESS_LEGEND_STOPS,
  ARMOR_THICKNESS_LEGEND_TICKS,
  RELATIVE_ARMOR_THICKNESS_STOPS,
} from "../lib/armor-thickness-ramp";
import {
  ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR,
  ANALYSIS_VISUAL_DEPTH_BIAS_UNITS,
  analysisVisualStableSurfaceReasons,
  isStableAnalysisVisualSurfacePlacement,
  type AnalysisVisualSurfaceEvidence,
} from "../lib/analysis-visual-surface-policy";
import { dedupeIdenticalVisualPlacements } from "../lib/runtime-visual-occurrence-dedupe";
import { createAnalysisProjectedMarkMaterial } from "../lib/runtime-projected-mark-material";
import { dedupeRuntimeSceneTextures } from "../lib/runtime-texture-dedupe";
import { resolveRuntimeRunningGearHitComponentPoses } from "../lib/runtime-running-gear-hit-pose";
import {
  createRuntimeSkeletalPoseController,
  runtimeSkeletalPoseEvidence,
  type RuntimeSkeletalPoseController,
} from "../lib/runtime-skeletal-pose";
import {
  carryNestedRuntimeTurretAssemblies,
  clampTurretPitch,
  clampTurretYaw,
  normalizeTurretYaw,
  resolveRuntimeTurretAssembly,
  resolveRuntimeTurretHitComponentAssembly,
  resolveRuntimeTurretMotionFrame,
  runtimeTurretFallbackSpec,
  turretArticulationMatrices,
  type RuntimeTurretAssembly,
} from "../lib/turret-articulation";
import {
  editorNativeEffectiveDamageAmount,
  isEditorNativeComponentOnlyDamageEvent,
  isEditorNativeVehicleDamageEvent,
  resolveEditorNativeBallistics,
  simulateEditorNativeShot,
  type EditorNativeBallistics,
  type EditorNativeDamageEvent,
  type EditorNativeIntersection,
  type EditorNativeModel,
  type EditorNativeShotResult,
} from "../lib/editor-native-hit-model";
import {
  buildVehicleRadialLayerHitSets,
  validateVehicleRadialQuerySource,
  type VehicleRadialQuerySource,
} from "../lib/vehicle-radial-query";
import { loadWikiVehicleRadialQuery } from "../lib/wiki-source";
import {
  runtimeAttackDistanceControl,
  runtimeAttackTargetDistanceLimitM,
} from "./runtime-attack-ballistics-model";
import {
  buildRadialDamageVisualizationPlan,
  radialDamageCoverageState,
  radialDamageGroundIntersectionRadiusM,
  radialDamageLegendPlacement,
  RADIAL_DAMAGE_VISUAL_TIMING_MS,
} from "../lib/radial-damage-visualization";
import { editorNativeTraceTerminalDistanceM } from "../lib/editor-native-penetration";
import {
  isRuntimeForcedRicochetLayer,
  runtimeShotPathLayerPresentation,
} from "../lib/runtime-shot-path-presentation";
import { editorDamageCardEffect } from "../lib/editor-damage-card-effects";
import { summarizeEditorDamageSettlements } from "../lib/editor-damage-settlement";
import {
  RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M,
  RUNTIME_GROUND_SCALE_TICK_INTERVAL_M,
  runtimeGroundScaleLengthM,
} from "../lib/runtime-ground-scale";
import { shotResultRendersDirectTrace } from "../lib/shot-visual-policy";
import {
  RUNTIME_VIEWER_CAMERA_VIEWS,
  RUNTIME_VIEWER_INFANTRY_DISTANCES_M,
  SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
  runtimeViewerCameraPose,
  runtimeViewerInfantryCameraPosition,
  verticalFovForHorizontalFov,
  type RuntimeViewerCameraViewId,
} from "../lib/runtime-viewer-camera-presets";
import {
  weaponPenetrationKindForDamageTypePath,
  type WeaponPenetrationKind,
} from "../lib/weapon-penetration-kind";
import { weaponNameZh } from "../lib/weapon-display-name";
import {
  vehicleDamageTypeIconColor,
  vehicleDamageTypeIconColorNumber,
  vehicleDamageTypeIconKindForPath,
  vehicleDamageTypeIconLabel,
  vehicleDamageTypeIconShortLabel,
  type VehicleDamageTypeIconKind,
} from "../lib/vehicle-damage-type-icons";
import { playerHitComponentLabel } from "../lib/runtime-component-labels";
import {
  componentOnlyDamageSurfaceInfo,
  noPenetrationSurfaceInfo,
  spacedArmorSurfaceInfo,
} from "../lib/hit-scene-render-batches";
import {
  clearHitSceneThreeModelDamageHighlight,
  createHitSceneThreeModel,
  setHitSceneThreeModelArmorThicknessScale,
  setHitSceneThreeModelComponentPoses,
  setHitSceneThreeModelDamageHighlight,
  setHitSceneThreeModelHoveredProfile,
  setHitSceneThreeModelMode,
  setHitSceneThreeModelSpecialArmorVisible,
  type HitSceneArmorThicknessRange,
  type HitSceneThreeModel,
} from "../lib/hit-scene-three-renderer";
import {
  loadRuntimeHitScene,
  observedValue,
  type ParsedRuntimeHitScene,
} from "../lib/runtime-hit-scene";
import {
  runtimeAnalysisVisualUrl,
  runtimeAnalysisVisualTexturePolicy,
  runtimeExteriorVisualAssetUrl,
  runtimeWikiAssetUrl,
  runtimeViewerPresentation,
} from "../lib/runtime-visual-lazy-load";
import {
  loadWikiVehicleWeaponRuntimeIndex,
  loadWikiWeaponCatalog,
  loadWikiVehicleWeaponRuntimeSource,
} from "../lib/wiki-source";
import { GunnerSightOverlay } from "./GunnerSightOverlay";
import {
  estimateWeaponHitDps,
  selectPrimaryWeaponHitDpsTarget,
  singleShotWeaponHitTarget,
  targetPoolsForShot,
  vehicleTargetBurningProfile,
  type WeaponHitDpsEstimate,
  type WeaponHitDpsTarget,
} from "../lib/weapon-hit-dps";
import {
  resolveWeaponDpsWeaponForRuntimeAssignment,
  weaponDpsWeaponsFromWikiDocument,
} from "../lib/weapon-dps-source";
import type {
  WeaponDpsSimulation,
  WeaponDpsWeapon,
} from "../lib/weapon-dps-model";
import type {
  RuntimeVehiclePreview,
  RuntimeVisualAttachmentStation,
  RuntimeVisualPlacement,
} from "./runtime-probe-preview-data";
import type {
  RuntimeCrewSeatStation,
  RuntimeCrewSeatView,
} from "../lib/vehicle-crew-seat-runtime";
import {
  buildCrewOccupantPresentationPlan,
} from "../lib/vehicle-crew-occupant-presentation";
import {
  crewViewBasePose,
  crewViewHorizontalFovForZoom,
  preferredCrewViewStation,
  transformCrewViewPose,
  type CrewViewPose,
} from "../lib/vehicle-crew-viewpoint";
import {
  runtimePlanarSuspensionCoverageForGeneratedClass,
  runtimePlanarSuspensionPoseForVisualOccurrence,
  type RuntimePlanarSuspensionPoseRecord,
} from "./runtime-planar-suspension-pose";
import type {
  ReferenceData,
  ReferenceSeat,
  ReferenceTurret,
  ReferenceTurretArticulation,
} from "./catalog-types";
import {
  TurretPreviewControls,
  type TurretOrientationIndicator,
  type TurretPreviewIndicatorKind,
  type TurretPreviewStation,
} from "./TurretLimitsDisplay";
import {
  paintVehicleDamageTypeIconCanvas,
} from "./VehicleDamageTypeIcon";
import {
  type RuntimeAttackSource,
} from "./runtime-probe-weapon-labels";
import {
  createRuntimeAttackSourceLibrary,
  createRuntimeStationEquipmentResolver,
  resolveRuntimeAttackSourceIndexEntry,
  type RuntimeAttackSourceLibrary,
  type RuntimeAttackSourcePresentation,
  type RuntimeStationEquipmentResolver,
  type WikiWeaponRuntimeIndexDocument,
  type WikiWeaponRuntimeSourceDocument,
} from "./runtime-wiki-attack-source";
import {
  RUNTIME_PROTECTION_MAP_BLOCK_SIZE,
  RUNTIME_PROTECTION_MAP_MAX_PRECISION,
  RUNTIME_PROTECTION_MAP_MIN_PRECISION,
  RUNTIME_PROTECTION_MAP_STANDARD_MAX_PRECISION,
  RUNTIME_PROTECTION_MAP_SUPER_PRECISION,
  RUNTIME_PROTECTION_MAP_UI_UPDATE_INTERVAL_MS,
  clampRuntimeProtectionMapPrecision,
  classifyRuntimeProtectionShot,
  reconstructRuntimeProtectionMapBlock,
  runtimeProtectionMapCumulativeSampleCount,
  runtimeProtectionMapFrameHasBudget,
  runtimeProtectionMapGridSize,
  runtimeProtectionMapLevelOffsets,
  runtimeProtectionMapSuperGridSize,
  type RuntimeProtectionMapCell,
  type RuntimeProtectionMapPrecision,
  type RuntimeProtectionMapStandardPrecision,
} from "../lib/runtime-protection-map";
import {
  decodeSharedShotPaths,
  encodeSharedShotPaths,
} from "../lib/viewer-shot-share.mjs";
import {
  decodeViewerCameraState,
  encodeViewerCameraState,
} from "../lib/viewer-camera-share.mjs";
import {
  decodeViewerTurretState,
  encodeViewerTurretState,
} from "../lib/viewer-turret-share.mjs";
import { runtimeRenderQualityProfile } from "../lib/runtime-render-quality";
import type { ViewerAssetMode, ViewerNavigationState } from "./viewer-types";
import { VehicleViewerLoading } from "./VehicleViewerLoading";
import { WeaponRhythmTimeline } from "./WeaponRhythmTimeline";
import { officialVehiclePreviewIssue } from "./vehicle-preview-policy";
import type { RuntimeCrewOccupantLayer } from "./runtime-crew-occupants";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const STANDARD_SHOT_DAMAGE_MULTIPLIER = 1 as const;
const MAX_VISIBLE_LAYERS = 8;
const SHOT_GESTURE_THRESHOLD_PX = 5;
const FORCED_RUNTIME_RENDER_QUALITY_TIER =
  process.env.NEXT_PUBLIC_SIGUA_RENDER_QUALITY === "compatibility" ||
  process.env.NEXT_PUBLIC_SIGUA_RENDER_QUALITY === "balanced"
    ? process.env.NEXT_PUBLIC_SIGUA_RENDER_QUALITY
    : null;
const DEFAULT_TARGET_DISTANCE_M = 0;
const RUNTIME_GROUND_REFERENCE_MIN_CLEARANCE_M = 2.25;
const RUNTIME_GROUND_REFERENCE_MAX_CLEARANCE_M = 4;
const RUNTIME_GROUND_SCALE_RENDER_ORDER = 7;

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await task(values[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(values.length, Math.max(1, concurrency)) },
      worker,
    ),
  );
}
function createReferenceSoldierOutlineProxy(onTextureReady: () => void) {
  const material = new THREE.SpriteMaterial({
    color: 0xe7cf99,
    transparent: true,
    opacity: 0,
    alphaTest: 0.05,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const outline = new THREE.Sprite(material);
  outline.name = "reference-soldier-outline";
  outline.userData.referenceSoldierOutline = true;
  outline.scale.set(0.85, 1.7, 1);
  const texture = new THREE.TextureLoader().load(
    "/images/reference-soldier-outline.webp",
    () => {
      material.opacity = 0.9;
      material.needsUpdate = true;
      onTextureReady();
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  material.map = texture;
  return outline;
}

function runtimeGroundReferenceClearanceM(
  vehicleLengthM: number,
  vehicleWidthM: number,
) {
  return THREE.MathUtils.clamp(
    Math.max(vehicleLengthM, vehicleWidthM) * 0.2,
    RUNTIME_GROUND_REFERENCE_MIN_CLEARANCE_M,
    RUNTIME_GROUND_REFERENCE_MAX_CLEARANCE_M,
  );
}

type SearchableSelectEffectRole =
  | "penetration"
  | "direct-damage"
  | "radial-damage";

interface SearchableSelectEffect {
  id: string;
  role: SearchableSelectEffectRole;
  damageTypeKind: VehicleDamageTypeIconKind;
  penetrationKind: WeaponPenetrationKind | null;
  value: number;
  eventIndex: number | null;
  title: string;
}

function selectorWeaponEffects(
  directFireRoute: boolean,
  ballistics: EditorNativeBallistics,
) {
  const effects: SearchableSelectEffect[] = [];
  if (directFireRoute) {
    const penetrationKind = weaponPenetrationKindForDamageTypePath(
      ballistics.damageTypePath,
    );
    const penetrationMm = ballistics.penetrationAtRangeMm ?? 0;
    const penetrationLabel = penetrationKind === "shaped-charge"
      ? "破甲"
      : "穿深";
    const directDamageTypeKind =
      vehicleDamageTypeIconKindForPath(ballistics.damageTypePath) ??
      "generic";
    const directDamage = ballistics.impactDamageAtRange ?? 0;
    effects.push({
      id: "penetration",
      role: "penetration",
      damageTypeKind:
        penetrationKind === "shaped-charge" ? "heat" : "kinetic",
      penetrationKind,
      value: penetrationMm,
      eventIndex: null,
      title: `${penetrationLabel}能力：${metricText(
        penetrationMm,
      )} 毫米`,
    });
    effects.push({
      id: "direct-damage",
      role: "direct-damage",
      damageTypeKind: directDamageTypeKind,
      penetrationKind: null,
      value: directDamage,
      eventIndex: null,
      title: `${vehicleDamageTypeIconLabel(
        directDamageTypeKind,
      )}：${metricText(directDamage)} 点直击伤害`,
    });
  }
  ballistics.explosiveLayers.forEach((layer, eventIndex) => {
    const damageTypeKind =
      vehicleDamageTypeIconKindForPath(layer.damageTypePath) ?? "generic";
    effects.push({
      id: `radial-${layer.layerId}-${eventIndex}`,
      role: "radial-damage",
      damageTypeKind,
      penetrationKind: null,
      value: layer.baseDamage,
      eventIndex,
      title: `${vehicleDamageTypeIconLabel(
        damageTypeKind,
      )}：${metricText(layer.baseDamage)} 点径向基础伤害（事件 ${
        eventIndex + 1
      }）`,
    });
  });
  return effects;
}

const ARMOR_THICKNESS_LEGEND_GRADIENT = `linear-gradient(90deg, ${ARMOR_THICKNESS_LEGEND_STOPS.map(
  (stop) => {
    const [red, green, blue] = stop.rgb.map((channel) => Math.round(channel * 255));
    return `rgb(${red}, ${green}, ${blue}) ${stop.normalizedPosition * 100}%`;
  },
).join(", ")})`;

const RELATIVE_ARMOR_THICKNESS_LEGEND_GRADIENT = `linear-gradient(90deg, ${RELATIVE_ARMOR_THICKNESS_STOPS.map(
  (stop) => {
    const [red, green, blue] = stop.rgb.map((channel) => Math.round(channel * 255));
    return `rgb(${red}, ${green}, ${blue}) ${stop.normalizedPosition * 100}%`;
  },
).join(", ")})`;

function formatArmorThicknessLegendValue(thicknessMm: number) {
  const rounded = Math.round(thicknessMm * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} mm`;
}

function relativeArmorThicknessLegendTicks(range: HitSceneArmorThicknessRange | null) {
  if (!range) return [];
  if (range.minMm === range.maxMm) {
    return [{
      thicknessMm: range.minMm,
      label: formatArmorThicknessLegendValue(range.minMm),
      normalizedPosition: 0.5,
    }];
  }
  return [0, 0.25, 0.5, 0.75, 1].map((normalizedPosition) => {
    const thicknessMm = range.minMm + (range.maxMm - range.minMm) * normalizedPosition;
    return {
      thicknessMm,
      label: formatArmorThicknessLegendValue(thicknessMm),
      normalizedPosition,
    };
  });
}

const MAX_SHOT_TRACES = 3;
const MAX_SHOT_EXPLOSION_LAYERS = 4;
const SHARED_SHOT_RAY_LEAD_M = 0.6;
const SHOT_TRACE_MIN_DURATION_MS = 360;
const SHOT_TRACE_MAX_DURATION_MS = 720;
const SHOT_CONTINUATION_DURATION_MS = 180;
const SHOT_EXPLOSION_LAYER_DELAY_MS =
  RADIAL_DAMAGE_VISUAL_TIMING_MS.layerDelay;
const SHOT_EXPLOSION_EXPANSION_DURATION_MS =
  RADIAL_DAMAGE_VISUAL_TIMING_MS.expansion;
const SHOT_EXPLOSION_FADE_DURATION_MS =
  RADIAL_DAMAGE_VISUAL_TIMING_MS.fade;
const SHOT_EXPLOSION_DURATION_MS =
  SHOT_EXPLOSION_EXPANSION_DURATION_MS + SHOT_EXPLOSION_FADE_DURATION_MS;
const PROTECTION_MAP_DEBOUNCE_MS = 150;
const VIEWER_MODES: Array<[ViewerAssetMode, string]> = [
  ["armor", "装甲"],
  ["interior", "内构"],
  ["exterior", "外观"],
];

function RuntimeViewerCameraControls({
  activeView,
  infantryDistanceM,
  disabled,
  onView,
  onInfantryDistance,
  onFree,
}: {
  activeView: RuntimeViewerCameraViewId | null;
  infantryDistanceM: number | null;
  disabled: boolean;
  onView: (view: RuntimeViewerCameraViewId) => void;
  onInfantryDistance: (distanceM: number) => void;
  onFree: () => void;
}) {
  return (
    <div className="viewer-camera-presets" aria-label="载具相机快捷预览">
      <div className="viewer-camera-presets__row">
        <span><b>五向视角</b><small>数字键 1–5</small></span>
        <div role="group" aria-label="切换载具五向视角，不含底部视角">
          {RUNTIME_VIEWER_CAMERA_VIEWS.map((view) => (
            <button
              type="button"
              key={view.id}
              data-active={activeView === view.id}
              aria-pressed={activeView === view.id}
              aria-keyshortcuts={view.shortcut}
              disabled={disabled}
              title={view.kind === "soldier-ground"
                ? `${view.label}视图 · 标准步兵站姿眼高 · 快捷键 ${view.shortcut}`
                : `${view.label}视图 · 快捷键 ${view.shortcut}`}
              onClick={() => onView(view.id)}
            >
              <span>{view.label}</span><kbd>{view.shortcut}</kbd>
            </button>
          ))}
        </div>
      </div>
      <div className="viewer-camera-presets__row">
        <span>
          <b>观察距离</b>
          <small>步兵 {SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG}° FOV</small>
        </span>
        <div role="group" aria-label="按普通步兵透视预览载具距离">
          {RUNTIME_VIEWER_INFANTRY_DISTANCES_M.map((distanceM) => (
            <button
              type="button"
              key={distanceM}
              data-active={infantryDistanceM === distanceM}
              aria-pressed={infantryDistanceM === distanceM}
              disabled={disabled}
              title={`以普通步兵视野在 ${distanceM} 米观察载具`}
              onClick={() => onInfantryDistance(distanceM)}
            >{distanceM}<small>m</small></button>
          ))}
          <button
            type="button"
            data-active={activeView === null && infantryDistanceM === null}
            aria-pressed={activeView === null && infantryDistanceM === null}
            disabled={disabled}
            title="退出固定方向与距离，保留当前相机进入自由旋转视角"
            onClick={onFree}
          >自由</button>
        </div>
      </div>
    </div>
  );
}

interface RuntimeTurretPreviewStation extends TurretPreviewStation {
  assembly: RuntimeTurretAssembly | null;
  seat: ReferenceSeat;
  crewSeat: RuntimeCrewSeatStation;
  view: RuntimeCrewSeatView | null;
  visualAttachment: RuntimeVisualAttachmentStation | null;
  parentCatalogSeatIndex: number | null;
  inheritedMotionChannels: Array<"yaw" | "pitch">;
}

interface CrewViewpointMarker {
  root: THREE.Sprite;
}

function createCrewViewpointMarker(): CrewViewpointMarker {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Crew viewpoint optic canvas is unavailable");
  }
  const centerX = 64;
  const centerY = 58;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const lens = context.createRadialGradient(
    centerX - 9,
    centerY - 11,
    3,
    centerX,
    centerY,
    36,
  );
  lens.addColorStop(0, "rgba(255, 229, 168, 0.32)");
  lens.addColorStop(0.32, "rgba(63, 91, 81, 0.9)");
  lens.addColorStop(1, "rgba(6, 11, 10, 0.97)");
  context.beginPath();
  context.arc(centerX, centerY, 34, 0, Math.PI * 2);
  context.fillStyle = lens;
  context.shadowColor = "rgba(255, 190, 78, 0.72)";
  context.shadowBlur = 13;
  context.fill();
  context.shadowBlur = 0;

  context.strokeStyle = "rgba(255, 214, 132, 0.98)";
  context.lineWidth = 6;
  context.beginPath();
  context.arc(centerX, centerY, 36, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(255, 242, 209, 0.5)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centerX, centerY, 27, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "rgba(255, 207, 112, 0.96)";
  context.fillRect(52, 14, 24, 7);
  context.fillRect(57, 9, 14, 8);
  context.fillRect(16, 50, 11, 16);
  context.fillRect(101, 50, 11, 16);
  context.fillRect(48, 95, 32, 7);
  context.fillRect(55, 101, 18, 11);

  context.strokeStyle = "rgba(255, 224, 157, 0.96)";
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(centerX, centerY - 24);
  context.lineTo(centerX, centerY - 8);
  context.moveTo(centerX, centerY + 8);
  context.lineTo(centerX, centerY + 24);
  context.moveTo(centerX - 24, centerY);
  context.lineTo(centerX - 8, centerY);
  context.moveTo(centerX + 8, centerY);
  context.lineTo(centerX + 24, centerY);
  context.stroke();
  context.beginPath();
  context.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 236, 194, 1)";
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const root = new THREE.Sprite(material);
  root.name = "crew-viewpoint-marker";
  root.visible = false;
  root.scale.set(0.38, 0.38, 1);
  root.center.set(0.5, 0.46);
  root.renderOrder = 96;
  return { root };
}

function referenceTurretFromStationControl(
  station: RuntimeVisualAttachmentStation | null,
): ReferenceTurret | null {
  const control = station?.control;
  if (
    control?.state !== "observed" ||
    control.source !==
      "paired-sq-rotating-movement-components-native-layout" ||
    control.sourceFunction !==
      "USQRotatingMovementComponent::SetCurrentRotation@0x1803f03f0" ||
    control.maxYawSpeedDegreesPerSecond === null ||
    control.maxPitchSpeedDegreesPerSecond === null ||
    !control.yaw ||
    !control.pitch
  ) {
    return null;
  }
  return {
    maxYawSpeed: control.maxYawSpeedDegreesPerSecond,
    maxPitchSpeed: control.maxPitchSpeedDegreesPerSecond,
    minPitchDegrees: control.pitch.minDegrees,
    maxPitchDegrees: control.pitch.maxDegrees,
    limits: {
      authority: "editor",
      sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
      observedAt: null,
      yaw: { ...control.yaw },
      pitchByYaw: [],
    },
  };
}

interface RuntimeExteriorOccurrence {
  object: THREE.Group;
  baseMatrix: THREE.Matrix4;
}

interface RuntimeSkeletalPoseBinding {
  controller: RuntimeSkeletalPoseController;
  generatedClass: string | null;
  stableOccurrenceId: string;
  observedRunningGearRecord: RuntimePlanarSuspensionPoseRecord | null;
  skinnedMeshes: THREE.SkinnedMesh[];
  model: THREE.Object3D;
  placementMatrix: THREE.Matrix4;
}

interface RuntimeTurretPose {
  stationId: string;
  assembly: RuntimeTurretAssembly | null;
  articulation?: ReferenceTurretArticulation;
  yawDegrees: number;
  pitchDegrees: number;
}

interface RuntimeTurretPoseState {
  yawDegrees: number;
  pitchDegrees: number;
}

function runtimeTurretParentStation(
  station: RuntimeTurretPreviewStation,
  stations: RuntimeTurretPreviewStation[],
) {
  if (station.parentCatalogSeatIndex !== null) {
    return stations.find(
      (candidate) => candidate.seat.index === station.parentCatalogSeatIndex,
    ) ?? null;
  }
  const componentId = station.assembly?.yawComponentPlacementId;
  if (!componentId) return null;
  return stations
    .filter(
      (candidate) =>
        candidate.id !== station.id &&
        candidate.assembly?.yawPlacementIds.includes(componentId),
    )
    .sort(
      (left, right) =>
        (left.assembly?.yawPlacementIds.length ?? Number.MAX_SAFE_INTEGER) -
        (right.assembly?.yawPlacementIds.length ?? Number.MAX_SAFE_INTEGER),
    )[0] ?? null;
}

function runtimeTurretStationDepth(
  station: RuntimeTurretPreviewStation,
  stations: RuntimeTurretPreviewStation[],
  visiting = new Set<string>(),
): number {
  if (visiting.has(station.id)) return 0;
  const nextVisiting = new Set(visiting).add(station.id);
  const parent = runtimeTurretParentStation(station, stations);
  return parent
    ? 1 + runtimeTurretStationDepth(parent, stations, nextVisiting)
    : 0;
}

function runtimeTurretWorldYaw(
  station: RuntimeTurretPreviewStation,
  stations: RuntimeTurretPreviewStation[],
  poseStates: Record<string, RuntimeTurretPoseState>,
  visiting = new Set<string>(),
): number {
  const ownYaw = poseStates[station.id]?.yawDegrees ?? 0;
  if (visiting.has(station.id)) return normalizeTurretYaw(ownYaw);
  const parent = runtimeTurretParentStation(station, stations);
  if (!parent || !station.inheritedMotionChannels.includes("yaw")) {
    return normalizeTurretYaw(ownYaw);
  }
  return normalizeTurretYaw(
    runtimeTurretWorldYaw(
      parent,
      stations,
      poseStates,
      new Set(visiting).add(station.id),
    ) + ownYaw,
  );
}

function orderedRuntimeTurretStations(
  stations: RuntimeTurretPreviewStation[],
) {
  return [...stations].sort(
    (left, right) =>
      runtimeTurretStationDepth(left, stations) -
        runtimeTurretStationDepth(right, stations) ||
      left.seat.index - right.seat.index,
  );
}

interface RuntimeWeaponOption {
  value: string;
  familyId: string;
  label: string;
  triggerLabel: string;
  weaponLabel: string;
  source: RuntimeWeaponSourceIdentity;
  provenanceLabels: string[];
  group: string;
  effectsAtDistance: (distanceM: number) => SearchableSelectEffect[];
  searchText: string;
}

type RuntimePointerOutline =
  | "damage"
  | "component-damage-no-vehicle"
  | "blocked-absolute"
  | "blocked-effective"
  | "penetrated-no-damage"
  | "unknown";

interface RuntimeRealtimePointer {
  x: number;
  y: number;
  placement: "left" | "right";
  outline: RuntimePointerOutline;
  fill: "engine" | "ammo-rack" | null;
  angleDeg: number | null;
  rawThicknessMm: number | null;
  effectiveThicknessMm: number | null;
  componentLabels: string[];
}

function metricText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function damageModifierText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return String(Number(value.toFixed(3)));
}

function viewerPointerMetric(value: number | null, suffix = "") {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}${suffix}`;
}

function viewerPointerOutlineLabel(outline: RuntimePointerOutline) {
  return ({
    damage: "可造成车辆伤害",
    "component-damage-no-vehicle": "可损害部件但无车辆伤害",
    "blocked-absolute": "穿深不足",
    "blocked-effective": "强制跳弹",
    "penetrated-no-damage": "已穿透但无法造成车辆伤害",
    unknown: "无法确认",
  } as Record<RuntimePointerOutline, string>)[outline];
}

function normalizeWeaponQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_\-./]+/gu, "");
}

const WEAPON_SELECT_VISIBLE_LIMIT = 160;

interface RuntimeWeaponSourceIdentity {
  id: string;
  kind: RuntimeAttackSource["sourceKind"];
  category: RuntimeAttackSource["sourceCategory"];
  label: string;
  menuLabel: string;
  group: string;
}

interface RuntimeWeaponSourceOption extends RuntimeWeaponSourceIdentity {
  count: number;
}

function runtimeWeaponSourceIdentity(
  source: RuntimeAttackSource,
): RuntimeWeaponSourceIdentity {
  const vehicleSource = source.sourceCategory === "vehicle";
  const supportSource =
    source.sourceCategory === "emplaced" ||
    source.sourceCategory === "commander-support";
  return {
    id: vehicleSource
      ? `${source.sourceKind}::${source.cardId}`
      : `category::${source.sourceCategory}`,
    kind: source.sourceKind,
    category: source.sourceCategory,
    label: vehicleSource
      ? `${source.groupName} · ${source.displayName}`
      : source.displayName,
    menuLabel: source.displayName,
    group: vehicleSource
      ? source.groupName
      : supportSource
        ? "支援武器"
        : "步兵",
  };
}

function runtimeWeaponSourceGroupRank(option: RuntimeWeaponSourceOption) {
  if (option.category === "vehicle") return 2;
  if (
    option.category === "emplaced" ||
    option.category === "commander-support"
  ) {
    return 1;
  }
  return 0;
}

function runtimeWeaponSourceOptions(
  options: readonly RuntimeWeaponOption[],
) {
  const sourceOptions = new Map<string, RuntimeWeaponSourceOption>();
  options.forEach((option) => {
    const current = sourceOptions.get(option.source.id);
    if (current) {
      current.count += 1;
      return;
    }
    sourceOptions.set(option.source.id, {
      ...option.source,
      count: 1,
    });
  });
  return [...sourceOptions.values()].sort((left, right) => {
    const groupRankDifference =
      runtimeWeaponSourceGroupRank(left) -
      runtimeWeaponSourceGroupRank(right);
    return (
      groupRankDifference ||
      left.group.localeCompare(right.group, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      }) ||
      left.label.localeCompare(right.label, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      })
    );
  });
}

function runtimeWeaponSourceOptionForWeapon(
  sourceOptions: readonly RuntimeWeaponSourceOption[],
  option: RuntimeWeaponOption | undefined,
) {
  if (!option) return null;
  return sourceOptions.find(
    (sourceOption) => sourceOption.id === option.source.id,
  ) ?? null;
}

function RuntimeWeaponEffectLegend({
  effects,
}: {
  effects: readonly SearchableSelectEffect[];
}) {
  const penetrationEffects = effects.filter(
    ({ role }) => role === "penetration",
  );
  const directDamageEffects = effects.filter(
    ({ role }) => role === "direct-damage",
  );
  const radialEffects = effects.filter(
    ({ role }) => role === "radial-damage",
  );
  const renderEffect = (effect: SearchableSelectEffect) => {
    const effectLabel = effect.role === "penetration"
      ? effect.penetrationKind === "shaped-charge" ? "射流" : "动能"
      : effect.role === "radial-damage"
        ? vehicleDamageTypeIconShortLabel(effect.damageTypeKind)
        : null;
    return (
      <span
        className="infantry-weapon-effect-chip"
        data-damage-type-kind={effect.damageTypeKind}
        data-effect-role={effect.role}
        data-event-index={effect.eventIndex}
        data-zero={effect.value <= 0}
        title={effect.title}
        aria-label={effect.title}
        key={effect.id}
      >
        {effectLabel ? (
          <span className="infantry-weapon-effect-chip__label">
            {effectLabel}
          </span>
        ) : null}
        <b>{metricText(effect.value)}</b>
      </span>
    );
  };
  return (
    <span
      className="infantry-weapon-effect-legend"
      data-density="compact"
      data-term="effects"
    >
      <span
        className="infantry-weapon-effect-legend__column infantry-weapon-effect-legend__column--penetration"
        data-empty={penetrationEffects.length === 0}
      >
        {penetrationEffects.map(renderEffect)}
      </span>
      <span
        className="infantry-weapon-effect-legend__column infantry-weapon-effect-legend__column--direct"
        data-empty={directDamageEffects.length === 0}
      >
        {directDamageEffects.map(renderEffect)}
      </span>
      <span
        className="infantry-weapon-effect-legend__column infantry-weapon-effect-legend__column--radial"
        data-empty={radialEffects.length === 0}
      >
        {radialEffects.map(renderEffect)}
      </span>
    </span>
  );
}

function RuntimeWeaponSourceSelector({
  value,
  options,
  onChange,
  onRequestGlobalLibrary,
  globalLibraryState,
  onOpenChange,
}: {
  value: string;
  options: readonly RuntimeWeaponSourceOption[];
  onChange: (value: string) => void;
  onRequestGlobalLibrary: () => void;
  globalLibraryState: "idle" | "loading" | "ready" | "error";
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const changeOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange(nextOpen);
  }, [onOpenChange]);
  const selected = options.find((option) => option.id === value) ?? null;
  const normalizedQuery = normalizeWeaponQuery(query);
  const matchedOptions = options.filter((option) =>
    normalizedQuery
      ? normalizeWeaponQuery(`${option.group} ${option.label}`).includes(
          normalizedQuery,
        )
      : true,
  );
  const visibleOptions = matchedOptions;
  const groupedOptions = [
    ...new Set(visibleOptions.map((option) => option.group)),
  ].map((group) => ({
    group,
    options: visibleOptions.filter((option) => option.group === group),
  }));

  useEffect(() => {
    if (!open) return;
    const animationFrame = window.requestAnimationFrame(() =>
      searchRef.current?.focus(),
    );
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-viewer-control-cue="weapon-selector"]')
      ) return;
      if (!rootRef.current?.contains(event.target as Node)) changeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") changeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [changeOpen, open]);

  useEffect(() => () => onOpenChange(false), [onOpenChange]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setQuery("");
    changeOpen(false);
  };

  const openSelector = () => {
    if (open) {
      changeOpen(false);
      return;
    }
    if (
      globalLibraryState === "idle" ||
      globalLibraryState === "error"
    ) {
      onRequestGlobalLibrary();
    }
    changeOpen(true);
  };

  return (
    <div
      className="viewer-search-select infantry-weapon-source-select"
      data-open={open}
      ref={rootRef}
    >
      <button
        className="viewer-search-select__trigger"
        type="button"
        aria-label="选择伤害来源"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openSelector}
      >
        <span
          className="viewer-search-select__value"
          title={selected?.label}
        >
          {selected?.menuLabel ?? "选择伤害来源"}
        </span>
        <small className="infantry-weapon-source-select__count">
          {selected?.count ?? 0} 弹种
        </small>
        <span
          className="viewer-search-select__chevron"
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>
      {open ? (
        <div className="viewer-search-select__menu">
          <div className="viewer-search-select__search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="搜索伤害来源"
              aria-label="搜索伤害来源"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const firstMatch = visibleOptions[0];
                if (!firstMatch) return;
                event.preventDefault();
                choose(firstMatch.id);
              }}
            />
            {query ? (
              <button
                className="viewer-search-select__clear"
                type="button"
                aria-label="清除伤害来源搜索关键词"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                ×
              </button>
            ) : null}
          </div>
          <div
            className="viewer-search-select__options"
            role="listbox"
            aria-label="伤害来源列表"
          >
            {groupedOptions.map(
              ({ group, options: groupOptions }) => (
                <div
                  className="viewer-search-select__group"
                  role="group"
                  aria-label={group}
                  key={group}
                >
                  <strong>{group}</strong>
                  {groupOptions.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.id === value}
                      data-selected={option.id === value}
                      key={option.id}
                      onClick={() => choose(option.id)}
                    >
                      <span>{option.menuLabel}</span>
                      <small>{option.count} 弹种</small>
                    </button>
                  ))}
                </div>
              ),
            )}
            {groupedOptions.length === 0 ? (
              <span className="viewer-search-select__empty">
                没有匹配项
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeWeaponSelector({
  value,
  options,
  targetDistanceM,
  onChange,
  onRequestGlobalLibrary,
  globalLibraryState,
  onOpenChange,
  onSourceOpenChange,
}: {
  value: string;
  options: readonly RuntimeWeaponOption[];
  targetDistanceM: number;
  onChange: (value: string) => void;
  onRequestGlobalLibrary: () => void;
  globalLibraryState: "idle" | "loading" | "ready" | "error";
  onOpenChange: (open: boolean) => void;
  onSourceOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const changeOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange(nextOpen);
  }, [onOpenChange]);
  const sourceOptions = useMemo(
    () => runtimeWeaponSourceOptions(options),
    [options],
  );
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const selectedWeaponSource = runtimeWeaponSourceOptionForWeapon(
    sourceOptions,
    selected,
  );
  const selectedWeaponSourceId = selectedWeaponSource?.id ?? "";
  const [selectedSourceId, setSelectedSourceId] = useState(
    selectedWeaponSourceId,
  );
  const selectedSource =
    sourceOptions.find((option) => option.id === selectedSourceId) ?? null;
  const sourceFilteredOptions = useMemo(
    () =>
      selectedSource
        ? options.filter((option) => option.source.id === selectedSource.id)
        : options,
    [options, selectedSource],
  );
  const normalizedQuery = normalizeWeaponQuery(query);
  const showAllSources = !selectedSource || Boolean(normalizedQuery);
  const matchedOptions = (
    normalizedQuery ? options : sourceFilteredOptions
  ).filter((option) =>
    normalizedQuery
      ? normalizeWeaponQuery(
          `${option.group} ${option.weaponLabel} ${option.label} ${option.provenanceLabels.join(
            " ",
          )} ${option.searchText}`,
        ).includes(normalizedQuery)
      : true,
  );
  const hiddenCount = Math.max(
    0,
    matchedOptions.length - WEAPON_SELECT_VISIBLE_LIMIT,
  );
  const visibleOptions = matchedOptions.slice(
    0,
    WEAPON_SELECT_VISIBLE_LIMIT,
  );
  const groupedOptions = showAllSources
    ? [...new Set(visibleOptions.map(({ familyId }) => familyId))]
        .map((familyId) => ({
          familyId,
          group:
            visibleOptions.find((option) => option.familyId === familyId)
              ?.group ?? familyId,
          options: visibleOptions.filter(
            (option) => option.familyId === familyId,
          ),
        }))
        .filter(({ options: groupOptions }) => groupOptions.length > 0)
    : [
        {
          familyId: selectedSource?.id ?? "source-filtered",
          group: selectedSource?.label ?? "伤害来源",
          options: visibleOptions,
        },
      ];

  useEffect(() => {
    setSelectedSourceId(selectedWeaponSourceId);
  }, [selected?.value, selectedWeaponSourceId]);

  useEffect(() => {
    if (!open) return;
    const animationFrame = window.requestAnimationFrame(() =>
      searchRef.current?.focus(),
    );
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-viewer-control-cue="weapon-selector"]')
      ) return;
      if (!rootRef.current?.contains(event.target as Node)) changeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") changeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [changeOpen, open]);

  useEffect(() => () => onOpenChange(false), [onOpenChange]);

  if (!selected) return null;

  const chooseSource = (nextSourceId: string) => {
    setSelectedSourceId(nextSourceId);
    setQuery("");
    if (!nextSourceId) return;
    const nextSource = sourceOptions.find(
      (option) => option.id === nextSourceId,
    );
    if (!nextSource) return;
    const currentMatchesSource = selected.source.id === nextSource.id;
    if (currentMatchesSource) return;
    const firstMatch = options.find(
      (option) => option.source.id === nextSource.id,
    );
    if (firstMatch) onChange(firstMatch.value);
  };

  const choose = (option: RuntimeWeaponOption) => {
    const nextSource = runtimeWeaponSourceOptionForWeapon(
      sourceOptions,
      option,
    );
    setSelectedSourceId(nextSource?.id ?? "");
    onChange(option.value);
    setQuery("");
    changeOpen(false);
  };

  const openSelector = () => {
    if (open) {
      changeOpen(false);
      return;
    }
    if (
      globalLibraryState === "idle" ||
      globalLibraryState === "error"
    ) {
      onRequestGlobalLibrary();
    }
    changeOpen(true);
  };

  const metrics = (option: RuntimeWeaponOption) => {
    const effects = option.effectsAtDistance(targetDistanceM);
    const effectsLabel = effects.length > 0
      ? effects.map(({ title }) => title).join("；")
      : "无已解析伤害或穿透数据";
    return (
      <span
        className="infantry-weapon-select__metrics"
        aria-label={effectsLabel}
      >
        <RuntimeWeaponEffectLegend effects={effects} />
      </span>
    );
  };

  return (
    <>
      <div className="viewer-attacker-control">
        <span>
          伤害来源
          <b className="infantry-scene-field__count">
            {sourceOptions.length}
          </b>
        </span>
        <RuntimeWeaponSourceSelector
          value={selectedSourceId}
          options={sourceOptions}
          onChange={chooseSource}
          onRequestGlobalLibrary={onRequestGlobalLibrary}
          globalLibraryState={globalLibraryState}
          onOpenChange={onSourceOpenChange}
        />
      </div>
      <div className="viewer-weapon-control">
        <span>
          武器 / 弹种
          <b className="infantry-scene-field__count">
            {sourceFilteredOptions.length}
          </b>
        </span>
        <div
          className="viewer-search-select infantry-weapon-select"
          data-open={open}
          data-source-filtered={!showAllSources}
          ref={rootRef}
        >
          <button
            className="viewer-search-select__trigger"
            type="button"
            aria-label="选择武器或弹种"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={openSelector}
          >
            <span className="viewer-search-select__value">
              {selectedSource
                ? selected.weaponLabel
                : selected.triggerLabel}
            </span>
            {metrics(selected)}
            <span
              className="viewer-search-select__chevron"
              aria-hidden="true"
            >
              ⌄
            </span>
          </button>
          {open ? (
            <div className="viewer-search-select__menu">
              <div className="viewer-search-select__search">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="搜索全部武器或弹种"
                  aria-label="搜索全部武器或弹种"
                  onChange={(event) =>
                    setQuery(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key !== "Enter" ||
                      visibleOptions.length === 0
                    ) {
                      return;
                    }
                    event.preventDefault();
                    choose(visibleOptions[0]);
                  }}
                />
                {query ? (
                  <button
                    className="viewer-search-select__clear"
                    type="button"
                    aria-label="清除武器搜索关键词"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div
                className="infantry-weapon-select__columns"
                aria-label="武器列表列标题"
              >
                <span>武器 / 弹种</span>
                <span className="infantry-weapon-select__metric-headings">
                  <span>穿深</span>
                  <span>伤害</span>
                  <span>爆炸</span>
                </span>
              </div>
              <div className="infantry-weapon-select__option-scroll">
                <div
                  className="viewer-search-select__options"
                  role="listbox"
                  aria-label="武器与弹种列表"
                >
                  {groupedOptions.length > 0 ? (
                    <>
                      {groupedOptions.map(
                        ({ familyId, group, options: groupOptions }) => (
                          <div
                            className="viewer-search-select__group"
                            role="group"
                            aria-label={group}
                            key={familyId}
                          >
                            {showAllSources ? <strong>{group}</strong> : null}
                            {groupOptions.map((option) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={option.value === value}
                                data-selected={option.value === value}
                                key={option.value}
                                onClick={() => choose(option)}
                              >
                                <span>
                                  {showAllSources
                                    ? option.label
                                    : option.weaponLabel}
                                </span>
                                {metrics(option)}
                              </button>
                            ))}
                          </div>
                        ),
                      )}
                      {hiddenCount > 0 ? (
                        <span className="viewer-search-select__empty">
                          还有 {hiddenCount} 项，继续输入以缩小范围
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="viewer-search-select__empty">
                      没有匹配项
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function editorPoolLabel(kind: string) {
  return ({
    hull: "车体",
    seat: "炮塔/武器站",
    engine: "发动机",
    "ammo-rack": "弹药架",
    track: "履带",
    wheel: "车轮",
  } as Record<string, string>)[kind] ?? kind;
}

type ShotPathMarkerKind =
  | "spaced-armor"
  | "no-penetration"
  | "engine"
  | "ammo-rack"
  | "component-only-damage"
  | "gun-collision"
  | "other"
  | "penetrated"
  | "blocked";

interface ShotPathMarkerStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  glow: string;
  dashed: boolean;
}

const SHOT_PATH_MARKER_STYLE_FALLBACK: ShotPathMarkerStyle = {
  fill: "#3a2a12",
  fillOpacity: 1,
  stroke: "#e1ad4f",
  glow: "#e1ad4f",
  dashed: false,
};

/**
 * The armor legend owns these CSS material tokens. Reading them at paint time
 * keeps the WebGL/canvas markers aligned with future legend changes without a
 * second TypeScript color or pattern table.
 */
function resolveShotPathMarkerStyle(kind: ShotPathMarkerKind): ShotPathMarkerStyle {
  const styles = getComputedStyle(document.documentElement);
  const read = (property: string, fallback: string) =>
    styles.getPropertyValue(`--hit-marker-${kind}-${property}`).trim() || fallback;
  const fillShare = Number.parseFloat(read("fill-share", "100%"));
  return {
    fill: read("fill", SHOT_PATH_MARKER_STYLE_FALLBACK.fill),
    fillOpacity: Number.isFinite(fillShare)
      ? THREE.MathUtils.clamp(fillShare / 100, 0, 1)
      : SHOT_PATH_MARKER_STYLE_FALLBACK.fillOpacity,
    stroke: read("stroke", SHOT_PATH_MARKER_STYLE_FALLBACK.stroke),
    glow: read("glow", SHOT_PATH_MARKER_STYLE_FALLBACK.glow),
    dashed:
      read(
        "border-style",
        SHOT_PATH_MARKER_STYLE_FALLBACK.dashed ? "dashed" : "solid",
      ) === "dashed",
  };
}

function opaqueShotPathMarkerColor(color: string) {
  const eightDigitHex = color.match(/^#([0-9a-f]{6})[0-9a-f]{2}$/iu);
  if (eightDigitHex) return `#${eightDigitHex[1]}`;
  const fourDigitHex = color.match(/^#([0-9a-f]{3})[0-9a-f]$/iu);
  if (fourDigitHex) return `#${fourDigitHex[1]}`;
  const rgba = color.match(
    /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)$/u,
  );
  return rgba ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : color;
}

function editorPathMarkerKind(
  hitHeader: ParsedRuntimeHitScene["header"] | null,
  component: ParsedRuntimeHitScene["header"]["components"][number] | undefined,
  profile: ParsedRuntimeHitScene["header"]["surfaceProfiles"][number] | undefined,
  penetrated: boolean | null,
): ShotPathMarkerKind {
  if (component && profile && spacedArmorSurfaceInfo(component, profile).isSpacedArmor) {
    return "spaced-armor";
  }
  if (component && profile && noPenetrationSurfaceInfo(component, profile).isNoPenetration) {
    return "no-penetration";
  }
  if (component?.semanticKind === "gun-collision") return "gun-collision";
  if (component?.semanticKind === "engine") return "engine";
  if (component?.semanticKind === "ammo-rack") return "ammo-rack";
  if (
    hitHeader &&
    component &&
    profile &&
    componentOnlyDamageSurfaceInfo({ header: hitHeader }, component, profile)
  ) {
    return "component-only-damage";
  }
  if (component?.semanticKind === "other") return "other";
  return penetrated === true ? "penetrated" : "blocked";
}

function distanceTicks(maxDistanceM: number) {
  if (maxDistanceM <= 0) return [];
  const step = maxDistanceM <= 600 ? 100 : maxDistanceM <= 2500 ? 500 : 1000;
  const ticks = [0];
  for (let value = step; value < maxDistanceM; value += step) ticks.push(value);
  ticks.push(maxDistanceM);
  if (ticks.length <= 6) return ticks;
  return [ticks[0], ticks[Math.floor((ticks.length - 1) * 0.25)], ticks[Math.floor((ticks.length - 1) * 0.5)], ticks[Math.floor((ticks.length - 1) * 0.75)], ticks.at(-1)!]
    .filter((value, index, values) => values.indexOf(value) === index);
}

function paintProtectionMap(
  canvas: HTMLCanvasElement,
  cells: Uint8Array,
  width: number,
  height: number,
) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(width, height);
  cells.forEach((code, index) => {
    const offset = index * 4;
    const column = index % width;
    const row = Math.floor(index / width);
    if (code === 1) image.data.set([67, 255, 120, 107], offset);
    else if (code === 2) {
      image.data.set((column + row) % 12 < 5 ? [255, 176, 32, 184] : [82, 46, 5, 184], offset);
    } else if (code === 3) {
      const crossline = Math.min((column + row) % 12, (column - row + 12000) % 12);
      image.data.set(crossline < 4 ? [255, 45, 111, 204] : [97, 5, 31, 204], offset);
    } else if (code === 4) {
      image.data.set((column + row) % 12 < 6 ? [255, 176, 32, 214] : [255, 45, 111, 214], offset);
    }
  });
  context.putImageData(image, 0, 0);
}

interface ProtectionMapGridCache {
  width: number;
  height: number;
  sampleValues: Uint8Array;
  sampledMask: Uint8Array;
  reconstructed: Uint8Array;
  nextProgressiveIndex: number;
}

interface ProtectionMapComputationCache {
  standard: ProtectionMapGridCache;
  completedStandardPrecision: number;
  superGrid: ProtectionMapGridCache | null;
}

interface ProtectionMapScheduleOptions {
  invalidate?: boolean;
}

function createProtectionMapGridCache(width: number, height: number): ProtectionMapGridCache {
  return {
    width,
    height,
    sampleValues: new Uint8Array(width * height),
    sampledMask: new Uint8Array(width * height),
    reconstructed: new Uint8Array(width * height),
    nextProgressiveIndex: 0,
  };
}

function protectionMapSampleCount(mask: Uint8Array) {
  let count = 0;
  for (const sampled of mask) count += sampled === 0 ? 0 : 1;
  return count;
}

function seedSuperProtectionMap(
  standard: ProtectionMapGridCache,
  superGrid: ProtectionMapGridCache,
) {
  for (let row = 0; row < superGrid.height; row += 1) {
    const sourceRow = Math.min(
      standard.height - 1,
      Math.floor((row / superGrid.height) * standard.height),
    );
    for (let column = 0; column < superGrid.width; column += 1) {
      const sourceColumn = Math.min(
        standard.width - 1,
        Math.floor((column / superGrid.width) * standard.width),
      );
      superGrid.reconstructed[row * superGrid.width + column] =
        standard.reconstructed[sourceRow * standard.width + sourceColumn];
    }
  }
}

function runtimeProtectionMapSuperSampleOrder(width: number, height: number) {
  const order = new Uint32Array(width * height);
  let index = 0;
  for (
    let level = RUNTIME_PROTECTION_MAP_MIN_PRECISION;
    level <= RUNTIME_PROTECTION_MAP_STANDARD_MAX_PRECISION;
    level += 1
  ) {
    for (
      const [columnOffset, rowOffset] of runtimeProtectionMapLevelOffsets(
        level as RuntimeProtectionMapStandardPrecision,
      )
    ) {
      for (let row = rowOffset; row < height; row += RUNTIME_PROTECTION_MAP_BLOCK_SIZE) {
        for (
          let column = columnOffset;
          column < width;
          column += RUNTIME_PROTECTION_MAP_BLOCK_SIZE
        ) {
          order[index] = row * width + column;
          index += 1;
        }
      }
    }
  }
  return order;
}

type ViewerState =
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready"; loaded: number; total: number }
  | { kind: "error"; message: string };

type HitState =
  | { kind: "absent" }
  | { kind: "loading" }
  | { kind: "ready"; triangles: number; components: number }
  | { kind: "error"; message: string };

type AttackState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

interface ShotPathMarkerVisual {
  sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  fillOpacity: number;
  visibilityOpacity: number;
}

type ShotExplosionPressureSurfaceMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    uCameraDirectionLocal: { value: THREE.Vector3 };
  };
};

interface ShotExplosionLayerVisual {
  root: THREE.Group;
  pressureSurface: THREE.Mesh<
    THREE.SphereGeometry,
    ShotExplosionPressureSurfaceMaterial
  >;
  groundArea: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  exactRadiusRing: THREE.LineLoop<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  originTether: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  impactAnchor: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  groundHeightLabel: THREE.Sprite;
  groundHeightLabelCanvas: HTMLCanvasElement;
  groundHeightLabelTexture: THREE.CanvasTexture;
  originLabel: THREE.Sprite;
  originLabelCanvas: HTMLCanvasElement;
  originLabelTexture: THREE.CanvasTexture;
  damageTypeIcon: THREE.Sprite;
  damageTypeIconCanvas: HTMLCanvasElement;
  damageTypeIconTexture: THREE.CanvasTexture;
  dragHandle: THREE.Group;
  dragHitArea: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  iconAngleOffsetRad: number;
  showOriginLabel: boolean;
  configured: boolean;
  delayMs: number;
  innerRadiusM: number;
  outerRadiusM: number;
  originOffsetM: number;
  settledComponentIndices: number[];
}

interface ExplosionPlacementPreview {
  root: THREE.Group;
  areaDiscs: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[];
  exactRadiusRings: THREE.LineLoop<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >[];
  originMarker: THREE.Group;
  originCore: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  originHalo: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

interface ShotVisualAnimationLayout {
  traceStart: THREE.Vector3;
  traceEnd: THREE.Vector3;
  continuationStart: THREE.Vector3;
  continuationEnd: THREE.Vector3;
  traceRotation: THREE.Quaternion;
  traceLengthM: number;
  continuationLengthM: number;
  firstImpactProgress: number;
  layerMarkerProgress: number[];
  traceDurationMs: number;
  continuationDurationMs: number;
}

interface ShotVisualRuntime {
  group: THREE.Group;
  trace: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  traceOutline: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  continuationTrace: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  continuationArrow: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineDashedMaterial
  >;
  entryMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  terminalMarker: THREE.Group;
  terminalMarkerMaterial: THREE.MeshBasicMaterial;
  layerMarkers: ShotPathMarkerVisual[];
  explosionLayers: ShotExplosionLayerVisual[];
  traceOpacity: number;
  terminalVisible: boolean;
  selected: boolean;
  animationActive: boolean;
  animationLayout: ShotVisualAnimationLayout | null;
  rayOrigin: THREE.Vector3 | null;
  rayDirection: THREE.Vector3 | null;
  firstHitDistanceM: number;
}

interface SavedRuntimeShot {
  shotId: number;
  distanceM: number;
  result: EditorNativeShotResult;
  entryPoint: [number, number, number];
  direction: [number, number, number];
  radialOriginOverrideM: [number, number, number] | null;
}

interface RuntimeShotRecord extends SavedRuntimeShot {
  intersections: EditorNativeIntersection[];
  visual: ShotVisualRuntime;
}

const SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH = 0.82;

function settledShotExplosionDamageHighlight(record: RuntimeShotRecord) {
  const settledLayers = record.visual.explosionLayers.filter(
    (layer) =>
      layer.configured && layer.settledComponentIndices.length > 0,
  );
  if (settledLayers.length === 0) return null;
  return {
    componentIndices: [...new Set(
      settledLayers.flatMap((layer) => layer.settledComponentIndices),
    )],
    colorHex:
      settledLayers[0].pressureSurface.material.uniforms.uColor.value.getHex(),
    strength: SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH,
  };
}

function disposeScene(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Sprite)
    ) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
    }
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function createRuntimeGroundScaleNumberLabel(
  valueM: number,
  labelHeightM: number,
  rotationZRad: number,
  includeUnit: boolean,
) {
  const text = includeUnit ? `${valueM} m` : String(valueM);
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = Math.max(64, 38 + text.length * 30);
  labelCanvas.height = 64;
  const context = labelCanvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.font = '600 54px "Cascadia Mono", Consolas, monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(4, 8, 9, 0.86)";
    context.strokeText(text, labelCanvas.width / 2, labelCanvas.height / 2);
    context.fillStyle = "rgba(240, 213, 154, 0.96)";
    context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.generateMipmaps = false;
  labelTexture.minFilter = THREE.LinearFilter;
  labelTexture.magFilter = THREE.LinearFilter;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(
      labelHeightM * (labelCanvas.width / labelCanvas.height),
      labelHeightM,
    ),
    new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  label.name = `runtime-ground-scale-label-${valueM}`;
  label.rotation.x = -Math.PI / 2;
  label.rotation.z = rotationZRad + Math.PI;
  label.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
  return label;
}

function createRuntimeGroundScaleAxis(
  lengthM: number,
  axisName: "length" | "width",
  tickSide: 1 | -1,
) {
  const group = new THREE.Group();
  group.name = `runtime-ground-scale-${axisName}-axis`;
  const thicknessM = THREE.MathUtils.clamp(lengthM * 0.002, 0.006, 0.016);
  const minorTickDepthM = THREE.MathUtils.clamp(lengthM * 0.018, 0.11, 0.18);
  const majorTickDepthM = minorTickDepthM * 1.55;
  const labelHeightM = THREE.MathUtils.clamp(lengthM * 0.014, 0.1, 0.15);
  const tickCount = Math.round(
    lengthM / RUNTIME_GROUND_SCALE_TICK_INTERVAL_M,
  );

  const baseline = new THREE.Mesh(
    new THREE.BoxGeometry(lengthM, thicknessM * 0.55, thicknessM),
    new THREE.MeshBasicMaterial({
      color: 0xd3b979,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  baseline.name = "runtime-ground-scale-baseline";
  baseline.position.set(lengthM / 2, thicknessM * 0.7, 0);
  baseline.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
  group.add(baseline);

  for (let tickIndex = 0; tickIndex <= tickCount; tickIndex += 1) {
    const valueM = tickIndex * RUNTIME_GROUND_SCALE_TICK_INTERVAL_M;
    const isMetreMark =
      valueM % RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M === 0;
    const tickDepthM = isMetreMark ? majorTickDepthM : minorTickDepthM;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(
        thicknessM * (isMetreMark ? 1.05 : 0.72),
        thicknessM * 0.75,
        tickDepthM,
      ),
      new THREE.MeshBasicMaterial({
        color: isMetreMark ? 0xf0d59a : 0xa28f64,
        transparent: true,
        opacity: isMetreMark ? 0.92 : 0.68,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    tick.name = `runtime-ground-scale-tick-${tickIndex}`;
    tick.position.set(valueM, thicknessM, tickSide * tickDepthM / 2);
    tick.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
    group.add(tick);

    if (!isMetreMark) continue;
    // Viewer +X is vehicle-forward. The width axis group rotates -90 degrees
    // around Y, so these local rotations leave every label facing world +X.
    const label = createRuntimeGroundScaleNumberLabel(
      valueM,
      labelHeightM,
      axisName === "length" ? -Math.PI / 2 : 0,
      tickIndex === 0 || tickIndex === tickCount,
    );
    label.position.set(
      valueM,
      thicknessM * 1.35,
      tickSide * (majorTickDepthM + labelHeightM * 0.62),
    );
    group.add(label);
  }
  return group;
}

function createRuntimeGroundScale(
  lengthM: number,
  widthM: number,
) {
  const group = new THREE.Group();
  group.name = "runtime-ground-scale";
  group.add(createRuntimeGroundScaleAxis(lengthM, "length", -1));
  const widthAxis = createRuntimeGroundScaleAxis(widthM, "width", 1);
  widthAxis.rotation.y = -Math.PI / 2;
  group.add(widthAxis);
  const origin = new THREE.Mesh(
    new THREE.RingGeometry(0.026, 0.038, 20),
    new THREE.MeshBasicMaterial({
      color: 0xb9c9cf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  origin.name = "runtime-ground-scale-origin";
  origin.rotation.x = -Math.PI / 2;
  origin.position.y = 0.008;
  origin.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
  group.add(origin);
  return group;
}

function shotTerminalDistanceFromFirstHitM(result: EditorNativeShotResult) {
  const traceDistanceAfterPenetrationM =
    result.ballistics.traceDistanceAfterPenetrationM;
  const lastLayerDistanceM = result.layers.at(-1)?.distanceFromFirstHitM ?? 0;
  if (traceDistanceAfterPenetrationM === null) {
    return Math.max(0, lastLayerDistanceM);
  }
  const stoppedLayer =
    result.stoppedAtLayer === null
      ? null
      : result.layers[result.stoppedAtLayer] ?? null;
  return editorNativeTraceTerminalDistanceM({
    traceDistanceAfterPenetrationM,
    stoppedDistanceFromFirstHitM:
      stoppedLayer?.distanceFromFirstHitM ?? null,
  });
}

interface RuntimeRendererLease {
  renderer: THREE.WebGLRenderer;
  rendererId: number;
  shared: boolean;
  release: () => void;
}

let sharedRuntimeRenderer: THREE.WebGLRenderer | null = null;
let sharedRuntimeRendererId = 0;
let sharedRuntimeRendererLeased = false;
let runtimeRendererSequence = 0;

function createRuntimeRenderer() {
  return {
    renderer: new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    }),
    rendererId: ++runtimeRendererSequence,
  };
}

function acquireRuntimeRenderer(): RuntimeRendererLease {
  let renderer: THREE.WebGLRenderer;
  let rendererId: number;
  let shared = false;

  if (!sharedRuntimeRendererLeased) {
    if (
      !sharedRuntimeRenderer ||
      sharedRuntimeRenderer.getContext().isContextLost()
    ) {
      sharedRuntimeRenderer?.dispose();
      sharedRuntimeRenderer?.domElement.remove();
      const created = createRuntimeRenderer();
      sharedRuntimeRenderer = created.renderer;
      sharedRuntimeRendererId = created.rendererId;
    }
    renderer = sharedRuntimeRenderer;
    rendererId = sharedRuntimeRendererId;
    sharedRuntimeRendererLeased = true;
    shared = true;
  } else {
    const created = createRuntimeRenderer();
    renderer = created.renderer;
    rendererId = created.rendererId;
  }

  let released = false;
  return {
    renderer,
    rendererId,
    shared,
    release: () => {
      if (released) return;
      released = true;
      renderer.setAnimationLoop(null);
      renderer.renderLists.dispose();
      renderer.domElement.remove();
      if (shared && sharedRuntimeRenderer === renderer) {
        sharedRuntimeRendererLeased = false;
        return;
      }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

const ANALYSIS_VISUAL_DEPTH_RESET_RENDER_ORDER = 4;
const ANALYSIS_VISUAL_DEPTH_OCCLUDER_RENDER_ORDER = 5;
const ANALYSIS_VISUAL_SURFACE_RENDER_ORDER = 6;
const ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER = 7;
type AnalysisVisualPresentation = "analysis" | "exterior-placeholder";

function sourceMeshRequiresStableAnalysisSurface(mesh: THREE.Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) =>
    material.transparent ||
    material.opacity < 0.999 ||
    material.alphaTest > 0 ||
    material.blending !== THREE.NormalBlending
  );
}

function isSiguaDProjectedMark(material: THREE.Material) {
  return material.userData?.siguadRole === "projected-mark" ||
    material.name === "SiguaD vehicle projected mark";
}

function analysisVisualDepthMaterial(source: THREE.Material) {
  const sourceWithMaps = source as THREE.Material & {
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
  };
  return new THREE.MeshBasicMaterial({
    map: sourceWithMaps.map ?? null,
    alphaMap: sourceWithMaps.alphaMap ?? null,
    alphaTest: source.alphaTest,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    colorWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR,
    polygonOffsetUnits: ANALYSIS_VISUAL_DEPTH_BIAS_UNITS,
    toneMapped: false,
  });
}

function createAnalysisVisualDepthReset() {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    toneMapped: false,
  });
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), material);
  reset.name = "runtime-analysis-visual-depth-reset";
  reset.frustumCulled = false;
  reset.renderOrder = ANALYSIS_VISUAL_DEPTH_RESET_RENDER_ORDER;
  reset.onBeforeRender = (activeRenderer) => {
    activeRenderer.clearDepth();
  };
  return reset;
}

function createAnalysisVisualMaterial(
  stableSurface = false,
  presentation: AnalysisVisualPresentation = "analysis",
) {
  const exteriorPlaceholder = presentation === "exterior-placeholder";
  const shared = {
    color: new THREE.Color(exteriorPlaceholder ? "#ffffff" : "#89949a"),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: exteriorPlaceholder ? 0.24 : 0.28,
    depthTest: true,
    depthWrite: false,
  } as const;
  if (stableSurface || exteriorPlaceholder) {
    return new THREE.MeshBasicMaterial({
      ...shared,
      // Appearance-only sheets must not brighten or darken as the camera
      // crosses a light vector. The biased depth shell rejects the far side
      // without changing the source geometry or its silhouette.
      toneMapped: false,
    });
  }
  return new THREE.MeshStandardMaterial({
    ...shared,
    metalness: 0.18,
    roughness: 0.72,
  });
}

function replaceAnalysisVisualMaterial(
  mesh: THREE.Mesh,
  stableSurface: boolean,
  disposePrevious = false,
  presentation: AnalysisVisualPresentation = "analysis",
) {
  const previousMaterials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  mesh.material = Array.isArray(mesh.material)
    ? previousMaterials.map(() =>
        createAnalysisVisualMaterial(stableSurface, presentation)
      )
    : createAnalysisVisualMaterial(stableSurface, presentation);
  if (disposePrevious) {
    previousMaterials.forEach((material) => material.dispose());
  }
}

function setAnalysisVisualPresentation(
  group: THREE.Group,
  presentation: AnalysisVisualPresentation,
) {
  if (group.userData.analysisVisualPresentation === presentation) return;
  group.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object.userData.analysisVisualOnly !== true ||
      object.userData.siguadProjectedMark === true
    ) {
      return;
    }
    replaceAnalysisVisualMaterial(
      object,
      object.userData.analysisVisualStableSurface === true,
      true,
      presentation,
    );
  });
  group.userData.analysisVisualPresentation = presentation;
}

function analysisVisualGeometryScore(source: THREE.Object3D) {
  source.updateMatrixWorld(true);
  const size = new THREE.Box3()
    .setFromObject(source)
    .getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, 0);
  return Math.max(
    size.x * size.y * size.z,
    extent ** 3 * 1e-9,
  );
}

function assetLabel(assetPath: string) {
  const leaf = assetPath.split("/").at(-1) ?? assetPath;
  return leaf.split(".")[0].replace(/^BP_/, "");
}

function defaultAttackWeaponOptionIndex(source: RuntimeAttackSource) {
  const armorPiercing = source.weapons.findIndex(({ gunName, runtimeAssetPath }) =>
    /(?:_AP(?:_|$)|APFSDS|Armor-Piercing|Sabot)/iu.test(
      `${gunName} ${runtimeAssetPath ?? ""}`,
    ),
  );
  return armorPiercing >= 0 ? armorPiercing : 0;
}

function runtimeAttackSourceMatchesId(
  source: RuntimeAttackSource,
  id: string,
) {
  return source.shareSlug === id || source.cardIds.includes(id);
}

const WEAPON_SELECTION_SEPARATOR = "::weapon::";

function weaponSelectionValue(sourceCardId: string, optionIndex: number) {
  return `${sourceCardId}${WEAPON_SELECTION_SEPARATOR}${optionIndex}`;
}

function parseWeaponSelectionValue(value: string) {
  const separatorIndex = value.lastIndexOf(WEAPON_SELECTION_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const sourceCardId = value.slice(0, separatorIndex);
  const optionIndex = Number(
    value.slice(separatorIndex + WEAPON_SELECTION_SEPARATOR.length),
  );
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return null;
  return { sourceCardId, optionIndex };
}

function semanticLabel(kind: string) {
  return ({
    armor: "装甲",
    "penetration-blocker": "不可穿透区",
    engine: "发动机",
    "ammo-rack": "弹药架",
    track: "履带",
    wheel: "车轮",
    "gun-collision": "武器碰撞体",
    other: "可损坏部件",
  } as Record<string, string>)[kind] ?? kind;
}

function shotVerdict(result: EditorNativeShotResult | null) {
  if (!result) return "waiting";
  if (result.resolution === "native-unknown" || result.layers.length === 0) return "unknown";
  return result.stoppedAtLayer === null ? "penetrated" : "stopped";
}

function effectiveDamageEventsByKind(
  result: EditorNativeShotResult,
  damageKind: EditorNativeDamageEvent["damageKind"],
) {
  return result.damage.filter(
    (damage) =>
      damage.damageKind === damageKind
      && editorNativeEffectiveDamageAmount(damage) > 0,
  );
}

function groupDamageEventsByVisibleLayer(
  layers: readonly EditorNativeShotResult["layers"][number][],
  events: readonly EditorNativeDamageEvent[],
) {
  const lastLayerIndexByComponent = new Map<number, number>();
  layers.forEach((layer, index) => {
    lastLayerIndexByComponent.set(layer.componentIndex, index);
  });
  const byLayerIndex = new Map<number, EditorNativeDamageEvent[]>();
  const unassigned: EditorNativeDamageEvent[] = [];
  events.forEach((event) => {
    const layerIndex = lastLayerIndexByComponent.get(event.sourceComponentIndex);
    if (layerIndex === undefined) {
      unassigned.push(event);
      return;
    }
    const layerEvents = byLayerIndex.get(layerIndex) ?? [];
    layerEvents.push(event);
    byLayerIndex.set(layerIndex, layerEvents);
  });
  return { byLayerIndex, unassigned };
}

interface DamageOutcomeSummary {
  key: string;
  poolKind: string;
  label: string;
  effectiveDamage: number;
  poolDamage: number;
  maxHealth: number | null;
  effect: ReturnType<typeof editorDamageCardEffect>;
  damageKinds: Set<EditorNativeDamageEvent["damageKind"]>;
}

function summarizeDamageOutcomes(
  events: readonly EditorNativeDamageEvent[],
): DamageOutcomeSummary[] {
  const summaries = new Map<string, DamageOutcomeSummary & { poolDamage: number }>();
  events.forEach((event) => {
    const key = `${event.poolIndex}:${event.poolId}`;
    const existing = summaries.get(key);
    if (existing) {
      existing.effectiveDamage += editorNativeEffectiveDamageAmount(event);
      existing.poolDamage += event.poolDamage;
      existing.damageKinds.add(event.damageKind);
      existing.effect = editorDamageCardEffect(
        existing.poolKind,
        existing.poolDamage,
        existing.maxHealth,
      );
      return;
    }
    summaries.set(key, {
      key,
      poolKind: event.poolKind,
      label: editorPoolLabel(event.poolKind),
      effectiveDamage: editorNativeEffectiveDamageAmount(event),
      poolDamage: event.poolDamage,
      maxHealth: event.maxHealth,
      effect: editorDamageCardEffect(event.poolKind, event.poolDamage, event.maxHealth),
      damageKinds: new Set([event.damageKind]),
    });
  });
  return [...summaries.values()]
    .sort((left, right) => right.effectiveDamage - left.effectiveDamage);
}

function DamageSettlementListItems({
  events,
  animationKey,
  penetrationKind,
}: {
  events: readonly EditorNativeDamageEvent[];
  animationKey: string;
  penetrationKind?: WeaponPenetrationKind;
}) {
  return summarizeEditorDamageSettlements(events).map((settlement) => {
    const settlementColorKind = settlement.damageKind === "radial"
      ? settlement.damageTypeKind ?? "generic"
      : penetrationKind === "shaped-charge" ? "heat" : "kinetic";
    const typeLabel = settlement.damageKind === "radial"
      ? vehicleDamageTypeIconShortLabel(settlement.damageTypeKind ?? "generic")
      : penetrationKind === "shaped-charge" ? "破甲" : "动能";
    const routeMultiplier = settlement.damageKind === "radial"
      ? ` × ${damageModifierText(settlement.routeMultiplier)}`
      : "";
    const dispatchMultiplier = settlement.dispatchCount > 1
      ? ` × ${settlement.dispatchCount}`
      : "";
    const hasForwardedDamage = settlement.targets.some((target) => target.forwarded);
    if (hasForwardedDamage) {
      return (
        <div
          key={`${animationKey}:${settlement.key}:forwarded`}
          className="viewer-causal-spine__settlement viewer-causal-spine__settlement--forwarded"
          data-damage-kind={settlement.damageKind}
          data-damage-type-kind={settlementColorKind}
          data-damage-forwarded="true"
          style={{
            "--spine-accent": vehicleDamageTypeIconColor(settlementColorKind),
          } as CSSProperties}
        >
          <section className="viewer-causal-spine__forwarding-calculation">
            <strong>{settlement.damageKind === "radial" ? `${typeLabel}爆炸结算` : `${typeLabel}直击结算`}</strong>
            <span>
              {metricText(settlement.incomingDamage)} × {damageModifierText(settlement.damageTypeModifier)}
              {routeMultiplier}{dispatchMultiplier}
            </span>
            <b>{metricText(settlement.effectiveDamage)}</b>
          </section>
          <section
            className="viewer-causal-spine__forwarding-targets"
            aria-label={settlement.targets.map((target) =>
              `${editorPoolLabel(target.poolKind)}受到 ${metricText(target.effectiveDamage)} 伤害`
            ).join("，随后")}
          >
            {settlement.targets.map((target, index) => (
              <span key={`${target.poolId}:${target.forwarded ? "forwarded" : "direct"}`}>
                {index > 0 ? <em aria-hidden="true">↓</em> : null}
                <strong>{editorPoolLabel(target.poolKind)}</strong>
                <b>−{metricText(target.effectiveDamage)}</b>
              </span>
            ))}
          </section>
        </div>
      );
    }
    return (
      <div
        key={`${animationKey}:${settlement.key}`}
        className="viewer-causal-spine__settlement"
        data-damage-kind={settlement.damageKind}
        data-damage-type-kind={settlementColorKind}
        data-damage-forwarded={hasForwardedDamage ? "true" : undefined}
        style={{
          "--spine-accent": vehicleDamageTypeIconColor(settlementColorKind),
        } as CSSProperties}
      >
        <strong>{settlement.damageKind === "radial" ? `${typeLabel}爆炸结算` : `${typeLabel}直击结算`}</strong>
        <span
          aria-label={`${settlement.damageKind === "radial" ? "爆炸" : "直击"}伤害 ${metricText(settlement.incomingDamage)}，伤害类型系数 ${damageModifierText(settlement.damageTypeModifier)}${settlement.damageKind === "radial" ? `，爆炸系数 ${damageModifierText(settlement.routeMultiplier)}，派发 ${settlement.dispatchCount} 次` : ""}，合计生效 ${metricText(settlement.effectiveDamage)}`}
        >
          {metricText(settlement.incomingDamage)} × {damageModifierText(settlement.damageTypeModifier)}
          {routeMultiplier}{dispatchMultiplier} <em aria-hidden="true">→</em> <b>{metricText(settlement.effectiveDamage)}</b>
        </span>
      </div>
    );
  });
}

function HitDpsFold({
  resultLabel,
  secondaryLabel,
  state,
  children,
}: {
  resultLabel: string;
  secondaryLabel?: string | null;
  state: "loading" | "ready" | "unavailable";
  children: ReactNode;
}) {
  return (
    <details className="viewer-hit-dps-fold" data-state={state}>
      <summary aria-label={`${resultLabel}${secondaryLabel ? `，${secondaryLabel}` : ""}，展开或收起分析`}>
        <strong>{resultLabel}</strong>
        {secondaryLabel ? <small>{secondaryLabel}</small> : null}
        <span className="viewer-hit-dps-fold__toggle" aria-hidden="true" />
      </summary>
      <div className="viewer-hit-dps-fold__body">{children}</div>
    </details>
  );
}

interface HitDpsTimingFact {
  label: string;
  value: string;
}

function hitDpsTimingFacts(
  target: WeaponHitDpsTarget,
  simulation: WeaponDpsSimulation,
  weapon: WeaponDpsWeapon | null,
): HitDpsTimingFact[] {
  const firstRemaining = Math.max(0, target.maxHealth - target.damagePerShot);
  if (simulation.shots === 1 && simulation.killTimeSeconds === 0) {
    return [
      { label: "有效伤害", value: metricText(target.damagePerShot) },
      { label: "目标血量", value: metricText(target.maxHealth) },
      { label: "结果", value: "单发" },
    ];
  }
  const facts: HitDpsTimingFact[] = [
    { label: "首发", value: metricText(target.damagePerShot) },
    { label: "剩余", value: metricText(firstRemaining) },
    { label: "需要", value: `${simulation.shots} 发` },
  ];
  const interval = weapon?.timeBetweenShotsSeconds ?? null;
  const reload = weapon
    ? weapon.tacticalReloadSeconds ?? weapon.dryReloadSeconds
    : null;
  if (
    simulation.reloads > 0 &&
    interval !== null && interval > 0 &&
    reload !== null && reload > 0
  ) {
    facts.push(
      { label: "装填 / 再发", value: `${reload.toFixed(2)} / ${interval.toFixed(2)} s` },
      { label: "计时", value: "同时" },
    );
  } else if (simulation.reloads > 0 && reload !== null && reload > 0) {
    facts.push({ label: "装填", value: `${simulation.reloads} × ${reload.toFixed(2)} s` });
  } else if (interval !== null && interval > 0) {
    facts.push({ label: "再发", value: `${interval.toFixed(2)} s` });
  }
  if (simulation.overheatCount > 0) {
    facts.push({ label: "过热", value: `${simulation.overheatCount} 次` });
  }
  if (simulation.burnDamage > 0) {
    facts.push({ label: "正常自燃", value: metricText(simulation.burnDamage) });
  }
  if (simulation.ammoExhausted) {
    facts.push({ label: "备弹", value: `${simulation.shots} 发已耗尽` });
  }
  if (simulation.killTimeSeconds !== null) {
    facts.push({ label: "总计", value: `${simulation.killTimeSeconds.toFixed(2)} s` });
  }
  return facts;
}

function HitDpsFacts({ facts }: { facts: readonly HitDpsTimingFact[] }) {
  return (
    <dl className="viewer-hit-dps-timing__facts" data-count={facts.length}>
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function hitDpsEstimateTimeLabel(estimate: WeaponHitDpsEstimate) {
  const candidate = hitDpsEstimateCandidate(estimate);
  if (candidate.result.shots === 1 && candidate.result.killTimeSeconds === 0) {
    return "单发";
  }
  if (candidate.result.ammoExhausted) return "弹药耗尽";
  return candidate.result.killTimeSeconds === null
    ? `>${candidate.result.elapsedSeconds.toFixed(1)} s`
    : `${candidate.result.killTimeSeconds.toFixed(2)} s`;
}

function hitDpsEstimateCandidate(estimate: WeaponHitDpsEstimate) {
  return estimate.optimization.recommended ?? estimate.optimization.burn;
}

function HitDpsTimingCard({
  estimates,
  targets,
  weapon,
  factsState,
  factsUnavailableReason,
  clickedSemanticKind,
}: {
  estimates: readonly WeaponHitDpsEstimate[];
  targets: readonly WeaponHitDpsTarget[];
  weapon: WeaponDpsWeapon | null;
  factsState: "idle" | "loading" | "ready" | "unavailable";
  factsUnavailableReason?: string | null;
  clickedSemanticKind: string | null;
}) {
  const directOneShotTarget = singleShotWeaponHitTarget(
    targets,
    clickedSemanticKind,
  );
  if (directOneShotTarget && factsState === "unavailable") {
    const poolLabel = editorPoolLabel(directOneShotTarget.poolKind);
    const resultLabel = directOneShotTarget.poolKind === "hull"
      ? "单发摧毁"
      : `单发打坏${poolLabel}`;
    return (
      <HitDpsFold
        resultLabel={resultLabel}
        state="ready"
      >
        <HitDpsFacts facts={[
          { label: "有效伤害", value: metricText(directOneShotTarget.damagePerShot) },
          { label: "目标血量", value: metricText(directOneShotTarget.maxHealth) },
          { label: "结果", value: "单发" },
        ]} />
      </HitDpsFold>
    );
  }
  if (factsState === "loading") {
    return (
      <HitDpsFold resultLabel="计算中" state="loading">
        <p className="viewer-hit-dps-timing__reason">正在载入当前武器的射速、换弹与过热事实…</p>
      </HitDpsFold>
    );
  }
  if (factsState === "unavailable") {
    return (
      <HitDpsFold resultLabel="暂无DPS数据" state="unavailable">
        <p className="viewer-hit-dps-timing__reason">
          {factsUnavailableReason ?? "Wiki 没有返回唯一的精确 assignment，已保留单发伤害结算，不猜测击毁时间。"}
        </p>
      </HitDpsFold>
    );
  }
  if (estimates.length === 0) return null;
  const primaryEstimate = selectPrimaryWeaponHitDpsTarget(
    estimates,
    clickedSemanticKind,
  );
  if (!primaryEstimate) return null;
  const primaryCandidate = (
    primaryEstimate.optimization.recommended ??
    primaryEstimate.optimization.burn
  );
  const primarySimulation = primaryCandidate.result;
  const primaryPlan = primaryCandidate.plan;
  const primaryPoolLabel = editorPoolLabel(primaryEstimate.poolKind);
  const primaryOutcomeLabel = primaryEstimate.poolKind === "hull"
    ? "击毁载具"
    : `打坏${primaryPoolLabel}`;
  const primaryTimeLabel = primarySimulation.ammoExhausted
    ? "弹药耗尽"
    : primarySimulation.killTimeSeconds === null
      ? `>${primarySimulation.elapsedSeconds.toFixed(1)} s`
      : `${primarySimulation.killTimeSeconds.toFixed(2)} s`;
  const primaryIsOneShot =
    primarySimulation.shots === 1 && primarySimulation.killTimeSeconds === 0;
  const primaryResultLabel = primarySimulation.ammoExhausted
    ? "弹药耗尽"
    : primaryIsOneShot
      ? primaryEstimate.poolKind === "hull"
        ? "单发摧毁"
        : `单发打坏${primaryPoolLabel}`
      : `${primaryTimeLabel} ${primaryOutcomeLabel}`;
  const primaryPlanLabel = primaryPlan.mode === "burn"
    ? "连续射击"
    : `每 ${primaryPlan.burstSize} 发短停 ${primaryPlan.pauseSeconds.toFixed(2)} s`;
  const marginalMathGain =
    !primaryEstimate.optimization.practical.meaningful &&
    primaryEstimate.optimization.best !== primaryEstimate.optimization.burn &&
    primaryEstimate.optimization.practical.deltaSeconds !== null &&
    primaryEstimate.optimization.practical.deltaSeconds > 0
      ? primaryEstimate.optimization.practical.deltaSeconds
      : null;
  const secondaryEstimates = estimates.filter(({ key }) => key !== primaryEstimate.key);
  const secondarySummary = secondaryEstimates
    .slice(0, 2)
    .map((estimate) => `${editorPoolLabel(estimate.poolKind)} ${hitDpsEstimateTimeLabel(estimate)}`)
    .join(" · ");
  const secondaryFacts = secondaryEstimates.map((estimate) => ({
    label: `${editorPoolLabel(estimate.poolKind)}摧毁`,
    value: hitDpsEstimateTimeLabel(estimate),
  }));
  const timelineEstimate = primarySimulation.damageCurve.length > 1
    ? primaryEstimate
    : secondaryEstimates.find(
        (estimate) => hitDpsEstimateCandidate(estimate).result.damageCurve.length > 1,
      ) ?? primaryEstimate;
  const timelineCandidate = hitDpsEstimateCandidate(timelineEstimate);
  const timelineSimulation = timelineCandidate.result;
  const timelineTargetLabel = editorPoolLabel(timelineEstimate.poolKind);
  if (primarySimulation.unavailableReason) {
    return (
      <HitDpsFold resultLabel="暂无DPS数据" state="unavailable">
        <p className="viewer-hit-dps-timing__reason">{primarySimulation.unavailableReason}</p>
      </HitDpsFold>
    );
  }
  if (primarySimulation.thermalState === "unavailable") {
    return (
      <HitDpsFold
        resultLabel={primaryResultLabel}
        secondaryLabel={secondarySummary || null}
        state="ready"
      >
        <section
          className="viewer-hit-dps-timing viewer-hit-dps-timing--damage-only"
          data-state="ready"
          data-thermal-state="unavailable"
        >
          <HitDpsFacts facts={[
            ...hitDpsTimingFacts(primaryEstimate, primarySimulation, weapon),
            ...secondaryFacts,
          ]} />
          {timelineSimulation.damageCurve.length > 1 ? (
            <WeaponRhythmTimeline
              simulation={timelineSimulation}
              targetHealth={timelineEstimate.maxHealth}
              targetLabel={timelineTargetLabel}
              compact
            />
          ) : null}
        </section>
      </HitDpsFold>
    );
  }
  return (
    <HitDpsFold
      resultLabel={primaryResultLabel}
      secondaryLabel={secondarySummary || null}
      state="ready"
    >
      <section className="viewer-hit-dps-timing" data-state="ready" aria-label="当前点击位置的自动击毁时间">
        <div className="viewer-hit-dps-timing__primary">
        <span>
          <small>{primaryOutcomeLabel}</small>
          <strong>{primaryTimeLabel}</strong>
        </span>
        <dl>
          <div><dt>需要</dt><dd>{primarySimulation.shots} 发</dd></div>
          <div><dt>单发</dt><dd>{metricText(primaryEstimate.damagePerShot)}</dd></div>
          <div><dt>目标</dt><dd>{metricText(primaryEstimate.maxHealth)} 血量</dd></div>
          <div><dt>过热</dt><dd>{primarySimulation.overheatCount} 次</dd></div>
          {primarySimulation.burnDamage > 0 ? (
            <div><dt>正常自燃</dt><dd>{metricText(primarySimulation.burnDamage)}</dd></div>
          ) : null}
        </dl>
        </div>
        <p className="viewer-hit-dps-timing__rhythm">
        <b>实战节奏</b>
        <span>{primaryPlanLabel}</span>
        {marginalMathGain === null ? null : (
          <small>数学最优只快 {marginalMathGain.toFixed(2)} s，不值得精确卡点</small>
        )}
        </p>
        {secondaryEstimates.length === 0 ? null : (
        <ul className="viewer-hit-dps-timing__secondary" aria-label="同次命中的其他目标">
          {secondaryEstimates.map((estimate) => {
            const candidate = estimate.optimization.recommended ?? estimate.optimization.burn;
            const time = candidate.result.killTimeSeconds;
            return (
              <li key={estimate.key}>
                <span>{editorPoolLabel(estimate.poolKind)}</span>
                <b>{candidate.result.ammoExhausted
                  ? "弹药耗尽"
                  : time === null
                    ? `>${candidate.result.elapsedSeconds.toFixed(1)} s`
                    : `${time.toFixed(2)} s`}</b>
              </li>
            );
          })}
        </ul>
        )}
        <WeaponRhythmTimeline
          simulation={timelineSimulation}
          targetHealth={timelineEstimate.maxHealth}
          targetLabel={timelineTargetLabel}
          compact
        />
      </section>
    </HitDpsFold>
  );
}

function paintShotPathMarker(
  marker: ShotPathMarkerVisual,
  number: number,
  kind: ShotPathMarkerKind,
) {
  const style = resolveShotPathMarkerStyle(kind);
  const context = marker.canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, marker.canvas.width, marker.canvas.height);
  context.beginPath();
  context.arc(48, 48, 40, 0, Math.PI * 2);
  context.lineWidth = 9;
  context.strokeStyle = "rgba(3, 6, 7, 0.94)";
  context.stroke();
  context.beginPath();
  context.arc(48, 48, 35, 0, Math.PI * 2);
  context.fillStyle = style.fill;
  context.globalAlpha = style.fillOpacity;
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(48, 48, 35, 0, Math.PI * 2);
  context.lineWidth = 8;
  context.setLineDash(style.dashed ? [12, 7] : []);
  context.strokeStyle = style.stroke;
  context.shadowColor = style.glow;
  context.shadowBlur = 20;
  context.stroke();
  context.shadowBlur = 0;
  context.setLineDash([]);
  context.font = '800 42px "Cascadia Mono", Consolas, monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 7;
  context.strokeStyle = "rgba(0, 0, 0, 0.92)";
  context.strokeText(String(number), 48, 49);
  context.fillStyle = "#f8fbff";
  context.fillText(String(number), 48, 49);
  marker.texture.needsUpdate = true;
  marker.fillOpacity = style.fillOpacity;
  marker.sphere.material.color.set(style.fill);
  marker.sphere.material.emissive.set(style.stroke);
  marker.sphere.material.opacity = marker.fillOpacity * marker.visibilityOpacity;
}

function createShotPathMarker(
  number: number,
  renderOrder: number,
): ShotPathMarkerVisual {
  const initialStyle = resolveShotPathMarkerStyle("blocked");
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  label.scale.set(0.17, 0.17, 1);
  label.renderOrder = renderOrder + 1;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.064, 16, 12),
    new THREE.MeshStandardMaterial({
      color: initialStyle.fill,
      emissive: initialStyle.stroke,
      emissiveIntensity: 1.08,
      opacity: initialStyle.fillOpacity,
      roughness: 0.32,
      metalness: 0.08,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sphere.name = `editor-native-layer-marker-${number}`;
  sphere.renderOrder = renderOrder;
  sphere.visible = false;
  sphere.add(label);
  const marker = {
    sphere,
    label,
    texture,
    canvas,
    fillOpacity: initialStyle.fillOpacity,
    visibilityOpacity: 1,
  };
  paintShotPathMarker(marker, number, "blocked");
  return marker;
}

function shotTraceMarkerKind(
  result: EditorNativeShotResult,
  hitScene: ParsedRuntimeHitScene | null,
): ShotPathMarkerKind {
  const effectiveDamage = result.damage.filter(
    (damage) => editorNativeEffectiveDamageAmount(damage) > 0,
  );
  if (effectiveDamage.some((damage) => damage.poolKind === "ammo-rack")) return "ammo-rack";
  if (effectiveDamage.some((damage) => damage.poolKind === "engine")) return "engine";
  if (effectiveDamage.some(isEditorNativeComponentOnlyDamageEvent)) {
    return "component-only-damage";
  }
  if (effectiveDamage.some(isEditorNativeVehicleDamageEvent)) return "penetrated";
  if (result.stoppedAtLayer !== null) {
    const layer = result.layers[result.stoppedAtLayer] ?? result.layers.at(-1);
    if (layer) {
      return editorPathMarkerKind(
        hitScene?.header ?? null,
        hitScene?.header.components[layer.componentIndex],
        hitScene?.header.surfaceProfiles[layer.surfaceProfileIndex],
        layer.penetrated,
      );
    }
    return "blocked";
  }
  return result.resolution === "resolved" ? "penetrated" : "other";
}

function shotExplosionColor(kind: VehicleDamageTypeIconKind | null) {
  return vehicleDamageTypeIconColorNumber(kind ?? "generic");
}

function paintShotExplosionDamageTypeIcon(
  visual: ShotExplosionLayerVisual,
  kind: VehicleDamageTypeIconKind,
  color: number,
) {
  const canvas = visual.damageTypeIconCanvas;
  const context = canvas.getContext("2d");
  if (!context) return;
  const accent = new THREE.Color(color).getStyle();
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.beginPath();
  context.moveTo(18, 4);
  context.lineTo(canvas.width - 18, 4);
  context.quadraticCurveTo(canvas.width - 4, 4, canvas.width - 4, 18);
  context.lineTo(canvas.width - 4, canvas.height - 18);
  context.quadraticCurveTo(
    canvas.width - 4,
    canvas.height - 4,
    canvas.width - 18,
    canvas.height - 4,
  );
  context.lineTo(18, canvas.height - 4);
  context.quadraticCurveTo(4, canvas.height - 4, 4, canvas.height - 18);
  context.lineTo(4, 18);
  context.quadraticCurveTo(4, 4, 18, 4);
  context.closePath();
  context.fillStyle = "rgba(3, 8, 11, 0.84)";
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 3;
  context.stroke();

  context.save();
  context.translate(39, 8);
  context.scale(3.4, 3.4);
  paintVehicleDamageTypeIconCanvas(context, kind, accent);
  context.restore();

  context.fillStyle = accent;
  context.font = "600 18px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(vehicleDamageTypeIconShortLabel(kind), canvas.width / 2, 91);
  visual.damageTypeIconTexture.needsUpdate = true;
  visual.damageTypeIcon.userData.damageTypeIconKind = kind;
}

function paintShotExplosionOriginLabel(
  visual: ShotExplosionLayerVisual,
  componentLabel: string,
  originOffsetM: number,
) {
  const canvas = visual.originLabelCanvas;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(3, 8, 11, 0.9)";
  context.fillRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.strokeStyle = "rgba(255, 188, 84, 0.92)";
  context.lineWidth = 3;
  context.strokeRect(4.5, 4.5, canvas.width - 9, canvas.height - 9);
  context.fillStyle = "#ffbc54";
  context.font = "700 19px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(
    `爆心${Math.abs(originOffsetM) > 0.0001 ? ` · 法线偏移 ${(originOffsetM * 100).toFixed(0)} cm` : ""}`,
    14,
    28,
  );
  context.fillStyle = "#f4f7f5";
  context.font = "600 18px system-ui, sans-serif";
  context.fillText(`命中组件：${componentLabel}`, 14, 62);
  visual.originLabelTexture.needsUpdate = true;
}

function paintShotExplosionGroundHeight(
  visual: ShotExplosionLayerVisual,
  heightM: number,
) {
  const label = `${heightM.toFixed(1)} m`;
  if (visual.groundHeightLabel.userData.heightLabel === label) return;
  visual.groundHeightLabel.userData.heightLabel = label;
  const canvas = visual.groundHeightLabelCanvas;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(3, 8, 11, 0.88)";
  context.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.strokeStyle = "rgba(255, 214, 127, 0.82)";
  context.lineWidth = 2;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.fillStyle = "#ffe0a2";
  context.font = "700 24px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  visual.groundHeightLabelTexture.needsUpdate = true;
}

function updateShotExplosionDamageTypeIconPosition(
  visual: ShotExplosionLayerVisual,
  camera: THREE.Camera,
) {
  if (!visual.configured || !visual.root.visible) return;
  const radiusM = visual.outerRadiusM;
  if (radiusM <= 0.0001) return;
  const rootWorldPosition = visual.root.getWorldPosition(new THREE.Vector3());
  const rootWorldQuaternion = visual.root.getWorldQuaternion(
    new THREE.Quaternion(),
  );
  const cameraWorldPosition = camera.getWorldPosition(new THREE.Vector3());
  const localCameraDirection = cameraWorldPosition
    .clone()
    .sub(rootWorldPosition)
    .applyQuaternion(rootWorldQuaternion.clone().invert());
  if (localCameraDirection.lengthSq() < 0.000001) {
    localCameraDirection.set(0, 0, 1);
  } else {
    localCameraDirection.normalize();
  }
  visual.pressureSurface.material.uniforms.uCameraDirectionLocal.value.copy(
    localCameraDirection,
  );
  const ringCameraDirection = localCameraDirection.clone();
  ringCameraDirection.y = 0;
  if (ringCameraDirection.lengthSq() < 0.000001) {
    ringCameraDirection.set(0, 0, 1);
  } else {
    ringCameraDirection.normalize();
  }
  const iconDirection = ringCameraDirection.negate().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    visual.iconAngleOffsetRad,
  );
  visual.damageTypeIcon.position
    .copy(iconDirection)
    .multiplyScalar(radiusM);
  visual.damageTypeIcon.position.y = 0;
  const iconWorldPosition = visual.damageTypeIcon.position
    .clone()
    .applyQuaternion(rootWorldQuaternion)
    .add(rootWorldPosition);
  const iconWidthM = Math.max(
    0.42,
    cameraWorldPosition.distanceTo(iconWorldPosition) * 0.036,
  );
  visual.damageTypeIcon.scale.set(iconWidthM, iconWidthM * 0.7, 1);
  const handleScale = Math.max(
    0.9,
    Math.min(2.6, cameraWorldPosition.distanceTo(rootWorldPosition) * 0.018),
  );
  visual.dragHandle.scale.setScalar(handleScale);
  visual.impactAnchor.scale.setScalar(handleScale);
}

function createShotExplosionPressureSurfaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffa12b) },
      uOpacity: { value: 0 },
      uCameraDirectionLocal: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: `
      varying vec3 vLocalSurfaceDirection;

      void main() {
        vLocalSurfaceDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uCameraDirectionLocal;
      varying vec3 vLocalSurfaceDirection;

      void main() {
        float cameraFacing = dot(
          normalize(vLocalSurfaceDirection),
          normalize(uCameraDirectionLocal)
        );
        float farHemisphere = 1.0 - smoothstep(-0.08, 0.025, cameraFacing);
        if (farHemisphere <= 0.001 || uOpacity <= 0.001) discard;
        gl_FragColor = vec4(uColor, uOpacity * farHemisphere);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }) as ShotExplosionPressureSurfaceMaterial;
}

function createShotExplosionLayerVisual(
  traceIndex: number,
  layerIndex: number,
): ShotExplosionLayerVisual {
  const renderOrder = 29 + traceIndex * 12 + layerIndex;
  const root = new THREE.Group();
  root.name = `editor-native-shot-explosion-layer-${layerIndex + 1}`;
  root.renderOrder = renderOrder;

  const pressureSurface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    createShotExplosionPressureSurfaceMaterial(),
  );
  pressureSurface.name = "editor-native-shot-explosion-pressure-surface";
  pressureSurface.renderOrder = renderOrder;
  root.add(pressureSurface);

  const groundArea = new THREE.Mesh(
    new THREE.CircleGeometry(1, 128),
    new THREE.MeshBasicMaterial({
      color: 0xffa12b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  groundArea.name = "editor-native-shot-explosion-ground-area";
  groundArea.rotation.x = -Math.PI / 2;
  groundArea.position.y = 0.006 + layerIndex * 0.002;
  groundArea.renderOrder = renderOrder;
  root.add(groundArea);

  const exactRadiusRingPoints = Array.from({ length: 96 }, (_, pointIndex) => {
    const angle = pointIndex / 96 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  });
  const exactRadiusRing = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(exactRadiusRingPoints),
    new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  exactRadiusRing.name = "editor-native-shot-explosion-exact-radius-ring";
  exactRadiusRing.renderOrder = renderOrder + 1;
  root.add(exactRadiusRing);

  const originTether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0,
      dashSize: 0.055,
      gapSize: 0.035,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  originTether.name = "editor-native-shot-explosion-origin-tether";
  originTether.renderOrder = renderOrder + 3;
  root.add(originTether);

  const impactAnchor = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 10),
    new THREE.MeshBasicMaterial({
      color: 0xfff0c2,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  impactAnchor.name = "editor-native-shot-explosion-impact-anchor";
  impactAnchor.renderOrder = renderOrder + 4;
  root.add(impactAnchor);

  const groundHeightLabelCanvas = document.createElement("canvas");
  groundHeightLabelCanvas.width = 160;
  groundHeightLabelCanvas.height = 56;
  const groundHeightLabelTexture = new THREE.CanvasTexture(
    groundHeightLabelCanvas,
  );
  groundHeightLabelTexture.colorSpace = THREE.SRGBColorSpace;
  groundHeightLabelTexture.minFilter = THREE.LinearFilter;
  groundHeightLabelTexture.magFilter = THREE.LinearFilter;
  groundHeightLabelTexture.generateMipmaps = false;
  const groundHeightLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: groundHeightLabelTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  groundHeightLabel.name = "editor-native-shot-explosion-ground-height-label";
  groundHeightLabel.renderOrder = renderOrder + 5;
  groundHeightLabel.scale.set(0.7, 0.245, 1);
  root.add(groundHeightLabel);

  const originLabelCanvas = document.createElement("canvas");
  originLabelCanvas.width = 320;
  originLabelCanvas.height = 88;
  const originLabelTexture = new THREE.CanvasTexture(originLabelCanvas);
  originLabelTexture.colorSpace = THREE.SRGBColorSpace;
  originLabelTexture.minFilter = THREE.LinearFilter;
  originLabelTexture.magFilter = THREE.LinearFilter;
  originLabelTexture.generateMipmaps = false;
  const originLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: originLabelTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  originLabel.name = "editor-native-shot-explosion-origin-label";
  originLabel.center.set(0, 0.5);
  originLabel.renderOrder = renderOrder + 5;
  root.add(originLabel);

  const damageTypeIconCanvas = document.createElement("canvas");
  damageTypeIconCanvas.width = 160;
  damageTypeIconCanvas.height = 112;
  const damageTypeIconTexture = new THREE.CanvasTexture(
    damageTypeIconCanvas,
  );
  damageTypeIconTexture.colorSpace = THREE.SRGBColorSpace;
  damageTypeIconTexture.minFilter = THREE.LinearFilter;
  damageTypeIconTexture.magFilter = THREE.LinearFilter;
  damageTypeIconTexture.generateMipmaps = false;
  const damageTypeIcon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: damageTypeIconTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  damageTypeIcon.name = "editor-native-shot-explosion-damage-type-icon";
  damageTypeIcon.center.set(0.5, 0);
  damageTypeIcon.renderOrder = renderOrder + 4;
  root.add(damageTypeIcon);

  const dragHandle = new THREE.Group();
  dragHandle.name = "editor-native-shot-explosion-drag-handle";
  dragHandle.renderOrder = renderOrder + 7;
  addExplosionOriginGlyph(dragHandle, renderOrder + 7);
  const dragHitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 12, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.01,
      depthTest: false,
      depthWrite: false,
    }),
  );
  dragHitArea.name = "editor-native-shot-explosion-drag-hit-area";
  dragHitArea.renderOrder = renderOrder + 9;
  dragHandle.add(dragHitArea);
  root.add(dragHandle);

  root.visible = false;
  const legendPlacement = radialDamageLegendPlacement(layerIndex);
  const visual: ShotExplosionLayerVisual = {
    root,
    pressureSurface,
    groundArea,
    exactRadiusRing,
    originTether,
    impactAnchor,
    groundHeightLabel,
    groundHeightLabelCanvas,
    groundHeightLabelTexture,
    originLabel,
    originLabelCanvas,
    originLabelTexture,
    damageTypeIcon,
    damageTypeIconCanvas,
    damageTypeIconTexture,
    dragHandle,
    dragHitArea,
    iconAngleOffsetRad: legendPlacement.angleOffsetRad,
    showOriginLabel: layerIndex === 0,
    configured: false,
    delayMs: 0,
    innerRadiusM: 0,
    outerRadiusM: 0,
    originOffsetM: 0,
    settledComponentIndices: [],
  };
  paintShotExplosionDamageTypeIcon(
    visual,
    "generic",
    shotExplosionColor("generic"),
  );
  paintShotExplosionOriginLabel(visual, "车辆部件", 0);
  paintShotExplosionGroundHeight(visual, 0);
  return visual;
}

function configureShotExplosionLayerVisual(
  visual: ShotExplosionLayerVisual,
  {
    origin,
    normal,
    color,
    damageTypeIconKind,
    outerRadiusM,
    innerRadiusM,
    delayMs,
    layerId,
    damageTypePath,
    settledComponentIndices,
    originComponentLabel,
    originOffsetM,
  }: {
    origin: THREE.Vector3;
    normal: THREE.Vector3;
    color: number;
    damageTypeIconKind: VehicleDamageTypeIconKind;
    outerRadiusM: number;
    innerRadiusM: number;
    delayMs: number;
    layerId: string;
    damageTypePath: string;
    settledComponentIndices: readonly number[];
    originComponentLabel: string;
    originOffsetM: number;
  },
) {
  visual.configured = true;
  visual.delayMs = delayMs;
  visual.innerRadiusM = Math.max(0, Math.min(innerRadiusM, outerRadiusM));
  visual.outerRadiusM = Math.max(0, outerRadiusM);
  visual.originOffsetM = originOffsetM;
  visual.settledComponentIndices = [...new Set(settledComponentIndices)];
  visual.root.position.copy(origin);
  const safeNormal = normal.lengthSq() < 0.000001
    ? new THREE.Vector3(0, 1, 0)
    : normal.clone().normalize();
  visual.root.quaternion.identity();
  visual.root.userData.layerId = layerId;
  visual.root.userData.damageTypePath = damageTypePath;
  visual.root.userData.damageTypeIconKind = damageTypeIconKind;
  visual.root.userData.outerRadiusM = outerRadiusM;
  visual.root.userData.innerRadiusM = innerRadiusM;
  visual.root.userData.explosionOriginOffsetM = originOffsetM;
  visual.root.userData.settledComponentIndices = visual.settledComponentIndices;
  visual.root.userData.visualGeometry =
    "smooth-camera-far-hemisphere-with-exact-ring";
  visual.root.userData.visualClip = "camera-far-hemisphere";
  visual.root.userData.surfaceHemisphere = "camera-opposite";
  visual.root.userData.legendPlacement =
    "camera-opposite-staggered-on-exact-ring";
  visual.root.userData.legendRadiusPresentation = "exact-outer-ring";
  visual.root.userData.exactRadiusReference =
    "horizontal-outer-boundary-ring";
  visual.root.userData.targetSelection =
    "per-component-native-overlap-visibility";
  visual.root.userData.surfaceNormal = safeNormal.toArray();
  visual.pressureSurface.material.uniforms.uColor.value.setHex(color);
  visual.groundArea.material.color.setHex(color);
  visual.exactRadiusRing.material.color.setHex(color);
  visual.originTether.material.color.setHex(color).offsetHSL(0, -0.08, 0.12);
  visual.impactAnchor.material.color.setHex(color).offsetHSL(0, -0.12, 0.2);
  const impactAnchorPosition = safeNormal.clone().multiplyScalar(-originOffsetM);
  visual.originTether.geometry.setFromPoints([
    new THREE.Vector3(),
    impactAnchorPosition,
  ]);
  visual.originTether.computeLineDistances();
  visual.impactAnchor.position.copy(impactAnchorPosition);
  visual.originLabel.position.copy(safeNormal).multiplyScalar(0.24);
  visual.originLabel.scale.set(1.28, 0.352, 1);
  paintShotExplosionDamageTypeIcon(visual, damageTypeIconKind, color);
  paintShotExplosionOriginLabel(
    visual,
    originComponentLabel,
    originOffsetM,
  );
}

function clearShotExplosionLayerVisual(visual: ShotExplosionLayerVisual) {
  visual.configured = false;
  visual.settledComponentIndices = [];
  visual.root.visible = false;
  visual.pressureSurface.material.uniforms.uOpacity.value = 0;
  visual.groundArea.material.opacity = 0;
  visual.exactRadiusRing.material.opacity = 0;
  visual.originTether.material.opacity = 0;
  visual.impactAnchor.material.opacity = 0;
  visual.groundHeightLabel.visible = false;
  visual.groundHeightLabel.material.opacity = 0;
  visual.originLabel.material.opacity = 0;
  visual.damageTypeIcon.material.opacity = 0;
  visual.dragHandle.visible = false;
}

function settleShotExplosionLayerVisual(
  visual: ShotExplosionLayerVisual,
  selected: boolean,
) {
  if (!visual.configured || !selected) {
    visual.root.visible = false;
    return;
  }
  visual.root.visible = true;
  visual.pressureSurface.scale.setScalar(
    Math.max(0.001, visual.outerRadiusM),
  );
  visual.groundArea.scale.setScalar(
    Math.max(0.001, visual.outerRadiusM),
  );
  visual.groundArea.material.opacity = visual.showOriginLabel ? 0.055 : 0.026;
  visual.exactRadiusRing.scale.setScalar(
    Math.max(0.001, visual.outerRadiusM),
  );
  visual.pressureSurface.material.uniforms.uOpacity.value = 0;
  visual.exactRadiusRing.material.opacity = 0.72;
  const offsetVisible =
    visual.showOriginLabel && Math.abs(visual.originOffsetM) > 0.025;
  visual.originTether.visible = offsetVisible;
  visual.originTether.material.opacity = offsetVisible ? 0.9 : 0;
  visual.impactAnchor.visible = offsetVisible;
  visual.impactAnchor.material.opacity = offsetVisible ? 0.98 : 0;
  visual.groundHeightLabel.visible = false;
  visual.groundHeightLabel.material.opacity = 0;
  visual.originLabel.material.opacity = 0;
  visual.damageTypeIcon.material.opacity = 0.96;
  visual.dragHandle.visible = visual.showOriginLabel;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function setShotExplosionLayerAnimationFrame(
  visual: ShotExplosionLayerVisual,
  elapsedMs: number,
  selected: boolean,
) {
  if (!visual.configured || !selected || elapsedMs < visual.delayMs) {
    visual.root.visible = false;
    return 0;
  }
  const localElapsedMs = elapsedMs - visual.delayMs;
  if (localElapsedMs >= SHOT_EXPLOSION_DURATION_MS) {
    settleShotExplosionLayerVisual(visual, selected);
    return visual.settledComponentIndices.length > 0
      ? SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH
      : 0;
  }
  const expansionProgress = THREE.MathUtils.clamp(
    localElapsedMs / SHOT_EXPLOSION_EXPANSION_DURATION_MS,
    0,
    1,
  );
  const fadeProgress = THREE.MathUtils.clamp(
    (
      localElapsedMs - SHOT_EXPLOSION_EXPANSION_DURATION_MS
    ) / SHOT_EXPLOSION_FADE_DURATION_MS,
    0,
    1,
  );
  const expansion = easeOutCubic(expansionProgress);
  const surfaceVisibility =
    1 - THREE.MathUtils.smoothstep(fadeProgress, 0, 1);
  const ringReveal = THREE.MathUtils.smoothstep(fadeProgress, 0.08, 0.82);
  visual.root.visible = true;
  const currentRadiusM = Math.max(
    0.001,
    visual.outerRadiusM * expansion,
  );
  visual.pressureSurface.scale.setScalar(currentRadiusM);
  visual.groundArea.scale.setScalar(currentRadiusM);
  visual.groundArea.material.opacity =
    (visual.showOriginLabel ? 0.055 : 0.026) * expansion;
  visual.exactRadiusRing.scale.setScalar(
    Math.max(0.001, visual.outerRadiusM),
  );
  visual.pressureSurface.material.uniforms.uOpacity.value =
    surfaceVisibility * (0.105 + (1 - expansionProgress) * 0.055);
  visual.exactRadiusRing.material.opacity = ringReveal * 0.72;
  const iconReveal = THREE.MathUtils.smoothstep(
    expansionProgress,
    0.08,
    0.28,
  );
  const offsetVisible =
    visual.showOriginLabel && Math.abs(visual.originOffsetM) > 0.025;
  visual.originTether.visible = offsetVisible;
  visual.originTether.material.opacity = offsetVisible ? iconReveal * 0.9 : 0;
  visual.impactAnchor.visible = offsetVisible;
  visual.impactAnchor.material.opacity = offsetVisible ? iconReveal * 0.98 : 0;
  visual.groundHeightLabel.visible = false;
  visual.groundHeightLabel.material.opacity = 0;
  visual.originLabel.material.opacity = 0;
  visual.damageTypeIcon.material.opacity = iconReveal * 0.96;
  visual.dragHandle.visible = visual.showOriginLabel;

  if (visual.settledComponentIndices.length === 0) return 0;
  const highlightRise = THREE.MathUtils.smoothstep(
    expansionProgress,
    0.02,
    0.28,
  );
  const settledHighlightBlend = THREE.MathUtils.lerp(
    1,
    SHOT_EXPLOSION_SETTLED_HIGHLIGHT_STRENGTH,
    THREE.MathUtils.smoothstep(fadeProgress, 0.08, 1),
  );
  return highlightRise * settledHighlightBlend;
}

function addExplosionOriginGlyph(
  group: THREE.Group,
  renderOrder: number,
  color = 0xffd67f,
) {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0xfff3cf,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  core.name = "editor-native-explosion-origin-core";
  core.renderOrder = renderOrder;
  group.add(core);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 12),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.name = "editor-native-explosion-origin-halo";
  halo.renderOrder = renderOrder + 1;
  group.add(halo);
  return { core, halo };
}

function createExplosionPlacementPreview(): ExplosionPlacementPreview {
  const root = new THREE.Group();
  root.name = "editor-native-explosion-placement-preview";
  root.renderOrder = 78;
  const layerColors = [0xffc45b, 0xff7357, 0x7edee8, 0xc9e66b];
  const circlePoints = Array.from({ length: 128 }, (_, pointIndex) => {
    const angle = pointIndex / 128 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  });
  const areaDiscs = Array.from(
    { length: MAX_SHOT_EXPLOSION_LAYERS },
    (_, layerIndex) => {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 128),
        new THREE.MeshBasicMaterial({
          color: layerColors[layerIndex],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: layerIndex === 0 ? 0.045 : 0.025,
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      disc.name = `editor-native-explosion-placement-area-${layerIndex + 1}`;
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.008 + layerIndex * 0.003;
      disc.renderOrder = root.renderOrder + layerIndex;
      root.add(disc);
      return disc;
    },
  );
  const exactRadiusRings = Array.from(
    { length: MAX_SHOT_EXPLOSION_LAYERS },
    (_, layerIndex) => {
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(circlePoints),
        new THREE.LineBasicMaterial({
          color: layerColors[layerIndex],
          transparent: true,
          opacity: layerIndex === 0 ? 0.95 : 0.72,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      ring.name = `editor-native-explosion-placement-exact-radius-${layerIndex + 1}`;
      ring.position.y = 0.018 + layerIndex * 0.004;
      ring.renderOrder = root.renderOrder + 5 + layerIndex;
      root.add(ring);
      return ring;
    },
  );
  const originMarker = new THREE.Group();
  originMarker.name = "editor-native-explosion-placement-origin";
  originMarker.position.y = 0.08;
  const { core: originCore, halo: originHalo } = addExplosionOriginGlyph(
    originMarker,
    root.renderOrder + 10,
  );
  root.add(originMarker);
  root.visible = false;
  return {
    root,
    areaDiscs,
    exactRadiusRings,
    originMarker,
    originCore,
    originHalo,
  };
}

function setCylinderBetween(
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusM: number,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 0.0001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  mesh.scale.set(radiusM, length, radiusM);
}

function setShotTraceAnimationProgress(
  shotVisual: ShotVisualRuntime,
  solidProgress: number,
  continuationProgress: number,
) {
  const layout = shotVisual.animationLayout;
  if (!layout) return;
  const clampedSolid = THREE.MathUtils.clamp(solidProgress, 0, 1);
  const clampedContinuation = THREE.MathUtils.clamp(
    continuationProgress,
    0,
    1,
  );
  const animatedTraceEnd = layout.traceStart.clone().lerp(
    layout.traceEnd,
    clampedSolid,
  );
  setCylinderBetween(
    shotVisual.trace,
    layout.traceStart,
    animatedTraceEnd,
    0.012,
  );
  setCylinderBetween(
    shotVisual.traceOutline,
    layout.traceStart,
    animatedTraceEnd,
    0.024,
  );
  shotVisual.traceOutline.visible =
    shotVisual.selected && shotVisual.trace.visible;
  shotVisual.entryMarker.visible =
    clampedSolid >= layout.firstImpactProgress;
  shotVisual.layerMarkers.forEach((marker, index) => {
    const markerProgress = layout.layerMarkerProgress[index];
    marker.sphere.visible =
      markerProgress !== undefined && clampedSolid >= markerProgress;
  });

  const hasContinuation = layout.continuationLengthM > 0.0001;
  if (hasContinuation && clampedContinuation > 0) {
    const animatedContinuationEnd = layout.continuationStart.clone().lerp(
      layout.continuationEnd,
      clampedContinuation,
    );
    shotVisual.continuationTrace.geometry.setFromPoints([
      layout.continuationStart,
      animatedContinuationEnd,
    ]);
    shotVisual.continuationTrace.computeLineDistances();
    shotVisual.continuationTrace.visible = true;
    shotVisual.continuationArrow.position.copy(animatedContinuationEnd);
    shotVisual.continuationArrow.visible = clampedContinuation >= 0.92;
  } else {
    shotVisual.continuationTrace.visible = false;
    shotVisual.continuationArrow.visible = false;
  }
  shotVisual.terminalMarker.visible =
    shotVisual.terminalVisible && clampedSolid >= 0.999;
}

function createShotVisual(traceIndex: number): ShotVisualRuntime {
  const initialStyle = resolveShotPathMarkerStyle("blocked");
  const group = new THREE.Group();
  group.name = "editor-native-shot-visual";
  group.renderOrder = 20 + traceIndex * 12;

  const trace = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8, 1, false),
    new THREE.MeshBasicMaterial({
      color: initialStyle.stroke,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    }),
  );
  trace.name = "editor-native-shot-trace";
  trace.renderOrder = 20 + traceIndex * 12;
  group.add(trace);

  const traceOutline = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8, 1, false),
    new THREE.MeshBasicMaterial({
      color: opaqueShotPathMarkerColor(initialStyle.glow),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  traceOutline.name = "editor-native-shot-trace-outline";
  traceOutline.renderOrder = 19 + traceIndex * 12;
  traceOutline.visible = false;
  group.add(traceOutline);

  const continuationTrace = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0.8, 0),
    ]),
    new THREE.LineDashedMaterial({
      color: initialStyle.stroke,
      transparent: true,
      opacity: 0.72,
      dashSize: 0.16,
      gapSize: 0.11,
      depthTest: false,
      depthWrite: false,
    }),
  );
  continuationTrace.name = "editor-native-shot-continuation-omission";
  continuationTrace.renderOrder = 21 + traceIndex * 12;
  continuationTrace.visible = false;
  continuationTrace.computeLineDistances();
  group.add(continuationTrace);

  const continuationArrow = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.14, -0.24, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14, -0.24, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.24, -0.14),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.24, 0.14),
    ]),
    new THREE.LineDashedMaterial({
      color: initialStyle.stroke,
      transparent: true,
      opacity: 0.72,
      dashSize: 0.07,
      gapSize: 0.045,
      depthTest: false,
      depthWrite: false,
    }),
  );
  continuationArrow.name = "editor-native-shot-continuation-arrow";
  continuationArrow.renderOrder = 22 + traceIndex * 12;
  continuationArrow.visible = false;
  continuationArrow.computeLineDistances();
  group.add(continuationArrow);

  const entryMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 8),
    new THREE.MeshBasicMaterial({
      color: initialStyle.stroke,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  entryMarker.name = "editor-native-entry-marker";
  entryMarker.renderOrder = 21 + traceIndex * 12;
  entryMarker.visible = false;
  group.add(entryMarker);

  const terminalMarkerMaterial = new THREE.MeshBasicMaterial({
    color: initialStyle.stroke,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  const terminalMarker = new THREE.Group();
  terminalMarker.name = "editor-native-terminal-arrow";
  terminalMarker.renderOrder = 22 + traceIndex * 12;
  const terminalArrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.12, 12),
    terminalMarkerMaterial,
  );
  terminalArrowHead.name = "editor-native-terminal-arrow-head";
  terminalArrowHead.position.y = -0.06;
  terminalArrowHead.renderOrder = terminalMarker.renderOrder;
  terminalMarker.add(terminalArrowHead);
  const terminalArrowShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8),
    terminalMarkerMaterial,
  );
  terminalArrowShaft.name = "editor-native-terminal-arrow-shaft";
  terminalArrowShaft.position.y = -0.18;
  terminalArrowShaft.renderOrder = terminalMarker.renderOrder;
  terminalMarker.add(terminalArrowShaft);
  terminalMarker.visible = false;
  group.add(terminalMarker);

  const layerMarkers = Array.from({ length: MAX_VISIBLE_LAYERS }, (_, index) =>
    createShotPathMarker(index + 1, 23 + traceIndex * 12 + index),
  );
  layerMarkers.forEach((marker) => group.add(marker.sphere));
  const explosionLayers = Array.from(
    { length: MAX_SHOT_EXPLOSION_LAYERS },
    (_, layerIndex) => createShotExplosionLayerVisual(traceIndex, layerIndex),
  );
  explosionLayers.forEach((layer) => group.add(layer.root));

  group.visible = false;
  return {
    group,
    trace,
    traceOutline,
    continuationTrace,
    continuationArrow,
    entryMarker,
    terminalMarker,
    terminalMarkerMaterial,
    layerMarkers,
    explosionLayers,
    traceOpacity: 0.92,
    terminalVisible: false,
    selected: false,
    animationActive: false,
    animationLayout: null,
    rayOrigin: null,
    rayDirection: null,
    firstHitDistanceM: 0,
  };
}

function turretStationRoleLabel(role: ReferenceSeat["role"]) {
  return ({
    driver: "驾驶员",
    gunner: "炮手",
    "machine-gunner": "机枪手",
    grenadier: "榴弹手",
    "missile-operator": "导弹操作员",
    "rocket-operator": "火箭操作员",
    commander: "车长",
    passenger: "乘员",
  } satisfies Record<ReferenceSeat["role"], string>)[role];
}

function referenceVehicleWeapons(
  referenceData: ReferenceData,
  equipmentResolver: RuntimeStationEquipmentResolver | null,
) {
  if (!equipmentResolver) return [];
  return referenceData.weaponBindingIds.map((bindingId) => {
    const binding = equipmentResolver(bindingId);
    if (!binding) {
      throw new Error(
        `Vehicle reference data points to missing weapon binding ${bindingId}`,
      );
    }
    return binding.equipment;
  });
}

function turretStationEquipmentLabel(
  referenceData: ReferenceData,
  seat: ReferenceSeat,
  equipmentResolver: RuntimeStationEquipmentResolver | null,
) {
  const labels = [...new Set(
    referenceVehicleWeapons(referenceData, equipmentResolver)
      .filter((weapon) => weapon.turretName === seat.turretName)
      .map((weapon) => weapon.displayName)
      .filter(Boolean),
  )];
  if (labels.length === 0) return seat.turretName ?? "炮塔";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} 等 ${labels.length} 项`;
}

export interface RuntimeVehicleDuelHitSnapshot {
  weapon: WeaponDpsWeapon;
  weaponLabel: string;
  weaponAssignmentId: string | null;
  targets: readonly WeaponHitDpsTarget[];
}

export interface RuntimeVehicleViewerDisplayOverrides {
  physicalPoseEnabled?: boolean;
  relativeArmorScale?: boolean;
  specialArmorVisible?: boolean;
  exteriorSpacedArmorHighlight?: boolean;
}

let sharedWeaponDpsFactsRequest: Promise<WeaponDpsWeapon[]> | null = null;

export function RuntimeVehicleViewer({
  preview,
  showChrome = true,
  mode: requestedMode = "exterior",
  displayName = preview.variantRawName,
  attackSourcePresentation,
  referenceData,
  onModeChange,
  onClose,
  navigationState,
  onNavigationStateChange,
  onExteriorStreamingChange,
  attackLibraryOverride,
  duelTarget = false,
  allowGlobalAttackSources = true,
  onDuelHitChange,
  displayOverrides,
  shotTraceLimit = MAX_SHOT_TRACES,
}: {
  preview: RuntimeVehiclePreview;
  showChrome?: boolean;
  mode?: ViewerAssetMode;
  displayName?: string;
  attackSourcePresentation?: RuntimeAttackSourcePresentation;
  referenceData?: ReferenceData | null;
  onModeChange?: (mode: ViewerAssetMode) => void;
  onClose?: () => void;
  navigationState?: ViewerNavigationState;
  onNavigationStateChange?: (state: ViewerNavigationState) => void;
  onExteriorStreamingChange?: (state: { loaded: number; total: number } | null) => void;
  attackLibraryOverride?: RuntimeAttackSourceLibrary | null;
  duelTarget?: boolean;
  allowGlobalAttackSources?: boolean;
  onDuelHitChange?: (snapshot: RuntimeVehicleDuelHitSnapshot | null) => void;
  displayOverrides?: RuntimeVehicleViewerDisplayOverrides;
  shotTraceLimit?: number;
}) {
  const previewIssue = officialVehiclePreviewIssue(preview.variantRawName);
  const exteriorUnavailableMessage = previewIssue?.message;
  const mode = previewIssue && requestedMode === "exterior" ? "armor" : requestedMode;
  const maxShotTraces = Math.max(
    1,
    Math.min(MAX_SHOT_TRACES, Math.trunc(shotTraceLimit)),
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const protectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const explosionOriginHudRef = useRef<HTMLDivElement>(null);
  const crewViewpointHudRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<
    ((options?: { preserveShotVisual?: boolean }) => void) | null
  >(null);
  const applyCameraViewPresetRef = useRef<
    ((viewId: RuntimeViewerCameraViewId) => void) | null
  >(null);
  const applyInfantryDistancePreviewRef = useRef<
    ((distanceM: number) => void) | null
  >(null);
  const enterFreeCameraViewRef = useRef<(() => void) | null>(null);
  const enterCrewViewpointRef = useRef<
    ((stationId: string) => boolean) | null
  >(null);
  const exitCrewViewpointRef = useRef<(() => void) | null>(null);
  const applyCrewViewZoomRef = useRef<
    ((stationId: string, zoomIndex: number) => boolean) | null
  >(null);
  const activeCrewViewZoomIndexRef = useRef(0);
  const activeCrewViewStationIdRef = useRef<string | null>(null);
  const crewViewpointMarkerEnabledRef = useRef(false);
  const runtimeTurretStationsRef = useRef<RuntimeTurretPreviewStation[]>([]);
  const activeTurretStationIdRef = useRef<string | null>(null);
  const activeCameraViewRef = useRef<RuntimeViewerCameraViewId | null>(null);
  const infantryPreviewDistanceRef = useRef<number | null>(null);
  const visualGroupRef = useRef<THREE.Group | null>(null);
  const analysisVisualGroupRef = useRef<THREE.Group | null>(null);
  const hitGroupRef = useRef<THREE.Group | null>(null);
  const activateAssetModeRef = useRef<((mode: ViewerAssetMode) => void) | null>(null);
  const applyCameraNavigationRef = useRef<
    ((state: ViewerNavigationState | undefined) => void) | null
  >(null);
  const analysisMeshRef = useRef<THREE.Mesh | null>(null);
  const parsedHitRef = useRef<ParsedRuntimeHitScene | null>(null);
  const radialQueryRef = useRef<VehicleRadialQuerySource | null>(null);
  const radialQueryHitPoseRef = useRef<Map<number, readonly number[]>>(new Map());
  const attackModelRef = useRef<EditorNativeModel | null>(null);
  const hitModelRef = useRef<HitSceneThreeModel | null>(null);
  const shotVisualsRef = useRef<ShotVisualRuntime[]>([]);
  const shotRecordsRef = useRef<RuntimeShotRecord[]>([]);
  const setShotExplosionOriginRef = useRef<(
    shotId: number,
    originM: [number, number, number] | null,
  ) => void>(() => undefined);
  const saveExplosionOriginRef = useRef<(
    originM: [number, number, number],
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
  ) => RuntimeShotRecord | null>(() => null);
  const selectedWeaponHasExplosionRef = useRef(false);
  const refreshExplosionPlacementPreviewRef = useRef<(() => void) | null>(null);
  const clearExplosionPlacementPreviewRef = useRef<(() => void) | null>(null);
  const pendingExplosionPlacementRef = useRef<{
    originM: [number, number, number];
    rayOrigin: THREE.Vector3;
    rayDirection: THREE.Vector3;
  } | null>(null);
  const activeShotIdRef = useRef<number | null>(null);
  const shotSequenceRef = useRef(0);
  const shotAnimationFrameRef = useRef(0);
  const animatedShotIdRef = useRef<number | null>(null);
  const navigationStateRef = useRef(navigationState);
  const onNavigationStateChangeRef = useRef(onNavigationStateChange);
  const onDuelHitChangeRef = useRef(onDuelHitChange);
  const pendingSharedShotsRef = useRef(
    decodeSharedShotPaths(navigationState?.shots ?? ""),
  );
  const renderRef = useRef<(() => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const exteriorOccurrencesRef = useRef<Map<string, RuntimeExteriorOccurrence>>(
    new Map(),
  );
  const applyChassisPoseRef = useRef<((enabled: boolean) => void) | null>(null);
  const physicalPoseEnabledRef = useRef(true);
  const applyTurretPoseRef = useRef<(() => void) | null>(null);
  const applyCrewOccupantVisibilityRef = useRef<
    ((visible: boolean) => void) | null
  >(null);
  const applyCrewHitProxyVisibilityRef = useRef<
    ((visible: boolean) => void) | null
  >(null);
  const crewOccupantDisplayEnabledRef = useRef(false);
  const crewHitProxyDisplayEnabledRef = useRef(false);
  const turretPosesRef = useRef<RuntimeTurretPose[]>([]);
  const turretPoseStatesRef = useRef<Record<string, RuntimeTurretPoseState>>({});
  const appliedTurretNavigationKeyRef = useRef("");
  const modeRef = useRef(mode);
  const weaponIndexRef = useRef(-1);
  const weaponOptionIndexRef = useRef(-1);
  const pendingAttackWeaponSelectionRef = useRef<{
    sourceCardId: string;
    optionIndex: number;
  } | null>(null);
  const distancePreferenceRef = useRef(DEFAULT_TARGET_DISTANCE_M);
  const targetDistanceRef = useRef(DEFAULT_TARGET_DISTANCE_M);
  const specialArmorVisibleRef = useRef(true);
  const exteriorSpacedArmorHighlightRef = useRef(false);
  const relativeArmorScaleRef = useRef(false);
  const protectionEnabledRef = useRef(false);
  const protectionOpacityRef = useRef(70);
  const protectionPrecisionRef = useRef<RuntimeProtectionMapPrecision>(
    RUNTIME_PROTECTION_MAP_MIN_PRECISION,
  );
  const [equipmentResolver, setEquipmentResolver] =
    useState<RuntimeStationEquipmentResolver | null>(null);
  const scheduleProtectionMapRef = useRef<
    ((options?: ProtectionMapScheduleOptions) => void) | null
  >(null);
  const cancelProtectionMapRef = useRef<(() => void) | null>(null);
  const visual = preview.visual;
  const hit = preview.hit;
  const radialQuery = preview.radialQuery;
  const chassisPose = preview.chassisPose;
  const gunnerSight = preview.gunnerSight;
  const crewOccupantPlan = useMemo(
    () => buildCrewOccupantPresentationPlan(preview.crewSeat),
    [preview.crewSeat],
  );
  const crewOccupantCounts = useMemo(() => ({
    total: crewOccupantPlan.length,
    hittable: crewOccupantPlan.filter(
      ({ renderKind }) => renderKind === "hittable-model-and-proxy",
    ).length,
    protected: crewOccupantPlan.filter(
      ({ renderKind }) => renderKind === "protected-outline",
    ).length,
    unresolved: crewOccupantPlan.filter(
      ({ renderKind }) => renderKind === "unresolved-outline",
    ).length,
  }), [crewOccupantPlan]);
  const vehicleMeshRuntimePosePlacement = visual?.placements.find(
    (placement) =>
      placement.name.trim().toLowerCase() === "vehicle mesh" &&
      placement.runtimeBonePoseStatus === "observed",
  );
  const vehicleMeshSkeletalPoseEvidence = vehicleMeshRuntimePosePlacement
    ? runtimeSkeletalPoseEvidence({
        observedSampleCount:
          vehicleMeshRuntimePosePlacement.runtimeBonePoseNormalTimeSampleCount ??
          1,
        referenceEquivalent:
          vehicleMeshRuntimePosePlacement.runtimeBonePoseReferenceEquivalent ===
          true,
      })
    : null;
  const vehicleMeshObservedSuspensionPose = vehicleMeshRuntimePosePlacement
    ? runtimePlanarSuspensionPoseForVisualOccurrence(
        preview.suspension.records,
        preview.generatedClass,
        vehicleMeshRuntimePosePlacement.stableOccurrenceId,
      )
    : null;
  const vehiclePlanarSuspensionCoverage =
    runtimePlanarSuspensionCoverageForGeneratedClass(
      preview.suspension.coverage,
      preview.generatedClass,
    );
  const uniqueAssetCount = visual ? new Set(visual.placements.map(({ assetUrl }) => assetUrl)).size : 0;
  const runtimeTurretStations = useMemo<RuntimeTurretPreviewStation[]>(() => {
    if (!referenceData || !visual) return [];
    const stationInputs = referenceData.seats.flatMap((seat) => {
      if (!seat.turretName) return [];
      const crewSeat = preview.crewSeat?.seats.find(
        (candidate) =>
          candidate.catalogSeatIndex === seat.index &&
          candidate.turretName === seat.turretName,
      );
      if (
        !crewSeat ||
        crewSeat.role !== seat.role ||
        crewSeat.stationKind !== seat.stationKind
      ) {
        return [];
      }
      const visualAttachment = preview.visualAttachment?.stations.find(
        (station) =>
          station.catalogSeatIndex === seat.index &&
          station.turretName === seat.turretName,
      ) ?? null;
      const turret = seat.turret ??
        referenceTurretFromStationControl(visualAttachment);
      const view = crewSeat.views.find(
        (candidate) => candidate.source === "seat-pawn-get-camera-component",
      ) ?? crewSeat.views.find(
        (candidate) => candidate.viewId.endsWith("-default"),
      ) ?? crewSeat.views[0] ?? null;
      return turret
        ? [{ seat, turret, visualAttachment, crewSeat, view }]
        : [];
    });
    const primaryInput = stationInputs.find(
      ({ seat }) =>
        seat.role === "gunner" && seat.stationKind === "weapon-station",
    ) ?? stationInputs.find(({ seat }) => seat.role === "gunner") ??
      stationInputs[0];
    const dedupedPlacements = dedupeIdenticalVisualPlacements(
      visual.placements,
    ).placements;
    const allTurretNames = [
      ...new Set(stationInputs.map(({ seat }) => seat.turretName!)),
    ];
    const fallbackSpecs = new Map(
      allTurretNames.map((turretName) => [
        turretName,
        runtimeTurretFallbackSpec(preview.generatedClass, turretName),
      ]),
    );
    const stations = stationInputs.map((input) => {
      const { seat, turret, visualAttachment, crewSeat, view } = input;
      const indicatorKind: TurretPreviewIndicatorKind =
        input === primaryInput
          ? "main-turret"
          : seat.stationKind === "remote-weapon-station"
            ? "weapon-station"
            : seat.role === "machine-gunner" ||
                seat.stationKind === "weapon-station"
              ? "machine-gun"
              : "weapon-station";
      const stationWeaponNames = referenceVehicleWeapons(
        referenceData,
        equipmentResolver,
      )
        .filter((weapon) => weapon.turretName === seat.turretName)
        .map((weapon) => weapon.gunName);
      const assembly = resolveRuntimeTurretAssembly({
        placements: dedupedPlacements,
        vehicleGeneratedClass: preview.generatedClass,
        turretName: seat.turretName!,
        stationWeaponNames,
        articulation: turret.articulation,
        primary: input === primaryInput,
        siblingTurretNames: allTurretNames,
        absorbsSiblingStations:
          input === primaryInput && seat.role === "gunner",
        fallbackYawAnchorComponentName:
          fallbackSpecs.get(seat.turretName!)?.yawAnchorComponentName,
        fallbackYawAnchorActorName:
          fallbackSpecs.get(seat.turretName!)?.yawAnchorActorName,
        fallbackPitchUsesYawAnchor:
          fallbackSpecs.get(seat.turretName!)?.pitchUsesYawAnchor,
        fallbackHitActorClassNames:
          fallbackSpecs.get(seat.turretName!)?.hitActorClassNames,
        carriedHitActorClassNames:
          input === primaryInput && seat.role === "gunner"
          ? allTurretNames.flatMap((turretName) =>
              fallbackSpecs.get(turretName)?.hitActorClassNames ?? []
            )
          : [],
        siblingFallbackYawAnchorComponentNames: allTurretNames
          .filter((turretName) => turretName !== seat.turretName)
          .map((turretName) =>
            fallbackSpecs.get(turretName)?.yawAnchorComponentName
          )
          .filter((name): name is string => Boolean(name)),
        visualAttachment,
      });
      return {
        id: `${seat.index}:${seat.turretName}`,
        label: `${turretStationRoleLabel(seat.role)} · F${seat.index}`,
        equipmentLabel: turretStationEquipmentLabel(
          referenceData,
          seat,
          equipmentResolver,
        ),
        turret,
        indicatorKind,
        yawAvailable: Boolean(assembly?.yawPlacementIds.length),
        pitchAvailable: Boolean(assembly?.pitchPlacementIds.length),
        viewpointAvailable: view?.vehicleLocalFrame.value !== null,
        assembly,
        seat,
        crewSeat,
        view,
        visualAttachment,
        parentCatalogSeatIndex:
          visualAttachment?.parentCatalogSeatIndex ?? null,
        inheritedMotionChannels:
          visualAttachment?.inheritedMotionChannels ?? [],
      };
    });
    const nestedAssemblies = carryNestedRuntimeTurretAssemblies(
      stations.map((station) => station.assembly),
      stations.map((station) => {
        if (station.parentCatalogSeatIndex === null) return null;
        const parentIndex = stations.findIndex(
          (candidate) =>
            candidate.seat.index === station.parentCatalogSeatIndex,
        );
        if (parentIndex < 0) {
          throw new Error(
            `${preview.variantRawName} station F${station.seat.index} parent F${station.parentCatalogSeatIndex} is missing`,
          );
        }
        return {
          parentIndex,
          inheritedMotionChannels: station.inheritedMotionChannels,
        };
      }),
    );
    return stations.map((station, index) => {
      const assembly = nestedAssemblies[index];
      return {
        ...station,
        assembly,
        yawAvailable: Boolean(assembly?.yawPlacementIds.length),
        pitchAvailable: Boolean(assembly?.pitchPlacementIds.length),
      };
    });
  }, [
    equipmentResolver,
    preview.crewSeat?.seats,
    preview.generatedClass,
    preview.variantRawName,
    preview.visualAttachment?.stations,
    referenceData,
    visual,
  ]);
  const defaultTurretStation =
    preferredCrewViewStation(runtimeTurretStations) ??
    runtimeTurretStations[0] ?? null;
  const [activeTurretStationId, setActiveTurretStationId] = useState("");
  const [turretPoseStates, setTurretPoseStates] = useState<
    Record<string, RuntimeTurretPoseState>
  >({});
  const activeTurretStation = runtimeTurretStations.find(
    (station) => station.id === activeTurretStationId,
  ) ?? defaultTurretStation;
  const activeTurretPose = activeTurretStation
    ? turretPoseStates[activeTurretStation.id] ?? {
        yawDegrees: 0,
        pitchDegrees: 0,
      }
    : { yawDegrees: 0, pitchDegrees: 0 };
  useEffect(() => {
    runtimeTurretStationsRef.current = runtimeTurretStations;
    activeTurretStationIdRef.current = activeTurretStation?.id ?? null;
  }, [activeTurretStation?.id, runtimeTurretStations]);
  const clampedTurretYaw = activeTurretStation
    ? clampTurretYaw(
        activeTurretStation.turret,
        activeTurretPose.yawDegrees,
      )
    : 0;
  const clampedTurretPitch = activeTurretStation
    ? clampTurretPitch(
        activeTurretStation.turret,
        clampedTurretYaw,
        activeTurretPose.pitchDegrees,
      )
    : 0;
  const turretOrientationIndicators = useMemo<TurretOrientationIndicator[]>(
    () =>
      runtimeTurretStations.map((station) => ({
        id: station.id,
        label: station.label,
        kind: station.indicatorKind,
        yawDegrees: runtimeTurretWorldYaw(
          station,
          runtimeTurretStations,
          turretPoseStates,
        ),
        active: station.id === activeTurretStation?.id,
      })),
    [activeTurretStation?.id, runtimeTurretStations, turretPoseStates],
  );
  const updateTurretStationPose = (
    station: RuntimeTurretPreviewStation,
    yawDegrees: number,
    pitchDegrees: number,
  ) => {
    const clampedYaw = clampTurretYaw(station.turret, yawDegrees);
    const nextPoseStates = {
      ...turretPoseStatesRef.current,
      [station.id]: {
        yawDegrees: clampedYaw,
        pitchDegrees: clampTurretPitch(
          station.turret,
          clampedYaw,
          pitchDegrees,
        ),
      },
    };
    turretPoseStatesRef.current = nextPoseStates;
    setTurretPoseStates(nextPoseStates);
    return nextPoseStates;
  };
  const commitTurretNavigation = (
    stationId: string,
    poseStates = turretPoseStatesRef.current,
  ) => {
    const current = navigationStateRef.current;
    if (!current || !onNavigationStateChangeRef.current) return;
    const activeStationIndex = Math.max(
      0,
      runtimeTurretStations.findIndex((station) => station.id === stationId),
    );
    const token = encodeViewerTurretState({
      activeStationIndex,
      poses: runtimeTurretStations.map((station, stationIndex) => {
        const state = poseStates[station.id] ?? {
          yawDegrees: 0,
          pitchDegrees: 0,
        };
        return {
          stationIndex,
          yawDegrees: state.yawDegrees,
          pitchDegrees: state.pitchDegrees,
        };
      }),
    });
    if (current.turrets === token) return;
    const next = { ...current, turrets: token };
    navigationStateRef.current = next;
    appliedTurretNavigationKeyRef.current = `${runtimeTurretStations
      .map((station) => station.id)
      .join("|")}:${token}`;
    onNavigationStateChangeRef.current(next);
  };
  const [viewerState, setViewerState] = useState<ViewerState>({
    kind: "loading",
    loaded: 0,
    total: uniqueAssetCount,
  });
  const [initialCameraFitReady, setInitialCameraFitReady] = useState(false);
  const [exteriorPlaceholderReady, setExteriorPlaceholderReady] = useState(false);
  useEffect(() => {
    if (!onExteriorStreamingChange) return;
    onExteriorStreamingChange(
      mode === "exterior" && viewerState.kind === "loading"
        ? { loaded: viewerState.loaded, total: viewerState.total }
        : null,
    );
  }, [mode, onExteriorStreamingChange, viewerState]);
  const [hitState, setHitState] = useState<HitState>(hit ? { kind: "loading" } : { kind: "absent" });
  const [hitHeader, setHitHeader] = useState<ParsedRuntimeHitScene["header"] | null>(null);
  const [attackLibrary, setAttackLibrary] =
    useState<RuntimeAttackSourceLibrary | null>(null);
  const globalAttackLibraryRequestRef = useRef<Promise<RuntimeAttackSourceLibrary> | null>(null);
  const [globalAttackLibraryState, setGlobalAttackLibraryState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [attackLibraryError, setAttackLibraryError] = useState<string | null>(null);
  const [weaponDpsFacts, setWeaponDpsFacts] = useState<WeaponDpsWeapon | null>(null);
  const [weaponDpsFactsState, setWeaponDpsFactsState] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const [attackSourceCardId, setAttackSourceCardId] = useState("");
  const [attackState, setAttackState] = useState<AttackState>({ kind: "loading" });
  const [loadedAttackSourceCardId, setLoadedAttackSourceCardId] = useState("");
  const [attackHeader, setAttackHeader] = useState<EditorNativeModel | null>(null);
  const [weaponIndex, setWeaponIndex] = useState(-1);
  const [weaponOptionIndex, setWeaponOptionIndex] = useState(-1);
  const [pendingAttackWeaponSelection, setPendingAttackWeaponSelection] = useState<{
    sourceCardId: string;
    optionIndex: number;
  } | null>(null);
  const [targetDistanceM, setTargetDistanceM] = useState(
    DEFAULT_TARGET_DISTANCE_M,
  );
  const [activeCameraView, setActiveCameraView] =
    useState<RuntimeViewerCameraViewId | null>(null);
  const [activeCrewViewStationId, setActiveCrewViewStationId] =
    useState<string | null>(null);
  const [crewViewpointMarkerEnabled, setCrewViewpointMarkerEnabled] =
    useState(false);
  const [crewOccupantDisplayEnabled, setCrewOccupantDisplayEnabled] =
    useState(false);
  const [crewHitProxyDisplayEnabled, setCrewHitProxyDisplayEnabled] =
    useState(false);
  const [gunnerSightOverlayEnabled, setGunnerSightOverlayEnabled] =
    useState(true);
  useEffect(() => {
    activeCrewViewStationIdRef.current = activeCrewViewStationId;
  }, [activeCrewViewStationId]);
  useEffect(() => {
    crewViewpointMarkerEnabledRef.current = crewViewpointMarkerEnabled;
  }, [crewViewpointMarkerEnabled]);
  useEffect(() => {
    crewOccupantDisplayEnabledRef.current = crewOccupantDisplayEnabled;
    applyCrewOccupantVisibilityRef.current?.(crewOccupantDisplayEnabled);
  }, [crewOccupantDisplayEnabled]);
  useEffect(() => {
    crewHitProxyDisplayEnabledRef.current = crewHitProxyDisplayEnabled;
    applyCrewHitProxyVisibilityRef.current?.(crewHitProxyDisplayEnabled);
  }, [crewHitProxyDisplayEnabled]);
  useEffect(() => {
    crewOccupantDisplayEnabledRef.current = false;
    crewHitProxyDisplayEnabledRef.current = false;
    setCrewOccupantDisplayEnabled(false);
    setCrewHitProxyDisplayEnabled(false);
  }, [preview.visualVehicleId]);
  useEffect(() => {
    setGunnerSightOverlayEnabled(true);
  }, [gunnerSight?.sourceDataRevision]);
  useEffect(() => {
    if (activeCrewViewStationId === null) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exitCrewViewpointRef.current?.();
    };
    document.addEventListener("keydown", exitOnEscape, true);
    return () => document.removeEventListener("keydown", exitOnEscape, true);
  }, [activeCrewViewStationId]);
  const activeGunnerSightStation = activeTurretStation?.crewSeat.stationId
    ? gunnerSight?.stations.find(
        (station) => station.stationId === activeTurretStation.crewSeat.stationId,
      ) ?? null
    : null;
  const gunnerSightPresentationAvailable = Boolean(
    activeGunnerSightStation?.state === "observed-static-presentation" &&
      (
        activeGunnerSightStation.defaultZoomStages.some(
          ({ projectionRef }) => projectionRef !== null,
        ) ||
        activeGunnerSightStation.weaponModes.some(({ zoomStages }) =>
          zoomStages.some(({ projectionRef }) => projectionRef !== null)
        ) ||
        activeGunnerSightStation.layers.some(
          ({ role, projectionRef }) =>
            (role === "viewport-screen" || role === "reticle") &&
            projectionRef !== null,
        )
      )
  );
  const gunnerSightOverlayVisible = Boolean(
    gunnerSightPresentationAvailable &&
      gunnerSightOverlayEnabled &&
      activeTurretStation &&
      activeCrewViewStationId === activeTurretStation.id,
  );
  const [infantryPreviewDistanceM, setInfantryPreviewDistanceM] =
    useState<number | null>(null);
  const [sourceSelectorOpen, setSourceSelectorOpen] = useState(false);
  const [weaponSelectorOpen, setWeaponSelectorOpen] = useState(false);
  const attackSelectorOpen = sourceSelectorOpen || weaponSelectorOpen;
  const [upperOptionsRevealed, setUpperOptionsRevealed] = useState(false);
  useEffect(() => {
    if (!attackSelectorOpen) setUpperOptionsRevealed(false);
  }, [attackSelectorOpen]);
  // The parent navigation update rerenders the full catalog tree. Keep it out
  // of continuous range input and publish the final distance on interaction end.
  const [distanceInteractionActive, setDistanceInteractionActive] = useState(false);
  const [localSpecialArmorVisible, setSpecialArmorVisible] = useState(true);
  const [localExteriorSpacedArmorHighlight, setExteriorSpacedArmorHighlight] =
    useState(false);
  const [localPhysicalPoseEnabled, setPhysicalPoseEnabled] = useState(true);
  const [localRelativeArmorScale, setRelativeArmorScale] = useState(false);
  const specialArmorVisible =
    displayOverrides?.specialArmorVisible ?? localSpecialArmorVisible;
  const exteriorSpacedArmorHighlight =
    displayOverrides?.exteriorSpacedArmorHighlight ??
    localExteriorSpacedArmorHighlight;
  const physicalPoseEnabled =
    displayOverrides?.physicalPoseEnabled ?? localPhysicalPoseEnabled;
  const relativeArmorScale =
    displayOverrides?.relativeArmorScale ?? localRelativeArmorScale;
  const [armorThicknessRange, setArmorThicknessRange] =
    useState<HitSceneArmorThicknessRange | null>(null);
  const [shotResult, setShotResult] = useState<EditorNativeShotResult | null>(null);
  const [savedShots, setSavedShots] = useState<SavedRuntimeShot[]>([]);
  const [activeShotId, setActiveShotId] = useState<number | null>(null);
  const [explosionPlacementCoverage, setExplosionPlacementCoverage] = useState<
    "covered" | "clear" | "unknown" | null
  >(null);
  const [damageAnimationRevision, setDamageAnimationRevision] = useState(0);
  const [realtimePointer, setRealtimePointer] = useState<RuntimeRealtimePointer | null>(null);
  const [protectionEnabled, setProtectionEnabled] = useState(
    navigationState?.protection ?? false,
  );
  const [protectionOpacityPercent, setProtectionOpacityPercent] = useState(70);
  const [protectionPrecision, setProtectionPrecision] =
    useState<RuntimeProtectionMapPrecision>(RUNTIME_PROTECTION_MAP_MIN_PRECISION);
  const [protectionRenderedPrecision, setProtectionRenderedPrecision] = useState(0);
  const [protectionSampleProgress, setProtectionSampleProgress] = useState({
    completed: 0,
    total: 0,
  });
  useEffect(() => {
    if (duelTarget) return;
    const applyNumberedCameraView = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) return;
      const preset = RUNTIME_VIEWER_CAMERA_VIEWS.find(
        ({ shortcut }) => shortcut === event.key,
      );
      if (!preset || !applyCameraViewPresetRef.current) return;
      event.preventDefault();
      applyCameraViewPresetRef.current(preset.id);
    };
    document.addEventListener("keydown", applyNumberedCameraView, true);
    return () => document.removeEventListener("keydown", applyNumberedCameraView, true);
  }, [duelTarget]);
  const requestGlobalAttackLibrary = useCallback(() => {
    if (!allowGlobalAttackSources) return;
    setGlobalAttackLibraryState("loading");
    const request = globalAttackLibraryRequestRef.current ??
      import("./runtime-probe-weapon-labels")
        .then((library) => library as RuntimeAttackSourceLibrary);
    globalAttackLibraryRequestRef.current = request;
    void request
      .then((library) => {
        setAttackLibrary(library);
        setAttackLibraryError(null);
        setGlobalAttackLibraryState("ready");
      })
      .catch((error: unknown) => {
        globalAttackLibraryRequestRef.current = null;
        setAttackLibraryError(
          error instanceof Error ? error.message : String(error),
        );
        setGlobalAttackLibraryState("error");
      });
  }, [allowGlobalAttackSources]);

  const loadIndexedAttackLibrary = useCallback(async (attackerId: string) => {
    const index = await loadWikiVehicleWeaponRuntimeIndex() as WikiWeaponRuntimeIndexDocument;
    const resolved = resolveRuntimeAttackSourceIndexEntry(index, attackerId);
    if (!resolved) return null;
    const document = await loadWikiVehicleWeaponRuntimeSource(
      resolved.entry.cardId,
    ) as WikiWeaponRuntimeSourceDocument;
    return createRuntimeAttackSourceLibrary(
      document,
      resolved.presentation,
    );
  }, []);

  useEffect(() => {
    let active = true;
    setAttackLibrary(null);
    setAttackLibraryError(null);
    setEquipmentResolver(null);
    setGlobalAttackLibraryState("idle");
    if (attackLibraryOverride) {
      setAttackLibrary(attackLibraryOverride);
      setAttackLibraryError(null);
      setGlobalAttackLibraryState("ready");
      return () => {
        active = false;
      };
    }
    void loadWikiVehicleWeaponRuntimeSource(preview.cardId)
      .then((value) => {
        if (!active) return;
        const document = value as WikiWeaponRuntimeSourceDocument;
        const fallbackGroupId = document.source.factionIds[0] ?? "wiki";
        const presentation = attackSourcePresentation ?? {
          cardId: preview.cardId,
          displayName,
          groupId: fallbackGroupId,
          groupName: fallbackGroupId,
          groupOrder: Number.MAX_SAFE_INTEGER,
          type: document.source.types[0] ?? "载具",
          canonicalRawName: preview.variantRawName,
        };
        const library = createRuntimeAttackSourceLibrary(
          document,
          presentation,
        );
        setAttackLibrary(library);
        setEquipmentResolver(() =>
          createRuntimeStationEquipmentResolver(document),
        );
        setAttackLibraryError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAttackLibraryError(
          error instanceof Error ? error.message : String(error),
        );
      });
    return () => {
      active = false;
    };
  }, [
    attackLibraryOverride,
    attackSourcePresentation,
    displayName,
    loadIndexedAttackLibrary,
    preview.cardId,
    preview.variantRawName,
    requestGlobalAttackLibrary,
  ]);
  useEffect(() => {
    const requestedAttacker = navigationState?.attacker ?? "";
    if (
      !requestedAttacker ||
      !attackLibrary ||
      attackLibrary.runtimeAttackSourceForId(requestedAttacker)
    ) return;
    if (globalAttackLibraryState === "loading") return;
    if (
      allowGlobalAttackSources &&
      globalAttackLibraryState === "ready"
    ) {
      setAttackLibraryError("请求的武器来源不在当前目录中");
      return;
    }
    let active = true;
    void loadIndexedAttackLibrary(requestedAttacker)
      .then((indexedLibrary) => {
        if (!active) return;
        if (indexedLibrary) {
          setAttackLibrary(indexedLibrary);
          setAttackLibraryError(null);
          setGlobalAttackLibraryState("ready");
          return;
        }
        if (allowGlobalAttackSources) {
          requestGlobalAttackLibrary();
          return;
        }
        setAttackLibraryError("当前载具武器配置不可用");
        setGlobalAttackLibraryState("error");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (allowGlobalAttackSources) {
          requestGlobalAttackLibrary();
          return;
        }
        setAttackLibraryError(
          error instanceof Error ? error.message : String(error),
        );
        setGlobalAttackLibraryState("error");
      });
    return () => {
      active = false;
    };
  }, [
    allowGlobalAttackSources,
    attackLibrary,
    globalAttackLibraryState,
    loadIndexedAttackLibrary,
    navigationState?.attacker,
    requestGlobalAttackLibrary,
  ]);
  const attackSource = attackLibrary?.runtimeAttackSourceForId(attackSourceCardId) ?? null;
  const weaponOptions = useMemo(
    () => attackSource?.weapons.map((_, optionIndex) => optionIndex) ?? [],
    [attackSource],
  );
  const displayedWeaponOptionIndex =
    attackSource &&
    pendingAttackWeaponSelection?.sourceCardId === attackSource.cardId &&
    attackSource.weapons[pendingAttackWeaponSelection.optionIndex]
      ? pendingAttackWeaponSelection.optionIndex
      : attackSource &&
          loadedAttackSourceCardId === attackSource.cardId &&
          weaponOptionIndex >= 0
        ? weaponOptionIndex
        : attackSource
          ? defaultAttackWeaponOptionIndex(attackSource)
          : -1;
  const selectedAttackWeapon = weaponOptionIndex >= 0
    ? attackSource?.weapons[weaponOptionIndex] ?? null
    : null;
  const selectedWeaponBallistics = useMemo(() => {
    if (!selectedAttackWeapon) return null;
    return resolveEditorNativeBallistics(
      selectedAttackWeapon.ballisticsModel,
      selectedAttackWeapon.ballisticsWeaponIndex,
      targetDistanceM,
    );
  }, [selectedAttackWeapon, targetDistanceM]);
  const selectedWeaponHasExplosion =
    (selectedWeaponBallistics?.explosiveLayers.length ?? 0) > 0;
  useEffect(() => {
    selectedWeaponHasExplosionRef.current = selectedWeaponHasExplosion;
    if (!selectedWeaponHasExplosion) pendingExplosionPlacementRef.current = null;
    const host = hostRef.current;
    if (host) {
      host.dataset.explosionOriginPlacement = selectedWeaponHasExplosion
        ? "available"
        : "unavailable";
    }
    refreshExplosionPlacementPreviewRef.current?.();
    requestRenderRef.current?.();
  }, [selectedWeaponHasExplosion]);
  useEffect(() => {
    if (!selectedAttackWeapon || activeShotId === null) {
      setWeaponDpsFacts(null);
      setWeaponDpsFactsState("idle");
      return;
    }
    let active = true;
    setWeaponDpsFactsState("loading");
    const request = sharedWeaponDpsFactsRequest ??
      loadWikiWeaponCatalog()
        .then((document) => weaponDpsWeaponsFromWikiDocument(document as Record<string, unknown>).weapons)
        .catch((error: unknown) => {
          sharedWeaponDpsFactsRequest = null;
          throw error;
        });
    sharedWeaponDpsFactsRequest = request;
    void request
      .then((candidates) => {
        if (!active) return;
        const exact = resolveWeaponDpsWeaponForRuntimeAssignment(candidates, {
          weaponAssignmentId: selectedAttackWeapon.weaponAssignmentId ?? null,
          sourceCardId: selectedAttackWeapon.sourceCardId,
          sourceRawName: selectedAttackWeapon.sourceRawName,
          weaponId: selectedAttackWeapon.weaponId,
        });
        if (!exact) {
          setWeaponDpsFacts(null);
          setWeaponDpsFactsState("unavailable");
          return;
        }
        setWeaponDpsFacts(exact);
        setWeaponDpsFactsState("ready");
      })
      .catch(() => {
        if (!active) return;
        setWeaponDpsFacts(null);
        setWeaponDpsFactsState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [activeShotId, selectedAttackWeapon]);
  const catalogCompletedWeaponCount = attackSource?.catalogCompletedWeaponCount ?? 0;
  const attackReady =
    attackState.kind === "ready" && loadedAttackSourceCardId === attackSource?.cardId;
  const verdict = shotVerdict(shotResult);
  const distanceControl = selectedAttackWeapon
    ? runtimeAttackDistanceControl(
        selectedAttackWeapon.ballisticsModel,
        selectedAttackWeapon.ballisticsWeaponIndex,
      )
    : null;
  const maxDistanceM = distanceControl?.maxDistanceM ?? 0;
  const protectionMapAvailable =
    hitState.kind === "ready" &&
    hitHeader !== null &&
    attackReady &&
    attackHeader !== null &&
    weaponIndex >= 0;
  const protectionActive = protectionEnabled && protectionMapAvailable;
  const physicalPoseActive = physicalPoseEnabled && chassisPose !== null;
  const relativeArmorScaleAvailable = Boolean(
    armorThicknessRange && armorThicknessRange.distinctThicknessCount > 1,
  );
  const relativeArmorScaleActive = relativeArmorScale && relativeArmorScaleAvailable;
  const armorThicknessLegendTicks = useMemo(
    () => relativeArmorScaleActive
      ? relativeArmorThicknessLegendTicks(armorThicknessRange)
      : ARMOR_THICKNESS_LEGEND_TICKS,
    [armorThicknessRange, relativeArmorScaleActive],
  );
  const runtimeWeaponOptions = useMemo<RuntimeWeaponOption[]>(
    () =>
      (attackLibrary?.runtimeAttackSources ?? [])
        .flatMap((source) =>
          source.weapons.flatMap((weapon, optionIndex) => {
            const selectorVariant = weapon.selectorVariant;
            if (selectorVariant?.selectorVisibility === "debug") return [];
            const sourceIdentity = runtimeWeaponSourceIdentity(source);
            const provenanceLabels = [
              ...new Set(
                (selectorVariant?.sourceLabels ?? [])
                  .map((label) => label.trim())
                  .filter(Boolean),
              ),
            ];
            const sourceSummary = sourceIdentity.label;
            const weaponLabel = weaponNameZh(
              selectorVariant?.label ?? weapon.displayNameZh,
            );
            const familyLabel = weaponNameZh(
              selectorVariant?.familyLabel ??
                weapon.explosiveCategoryLabel ??
                source.groupName,
            );
            const qualifier = weaponNameZh(
              selectorVariant?.qualifier ?? weapon.displayNameZh,
            );
            const label = selectorVariant
              ? selectorVariant.configurationKeys.length > 0 &&
                sourceSummary
                ? `${qualifier} · ${sourceSummary}`
                : sourceSummary || qualifier
              : sourceSummary;
            const triggerLabel = sourceSummary
              ? `${weaponLabel} · ${sourceSummary}`
              : weaponLabel;
            return [
              {
                value: weaponSelectionValue(source.cardId, optionIndex),
                familyId:
                  selectorVariant?.familyId ??
                  `runtime-family::${normalizeWeaponQuery(familyLabel)}`,
                label: label || weaponLabel,
                triggerLabel,
                weaponLabel,
                source: sourceIdentity,
                provenanceLabels,
                group: familyLabel,
                effectsAtDistance: (distanceM: number) => selectorWeaponEffects(
                  weapon.directFireRoute,
                  resolveEditorNativeBallistics(
                    weapon.ballisticsModel,
                    weapon.ballisticsWeaponIndex,
                    distanceM,
                  ),
                ),
                searchText: [
                  weapon.displayNameEnglish,
                  weapon.gunName,
                  weapon.projectileName ?? "",
                  weapon.runtimeAssetPath ?? "",
                  weapon.sourceCardId,
                  weapon.sourceRawName,
                  ...(weapon.searchAliases ?? []),
                  source.displayName,
                  source.groupName,
                  source.groupId,
                  ...source.types,
                  selectorVariant?.searchText ?? "",
                  selectorVariant?.displayLabel ?? "",
                  selectorVariant?.qualifier ?? "",
                  ...(selectorVariant?.sourceLabels ?? []),
                  ...(selectorVariant?.factionIds ?? []),
                ].join(" "),
              },
            ];
          }),
        )
        .sort(
          (left, right) =>
            left.group.localeCompare(right.group, "zh-CN", {
              numeric: true,
              sensitivity: "base",
            }) ||
            left.label.localeCompare(right.label, "zh-CN", {
              numeric: true,
              sensitivity: "base",
            }) ||
            left.value.localeCompare(right.value),
        ),
    [attackLibrary],
  );
  const quickDistanceTicks = useMemo(() => distanceTicks(maxDistanceM), [maxDistanceM]);
  const sharedShotToken = useMemo(() => {
    if (savedShots.length === 0) return "";
    const activeIndex = savedShots.findIndex((shot) => shot.shotId === activeShotId);
    try {
      return encodeSharedShotPaths(
        savedShots.map((shot) => ({
          entryPoint: shot.entryPoint,
          direction: shot.direction,
          distanceM: shot.distanceM,
        })),
        activeIndex < 0 ? savedShots.length - 1 : activeIndex,
      );
    } catch {
      return "";
    }
  }, [activeShotId, savedShots]);

  const updateHostShotState = useCallback((result: EditorNativeShotResult | null) => {
    const host = hostRef.current;
    if (!host) return;
    if (!result) {
      delete host.dataset.hitResolution;
      delete host.dataset.hitStoppedAtLayer;
      delete host.dataset.hitDamagePools;
      delete host.dataset.hitTerminalDistanceFromFirstHitM;
      delete host.dataset.hitRadialState;
      delete host.dataset.hitExplosionLayerCount;
      delete host.dataset.hitExplosionOrder;
      delete host.dataset.hitExplosionInnerRadiiM;
      delete host.dataset.hitExplosionOuterRadiiM;
      delete host.dataset.hitExplosionDamageTypeKinds;
      delete host.dataset.hitExplosionColors;
      delete host.dataset.shotExplosionIndicator;
      delete host.dataset.shotExplosionIconSource;
      delete host.dataset.shotExplosionVisualClip;
      delete host.dataset.shotExplosionSurfaceHemisphere;
      delete host.dataset.shotExplosionLegendPlacement;
      delete host.dataset.shotDirectTraceState;
      delete host.dataset.shotHoveredSurfaceState;
      delete host.dataset.shotExplosionLegendRadiusPresentation;
      delete host.dataset.shotExplosionLegendScale;
      delete host.dataset.shotExplosionExpansionDurationMs;
      delete host.dataset.shotExplosionFadeDurationMs;
      delete host.dataset.shotExplosionRadiusBasis;
      delete host.dataset.shotExplosionRadiusPresentation;
      delete host.dataset.shotExplosionSurfaceLifecycle;
      delete host.dataset.shotExplosionExactRadiusReference;
      delete host.dataset.shotExplosionNativeField;
      delete host.dataset.shotExplosionOriginComponent;
      delete host.dataset.shotExplosionOutcomeState;
      delete host.dataset.shotExplosionResolvedPools;
      delete host.dataset.shotExplosionSettledComponents;
      delete host.dataset.shotExplosionTargetSelection;
      delete host.dataset.shotExplosionHighlightState;
      delete host.dataset.shotExplosionHighlightedComponents;
      delete host.dataset.shotExplosionOriginMode;
      delete host.dataset.shotExplosionOriginWorldM;
      return;
    }
    const radialVisualization = buildRadialDamageVisualizationPlan(
      result,
      parsedHitRef.current?.header.components ?? [],
    );
    host.dataset.hitResolution = result.resolution;
    host.dataset.shotDirectTraceState = shotResultRendersDirectTrace(result)
      ? "visible"
      : "radial-only-hidden";
    host.dataset.hitStoppedAtLayer = result.stoppedAtLayer === null
      ? "none"
      : String(result.stoppedAtLayer);
    host.dataset.hitDamagePools = String(result.damage.length);
    host.dataset.hitTerminalDistanceFromFirstHitM = String(
      shotTerminalDistanceFromFirstHitM(result),
    );
    host.dataset.hitRadialState = result.radial.state;
    host.dataset.hitExplosionLayerCount = String(result.radial.layers.length);
    host.dataset.hitExplosionOrder = result.radial.order ?? "none";
    host.dataset.hitExplosionInnerRadiiM = radialVisualization
      ? radialVisualization.layers.map((layer) => String(layer.innerRadiusM)).join(",")
      : "none";
    host.dataset.hitExplosionOuterRadiiM = result.radial.layers.length > 0
      ? result.radial.layers.map((radialLayer) => {
          const ballisticsLayer = result.ballistics.explosiveLayers.find(
            (layer) => layer.layerId === radialLayer.layerId,
          );
          return ballisticsLayer
            ? String(ballisticsLayer.outerRadiusCm / 100)
            : "unknown";
        }).join(",")
      : "none";
    const explosionDamageTypeKinds = result.radial.layers.map(
      (radialLayer) =>
        vehicleDamageTypeIconKindForPath(radialLayer.damageTypePath)
        ?? "generic",
    );
    host.dataset.hitExplosionDamageTypeKinds =
      explosionDamageTypeKinds.length > 0
        ? explosionDamageTypeKinds.join(",")
        : "none";
    host.dataset.hitExplosionColors =
      explosionDamageTypeKinds.length > 0
        ? explosionDamageTypeKinds
            .map(vehicleDamageTypeIconColor)
            .join(",")
        : "none";
    host.dataset.shotExplosionIndicator =
      radialVisualization
        ? radialVisualization.geometry
        : "none";
    host.dataset.shotExplosionIconSource =
      result.radial.layers.length > 0
        ? "damage-type-legend-svg-paths"
        : "none";
    host.dataset.shotExplosionVisualClip =
      radialVisualization?.visualClip ?? "none";
    host.dataset.shotExplosionSurfaceHemisphere =
      radialVisualization?.surfaceHemisphere ?? "none";
    host.dataset.shotExplosionLegendPlacement =
      radialVisualization?.legendPlacement ?? "none";
    host.dataset.shotExplosionLegendRadiusPresentation = radialVisualization
      ? "exact-outer-ring"
      : "none";
    host.dataset.shotExplosionLegendScale = radialVisualization
      ? "camera-distance-proportional"
      : "none";
    host.dataset.shotExplosionExpansionDurationMs = radialVisualization
      ? String(SHOT_EXPLOSION_EXPANSION_DURATION_MS)
      : "none";
    host.dataset.shotExplosionFadeDurationMs = radialVisualization
      ? String(SHOT_EXPLOSION_FADE_DURATION_MS)
      : "none";
    host.dataset.shotExplosionRadiusBasis =
      radialVisualization
        ? "outer-radius-true-scale-surface-and-ring"
        : "none";
    host.dataset.shotExplosionRadiusPresentation =
      radialVisualization?.radiusPresentation ?? "none";
    host.dataset.shotExplosionSurfaceLifecycle = radialVisualization
      ? "true-scale-expand-fade-to-ring"
      : "none";
    host.dataset.shotExplosionExactRadiusReference =
      radialVisualization?.exactRadiusReference ?? "none";
    host.dataset.shotExplosionNativeField =
      radialVisualization
        ? radialVisualization.componentFanout === "drivetrain-resolved"
          ? "native-component-hit-multiset"
          : radialVisualization.componentFanout === "vehicle-radial-disabled"
            ? "vehicle-radial-disabled"
            : "native-component-hit-multiset-required"
        : "none";
    host.dataset.shotExplosionOriginComponent = radialVisualization
      ? String(radialVisualization.origin.componentIndex)
      : "none";
    host.dataset.shotExplosionOutcomeState =
      radialVisualization?.outcomeState ?? "none";
    host.dataset.shotExplosionResolvedPools = radialVisualization
      ? radialVisualization.outcomes.map((outcome) => outcome.poolId).join(",") || "none"
      : "none";
    host.dataset.shotExplosionSettledComponents = radialVisualization
      ? [...new Set(
          radialVisualization.outcomes.flatMap(
            (outcome) => outcome.componentIndices,
          ),
        )].join(",") || "none"
      : "none";
    host.dataset.shotExplosionTargetSelection =
      radialVisualization?.targetSelection ?? "none";
  }, []);

  const applySettledShotDamageHighlight = useCallback(
    (shotId: number | null) => {
      const model = hitModelRef.current;
      const host = hostRef.current;
      const selectedRecord = shotId === null
        ? null
        : shotRecordsRef.current.find((record) => record.shotId === shotId)
          ?? null;
      const highlight = selectedRecord
        ? settledShotExplosionDamageHighlight(selectedRecord)
        : null;
      if (model && highlight) {
        setHitSceneThreeModelDamageHighlight(model, highlight);
      } else if (model) {
        clearHitSceneThreeModelDamageHighlight(model);
      }
      if (host) {
        host.dataset.shotExplosionHighlightState = highlight
          ? "settled"
          : "none";
        host.dataset.shotExplosionHighlightedComponents = highlight
          ? highlight.componentIndices.join(",")
          : "none";
      }
    },
    [],
  );

  const selectShotVisual = useCallback((shotId: number | null) => {
    shotRecordsRef.current.forEach((record) => {
      const active = record.shotId === shotId;
      record.visual.selected = active;
      record.visual.trace.material.opacity = active ? record.visual.traceOpacity : 0.32;
      record.visual.traceOutline.visible = active && record.visual.group.visible;
      record.visual.continuationTrace.material.opacity = active ? 0.72 : 0.28;
      record.visual.continuationArrow.material.opacity = active ? 0.72 : 0.28;
      record.visual.entryMarker.material.transparent = true;
      record.visual.entryMarker.material.opacity = active ? 1 : 0.42;
      record.visual.terminalMarkerMaterial.opacity = active ? 0.92 : 0.38;
      record.visual.terminalMarker.visible = record.visual.terminalVisible;
      record.visual.layerMarkers.forEach((marker) => {
        marker.visibilityOpacity = active ? 1 : 0.42;
        marker.sphere.material.opacity =
          marker.fillOpacity * marker.visibilityOpacity;
        marker.label.material.opacity = active ? 1 : 0.46;
      });
      if (!record.visual.animationActive) {
        record.visual.explosionLayers.forEach((layer) => {
          settleShotExplosionLayerVisual(layer, active);
        });
      }
    });
    applySettledShotDamageHighlight(shotId);
  }, [applySettledShotDamageHighlight]);

  const applyShotResultToVisual = useCallback((
    record: RuntimeShotRecord,
    result: EditorNativeShotResult,
  ) => {
    const shotVisual = record.visual;
    if (!shotVisual.rayOrigin || !shotVisual.rayDirection) {
      shotVisual.group.visible = false;
      shotVisual.animationLayout = null;
      shotVisual.explosionLayers.forEach(clearShotExplosionLayerVisual);
      return;
    }
    const detachedOrigin = record.radialOriginOverrideM
      ? new THREE.Vector3().fromArray(record.radialOriginOverrideM)
      : null;
    const rendersDirectTrace = shotResultRendersDirectTrace(result);
    if (result.layers.length === 0) {
      if (!detachedOrigin || result.ballistics.explosiveLayers.length === 0) {
        shotVisual.group.visible = false;
        shotVisual.animationLayout = null;
        shotVisual.explosionLayers.forEach(clearShotExplosionLayerVisual);
        return;
      }
      shotVisual.trace.visible = false;
      shotVisual.traceOutline.visible = false;
      shotVisual.continuationTrace.visible = false;
      shotVisual.continuationArrow.visible = false;
      shotVisual.entryMarker.visible = false;
      shotVisual.terminalVisible = false;
      shotVisual.terminalMarker.visible = false;
      shotVisual.layerMarkers.forEach((marker) => {
        marker.sphere.visible = false;
      });
      shotVisual.animationActive = false;
      shotVisual.animationLayout = null;
      const radialVisualization = buildRadialDamageVisualizationPlan(
        result,
        parsedHitRef.current?.header.components ?? [],
      );
      shotVisual.explosionLayers.forEach((visual, layerIndex) => {
        const ballisticsLayer = result.ballistics.explosiveLayers[layerIndex];
        if (!ballisticsLayer) {
          clearShotExplosionLayerVisual(visual);
          return;
        }
        const damageTypeIconKind =
          vehicleDamageTypeIconKindForPath(ballisticsLayer.damageTypePath)
          ?? "generic";
        configureShotExplosionLayerVisual(visual, {
          origin: detachedOrigin,
          normal: new THREE.Vector3(0, 1, 0),
          color: shotExplosionColor(damageTypeIconKind),
          damageTypeIconKind,
          outerRadiusM: ballisticsLayer.outerRadiusCm / 100,
          innerRadiusM: ballisticsLayer.innerRadiusCm / 100,
          delayMs: 0,
          layerId: ballisticsLayer.layerId,
          damageTypePath: ballisticsLayer.damageTypePath,
          settledComponentIndices: radialVisualization?.outcomes
            .filter((outcome) => outcome.radialLayerId === ballisticsLayer.layerId)
            .flatMap((outcome) => outcome.componentIndices) ?? [],
          originComponentLabel: "自由爆心",
          originOffsetM: 0,
        });
      });
      shotVisual.group.visible = true;
      shotVisual.explosionLayers.forEach((layer) => {
        settleShotExplosionLayerVisual(layer, shotVisual.selected);
      });
      return;
    }
    const ingressLength = Math.min(1.25, Math.max(0.45, shotVisual.firstHitDistanceM * 0.08));
    const start = shotVisual.rayOrigin.clone().addScaledVector(
      shotVisual.rayDirection,
      shotVisual.firstHitDistanceM - ingressLength,
    );
    const terminalDistanceFromFirstHitM =
      shotTerminalDistanceFromFirstHitM(result);
    const lastVehicleIntersectionDistanceFromFirstHitM = Math.max(
      0,
      ...record.intersections.map(
        (intersection) =>
          intersection.distanceFromRayOriginM - shotVisual.firstHitDistanceM,
      ),
    );
    const omittedDistanceM =
      terminalDistanceFromFirstHitM
      - lastVehicleIntersectionDistanceFromFirstHitM;
    const omitContinuation =
      result.stoppedAtLayer === null && omittedDistanceM > 0.2;
    const traceEndsInsideVehicle =
      result.stoppedAtLayer === null
      && terminalDistanceFromFirstHitM
        <= lastVehicleIntersectionDistanceFromFirstHitM + 0.01;
    const solidEndDistanceFromFirstHitM = omitContinuation
      ? lastVehicleIntersectionDistanceFromFirstHitM
      : terminalDistanceFromFirstHitM;
    const end = shotVisual.rayOrigin.clone().addScaledVector(
      shotVisual.rayDirection,
      shotVisual.firstHitDistanceM + solidEndDistanceFromFirstHitM,
    );
    const traceDirection = end.clone().sub(start);
    const traceLength = traceDirection.length();
    if (traceLength < 0.001) {
      shotVisual.group.visible = false;
      return;
    }
    const traceRotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      traceDirection.normalize(),
    );

    const continuationStart = end.clone();
    const continuationEnd = shotVisual.rayOrigin.clone().addScaledVector(
      shotVisual.rayDirection,
      shotVisual.firstHitDistanceM
        + lastVehicleIntersectionDistanceFromFirstHitM
        + Math.min(1.4, omittedDistanceM),
    );
    shotVisual.continuationTrace.geometry.setFromPoints([
      continuationStart,
      continuationEnd,
    ]);
    shotVisual.continuationTrace.computeLineDistances();
    shotVisual.continuationArrow.position.copy(continuationEnd);
    shotVisual.continuationArrow.quaternion.copy(traceRotation);

    const hitScene = parsedHitRef.current;
    const traceKind = shotTraceMarkerKind(result, hitScene);
    const traceStyle = resolveShotPathMarkerStyle(traceKind);
    shotVisual.trace.material.color.set(traceStyle.stroke);
    shotVisual.traceOutline.material.color.set(
      opaqueShotPathMarkerColor(traceStyle.glow),
    );
    shotVisual.continuationTrace.material.color.set(traceStyle.stroke);
    shotVisual.continuationArrow.material.color.set(traceStyle.stroke);
    shotVisual.traceOpacity = 0.92;
    shotVisual.selected = activeShotIdRef.current === record.shotId;
    shotVisual.trace.material.opacity =
      shotVisual.selected ? shotVisual.traceOpacity : 0.32;
    shotVisual.entryMarker.position.copy(
      shotVisual.rayOrigin.clone().addScaledVector(
        shotVisual.rayDirection,
        shotVisual.firstHitDistanceM,
      ),
    );
    shotVisual.entryMarker.material.color.set(traceStyle.stroke);
    const layerMarkerProgress: number[] = [];
    shotVisual.layerMarkers.forEach((marker, index) => {
      const layer = result.layers[index];
      if (!layer) {
        marker.sphere.visible = false;
        return;
      }
      const markerKind = editorPathMarkerKind(
        hitScene?.header ?? null,
        hitScene?.header.components[layer.componentIndex],
        hitScene?.header.surfaceProfiles[layer.surfaceProfileIndex],
        layer.penetrated,
      );
      paintShotPathMarker(marker, index + 1, markerKind);
      marker.sphere.position.copy(
        shotVisual.rayOrigin!.clone().addScaledVector(
          shotVisual.rayDirection!,
          shotVisual.firstHitDistanceM + layer.distanceFromFirstHitM,
        ),
      );
      layerMarkerProgress[index] = THREE.MathUtils.clamp(
        (
          ingressLength
          + Math.max(0, layer.distanceFromFirstHitM)
        ) / traceLength,
        0,
        1,
      );
    });
    shotVisual.terminalMarker.position.copy(
      shotVisual.rayOrigin.clone().addScaledVector(
        shotVisual.rayDirection,
        shotVisual.firstHitDistanceM + terminalDistanceFromFirstHitM,
      ),
    );
    shotVisual.terminalMarker.quaternion.copy(traceRotation);
    shotVisual.terminalMarkerMaterial.color.set(traceStyle.stroke);
    shotVisual.terminalMarker.scale.setScalar(
      traceEndsInsideVehicle ? 1.45 : 1,
    );
    shotVisual.terminalVisible = !omitContinuation;
    shotVisual.animationActive = false;
    shotVisual.animationLayout = {
      traceStart: start,
      traceEnd: end,
      continuationStart,
      continuationEnd,
      traceRotation,
      traceLengthM: traceLength,
      continuationLengthM: omitContinuation
        ? continuationEnd.distanceTo(continuationStart)
        : 0,
      firstImpactProgress: THREE.MathUtils.clamp(
        ingressLength / traceLength,
        0,
        1,
      ),
      layerMarkerProgress,
      traceDurationMs: THREE.MathUtils.clamp(
        SHOT_TRACE_MIN_DURATION_MS + traceLength * 45,
        SHOT_TRACE_MIN_DURATION_MS,
        SHOT_TRACE_MAX_DURATION_MS,
      ),
      continuationDurationMs: omitContinuation
        ? SHOT_CONTINUATION_DURATION_MS
        : 0,
    };

    const radialVisualization = buildRadialDamageVisualizationPlan(
      result,
      parsedHitRef.current?.header.components ?? [],
    );
    const firstLayer = result.layers[0];
    const firstImpact = record.intersections.find((intersection) =>
      intersection.componentIndex === firstLayer.componentIndex
      && intersection.surfaceProfileIndex === firstLayer.surfaceProfileIndex
      && intersection.triangleIndex === firstLayer.triangleIndex
    ) ?? record.intersections[0];
    const impactPoint = new THREE.Vector3().fromArray(firstImpact.point);
    const impactNormal = new THREE.Vector3().fromArray(firstImpact.faceNormal);
    if (impactNormal.lengthSq() < 0.000001) {
      impactNormal.copy(shotVisual.rayDirection).multiplyScalar(-1);
    } else {
      impactNormal.normalize();
    }
    shotVisual.explosionLayers.forEach((visual, layerIndex) => {
      const ballisticsLayer = result.ballistics.explosiveLayers[layerIndex];
      if (!ballisticsLayer) {
        clearShotExplosionLayerVisual(visual);
        return;
      }
      const radialLayer = result.radial.layers.find(
        (layer) => layer.layerId === ballisticsLayer.layerId,
      );
      const originOffsetM = (
        radialLayer?.explosionOriginOffsetCm
        ?? ballisticsLayer.impactNormalOffsetCm
      ) / 100;
      const origin = impactPoint.clone().addScaledVector(
        impactNormal,
        originOffsetM,
      );
      const damageTypeIconKind =
        vehicleDamageTypeIconKindForPath(ballisticsLayer.damageTypePath)
        ?? "generic";
      configureShotExplosionLayerVisual(visual, {
        origin,
        normal: impactNormal,
        color: shotExplosionColor(damageTypeIconKind),
        damageTypeIconKind,
        outerRadiusM: ballisticsLayer.outerRadiusCm / 100,
        innerRadiusM: ballisticsLayer.innerRadiusCm / 100,
        delayMs: result.radial.layerOrderResolved === true
          ? layerIndex * SHOT_EXPLOSION_LAYER_DELAY_MS
          : 0,
        layerId: ballisticsLayer.layerId,
        damageTypePath: ballisticsLayer.damageTypePath,
        settledComponentIndices: radialVisualization?.outcomes
          .filter((outcome) => outcome.radialLayerId === ballisticsLayer.layerId)
          .flatMap((outcome) => outcome.componentIndices) ?? [],
        originComponentLabel: playerHitComponentLabel(
          parsedHitRef.current?.header.components[firstLayer.componentIndex]
          ?? firstLayer,
        ),
        originOffsetM,
      });
    });
    if (!rendersDirectTrace) {
      shotVisual.trace.visible = false;
      shotVisual.traceOutline.visible = false;
      shotVisual.continuationTrace.visible = false;
      shotVisual.continuationArrow.visible = false;
      shotVisual.entryMarker.visible = false;
      shotVisual.terminalVisible = false;
      shotVisual.terminalMarker.visible = false;
      shotVisual.layerMarkers.forEach((marker) => {
        marker.sphere.visible = false;
      });
      shotVisual.animationActive = false;
      shotVisual.animationLayout = null;
    }
    shotVisual.group.visible = true;
    setShotTraceAnimationProgress(shotVisual, 1, 1);
    shotVisual.explosionLayers.forEach((layer) => {
      settleShotExplosionLayerVisual(layer, shotVisual.selected);
    });
  }, []);

  const savedShotSnapshot = useCallback(() => shotRecordsRef.current.map((record) => ({
    shotId: record.shotId,
    distanceM: record.distanceM,
    result: record.result,
    entryPoint: record.entryPoint,
    direction: record.direction,
    radialOriginOverrideM: record.radialOriginOverrideM,
  } satisfies SavedRuntimeShot)), []);

  const commitSelectedShot = useCallback((record: RuntimeShotRecord) => {
    activeShotIdRef.current = record.shotId;
    setActiveShotId(record.shotId);
    setShotResult(record.result);
    setDamageAnimationRevision((revision) => revision + 1);
    selectShotVisual(record.shotId);
    const firstLayer = record.result.layers[0];
    const rendersDirectTrace = shotResultRendersDirectTrace(record.result);
    if (hitModelRef.current) {
      setHitSceneThreeModelHoveredProfile(
        hitModelRef.current,
        rendersDirectTrace ? firstLayer?.surfaceProfileIndex ?? null : null,
      );
    }
    updateHostShotState(record.result);
    const host = hostRef.current;
    if (host) {
      host.dataset.shotHoveredSurfaceState = rendersDirectTrace
        ? "direct"
        : "radial-only-cleared";
      host.dataset.shotExplosionOriginMode = record.radialOriginOverrideM
        ? "detached"
        : "contact";
      if (record.radialOriginOverrideM) {
        host.dataset.shotExplosionOriginWorldM =
          record.radialOriginOverrideM.join(",");
      } else {
        delete host.dataset.shotExplosionOriginWorldM;
      }
    }
  }, [selectShotVisual, updateHostShotState]);

  const cancelShotAnimation = useCallback((settle: boolean) => {
    if (shotAnimationFrameRef.current !== 0) {
      cancelAnimationFrame(shotAnimationFrameRef.current);
      shotAnimationFrameRef.current = 0;
    }
    const animatedShotId = animatedShotIdRef.current;
    animatedShotIdRef.current = null;
    const animatedRecord = animatedShotId === null
      ? null
      : shotRecordsRef.current.find(
          (record) => record.shotId === animatedShotId,
        ) ?? null;
    if (animatedRecord) {
      animatedRecord.visual.animationActive = false;
      if (settle) {
        setShotTraceAnimationProgress(animatedRecord.visual, 1, 1);
        animatedRecord.visual.explosionLayers.forEach((layer) => {
          settleShotExplosionLayerVisual(
            layer,
            animatedRecord.visual.selected,
          );
        });
      }
    }
    applySettledShotDamageHighlight(
      settle ? activeShotIdRef.current : null,
    );
    const host = hostRef.current;
    if (host) {
      if (settle && animatedRecord) {
        host.dataset.shotAnimationState = "settled";
      } else {
        delete host.dataset.shotAnimationState;
        delete host.dataset.shotAnimationShotId;
        delete host.dataset.shotAnimationDurationMs;
      }
    }
    if (settle && animatedRecord) renderRef.current?.();
  }, [applySettledShotDamageHighlight]);

  const startShotAnimation = useCallback((record: RuntimeShotRecord) => {
    cancelShotAnimation(true);
    const layout = record.visual.animationLayout;
    if (!layout) return;
    const host = hostRef.current;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches ?? false;
    if (reducedMotion) {
      record.visual.animationActive = false;
      setShotTraceAnimationProgress(record.visual, 1, 1);
      record.visual.explosionLayers.forEach((layer) => {
        settleShotExplosionLayerVisual(layer, record.visual.selected);
      });
      applySettledShotDamageHighlight(record.shotId);
      if (host) {
        host.dataset.shotAnimationState = "reduced-motion";
        host.dataset.shotAnimationShotId = String(record.shotId);
        host.dataset.shotAnimationDurationMs = "0";
      }
      renderRef.current?.();
      return;
    }

    const configuredExplosionLayers = record.visual.explosionLayers.filter(
      (layer) => layer.configured,
    );
    const impactAtMs = layout.traceDurationMs * layout.firstImpactProgress;
    const explosionEndMs = configuredExplosionLayers.length > 0
      ? impactAtMs
        + Math.max(...configuredExplosionLayers.map((layer) => layer.delayMs))
        + SHOT_EXPLOSION_DURATION_MS
      : 0;
    const traceEndMs =
      layout.traceDurationMs + layout.continuationDurationMs;
    const totalDurationMs = Math.max(traceEndMs, explosionEndMs);
    const startedAt = performance.now();
    record.visual.animationActive = true;
    animatedShotIdRef.current = record.shotId;
    setShotTraceAnimationProgress(record.visual, 0, 0);
    record.visual.explosionLayers.forEach((layer) => {
      layer.root.visible = false;
    });
    applySettledShotDamageHighlight(null);
    if (host) {
      host.dataset.shotAnimationState = "playing";
      host.dataset.shotAnimationShotId = String(record.shotId);
      host.dataset.shotAnimationDurationMs = String(
        Math.round(totalDurationMs),
      );
    }

    const animateShot = (timestamp: number) => {
      if (animatedShotIdRef.current !== record.shotId) return;
      const elapsedMs = Math.max(0, timestamp - startedAt);
      const solidProgress = layout.traceDurationMs > 0
        ? elapsedMs / layout.traceDurationMs
        : 1;
      const continuationProgress = layout.continuationDurationMs > 0
        ? (elapsedMs - layout.traceDurationMs)
          / layout.continuationDurationMs
        : 1;
      setShotTraceAnimationProgress(
        record.visual,
        solidProgress,
        continuationProgress,
      );
      const explosionElapsedMs = elapsedMs - impactAtMs;
      const highlightedComponentIndices = new Set<number>();
      let damageHighlightStrength = 0;
      let damageHighlightColor = shotExplosionColor("generic");
      record.visual.explosionLayers.forEach((layer) => {
        const layerHighlightStrength = setShotExplosionLayerAnimationFrame(
          layer,
          explosionElapsedMs,
          record.visual.selected,
        );
        if (layerHighlightStrength <= 0) return;
        layer.settledComponentIndices.forEach((componentIndex) => {
          highlightedComponentIndices.add(componentIndex);
        });
        if (layerHighlightStrength > damageHighlightStrength) {
          damageHighlightStrength = layerHighlightStrength;
          damageHighlightColor =
            layer.pressureSurface.material.uniforms.uColor.value.getHex();
        }
      });
      if (hitModelRef.current) {
        if (
          damageHighlightStrength > 0 &&
          highlightedComponentIndices.size > 0
        ) {
          setHitSceneThreeModelDamageHighlight(hitModelRef.current, {
            componentIndices: [...highlightedComponentIndices],
            colorHex: damageHighlightColor,
            strength: damageHighlightStrength,
          });
        } else {
          clearHitSceneThreeModelDamageHighlight(hitModelRef.current);
        }
      }
      if (host) {
        host.dataset.shotExplosionHighlightState =
          damageHighlightStrength > 0 ? "animating" : "pending";
        host.dataset.shotExplosionHighlightedComponents =
          highlightedComponentIndices.size > 0
            ? [...highlightedComponentIndices].join(",")
            : "none";
      }
      requestRenderRef.current?.();
      if (elapsedMs < totalDurationMs) {
        shotAnimationFrameRef.current = requestAnimationFrame(animateShot);
        return;
      }
      shotAnimationFrameRef.current = 0;
      animatedShotIdRef.current = null;
      record.visual.animationActive = false;
      setShotTraceAnimationProgress(record.visual, 1, 1);
      record.visual.explosionLayers.forEach((layer) => {
        settleShotExplosionLayerVisual(layer, record.visual.selected);
      });
      applySettledShotDamageHighlight(record.shotId);
      if (host) host.dataset.shotAnimationState = "settled";
      renderRef.current?.();
    };
    shotAnimationFrameRef.current = requestAnimationFrame(animateShot);
  }, [applySettledShotDamageHighlight, cancelShotAnimation]);

  const clearShotVisual = useCallback(() => {
    cancelShotAnimation(false);
    setShotResult(null);
    setSavedShots([]);
    setActiveShotId(null);
    activeShotIdRef.current = null;
    shotRecordsRef.current = [];
    shotVisualsRef.current.forEach((shotVisual) => {
      shotVisual.group.visible = false;
      shotVisual.rayOrigin = null;
      shotVisual.rayDirection = null;
      shotVisual.traceOutline.visible = false;
      shotVisual.continuationTrace.visible = false;
      shotVisual.continuationArrow.visible = false;
      shotVisual.terminalVisible = false;
      shotVisual.terminalMarker.visible = false;
      shotVisual.animationActive = false;
      shotVisual.animationLayout = null;
      shotVisual.layerMarkers.forEach((marker) => { marker.sphere.visible = false; });
      shotVisual.explosionLayers.forEach(clearShotExplosionLayerVisual);
    });
    if (hitModelRef.current) {
      setHitSceneThreeModelHoveredProfile(hitModelRef.current, null);
    }
    updateHostShotState(null);
    renderRef.current?.();
  }, [cancelShotAnimation, updateHostShotState]);

  useEffect(() => {
    if (!attackLibrary) return;
    const requested = attackLibrary.runtimeAttackSourceForId(
      navigationState?.attacker ?? "",
    );
    const preferred = requested ??
      attackLibrary.runtimeAttackSourceForId(preview.cardId) ??
      attackLibrary.runtimeAttackSources[0];
    if (preferred) setAttackSourceCardId(preferred.cardId);
  }, [attackLibrary, navigationState?.attacker, preview.cardId]);

  useEffect(() => {
    if (!attackLibrary) {
      if (attackLibraryError) {
        setAttackState({
          kind: "error",
          message: `武器选择器加载失败：${attackLibraryError}`,
        });
      } else {
        setAttackState({ kind: "loading" });
      }
      return;
    }
    const source = attackSource;
    setAttackState({ kind: "loading" });
    setLoadedAttackSourceCardId("");
    setAttackHeader(null);
    attackModelRef.current = null;
    setWeaponIndex(-1);
    setWeaponOptionIndex(-1);
    weaponIndexRef.current = -1;
    weaponOptionIndexRef.current = -1;
    clearShotVisual();
    if (!source) {
      setAttackState({ kind: "error", message: "没有可用的百科武器来源" });
      return;
    }
    const host = hostRef.current;
    if (host) {
      host.dataset.attackSourceCardId = source.cardId;
      host.dataset.attackSourceCanonicalRawName = source.canonicalRawName;
      host.dataset.attackSourceState = "loading";
    }
    try {
      for (const indexedWeapon of source.weapons) {
        const model = indexedWeapon.ballisticsModel;
        const modelWeapon = model?.weapons[indexedWeapon.ballisticsWeaponIndex];
        if (
          !modelWeapon ||
          modelWeapon.weaponId !== indexedWeapon.weaponId ||
          !attackLibrary.runtimeAttackWeaponSupportsHitAnalysis(indexedWeapon)
        ) {
          throw new Error(
            `攻击来源弹道索引不匹配：${source.cardId}/${indexedWeapon.ballisticsId}`,
          );
        }
      }
      const requestedNavigation = navigationStateRef.current;
      const navigationApplies =
        !requestedNavigation?.attacker ||
        runtimeAttackSourceMatchesId(source, requestedNavigation.attacker);
      const pendingSelection = pendingAttackWeaponSelectionRef.current;
      const pendingByIndex =
        pendingSelection?.sourceCardId === source.cardId &&
        source.weapons[pendingSelection.optionIndex]
          ? pendingSelection.optionIndex
          : -1;
      const defaultOptionIndex = defaultAttackWeaponOptionIndex(source);
      const requestedByIndex = navigationApplies &&
        requestedNavigation?.weaponIndex !== null &&
        requestedNavigation?.weaponIndex !== undefined &&
        source.weapons[requestedNavigation.weaponIndex]
        ? requestedNavigation.weaponIndex
        : -1;
      const requestedByName = navigationApplies && requestedNavigation?.weapon
        ? source.weapons.findIndex((indexedWeapon) => {
            const model = indexedWeapon.ballisticsModel;
            const modelWeapon = model?.weapons[indexedWeapon.ballisticsWeaponIndex];
            return requestedNavigation.weapon === modelWeapon?.weaponId ||
              requestedNavigation.weapon === indexedWeapon.runtimeAssetPath ||
              requestedNavigation.weapon === indexedWeapon.gunName ||
              requestedNavigation.weapon === indexedWeapon.displayNameZh ||
              requestedNavigation.weapon === indexedWeapon.displayNameEnglish;
          })
        : -1;
      const preferredOptionIndex = pendingByIndex >= 0
        ? pendingByIndex
        : requestedByIndex >= 0
          ? requestedByIndex
          : requestedByName >= 0
            ? requestedByName
            : defaultOptionIndex;
      const preferredWeapon = source.weapons[preferredOptionIndex];
      const preferredModel = preferredWeapon.ballisticsModel;
      if (!preferredModel) throw new Error(`攻击来源弹道未加载：${source.cardId}`);
      const preferredMaxDistance = runtimeAttackTargetDistanceLimitM(
        preferredModel,
        preferredWeapon.ballisticsWeaponIndex,
      );
      const requestedDistance = distancePreferenceRef.current;
      const initialDistance = preferredMaxDistance > 0
        ? Math.min(
            Math.max(0, requestedDistance),
            preferredMaxDistance,
          )
        : 0;
      attackModelRef.current = preferredModel;
      setAttackHeader(preferredModel);
      setAttackState({ kind: "ready" });
      setLoadedAttackSourceCardId(source.cardId);
      setWeaponIndex(preferredWeapon.ballisticsWeaponIndex);
      setWeaponOptionIndex(preferredOptionIndex);
      setTargetDistanceM(initialDistance);
      weaponIndexRef.current = preferredWeapon.ballisticsWeaponIndex;
      weaponOptionIndexRef.current = preferredOptionIndex;
      targetDistanceRef.current = initialDistance;
      if (pendingByIndex >= 0) {
        pendingAttackWeaponSelectionRef.current = null;
        setPendingAttackWeaponSelection(null);
      }
      if (host) {
        host.dataset.attackSourceState = "ready";
        host.dataset.attackSourceBallisticsId = preferredWeapon.ballisticsId;
      }
    } catch (error: unknown) {
      if (pendingAttackWeaponSelectionRef.current?.sourceCardId === source.cardId) {
        pendingAttackWeaponSelectionRef.current = null;
        setPendingAttackWeaponSelection(null);
      }
      const message = error instanceof Error ? error.message : String(error);
      setAttackState({ kind: "error", message });
      if (host) host.dataset.attackSourceState = "error";
    }
  }, [attackLibrary, attackLibraryError, attackSource, clearShotVisual]);

  const simulatePublishedRadialShot = useCallback((
    input: Parameters<typeof simulateEditorNativeShot>[0],
    radialOriginOverrideM: readonly [number, number, number] | null = null,
  ) => {
    let result = simulateEditorNativeShot(input);
    const source = radialQueryRef.current;
    const hitGroup = hitGroupRef.current;
    const firstImpact = input.intersections[0];
    const explicitOriginWorld = radialOriginOverrideM
      ? new THREE.Vector3().fromArray(radialOriginOverrideM)
      : null;
    let pointLocal: THREE.Vector3 | null = null;
    if (hitGroup && (explicitOriginWorld || firstImpact)) {
      hitGroup.updateMatrixWorld(true);
      const inverseWorld = hitGroup.matrixWorld.clone().invert();
      pointLocal = (explicitOriginWorld ?? new THREE.Vector3().fromArray(firstImpact.point))
        .clone()
        .applyMatrix4(inverseWorld);
      if (explicitOriginWorld) {
        result = simulateEditorNativeShot({
          ...input,
          intersections: [],
          radialOriginOverrideCm: pointLocal.toArray().map(
            (value) => value * 100,
          ) as [number, number, number],
        });
      }
    }
    if (
      !source ||
      !hitGroup ||
      !pointLocal ||
      (!firstImpact && !explicitOriginWorld) ||
      result.ballistics.explosiveLayers.length === 0
    ) return result;
    const inverseWorld = hitGroup.matrixWorld.clone().invert();
    const normalLocal = explicitOriginWorld
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3()
          .fromArray(firstImpact!.faceNormal)
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(inverseWorld))
          .normalize();
    const radialLayerHitSets = buildVehicleRadialLayerHitSets({
      source,
      model: input.model,
      impactPointM: pointLocal.toArray() as [number, number, number],
      impactNormal: normalLocal.toArray() as [number, number, number],
      layers: result.ballistics.explosiveLayers.map((layer) => ({
        layerId: layer.layerId,
        outerRadiusCm: layer.outerRadiusCm,
        killZoneRadiusCm: layer.killZoneRadiusCm,
        impactNormalOffsetCm: explicitOriginWorld
          ? 0
          : layer.impactNormalOffsetCm,
      })),
      componentPoseByModelIndex: radialQueryHitPoseRef.current,
    });
    result = simulateEditorNativeShot({
      ...input,
      intersections: explicitOriginWorld ? [] : input.intersections,
      radialOriginOverrideCm: explicitOriginWorld
        ? pointLocal.toArray().map((value) => value * 100) as [number, number, number]
        : null,
      radialLayerHitSets,
    });
    return result;
  }, []);

  const simulateCurrentShot = useCallback((nextWeaponIndex: number, nextDistanceM: number) => {
    const parsed = parsedHitRef.current;
    const weaponModel = attackModelRef.current;
    const activeRecord = shotRecordsRef.current.find(
      (record) => record.shotId === activeShotIdRef.current,
    );
    if (!parsed || !weaponModel || !activeRecord || nextWeaponIndex < 0) return;
    cancelShotAnimation(true);
    const simulationInput = {
      model: parsed.header,
      weaponModel,
      weaponIndex: nextWeaponIndex,
      targetDistanceM: nextDistanceM,
      shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
      intersections: activeRecord.intersections,
      includeRadial: true,
      vehicleDamagedByRadial: referenceData?.general.isDamagedByRadial ?? null,
      radialDamageModel: referenceData?.radialDamageModel ?? null,
    } satisfies Parameters<typeof simulateEditorNativeShot>[0];
    let result = simulatePublishedRadialShot(
      simulationInput,
      activeRecord.radialOriginOverrideM,
    );
    if (
      activeRecord.radialOriginOverrideM &&
      result.ballistics.explosiveLayers.length === 0
    ) {
      activeRecord.radialOriginOverrideM = null;
      result = simulatePublishedRadialShot(simulationInput, null);
    }
    activeRecord.distanceM = nextDistanceM;
    activeRecord.result = result;
    applyShotResultToVisual(activeRecord, result);
    setSavedShots(savedShotSnapshot());
    commitSelectedShot(activeRecord);
    renderRef.current?.();
  }, [
    applyShotResultToVisual,
    cancelShotAnimation,
    commitSelectedShot,
    referenceData,
    savedShotSnapshot,
    simulatePublishedRadialShot,
  ]);

  const setShotExplosionOrigin = useCallback((
    shotId: number,
    originM: [number, number, number] | null,
  ) => {
    const parsed = parsedHitRef.current;
    const weaponModel = attackModelRef.current;
    const selectedWeaponIndex = weaponIndexRef.current;
    const record = shotRecordsRef.current.find(
      (candidate) => candidate.shotId === shotId,
    );
    if (!parsed || !weaponModel || selectedWeaponIndex < 0 || !record) return;
    cancelShotAnimation(true);
    const result = simulatePublishedRadialShot({
      model: parsed.header,
      weaponModel,
      weaponIndex: selectedWeaponIndex,
      targetDistanceM: record.distanceM,
      shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
      intersections: record.intersections,
      includeRadial: true,
      vehicleDamagedByRadial: referenceData?.general.isDamagedByRadial ?? null,
      radialDamageModel: referenceData?.radialDamageModel ?? null,
    }, originM);
    if (originM && result.ballistics.explosiveLayers.length === 0) return;
    record.radialOriginOverrideM = originM;
    record.result = result;
    applyShotResultToVisual(record, result);
    setSavedShots(savedShotSnapshot());
    commitSelectedShot(record);
    renderRef.current?.();
  }, [
    applyShotResultToVisual,
    cancelShotAnimation,
    commitSelectedShot,
    referenceData,
    savedShotSnapshot,
    simulatePublishedRadialShot,
  ]);
  useEffect(() => {
    setShotExplosionOriginRef.current = setShotExplosionOrigin;
  }, [setShotExplosionOrigin]);

  const selectSavedShot = useCallback((shotId: number) => {
    const record = shotRecordsRef.current.find((candidate) => candidate.shotId === shotId);
    if (!record) return;
    cancelShotAnimation(true);
    targetDistanceRef.current = record.distanceM;
    distancePreferenceRef.current = record.distanceM;
    setTargetDistanceM(record.distanceM);
    commitSelectedShot(record);
    renderRef.current?.();
  }, [cancelShotAnimation, commitSelectedShot, setTargetDistanceM]);

  const saveRayShot = useCallback(({
    intersections,
    rayOrigin,
    rayDirection,
    distanceM,
    animate = true,
    radialOriginOverrideM = null,
  }: {
    intersections: EditorNativeIntersection[];
    rayOrigin: THREE.Vector3;
    rayDirection: THREE.Vector3;
    distanceM: number;
    animate?: boolean;
    radialOriginOverrideM?: [number, number, number] | null;
  }) => {
    const parsed = parsedHitRef.current;
    const weaponModel = attackModelRef.current;
    const selectedWeaponIndex = weaponIndexRef.current;
    if (
      !parsed ||
      !weaponModel ||
      selectedWeaponIndex < 0 ||
      (intersections.length === 0 && !radialOriginOverrideM)
    ) return null;
    if (
      radialOriginOverrideM &&
      resolveEditorNativeBallistics(
        weaponModel,
        selectedWeaponIndex,
        distanceM,
      ).explosiveLayers.length === 0
    ) return null;
    cancelShotAnimation(true);
    const records = shotRecordsRef.current;
    const reusableRecord = records.length >= maxShotTraces ? records.shift() ?? null : null;
    const visual = reusableRecord?.visual ?? shotVisualsRef.current.find(
      (candidate) => !records.some((record) => record.visual === candidate),
    );
    if (!visual) return null;
    visual.group.visible = false;
    visual.traceOutline.visible = false;
    visual.continuationTrace.visible = false;
    visual.continuationArrow.visible = false;
    visual.terminalVisible = false;
    visual.terminalMarker.visible = false;
    visual.selected = false;
    visual.animationActive = false;
    visual.animationLayout = null;
    visual.layerMarkers.forEach((marker) => { marker.sphere.visible = false; });
    visual.explosionLayers.forEach(clearShotExplosionLayerVisual);
    visual.rayOrigin = rayOrigin.clone();
    visual.rayDirection = rayDirection.clone().normalize();
    const entryPoint = intersections[0]?.point ?? radialOriginOverrideM;
    if (!entryPoint) return null;
    visual.firstHitDistanceM = intersections[0]?.distanceFromRayOriginM
      ?? rayOrigin.distanceTo(new THREE.Vector3().fromArray(entryPoint));
    const result = simulatePublishedRadialShot({
      model: parsed.header,
      weaponModel,
      weaponIndex: selectedWeaponIndex,
      targetDistanceM: distanceM,
      shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
      intersections,
      includeRadial: true,
      vehicleDamagedByRadial: referenceData?.general.isDamagedByRadial ?? null,
      radialDamageModel: referenceData?.radialDamageModel ?? null,
    }, radialOriginOverrideM);
    if (
      radialOriginOverrideM &&
      result.ballistics.explosiveLayers.length === 0
    ) return null;
    clearExplosionPlacementPreviewRef.current?.();
    const record: RuntimeShotRecord = {
      shotId: ++shotSequenceRef.current,
      distanceM,
      result,
      entryPoint: [entryPoint[0], entryPoint[1], entryPoint[2]],
      direction: [visual.rayDirection.x, visual.rayDirection.y, visual.rayDirection.z],
      radialOriginOverrideM,
      intersections,
      visual,
    };
    records.push(record);
    applyShotResultToVisual(record, result);
    setSavedShots(savedShotSnapshot());
    commitSelectedShot(record);
    if (animate) startShotAnimation(record);
    renderRef.current?.();
    return record;
  }, [
    applyShotResultToVisual,
    cancelShotAnimation,
    commitSelectedShot,
    maxShotTraces,
    referenceData,
    savedShotSnapshot,
    simulatePublishedRadialShot,
    startShotAnimation,
  ]);

  const saveExplosionOrigin = useCallback((
    originM: [number, number, number],
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
  ) => saveRayShot({
    intersections: [],
    rayOrigin,
    rayDirection,
    distanceM: targetDistanceRef.current,
    animate: false,
    radialOriginOverrideM: originM,
  }), [saveRayShot]);
  useEffect(() => {
    saveExplosionOriginRef.current = saveExplosionOrigin;
  }, [saveExplosionOrigin]);

  useEffect(() => {
    navigationStateRef.current = navigationState;
    onNavigationStateChangeRef.current = onNavigationStateChange;
    if (navigationState) {
      setProtectionEnabled(navigationState.protection);
    }
    applyCameraNavigationRef.current?.(navigationState);
  }, [navigationState, onNavigationStateChange]);

  useEffect(() => {
    onDuelHitChangeRef.current = onDuelHitChange;
  }, [onDuelHitChange]);

  useEffect(() => {
    const requestedNavigation = navigationStateRef.current;
    if (
      !requestedNavigation ||
      !attackReady ||
      !attackHeader ||
      !attackSource ||
      weaponOptions.length === 0 ||
      (
        requestedNavigation.attacker &&
        !runtimeAttackSourceMatchesId(attackSource, requestedNavigation.attacker)
      )
    ) return;
    let requestedOptionIndex = defaultAttackWeaponOptionIndex(attackSource);
    if (
      requestedNavigation.weaponIndex !== null &&
      requestedNavigation.weaponIndex >= 0 &&
      requestedNavigation.weaponIndex < weaponOptions.length
    ) {
      requestedOptionIndex = weaponOptions[requestedNavigation.weaponIndex];
    } else if (requestedNavigation.weapon) {
      requestedOptionIndex = weaponOptions.find((candidate) => {
        const label = attackSource.weapons[candidate];
        const model = label?.ballisticsModel ?? null;
        const weapon = label
          ? model?.weapons[label.ballisticsWeaponIndex]
          : null;
        return requestedNavigation.weapon === weapon?.weaponId ||
          requestedNavigation.weapon === label?.runtimeAssetPath ||
          requestedNavigation.weapon === label?.gunName ||
          requestedNavigation.weapon === label?.displayNameZh ||
          requestedNavigation.weapon === label?.displayNameEnglish;
      }) ?? requestedOptionIndex;
    }
    const requestedWeapon = attackSource.weapons[requestedOptionIndex];
    const requestedModel = requestedWeapon?.ballisticsModel ?? null;
    if (!requestedWeapon || !requestedModel) return;
    const requestedMaxDistance = runtimeAttackTargetDistanceLimitM(
      requestedModel,
      requestedWeapon.ballisticsWeaponIndex,
    );
    const requestedDistance = requestedMaxDistance > 0
      ? Math.min(
          requestedMaxDistance,
          Math.max(0, distancePreferenceRef.current),
        )
      : 0;
    const weaponChanged = weaponOptionIndexRef.current !== requestedOptionIndex;
    const distanceChanged = targetDistanceRef.current !== requestedDistance;
    if (!weaponChanged && !distanceChanged) return;
    attackModelRef.current = requestedModel;
    weaponIndexRef.current = requestedWeapon.ballisticsWeaponIndex;
    weaponOptionIndexRef.current = requestedOptionIndex;
    targetDistanceRef.current = requestedDistance;
    setAttackHeader(requestedModel);
    setWeaponIndex(requestedWeapon.ballisticsWeaponIndex);
    setWeaponOptionIndex(requestedOptionIndex);
    setTargetDistanceM(requestedDistance);
    simulateCurrentShot(requestedWeapon.ballisticsWeaponIndex, requestedDistance);
  }, [
    attackHeader,
    attackSource,
    attackReady,
    navigationState,
    simulateCurrentShot,
    weaponOptions,
  ]);

  useEffect(() => {
    if (
      distanceInteractionActive ||
      !attackReady ||
      !attackHeader ||
      !attackSource ||
      weaponIndex < 0 ||
      weaponOptionIndex < 0 ||
      !onNavigationStateChangeRef.current
    ) return;
    const current = navigationStateRef.current ?? {
      view: mode,
      protection: protectionActive,
      attacker: "",
      weapon: "",
      weaponIndex: null,
      distance: 0,
      yaw: null,
      pitch: null,
      camera: "",
      shots: "",
      turrets: "",
    };
    const next: ViewerNavigationState = {
      view: mode,
      protection: protectionActive,
      attacker: attackSource.shareSlug,
      weapon: "",
      weaponIndex: weaponOptionIndex === defaultAttackWeaponOptionIndex(attackSource)
        ? null
        : weaponOptionIndex,
      distance: 0,
      yaw: current.yaw,
      pitch: current.pitch,
      camera: current.camera,
      shots: sharedShotToken,
      turrets: current.turrets,
    };
    const unchanged =
      current.view === next.view &&
      current.attacker === next.attacker &&
      current.weapon === next.weapon &&
      current.weaponIndex === next.weaponIndex &&
      current.distance === next.distance &&
      current.yaw === next.yaw &&
      current.pitch === next.pitch &&
      current.camera === next.camera &&
      current.shots === next.shots &&
      current.turrets === next.turrets;
    if (unchanged) return;
    navigationStateRef.current = next;
    onNavigationStateChangeRef.current(next);
  }, [
    attackHeader,
    attackSource,
    attackReady,
    distanceInteractionActive,
    mode,
    protectionActive,
    sharedShotToken,
    targetDistanceM,
    weaponIndex,
    weaponOptionIndex,
    weaponOptions,
  ]);

  useEffect(() => {
    modeRef.current = mode;
    const visualGroup = visualGroupRef.current;
    const analysisVisualGroup = analysisVisualGroupRef.current;
    const hitGroup = hitGroupRef.current;
    if (visualGroup) visualGroup.visible = mode === "exterior" || !hitGroup;
    if (analysisVisualGroup) {
      analysisVisualGroup.visible = mode !== "exterior" && Boolean(hitGroup);
    }
    if (hitGroup) {
      hitGroup.visible = mode !== "exterior" || exteriorSpacedArmorHighlight;
    }
    if (hitModelRef.current) {
      setHitSceneThreeModelMode(
        hitModelRef.current,
        mode,
        exteriorSpacedArmorHighlight,
      );
      setHitSceneThreeModelSpecialArmorVisible(
        hitModelRef.current,
        mode === "exterior" ? true : specialArmorVisibleRef.current,
      );
    }
    exteriorSpacedArmorHighlightRef.current = exteriorSpacedArmorHighlight;
    if (hostRef.current) {
      hostRef.current.dataset.hitMode = mode;
      hostRef.current.dataset.exteriorSpacedArmorHighlight = String(
        exteriorSpacedArmorHighlight,
      );
    }
    activateAssetModeRef.current?.(mode);
    setRealtimePointer(null);
    if (protectionEnabledRef.current) scheduleProtectionMapRef.current?.();
    renderRef.current?.();
  }, [exteriorSpacedArmorHighlight, mode]);

  useEffect(() => {
    specialArmorVisibleRef.current = specialArmorVisible;
    if (!hitModelRef.current) return;
    setHitSceneThreeModelSpecialArmorVisible(
      hitModelRef.current,
      modeRef.current === "exterior" ? true : specialArmorVisible,
    );
    renderRef.current?.();
  }, [specialArmorVisible]);

  useEffect(() => {
    relativeArmorScaleRef.current = relativeArmorScaleActive;
    if (hostRef.current) {
      hostRef.current.dataset.armorThicknessScale = relativeArmorScaleActive
        ? "relative"
        : "absolute";
    }
    if (!hitModelRef.current) return;
    setHitSceneThreeModelArmorThicknessScale(
      hitModelRef.current,
      relativeArmorScaleActive ? "relative" : "absolute",
    );
    renderRef.current?.();
  }, [relativeArmorScaleActive]);

  useEffect(() => {
    protectionEnabledRef.current = protectionActive;
    if (protectionActive) scheduleProtectionMapRef.current?.();
    else cancelProtectionMapRef.current?.();
  }, [protectionActive]);

  useEffect(() => {
    protectionOpacityRef.current = protectionOpacityPercent;
    if (protectionCanvasRef.current) {
      protectionCanvasRef.current.style.opacity = String(protectionOpacityPercent / 100);
    }
  }, [protectionOpacityPercent]);

  useEffect(() => {
    const previousPrecision = protectionPrecisionRef.current;
    protectionPrecisionRef.current = protectionPrecision;
    if (protectionActive) {
      scheduleProtectionMapRef.current?.({
        invalidate: protectionPrecision < previousPrecision,
      });
    }
  }, [protectionActive, protectionPrecision]);

  useEffect(() => {
    if (protectionActive) scheduleProtectionMapRef.current?.({ invalidate: true });
  }, [attackSourceCardId, protectionActive, targetDistanceM, weaponIndex, weaponOptionIndex]);

  useEffect(() => {
    const host = hostRef.current;
    if (host) host.dataset.hitProbeVerdict = verdict;
  }, [verdict]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !selectedAttackWeapon) return;
    host.dataset.attackSourceWeaponIndex = String(
      selectedAttackWeapon.ballisticsWeaponIndex,
    );
    host.dataset.attackSourceBallisticsId = selectedAttackWeapon.ballisticsId;
    host.dataset.attackSourceBallisticsKind =
      selectedAttackWeapon.ballisticsSource.kind;
    if (selectedAttackWeapon.explosiveCategory) {
      host.dataset.attackExplosiveCategory =
        selectedAttackWeapon.explosiveCategory ?? "unknown";
      host.dataset.attackExplosiveLayerCount = String(
        selectedAttackWeapon.explosiveLayerCount ?? 0,
      );
      host.dataset.attackExplosiveLayerOrder =
        selectedAttackWeapon.explosiveLayerOrderClosed
          ? "closed"
          : "native-unknown";
    } else {
      delete host.dataset.attackExplosiveCategory;
      delete host.dataset.attackExplosiveLayerCount;
      delete host.dataset.attackExplosiveLayerOrder;
    }
    if (selectedAttackWeapon.weaponIndex >= 0) {
      host.dataset.attackSourceRuntimeWeaponIndex = String(
        selectedAttackWeapon.weaponIndex,
      );
    } else {
      delete host.dataset.attackSourceRuntimeWeaponIndex;
    }
  }, [selectedAttackWeapon]);

  useEffect(() => {
    const resetFromQa = () => resetViewRef.current?.();
    window.addEventListener("sigua-runtime-viewer-reset", resetFromQa);
    return () => window.removeEventListener("sigua-runtime-viewer-reset", resetFromQa);
  }, []);

  useEffect(() => {
    const stationSignature = runtimeTurretStations
      .map((station) => station.id)
      .join("|");
    const token = navigationState?.turrets ?? "";
    const navigationKey = `${stationSignature}:${token}`;
    if (appliedTurretNavigationKeyRef.current === navigationKey) return;
    const decoded = token ? decodeViewerTurretState(token) : null;
    const defaultStationIndex = defaultTurretStation
      ? runtimeTurretStations.findIndex(
          (station) => station.id === defaultTurretStation.id,
        )
      : 0;
    const requestedActiveIndex = decoded?.activeStationIndex ??
      Math.max(0, defaultStationIndex);
    const requestedActiveStation =
      runtimeTurretStations[requestedActiveIndex] ??
      defaultTurretStation ??
      runtimeTurretStations[0] ??
      null;
    const nextPoseStates: Record<string, RuntimeTurretPoseState> = {};
    for (const encodedPose of decoded?.poses ?? []) {
      const station = runtimeTurretStations[encodedPose.stationIndex];
      if (!station) continue;
      const yawDegrees = clampTurretYaw(
        station.turret,
        encodedPose.yawDegrees,
      );
      nextPoseStates[station.id] = {
        yawDegrees,
        pitchDegrees: clampTurretPitch(
          station.turret,
          yawDegrees,
          encodedPose.pitchDegrees,
        ),
      };
    }
    turretPoseStatesRef.current = nextPoseStates;
    setTurretPoseStates(nextPoseStates);
    setActiveTurretStationId(requestedActiveStation?.id ?? "");
    appliedTurretNavigationKeyRef.current = navigationKey;
  }, [
    defaultTurretStation,
    navigationState?.turrets,
    runtimeTurretStations,
  ]);

  useEffect(() => {
    turretPosesRef.current = orderedRuntimeTurretStations(
      runtimeTurretStations,
    ).map((station) => {
      const state = turretPoseStates[station.id] ?? {
        yawDegrees: 0,
        pitchDegrees: 0,
      };
      const yawDegrees = clampTurretYaw(station.turret, state.yawDegrees);
      return {
        stationId: station.id,
        assembly: station.assembly,
        articulation: station.turret.articulation,
        yawDegrees,
        pitchDegrees: clampTurretPitch(
          station.turret,
          yawDegrees,
          state.pitchDegrees,
        ),
      };
    });
    const host = hostRef.current;
    if (host) {
      if (activeTurretStation) {
        host.dataset.turretStationId = activeTurretStation.id;
        host.dataset.turretYawDegrees = String(clampedTurretYaw);
        host.dataset.turretPitchDegrees = String(clampedTurretPitch);
        host.dataset.turretDataAuthority =
          activeTurretStation.turret.limits?.authority ?? "reference";
        host.dataset.turretYawPlacementCount = String(
          activeTurretStation.assembly?.yawPlacementIds.length ?? 0,
        );
        host.dataset.turretPitchPlacementCount = String(
          activeTurretStation.assembly?.pitchPlacementIds.length ?? 0,
        );
        host.dataset.turretPoseCount = String(turretPosesRef.current.length);
      } else {
        delete host.dataset.turretStationId;
        delete host.dataset.turretYawDegrees;
        delete host.dataset.turretPitchDegrees;
        delete host.dataset.turretDataAuthority;
        delete host.dataset.turretYawPlacementCount;
        delete host.dataset.turretPitchPlacementCount;
        delete host.dataset.turretPoseCount;
      }
    }
    applyTurretPoseRef.current?.();
  }, [
    activeTurretStation,
    clampedTurretPitch,
    clampedTurretYaw,
    runtimeTurretStations,
    turretPoseStates,
  ]);

  useEffect(() => {
    physicalPoseEnabledRef.current = physicalPoseEnabled;
    applyChassisPoseRef.current?.(physicalPoseEnabled);
  }, [physicalPoseEnabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visual) return;
    applyCameraViewPresetRef.current = null;
    applyInfantryDistancePreviewRef.current = null;
    enterFreeCameraViewRef.current = null;
    enterCrewViewpointRef.current = null;
    exitCrewViewpointRef.current = null;
    applyCrewViewZoomRef.current = null;
    applyCrewHitProxyVisibilityRef.current = null;
    activeCrewViewZoomIndexRef.current = 0;
    activeCrewViewStationIdRef.current = null;
    activeCameraViewRef.current = null;
    infantryPreviewDistanceRef.current = null;
    setActiveCameraView(null);
    setActiveCrewViewStationId(null);
    setInfantryPreviewDistanceM(null);
    setArmorThicknessRange(null);
    setInitialCameraFitReady(false);
    setExteriorPlaceholderReady(false);
    host.dataset.armorThicknessScale = "absolute";
    host.dataset.viewerInitialFitState = "pending";
    host.dataset.exteriorPlaceholderState = "loading";

    const dedupedVisual = dedupeIdenticalVisualPlacements(visual.placements);
    const renderPlacements = dedupedVisual.placements;
    host.dataset.acceptedVisualOccurrenceCount = String(visual.placements.length);
    host.dataset.suppressedExactVisualDuplicates = String(
      dedupedVisual.suppressed.length,
    );
    host.dataset.analysisIdentityStableSurfacePlacementCount = String(
      renderPlacements.filter(isStableAnalysisVisualSurfacePlacement).length,
    );

    let cancelled = false;
    let analysisLoaded = 0;
    let analysisVisualReady = false;
    let analysisVisualErrorMessage: string | null = null;
    let analysisVisualPromise: Promise<void> | null = null;
    let startAnalysisVisualAssets: (() => void) | null = null;
    let hitLoadSucceeded = false;
    let hitSettled = !hit;
    let exteriorLoaded = 0;
    let exteriorReady = false;
    let exteriorPromise: Promise<void> | null = null;
    let startExteriorAssets: (() => void) | null = null;
    let gridHelper: THREE.GridHelper | null = null;
    let groundScale: THREE.Group | null = null;
    let referenceSoldier: THREE.Object3D | null = null;
    let referenceSoldierLoadScheduled = false;
    let referenceSoldierLoadTimer = 0;
    let referenceSoldierIdleCallback = 0;
    let startReferenceSoldierAsset: (() => void) | null = null;
    let fittedSource: "hit" | "analysis" | "exterior" | null = null;
    let pointerStart: { x: number; y: number } | null = null;
    let lastPlacementPointer: THREE.Vector2 | null = null;
    let explosionDrag: {
      pointerId: number;
      shotId: number;
      plane: THREE.Plane;
      pendingOrigin: [number, number, number] | null;
    } | null = null;
    let explosionDragFrame = 0;
    let placementPreviewFrame = 0;
    let pendingPlacementPointer: THREE.Vector2 | null = null;
    let hoverFrame = 0;
    let pendingHover: { clientX: number; clientY: number } | null = null;
    let protectionFrame = 0;
    let protectionTimer = 0;
    let protectionToken = 0;
    let protectionCache: ProtectionMapComputationCache | null = null;
    const exteriorOccurrences = new Map<string, RuntimeExteriorOccurrence>();
    const exteriorSources = new Map<string, THREE.Object3D>();
    const analysisOccurrences = new Map<
      string,
      RuntimeExteriorOccurrence[]
    >();
    let lastAppliedHitModel: HitSceneThreeModel | null = null;
    let lastAppliedHitPoseKey: string | null = null;
    exteriorOccurrencesRef.current = exteriorOccurrences;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
      1,
      0.05,
      200,
    );
    const rendererLease = acquireRuntimeRenderer();
    const renderer = rendererLease.renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    const runtimeContext = renderer.getContext();
    const rendererInfo = runtimeContext.getExtension("WEBGL_debug_renderer_info");
    const rendererName = rendererInfo
      ? String(runtimeContext.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
      : null;
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    const renderQuality = runtimeRenderQualityProfile({
      devicePixelRatio: window.devicePixelRatio || 1,
      rendererName,
      deviceMemoryGb: navigatorWithMemory.deviceMemory ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
    }, FORCED_RUNTIME_RENDER_QUALITY_TIER);
    renderer.setPixelRatio(renderQuality.pixelRatio);
    host.dataset.renderQuality = renderQuality.tier;
    const viewerRoot = host.closest<HTMLElement>(".runtime-vehicle-viewer");
    if (viewerRoot) viewerRoot.dataset.renderQuality = renderQuality.tier;
    host.dataset.renderPixelRatio = String(renderQuality.pixelRatio);
    host.dataset.renderQualityReason = renderQuality.reason;
    host.dataset.assetLoadConcurrency = String(
      renderQuality.assetLoadConcurrency,
    );
    host.dataset.textureMipmaps = String(renderQuality.textureMipmaps);
    if (rendererName) host.dataset.gpuRenderer = rendererName;
    renderer.domElement.setAttribute("aria-label", `${preview.variantRawName} runtime asset 3D preview`);
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);
    host.dataset.webglRendererLease = rendererLease.shared ? "shared" : "isolated";
    host.dataset.webglRendererId = String(rendererLease.rendererId);

    const controls = new OrbitControls(camera, renderer.domElement);
    const compactPortableDrone =
      preview.cardId.includes("--portable-recon-drone--");
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = compactPortableDrone ? 0.18 : 2;
    controls.maxDistance = 40;

    const modelGroup = new THREE.Group();
    modelGroup.name = preview.visualVehicleId ?? "runtime-visual";
    referenceSoldier = createReferenceSoldierOutlineProxy(() => {
      if (!cancelled) render();
    });
    modelGroup.add(referenceSoldier);
    host.dataset.referenceSoldierState = "outline";
    const skeletalPoseBindings = new Set<RuntimeSkeletalPoseBinding>();
    const updateSkeletalPoseDataset = (enabled: boolean) => {
      const selectedBoneNames = new Set<string>();
      const changedBoneNames = new Set<string>();
      const observedRunningGearBoneNames = new Set<string>();
      const observedRunningGearIdentities = new Set<string>();
      const observedRunningGearOccurrenceIds = new Set<string>();
      let declaredReferenceEquivalentMismatch = false;
      for (const {
        controller,
        generatedClass,
        stableOccurrenceId,
        observedRunningGearRecord,
      } of skeletalPoseBindings) {
        controller.selectedBoneNames.forEach((name) =>
          selectedBoneNames.add(name),
        );
        controller.changedBoneNames.forEach((name) =>
          changedBoneNames.add(name),
        );
        declaredReferenceEquivalentMismatch ||=
          controller.declaredReferenceEquivalentMismatch;
        if (observedRunningGearRecord) {
          observedRunningGearIdentities.add(
            `${generatedClass ?? "unknown"}\u0000${stableOccurrenceId}`,
          );
          observedRunningGearOccurrenceIds.add(stableOccurrenceId);
          observedRunningGearRecord.wheels.forEach((wheel) =>
            observedRunningGearBoneNames.add(wheel.boneName));
        }
      }
      host.dataset.skeletalPoseState = enabled
        ? skeletalPoseBindings.size > 0
          ? "runtime-observed"
          : "unavailable"
        : "reference";
      host.dataset.skeletalPoseEvidence =
        vehicleMeshSkeletalPoseEvidence ?? "unavailable";
      host.dataset.skeletalPoseControllerCount = String(
        skeletalPoseBindings.size,
      );
      host.dataset.skeletalPoseSelectedBoneCount = String(
        selectedBoneNames.size,
      );
      host.dataset.skeletalPoseChangedBoneCount = String(changedBoneNames.size);
      host.dataset.skeletalPoseVisualDifference =
        changedBoneNames.size > 0 ? "observed-differs" : "none";
      host.dataset.skeletalPoseReferenceMismatch =
        declaredReferenceEquivalentMismatch ? "true" : "false";
      host.dataset.suspensionPoseState = enabled
        ? vehiclePlanarSuspensionCoverage?.status === "not-applicable"
            ? "not-applicable"
            : skeletalPoseBindings.size > 0
              ? "runtime-observed"
              : "unavailable"
        : "reference";
      host.dataset.suspensionPoseAuthority = enabled &&
          vehiclePlanarSuspensionCoverage?.status === "not-applicable"
          ? "explicit-not-applicable"
          : enabled && skeletalPoseBindings.size > 0
            ? "normal-time-runtime-observed"
            : enabled
              ? "unavailable"
              : "inverse-bind-reference";
      host.dataset.suspensionPoseRecordCount = String(
        observedRunningGearIdentities.size,
      );
      host.dataset.suspensionPoseAppliedWheelOffsetCount = String(
        enabled ? observedRunningGearBoneNames.size : 0,
      );
      host.dataset.suspensionPoseGeneratedClass =
        preview.generatedClass ?? "unavailable";
      host.dataset.suspensionPoseCoverageReason =
        vehiclePlanarSuspensionCoverage?.reason ?? "resolved";
      host.dataset.suspensionPoseStableOccurrenceIds = [
        ...observedRunningGearOccurrenceIds,
      ]
        .sort()
        .join(",");
    };
    const applySkeletalPose = (enabled: boolean) => {
      for (const {
        controller,
        skinnedMeshes,
      } of skeletalPoseBindings) {
        if (!enabled) {
          controller.apply("reference");
        } else {
          controller.apply("observed");
        }
        for (const mesh of skinnedMeshes) {
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
      }
      updateSkeletalPoseDataset(enabled);
    };
    const registerSkeletalPose = (
      model: THREE.Object3D,
      placement: RuntimeVisualPlacement,
    ) => {
      if (
        placement.name.trim().toLowerCase() !== "vehicle mesh" ||
        placement.runtimeBonePoseStatus !== "observed"
      ) {
        return;
      }
      const observedRunningGearRecord =
        runtimePlanarSuspensionPoseForVisualOccurrence(
          preview.suspension.records,
          preview.generatedClass,
          placement.stableOccurrenceId,
        );
      const skinnedMeshesBySkeleton = new Map<
        THREE.Skeleton,
        THREE.SkinnedMesh[]
      >();
      model.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) {
          const skinnedMeshes =
            skinnedMeshesBySkeleton.get(object.skeleton) ?? [];
          skinnedMeshes.push(object);
          skinnedMeshesBySkeleton.set(object.skeleton, skinnedMeshes);
        }
      });
      for (const [skeleton, skinnedMeshes] of skinnedMeshesBySkeleton) {
        const controller = createRuntimeSkeletalPoseController(skeleton, {
          observedSampleCount:
            placement.runtimeBonePoseNormalTimeSampleCount ?? 1,
          referenceEquivalent:
            placement.runtimeBonePoseReferenceEquivalent === true,
        });
        if (!controller) continue;
        if (!physicalPoseEnabledRef.current) {
          controller.apply("reference");
        } else {
          controller.apply("observed");
        }
        for (const mesh of skinnedMeshes) {
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
        skeletalPoseBindings.add({
          controller,
          generatedClass: preview.generatedClass,
          stableOccurrenceId: placement.stableOccurrenceId,
          observedRunningGearRecord,
          skinnedMeshes,
          model,
          placementMatrix: new THREE.Matrix4().fromArray(placement.matrix),
        });
      }
      updateSkeletalPoseDataset(physicalPoseEnabledRef.current);
    };
    updateSkeletalPoseDataset(physicalPoseEnabledRef.current);
    const chassisPoseGroup = new THREE.Group();
    chassisPoseGroup.name = "runtime-settled-chassis-pose";
    chassisPoseGroup.matrixAutoUpdate = false;
    const staticChassisPoseMatrix = new THREE.Matrix4();
    const settledChassisPoseMatrix = chassisPose
      ? new THREE.Matrix4().fromArray(chassisPose.gltfMatrix)
      : staticChassisPoseMatrix;
    const applyChassisPoseMatrix = (enabled: boolean) => {
      const active = enabled && chassisPose !== null;
      chassisPoseGroup.matrix.copy(
        active ? settledChassisPoseMatrix : staticChassisPoseMatrix,
      );
      chassisPoseGroup.matrixWorldNeedsUpdate = true;
      host.dataset.chassisPoseState = chassisPose
        ? active
          ? "settled"
          : "static"
        : "unavailable";
      host.dataset.chassisPoseAuthority = chassisPose
        ? "normal-time-runtime-observed"
        : "unavailable";
      if (chassisPose) {
        host.dataset.chassisPoseGeneratedClass = chassisPose.generatedClass;
        host.dataset.chassisPosePitchDegrees = String(chassisPose.pitchDeg);
        host.dataset.chassisPoseRollDegrees = String(chassisPose.rollDeg);
        host.dataset.chassisPoseActorOriginHeightCm = String(
          chassisPose.heightAbovePlaneCm,
        );
      }
    };
    applyChassisPoseMatrix(physicalPoseEnabledRef.current);
    const visualGroup = new THREE.Group();
    visualGroup.name = "runtime-visual-occurrences";
    const analysisVisualGroup = new THREE.Group();
    analysisVisualGroup.name = "runtime-analysis-visual-occurrences";
    const analysisVisualDepthGroup = new THREE.Group();
    analysisVisualDepthGroup.name = "runtime-analysis-visual-depth-occluders";
    analysisVisualGroup.add(
      createAnalysisVisualDepthReset(),
      analysisVisualDepthGroup,
    );
    visualGroup.visible = modeRef.current === "exterior";
    analysisVisualGroup.visible = modeRef.current !== "exterior";
    const crewViewpointMarker = createCrewViewpointMarker();
    const crewOccupantHolder = new THREE.Group();
    crewOccupantHolder.name = "runtime-crew-occupant-holder";
    crewOccupantHolder.visible = false;
    let crewOccupantLayer: RuntimeCrewOccupantLayer | null = null;
    let crewOccupantLoadRequest: Promise<RuntimeCrewOccupantLayer | null> | null = null;
    let activeCrewViewPose: CrewViewPose | null = null;
    modelGroup.add(chassisPoseGroup);
    chassisPoseGroup.add(visualGroup, analysisVisualGroup);
    chassisPoseGroup.add(crewViewpointMarker.root, crewOccupantHolder);
    visualGroupRef.current = visualGroup;
    analysisVisualGroupRef.current = analysisVisualGroup;
    scene.add(modelGroup);
    host.dataset.visualTexturePolicy = "exterior-tab-only";
    host.dataset.analysisVisualAssetState = "deferred";
    host.dataset.exteriorAssetState = "deferred";

    const syncAnalysisVisualPresentation = () => {
      const exteriorPlaceholderActive =
        modeRef.current === "exterior" && analysisVisualReady && !exteriorReady;
      analysisVisualGroup.visible = exteriorPlaceholderActive || (
        modeRef.current !== "exterior" && Boolean(hitGroupRef.current)
      );
      if (
        analysisVisualReady &&
        (exteriorPlaceholderActive || modeRef.current !== "exterior")
      ) {
        setAnalysisVisualPresentation(
          analysisVisualGroup,
          exteriorPlaceholderActive ? "exterior-placeholder" : "analysis",
        );
      }
      let visiblePlaceholderOccurrences = 0;
      analysisOccurrences.forEach((occurrences, stableOccurrenceId) => {
        const occurrenceVisible =
          !exteriorPlaceholderActive || !exteriorOccurrences.has(stableOccurrenceId);
        occurrences.forEach(({ object }) => {
          object.visible = occurrenceVisible;
        });
        if (exteriorPlaceholderActive && occurrenceVisible) {
          visiblePlaceholderOccurrences += 1;
        }
      });
      host.dataset.exteriorPlaceholderState = !analysisVisualReady
        ? "loading"
        : exteriorPlaceholderActive
          ? "visible"
          : "hidden";
      host.dataset.exteriorPlaceholderOccurrenceCount = String(
        visiblePlaceholderOccurrences,
      );
    };

    scene.add(new THREE.HemisphereLight(0xf3f3f0, 0x242424, 2.15));
    const keyLight = new THREE.DirectionalLight(0xfff4d2, 3.2);
    keyLight.position.set(6, 9, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9aa4b3, 1.2);
    fillLight.position.set(-7, 4, -5);
    scene.add(fillLight);

    const shotVisuals = Array.from(
      { length: maxShotTraces },
      (_, traceIndex) => createShotVisual(traceIndex),
    );
    shotVisualsRef.current = shotVisuals;
    shotVisuals.forEach((shotVisual) => scene.add(shotVisual.group));
    const explosionPlacementPreview = createExplosionPlacementPreview();
    scene.add(explosionPlacementPreview.root);

    const stationPose = (stationId: string) =>
      turretPosesRef.current.find((pose) => pose.stationId === stationId) ?? {
        stationId,
        assembly: null,
        yawDegrees: 0,
        pitchDegrees: 0,
      };
    const stationMotionMatrices = (
      station: RuntimeTurretPreviewStation,
    ) => {
      const pose = stationPose(station.id);
      const frame = station.assembly ??
        resolveRuntimeTurretMotionFrame(station.visualAttachment);
      if (!frame) return null;
      const matrices = turretArticulationMatrices(
        frame,
        pose.yawDegrees,
        pose.pitchDegrees,
      );
      const yaw = new THREE.Matrix4().fromArray(matrices.yaw);
      return {
        yaw: matrices.yaw,
        pitch: matrices.pitch,
        yawPitch: yaw
          .multiply(new THREE.Matrix4().fromArray(matrices.pitch))
          .elements.slice(),
      };
    };
    const parentStationForView = (
      station: RuntimeTurretPreviewStation,
      stations: RuntimeTurretPreviewStation[],
    ) => {
      const parentCatalogSeatIndex =
        station.crewSeat.positionSemantics?.seatPawnAttachment
          ?.parentCatalogSeatIndex;
      if (Number.isSafeInteger(parentCatalogSeatIndex)) {
        return stations.find(
          (candidate) => candidate.seat.index === parentCatalogSeatIndex,
        ) ?? null;
      }
      return runtimeTurretParentStation(station, stations);
    };
    const stationArticulationMatrixChain = (
      station: RuntimeTurretPreviewStation,
    ) => {
      const stations = runtimeTurretStationsRef.current;
      const matrices: number[][] = [];
      const own = stationMotionMatrices(station);
      if (!own) return matrices;
      matrices.push(own.yawPitch);
      const seen = new Set([station.id]);
      let parent = parentStationForView(station, stations);
      let child = station;
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        const parentMatrices = stationMotionMatrices(parent);
        if (parentMatrices) {
          const inherited = child.inheritedMotionChannels;
          if (inherited.includes("yaw") && inherited.includes("pitch")) {
            matrices.push(parentMatrices.yawPitch);
          } else if (inherited.includes("yaw")) {
            matrices.push(parentMatrices.yaw);
          } else if (inherited.includes("pitch")) {
            matrices.push(parentMatrices.pitch);
          }
        }
        child = parent;
        parent = parentStationForView(parent, stations);
      }
      return matrices;
    };
    const crewPoseForStation = (
      station: RuntimeTurretPreviewStation,
    ): CrewViewPose | null => {
      if (!station.view) return null;
      try {
        const matrices = stationArticulationMatrixChain(station);
        if (matrices.length === 0) return null;
        return transformCrewViewPose(
          crewViewBasePose(station.view),
          matrices,
        );
      } catch {
        return null;
      }
    };
    const updateCrewViewpointMarker = () => {
      const station = runtimeTurretStationsRef.current.find(
        ({ id }) => id === activeTurretStationIdRef.current,
      ) ?? preferredCrewViewStation(runtimeTurretStationsRef.current);
      const pose = station ? crewPoseForStation(station) : null;
      const crewViewActive =
        station?.id === activeCrewViewStationIdRef.current;
      crewViewpointMarker.root.visible = Boolean(
        crewViewpointMarkerEnabledRef.current && pose && !crewViewActive,
      );
      host.dataset.crewViewpointMarkerEnabled = String(
        crewViewpointMarkerEnabledRef.current,
      );
      if (!station || !pose) {
        activeCrewViewPose = null;
        delete host.dataset.crewViewpointStationId;
        delete host.dataset.crewViewpointPosition;
        return null;
      }
      crewViewpointMarker.root.position.fromArray(pose.position);
      crewViewpointMarker.root.updateMatrixWorld(true);
      host.dataset.crewViewpointStationId = station.id;
      host.dataset.crewViewpointPosition = pose.position.join(",");
      host.dataset.crewViewpointHorizontalFovDeg = String(
        pose.horizontalFovDegrees,
      );
      if (crewViewActive) {
        activeCrewViewPose = {
          ...pose,
          horizontalFovDegrees:
            activeCrewViewPose?.horizontalFovDegrees ??
            pose.horizontalFovDegrees,
        };
      }
      return { station, pose };
    };

    const updateCrewOccupantArticulation = () => {
      if (!crewOccupantLayer) return;
      const matrices = new Map<string, number[]>();
      for (const plan of crewOccupantPlan) {
        if (!plan.stationId) continue;
        const station = runtimeTurretStationsRef.current.find(
          ({ crewSeat }) => crewSeat.stationId === plan.stationId,
        );
        if (!station) continue;
        const chain = stationArticulationMatrixChain(station);
        if (chain.length === 0) continue;
        const combined = new THREE.Matrix4();
        for (const matrix of chain) {
          combined.premultiply(new THREE.Matrix4().fromArray(matrix));
        }
        matrices.set(plan.seatKey, combined.elements.slice());
      }
      crewOccupantLayer.updateArticulation(matrices);
      host.dataset.crewOccupantArticulatedCount = String(matrices.size);
    };

    const publishCrewOccupantLayer = (layer: RuntimeCrewOccupantLayer) => {
      host.dataset.crewOccupantState = layer.detailState === "instanced-model"
        ? "ready-instanced-model"
        : "ready-outline-fallback";
      host.dataset.crewOccupantCount = String(layer.stats.occupants);
      host.dataset.crewOccupantHittableCount = String(layer.stats.hittable);
      host.dataset.crewOccupantProtectedOutlineCount = String(
        layer.stats.protectedOutlines,
      );
      host.dataset.crewOccupantUnresolvedOutlineCount = String(
        layer.stats.unresolvedOutlines,
      );
      host.dataset.crewOccupantModelDrawCalls = String(
        layer.stats.modelDrawCalls,
      );
      host.dataset.crewOccupantModelInstances = String(
        layer.stats.modelInstances,
      );
      host.dataset.crewOccupantModelGeometry =
        layer.stats.modelGeometryMode;
      host.dataset.crewOccupantUniqueModelVertices = String(
        layer.stats.uniqueModelVertices,
      );
      host.dataset.crewOccupantEstimatedModelTriangles = String(
        layer.stats.estimatedModelTriangles,
      );
      host.dataset.crewOccupantHitProxyDrawCalls = String(
        layer.stats.hitProxyDrawCalls,
      );
      host.dataset.crewOccupantProtectedPoseDrawCalls = String(
        layer.stats.protectedPoseDrawCalls,
      );
      host.dataset.crewOccupantExactAnimationPoses = String(
        layer.stats.exactAnimationPoses,
      );
      host.dataset.crewOccupantBuildDurationMs = String(
        layer.stats.buildDurationMs,
      );
      host.dataset.crewOccupantPoseAuthority =
        "construction-reference+station-articulation+editor-base-animation-frame-zero";
      host.dataset.crewOccupantRuntimePoseLayers =
        "aim-offset+hand-ik+weapon-ik+per-frame-phase-not-applied";
    };

    const applyCrewHitProxyVisibility = (visible: boolean) => {
      crewOccupantLayer?.setHitProxyVisible(visible);
      host.dataset.crewOccupantHitProxyVisible = String(visible);
      renderRef.current?.();
    };

    const applyCrewOccupantVisibility = (visible: boolean) => {
      const externalVisible = visible &&
        activeCrewViewStationIdRef.current === null;
      if (referenceSoldier) referenceSoldier.visible = !visible;
      crewOccupantHolder.visible = externalVisible;
      crewOccupantLayer?.setVisible(externalVisible);
      host.dataset.crewOccupantVisible = String(externalVisible);
      if (!visible || crewOccupantPlan.length === 0) {
        if (crewOccupantPlan.length === 0) {
          host.dataset.crewOccupantState = "unavailable";
        }
        renderRef.current?.();
        return;
      }
      if (crewOccupantLayer) {
        updateCrewOccupantArticulation();
        renderRef.current?.();
        return;
      }
      if (crewOccupantLoadRequest) return;
      host.dataset.crewOccupantState = "loading";
      crewOccupantLoadRequest = import("./runtime-crew-occupants")
        .then(({ createRuntimeCrewOccupantLayer }) =>
          createRuntimeCrewOccupantLayer({
            plans: crewOccupantPlan,
            detailedModels: renderQuality.tier !== "compatibility",
          }))
        .then((layer) => {
          if (cancelled) {
            layer.dispose();
            return layer;
          }
          crewOccupantLayer = layer;
          crewOccupantHolder.add(layer.root);
          updateCrewOccupantArticulation();
          const shouldShow = crewOccupantDisplayEnabledRef.current &&
            activeCrewViewStationIdRef.current === null;
          crewOccupantHolder.visible = shouldShow;
          layer.setVisible(shouldShow);
          layer.setHitProxyVisible(crewHitProxyDisplayEnabledRef.current);
          publishCrewOccupantLayer(layer);
          host.dataset.crewOccupantVisible = String(shouldShow);
          renderRef.current?.();
          return layer;
        })
        .catch((error: unknown) => {
          crewOccupantLoadRequest = null;
          if (cancelled) return null;
          host.dataset.crewOccupantState = "error";
          host.dataset.crewOccupantError =
            error instanceof Error ? error.message : String(error);
          renderRef.current?.();
          return null;
        });
    };
    applyCrewHitProxyVisibilityRef.current = applyCrewHitProxyVisibility;
    applyCrewOccupantVisibilityRef.current = applyCrewOccupantVisibility;
    applyCrewHitProxyVisibility(crewHitProxyDisplayEnabledRef.current);
    applyCrewOccupantVisibility(crewOccupantDisplayEnabledRef.current);

    const render = () => {
      shotVisuals.forEach((shotVisual) => {
        shotVisual.explosionLayers.forEach((visual) => {
          updateShotExplosionDamageTypeIconPosition(visual, camera);
        });
      });
      const activeExplosionRecord = shotRecordsRef.current.find(
        (record) => record.shotId === activeShotIdRef.current,
      );
      const groundPlaneY = (gridHelper?.position.y ?? 0) + 0.02;
      activeExplosionRecord?.visual.explosionLayers.forEach((layer) => {
        if (!layer.configured || !layer.root.visible) return;
        layer.root.updateMatrixWorld(true);
        const layerWorldOrigin = layer.root.getWorldPosition(new THREE.Vector3());
        const heightFromGroundM = Math.abs(layerWorldOrigin.y - groundPlaneY);
        const groundRadiusM = radialDamageGroundIntersectionRadiusM(
          layer.outerRadiusM,
          heightFromGroundM,
        );
        const groundLocal = layer.root.worldToLocal(
          new THREE.Vector3(
            layerWorldOrigin.x,
            groundPlaneY,
            layerWorldOrigin.z,
          ),
        );
        layer.groundArea.position.copy(groundLocal);
        layer.groundArea.position.y += 0.006;
        layer.exactRadiusRing.position.copy(groundLocal);
        layer.exactRadiusRing.position.y += 0.012;
        const groundVisible = groundRadiusM > 0.001;
        layer.groundArea.visible = groundVisible;
        layer.exactRadiusRing.visible = groundVisible;
        if (groundVisible) {
          layer.groundArea.scale.setScalar(groundRadiusM);
          layer.exactRadiusRing.scale.setScalar(groundRadiusM);
        }
      });
      const activeExplosionLayer = activeExplosionRecord?.visual.explosionLayers.find(
        (layer) => layer.configured && layer.root.visible && layer.showOriginLabel,
      );
      const explosionHud = explosionOriginHudRef.current;
      const placementPreviewVisible = explosionPlacementPreview.root.visible;
      const hudAnchor = activeExplosionLayer?.root ?? (
        placementPreviewVisible ? explosionPlacementPreview.root : null
      );
      if (hudAnchor && explosionHud) {
        const worldOrigin = hudAnchor.getWorldPosition(
          new THREE.Vector3(),
        );
        const projected = worldOrigin.clone().project(camera);
        const onScreen = projected.z >= -1 && projected.z <= 1;
        explosionHud.hidden = !onScreen;
        if (onScreen) {
          const x = (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
          const y = (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
          explosionHud.style.setProperty("--explosion-hud-x", `${x}px`);
          explosionHud.style.setProperty("--explosion-hud-y", `${y - 34}px`);
        }
        const detached = Boolean(activeExplosionRecord?.radialOriginOverrideM);
        explosionHud.dataset.detached = String(detached);
        if (activeExplosionLayer && detached) {
          const heightAboveGroundM = Math.max(
            0,
            worldOrigin.y - groundPlaneY,
          );
          const groundLocal = activeExplosionLayer.root.worldToLocal(
            new THREE.Vector3(worldOrigin.x, groundPlaneY, worldOrigin.z),
          );
          activeExplosionLayer.originTether.geometry.setFromPoints([
            new THREE.Vector3(),
            groundLocal,
          ]);
          activeExplosionLayer.originTether.computeLineDistances();
          const tetherVisible = groundLocal.length() > 0.025;
          activeExplosionLayer.originTether.visible = tetherVisible;
          activeExplosionLayer.originTether.material.opacity = tetherVisible ? 0.88 : 0;
          activeExplosionLayer.impactAnchor.position.copy(groundLocal);
          activeExplosionLayer.impactAnchor.visible = tetherVisible;
          activeExplosionLayer.impactAnchor.material.opacity = tetherVisible ? 0.98 : 0;
          activeExplosionLayer.groundHeightLabel.position
            .copy(groundLocal)
            .multiplyScalar(0.5);
          activeExplosionLayer.groundHeightLabel.position.x += 0.32;
          paintShotExplosionGroundHeight(
            activeExplosionLayer,
            heightAboveGroundM,
          );
          activeExplosionLayer.groundHeightLabel.visible = tetherVisible;
          activeExplosionLayer.groundHeightLabel.material.opacity = tetherVisible ? 1 : 0;
        } else if (activeExplosionLayer) {
          const offsetVisible = Math.abs(activeExplosionLayer.originOffsetM) > 0.025;
          activeExplosionLayer.originTether.visible = offsetVisible;
          activeExplosionLayer.originTether.material.opacity = offsetVisible ? 0.9 : 0;
          activeExplosionLayer.impactAnchor.visible = offsetVisible;
          activeExplosionLayer.impactAnchor.material.opacity = offsetVisible ? 0.98 : 0;
          activeExplosionLayer.groundHeightLabel.visible = false;
          activeExplosionLayer.groundHeightLabel.material.opacity = 0;
        }
      } else if (explosionHud) {
        explosionHud.hidden = true;
      }
      const crewViewpointHud = crewViewpointHudRef.current;
      if (
        crewViewpointHud &&
        crewViewpointMarker.root.visible
      ) {
        modelGroup.updateMatrixWorld(true);
        const worldPosition = crewViewpointMarker.root.getWorldPosition(
          new THREE.Vector3(),
        );
        const projected = worldPosition.clone().project(camera);
        const onScreen = projected.z >= -1 && projected.z <= 1;
        crewViewpointHud.hidden = !onScreen;
        if (onScreen) {
          const x = (projected.x * 0.5 + 0.5) *
            renderer.domElement.clientWidth;
          const y = (-projected.y * 0.5 + 0.5) *
            renderer.domElement.clientHeight;
          crewViewpointHud.style.setProperty("--crew-viewpoint-x", `${x}px`);
          crewViewpointHud.style.setProperty(
            "--crew-viewpoint-y",
            `${y - 30}px`,
          );
        }
      } else if (crewViewpointHud) {
        crewViewpointHud.hidden = true;
      }
      renderer.render(scene, camera);
    };
    let renderFrame = 0;
    const requestRender = () => {
      if (renderFrame !== 0) return;
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        render();
      });
    };
    renderRef.current = render;
    requestRenderRef.current = requestRender;
    const applyCrewViewCameraPose = (
      station: RuntimeTurretPreviewStation,
      pose: CrewViewPose,
      zoomIndex = activeCrewViewZoomIndexRef.current,
    ) => {
      const zoomHorizontalFovDegrees = station.view
        ? crewViewHorizontalFovForZoom(station.view, zoomIndex)
        : null;
      const horizontalFovDegrees = zoomHorizontalFovDegrees ??
        pose.horizontalFovDegrees;
      activeCrewViewPose = {
        ...pose,
        horizontalFovDegrees,
      };
      chassisPoseGroup.updateMatrixWorld(true);
      const worldPosition = new THREE.Vector3()
        .fromArray(pose.position)
        .applyMatrix4(chassisPoseGroup.matrixWorld);
      const worldForward = new THREE.Vector3()
        .fromArray(pose.forward)
        .transformDirection(chassisPoseGroup.matrixWorld);
      const worldUp = new THREE.Vector3()
        .fromArray(pose.up)
        .transformDirection(chassisPoseGroup.matrixWorld);
      camera.position.copy(worldPosition);
      camera.up.copy(worldUp);
      controls.target.copy(worldPosition).addScaledVector(worldForward, 25);
      camera.fov = verticalFovForHorizontalFov(
        horizontalFovDegrees,
        camera.aspect,
      );
      camera.near = 0.01;
      camera.far = Math.max(camera.far, 1000);
      camera.updateProjectionMatrix();
      controls.update();
      activeCameraViewRef.current = null;
      setActiveCameraView(null);
      infantryPreviewDistanceRef.current = null;
      setInfantryPreviewDistanceM(null);
      host.dataset.cameraViewKind = "crew-station";
      host.dataset.cameraViewPreset = station.id;
      host.dataset.cameraProjection = "crew-vehicle-local";
      host.dataset.cameraHorizontalFovDeg = String(
        horizontalFovDegrees,
      );
      host.dataset.cameraVerticalFovDeg = String(camera.fov);
      host.dataset.cameraZoomIndex = String(zoomIndex);
      host.dataset.cameraZoomMagnification = String(
        station.view?.magnificationLevels[zoomIndex] ?? 1,
      );
      host.dataset.cameraZoomHorizontalFovDeg = String(
        horizontalFovDegrees,
      );
      crewViewpointMarker.root.visible = false;
    };
    const applyTurretPose = () => {
      const appliedMatrices: string[] = [];
      let appliedAnalysisOccurrenceCount = 0;
      for (const occurrence of exteriorOccurrences.values()) {
        occurrence.object.matrix.copy(occurrence.baseMatrix);
        occurrence.object.matrixWorldNeedsUpdate = true;
      }
      for (const occurrences of analysisOccurrences.values()) {
        for (const occurrence of occurrences) {
          occurrence.object.matrix.copy(occurrence.baseMatrix);
          occurrence.object.matrixWorldNeedsUpdate = true;
        }
      }
      const poses = turretPosesRef.current.filter(
        (pose): pose is RuntimeTurretPose & {
          assembly: RuntimeTurretAssembly;
        } => Boolean(pose.assembly),
      );
      const poseTransforms = poses.map((pose) => {
        const matrices = turretArticulationMatrices(
          pose.assembly,
          pose.yawDegrees,
          pose.pitchDegrees,
        );
        const yawTransform = new THREE.Matrix4().fromArray(matrices.yaw);
        return {
          pose,
          yawTransform,
          yawPitchTransform: yawTransform
            .clone()
            .multiply(new THREE.Matrix4().fromArray(matrices.pitch)),
          pitchPlacementIds: new Set(pose.assembly.pitchPlacementIds),
        };
      });
      const occurrenceTransforms = new Map<string, THREE.Matrix4>();
      for (const {
        pose,
        yawTransform,
        yawPitchTransform,
        pitchPlacementIds,
      } of poseTransforms) {
        for (const occurrenceId of pose.assembly.yawPlacementIds) {
          const combined = occurrenceTransforms.get(occurrenceId) ??
            new THREE.Matrix4();
          combined.multiply(
            pitchPlacementIds.has(occurrenceId)
              ? yawPitchTransform
              : yawTransform,
          );
          occurrenceTransforms.set(occurrenceId, combined);
        }
      }
      for (const [occurrenceId, articulationTransform] of occurrenceTransforms) {
        appliedMatrices.push(
          `${occurrenceId}:${Array.from(
            articulationTransform.elements,
            (value) => value.toFixed(5),
          ).join(",")}`,
        );
        const exteriorOccurrence = exteriorOccurrences.get(occurrenceId);
        if (exteriorOccurrence) {
          exteriorOccurrence.object.matrix
            .copy(articulationTransform)
            .multiply(exteriorOccurrence.baseMatrix);
          exteriorOccurrence.object.matrixWorldNeedsUpdate = true;
        }
        for (const analysisOccurrence of
          analysisOccurrences.get(occurrenceId) ?? []) {
          analysisOccurrence.object.matrix
            .copy(articulationTransform)
            .multiply(analysisOccurrence.baseMatrix);
          analysisOccurrence.object.matrixWorldNeedsUpdate = true;
          appliedAnalysisOccurrenceCount += 1;
        }
      }
      const hitModel = hitModelRef.current;
      const parsedHit = parsedHitRef.current;
      const turretHitPoseKey = poses.length > 0
        ? poses.map((pose) => [
            pose.stationId,
            pose.yawDegrees.toFixed(3),
            pose.pitchDegrees.toFixed(3),
          ].join(":")).join(";")
        : "none";
      const runningGearBonePoseByIdentity = new Map<
        string,
        {
          stableOccurrenceId: string;
          boneName: string;
          matrix: readonly number[];
        }
      >();
      if (physicalPoseEnabledRef.current) {
        for (const {
          controller,
          stableOccurrenceId,
          observedRunningGearRecord,
          model,
          placementMatrix,
        } of skeletalPoseBindings) {
          if (!observedRunningGearRecord) continue;
          const placementInverse = placementMatrix.clone().invert();
          for (const wheel of observedRunningGearRecord.wheels) {
            const identity = `${stableOccurrenceId}\u0000${wheel.boneName}`;
            if (runningGearBonePoseByIdentity.has(identity)) continue;
            const componentPose = controller.componentPoseMatrixForBone(
              wheel.boneName,
              model,
            );
            if (!componentPose) continue;
            runningGearBonePoseByIdentity.set(identity, {
              stableOccurrenceId,
              boneName: wheel.boneName,
              matrix: placementMatrix
                .clone()
                .multiply(componentPose)
                .multiply(placementInverse)
                .elements.slice(),
            });
          }
        }
      }
      const runningGearBonePoses = [...runningGearBonePoseByIdentity.values()];
      const runningGearHitPoses =
        parsedHit && physicalPoseEnabledRef.current
          ? resolveRuntimeRunningGearHitComponentPoses(
              parsedHit.header.components,
              runningGearBonePoses,
            )
          : {
              componentPoses: [],
              unmatchedComponentIndices: [],
              ambiguousComponentIndices: [],
            };
      const runningGearHitPoseKey = physicalPoseEnabledRef.current
        ? runningGearBonePoses
            .map(({ stableOccurrenceId, boneName, matrix }) =>
              [
                stableOccurrenceId,
                boneName,
                ...matrix.map((value) => value.toFixed(7)),
              ].join(":"),
            )
            .sort()
            .join(";")
        : "reference";
      const hitPoseKey = [
        `turret:${turretHitPoseKey}`,
        `running-gear:${runningGearHitPoseKey}`,
      ].join("|");
      let hitPoseChanged = false;
      if (
        hitModel &&
        parsedHit &&
        (
          hitModel !== lastAppliedHitModel ||
          hitPoseKey !== lastAppliedHitPoseKey
        )
      ) {
        const componentTransforms = new Map<number, THREE.Matrix4>(
          runningGearHitPoses.componentPoses.map(
            ({ componentIndex, matrix }) => [
              componentIndex,
              new THREE.Matrix4().fromArray(matrix),
            ] as const,
          ),
        );
        for (const {
          pose,
          yawTransform,
          yawPitchTransform,
        } of poseTransforms) {
          const componentAssembly =
            resolveRuntimeTurretHitComponentAssembly({
              placements: renderPlacements,
              assembly: pose.assembly,
              articulation: pose.articulation,
              components: parsedHit.header.components,
            });
          const pitchComponents = new Set(
            componentAssembly.pitchComponentIndices,
          );
          for (const componentIndex of componentAssembly.yawComponentIndices) {
            const combined = componentTransforms.get(componentIndex) ??
              new THREE.Matrix4();
            combined.multiply(
              pitchComponents.has(componentIndex)
                ? yawPitchTransform
                : yawTransform,
            );
            componentTransforms.set(componentIndex, combined);
          }
        }
        const hitToVisual = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        const visualToHit = hitToVisual.clone().invert();
        const hitComponentPoses = [...componentTransforms].map(
          ([componentIndex, visualMatrix]) => ({
            componentIndex,
            matrix: visualToHit
              .clone()
              .multiply(visualMatrix)
              .multiply(hitToVisual)
              .elements.slice(),
          }),
        );
        radialQueryHitPoseRef.current = new Map(
          hitComponentPoses.map(({ componentIndex, matrix }) => [componentIndex, matrix]),
        );
        const result = setHitSceneThreeModelComponentPoses(
          hitModel,
          parsedHit,
          {
            componentPoses: hitComponentPoses,
          },
        );
        host.dataset.turretAppliedHitComponentCount = String(
          result.appliedComponentCount,
        );
        host.dataset.turretHitVertexConflictCount = String(
          result.conflictedVertexCount,
        );
        host.dataset.turretAppliedHitPose = turretHitPoseKey;
        host.dataset.runningGearAppliedHitPose = runningGearHitPoseKey;
        host.dataset.runningGearAppliedHitComponentCount = String(
          runningGearHitPoses.componentPoses.length,
        );
        host.dataset.runningGearUnmatchedHitComponentCount = String(
          runningGearHitPoses.unmatchedComponentIndices.length,
        );
        host.dataset.runningGearAmbiguousHitComponentCount = String(
          runningGearHitPoses.ambiguousComponentIndices.length,
        );
        const wheelHitComponentCount = parsedHit.header.components.filter(
          ({ semanticKind }) => semanticKind === "wheel",
        ).length;
        const trackHitComponentCount = parsedHit.header.components.filter(
          ({ semanticKind }) => semanticKind === "track",
        ).length;
        host.dataset.runningGearRigidTrackHitComponentCount =
          String(trackHitComponentCount);
        host.dataset.runningGearHitPoseState =
          physicalPoseEnabledRef.current
            ? runningGearHitPoses.componentPoses.length > 0
              ? "runtime-observed"
              : wheelHitComponentCount > 0
                ? "unavailable"
                : trackHitComponentCount > 0
                  ? "rigid-chassis"
                  : "not-applicable"
            : "reference";
        lastAppliedHitModel = hitModel;
        lastAppliedHitPoseKey = hitPoseKey;
        hitPoseChanged = true;
      }
      if (poses.length > 0) {
        let matrixChecksum = 2166136261;
        for (const character of appliedMatrices.join("|")) {
          matrixChecksum ^= character.charCodeAt(0);
          matrixChecksum = Math.imul(matrixChecksum, 16777619);
        }
        host.dataset.turretAppliedOccurrenceCount = String(
          appliedMatrices.length,
        );
        host.dataset.turretAppliedPose = [
          ...poses.map((pose) => [
            pose.stationId,
            pose.yawDegrees.toFixed(3),
            pose.pitchDegrees.toFixed(3),
          ].join(":")),
        ].join(";");
        host.dataset.turretAppliedMatrixChecksum = (
          matrixChecksum >>> 0
        ).toString(16);
        host.dataset.turretAppliedAnalysisOccurrenceCount = String(
          appliedAnalysisOccurrenceCount,
        );
      } else {
        delete host.dataset.turretAppliedOccurrenceCount;
        delete host.dataset.turretAppliedPose;
        delete host.dataset.turretAppliedMatrixChecksum;
        delete host.dataset.turretAppliedAnalysisOccurrenceCount;
      }
      visualGroup.updateMatrixWorld(true);
      analysisVisualGroup.updateMatrixWorld(true);
      hitGroupRef.current?.updateMatrixWorld(true);
      updateCrewOccupantArticulation();
      const crewViewpoint = updateCrewViewpointMarker();
      if (
        crewViewpoint &&
        crewViewpoint.station.id === activeCrewViewStationIdRef.current
      ) {
        applyCrewViewCameraPose(
          crewViewpoint.station,
          crewViewpoint.pose,
        );
      }
      if (hitPoseChanged && protectionEnabledRef.current) {
        scheduleProtectionMapRef.current?.({ invalidate: true });
      }
      render();
    };
    applyTurretPoseRef.current = applyTurretPose;
    applyTurretPose();
    host.dataset.spacedArmorAnimation = "disabled";
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = false;
    const pointer = new THREE.Vector2();
    const normalMatrix = new THREE.Matrix3();

    const collectRayIntersections = () => {
      const parsed = parsedHitRef.current;
      const analysisMesh = analysisMeshRef.current;
      if (!parsed || !analysisMesh) return [];
      modelGroup.updateMatrixWorld(true);
      normalMatrix.getNormalMatrix(analysisMesh.matrixWorld);
      return raycaster.intersectObject(analysisMesh, false).flatMap<EditorNativeIntersection>(
        (intersection) => {
          const triangleIndex = intersection.faceIndex;
          if (triangleIndex === undefined || triangleIndex === null || !intersection.face) return [];
          const componentIndex = parsed.triangleComponentIndex[triangleIndex];
          const surfaceProfileIndex = parsed.triangleSurfaceProfileIndex[triangleIndex];
          if (componentIndex === undefined || surfaceProfileIndex === undefined) return [];
          const normal = new THREE.Vector3()
            .fromArray(parsed.faceNormals, triangleIndex * 3)
            .normalize()
            .applyNormalMatrix(normalMatrix)
            .normalize();
          return [{
            triangleIndex,
            componentIndex,
            surfaceProfileIndex,
            distanceFromRayOriginM: intersection.distance,
            point: [intersection.point.x, intersection.point.y, intersection.point.z] as const,
            faceNormal: [normal.x, normal.y, normal.z] as const,
            incidenceFactor: -raycaster.ray.direction.dot(normal),
          }];
        },
      );
    };
    const collectIntersections = (normalizedPointer: THREE.Vector2) => {
      raycaster.setFromCamera(normalizedPointer, camera);
      return collectRayIntersections();
    };

    const cancelProtectionMap = (hide = true, resetStatus = hide) => {
      protectionToken += 1;
      window.clearTimeout(protectionTimer);
      protectionTimer = 0;
      cancelAnimationFrame(protectionFrame);
      protectionFrame = 0;
      const canvas = protectionCanvasRef.current;
      if (canvas && hide) {
        canvas.hidden = true;
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        delete host.dataset.protectionMapGrid;
        delete host.dataset.protectionMapTarget;
      }
      delete host.dataset.protectionMapState;
      if (!cancelled && resetStatus) {
        setProtectionRenderedPrecision(0);
        setProtectionSampleProgress({ completed: 0, total: 0 });
      }
    };

    const runProtectionMap = () => {
      const parsed = parsedHitRef.current;
      const weaponModel = attackModelRef.current;
      const analysisMesh = analysisMeshRef.current;
      const canvas = protectionCanvasRef.current;
      const selectedWeaponIndex = weaponIndexRef.current;
      if (
        cancelled ||
        !protectionEnabledRef.current ||
        !parsed ||
        !weaponModel ||
        !analysisMesh ||
        !canvas ||
        selectedWeaponIndex < 0
      ) {
        cancelProtectionMap(true);
        return;
      }
      host.dataset.protectionMapCompute = "client-frame-budget";

      const token = ++protectionToken;
      const viewportWidth = Math.max(renderer.domElement.clientWidth, 1);
      const viewportHeight = Math.max(renderer.domElement.clientHeight, 1);
      const standardGridSize = runtimeProtectionMapGridSize(viewportWidth, viewportHeight);
      if (
        !protectionCache ||
        protectionCache.standard.width !== standardGridSize.width ||
        protectionCache.standard.height !== standardGridSize.height
      ) {
        protectionCache = {
          standard: createProtectionMapGridCache(
            standardGridSize.width,
            standardGridSize.height,
          ),
          completedStandardPrecision: 0,
          superGrid: null,
        };
      }
      const cache = protectionCache;
      const standardGrid = cache.standard;
      const targetPrecision = protectionPrecisionRef.current;
      const standardTarget = Math.min(
        targetPrecision,
        RUNTIME_PROTECTION_MAP_STANDARD_MAX_PRECISION,
      ) as RuntimeProtectionMapStandardPrecision;
      const superGridSize = runtimeProtectionMapSuperGridSize(
        viewportWidth,
        viewportHeight,
      );
      const totalSamples = targetPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION
        ? standardGrid.width * standardGrid.height +
          superGridSize.width * superGridSize.height
        : runtimeProtectionMapCumulativeSampleCount(
            standardGrid.width,
            standardGrid.height,
            standardTarget,
          );
      let workingPrecision = Math.min(
        standardTarget,
        Math.max(
          RUNTIME_PROTECTION_MAP_MIN_PRECISION,
          cache.completedStandardPrecision + 1,
        ),
      ) as RuntimeProtectionMapStandardPrecision;
      let levelSamples: Array<[number, number]> = [];
      let levelSampleIndex = 0;
      let superSampleOrder: Uint32Array | null = null;
      let phase: "standard" | "super" | "done" =
        cache.completedStandardPrecision >= standardTarget ? "done" : "standard";
      let completedSamples =
        protectionMapSampleCount(standardGrid.sampledMask) +
        (cache.superGrid ? protectionMapSampleCount(cache.superGrid.sampledMask) : 0);
      let lastProtectionUiUpdateAt = 0;

      const buildLevelSamples = (level: RuntimeProtectionMapStandardPrecision) => {
        const samples: Array<[number, number]> = [];
        for (const [columnOffset, rowOffset] of runtimeProtectionMapLevelOffsets(level)) {
          for (
            let row = rowOffset;
            row < standardGrid.height;
            row += RUNTIME_PROTECTION_MAP_BLOCK_SIZE
          ) {
            for (
              let column = columnOffset;
              column < standardGrid.width;
              column += RUNTIME_PROTECTION_MAP_BLOCK_SIZE
            ) {
              const cellIndex = row * standardGrid.width + column;
              if (standardGrid.sampledMask[cellIndex] === 0) samples.push([column, row]);
            }
          }
        }
        return samples;
      };

      const sampleCell = (
        grid: Pick<ProtectionMapGridCache, "width" | "height">,
        column: number,
        row: number,
      ) => {
        pointer.set(
          ((column + 0.5) / grid.width) * 2 - 1,
          1 - ((row + 0.5) / grid.height) * 2,
        );
        const intersections = collectIntersections(pointer);
        if (intersections.length === 0) return 0 as RuntimeProtectionMapCell;
        return classifyRuntimeProtectionShot(simulateEditorNativeShot({
          model: parsed.header,
          weaponModel,
          weaponIndex: selectedWeaponIndex,
          targetDistanceM: targetDistanceRef.current,
          shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
          intersections,
          includeRadial: false,
        }));
      };

      const ensureSuperGrid = () => {
        if (
          !cache.superGrid ||
          cache.superGrid.width !== superGridSize.width ||
          cache.superGrid.height !== superGridSize.height
        ) {
          cache.superGrid = createProtectionMapGridCache(
            superGridSize.width,
            superGridSize.height,
          );
          seedSuperProtectionMap(standardGrid, cache.superGrid);
        }
        superSampleOrder = runtimeProtectionMapSuperSampleOrder(
          cache.superGrid.width,
          cache.superGrid.height,
        );
        phase = "super";
        host.dataset.protectionMapGrid =
          `${cache.superGrid.width}x${cache.superGrid.height}`;
        paintProtectionMap(
          canvas,
          cache.superGrid.reconstructed,
          cache.superGrid.width,
          cache.superGrid.height,
        );
        lastProtectionUiUpdateAt = performance.now();
      };

      if (phase === "standard") {
        levelSamples = buildLevelSamples(workingPrecision);
      } else if (targetPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION) {
        ensureSuperGrid();
        if (
          cache.superGrid &&
          protectionMapSampleCount(cache.superGrid.sampledMask) >=
            cache.superGrid.width * cache.superGrid.height
        ) {
          phase = "done";
        }
      } else {
        paintProtectionMap(
          canvas,
          standardGrid.reconstructed,
          standardGrid.width,
          standardGrid.height,
        );
      }
      canvas.hidden = false;
      canvas.style.opacity = String(protectionOpacityRef.current / 100);
      host.dataset.protectionMapTarget =
        targetPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION ? "super" : "standard";
      if (!host.dataset.protectionMapGrid) {
        host.dataset.protectionMapGrid = `${standardGrid.width}x${standardGrid.height}`;
      }
      setProtectionRenderedPrecision(
        phase === "done"
          ? targetPrecision
          : Math.min(
              cache.completedStandardPrecision,
              RUNTIME_PROTECTION_MAP_STANDARD_MAX_PRECISION,
            ),
      );
      setProtectionSampleProgress({ completed: completedSamples, total: totalSamples });

      if (phase === "done") {
        host.dataset.protectionMapState = "ready";
        return;
      }
      host.dataset.protectionMapState = "calculating";

      const processBatch = () => {
        if (cancelled || token !== protectionToken || !protectionEnabledRef.current) return;
        const batchStartedAt = performance.now();
        let batchCount = 0;
        let visitedCount = 0;
        let precisionAdvanced = false;
        const frameHasBudget = () => runtimeProtectionMapFrameHasBudget({
          sampledRays: batchCount,
          visitedCells: visitedCount,
          elapsedMs: performance.now() - batchStartedAt,
        });
        if (phase === "standard") {
          const dirtyBlocks = new Set<number>();
          while (
            levelSampleIndex < levelSamples.length &&
            frameHasBudget()
          ) {
            const [column, row] = levelSamples[levelSampleIndex];
            visitedCount += 1;
            const cell = sampleCell(standardGrid, column, row);
            const cellIndex = row * standardGrid.width + column;
            standardGrid.sampleValues[cellIndex] = cell;
            standardGrid.sampledMask[cellIndex] = 1;
            const blockColumn = column - (column % RUNTIME_PROTECTION_MAP_BLOCK_SIZE);
            const blockRow = row - (row % RUNTIME_PROTECTION_MAP_BLOCK_SIZE);
            dirtyBlocks.add(blockRow * standardGrid.width + blockColumn);
            levelSampleIndex += 1;
            completedSamples += 1;
            batchCount += 1;
          }

          dirtyBlocks.forEach((blockIndex) => {
            const blockRow = Math.floor(blockIndex / standardGrid.width);
            const blockColumn = blockIndex % standardGrid.width;
            reconstructRuntimeProtectionMapBlock(
              standardGrid.sampleValues,
              standardGrid.sampledMask,
              standardGrid.width,
              standardGrid.height,
              blockColumn,
              blockRow,
              standardGrid.reconstructed,
            );
          });

          if (levelSampleIndex >= levelSamples.length) {
            cache.completedStandardPrecision = workingPrecision;
            setProtectionRenderedPrecision(workingPrecision);
            precisionAdvanced = true;
            if (workingPrecision < standardTarget) {
              workingPrecision = (
                workingPrecision + 1
              ) as RuntimeProtectionMapStandardPrecision;
              levelSamples = buildLevelSamples(workingPrecision);
              levelSampleIndex = 0;
            } else if (targetPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION) {
              ensureSuperGrid();
            } else {
              phase = "done";
            }
          }
        } else if (phase === "super" && cache.superGrid && superSampleOrder) {
          const superGrid = cache.superGrid;
          while (
            superGrid.nextProgressiveIndex < superSampleOrder.length &&
            frameHasBudget()
          ) {
            const cellIndex = superSampleOrder[superGrid.nextProgressiveIndex];
            superGrid.nextProgressiveIndex += 1;
            visitedCount += 1;
            if (superGrid.sampledMask[cellIndex] !== 0) continue;
            const column = cellIndex % superGrid.width;
            const row = Math.floor(cellIndex / superGrid.width);
            const cell = sampleCell(superGrid, column, row);
            superGrid.sampleValues[cellIndex] = cell;
            superGrid.sampledMask[cellIndex] = 1;
            superGrid.reconstructed[cellIndex] = cell;
            completedSamples += 1;
            batchCount += 1;
          }
          if (superGrid.nextProgressiveIndex >= superSampleOrder.length) {
            phase = "done";
            setProtectionRenderedPrecision(RUNTIME_PROTECTION_MAP_SUPER_PRECISION);
            precisionAdvanced = true;
          }
        }

        const uiUpdateAt = performance.now();
        if (
          phase === "done" ||
          precisionAdvanced ||
          uiUpdateAt - lastProtectionUiUpdateAt >=
            RUNTIME_PROTECTION_MAP_UI_UPDATE_INTERVAL_MS
        ) {
          const displayGrid =
            targetPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION &&
            cache.superGrid
              ? cache.superGrid
              : standardGrid;
          paintProtectionMap(
            canvas,
            displayGrid.reconstructed,
            displayGrid.width,
            displayGrid.height,
          );
          setProtectionSampleProgress({
            completed: completedSamples,
            total: totalSamples,
          });
          lastProtectionUiUpdateAt = uiUpdateAt;
        }
        if (phase === "done") {
          host.dataset.protectionMapState = "ready";
          protectionFrame = 0;
          return;
        }
        protectionFrame = requestAnimationFrame(processBatch);
      };

      protectionFrame = requestAnimationFrame(processBatch);
    };

    const scheduleProtectionMap = (options: ProtectionMapScheduleOptions = {}) => {
      if (options.invalidate) protectionCache = null;
      cancelProtectionMap(Boolean(options.invalidate), Boolean(options.invalidate));
      if (!protectionEnabledRef.current) return;
      protectionTimer = window.setTimeout(runProtectionMap, PROTECTION_MAP_DEBOUNCE_MS);
    };
    scheduleProtectionMapRef.current = scheduleProtectionMap;
    cancelProtectionMapRef.current = () => cancelProtectionMap(true);

    let cameraFitUserLocked = false;
    let initialFitAspect = camera.aspect;
    let initialFitStabilizationPending = false;
    let initialFitStabilizationTimer = 0;
    const scheduleInitialFitStabilization = () => {
      window.clearTimeout(initialFitStabilizationTimer);
      initialFitStabilizationTimer = window.setTimeout(() => {
        initialFitStabilizationTimer = 0;
        if (!initialFitStabilizationPending || cameraFitUserLocked) return;
        initialFitStabilizationPending = false;
        if (Math.abs(camera.aspect - initialFitAspect) < 0.08) return;
        host.dataset.viewerFitStabilized = "true";
        resetViewRef.current?.({ preserveShotVisual: true });
      }, 120);
    };

    let lastAppliedCameraNavigationKey: string | null = null;
    const applyInspectionProjection = () => {
      activeCrewViewPose = null;
      if (activeCrewViewStationIdRef.current !== null) {
        activeCrewViewStationIdRef.current = null;
        setActiveCrewViewStationId(null);
      }
      infantryPreviewDistanceRef.current = null;
      setInfantryPreviewDistanceM(null);
      const horizontalFovDegrees = SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG;
      camera.fov = verticalFovForHorizontalFov(
        horizontalFovDegrees,
        camera.aspect,
      );
      camera.updateProjectionMatrix();
      host.dataset.cameraProjection = "squad-world";
      host.dataset.cameraHorizontalFovDeg = String(
        horizontalFovDegrees,
      );
      host.dataset.cameraVerticalFovDeg = String(camera.fov);
      delete host.dataset.infantryPreviewDistanceM;
      delete host.dataset.infantryPreviewHorizontalFovDeg;
      delete host.dataset.infantryPreviewVerticalFovDeg;
      delete host.dataset.infantryPreviewEyeHeightM;
      delete host.dataset.crewViewCameraStationId;
      updateCrewViewpointMarker();
    };
    const cameraNavigationKey = (state: ViewerNavigationState | undefined) => {
      if (state?.camera) return `camera:${state.camera}`;
      if (state?.yaw !== null && state?.yaw !== undefined) {
        return `legacy:${state.yaw}:${state.pitch ?? 0}`;
      }
      if (state?.pitch !== null && state?.pitch !== undefined) {
        return `legacy:0:${state.pitch}`;
      }
      return "default";
    };
    const applyCameraNavigation = (
      state: ViewerNavigationState | undefined,
      restoreDefault = true,
    ) => {
      if (fittedSource === null) return;
      const key = cameraNavigationKey(state);
      if (lastAppliedCameraNavigationKey === key) return;
      applyInspectionProjection();
      activeCameraViewRef.current = null;
      setActiveCameraView(null);
      delete host.dataset.cameraViewPreset;
      delete host.dataset.cameraViewKind;
      camera.up.set(0, 1, 0);
      if (key !== "default") {
        cameraFitUserLocked = true;
        initialFitStabilizationPending = false;
        window.clearTimeout(initialFitStabilizationTimer);
        initialFitStabilizationTimer = 0;
      }
      const sharedCamera = decodeViewerCameraState(state?.camera ?? "");
      if (sharedCamera) {
        controls.target.fromArray(sharedCamera.target);
        const spherical = new THREE.Spherical(
          sharedCamera.distance,
          THREE.MathUtils.degToRad(90 - sharedCamera.pitch),
          THREE.MathUtils.degToRad(sharedCamera.yaw),
        );
        camera.position.copy(controls.target).add(
          new THREE.Vector3().setFromSpherical(spherical),
        );
        controls.update();
      } else if (
        (state?.yaw !== null && state?.yaw !== undefined) ||
        (state?.pitch !== null && state?.pitch !== undefined)
      ) {
        const distance = camera.position.distanceTo(controls.target);
        const spherical = new THREE.Spherical(
          distance,
          THREE.MathUtils.degToRad(90 - (state?.pitch ?? 0)),
          THREE.MathUtils.degToRad(state?.yaw ?? 0),
        );
        camera.position.copy(controls.target).add(
          new THREE.Vector3().setFromSpherical(spherical),
        );
        controls.update();
      } else if (restoreDefault) {
        resetViewRef.current?.({ preserveShotVisual: true });
      }
      lastAppliedCameraNavigationKey = key;
      if (host) {
        if (state?.camera) host.dataset.cameraShareToken = state.camera;
        else delete host.dataset.cameraShareToken;
      }
      render();
    };
    applyCameraNavigationRef.current = (state) => applyCameraNavigation(state);

    const publishCameraNavigation = () => {
      if (fittedSource === null || !onNavigationStateChangeRef.current) return;
      const token = encodeViewerCameraState({
        yaw: THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()),
        pitch: 90 - THREE.MathUtils.radToDeg(controls.getPolarAngle()),
        distance: camera.position.distanceTo(controls.target),
        target: controls.target.toArray(),
      });
      if (!token) return;
      const current = navigationStateRef.current ?? {
        view: modeRef.current,
        protection: protectionEnabledRef.current,
        attacker: "",
        weapon: "",
        weaponIndex: null,
        distance: 0,
        yaw: null,
        pitch: null,
        camera: "",
        shots: "",
        turrets: "",
      };
      if (
        current.camera === token &&
        current.yaw === null &&
        current.pitch === null
      ) {
        return;
      }
      const next: ViewerNavigationState = {
        ...current,
        camera: token,
        yaw: null,
        pitch: null,
      };
      lastAppliedCameraNavigationKey = `camera:${token}`;
      host.dataset.cameraShareToken = token;
      navigationStateRef.current = next;
      onNavigationStateChangeRef.current(next);
    };

    const onControlsChange = () => {
      requestRender();
    };
    const onControlsStart = () => {
      cameraFitUserLocked = true;
      initialFitStabilizationPending = false;
      window.clearTimeout(initialFitStabilizationTimer);
      initialFitStabilizationTimer = 0;
      setRealtimePointer(null);
      applyInspectionProjection();
      activeCameraViewRef.current = null;
      setActiveCameraView(null);
      delete host.dataset.cameraViewPreset;
      delete host.dataset.cameraViewKind;
      protectionCache = null;
      if (protectionEnabledRef.current) cancelProtectionMap(true, false);
    };
    const onControlsEnd = () => {
      if (infantryPreviewDistanceRef.current === null) {
        publishCameraNavigation();
      }
      if (protectionEnabledRef.current) {
        scheduleProtectionMap({ invalidate: true });
      }
    };
    controls.addEventListener("start", onControlsStart);
    controls.addEventListener("change", onControlsChange);
    controls.addEventListener("end", onControlsEnd);
    let rendererWidth = 0;
    let rendererHeight = 0;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const sizeChanged = width !== rendererWidth || height !== rendererHeight;
      rendererWidth = width;
      rendererHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const horizontalFovDegrees = activeCrewViewPose
        ?.horizontalFovDegrees ?? SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG;
      camera.fov = verticalFovForHorizontalFov(
        horizontalFovDegrees,
        camera.aspect,
      );
      camera.updateProjectionMatrix();
      host.dataset.cameraHorizontalFovDeg = String(
        horizontalFovDegrees,
      );
      host.dataset.cameraVerticalFovDeg = String(camera.fov);
      if (infantryPreviewDistanceRef.current !== null) {
        host.dataset.infantryPreviewVerticalFovDeg = String(camera.fov);
      }
      render();
      if (sizeChanged) protectionCache = null;
      if (sizeChanged && initialFitStabilizationPending) {
        scheduleInitialFitStabilization();
      }
      if (protectionEnabledRef.current) {
        scheduleProtectionMap({ invalidate: sizeChanged });
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const fitViewToGroup = (
      targetGroup: THREE.Object3D,
      source: "hit" | "analysis" | "exterior",
      {
        force = false,
        preserveCamera = false,
      }: { force?: boolean; preserveCamera?: boolean } = {},
    ) => {
      if (fittedSource !== null && !force) return;
      modelGroup.position.set(0, 0, 0);
      modelGroup.updateMatrixWorld(true);
      targetGroup.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(targetGroup);
      if (bounds.isEmpty()) throw new Error(`Loaded ${source} package produced an empty scene`);
      const modelLengthM = bounds.max.x - bounds.min.x;
      const modelWidthM = bounds.max.z - bounds.min.z;
      const groundReferenceClearanceM = runtimeGroundReferenceClearanceM(
        modelLengthM,
        modelWidthM,
      );
      const runtimePoseGroundActive =
        chassisPose !== null && physicalPoseEnabledRef.current;
      let referenceSoldierBounds: THREE.Box3 | null = null;
      if (referenceSoldier) {
        referenceSoldier.position.set(0, 0, 0);
        referenceSoldier.updateMatrixWorld(true);
        const initialSoldierBounds = new THREE.Box3().setFromObject(
          referenceSoldier,
        );
        const soldierSize = initialSoldierBounds.getSize(new THREE.Vector3());
        const soldierCenter = initialSoldierBounds.getCenter(
          new THREE.Vector3(),
        );
        referenceSoldier.position.set(
          bounds.min.x
            - groundReferenceClearanceM
            - soldierSize.x / 2
            - soldierCenter.x,
          (runtimePoseGroundActive ? 0 : bounds.min.y) -
            initialSoldierBounds.min.y,
          bounds.min.z
            - groundReferenceClearanceM
            - soldierSize.z / 2
            - soldierCenter.z,
        );
        referenceSoldier.updateMatrixWorld(true);
        referenceSoldierBounds = new THREE.Box3().setFromObject(
          referenceSoldier,
        );
        host.dataset.referenceSoldierRearX = String(
          bounds.min.x - groundReferenceClearanceM,
        );
        host.dataset.referenceSoldierRightZ = String(
          bounds.min.z - groundReferenceClearanceM,
        );
        host.dataset.referenceSoldierSide = "right";
        delete host.dataset.referenceSoldierLeftZ;
        host.dataset.referenceSoldierHeightM = String(soldierSize.y);
        host.dataset.referenceSoldierClearanceM = String(
          groundReferenceClearanceM,
        );
      }
      const fitBounds = bounds.clone();
      if (referenceSoldierBounds) fitBounds.union(referenceSoldierBounds);
      const center = fitBounds.getCenter(new THREE.Vector3());
      const vehicleCameraTarget = bounds
        .getCenter(new THREE.Vector3())
        .sub(center);
      const sphere = fitBounds.getBoundingSphere(new THREE.Sphere());
      modelGroup.position.sub(center);
      modelGroup.updateMatrixWorld(true);
      const radius = Math.max(
        sphere.radius,
        compactPortableDrone ? 0.3 : 2.5,
      );
      const groundY = runtimePoseGroundActive
        ? modelGroup.position.y
        : Math.min(
            bounds.min.y,
            referenceSoldierBounds?.min.y ?? bounds.min.y,
          ) -
          center.y -
          0.03;
      if (gridHelper) {
        scene.remove(gridHelper);
        disposeScene(gridHelper);
      }
      if (groundScale) {
        scene.remove(groundScale);
        disposeScene(groundScale);
      }
      host.dataset.referencePlaneY = String(groundY);
      host.dataset.referencePlaneAuthority = runtimePoseGroundActive
        ? "runtime-probe-map"
        : "geometry-bounds";
      const groundScaleOriginWorldX = referenceSoldierBounds
        ? (referenceSoldierBounds.min.x + referenceSoldierBounds.max.x) / 2
        : bounds.min.x - groundReferenceClearanceM;
      const groundScaleOriginWorldZ = referenceSoldierBounds
        ? (referenceSoldierBounds.min.z + referenceSoldierBounds.max.z) / 2
        : bounds.min.z - groundReferenceClearanceM;
      const groundScaleLengthSpanM = Math.max(
        modelLengthM,
        bounds.max.x - groundScaleOriginWorldX,
      );
      const groundScaleWidthSpanM = Math.max(
        modelWidthM,
        bounds.max.z - groundScaleOriginWorldZ,
      );
      const groundScaleLengthM = runtimeGroundScaleLengthM(
        groundScaleLengthSpanM,
      );
      const groundScaleWidthM = runtimeGroundScaleLengthM(
        groundScaleWidthSpanM,
      );
      const groundGridSpacingM = RUNTIME_GROUND_SCALE_TICK_INTERVAL_M;
      const groundGridDivisions = Math.max(
        1,
        Math.ceil(
          Math.max(radius * 4, groundScaleLengthM, groundScaleWidthM) /
            groundGridSpacingM,
        ),
      );
      const groundGridSizeM = groundGridDivisions * groundGridSpacingM;
      gridHelper = new THREE.GridHelper(
        groundGridSizeM,
        groundGridDivisions,
        0x555555,
        0x292929,
      );
      groundScale = createRuntimeGroundScale(
        groundScaleLengthM,
        groundScaleWidthM,
      );
      const groundScaleOriginX = groundScaleOriginWorldX - center.x;
      const groundScaleOriginZ = groundScaleOriginWorldZ - center.z;
      groundScale.position.set(
        groundScaleOriginX,
        groundY + 0.006,
        groundScaleOriginZ,
      );
      gridHelper.position.set(groundScaleOriginX, groundY, groundScaleOriginZ);
      scene.add(gridHelper);
      host.dataset.groundScaleGridAlignment = "reference-soldier-feet";
      host.dataset.groundScaleGridSpacingM = String(groundGridSpacingM);
      host.dataset.groundScaleLengthM = String(groundScaleLengthM);
      host.dataset.groundScaleWidthM = String(groundScaleWidthM);
      host.dataset.vehicleLengthM = String(modelLengthM);
      host.dataset.vehicleWidthM = String(modelWidthM);
      const groundScaleLengthSegments =
        groundScaleLengthM / RUNTIME_GROUND_SCALE_TICK_INTERVAL_M;
      const groundScaleWidthSegments =
        groundScaleWidthM / RUNTIME_GROUND_SCALE_TICK_INTERVAL_M;
      host.dataset.groundScaleSegments = String(
        groundScaleLengthSegments + groundScaleWidthSegments,
      );
      host.dataset.groundScaleLengthSegments = String(
        groundScaleLengthSegments,
      );
      host.dataset.groundScaleWidthSegments = String(
        groundScaleWidthSegments,
      );
      host.dataset.groundScaleTickIntervalM = String(
        RUNTIME_GROUND_SCALE_TICK_INTERVAL_M,
      );
      host.dataset.groundScaleLabelIntervalM = String(
        RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M,
      );
      host.dataset.groundScaleLabelFacing = "vehicle-forward-positive-x";
      host.dataset.groundScaleAxes = "length,width";
      host.dataset.groundScaleLayout = "two-axis";
      host.dataset.groundScaleSpanBasis =
        "reference-origin-to-opposite-vehicle-bounds";
      host.dataset.groundScaleOrigin = referenceSoldierBounds
        ? "reference-soldier-feet"
        : "vehicle-bounds-outer-corner-fallback";
      host.dataset.groundScaleDirection =
        "toward-vehicle-positive-x-positive-z";
      host.dataset.groundScaleVehicleClearanceM = String(
        groundReferenceClearanceM,
      );
      host.dataset.groundScaleDepthMode = "overlay";
      host.dataset.groundScaleOriginX = String(groundScaleOriginX);
      host.dataset.groundScaleOriginY = String(groundY + 0.006);
      host.dataset.groundScaleOriginZ = String(groundScaleOriginZ);
      scene.add(groundScale);
      const updateCameraRangeAndFitEvidence = () => {
        const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFovRadians = 2 * Math.atan(
          Math.tan(verticalFovRadians / 2) * Math.max(camera.aspect, 0.0001),
        );
        const fitFovRadians = Math.min(
          verticalFovRadians,
          horizontalFovRadians,
        );
        const fitDistance =
          (radius / Math.sin(fitFovRadians / 2)) * 1.18;
        host.dataset.viewerFit = JSON.stringify({
          source,
          physicalPose: runtimePoseGroundActive ? "settled" : "static",
          bounds: {
            min: { x: fitBounds.min.x, y: fitBounds.min.y, z: fitBounds.min.z },
            max: { x: fitBounds.max.x, y: fitBounds.max.y, z: fitBounds.max.z },
          },
          radius,
          aspect: camera.aspect,
          fitDistance,
          margin: 1.18,
        });
        camera.near = Math.max(radius / 300, 0.02);
        camera.far = radius * 30;
        controls.maxDistance = Math.max(40, radius * 50);
        camera.updateProjectionMatrix();
        return fitDistance;
      };
      const resetView = (
        { preserveShotVisual = false }: { preserveShotVisual?: boolean } = {},
      ) => {
        protectionCache = null;
        applyInspectionProjection();
        activeCameraViewRef.current = null;
        setActiveCameraView(null);
        delete host.dataset.cameraViewPreset;
        delete host.dataset.cameraViewKind;
        camera.up.set(0, 1, 0);
        controls.target.set(0, 0, 0);
        const fitDistance = updateCameraRangeAndFitEvidence();
        camera.position.copy(
          new THREE.Vector3(1.7, 1.25, -2.7).normalize().multiplyScalar(fitDistance),
        );
        controls.update();
        if (!preserveShotVisual) clearShotVisual();
        render();
        if (protectionEnabledRef.current) {
          scheduleProtectionMap({ invalidate: true });
        }
      };
      const applySquadPerspective = (
        distanceM: number,
        viewId: RuntimeViewerCameraViewId | null,
      ) => {
        const safeDistanceM = Math.min(600, Math.max(1, distanceM));
        const preset = viewId === null
          ? null
          : RUNTIME_VIEWER_CAMERA_VIEWS.find(({ id }) => id === viewId) ?? null;
        if (viewId !== null && !preset) return;
        applyInspectionProjection();
        protectionCache = null;
        cameraFitUserLocked = true;
        initialFitStabilizationPending = false;
        window.clearTimeout(initialFitStabilizationTimer);
        initialFitStabilizationTimer = 0;
        infantryPreviewDistanceRef.current = safeDistanceM;
        setInfantryPreviewDistanceM(safeDistanceM);
        activeCameraViewRef.current = viewId;
        setActiveCameraView(viewId);
        camera.up.set(0, 1, 0);
        if (preset) {
          const pose = runtimeViewerCameraPose({
            viewId: preset.id,
            distanceM: safeDistanceM,
            groundY,
            vehicleTarget: vehicleCameraTarget.toArray(),
          });
          controls.target.fromArray(pose.target);
          camera.position.fromArray(pose.position);
          host.dataset.cameraViewPreset = preset.id;
          host.dataset.cameraViewKind = preset.kind;
        } else {
          const currentOffset = camera.position.clone().sub(controls.target);
          currentOffset.y = 0;
          const yawDegrees = currentOffset.lengthSq() > 0.000001
            ? THREE.MathUtils.radToDeg(Math.atan2(currentOffset.x, currentOffset.z))
            : 90;
          const basePosition = runtimeViewerInfantryCameraPosition({
            yawDegrees,
            distanceM: safeDistanceM,
            groundY,
          });
          controls.target.set(
            vehicleCameraTarget.x,
            basePosition[1],
            vehicleCameraTarget.z,
          );
          camera.position.set(
            vehicleCameraTarget.x + basePosition[0],
            basePosition[1],
            vehicleCameraTarget.z + basePosition[2],
          );
          delete host.dataset.cameraViewPreset;
          host.dataset.cameraViewKind = "soldier-ground";
        }
        camera.fov = verticalFovForHorizontalFov(
          SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
          camera.aspect,
        );
        camera.near = Math.max(radius / 300, 0.02);
        camera.far = Math.max(1000, safeDistanceM * 2 + radius * 8);
        controls.maxDistance = Math.max(600, radius * 50);
        camera.updateProjectionMatrix();
        controls.update();
        host.dataset.cameraProjection = preset?.kind === "overhead"
          ? "squad-overhead-world"
          : "squad-infantry-world";
        host.dataset.cameraHorizontalFovDeg = String(
          SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
        );
        host.dataset.cameraVerticalFovDeg = String(camera.fov);
        host.dataset.infantryPreviewDistanceM = String(safeDistanceM);
        host.dataset.infantryPreviewHorizontalFovDeg = String(
          SQUAD_INFANTRY_DEFAULT_HORIZONTAL_FOV_DEG,
        );
        host.dataset.infantryPreviewVerticalFovDeg = String(camera.fov);
        if (preset?.kind === "overhead") {
          delete host.dataset.infantryPreviewEyeHeightM;
        } else {
          host.dataset.infantryPreviewEyeHeightM = String(
            camera.position.y - groundY,
          );
        }
        render();
        publishCameraNavigation();
        if (protectionEnabledRef.current) {
          scheduleProtectionMap({ invalidate: true });
        }
      };
      const applyInspectionView = (viewId: RuntimeViewerCameraViewId) => {
        applySquadPerspective(
          infantryPreviewDistanceRef.current ??
            RUNTIME_VIEWER_INFANTRY_DISTANCES_M[0],
          viewId,
        );
      };
      const applyInfantryDistancePreview = (distanceM: number) => {
        applySquadPerspective(distanceM, activeCameraViewRef.current);
      };
      const enterFreeCameraView = () => {
        protectionCache = null;
        applyInspectionProjection();
        activeCameraViewRef.current = null;
        setActiveCameraView(null);
        delete host.dataset.cameraViewPreset;
        delete host.dataset.cameraViewKind;
        camera.up.set(0, 1, 0);
        controls.update();
        render();
        publishCameraNavigation();
        if (protectionEnabledRef.current) {
          scheduleProtectionMap({ invalidate: true });
        }
      };
      const enterCrewViewpoint = (stationId: string) => {
        const station = runtimeTurretStationsRef.current.find(
          ({ id }) => id === stationId,
        );
        const pose = station ? crewPoseForStation(station) : null;
        if (!station || !pose) return false;
        cameraFitUserLocked = true;
        initialFitStabilizationPending = false;
        window.clearTimeout(initialFitStabilizationTimer);
        initialFitStabilizationTimer = 0;
        activeTurretStationIdRef.current = station.id;
        setActiveTurretStationId(station.id);
        activeCrewViewStationIdRef.current = station.id;
        setActiveCrewViewStationId(station.id);
        crewOccupantHolder.visible = false;
        crewOccupantLayer?.setVisible(false);
        host.dataset.crewOccupantVisible = "false";
        host.dataset.crewViewCameraStationId = station.id;
        setRealtimePointer(null);
        activeCrewViewZoomIndexRef.current = 0;
        applyCrewViewCameraPose(station, pose, 0);
        updateCrewViewpointMarker();
        render();
        return true;
      };
      const applyCrewViewZoom = (stationId: string, zoomIndex: number) => {
        if (activeCrewViewStationIdRef.current !== stationId) return false;
        const station = runtimeTurretStationsRef.current.find(
          ({ id }) => id === stationId,
        );
        const pose = station ? crewPoseForStation(station) : null;
        const horizontalFovDegrees = station?.view
          ? crewViewHorizontalFovForZoom(station.view, zoomIndex)
          : null;
        if (!station || !pose || horizontalFovDegrees === null) return false;
        activeCrewViewZoomIndexRef.current = zoomIndex;
        applyCrewViewCameraPose(station, pose, zoomIndex);
        render();
        return true;
      };
      const exitCrewViewpoint = () => {
        activeCrewViewStationIdRef.current = null;
        setActiveCrewViewStationId(null);
        activeCrewViewZoomIndexRef.current = 0;
        activeCrewViewPose = null;
        delete host.dataset.crewViewCameraStationId;
        delete host.dataset.cameraZoomIndex;
        delete host.dataset.cameraZoomMagnification;
        delete host.dataset.cameraZoomHorizontalFovDeg;
        const showCrew = crewOccupantDisplayEnabledRef.current;
        crewOccupantHolder.visible = showCrew;
        crewOccupantLayer?.setVisible(showCrew);
        host.dataset.crewOccupantVisible = String(showCrew);
        resetView({ preserveShotVisual: true });
        updateCrewViewpointMarker();
      };
      resetViewRef.current = resetView;
      applyCameraViewPresetRef.current = applyInspectionView;
      applyInfantryDistancePreviewRef.current = applyInfantryDistancePreview;
      enterFreeCameraViewRef.current = enterFreeCameraView;
      enterCrewViewpointRef.current = enterCrewViewpoint;
      exitCrewViewpointRef.current = exitCrewViewpoint;
      applyCrewViewZoomRef.current = applyCrewViewZoom;
      fittedSource = source;
      if (preserveCamera) {
        clearShotVisual();
        const activeInfantryDistanceM = infantryPreviewDistanceRef.current;
        if (activeInfantryDistanceM !== null) {
          applyInfantryDistancePreview(activeInfantryDistanceM);
        } else {
          protectionCache = null;
          controls.target.set(0, 0, 0);
          updateCameraRangeAndFitEvidence();
          controls.update();
          render();
          if (protectionEnabledRef.current) {
            scheduleProtectionMap({ invalidate: true });
          }
        }
      } else {
        resetView();
        initialFitAspect = camera.aspect;
        initialFitStabilizationPending = true;
        scheduleInitialFitStabilization();
        lastAppliedCameraNavigationKey = null;
        applyCameraNavigation(navigationStateRef.current, false);
      }
      host.dataset.viewerInitialFitState = "ready";
      setInitialCameraFitReady(true);
      if (modeRef.current === "exterior") {
        startExteriorAssets?.();
      }
    };

    const loadReferenceSoldierAsset = () => {
      referenceSoldierIdleCallback = 0;
      referenceSoldierLoadTimer = 0;
      host.dataset.referenceSoldierState = "loading";
      void import("./runtime-reference-soldier")
      .then(({ loadRuntimeReferenceSoldier }) => loadRuntimeReferenceSoldier())
      .then(({ scene: soldierScene, modelUrl, glassRebind }) => {
        if (cancelled) {
          disposeScene(soldierScene);
          return;
        }
        host.dataset.referenceSoldierModelUrl = modelUrl;
        const soldierBounds = new THREE.Box3().setFromObject(soldierScene);
        const soldierCenter = soldierBounds.getCenter(new THREE.Vector3());
        const proxy = referenceSoldier;
        if (proxy) {
          modelGroup.updateMatrixWorld(true);
          const inverseModelMatrix = modelGroup.matrixWorld.clone().invert();
          const proxyBounds = new THREE.Box3()
            .setFromObject(proxy)
            .applyMatrix4(inverseModelMatrix);
          const proxyCenter = proxyBounds.getCenter(new THREE.Vector3());
          soldierScene.position.set(
            proxyCenter.x - soldierCenter.x,
            proxyBounds.min.y - soldierBounds.min.y,
            proxyCenter.z - soldierCenter.z,
          );
          modelGroup.remove(proxy);
          disposeScene(proxy);
        }
        referenceSoldier = soldierScene;
        soldierScene.visible = !crewOccupantDisplayEnabledRef.current;
        modelGroup.add(soldierScene);
        host.dataset.referenceSoldierState = "ready";
        host.dataset.referenceSoldierPose = "standing-rifle";
        host.dataset.referenceSoldierGlassMeshes = String(
          glassRebind.reboundMeshCount,
        );
        host.dataset.referenceSoldierGlassVertices = String(
          glassRebind.reboundVertexCount,
        );
        render();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.dataset.referenceSoldierState = "proxy-error";
        host.dataset.referenceSoldierError =
          error instanceof Error ? error.message : String(error);
      });
    };
    startReferenceSoldierAsset = () => {
      if (renderQuality.tier === "compatibility") {
        host.dataset.referenceSoldierState = "outline-compatibility";
        return;
      }
      if (referenceSoldierLoadScheduled) return;
      referenceSoldierLoadScheduled = true;
      host.dataset.referenceSoldierState = "scheduled";
      if (typeof window.requestIdleCallback === "function") {
        referenceSoldierIdleCallback = window.requestIdleCallback(
          loadReferenceSoldierAsset,
          { timeout: 1_500 },
        );
        return;
      }
      referenceSoldierLoadTimer = window.setTimeout(loadReferenceSoldierAsset, 0);
    };

    const lowerReferencePlaneToGroup = (
      targetGroup: THREE.Object3D,
      datasetPrefix: "exterior" | "analysis",
    ) => {
      if (!gridHelper) return;
      targetGroup.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(targetGroup);
      if (bounds.isEmpty()) return;
      host.dataset[`${datasetPrefix}BoundsMinY`] = String(bounds.min.y);
      if (chassisPose !== null && physicalPoseEnabledRef.current) return;
      const requiredGroundY = bounds.min.y - 0.03;
      gridHelper.position.y = Math.min(gridHelper.position.y, requiredGroundY);
      host.dataset.referencePlaneY = String(gridHelper.position.y);
      host.dataset.referencePlaneAuthority = "geometry-bounds";
    };

    const applyChassisPose = (enabled: boolean) => {
      physicalPoseEnabledRef.current = enabled;
      applyChassisPoseMatrix(enabled);
      applySkeletalPose(enabled);
      applyTurretPose();
      setRealtimePointer(null);
      protectionCache = null;
      modelGroup.updateMatrixWorld(true);
      render();
      if (protectionEnabledRef.current) {
        scheduleProtectionMap({ invalidate: true });
      }
    };
    applyChassisPoseRef.current = applyChassisPose;

    const normalizedPointerForEvent = (event: Pick<PointerEvent, "clientX" | "clientY">) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      return { bounds, pointer };
    };
    const explosionGroundFloorY = () => (gridHelper?.position.y ?? 0) + 0.02;
    const explosionGroundPoint = (normalizedPointer: THREE.Vector2) => {
      raycaster.setFromCamera(normalizedPointer, camera);
      return raycaster.ray.intersectPlane(
        new THREE.Plane(
          new THREE.Vector3(0, 1, 0),
          -explosionGroundFloorY(),
        ),
        new THREE.Vector3(),
      );
    };
    const clearExplosionPlacementPreview = () => {
      lastPlacementPointer = null;
      pendingPlacementPointer = null;
      cancelAnimationFrame(placementPreviewFrame);
      placementPreviewFrame = 0;
      setExplosionPlacementCoverage(null);
      explosionPlacementPreview.root.visible = false;
      explosionPlacementPreview.areaDiscs.forEach((disc) => {
        disc.visible = false;
      });
      explosionPlacementPreview.exactRadiusRings.forEach((ring) => {
        ring.visible = false;
      });
      delete host.dataset.explosionPlacementWorldM;
      delete host.dataset.explosionPlacementRadiiM;
      delete host.dataset.explosionPlacementCoverage;
      applySettledShotDamageHighlight(activeShotIdRef.current);
      requestRender();
    };
    const updateExplosionPlacementPreview = (
      normalizedPointer: THREE.Vector2 | null = lastPlacementPointer,
    ) => {
      if (normalizedPointer) lastPlacementPointer = normalizedPointer.clone();
      const weaponModel = attackModelRef.current;
      const selectedWeaponIndex = weaponIndexRef.current;
      const activeRecord = shotRecordsRef.current.find(
        (record) => record.shotId === activeShotIdRef.current,
      );
      if (
        !lastPlacementPointer ||
        !selectedWeaponHasExplosionRef.current ||
        !weaponModel ||
        selectedWeaponIndex < 0 ||
        (
          activeRecord &&
          activeRecord.result.ballistics.explosiveLayers.length > 0
        )
      ) {
        explosionPlacementPreview.root.visible = false;
        requestRender();
        return null;
      }
      const ballistics = resolveEditorNativeBallistics(
        weaponModel,
        selectedWeaponIndex,
        targetDistanceRef.current,
      );
      const origin = explosionGroundPoint(lastPlacementPointer);
      if (!origin || ballistics.explosiveLayers.length === 0) {
        explosionPlacementPreview.root.visible = false;
        requestRender();
        return null;
      }
      explosionPlacementPreview.root.position.copy(origin);
      explosionPlacementPreview.areaDiscs.forEach((disc, layerIndex) => {
        const layer = ballistics.explosiveLayers[layerIndex];
        disc.visible = Boolean(layer);
        if (layer) disc.scale.setScalar(Math.max(0.001, layer.outerRadiusCm / 100));
      });
      explosionPlacementPreview.exactRadiusRings.forEach((ring, layerIndex) => {
        const layer = ballistics.explosiveLayers[layerIndex];
        ring.visible = Boolean(layer);
        if (layer) ring.scale.setScalar(Math.max(0.001, layer.outerRadiusCm / 100));
      });
      explosionPlacementPreview.root.visible = false;
      const parsed = parsedHitRef.current;
      let coverageState: "covered" | "clear" | "unknown" = "unknown";
      let highlightedComponentIndices: number[] = [];
      if (parsed && radialQueryRef.current && hitGroupRef.current) {
        const previewResult = simulatePublishedRadialShot({
          model: parsed.header,
          weaponModel,
          weaponIndex: selectedWeaponIndex,
          targetDistanceM: targetDistanceRef.current,
          shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
          intersections: [],
          includeRadial: true,
          vehicleDamagedByRadial: referenceData?.general.isDamagedByRadial ?? null,
          radialDamageModel: referenceData?.radialDamageModel ?? null,
        }, origin.toArray() as [number, number, number]);
        const radialDamageEvents = previewResult.damage.filter(
          (event) => event.damageKind === "radial",
        );
        coverageState = radialDamageCoverageState(previewResult);
        const coveragePlan = buildRadialDamageVisualizationPlan(
          previewResult,
          parsed.header.components,
        );
        highlightedComponentIndices = [...new Set([
          ...(coveragePlan?.outcomes.flatMap(
            (outcome) => outcome.componentIndices,
          ) ?? []),
          ...radialDamageEvents.map((event) => event.sourceComponentIndex),
        ])].filter(
          (componentIndex) =>
            componentIndex >= 0 && componentIndex < parsed.header.components.length,
        );
      }
      const coverageColor = coverageState === "covered"
        ? 0x84e2d9
        : coverageState === "clear"
          ? 0xff8d78
          : 0xffd67f;
      explosionPlacementPreview.originCore.material.color.setHex(
        coverageState === "covered" ? 0xe5fffb : coverageColor,
      );
      explosionPlacementPreview.originHalo.material.color.setHex(coverageColor);
      setExplosionPlacementCoverage(coverageState);
      host.dataset.explosionPlacementCoverage = coverageState;
      const hitModel = hitModelRef.current;
      if (
        hitModel &&
        coverageState === "covered" &&
        highlightedComponentIndices.length > 0
      ) {
        setHitSceneThreeModelDamageHighlight(hitModel, {
          componentIndices: highlightedComponentIndices,
          colorHex: 0x84e2d9,
          strength: 0.62,
        });
      } else if (hitModel) {
        clearHitSceneThreeModelDamageHighlight(hitModel);
      }
      host.dataset.explosionPlacementWorldM = origin.toArray().join(",");
      host.dataset.explosionPlacementRadiiM = ballistics.explosiveLayers
        .map((layer) => layer.outerRadiusCm / 100)
        .join(",");
      requestRender();
      return origin;
    };
    const scheduleExplosionPlacementPreview = (
      normalizedPointer: THREE.Vector2,
    ) => {
      pendingPlacementPointer = normalizedPointer.clone();
      if (placementPreviewFrame !== 0) return;
      placementPreviewFrame = requestAnimationFrame(() => {
        placementPreviewFrame = 0;
        const nextPointer = pendingPlacementPointer;
        pendingPlacementPointer = null;
        if (nextPointer) updateExplosionPlacementPreview(nextPointer);
      });
    };
    refreshExplosionPlacementPreviewRef.current = () => {
      updateExplosionPlacementPreview();
    };
    clearExplosionPlacementPreviewRef.current = clearExplosionPlacementPreview;
    const pickExplosionDragHandle = (event: PointerEvent) => {
      const activeRecord = shotRecordsRef.current.find(
        (record) => record.shotId === activeShotIdRef.current,
      );
      const layer = activeRecord?.visual.explosionLayers.find(
        (candidate) => candidate.configured && candidate.root.visible,
      );
      if (!activeRecord || !layer) return null;
      normalizedPointerForEvent(event);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(layer.dragHitArea, false).length > 0
        ? { record: activeRecord, layer }
        : null;
    };
    const flushExplosionDrag = () => {
      explosionDragFrame = 0;
      if (!explosionDrag?.pendingOrigin) return;
      const origin = explosionDrag.pendingOrigin;
      explosionDrag.pendingOrigin = null;
      setShotExplosionOriginRef.current(explosionDrag.shotId, origin);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        const pickedExplosion = pickExplosionDragHandle(event);
        if (pickedExplosion) {
          const origin = pickedExplosion.layer.root.getWorldPosition(
            new THREE.Vector3(),
          );
          explosionDrag = {
            pointerId: event.pointerId,
            shotId: pickedExplosion.record.shotId,
            plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -origin.y),
            pendingOrigin: null,
          };
          pointerStart = null;
          controls.enabled = false;
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.setProperty("cursor", "grabbing");
          host.dataset.shotExplosionOriginDrag = "active";
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (explosionDrag?.pointerId === event.pointerId) {
        normalizedPointerForEvent(event);
        raycaster.setFromCamera(pointer, camera);
        const origin = raycaster.ray.intersectPlane(
          explosionDrag.plane,
          new THREE.Vector3(),
        );
        if (origin) {
          origin.y = Math.max(origin.y, explosionGroundFloorY());
          explosionDrag.pendingOrigin = origin.toArray() as [number, number, number];
          if (explosionDragFrame === 0) {
            explosionDragFrame = requestAnimationFrame(flushExplosionDrag);
          }
        }
        return;
      }
      if (event.buttons !== 0) {
        setRealtimePointer(null);
        return;
      }
      const { pointer: placementPointer } = normalizedPointerForEvent(event);
      if (selectedWeaponHasExplosionRef.current) {
        scheduleExplosionPlacementPreview(placementPointer);
      } else if (explosionPlacementPreview.root.visible) {
        clearExplosionPlacementPreview();
      }
      pendingHover = { clientX: event.clientX, clientY: event.clientY };
      if (pickExplosionDragHandle(event)) {
        pendingHover = null;
        cancelAnimationFrame(hoverFrame);
        hoverFrame = 0;
        renderer.domElement.style.setProperty("cursor", "grab");
        setRealtimePointer(null);
        return;
      }
      renderer.domElement.style.setProperty(
        "cursor",
        selectedWeaponHasExplosionRef.current ? "crosshair" : "",
      );
      if (hoverFrame !== 0) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const hover = pendingHover;
        pendingHover = null;
        const parsed = parsedHitRef.current;
        const weaponModel = attackModelRef.current;
        if (!hover || !parsed || !weaponModel || weaponIndexRef.current < 0) {
          setRealtimePointer(null);
          return;
        }
        const { bounds, pointer: hoverPointer } = normalizedPointerForEvent(hover);
        const intersections = collectIntersections(hoverPointer);
        if (intersections.length === 0) {
          setRealtimePointer(null);
          return;
        }
        const result = simulateEditorNativeShot({
          model: parsed.header,
          weaponModel,
          weaponIndex: weaponIndexRef.current,
          targetDistanceM: targetDistanceRef.current,
          shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
          intersections,
          includeRadial: true,
          vehicleDamagedByRadial: referenceData?.general.isDamagedByRadial ?? null,
          radialDamageModel: referenceData?.radialDamageModel ?? null,
        });
        const firstLayer = result.layers[0];
        const stoppedLayer = result.stoppedAtLayer === null
          ? null
          : result.layers[result.stoppedAtLayer] ?? null;
        const vehicleDamage = result.damage.filter(isEditorNativeVehicleDamageEvent);
        const componentOnlyDamage = result.damage.filter(isEditorNativeComponentOnlyDamageEvent);
        const fill = vehicleDamage.some((damage) => damage.poolKind === "ammo-rack")
          ? "ammo-rack"
          : vehicleDamage.some((damage) => damage.poolKind === "engine")
            ? "engine"
            : null;
        const outline: RuntimePointerOutline = result.resolution === "native-unknown"
          ? "unknown"
          : vehicleDamage.length > 0
            ? "damage"
            : componentOnlyDamage.length > 0
              ? "component-damage-no-vehicle"
              : result.stoppedAtLayer !== null
                ? stoppedLayer && isRuntimeForcedRicochetLayer(stoppedLayer)
                  ? "blocked-effective"
                  : "blocked-absolute"
                : result.layers.length > 0
                  ? "penetrated-no-damage"
                  : "unknown";
        const rawThicknessMm = firstLayer?.armorThicknessMm ?? null;
        const incidenceFactor = firstLayer?.incidenceFactor ?? null;
        const componentLabels = [...new Set(result.layers.slice(0, 3).map((layer) => {
          const component = parsed.header.components[layer.componentIndex];
          return component
            ? playerHitComponentLabel(component)
            : "车辆部件";
        }))];
        const x = hover.clientX - bounds.left;
        const y = hover.clientY - bounds.top;
        setRealtimePointer({
          x,
          y,
          placement: x > bounds.width * 0.62 ? "left" : "right",
          outline,
          fill,
          angleDeg: incidenceFactor === null
            ? null
            : THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(incidenceFactor, -1, 1))),
          rawThicknessMm,
          effectiveThicknessMm: rawThicknessMm === null || incidenceFactor === null || incidenceFactor <= 0
            ? null
            : rawThicknessMm / incidenceFactor,
          componentLabels,
        });
      });
    };
    const onPointerLeave = () => {
      if (explosionDrag) return;
      pendingHover = null;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      clearExplosionPlacementPreview();
      renderer.domElement.style.removeProperty("cursor");
      setRealtimePointer(null);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (explosionDrag?.pointerId === event.pointerId) {
        if (explosionDragFrame !== 0) {
          cancelAnimationFrame(explosionDragFrame);
          flushExplosionDrag();
        }
        explosionDrag = null;
        controls.enabled = true;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        renderer.domElement.style.setProperty("cursor", "grab");
        host.dataset.shotExplosionOriginDrag = "settled";
        return;
      }
      if (!pointerStart) {
        pointerStart = null;
        return;
      }
      const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (movement > SHOT_GESTURE_THRESHOLD_PX) return;
      const { pointer: shotPointer } = normalizedPointerForEvent(event);
      const parsed = parsedHitRef.current;
      if (!parsed) {
        if (!selectedWeaponHasExplosionRef.current) return;
        const origin = explosionGroundPoint(shotPointer);
        if (!origin) return;
        raycaster.setFromCamera(shotPointer, camera);
        pendingExplosionPlacementRef.current = {
          originM: origin.toArray() as [number, number, number],
          rayOrigin: raycaster.ray.origin.clone(),
          rayDirection: raycaster.ray.direction.clone(),
        };
        host.dataset.explosionPlacementState = "queued";
        return;
      }
      const intersections = analysisMeshRef.current
        ? collectIntersections(shotPointer)
        : [];
      if (intersections.length === 0) {
        if (!selectedWeaponHasExplosionRef.current) return;
        const origin = explosionGroundPoint(shotPointer);
        if (!origin) return;
        clearExplosionPlacementPreview();
        raycaster.setFromCamera(shotPointer, camera);
        saveExplosionOriginRef.current(
          origin.toArray() as [number, number, number],
          raycaster.ray.origin,
          raycaster.ray.direction,
        );
        return;
      }
      clearExplosionPlacementPreview();
      saveRayShot({
        intersections,
        rayOrigin: raycaster.ray.origin,
        rayDirection: raycaster.ray.direction,
        distanceM: targetDistanceRef.current,
      });
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (explosionDrag?.pointerId !== event.pointerId) return;
      explosionDrag = null;
      controls.enabled = true;
      cancelAnimationFrame(explosionDragFrame);
      cancelAnimationFrame(placementPreviewFrame);
      explosionDragFrame = 0;
      delete host.dataset.shotExplosionOriginDrag;
    };
    const onExplosionWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      const record = shotRecordsRef.current.find(
        (candidate) => candidate.shotId === activeShotIdRef.current,
      );
      if (!record?.radialOriginOverrideM) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY < 0 ? 1 : -1;
      setShotExplosionOriginRef.current(record.shotId, [
        record.radialOriginOverrideM[0],
        Math.max(
          explosionGroundFloorY(),
          record.radialOriginOverrideM[1] + direction * 0.25,
        ),
        record.radialOriginOverrideM[2],
      ]);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("wheel", onExplosionWheel, {
      capture: true,
      passive: false,
    });

    const urls = [...new Set(renderPlacements.map(({ assetUrl }) => assetUrl))];
    const sourceAlphaAssetUrls = new Set(
      renderPlacements
        .filter(
          (placement) =>
            runtimeAnalysisVisualTexturePolicy(placement) === "source-alpha",
        )
        .map(({ assetUrl }) => assetUrl),
    );
    const sourceGeometryScores = new Map<string, number>();
    const analysisSurfaceEvidence: AnalysisVisualSurfaceEvidence[] = [];
    const analysisMeshesByOccurrence = new Map<string, THREE.Mesh[]>();
    const stableAnalysisSurfaceOccurrences = new Set<string>();
    let stableAnalysisSurfaceMeshCount = 0;
    let analysisVisualDepthOccluderMeshCount = 0;
    setViewerState({ kind: "loading", loaded: 0, total: hit ? 1 : urls.length });
    setHitState(hit ? { kind: "loading" } : { kind: "absent" });
    setShotResult(null);
    setSavedShots([]);
    setActiveShotId(null);
    shotRecordsRef.current = [];
    activeShotIdRef.current = null;
    pendingExplosionPlacementRef.current = null;
    setHitHeader(null);
    radialQueryRef.current = null;
    radialQueryHitPoseRef.current = new Map();

    const analysisLoadingManager = new THREE.LoadingManager();
    analysisLoadingManager.setURLModifier(runtimeAnalysisVisualUrl);
    const analysisLoader = new GLTFLoader(analysisLoadingManager);
    analysisLoader.setMeshoptDecoder(MeshoptDecoder);
    const sourceAlphaLoadingManager = new THREE.LoadingManager();
    sourceAlphaLoadingManager.setURLModifier((url) =>
      runtimeAnalysisVisualUrl(url, "source-alpha")
    );
    const sourceAlphaLoader = new GLTFLoader(sourceAlphaLoadingManager);
    sourceAlphaLoader.setMeshoptDecoder(MeshoptDecoder);
    const loadAnalysisVisualAssets = async () => {
      host.dataset.analysisVisualAssetState = "loading";
      const sources = new Map<string, THREE.Object3D>();
      await mapWithConcurrency(
        urls,
        renderQuality.assetLoadConcurrency,
        async (url) => {
        const exteriorSource = exteriorSources.get(url);
        const loader = sourceAlphaAssetUrls.has(url)
          ? sourceAlphaLoader
          : analysisLoader;
        const source = exteriorSource ?? (await loader.loadAsync(url)).scene;
        sources.set(url, source);
        sourceGeometryScores.set(url, analysisVisualGeometryScore(source));
        if (exteriorSource) {
          host.dataset.analysisReusedExteriorSourceCount = String(
            Number(host.dataset.analysisReusedExteriorSourceCount ?? "0") + 1,
          );
        }
        analysisLoaded += 1;
        if (!cancelled && modeRef.current !== "exterior") {
          setViewerState({
            kind: hitLoadSucceeded ? "ready" : "loading",
            loaded: analysisLoaded,
            total: urls.length,
          });
        }
        },
      );
      renderPlacements.forEach((placement) => {
        const source = sources.get(placement.assetUrl);
        if (!source) throw new Error(`Missing loaded source for ${placement.assetUrl}`);
        const depthOccurrence = new THREE.Group();
        depthOccurrence.name = `${placement.actor}.${placement.name}:analysis-depth-occluder`;
        depthOccurrence.userData.stableOccurrenceId = placement.stableOccurrenceId;
        depthOccurrence.userData.analysisVisualDepthOccluder = true;
        depthOccurrence.matrixAutoUpdate = false;
        const depthBaseMatrix = new THREE.Matrix4().fromArray(placement.matrix);
        depthOccurrence.matrix.copy(depthBaseMatrix);
        const depthModel = cloneSkeleton(source);
        registerSkeletalPose(depthModel, placement);
        depthModel.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.frustumCulled = false;
          object.renderOrder = ANALYSIS_VISUAL_DEPTH_OCCLUDER_RENDER_ORDER;
          object.userData.analysisVisualDepthOccluder = true;
          const sourceMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          if (sourceMaterials.some(isSiguaDProjectedMark)) {
            object.visible = false;
            return;
          }
          object.material = Array.isArray(object.material)
            ? sourceMaterials.map(analysisVisualDepthMaterial)
            : analysisVisualDepthMaterial(sourceMaterials[0]);
          analysisVisualDepthOccluderMeshCount += 1;
        });
        depthOccurrence.add(depthModel);
        analysisVisualDepthGroup.add(depthOccurrence);
        const articulatedOccurrences =
          analysisOccurrences.get(placement.stableOccurrenceId) ?? [];
        articulatedOccurrences.push({
          object: depthOccurrence,
          baseMatrix: depthBaseMatrix,
        });
        analysisOccurrences.set(
          placement.stableOccurrenceId,
          articulatedOccurrences,
        );

        const analysisOccurrence = new THREE.Group();
        analysisOccurrence.name = `${placement.actor}.${placement.name}:analysis-visual-only`;
        analysisOccurrence.userData.stableOccurrenceId = placement.stableOccurrenceId;
        analysisOccurrence.userData.analysisVisualOnly = true;
        analysisOccurrence.matrixAutoUpdate = false;
        const analysisBaseMatrix = new THREE.Matrix4().fromArray(
          placement.matrix,
        );
        analysisOccurrence.matrix.copy(analysisBaseMatrix);
        const stableSurfacePlacement =
          isStableAnalysisVisualSurfacePlacement(placement);
        analysisOccurrence.userData.analysisVisualStableSurfacePlacement =
          stableSurfacePlacement;
        const placementMatrix = new THREE.Matrix4().fromArray(placement.matrix);
        const analysisModel = cloneSkeleton(source);
        registerSkeletalPose(analysisModel, placement);
        analysisModel.updateMatrixWorld(true);
        const occurrenceMeshes: THREE.Mesh[] = [];
        let materialRequiresStableSurface = false;
        analysisModel.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          // Analysis silhouettes include skeletal barrels, optics and glass
          // whose baked bounds can be smaller than their posed geometry.
          // Keep them stable while orbiting instead of allowing an angle-
          // dependent frustum rejection.
          object.frustumCulled = false;
          object.userData.analysisVisualOnly = true;
          object.userData.stableOccurrenceId = placement.stableOccurrenceId;
          const sourceMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          if (sourceMaterials.some(isSiguaDProjectedMark)) {
            object.userData.siguadProjectedMark = true;
            object.userData.analysisVisualStableSurface = true;
            object.renderOrder = ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER + 1;
            object.material = Array.isArray(object.material)
              ? sourceMaterials.map((material) =>
                  isSiguaDProjectedMark(material)
                    ? createAnalysisProjectedMarkMaterial(material)
                    : createAnalysisVisualMaterial(true)
                )
              : createAnalysisProjectedMarkMaterial(sourceMaterials[0]);
            occurrenceMeshes.push(object);
            return;
          }
          const materialStableSurface =
            sourceMeshRequiresStableAnalysisSurface(object);
          const stableSurface =
            stableSurfacePlacement ||
            materialStableSurface;
          materialRequiresStableSurface ||= materialStableSurface;
          object.userData.analysisVisualStableSurface = stableSurface;
          object.renderOrder = stableSurface
            ? ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER
            : ANALYSIS_VISUAL_SURFACE_RENDER_ORDER;
          if (stableSurface) {
            stableAnalysisSurfaceOccurrences.add(placement.stableOccurrenceId);
            stableAnalysisSurfaceMeshCount += 1;
          }
          replaceAnalysisVisualMaterial(
            object,
            stableSurface,
            false,
          );
          occurrenceMeshes.push(object);
        });
        analysisMeshesByOccurrence.set(
          placement.stableOccurrenceId,
          occurrenceMeshes,
        );
        analysisSurfaceEvidence.push({
          stableOccurrenceId: placement.stableOccurrenceId,
          actor: placement.actor,
          name: placement.name,
          sourceMeshPath: placement.sourceMeshPath,
          geometryScore:
            (sourceGeometryScores.get(placement.assetUrl) ?? 0) *
            Math.abs(placementMatrix.determinant()),
          materialRequiresStableSurface,
        });
        analysisOccurrence.add(analysisModel);
        analysisVisualGroup.add(analysisOccurrence);
        articulatedOccurrences.push({
          object: analysisOccurrence,
          baseMatrix: analysisBaseMatrix,
        });
      });
      host.dataset.analysisVisualDepthOccluderMeshCount = String(
        analysisVisualDepthOccluderMeshCount,
      );
      analysisVisualReady = true;
      host.dataset.analysisVisualAssetState = "ready";
      applyTurretPose();
    };

    const loadExteriorAssets = () => {
      if (exteriorReady) {
        if (modeRef.current === "exterior") {
          setViewerState({ kind: "ready", loaded: urls.length, total: urls.length });
          lowerReferencePlaneToGroup(visualGroup, "exterior");
          render();
        }
        return;
      }
      if (exteriorPromise) return;
      host.dataset.exteriorAssetState = "loading";
      exteriorLoaded = 0;
      host.dataset.exteriorLoadedAssetCount = "0";
      host.dataset.exteriorLoadedOccurrenceCount = "0";
      if (modeRef.current === "exterior") {
        setViewerState({ kind: "loading", loaded: 0, total: urls.length });
      }
      const exteriorLoadingManager = new THREE.LoadingManager();
      exteriorLoadingManager.setURLModifier(runtimeWikiAssetUrl);
      const exteriorLoader = new GLTFLoader(exteriorLoadingManager);
      exteriorLoader.setMeshoptDecoder(MeshoptDecoder);
      const exteriorPlacementsByUrl = new Map(
        urls.map((url) => [
          url,
          renderPlacements.filter((placement) => placement.assetUrl === url),
        ]),
      );
      const exteriorAssetUrlBySourceUrl = new Map(
        urls.map((url) => {
          const selectedUrls = new Set(
            (exteriorPlacementsByUrl.get(url) ?? []).map((placement) =>
              runtimeExteriorVisualAssetUrl(placement, renderQuality.tier),
            ),
          );
          if (selectedUrls.size !== 1) {
            throw new Error(`Exterior quality variants disagree for ${url}`);
          }
          return [url, [...selectedUrls][0]];
        }),
      );
      host.dataset.exteriorOptimizedAssetCount = String(urls.length);
      const exteriorTextureCache = new Map<string, THREE.Texture>();
      let reusedExteriorTextures = 0;
      const attachExteriorSource = (url: string, source: THREE.Object3D) => {
        for (const placement of exteriorPlacementsByUrl.get(url) ?? []) {
          const occurrence = new THREE.Group();
          occurrence.name = `${placement.actor}.${placement.name}`;
          occurrence.userData.stableOccurrenceId = placement.stableOccurrenceId;
          occurrence.matrixAutoUpdate = false;
          const baseMatrix = new THREE.Matrix4().fromArray(placement.matrix);
          occurrence.matrix.copy(baseMatrix);
          exteriorOccurrences.set(placement.stableOccurrenceId, {
            object: occurrence,
            baseMatrix,
          });
          const model = cloneSkeleton(source);
          registerSkeletalPose(model, placement);
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.frustumCulled = true;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            materials.forEach((material) => {
              const candidate = material as THREE.MeshStandardMaterial;
              [candidate.map, candidate.normalMap, candidate.roughnessMap, candidate.metalnessMap]
                .filter((texture): texture is THREE.Texture => Boolean(texture))
                .forEach((texture) => {
                  texture.anisotropy = Math.min(
                    renderQuality.textureAnisotropy,
                    renderer.capabilities.getMaxAnisotropy(),
                  );
                  texture.generateMipmaps = renderQuality.textureMipmaps;
                  texture.minFilter = renderQuality.textureMipmaps
                    ? THREE.LinearMipmapLinearFilter
                    : THREE.LinearFilter;
                  texture.needsUpdate = true;
                });
            });
          });
          occurrence.add(model);
          visualGroup.add(occurrence);
        }
        applyTurretPose();
        syncAnalysisVisualPresentation();
      };
      exteriorPromise = mapWithConcurrency(
        urls,
        renderQuality.assetLoadConcurrency,
        async (url) => {
        const exteriorAssetUrl = exteriorAssetUrlBySourceUrl.get(url);
        if (!exteriorAssetUrl) throw new Error(`Missing exterior source for ${url}`);
        const gltf = await exteriorLoader.loadAsync(exteriorAssetUrl);
        if (cancelled) {
          disposeScene(gltf.scene);
          return;
        }
        const textureReuse = dedupeRuntimeSceneTextures(
          gltf.scene,
          exteriorTextureCache,
        );
        reusedExteriorTextures += textureReuse.reused;
        host.dataset.exteriorUniqueTextureCount = String(textureReuse.unique);
        host.dataset.exteriorReusedTextureCount = String(
          reusedExteriorTextures,
        );
        exteriorSources.set(url, gltf.scene);
        attachExteriorSource(url, gltf.scene);
        exteriorLoaded += 1;
        host.dataset.exteriorLoadedAssetCount = String(exteriorLoaded);
        host.dataset.exteriorLoadedOccurrenceCount = String(visualGroup.children.length);
        if (modeRef.current === "exterior") {
          visualGroup.visible = true;
          render();
          setViewerState({
            kind: "loading",
            loaded: exteriorLoaded,
            total: urls.length,
          });
        }
        },
      )
        .then(() => {
          if (cancelled) return;
          exteriorReady = true;
          host.dataset.exteriorAssetState = "ready";
          syncAnalysisVisualPresentation();
          if (
            fittedSource === null &&
            hitSettled &&
            visualGroup.children.length > 0
          ) {
            fitViewToGroup(visualGroup, "exterior");
          }
          lowerReferencePlaneToGroup(visualGroup, "exterior");
          if (modeRef.current === "exterior") {
            visualGroup.visible = true;
            setViewerState({ kind: "ready", loaded: urls.length, total: urls.length });
          }
          render();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          host.dataset.exteriorAssetState = "error";
          exteriorPromise = null;
          if (modeRef.current !== "exterior") return;
          const message = error instanceof Error ? error.message : String(error);
          setViewerState({ kind: "error", message });
        });
    };
    startExteriorAssets = loadExteriorAssets;

    const radialQueryPromise = radialQuery
      ? loadWikiVehicleRadialQuery(radialQuery.recordUrl).then((value) => {
          const source = validateVehicleRadialQuerySource(value);
          if (
            source.rawName !== preview.variantRawName ||
            source.generatedClass !== preview.generatedClass
          ) {
            throw new Error(`SiguaWiki 径向查询身份不匹配：${preview.variantRawName}`);
          }
          return source;
        })
      : Promise.resolve(null);
    const hitPromise = hit
      ? Promise.all([
          loadRuntimeHitScene({ ...hit, accessStatus: hit.status }),
          radialQueryPromise,
        ])
          .then(([parsed, querySource]) => {
            if (cancelled) {
              parsed.analysisGeometry.dispose();
              return null;
            }
            parsedHitRef.current = parsed;
            radialQueryRef.current = querySource;
            setHitHeader(parsed.header);
            const hitGroup = new THREE.Group();
            hitGroup.name = "runtime-hit-scene";
            hitGroup.rotation.x = -Math.PI / 2;
            const analysisMaterial = new THREE.MeshBasicMaterial({
              // Match the audited reference worker: native analysis accepts
              // outward-facing entry surfaces and keeps incidence signed.
              side: THREE.FrontSide,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              colorWrite: false,
            });
            const analysisMesh = new THREE.Mesh(parsed.analysisGeometry, analysisMaterial);
            analysisMesh.name = "runtime-hit-analysis-bvh";
            analysisMeshRef.current = analysisMesh;
            hitGroup.add(analysisMesh);

            const hitModel = createHitSceneThreeModel(parsed);
            hitModelRef.current = hitModel;
            setHitSceneThreeModelMode(
              hitModel,
              modeRef.current,
              exteriorSpacedArmorHighlightRef.current,
            );
            setHitSceneThreeModelSpecialArmorVisible(
              hitModel,
              modeRef.current === "exterior"
                ? true
                : specialArmorVisibleRef.current,
            );
            setHitSceneThreeModelArmorThicknessScale(
              hitModel,
              relativeArmorScaleRef.current ? "relative" : "absolute",
            );
            setArmorThicknessRange(hitModel.armorThicknessRange);
            hitGroup.add(
              hitModel.armor,
              hitModel.armorOverlay,
              hitModel.blockerOverlay,
              hitModel.interior,
            );
            hitGroup.visible =
              modeRef.current !== "exterior" ||
              exteriorSpacedArmorHighlightRef.current;
            hitGroupRef.current = hitGroup;
            chassisPoseGroup.add(hitGroup);
            lastAppliedHitModel = null;
            lastAppliedHitPoseKey = null;
            applyTurretPose();
            hitLoadSucceeded = true;
            hitSettled = true;
            visualGroup.visible = modeRef.current === "exterior";
            analysisVisualGroup.visible = modeRef.current !== "exterior";
            host.dataset.analysisVisualOccurrenceCount = String(
              renderPlacements.length,
            );

            setHitState({
              kind: "ready",
              triangles: parsed.record.header.counts.triangles,
              components: parsed.record.header.counts.components,
            });
            const pendingExplosion = pendingExplosionPlacementRef.current;
            if (pendingExplosion && selectedWeaponHasExplosionRef.current) {
              pendingExplosionPlacementRef.current = null;
              delete host.dataset.explosionPlacementState;
              saveExplosionOriginRef.current(
                pendingExplosion.originM,
                pendingExplosion.rayOrigin,
                pendingExplosion.rayDirection,
              );
            }
            host.dataset.hitVehicleId = hit.vehicleId;
            host.dataset.staticHitRuntime = String(
              parsed.record.header.formatVersion === "hit-scene-record/v1",
            );
            host.dataset.hitSolver = "editor-native-direct-hit";
            host.dataset.hitRenderer = "reference-batched-shader";
            fitViewToGroup(hitGroup, "hit");
            if (exteriorReady) {
              lowerReferencePlaneToGroup(visualGroup, "exterior");
            }
            if (modeRef.current !== "exterior") {
              setViewerState({
                kind: "ready",
                loaded: analysisLoaded,
                total: urls.length,
              });
            }
            render();
            return parsed;
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            hitSettled = true;
            if (!cancelled) {
              setHitState({ kind: "error", message });
              if (
                fittedSource === null &&
                exteriorReady &&
                visualGroup.children.length > 0
              ) {
                fitViewToGroup(visualGroup, "exterior");
                lowerReferencePlaneToGroup(visualGroup, "exterior");
              }
            }
            return null;
          })
      : Promise.resolve(null);

    activateAssetModeRef.current = (nextMode) => {
      syncAnalysisVisualPresentation();
      if (nextMode === "exterior") {
        loadExteriorAssets();
        return;
      }
      startAnalysisVisualAssets?.();
      if (hitLoadSucceeded && hitGroupRef.current) {
        if (fittedSource === null) fitViewToGroup(hitGroupRef.current, "hit");
        setViewerState({
          kind: "ready",
          loaded: analysisLoaded,
          total: urls.length,
        });
        return;
      }
      if (analysisVisualReady) {
        if (fittedSource === null) {
          fitViewToGroup(analysisVisualDepthGroup, "analysis");
        }
        setViewerState({
          kind: "ready",
          loaded: analysisLoaded,
          total: urls.length,
        });
        return;
      }
      if (analysisVisualErrorMessage) {
        setViewerState({ kind: "error", message: analysisVisualErrorMessage });
        return;
      }
      setViewerState({
        kind: "loading",
        loaded: analysisLoaded,
        total: urls.length,
      });
    };

    startAnalysisVisualAssets = () => {
      if (analysisVisualPromise || analysisVisualReady) return;
      analysisVisualPromise = hitPromise.then(async (parsed) => {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        if (cancelled) return parsed;
        await loadAnalysisVisualAssets();
        return parsed;
      })
      .then((parsed) => {
        if (cancelled) return;
        const stableReasons = analysisVisualStableSurfaceReasons(
          analysisSurfaceEvidence,
          parsed?.header.components.map(({ componentPath }) => componentPath) ?? [],
        );
        const reasonCounts = new Map<string, number>();
        stableReasons.forEach((reasons, stableOccurrenceId) => {
          reasons.forEach((reason) => {
            reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
          });
          stableAnalysisSurfaceOccurrences.add(stableOccurrenceId);
          for (const mesh of analysisMeshesByOccurrence.get(stableOccurrenceId) ?? []) {
            if (mesh.userData.analysisVisualStableSurface === true) continue;
            mesh.userData.analysisVisualStableSurface = true;
            mesh.renderOrder = ANALYSIS_VISUAL_STABLE_SURFACE_RENDER_ORDER;
            replaceAnalysisVisualMaterial(mesh, true, true);
            stableAnalysisSurfaceMeshCount += 1;
          }
        });
        host.dataset.analysisStableSurfacePlacementCount = String(
          stableReasons.size,
        );
        host.dataset.analysisStableSurfaceOccurrenceCount = String(
          stableAnalysisSurfaceOccurrences.size,
        );
        host.dataset.analysisStableSurfaceMeshCount = String(
          stableAnalysisSurfaceMeshCount,
        );
        host.dataset.analysisVisualDepthBiasMeshCount = String(
          analysisVisualDepthOccluderMeshCount,
        );
        host.dataset.analysisVisualDepthBiasFactor = String(
          ANALYSIS_VISUAL_DEPTH_BIAS_FACTOR,
        );
        host.dataset.analysisVisualDepthBiasUnits = String(
          ANALYSIS_VISUAL_DEPTH_BIAS_UNITS,
        );
        host.dataset.analysisStableSurfaceIdentityCount = String(
          reasonCounts.get("identity") ?? 0,
        );
        host.dataset.analysisStableSurfaceMaterialCount = String(
          reasonCounts.get("source-material") ?? 0,
        );
        host.dataset.analysisStableSurfaceActorAbsentCount = String(
          reasonCounts.get("actor-absent-from-hit") ?? 0,
        );
        host.dataset.analysisStableSurfaceSubordinateCount = String(
          reasonCounts.get("subordinate-geometry") ?? 0,
        );
        setExteriorPlaceholderReady(true);
        syncAnalysisVisualPresentation();
        if (
          !hitLoadSucceeded &&
          fittedSource === null
        ) {
          fitViewToGroup(analysisVisualDepthGroup, "analysis");
        }
        if (modeRef.current === "exterior") {
          render();
          if (fittedSource !== null) {
            loadExteriorAssets();
          } else {
            host.dataset.exteriorAssetState = "waiting-for-fit";
          }
        }
        const pendingSharedShots = pendingSharedShotsRef.current;
        if (
          pendingSharedShots.paths.length > 0 &&
          parsedHitRef.current &&
          analysisMeshRef.current &&
          weaponIndexRef.current >= 0
        ) {
          const restoredRecords: RuntimeShotRecord[] = [];
          pendingSharedShots.paths.slice(-maxShotTraces).forEach((sharedShot) => {
            const direction = new THREE.Vector3().fromArray(sharedShot.direction).normalize();
            const entryPoint = new THREE.Vector3().fromArray(sharedShot.entryPoint);
            const origin = entryPoint.clone().addScaledVector(direction, -SHARED_SHOT_RAY_LEAD_M);
            raycaster.ray.set(origin, direction);
            const intersections = collectRayIntersections();
            const restored = saveRayShot({
              intersections,
              rayOrigin: origin,
              rayDirection: direction,
              distanceM: sharedShot.distanceM,
              animate: false,
            });
            if (restored) restoredRecords.push(restored);
          });
          const restoredActiveIndex = Math.min(
            Math.max(0, pendingSharedShots.activeIndex),
            restoredRecords.length - 1,
          );
          const restoredActive = restoredRecords[restoredActiveIndex];
          if (restoredActive) selectSavedShot(restoredActive.shotId);
          pendingSharedShotsRef.current = { paths: [], activeIndex: -1 };
        }
        if (modeRef.current !== "exterior") {
          setViewerState({ kind: "ready", loaded: urls.length, total: urls.length });
        }
        startReferenceSoldierAsset?.();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.dataset.analysisVisualAssetState = "error";
        analysisVisualErrorMessage = error instanceof Error ? error.message : String(error);
        if (modeRef.current === "exterior") {
          loadExteriorAssets();
          return;
        }
        if (hitLoadSucceeded) return;
        setViewerState({ kind: "error", message: analysisVisualErrorMessage });
      });
    };
    activateAssetModeRef.current(modeRef.current);

    return () => {
      cancelled = true;
      if (referenceSoldierIdleCallback !== 0) {
        window.cancelIdleCallback(referenceSoldierIdleCallback);
      }
      window.clearTimeout(referenceSoldierLoadTimer);
      cancelProtectionMap(true);
      cancelAnimationFrame(hoverFrame);
      cancelAnimationFrame(explosionDragFrame);
      cancelAnimationFrame(renderFrame);
      if (shotAnimationFrameRef.current !== 0) {
        cancelAnimationFrame(shotAnimationFrameRef.current);
        shotAnimationFrameRef.current = 0;
      }
      animatedShotIdRef.current = null;
      window.clearTimeout(initialFitStabilizationTimer);
      resetViewRef.current = null;
      applyCameraViewPresetRef.current = null;
      applyInfantryDistancePreviewRef.current = null;
      enterFreeCameraViewRef.current = null;
      enterCrewViewpointRef.current = null;
      exitCrewViewpointRef.current = null;
      applyCrewViewZoomRef.current = null;
      activeCrewViewZoomIndexRef.current = 0;
      activeCrewViewStationIdRef.current = null;
      activeCameraViewRef.current = null;
      infantryPreviewDistanceRef.current = null;
      activateAssetModeRef.current = null;
      visualGroupRef.current = null;
      analysisVisualGroupRef.current = null;
      hitGroupRef.current = null;
      applyCameraNavigationRef.current = null;
      analysisMeshRef.current = null;
      parsedHitRef.current = null;
      radialQueryRef.current = null;
      radialQueryHitPoseRef.current = new Map();
      hitModelRef.current = null;
      shotVisualsRef.current = [];
      shotRecordsRef.current = [];
      activeShotIdRef.current = null;
      pendingExplosionPlacementRef.current = null;
      refreshExplosionPlacementPreviewRef.current = null;
      clearExplosionPlacementPreviewRef.current = null;
      renderRef.current = null;
      requestRenderRef.current = null;
      if (applyTurretPoseRef.current === applyTurretPose) {
        applyTurretPoseRef.current = null;
      }
      if (
        applyCrewOccupantVisibilityRef.current ===
          applyCrewOccupantVisibility
      ) {
        applyCrewOccupantVisibilityRef.current = null;
      }
      if (
        applyCrewHitProxyVisibilityRef.current ===
          applyCrewHitProxyVisibility
      ) {
        applyCrewHitProxyVisibilityRef.current = null;
      }
      if (applyChassisPoseRef.current === applyChassisPose) {
        applyChassisPoseRef.current = null;
      }
      if (exteriorOccurrencesRef.current === exteriorOccurrences) {
        exteriorOccurrencesRef.current = new Map();
      }
      scheduleProtectionMapRef.current = null;
      cancelProtectionMapRef.current = null;
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("wheel", onExplosionWheel, true);
      if (viewerRoot?.dataset.renderQuality === renderQuality.tier) {
        delete viewerRoot.dataset.renderQuality;
      }
      controls.removeEventListener("start", onControlsStart);
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener("end", onControlsEnd);
      controls.dispose();
      crewOccupantLayer?.dispose();
      crewOccupantLayer = null;
      disposeScene(scene);
      rendererLease.release();
    };
  }, [
    applySettledShotDamageHighlight,
    chassisPose,
    clearShotVisual,
    crewOccupantPlan,
    hit,
    maxShotTraces,
    preview.cardId,
    preview.generatedClass,
    radialQuery,
    preview.suspension.records,
    preview.variantRawName,
    preview.visualVehicleId,
    referenceData?.general.isDamagedByRadial,
    referenceData?.radialDamageModel,
    saveExplosionOrigin,
    saveRayShot,
    selectSavedShot,
    simulatePublishedRadialShot,
    vehiclePlanarSuspensionCoverage?.reason,
    vehiclePlanarSuspensionCoverage?.status,
    vehicleMeshSkeletalPoseEvidence,
    visual,
  ]);

  const targetBurning = useMemo(
    () => vehicleTargetBurningProfile(referenceData),
    [referenceData],
  );
  const targetBurningProfile = targetBurning.state === "ready"
    ? targetBurning.profile
    : null;
  const hitDpsFactsState =
    weaponDpsFactsState === "ready" && targetBurning.state === "unavailable"
      ? "unavailable"
      : weaponDpsFactsState;
  const weaponHitDpsEstimates = useMemo(
    () => weaponDpsFacts && shotResult && targetBurning.state === "ready"
      ? estimateWeaponHitDps(
          weaponDpsFacts,
          shotResult,
          {
            targetHealth: 1,
            horizonSeconds: 120,
            useMagazineReload: true,
            targetBurning: targetBurning.profile,
          },
        )
      : [],
    [shotResult, targetBurning, weaponDpsFacts],
  );
  const weaponHitDpsTargets = useMemo(
    () => shotResult ? targetPoolsForShot(shotResult, targetBurningProfile) : [],
    [shotResult, targetBurningProfile],
  );
  useEffect(() => {
    if (
      !selectedAttackWeapon ||
      !weaponDpsFacts ||
      weaponDpsFactsState !== "ready" ||
      targetBurning.state !== "ready" ||
      weaponHitDpsTargets.length === 0
    ) {
      onDuelHitChangeRef.current?.(null);
      return;
    }
    onDuelHitChangeRef.current?.({
      weapon: weaponDpsFacts,
      weaponLabel: weaponNameZh(
        selectedAttackWeapon.selectorVariant?.label ??
          selectedAttackWeapon.displayNameZh,
      ),
      weaponAssignmentId: selectedAttackWeapon.weaponAssignmentId ?? null,
      targets: weaponHitDpsTargets,
    });
  }, [
    selectedAttackWeapon,
    weaponDpsFacts,
    weaponDpsFactsState,
    weaponHitDpsTargets,
    targetBurning.state,
  ]);

  useEffect(() => {
    requestRenderRef.current?.();
  }, [activeShotId, shotResult]);

  if (!visual) return null;

  const ballistics = shotResult?.ballistics ?? null;
  const activeSavedShot = savedShots.find(
    (savedShot) => savedShot.shotId === activeShotId,
  ) ?? null;
  const explosionOriginDraggable =
    (ballistics?.explosiveLayers.length ?? 0) > 0 &&
    activeShotId !== null;
  const explosionOriginPlacement =
    selectedWeaponHasExplosion && !explosionOriginDraggable;
  const explosionOriginPlacementTargetsVehicle =
    explosionOriginPlacement && realtimePointer !== null;
  const explosionOriginDetached = Boolean(
    activeSavedShot?.radialOriginOverrideM,
  );
  const activeExplosionCoverage = !explosionOriginDraggable || !shotResult
    ? null
    : radialDamageCoverageState(shotResult);
  const explosionOriginCoverage = explosionOriginPlacement
    ? explosionPlacementCoverage
    : activeExplosionCoverage;
  const explosionOriginContactOffsetM = explosionOriginDetached
    ? null
    : (
        shotResult?.radial.layers[0]?.explosionOriginOffsetCm
        ?? ballistics?.explosiveLayers[0]?.impactNormalOffsetCm
        ?? 0
      ) / 100;
  const ballisticsPenetrationKind = weaponPenetrationKindForDamageTypePath(
    ballistics?.damageTypePath ?? null,
  );
  const ballisticsPenetrationLabel = ballisticsPenetrationKind === "shaped-charge"
    ? "破甲深度"
    : "穿深";
  const distanceLabel = maxDistanceM === 0 ? "不可用" : `${targetDistanceM.toFixed(0)} m`;
  const distanceDecayNotice = !distanceControl
    ? null
    : distanceControl.damageDecay === "none" && distanceControl.penetrationDecay === "none"
      ? "当前武器无伤害/穿深距离衰减"
      : [
          distanceControl.damageDecay === "none"
            ? "伤害无距离衰减"
            : distanceControl.damageDecay === "unknown"
              ? "伤害衰减数据不可用"
              : null,
          distanceControl.penetrationDecay === "none"
            ? "穿深无距离衰减"
            : distanceControl.penetrationDecay === "unknown"
              ? "穿深衰减数据不可用"
              : null,
        ].filter(Boolean).join(" · ");
  const exteriorStreaming = mode === "exterior" && viewerState.kind === "loading";
  const viewerPresentation = runtimeViewerPresentation({
    mode,
    viewerState: viewerState.kind,
    initialCameraFitReady,
    exteriorPlaceholderReady,
  });
  const showSceneLoadingOverlay = viewerPresentation === "loading";
  const protectionStatus = !protectionMapAvailable
    ? "当前模式不可用"
    : !protectionActive
      ? "本机防护图已关闭"
      : protectionSampleProgress.total <= 0
        ? "本机防护图等待计算"
        : protectionSampleProgress.completed >= protectionSampleProgress.total
          ? `本机防护图 ${protectionRenderedPrecision} 档完成`
          : `本机防护图计算中 ${protectionSampleProgress.completed}/${protectionSampleProgress.total}`;
  const penetrationDamageEvents = shotResult
    ? effectiveDamageEventsByKind(shotResult, "point")
    : [];
  const explosionDamageEvents = shotResult
    ? effectiveDamageEventsByKind(shotResult, "radial")
    : [];
  const hasVehicleRadialDamage = shotResult?.damage.some(
    (damage) =>
      damage.damageKind === "radial"
      && editorNativeEffectiveDamageAmount(damage) > 0
      && isEditorNativeVehicleDamageEvent(damage),
  ) ?? false;
  const effectiveDamageEvents = [
    ...penetrationDamageEvents,
    ...explosionDamageEvents,
  ];
  const visibleShotLayers = shotResult?.layers.slice(0, MAX_VISIBLE_LAYERS) ?? [];
  const damageEventsByLayer = groupDamageEventsByVisibleLayer(
    visibleShotLayers,
    effectiveDamageEvents,
  );
  const damageOutcomeSummaries = summarizeDamageOutcomes(effectiveDamageEvents);
  const hullDamageOutcome = damageOutcomeSummaries.find(
    (outcome) => outcome.poolKind === "hull",
  ) ?? null;
  const componentDamageOutcomes = damageOutcomeSummaries.filter(
    (outcome) => outcome.poolKind !== "hull",
  );
  const clickedLayer = shotResult?.layers[0] ?? null;
  const clickedComponent = clickedLayer && hitHeader
    ? hitHeader.components[clickedLayer.componentIndex] ?? null
    : null;
  const hullRemainingHealth = hullDamageOutcome?.maxHealth === null
    || hullDamageOutcome?.maxHealth === undefined
    ? null
    : Math.max(0, hullDamageOutcome.maxHealth - hullDamageOutcome.poolDamage);
  const hullHealthPercent = hullRemainingHealth === null
    || hullDamageOutcome?.maxHealth === null
    || hullDamageOutcome?.maxHealth === undefined
    || hullDamageOutcome.maxHealth <= 0
    ? 0
    : Math.max(0, Math.min(100, (hullRemainingHealth / hullDamageOutcome.maxHealth) * 100));
  const totalEffectiveDamage = effectiveDamageEvents
    .filter((event) => event.poolKind === "hull")
    .reduce(
      (total, event) => total + editorNativeEffectiveDamageAmount(event),
      0,
    );
  const damageAnimationKey = `${activeShotId}:${damageAnimationRevision}`;
  const activeShotWeaponName = selectedAttackWeapon
    ? weaponNameZh(
        selectedAttackWeapon.selectorVariant?.label
        ?? selectedAttackWeapon.displayNameZh,
      )
    : null;
  return (
    <div
      className="viewer-stage runtime-vehicle-viewer"
      data-viewer-state={viewerState.kind}
      data-viewer-presentation={viewerPresentation}
      data-viewer-variant-raw-name={preview.variantRawName}
      data-hit-state={hitState.kind}
      data-hit-access={hit?.status ?? "absent"}
      data-hit-probe-verdict={verdict}
      data-static-hit-runtime={hitState.kind === "ready" ? "true" : undefined}
      data-hit-solver={hitState.kind === "ready" ? "editor-native-direct-hit" : undefined}
      data-hit-weapon-label-source={attackReady
        ? attackSource?.sourceCategory === "infantry"
          ? selectedAttackWeapon?.sourceKind === "explosive-catalog"
            ? "editor-explosive-catalog"
            : "weapon-wiki"
          : attackSource?.sourceCategory === "emplaced" ||
              attackSource?.sourceCategory === "commander-support"
            ? "editor-weapon-catalog"
            : selectedAttackWeapon?.sourceKind === "explosive-catalog"
              ? "editor-explosive-catalog"
              : "vehicle-encyclopedia-card"
        : undefined}
      data-attack-source-card-id={attackSource?.cardId}
      data-attack-source-canonical-raw-name={attackSource?.canonicalRawName}
      data-attack-source-state={attackReady ? "ready" : attackState.kind}
      data-attack-source-catalog-completed-weapons={
        hitState.kind === "ready" ? catalogCompletedWeaponCount : undefined
      }
      data-show-chrome={showChrome}
      data-duel-target={duelTarget ? "true" : undefined}
      data-protection-map={protectionActive ? "active" : "inactive"}
      data-physical-pose={chassisPose
        ? physicalPoseActive
          ? "settled"
          : "static"
        : "unavailable"}
      data-physical-pose-generated-class={chassisPose?.generatedClass}
      data-skeletal-pose-evidence={
        vehicleMeshSkeletalPoseEvidence ?? "unavailable"
      }
      data-suspension-pose={
        !physicalPoseEnabled
          ? "reference"
          : vehiclePlanarSuspensionCoverage?.status === "not-applicable"
              ? "not-applicable"
              : vehicleMeshRuntimePosePlacement
                ? "runtime-observed"
                : "unavailable"
      }
      data-suspension-pose-authority={
        !physicalPoseEnabled
          ? "inverse-bind-reference"
          : vehiclePlanarSuspensionCoverage?.status === "not-applicable"
              ? "explicit-not-applicable"
              : vehicleMeshRuntimePosePlacement
                ? "normal-time-runtime-observed"
                : "unavailable"
      }
      data-suspension-pose-coverage-reason={
        vehiclePlanarSuspensionCoverage?.reason
      }
      data-suspension-pose-running-gear-bone-count={
        vehicleMeshObservedSuspensionPose?.wheelCount ?? 0
      }
      data-physical-pose-pitch-degrees={chassisPose?.pitchDeg}
      data-physical-pose-roll-degrees={chassisPose?.rollDeg}
      data-physical-pose-actor-origin-height-cm={
        chassisPose?.heightAbovePlaneCm
      }
      data-armor-thickness-scale={relativeArmorScaleActive ? "relative" : "absolute"}
      data-exterior-unavailable={exteriorUnavailableMessage ? "true" : undefined}
      data-exterior-streaming={exteriorStreaming ? "true" : "false"}
      data-realtime-crosshair={realtimePointer ? "visible" : "hidden"}
      data-turret-preview={
        runtimeTurretStations.length > 0 ? "available" : "absent"
      }
      data-turret-station-id={activeTurretStation?.id}
      data-turret-yaw-degrees={activeTurretStation ? clampedTurretYaw : undefined}
      data-turret-pitch-degrees={activeTurretStation ? clampedTurretPitch : undefined}
      data-turret-authority={
        activeTurretStation?.turret.limits?.authority ?? undefined
      }
      data-gunner-sight={
        gunnerSightPresentationAvailable ? "available" : "absent"
      }
      data-gunner-sight-visible={gunnerSightOverlayVisible || undefined}
      data-crew-view-active={activeCrewViewStationId !== null || undefined}
      data-crew-occupants={crewOccupantDisplayEnabled ? "visible" : "hidden"}
      data-crew-hit-proxies={
        crewHitProxyDisplayEnabled ? "visible" : "hidden"
      }
      data-crew-hittable-count={crewOccupantCounts.hittable}
      data-crew-outline-count={
        crewOccupantCounts.protected + crewOccupantCounts.unresolved
      }
      data-post-penetration-distance-m={
        ballistics?.traceDistanceAfterPenetrationM ?? undefined
      }
    >
      <div className="viewer-canvas" aria-label={`${displayName} 交互式 3D 视图`}>
        <div className="runtime-vehicle-viewer__host" ref={hostRef} />
        <canvas
          className="runtime-protection-map-canvas"
          ref={protectionCanvasRef}
          hidden
          aria-hidden="true"
        />
        <div
          className="viewer-explosion-origin-hud"
          data-placement={explosionOriginPlacement ? "true" : "false"}
          data-placement-target={explosionOriginPlacementTargetsVehicle ? "vehicle" : "scene"}
          data-detached={explosionOriginDetached ? "true" : "false"}
          data-coverage={explosionOriginCoverage ?? undefined}
          ref={explosionOriginHudRef}
          hidden={!explosionOriginDraggable && !explosionOriginPlacement}
          aria-label={explosionOriginPlacement
            ? explosionOriginPlacementTargetsVehicle
              ? "点击载具命中并在接触点引爆"
              : "点击场景地面放置爆心"
            : explosionOriginDetached
              ? "自由爆心；拖动调整水平位置，Shift 加滚轮调整高度"
              : "拖动爆心计算非接触爆炸伤害"}
        >
          <span className="viewer-explosion-origin-hud__move" aria-hidden="true">
            <CircleDot size={16} />
          </span>
          <b>{explosionOriginPlacement
            ? explosionOriginPlacementTargetsVehicle
              ? "命中"
              : "放置"
            : explosionOriginDetached
              ? "自由"
              : "拖动"}</b>
          {explosionOriginCoverage ? (
            <span
              className="viewer-explosion-origin-hud__coverage"
              data-state={explosionOriginCoverage}
            >
              {explosionOriginCoverage === "covered"
                ? "覆盖"
                : explosionOriginCoverage === "clear"
                  ? "未覆盖"
                  : "待算"}
            </span>
          ) : null}
          {!explosionOriginPlacement &&
          explosionOriginContactOffsetM !== null &&
          Math.abs(explosionOriginContactOffsetM) > 0.025 ? (
            <span className="viewer-explosion-origin-hud__offset">
              ↗ {explosionOriginContactOffsetM.toFixed(1)} m
            </span>
          ) : null}
          {explosionOriginDetached ? <kbd>Shift ⇅</kbd> : null}
          {explosionOriginDetached && activeShotId !== null ? (
            <button
              type="button"
              onClick={() => setShotExplosionOrigin(activeShotId, null)}
              aria-label="将爆心贴回原命中点"
              title="贴回命中点"
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div
          className="viewer-crew-viewpoint-hud"
          ref={crewViewpointHudRef}
          hidden
          aria-label={activeTurretStation
            ? `${activeTurretStation.label}观察点`
            : "操作手观察点"}
        >
          <span className="viewer-crew-viewpoint-hud__optic" aria-hidden="true">
            <Crosshair size={13} />
          </span>
          <b>{activeTurretStation?.label ?? "武器站"}</b>
          <span>炮镜观察点</span>
        </div>
      </div>

      {gunnerSightOverlayVisible && activeGunnerSightStation && activeTurretStation && gunnerSight ? (
        <GunnerSightOverlay
          station={activeGunnerSightStation}
          projections={gunnerSight.projections}
          stationLabel={activeTurretStation.label}
          magnificationLevels={
            activeTurretStation.view?.magnificationLevels ?? []
          }
          zoomHorizontalFovDegrees={
            activeTurretStation.view?.magnificationLevels.map((_, zoomIndex) =>
              crewViewHorizontalFovForZoom(
                activeTurretStation.view!,
                zoomIndex,
              )
            ) ?? []
          }
          onZoomStageChange={(zoomIndex) => {
            applyCrewViewZoomRef.current?.(
              activeTurretStation.id,
              zoomIndex,
            );
          }}
        />
      ) : null}

      {activeCrewViewStationId !== null ? (
        <div
          className="crew-view-immersive-controls"
          aria-label="炮手视角控制"
        >
          {gunnerSightPresentationAvailable ? (
            <button
              type="button"
              role="switch"
              aria-label="显示炮镜遮罩与分划"
              aria-checked={gunnerSightOverlayEnabled}
              data-active={gunnerSightOverlayEnabled || undefined}
              onClick={() =>
                setGunnerSightOverlayEnabled((enabled) => !enabled)}
            >
              {gunnerSightOverlayEnabled ? "隐藏炮镜" : "显示炮镜"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="退出炮手视角"
            aria-keyshortcuts="Escape"
            onClick={() => exitCrewViewpointRef.current?.()}
          >
            退出炮手视角
            <kbd>Esc</kbd>
          </button>
        </div>
      ) : null}

      {showSceneLoadingOverlay ? (
        <VehicleViewerLoading
          vehicleName={displayName}
          onClose={onClose}
          embedded
        />
      ) : null}
      {viewerState.kind === "error" ? (
        <div className="runtime-vehicle-viewer__error" role="alert">
          <strong>3D 包加载失败</strong>
          <span>{viewerState.message}</span>
        </div>
      ) : null}

      {exteriorUnavailableMessage ? (
        <aside className="viewer-resource-warning" role="note" aria-label="官方资源问题提示">
          <div className="viewer-resource-warning__heading">
            <CircleAlert size={15} aria-hidden="true" />
            <strong>外观预览暂不可用</strong>
            <span>OFFICIAL RESOURCE ISSUE</span>
          </div>
          <p>{exteriorUnavailableMessage}</p>
        </aside>
      ) : null}

      {realtimePointer ? (
        <span
          className="viewer-realtime-crosshair"
          data-outline={realtimePointer.outline}
          data-fill={realtimePointer.fill ?? "none"}
          style={{ left: realtimePointer.x, top: realtimePointer.y }}
          aria-hidden="true"
        />
      ) : null}
      {realtimePointer ? (
        <aside
          className="viewer-realtime-readout"
          data-outline={realtimePointer.outline}
          data-placement={realtimePointer.placement}
          style={{ left: realtimePointer.x, top: realtimePointer.y }}
          aria-label="实时命中解算"
        >
          <dl>
            <div><dt>当前角度</dt><dd>{viewerPointerMetric(realtimePointer.angleDeg, "°")}</dd></div>
            <div><dt>基甲厚度</dt><dd>{viewerPointerMetric(realtimePointer.rawThicknessMm, " mm")}</dd></div>
            <div><dt>等效厚度</dt><dd>{viewerPointerMetric(realtimePointer.effectiveThicknessMm, " mm")}</dd></div>
            <div className="viewer-realtime-readout__components">
              <span>可能命中的组件</span>
              <strong>{realtimePointer.componentLabels.length > 0
                ? realtimePointer.componentLabels.map((label, index) => (
                    <span className="viewer-realtime-readout__component-label" key={`${label}-${index}`}>
                      {index > 0 ? "/ " : ""}{label}
                    </span>
                  ))
                : "—"}</strong>
            </div>
          </dl>
          <div className="viewer-realtime-readout__status">
            <span>{viewerPointerOutlineLabel(realtimePointer.outline)}</span>
            <span className="viewer-realtime-readout__hint">点击左键查看详细命中解析</span>
          </div>
        </aside>
      ) : null}

      {mode === "armor" && hitState.kind === "ready" ? (
        <div className="viewer-top-guide" data-with-armor-legend="true">
          <div
            className="viewer-armor-thickness-legend"
            data-scale={relativeArmorScaleActive ? "relative" : "absolute"}
            aria-label={relativeArmorScaleActive && armorThicknessRange
              ? `当前载具相对装甲厚度连续色阶，${formatArmorThicknessLegendValue(armorThicknessRange.minMm)} 至 ${formatArmorThicknessLegendValue(armorThicknessRange.maxMm)}`
              : "装甲厚度绝对连续色阶，0 至 890 毫米"}
          >
            <strong>{relativeArmorScaleActive ? "相对厚度" : "装甲厚度"}</strong>
            <div
              className="viewer-armor-thickness-legend__bar"
              style={{
                background: relativeArmorScaleActive
                  ? RELATIVE_ARMOR_THICKNESS_LEGEND_GRADIENT
                  : ARMOR_THICKNESS_LEGEND_GRADIENT,
              }}
              aria-hidden="true"
            />
            <div className="viewer-armor-thickness-legend__ticks">
              {armorThicknessLegendTicks.map((tick) => (
                <span key={`${tick.thicknessMm}-${tick.normalizedPosition}`} style={{ left: `${tick.normalizedPosition * 100}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
            <small>
              <span><i data-kind="spaced-armor" />附加装甲</span>
              <span><i data-kind="no-penetration" />无敌区</span>
              <span><i data-kind="gun-collision" />武器/碰撞轮廓</span>
              <span><i data-kind="component-only-damage" />可损坏部件</span>
              <span><i data-kind="engine" />发动机</span>
              <span><i data-kind="ammo-rack" />弹药架</span>
            </small>
          </div>
        </div>
      ) : null}

      <div className="viewer-engagement-controls" aria-label="命中分析参数">
        {attackLibrary ? (
          <>
            <RuntimeWeaponSelector
              value={
                attackSource && displayedWeaponOptionIndex >= 0
                  ? weaponSelectionValue(
                      attackSource.cardId,
                      displayedWeaponOptionIndex,
                    )
                  : ""
              }
              options={runtimeWeaponOptions}
              targetDistanceM={targetDistanceM}
              onRequestGlobalLibrary={requestGlobalAttackLibrary}
              globalLibraryState={globalAttackLibraryState}
              onOpenChange={setWeaponSelectorOpen}
              onSourceOpenChange={setSourceSelectorOpen}
              onChange={(nextValue) => {
                const selection = parseWeaponSelectionValue(nextValue);
                if (!selection) return;
                const nextSource = attackLibrary?.runtimeAttackSourceForId(
                  selection.sourceCardId,
                ) ?? null;
                const nextWeapon = nextSource?.weapons[selection.optionIndex];
                if (!nextSource || !nextWeapon) return;
                if (nextSource.cardId !== attackSource?.cardId) {
                  const pendingSelection = {
                    sourceCardId: nextSource.cardId,
                    optionIndex: selection.optionIndex,
                  };
                  pendingAttackWeaponSelectionRef.current = pendingSelection;
                  setPendingAttackWeaponSelection(pendingSelection);
                  const current = navigationStateRef.current;
                  if (current) {
                    const next = {
                      ...current,
                      attacker: nextSource.shareSlug,
                      weapon: "",
                      weaponIndex:
                        selection.optionIndex === defaultAttackWeaponOptionIndex(nextSource)
                          ? null
                          : selection.optionIndex,
                      distance: 0,
                      shots: "",
                    } satisfies ViewerNavigationState;
                    navigationStateRef.current = next;
                    onNavigationStateChangeRef.current?.(next);
                  }
                  setAttackSourceCardId(nextSource.cardId);
                  return;
                }
                const nextOptionIndex = selection.optionIndex;
                const nextModel = nextWeapon.ballisticsModel;
                if (!nextWeapon || !nextModel) return;
                const nextMaxDistance = runtimeAttackTargetDistanceLimitM(
                  nextModel,
                  nextWeapon.ballisticsWeaponIndex,
                );
                const nextDistance = nextMaxDistance > 0
                  ? Math.min(distancePreferenceRef.current, nextMaxDistance)
                  : 0;
                attackModelRef.current = nextModel;
                setAttackHeader(nextModel);
                setWeaponIndex(nextWeapon.ballisticsWeaponIndex);
                setWeaponOptionIndex(nextOptionIndex);
                setTargetDistanceM(nextDistance);
                weaponIndexRef.current = nextWeapon.ballisticsWeaponIndex;
                weaponOptionIndexRef.current = nextOptionIndex;
                targetDistanceRef.current = nextDistance;
                const current = navigationStateRef.current;
                if (current && attackSource) {
                  const next = {
                    ...current,
                    attacker: attackSource.shareSlug,
                    weapon: "",
                    weaponIndex: nextOptionIndex === defaultAttackWeaponOptionIndex(attackSource)
                      ? null
                      : nextOptionIndex,
                    distance: 0,
                  } satisfies ViewerNavigationState;
                  navigationStateRef.current = next;
                  onNavigationStateChangeRef.current?.(next);
                }
                simulateCurrentShot(nextWeapon.ballisticsWeaponIndex, nextDistance);
              }}
            />
          </>
        ) : attackLibraryError ? (
          <button
            className="viewer-global-weapon-fallback"
            type="button"
            disabled={globalAttackLibraryState === "loading"}
            onClick={requestGlobalAttackLibrary}
          >
            {globalAttackLibraryState === "loading"
              ? "正在载入武器选择器…"
              : "当前载具没有独立武器分片 · 载入全站武器选择器"}
          </button>
        ) : (
          <div className="viewer-attack-library-status" data-state="loading">
            正在加载当前载具武器…
          </div>
        )}
        <div className="viewer-distance-control" data-disabled={maxDistanceM === 0}>
          <span>
            <span className="viewer-distance-control__label">
              <span>攻击距离</span>
              {distanceDecayNotice ? (
                <small className="viewer-distance-control__notice">{distanceDecayNotice}</small>
              ) : null}
            </span>
            <strong>{distanceLabel}</strong>
          </span>
          <div className="viewer-distance-slider" data-has-ticks={quickDistanceTicks.length > 0}>
            <input
              type="range"
              aria-label={maxDistanceM === 0 ? "当前弹药不可调整距离" : `攻击距离 ${targetDistanceM} 米`}
              min={0}
              max={Math.max(maxDistanceM, 1)}
              step={50}
              value={Math.min(targetDistanceM, Math.max(maxDistanceM, 1))}
              disabled={maxDistanceM === 0}
              style={{
                "--range-progress": `${maxDistanceM > 0 ? (targetDistanceM / maxDistanceM) * 100 : 0}%`,
              } as CSSProperties}
              onPointerDown={() => setDistanceInteractionActive(true)}
              onPointerUp={() => setDistanceInteractionActive(false)}
              onPointerCancel={() => setDistanceInteractionActive(false)}
              onKeyDown={() => setDistanceInteractionActive(true)}
              onKeyUp={() => setDistanceInteractionActive(false)}
              onBlur={() => setDistanceInteractionActive(false)}
              onChange={(event) => {
                const nextDistance = Number(event.currentTarget.value);
                setTargetDistanceM(nextDistance);
                distancePreferenceRef.current = nextDistance;
                targetDistanceRef.current = nextDistance;
                simulateCurrentShot(weaponIndexRef.current, nextDistance);
              }}
            />
            {quickDistanceTicks.length > 0 ? (
              <div className="viewer-distance-ticks" aria-label="快速距离刻度">
                {quickDistanceTicks.map((tick, index) => (
                  <button
                    type="button"
                    key={tick}
                    data-edge={index === 0 ? "start" : index === quickDistanceTicks.length - 1 ? "end" : undefined}
                    style={{ left: `${(tick / maxDistanceM) * 100}%` }}
                    aria-label={`设置距离为 ${tick} 米`}
                    onClick={() => {
                      setTargetDistanceM(tick);
                      distancePreferenceRef.current = tick;
                      targetDistanceRef.current = tick;
                      simulateCurrentShot(weaponIndexRef.current, tick);
                    }}
                  >
                    {tick}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="viewer-toolbar" aria-label="3D 查看模式">
        <div className="viewer-toolbar__tertiary">
          <div
            className="viewer-protection-controls"
            data-enabled={protectionMapAvailable}
            data-selector-open={attackSelectorOpen}
            data-revealed={upperOptionsRevealed}
          >
            {attackSelectorOpen ? (
              <button
                className="viewer-protection-controls__collapse-cue"
                type="button"
                data-viewer-control-cue="weapon-selector"
                data-revealed={upperOptionsRevealed}
                aria-label={upperOptionsRevealed
                  ? "收起上方选项栏"
                  : "展开上方选项栏"}
                title={upperOptionsRevealed
                  ? "收起上方选项栏"
                  : "展开上方选项栏"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setUpperOptionsRevealed((revealed) => !revealed)}
              >
                <span aria-hidden="true">{upperOptionsRevealed ? "‹" : "›"}</span>
              </button>
            ) : null}
            <div className="viewer-protection-primary" data-enabled={protectionMapAvailable}>
              <button
                className="viewer-protection-switch"
                type="button"
                role="switch"
                aria-label="防护图，仅在当前浏览器本机计算"
                aria-checked={protectionActive}
                data-active={protectionActive}
                disabled={!protectionMapAvailable}
                title="射线与伤害求解仅在当前浏览器分帧执行，不占用服务器算力"
                onClick={() => {
                  const nextEnabled = !protectionEnabled;
                  setProtectionEnabled(nextEnabled);
                  const current = navigationStateRef.current;
                  if (current) {
                    const next = {
                      ...current,
                      view: mode,
                      protection: nextEnabled,
                    } satisfies ViewerNavigationState;
                    navigationStateRef.current = next;
                    onNavigationStateChangeRef.current?.(next);
                  }
                }}
              >
                <span className="viewer-protection-switch__track" aria-hidden="true"><span /></span>
                <span>防护图</span>
                <strong>{protectionActive ? "开" : "关"}</strong>
              </button>
              <label className="viewer-protection-opacity" data-disabled={!protectionActive}>
                <span>透明度</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={protectionOpacityPercent}
                  disabled={!protectionActive}
                  style={{
                    "--range-progress": `${((protectionOpacityPercent - 10) / 90) * 100}%`,
                  } as CSSProperties}
                  aria-label={`防护图透明度 ${protectionOpacityPercent}%`}
                  onChange={(event) => setProtectionOpacityPercent(Number(event.currentTarget.value))}
                />
                <output>{protectionOpacityPercent}%</output>
              </label>
            </div>
            <label
              className="viewer-protection-precision"
              data-disabled={!protectionActive}
              data-super={protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
            >
              <span className="viewer-protection-precision__label">防护图<br />计算精度</span>
              <span
                className="viewer-protection-precision__range"
                data-super={protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
                title={protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION
                  ? "超级档：以 2 倍宽高、4 倍像素重新精算，可能导致严重卡顿"
                  : `渐进计算精度：${protectionPrecision} 档`}
                style={{
                  "--precision-progress": `${((protectionPrecision - RUNTIME_PROTECTION_MAP_MIN_PRECISION) / (RUNTIME_PROTECTION_MAP_MAX_PRECISION - RUNTIME_PROTECTION_MAP_MIN_PRECISION)) * 100}%`,
                } as CSSProperties}
              >
                <input
                  type="range"
                  min={RUNTIME_PROTECTION_MAP_MIN_PRECISION}
                  max={RUNTIME_PROTECTION_MAP_MAX_PRECISION}
                  step={1}
                  value={protectionPrecision}
                  disabled={!protectionActive}
                  aria-label={protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION
                    ? "防护图计算精度 超级档，可能导致严重卡顿"
                    : `防护图计算精度 ${protectionPrecision} 档`}
                  onInput={(event) => setProtectionPrecision(
                    clampRuntimeProtectionMapPrecision(Number(event.currentTarget.value)),
                  )}
                  onChange={(event) => setProtectionPrecision(
                    clampRuntimeProtectionMapPrecision(Number(event.currentTarget.value)),
                  )}
                />
                <span className="viewer-protection-precision__capture-speed" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <b
                      key={level}
                      data-ready={level <= protectionRenderedPrecision}
                      data-target={level <= protectionPrecision}
                      data-super={level === RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
                    />
                  ))}
                </span>
                <span className="viewer-protection-precision__ticks" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <b
                      key={level}
                      data-active={level <= protectionRenderedPrecision}
                      data-target={level === protectionPrecision && protectionPrecision !== protectionRenderedPrecision}
                      data-super={level === RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
                    >
                      {level === RUNTIME_PROTECTION_MAP_SUPER_PRECISION ? "超" : level}
                    </b>
                  ))}
                </span>
              </span>
              <span className="viewer-protection-precision__status">
                <output>{protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION
                  ? protectionRenderedPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION
                    ? "超级档"
                    : `${protectionRenderedPrecision} → 超级`
                  : protectionRenderedPrecision === protectionPrecision
                    ? `${protectionPrecision} 档`
                    : `${protectionRenderedPrecision} → ${protectionPrecision} 档`}</output>
                <span className="viewer-protection-precision__progress" aria-live="polite">
                  {protectionSampleProgress.total <= 0
                    ? "等待计算"
                    : protectionSampleProgress.completed >= protectionSampleProgress.total
                      ? `已完成 ${protectionSampleProgress.completed}/${protectionSampleProgress.total}`
                      : `计算中 ${protectionSampleProgress.completed}/${protectionSampleProgress.total}`}
                </span>
                <span
                  className="viewer-protection-precision__warning"
                  data-visible={protectionPrecision === RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
                  aria-hidden={protectionPrecision !== RUNTIME_PROTECTION_MAP_SUPER_PRECISION}
                  role="note"
                >
                  高负载 · 可能严重卡顿
                </span>
              </span>
            </label>
            <div className="viewer-render-row">
              <div
                className="viewer-mode-tabs"
                role="group"
                aria-label="渲染模式"
                data-mode-count={exteriorUnavailableMessage ? 2 : 3}
                style={{
                  "--viewer-mode-count": exteriorUnavailableMessage ? 2 : 3,
                  "--viewer-mode-index": Math.max(
                    0,
                    VIEWER_MODES
                      .filter(([value]) => !exteriorUnavailableMessage || value !== "exterior")
                      .findIndex(([value]) => value === mode),
                  ),
                } as CSSProperties}
              >
                <span className="viewer-mode-tabs__thumb" aria-hidden="true" />
                {VIEWER_MODES
                  .filter(([value]) => !exteriorUnavailableMessage || value !== "exterior")
                  .map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      data-active={mode === value}
                      aria-pressed={mode === value}
                      disabled={!onModeChange}
                      onClick={() => onModeChange?.(value)}
                    >
                      {label}
                    </button>
                ))}
              </div>
            </div>
            <RuntimeViewerCameraControls
              activeView={activeCameraView}
              infantryDistanceM={infantryPreviewDistanceM}
              disabled={!initialCameraFitReady}
              onView={(viewId) => applyCameraViewPresetRef.current?.(viewId)}
              onInfantryDistance={(distanceM) =>
                applyInfantryDistancePreviewRef.current?.(distanceM)}
              onFree={() => enterFreeCameraViewRef.current?.()}
            />
            <div className="viewer-physical-pose-row">
              <button
                className="viewer-protection-switch viewer-physical-pose-switch"
                type="button"
                role="switch"
                aria-label="真实物理状态"
                aria-checked={physicalPoseActive}
                data-active={physicalPoseActive}
                disabled={!chassisPose}
                title={chassisPose
                  ? [
                      "水平地面 normal-time RuntimeProbe 的稳定刚体与轮组实际输出。",
                      `俯仰 ${chassisPose.pitchDeg >= 0 ? "+" : ""}${chassisPose.pitchDeg.toFixed(2)}°，`,
                      `横滚 ${chassisPose.rollDeg >= 0 ? "+" : ""}${chassisPose.rollDeg.toFixed(2)}°，`,
                      `Actor 原点相对地面 ${chassisPose.heightAbovePlaneCm >= 0 ? "+" : ""}${chassisPose.heightAbovePlaneCm.toFixed(2)} cm。`,
                      vehicleMeshObservedSuspensionPose?.currentVersionValidation.state ===
                        "exact-class-sentinel-validated"
                        ? "该 exact class 已在 Squad 10.5.3 复测，当前骨骼输出与展示数据一致。"
                        : vehiclePlanarSuspensionCoverage?.status ===
                            "not-applicable"
                          ? `该 exact generated class 不适用可视轮组姿态（${vehiclePlanarSuspensionCoverage.reason}）；刚体仍使用实际稳定姿态。`
                          : vehicleMeshSkeletalPoseEvidence ===
                              "reference-equivalent"
                            ? "该 occurrence 的实际轮组骨与 reference 等价；关闭时恢复 reference。"
                            : vehicleMeshSkeletalPoseEvidence ===
                                "observed-stable"
                              ? "使用 normal-time observed 稳定骨骼；10.5.3 已分别复测履带、轮式、轻型履带和卡车路径。"
                              : vehicleMeshSkeletalPoseEvidence ===
                                  "observed-snapshot"
                                ? "使用 observed snapshot 骨骼；关闭时恢复 inverse-bind reference。"
                                : "该视觉包没有可切换的 Vehicle Mesh 轮组骨姿态。",
                    ].join(" ")
                  : "该 exact generated class 没有稳定收敛的运行时底盘姿态；不会猜测或套用相近载具。"}
                onClick={() => setPhysicalPoseEnabled((enabled) => !enabled)}
              >
                <span
                  className="viewer-protection-switch__track"
                  aria-hidden="true"
                >
                  <span />
                </span>
                <span>真实物理状态</span>
                <strong>{chassisPose
                  ? physicalPoseActive
                    ? "开启"
                    : "关闭"
                  : "无数据"}</strong>
              </button>
            </div>
            <div className="viewer-crew-occupant-row">
              <button
                className="viewer-protection-switch viewer-crew-occupant-switch"
                type="button"
                role="switch"
                aria-label="显示乘员位置与受击判定"
                aria-checked={crewOccupantDisplayEnabled}
                data-active={crewOccupantDisplayEnabled}
                disabled={crewOccupantCounts.total === 0}
                title={crewOccupantCounts.total > 0
                  ? [
                      `${crewOccupantCounts.hittable} 个可自然命中乘员按各自 exact BaseAnimation 的 Editor frame-zero 骨姿态显示。`,
                      "真实人物与姿态化轮廓默认显示；简化判定体由同一骨姿态生成并使用独立开关。",
                      `${crewOccupantCounts.protected} 个 Hidden/保护状态仅显示轮廓。`,
                      crewOccupantCounts.unresolved > 0
                        ? `${crewOccupantCounts.unresolved} 个未闭合状态使用警示轮廓。`
                        : "",
                      "AimOffset、hand/weapon IK、逐帧相位与原生 PhysicsAsset 几何仍不声称已复现。",
                    ].filter(Boolean).join(" ")
                  : "该载具没有可定位的乘员 construction-reference frame。"}
                onClick={() =>
                  setCrewOccupantDisplayEnabled((enabled) => !enabled)}
              >
                <span
                  className="viewer-protection-switch__track"
                  aria-hidden="true"
                >
                  <span />
                </span>
                <span>乘员位置</span>
                <strong>{crewOccupantCounts.total > 0
                  ? crewOccupantDisplayEnabled ? "显示" : "隐藏"
                  : "无数据"}</strong>
              </button>
              {crewOccupantDisplayEnabled ? (
                <div
                  className="viewer-crew-occupant-legend"
                  aria-label="乘员位置图例"
                >
                  <span data-kind="hittable">
                    <i />可受击真实人物
                    <b>{crewOccupantCounts.hittable}</b>
                  </span>
                  {crewOccupantCounts.hittable > 0 ? (
                    <button
                      type="button"
                      className="viewer-crew-hit-proxy-toggle"
                      role="switch"
                      aria-label="显示乘员受击判定范围"
                      aria-checked={crewHitProxyDisplayEnabled}
                      data-active={crewHitProxyDisplayEnabled || undefined}
                      onClick={() => setCrewHitProxyDisplayEnabled(
                        (enabled) => !enabled,
                      )}
                    >
                      <i />受击判定范围
                      <b>{crewHitProxyDisplayEnabled ? "显示" : "隐藏"}</b>
                    </button>
                  ) : null}
                  <span data-kind="protected">
                    <i />保护/隐藏轮廓
                    <b>{crewOccupantCounts.protected}</b>
                  </span>
                  {crewOccupantCounts.unresolved > 0 ? (
                    <span data-kind="unresolved">
                      <i />未闭合轮廓
                      <b>{crewOccupantCounts.unresolved}</b>
                    </span>
                  ) : null}
                  <small>
                    位置：construction frame · 骨姿态：Editor BaseAnimation 首帧 ·
                    判定代理：同骨架近似、默认隐藏
                  </small>
                </div>
              ) : null}
            </div>
            {mode === "armor" && hitState.kind === "ready" ? (
              <>
                <div className="viewer-spaced-armor-row">
                  <button
                    className="viewer-protection-switch viewer-spaced-armor-switch"
                    type="button"
                    role="switch"
                    aria-label="显示附加装甲/无敌区域"
                    aria-checked={specialArmorVisible}
                    data-active={specialArmorVisible}
                    onClick={() => setSpecialArmorVisible((visible) => !visible)}
                  >
                    <span className="viewer-protection-switch__track" aria-hidden="true"><span /></span>
                    <span>附加装甲/无敌区域</span>
                    <strong>{specialArmorVisible ? "显示" : "隐藏"}</strong>
                  </button>
                </div>
                <div className="viewer-relative-armor-row">
                  <button
                    className="viewer-protection-switch viewer-relative-armor-switch"
                    type="button"
                    role="switch"
                    aria-label="按当前载具相对厚度着色"
                    aria-checked={relativeArmorScaleActive}
                    data-active={relativeArmorScaleActive}
                    disabled={!relativeArmorScaleAvailable}
                    title={relativeArmorScaleAvailable && armorThicknessRange
                      ? `将本车 ${formatArmorThicknessLegendValue(armorThicknessRange.minMm)}–${formatArmorThicknessLegendValue(armorThicknessRange.maxMm)} 映射到完整色阶`
                      : "当前载具没有两个以上可比较的装甲厚度"}
                    onClick={() => setRelativeArmorScale((enabled) => !enabled)}
                  >
                    <span className="viewer-protection-switch__track" aria-hidden="true"><span /></span>
                    <span>相对厚度色阶</span>
                    <strong>{relativeArmorScaleAvailable
                      ? relativeArmorScaleActive ? "开启" : "关闭"
                      : "不可用"}</strong>
                  </button>
                </div>
              </>
            ) : null}
            {mode === "exterior" && hitState.kind === "ready" ? (
              <div className="viewer-spaced-armor-row">
                <button
                  className="viewer-protection-switch viewer-spaced-armor-switch"
                  type="button"
                  role="switch"
                  aria-label="高亮附加装甲"
                  aria-checked={exteriorSpacedArmorHighlight}
                  data-active={exteriorSpacedArmorHighlight}
                  onClick={() => setExteriorSpacedArmorHighlight((visible) => !visible)}
                >
                  <span className="viewer-protection-switch__track" aria-hidden="true"><span /></span>
                  <span>附加装甲高亮</span>
                  <strong>{exteriorSpacedArmorHighlight ? "开启" : "关闭"}</strong>
                </button>
              </div>
            ) : null}
            {(mode === "exterior" || mode === "armor") && activeTurretStation ? (
              <TurretPreviewControls
                stations={runtimeTurretStations}
                orientationIndicators={turretOrientationIndicators}
                activeStationId={activeTurretStation.id}
                yawDegrees={clampedTurretYaw}
                pitchDegrees={clampedTurretPitch}
                onStationChange={(stationId) => {
                  setActiveTurretStationId(stationId);
                  if (activeCrewViewStationId !== null) {
                    enterCrewViewpointRef.current?.(stationId);
                  }
                  commitTurretNavigation(stationId);
                }}
                onYawChange={(yawDegrees) => {
                  updateTurretStationPose(
                    activeTurretStation,
                    yawDegrees,
                    activeTurretPose.pitchDegrees,
                  );
                }}
                onPitchChange={(pitchDegrees) => {
                  updateTurretStationPose(
                    activeTurretStation,
                    activeTurretPose.yawDegrees,
                    pitchDegrees,
                  );
                }}
                onReset={() => {
                  const nextPoseStates = updateTurretStationPose(
                    activeTurretStation,
                    0,
                    0,
                  );
                  commitTurretNavigation(
                    activeTurretStation.id,
                    nextPoseStates,
                  );
                }}
                viewpointActive={
                  activeCrewViewStationId === activeTurretStation.id
                }
                viewpointMarkerEnabled={crewViewpointMarkerEnabled}
                sightPresentationAvailable={gunnerSightPresentationAvailable}
                sightPresentationVisible={gunnerSightOverlayEnabled}
                onViewpointMarkerToggle={() => {
                  const enabled = !crewViewpointMarkerEnabledRef.current;
                  crewViewpointMarkerEnabledRef.current = enabled;
                  setCrewViewpointMarkerEnabled(enabled);
                  applyTurretPoseRef.current?.();
                }}
                onSightPresentationToggle={() =>
                  setGunnerSightOverlayEnabled((enabled) => !enabled)}
                onViewpointToggle={(stationId) => {
                  if (activeCrewViewStationId === stationId) {
                    exitCrewViewpointRef.current?.();
                  } else {
                    enterCrewViewpointRef.current?.(stationId);
                  }
                }}
                onInteractionEnd={() =>
                  commitTurretNavigation(activeTurretStation.id)}
              />
            ) : null}
            <div className="viewer-interaction-hint viewer-interaction-hint--protection" aria-label="3D 操作提示">
              <span>左键旋转</span><span>右键拖动</span><span>滚轮缩放</span>
            </div>
            {protectionActive ? (
              <div className="viewer-protection-legend" aria-label="防护图图例">
                <span data-protection="damage">可造成伤害</span>
                <span data-protection="engine">发动机</span>
                <span data-protection="ammo">弹药架</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {viewerState.kind !== "loading" ? (
        <div className="viewer-load-status" data-with-close={Boolean(onClose)} aria-live="polite">
          {viewerState.kind === "ready"
            ? `${viewerState.loaded} / ${viewerState.total} 源资产 · ${visual.requiredOccurrences} 组件`
            : "3D 包加载失败"}
          {mode === "exterior"
            ? " · SOURCE-NATIVE GLTF + SPLIT HIT RUNTIME"
            : " · SPLIT HIT RUNTIME"}
          {hitState.kind === "loading" ? " · 校验 record / geometry / BVH" : ""}
          {hitState.kind === "absent"
            ? ` · ${preview.hitAvailability?.reason ?? "该 exact 变体尚无命中模型"}`
            : ""}
          {hitState.kind === "error" ? ` · 命中模型加载失败：${hitState.message}` : ""}
          {hitState.kind === "ready"
            ? ` · ${hitState.components} 命中组件 / ${hitState.triangles.toLocaleString()} 三角形`
            : ""}
          {protectionEnabled ? ` · ${protectionStatus}` : ""}
        </div>
      ) : null}
      {onClose ? (
        <button className="viewer-close" type="button" onClick={onClose} aria-label="关闭载具详情">
          <span aria-hidden="true">×</span>
        </button>
      ) : null}

      {shotResult ? (
        <div className="viewer-shot-result" aria-live="polite">
          <div className="viewer-shot-result__scroll">
            <div className="viewer-shot-history" aria-label="已保存的射线">
            <div
              className="viewer-mode-tabs viewer-shot-history__tabs"
              role="group"
              aria-label={`${maxShotTraces} 条命中记录`}
              style={{
                "--viewer-mode-count": maxShotTraces,
                "--viewer-mode-index": Math.max(
                  0,
                  savedShots.findIndex((savedShot) => savedShot.shotId === activeShotId),
                ),
              } as CSSProperties}
            >
              <span className="viewer-mode-tabs__thumb" aria-hidden="true" />
              {Array.from({ length: maxShotTraces }, (_, index) => {
                const savedShot = savedShots[index];
                const active = savedShot?.shotId === activeShotId;
                return (
                  <button
                    key={`shot-slot-${index + 1}`}
                    type="button"
                    data-active={active}
                    data-filled={savedShot ? "true" : "false"}
                    aria-pressed={active}
                    aria-label={savedShot
                      ? `查看命中记录 ${index + 1}，结算距离 ${savedShot.distanceM} 米`
                      : `命中记录 ${index + 1} 尚未创建`}
                    title={savedShot ? `命中记录 ${index + 1} · ${savedShot.distanceM} m` : undefined}
                    disabled={!savedShot}
                    onClick={() => savedShot && selectSavedShot(savedShot.shotId)}
                  >
                    <span>记录</span><b>{index + 1}</b>
                  </button>
                );
              })}
            </div>
            <button
              className="viewer-shot-history__clear"
              type="button"
              aria-label={`清除已保留的 ${savedShots.length} 条命中射线`}
              onClick={clearShotVisual}
            >
              清空{savedShots.length}
            </button>
          </div>
          <div className="viewer-shot-heading">
            {activeShotWeaponName ? (
              <strong className="viewer-shot-weapon-name" title={selectedAttackWeapon?.displayNameEnglish}>
                {activeShotWeaponName}
              </strong>
            ) : null}
            <div className="viewer-shot-metrics" aria-label="弹道摘要">
              <span
                data-penetration-kind={ballisticsPenetrationKind}
                title={ballisticsPenetrationLabel}
                aria-label={`${ballisticsPenetrationLabel} ${metricText(ballistics?.penetrationAtRangeMm ?? null)} 毫米`}
              >
                <b>{ballisticsPenetrationKind === "shaped-charge" ? "破甲" : "穿深"}</b>
                {metricText(ballistics?.penetrationAtRangeMm ?? null)} mm
              </span>
              <span title="基础伤害" aria-label={`基础伤害 ${metricText(ballistics?.impactDamageAtRange ?? null)}`}>
                <b>伤害</b>{metricText(ballistics?.impactDamageAtRange ?? null)}
              </span>
              <span
                data-metric="post-penetration-distance"
                title="从首个有效命中点起算的最大后效距离"
                aria-label={`最大后效距离 ${metricText(ballistics?.traceDistanceAfterPenetrationM ?? null)} 米`}
              >
                <b>后效</b>
                {metricText(ballistics?.traceDistanceAfterPenetrationM ?? null)} m
              </span>
            </div>
          </div>
          {effectiveDamageEvents.length > 0 ? (
            <section
              className="viewer-shot-outcome-summary"
              data-has-components={componentDamageOutcomes.length > 0 ? "true" : "false"}
              aria-label="本次命中结果"
            >
              <div className="viewer-shot-outcome-summary__total">
                <span className="viewer-shot-outcome-summary__total-value">
                  <strong>{metricText(totalEffectiveDamage)}</strong>
                  <sub>有效伤害</sub>
                </span>
                {hullDamageOutcome?.maxHealth === null
                  || hullDamageOutcome?.maxHealth === undefined
                  || hullRemainingHealth === null ? null : (
                  <span
                    className="viewer-shot-outcome-summary__hull-health"
                    title="车体剩余血量 / 总血量"
                    aria-label={`车体剩余血量 ${metricText(hullRemainingHealth)}，总血量 ${metricText(hullDamageOutcome.maxHealth)}`}
                  >
                    <i aria-hidden="true">
                      <b style={{ width: `${hullHealthPercent}%` }} />
                    </i>
                    <strong>
                      {metricText(hullRemainingHealth)} / {metricText(hullDamageOutcome.maxHealth)}
                    </strong>
                  </span>
                )}
              </div>
              <div className="viewer-shot-outcome-summary__details">
                <ul className="viewer-shot-outcome-summary__targets">
                {componentDamageOutcomes.slice(0, 4).map((outcome) => {
                  const remainingHealth = outcome.maxHealth === null
                    ? null
                    : Math.max(0, outcome.maxHealth - outcome.poolDamage);
                  const remainingRatio = remainingHealth === null
                    || outcome.maxHealth === null
                    || outcome.maxHealth <= 0
                    ? 0
                    : Math.max(0, Math.min(1, remainingHealth / outcome.maxHealth));
                  return (
                    <li
                      key={`${damageAnimationKey}:outcome:${outcome.key}:${outcome.effect?.id ?? "damage"}`}
                      data-damage-pool={outcome.poolKind}
                      data-damage-kind={outcome.damageKinds.size > 1
                        ? "mixed"
                        : [...outcome.damageKinds][0]}
                      data-damage-effect={outcome.effect?.id}
                    >
                      <span className="viewer-shot-outcome-summary__target-heading">
                        <strong>{outcome.label}</strong>
                        {outcome.damageKinds.size > 1 ? (
                          <small>复合</small>
                        ) : outcome.damageKinds.has("radial") ? (
                          <small>爆炸</small>
                        ) : null}
                        {outcome.effect ? <em>{outcome.effect.label}</em> : null}
                        <b title="本次实际生效伤害">−{metricText(outcome.effectiveDamage)}</b>
                      </span>
                      {remainingHealth === null || outcome.maxHealth === null ? null : (
                        <span
                          className="viewer-shot-outcome-summary__health-rail"
                          title="组件剩余血量 / 总血量"
                          aria-label={`组件剩余血量 ${metricText(remainingHealth)}，总血量 ${metricText(outcome.maxHealth)}`}
                        >
                          <i style={{ width: `${remainingRatio * 100}%` }} aria-hidden="true" />
                          <b>{metricText(remainingHealth)} / {metricText(outcome.maxHealth)}</b>
                        </span>
                      )}
                      {outcome.effect ? (
                        <span className="viewer-damage-effect" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
                {componentDamageOutcomes.length > 4 ? (
                  <li className="viewer-shot-outcome-summary__more">
                    另有 {componentDamageOutcomes.length - 4} 个组件
                  </li>
                ) : null}
                </ul>
              </div>
            </section>
          ) : null}
          {visibleShotLayers.length > 0 ? (
          <div className="viewer-causal-spine__columns" aria-label="路径数值列">
            <span>厚度 · mm</span>
            <span>剩余 · mm</span>
            <span>结果</span>
          </div>
          ) : null}
          <ol className="viewer-causal-spine">
            {visibleShotLayers.map((layer, index) => {
              const component = hitHeader?.components[layer.componentIndex];
              const profile = hitHeader?.surfaceProfiles[layer.surfaceProfileIndex];
              const markerKind = editorPathMarkerKind(
                hitHeader,
                component,
                profile,
                layer.penetrated,
              );
              const isSpacedArmor = markerKind === "spaced-armor";
              const isNoPenetration = markerKind === "no-penetration";
              const physicalMaterial = observedValue(profile?.physicalMaterialPath);
              const layerDamageEvents = damageEventsByLayer.byLayerIndex.get(index) ?? [];
              const pathPresentation = runtimeShotPathLayerPresentation(layer);
              return (
                <li
                  key={`${layer.triangleIndex}:${index}`}
                  className="viewer-causal-spine__step"
                  data-has-next={index < visibleShotLayers.length - 1}
                >
                  <div
                    className="viewer-causal-spine__layer"
                    data-penetrated={layer.penetrated === true}
                    data-spaced-armor={isSpacedArmor}
                    data-no-penetration={isNoPenetration}
                    data-path-marker={markerKind}
                    data-component-index={layer.componentIndex}
                    data-zero-thickness-behavior={layer.armorThicknessMm === 0
                      ? isNoPenetration
                        ? "explicitly-blocked"
                        : layer.penetrated === true
                          ? "penetrated"
                          : layer.stopReason === "post-penetration trace distance is exhausted"
                            ? "trace-exhausted"
                            : "stopped"
                      : undefined}
                  >
                    <i className="viewer-causal-spine__outline" aria-hidden="true" />
                    <b className="viewer-causal-spine__marker" aria-hidden="true">{index + 1}</b>
                    <span
                      className="viewer-causal-spine__label"
                      title={physicalMaterial ? assetLabel(physicalMaterial) : undefined}
                    >
                      {isSpacedArmor ? "附加装甲" : isNoPenetration ? <>无敌区<br />阻穿体</> : semanticLabel(layer.semanticKind)}
                    </span>
                    <span className="viewer-causal-spine__metrics">
                      <span
                        data-metric="thickness"
                        title={layer.armorThicknessMm === 0
                          ? isNoPenetration
                            ? "该表面明确禁用穿透；0 mm 不会覆盖 NoPen 规则"
                            : layer.penetrated === true
                              ? "原生严格比较为可用穿深 > 0 mm，因此该层已穿透"
                              : layer.stopReason ?? "0 mm 表面的穿透状态无法确认"
                          : "装甲厚度"}
                        aria-label={`装甲厚度 ${metricText(layer.armorThicknessMm)} 毫米`}
                      >
                        {layer.armorThicknessMm === null ? "不可穿透" : layer.armorThicknessMm.toFixed(1)}
                      </span>
                      <span
                        data-metric="remaining"
                        title={pathPresentation.remainingPenetrationMm === null
                          ? "射线已在该层终止，没有后续剩余穿深"
                          : `剩余穿深；距首层 ${layer.distanceFromFirstHitM.toFixed(2)} m，后效距离系数 ${(layer.postPenetrationTraceFactor * 100).toFixed(1)}%`}
                        aria-label={pathPresentation.remainingPenetrationMm === null
                          ? "没有后续剩余穿深"
                          : `剩余穿深 ${pathPresentation.remainingPenetrationMm.toFixed(1)} 毫米，距首层 ${layer.distanceFromFirstHitM.toFixed(2)} 米，后效距离系数 ${(layer.postPenetrationTraceFactor * 100).toFixed(1)}%`}
                      >
                        {pathPresentation.remainingPenetrationMm === null
                          ? "—"
                          : pathPresentation.remainingPenetrationMm.toFixed(1)}
                      </span>
                      <span
                        data-metric="result"
                        data-terminal={pathPresentation.terminalLabel ? "true" : "false"}
                        title={pathPresentation.terminalLabel ?? "本层伤害吸收"}
                        aria-label={pathPresentation.terminalLabel
                          ?? (pathPresentation.absorbedDamage !== null && pathPresentation.absorbedDamage > 0
                            ? `吸收伤害 ${pathPresentation.absorbedDamage.toFixed(0)}`
                            : "未吸收伤害")}
                      >
                        {pathPresentation.terminalLabel
                          ?? (pathPresentation.absorbedDamage !== null && pathPresentation.absorbedDamage > 0
                            ? `吸收 ${pathPresentation.absorbedDamage.toFixed(0)}`
                            : "—")}
                      </span>
                    </span>
                  </div>
                  {layerDamageEvents.length > 0 ? (
                      <DamageSettlementListItems
                        events={layerDamageEvents}
                        animationKey={`${damageAnimationKey}:layer:${index}`}
                        penetrationKind={ballisticsPenetrationKind}
                      />
                  ) : null}
                  {index < visibleShotLayers.length - 1 ? (
                    <span className="viewer-causal-spine__connector" aria-hidden="true">
                      <i />
                    </span>
                  ) : null}
                </li>
              );
            })}
            {damageEventsByLayer.unassigned.length > 0 ? (
              <li className="viewer-causal-spine__step viewer-causal-spine__step--unassigned">
                <DamageSettlementListItems
                  events={damageEventsByLayer.unassigned}
                  animationKey={`${damageAnimationKey}:unassigned`}
                  penetrationKind={ballisticsPenetrationKind}
                />
              </li>
            ) : null}
          </ol>
          {hasVehicleRadialDamage &&
          shotResult.radial.layers.length > 0 &&
          shotResult.radial.componentFanout !== "drivetrain-resolved" ? (
            <p
              className="viewer-radial-coverage-note"
              data-state={shotResult.radial.componentFanout}
            >
              {shotResult.radial.componentFanout === "vehicle-radial-disabled"
                ? "该载具不承受径向爆炸伤害"
                : shotResult.radial.componentFanout === "native-query-required"
                  ? "车体爆炸路径已结算；履带 / 车轮不臆算"
                  : "爆炸接收路径不足，未计入不确定伤害"}
            </p>
          ) : null}
          {shotResult.layers.length > 8 ? <span className="viewer-more-layers">另有 {shotResult.layers.length - 8} 层</span> : null}
          </div>
          {effectiveDamageEvents.length > 0 ? (
          <HitDpsTimingCard
            estimates={weaponHitDpsEstimates}
            targets={weaponHitDpsTargets}
            weapon={weaponDpsFacts}
            factsState={hitDpsFactsState}
            factsUnavailableReason={targetBurning.state === "unavailable" ? targetBurning.reason : null}
            clickedSemanticKind={clickedComponent?.semanticKind ?? null}
          />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
