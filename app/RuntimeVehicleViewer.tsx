"use client";

import { CircleAlert, HeartPulse, Layers3, MoveRight, Shield, Swords, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  runtimeTurretFallbackSpec,
  turretArticulationMatrices,
  type RuntimeTurretAssembly,
} from "../lib/turret-articulation";
import {
  editorNativeEffectiveDamageAmount,
  isEditorNativeComponentOnlyDamageEvent,
  isEditorNativeVehicleDamageEvent,
  maxEditorNativeWeaponDistanceM,
  resolveEditorNativeBallistics,
  simulateEditorNativeShot,
  type EditorNativeBallistics,
  type EditorNativeDamageEvent,
  type EditorNativeIntersection,
  type EditorNativeModel,
  type EditorNativeShotResult,
} from "../lib/editor-native-hit-model";
import { editorNativeTraceTerminalDistanceM } from "../lib/editor-native-penetration";
import { editorDamageCardEffect } from "../lib/editor-damage-card-effects";
import {
  RUNTIME_GROUND_SCALE_SEGMENTS,
  runtimeGroundScaleLengthM,
} from "../lib/runtime-ground-scale";
import {
  weaponPenetrationKindForDamageTypePath,
  type WeaponPenetrationKind,
} from "../lib/weapon-penetration-kind";
import {
  VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS,
  explosiveDamageTypeIconKinds,
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
  createHitSceneThreeModel,
  setHitSceneThreeModelArmorThicknessScale,
  setHitSceneThreeModelComponentPoses,
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
import { runtimeAnalysisVisualUrl } from "../lib/runtime-visual-lazy-load";
import infantryPostureRuntime from "./infantry-posture-runtime.json";
import type {
  RuntimeVehiclePreview,
  RuntimeVisualPlacement,
} from "./runtime-probe-preview-data";
import {
  runtimePlanarSuspensionCoverageForGeneratedClass,
  runtimePlanarSuspensionOffsetsByBoneName,
  runtimePlanarSuspensionPoseForVisualOccurrence,
  type RuntimePlanarSuspensionPoseRecord,
} from "./runtime-planar-suspension-pose";
import type {
  ReferenceData,
  ReferenceSeat,
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
  VehicleDamageTypeIcon,
} from "./VehicleDamageTypeIcon";
import {
  INFANTRY_WEAPON_CATEGORIES,
  runtimeAttackWeaponSupportsHitAnalysis,
  runtimeAttackSourceForId,
  runtimeAttackSources,
  type RuntimeAttackSource,
} from "./runtime-probe-weapon-labels";
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
import type { ViewerAssetMode, ViewerNavigationState } from "./viewer-types";
import { VehicleViewerLoading } from "./VehicleViewerLoading";
import { officialVehiclePreviewIssue } from "./vehicle-preview-policy";
import {
  normalizeVehicleSearch,
  rankVerifiedVehicleCandidateSearch,
} from "./vehicle-search";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const STANDARD_SHOT_DAMAGE_MULTIPLIER = 1 as const;
const MAX_VISIBLE_LAYERS = 8;
const SHOT_GESTURE_THRESHOLD_PX = 5;
const DEFAULT_TARGET_DISTANCE_M = 0;
const REFERENCE_SOLDIER_MODEL_PATH =
  "/infantry-hit-runtime/models/4b6caa60516b49563a968cbcf53875126157d15665cc54b9d8921d832d09ae14.glb";
const REFERENCE_SOLDIER_PRODUCTION_BASE_PATH = "/squad";
const RUNTIME_GROUND_REFERENCE_MIN_CLEARANCE_M = 2.25;
const RUNTIME_GROUND_REFERENCE_MAX_CLEARANCE_M = 4;
const RUNTIME_GROUND_SCALE_RENDER_ORDER = 7;
const REFERENCE_SOLDIER_GLASS_MATERIAL_NAME = "MI_USArmyGlass";
const REFERENCE_SOLDIER_GLASS_HEAD_BONE_NAME = "Bip01_Head";
type ReferenceSoldierBoneTransform = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};
const REFERENCE_SOLDIER_STANDING_RIFLE_POSE = (
  infantryPostureRuntime.postures as unknown as Record<
    string,
    {
      boneCount: number;
      bones: Record<string, ReferenceSoldierBoneTransform>;
    }
  >
)["standing-rifle"];
const INFANTRY_WEAPON_CATEGORY_BY_ID = new Map(
  INFANTRY_WEAPON_CATEGORIES.map((category, order) => [
    category.id,
    { ...category, order },
  ]),
);
const INFANTRY_WEAPON_CATEGORY_ORDER_BY_LABEL = new Map<string, number>(
  INFANTRY_WEAPON_CATEGORIES.map((category, order) => [category.label, order]),
);

function referenceSoldierModelUrl() {
  if (typeof window === "undefined") return REFERENCE_SOLDIER_MODEL_PATH;
  const localPreview =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "::1";
  return localPreview
    ? REFERENCE_SOLDIER_MODEL_PATH
    : `${REFERENCE_SOLDIER_PRODUCTION_BASE_PATH}${REFERENCE_SOLDIER_MODEL_PATH}`;
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

function selectorDamageMetric(
  directFireRoute: boolean,
  ballistics: EditorNativeBallistics,
) {
  return directFireRoute
    ? ballistics.impactDamageAtRange
    : ballistics.explosiveLayers.reduce(
      (total, layer) => total + layer.baseDamage,
      0,
    );
}

function selectorDamageTypeIconKinds(
  ballistics: EditorNativeBallistics,
): VehicleDamageTypeIconKind[] {
  const kinds = new Set<VehicleDamageTypeIconKind>();
  const directDamageKind = vehicleDamageTypeIconKindForPath(
    ballistics.damageTypePath,
  );
  if (directDamageKind) kinds.add(directDamageKind);
  for (const kind of explosiveDamageTypeIconKinds(
    ballistics.isExplosive,
    ballistics.explosiveLayers.map(({ damageTypePath }) => damageTypePath),
  )) {
    kinds.add(kind);
  }
  return kinds.size > 0 ? [...kinds] : ["generic"];
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

function applyReferenceSoldierStandingRiflePose(root: THREE.Object3D) {
  let appliedBoneCount = 0;
  for (const [boneName, transform] of Object.entries(
    REFERENCE_SOLDIER_STANDING_RIFLE_POSE.bones,
  )) {
    const bone = root.getObjectByName(boneName);
    if (!(bone instanceof THREE.Bone)) continue;
    bone.position.fromArray(transform.translation);
    bone.quaternion.fromArray(transform.rotation);
    bone.scale.fromArray(transform.scale);
    appliedBoneCount += 1;
  }
  if (appliedBoneCount !== REFERENCE_SOLDIER_STANDING_RIFLE_POSE.boneCount) {
    throw new Error(
      `Reference soldier pose matched ${appliedBoneCount}/${REFERENCE_SOLDIER_STANDING_RIFLE_POSE.boneCount} bones`,
    );
  }
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.frustumCulled = false;
    object.skeleton.update();
  });
}

function rebindReferenceSoldierGlassToHead(root: THREE.Object3D) {
  let reboundMeshCount = 0;
  let reboundVertexCount = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (
      !materials.some(
        ({ name }) => name === REFERENCE_SOLDIER_GLASS_MATERIAL_NAME,
      )
    ) {
      return;
    }
    if (
      materials.some(
        ({ name }) => name !== REFERENCE_SOLDIER_GLASS_MATERIAL_NAME,
      )
    ) {
      throw new Error(
        "Reference soldier glass primitive is merged with another material",
      );
    }
    const headJointIndex = object.skeleton.bones.findIndex(
      ({ name }) => name === REFERENCE_SOLDIER_GLASS_HEAD_BONE_NAME,
    );
    if (headJointIndex < 0) {
      throw new Error("Reference soldier glass is missing its head bone");
    }
    const vertexCount = object.geometry.getAttribute("position")?.count ?? 0;
    if (vertexCount <= 0) {
      throw new Error("Reference soldier glass contains no vertices");
    }
    const jointIndices = new Uint16Array(vertexCount * 4);
    const jointWeights = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      jointIndices[vertex * 4] = headJointIndex;
      jointWeights[vertex * 4] = 1;
    }
    object.geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(jointIndices, 4),
    );
    object.geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(jointWeights, 4),
    );
    object.skeleton.update();
    reboundMeshCount += 1;
    reboundVertexCount += vertexCount;
  });
  if (reboundMeshCount === 0 || reboundVertexCount === 0) {
    throw new Error("Reference soldier glass primitive was not found");
  }
  return { reboundMeshCount, reboundVertexCount };
}

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
const SHOT_EXPLOSION_LAYER_DELAY_MS = 105;
const SHOT_EXPLOSION_DURATION_MS = 880;
const PROTECTION_MAP_DEBOUNCE_MS = 150;
const VIEWER_MODES: Array<[ViewerAssetMode, string]> = [
  ["armor", "装甲"],
  ["interior", "内构"],
  ["exterior", "外观"],
];

interface SearchableSelectMetric {
  penetrationMm: number | null;
  penetrationKind: WeaponPenetrationKind;
  damage: number | null;
  damageLabel?: string;
  damageTypeKinds: VehicleDamageTypeIconKind[];
}

interface RuntimeTurretPreviewStation extends TurretPreviewStation {
  assembly: RuntimeTurretAssembly | null;
  seat: ReferenceSeat;
}

interface RuntimeExteriorOccurrence {
  object: THREE.Group;
  baseMatrix: THREE.Matrix4;
}

interface RuntimeSkeletalPoseBinding {
  controller: RuntimeSkeletalPoseController;
  generatedClass: string | null;
  stableOccurrenceId: string;
  nativePlanarRecord: RuntimePlanarSuspensionPoseRecord | null;
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
  if (!parent) return normalizeTurretYaw(ownYaw);
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

interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  groupDescription?: string;
  searchText?: string;
  searchRank?: (query: string) => number | null;
  disabled?: boolean;
  metrics?: SearchableSelectMetric;
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

function ArmorPenetrationIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.68)}
      viewBox="0 0 24 16"
      fill="none"
      focusable="false"
      aria-hidden="true"
    >
      <path d="M1 5.5h3M0.5 8h3M1 10.5h3" stroke="currentColor" strokeLinecap="round" opacity="0.52" />
      <path
        d="M4 8 8.2 4.7l3 1.45 3.3 1.1v1.5l-3.3 1.1-3 1.45L4 8Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M15.8 1.25h3.1v4.5l-3.1 1.45V1.25ZM15.8 8.8l3.1 1.45v4.5h-3.1V8.8Z"
        fill="currentColor"
        fillOpacity="0.24"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M6.4 7.3h10.5L22.5 8l-5.6.7H6.4V7.3Z" fill="currentColor" />
      <path d="m20.1 5.8 2-1.15M20.8 8h2.4m-3.1 2.2 2 1.15" stroke="currentColor" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function ShapedChargePenetrationIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.68)}
      viewBox="0 0 24 16"
      fill="none"
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M1.5 3.1h6.2v9.8H1.5V3.1Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="m2.8 4.4 4.9 3.6-4.9 3.6V4.4Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M7.7 8h9.15" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="m7.7 8 5.6-1.05v2.1L7.7 8Z" fill="currentColor" fillOpacity="0.76" />
      <path
        d="M16.2 1.25h3v4.55l-3 1.35v-5.9ZM16.2 8.85l3 1.35v4.55h-3v-5.9Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M16.8 7.35 22.6 8l-5.8.65v-1.3Z" fill="currentColor" />
      <path d="m20 5.7 2.15-1.2M20.7 8h2.55M20 10.3l2.15 1.2" stroke="currentColor" strokeLinecap="round" opacity="0.76" />
    </svg>
  );
}

function WeaponPenetrationIcon({
  kind,
  size = 18,
}: {
  kind: WeaponPenetrationKind;
  size?: number;
}) {
  return kind === "shaped-charge"
    ? <ShapedChargePenetrationIcon size={size} />
    : <ArmorPenetrationIcon size={size} />;
}

function RemainingPenetrationIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" focusable="false" aria-hidden="true">
      <path d="M2.25 10.75a6.1 6.1 0 0 1 11.5 0" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M3.2 7.2 1.95 6.55M5.15 4.9l-.75-1.1M8 4.05V2.7m2.85 2.2.75-1.1m1.2 3.4 1.25-.65" stroke="currentColor" strokeLinecap="round" opacity="0.55" />
      <path d="m8 9.75 3.05-3.1" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <circle cx="8" cy="9.75" r="1.35" fill="currentColor" fillOpacity="0.24" stroke="currentColor" />
      <path d="M3.15 12.85h9.7" stroke="currentColor" strokeLinecap="round" opacity="0.38" />
    </svg>
  );
}

function DamageAbsorptionIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" focusable="false" aria-hidden="true">
      <path
        d="M8 1.8 13.1 4v3.65c0 3.1-1.9 5.35-5.1 6.55-3.2-1.2-5.1-3.45-5.1-6.55V4L8 1.8Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M4.65 6.25c1.05.25 1.75.8 2.1 1.75-.35.95-1.05 1.5-2.1 1.75M11.35 6.25C10.3 6.5 9.6 7.05 9.25 8c.35.95 1.05 1.5 2.1 1.75" stroke="currentColor" strokeLinecap="round" opacity="0.62" />
      <circle cx="8" cy="8" r="1.55" fill="currentColor" fillOpacity="0.25" stroke="currentColor" />
      <circle cx="8" cy="8" r="0.48" fill="currentColor" />
    </svg>
  );
}

function PathMetricLegend({
  includeAbsorption = false,
  penetrationKind,
}: {
  includeAbsorption?: boolean;
  penetrationKind: WeaponPenetrationKind;
}) {
  return (
    <div className="viewer-path-metric-legend" aria-label="穿透路径指标图例">
      <span
        data-metric="penetration"
        data-penetration-kind={penetrationKind}
      >
        <WeaponPenetrationIcon kind={penetrationKind} size={15} />
        {penetrationKind === "shaped-charge" ? "破甲" : "穿深"}
      </span>
      <span data-metric="thickness"><Layers3 size={14} aria-hidden="true" />厚度</span>
      <span data-metric="remaining"><RemainingPenetrationIcon />剩余穿深</span>
      {includeAbsorption ? (
        <span data-metric="absorption"><DamageAbsorptionIcon />伤害吸收</span>
      ) : null}
    </div>
  );
}

function SearchableSelect({
  ariaLabel,
  value,
  options,
  searchOptions,
  searchPlaceholder,
  groupJumps = false,
  sortGroupMetrics = false,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: SearchableSelectOption[];
  searchOptions?: SearchableSelectOption[];
  searchPlaceholder: string;
  groupJumps?: boolean;
  sortGroupMetrics?: boolean;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const normalizedQuery = normalizeVehicleSearch(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return (searchOptions ?? options)
      .map((option, originalIndex) => {
        const rank = option.searchRank
          ? option.searchRank(normalizedQuery)
          : normalizeVehicleSearch(
              `${option.group ?? ""} ${option.label} ${option.searchText ?? ""}`,
            ).includes(normalizedQuery)
            ? 0
            : null;
        return { option, originalIndex, rank };
      })
      .filter((result): result is {
        option: SearchableSelectOption;
        originalIndex: number;
        rank: number;
      } => result.rank !== null)
      .sort((left, right) => left.rank - right.rank || left.originalIndex - right.originalIndex)
      .map(({ option }) => option);
  }, [normalizedQuery, options, searchOptions]);
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, SearchableSelectOption[]>();
    filteredOptions.forEach((option) => {
      const group = option.group ?? "";
      groups.set(group, [...(groups.get(group) ?? []), option]);
    });
    return [...groups.entries()].map(([group, groupOptions]) => [
      group,
      sortGroupMetrics
        ? groupOptions
            .map((option, originalIndex) => ({ option, originalIndex }))
            .sort((left, right) => {
              const leftPenetration =
                left.option.metrics?.penetrationMm ?? Number.NEGATIVE_INFINITY;
              const rightPenetration =
                right.option.metrics?.penetrationMm ?? Number.NEGATIVE_INFINITY;
              return rightPenetration - leftPenetration ||
                left.originalIndex - right.originalIndex;
            })
            .map(({ option }) => option)
        : groupOptions,
    ] as const);
  }, [filteredOptions, sortGroupMetrics]);
  const jumpGroups =
    groupJumps && !normalizedQuery
      ? groupedOptions.filter(([group]) => Boolean(group))
      : [];

  useEffect(() => {
    if (!open) return;
    const animationFrame = requestAnimationFrame(() => searchRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectOption = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };
  const jumpToGroup = (group: string) => {
    const optionsElement = optionsRef.current;
    const groupElement = groupRefs.current.get(group);
    if (!optionsElement || !groupElement) return;
    optionsElement.scrollTo({
      top: Math.max(0, groupElement.offsetTop - optionsElement.offsetTop),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  const renderMetrics = (metrics: SearchableSelectMetric | undefined) => {
    if (!metrics) return null;
    const penetrationLabel = metrics.penetrationKind === "shaped-charge"
      ? "破甲深度"
      : "穿深";
    const damageTypeLabel = metrics.damageTypeKinds
      .map(vehicleDamageTypeIconLabel)
      .join("、");
    const damageLabel = metrics.damageLabel ?? "伤害";
    const hasPenetration = metrics.penetrationMm !== null;
    return (
      <span className="viewer-search-select__metrics">
        <span
          data-term="damage-types"
          data-penetration-kind={metrics.penetrationKind}
          data-has-penetration={hasPenetration}
          title={hasPenetration
            ? `${damageTypeLabel} · ${penetrationLabel} ${metricText(metrics.penetrationMm)} mm`
            : damageTypeLabel}
          aria-label={hasPenetration
            ? `${damageTypeLabel}，${penetrationLabel} ${metricText(metrics.penetrationMm)} 毫米`
            : damageTypeLabel}
        >
          {metrics.damageTypeKinds.map((kind, index) => (
            <span
              className="viewer-search-select__damage-type"
              data-primary={index === 0}
              key={kind}
            >
              <VehicleDamageTypeIcon kind={kind} size={17} />
              {index === 0 && hasPenetration ? (
                <b className="viewer-search-select__penetration">
                  {metricText(metrics.penetrationMm)}
                </b>
              ) : null}
            </span>
          ))}
        </span>
        <span
          data-term="damage"
          title={damageLabel}
          aria-label={`${damageLabel} ${metricText(metrics.damage)}`}
        >
          <Swords size={11} aria-hidden="true" />
          <b className="viewer-search-select__damage-value">
            {metricText(metrics.damage)}
          </b>
        </span>
      </span>
    );
  };

  return (
    <div className="viewer-search-select" ref={rootRef} data-open={open}>
      <button
        className="viewer-search-select__trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="viewer-search-select__value">{selectedOption?.label ?? "请选择"}</span>
        {renderMetrics(selectedOption?.metrics)}
        <span className="viewer-search-select__chevron" aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="viewer-search-select__menu">
          <div className="viewer-search-select__search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const firstEnabledOption = filteredOptions.find((option) => !option.disabled);
                if (!firstEnabledOption) return;
                event.preventDefault();
                selectOption(firstEnabledOption);
              }}
            />
            {query ? (
              <button
                className="viewer-search-select__clear"
                type="button"
                aria-label="清除搜索关键词"
                title="清除搜索"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {jumpGroups.length > 1 ? (
            <nav className="viewer-search-select__jumps" aria-label="武器分类快捷跳转">
              {jumpGroups.map(([group, groupOptions]) => (
                <button
                  type="button"
                  key={group}
                  title={groupOptions[0]?.groupDescription}
                  aria-label={`跳转到${group}，${groupOptions.length} 项`}
                  onClick={() => jumpToGroup(group)}
                >
                  <span>{group}</span>
                  <small>{groupOptions.length}</small>
                </button>
              ))}
            </nav>
          ) : null}
          <div
            ref={optionsRef}
            className="viewer-search-select__options"
            role="listbox"
            aria-label={ariaLabel}
          >
            {groupedOptions.length > 0 ? groupedOptions.map(([group, groupOptions]) => (
              <div
                ref={(node) => {
                  if (!group) return;
                  if (node) groupRefs.current.set(group, node);
                  else groupRefs.current.delete(group);
                }}
                className="viewer-search-select__group"
                role="group"
                aria-label={group || undefined}
                key={group || "default"}
              >
                {group ? (
                  <strong title={groupOptions[0]?.groupDescription}>{group}</strong>
                ) : null}
                {groupOptions.map((option) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={option.disabled}
                    data-selected={option.value === value}
                    key={option.value}
                    onClick={() => selectOption(option)}
                  >
                    <span>{option.label}</span>
                    {renderMetrics(option.metrics)}
                  </button>
                ))}
              </div>
            )) : <span className="viewer-search-select__empty">没有匹配项</span>}
          </div>
        </div>
      ) : null}
    </div>
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

interface ShotExplosionLayerVisual {
  root: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  pressureSurface: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  baseRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  damageTypeIcon: THREE.Sprite;
  damageTypeIconCanvas: HTMLCanvasElement;
  damageTypeIconTexture: THREE.CanvasTexture;
  iconAngleOffsetRad: number;
  configured: boolean;
  delayMs: number;
  outerRadiusM: number;
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
}

interface RuntimeShotRecord extends SavedRuntimeShot {
  intersections: EditorNativeIntersection[];
  visual: ShotVisualRuntime;
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

function createRuntimeGroundScaleAxis(
  lengthM: number,
  axisName: "length" | "width",
  labelSide: 1 | -1 = 1,
) {
  const group = new THREE.Group();
  group.name = `runtime-ground-scale-${axisName}-axis`;
  const segmentLengthM = lengthM / RUNTIME_GROUND_SCALE_SEGMENTS;
  const thicknessM = THREE.MathUtils.clamp(lengthM * 0.004, 0.004, 0.018);
  const depthM = thicknessM * 1.8;

  const outline = new THREE.Mesh(
    new THREE.BoxGeometry(
      lengthM,
      thicknessM * 0.45,
      depthM * 0.7,
    ),
    new THREE.MeshBasicMaterial({
      color: 0x66757b,
      transparent: true,
      opacity: 0.2,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  outline.name = "runtime-ground-scale-outline";
  outline.position.set(lengthM / 2, thicknessM * 0.3, 0);
  outline.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
  group.add(outline);

  for (
    let segmentIndex = 0;
    segmentIndex < RUNTIME_GROUND_SCALE_SEGMENTS;
    segmentIndex += 1
  ) {
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(0.001, segmentLengthM - thicknessM * 0.8),
        thicknessM * 0.55,
        depthM,
      ),
      new THREE.MeshBasicMaterial({
        color: segmentIndex % 2 === 0 ? 0x82939a : 0x596970,
        transparent: true,
        opacity: segmentIndex % 2 === 0 ? 0.34 : 0.22,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    segment.name = `runtime-ground-scale-segment-${segmentIndex + 1}`;
    segment.position.set(
      segmentLengthM * (segmentIndex + 0.5),
      thicknessM * 1.15,
      0,
    );
    segment.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
    group.add(segment);
  }

  for (
    let tickIndex = 0;
    tickIndex <= RUNTIME_GROUND_SCALE_SEGMENTS;
    tickIndex += 1
  ) {
    const endpoint = tickIndex === 0 || tickIndex === RUNTIME_GROUND_SCALE_SEGMENTS;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(
        thicknessM * (endpoint ? 0.9 : 0.65),
        thicknessM * 0.72,
        depthM * (endpoint ? 3.2 : 2.4),
      ),
      new THREE.MeshBasicMaterial({
        color: 0x8da0a7,
        transparent: true,
        opacity: endpoint ? 0.44 : 0.32,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    tick.name = `runtime-ground-scale-tick-${tickIndex}`;
    tick.position.set(
      segmentLengthM * tickIndex,
      thicknessM * 1.2,
      0,
    );
    tick.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
    group.add(tick);
  }

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 72;
  const context = labelCanvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.font = '700 42px "Cascadia Mono", Consolas, monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 5;
    context.strokeStyle = "rgba(4, 8, 9, 0.55)";
    context.strokeText(`${lengthM} m`, 128, 36);
    context.fillStyle = "rgba(157, 176, 183, 0.72)";
    context.fillText(`${lengthM} m`, 128, 36);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelWidthM = Math.max(lengthM * 0.34, 0.16);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelWidthM, labelWidthM * (72 / 256)),
    new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  label.name = "runtime-ground-scale-label";
  label.rotation.x = -Math.PI / 2;
  label.position.set(
    lengthM / 2,
    thicknessM * 1.7,
    (depthM * 2.2 + labelWidthM * 0.18) * labelSide,
  );
  label.renderOrder = RUNTIME_GROUND_SCALE_RENDER_ORDER;
  group.add(label);

  return group;
}

function createRuntimeGroundScale(
  lengthM: number,
  widthM: number,
) {
  const group = new THREE.Group();
  group.name = "runtime-ground-scale";
  group.add(createRuntimeGroundScaleAxis(lengthM, "length"));
  const widthAxis = createRuntimeGroundScaleAxis(widthM, "width", -1);
  widthAxis.rotation.y = -Math.PI / 2;
  group.add(widthAxis);

  const origin = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.052, 24),
    new THREE.MeshBasicMaterial({
      color: 0xb9c9cf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.56,
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

function sourceMeshRequiresStableAnalysisSurface(mesh: THREE.Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) =>
    material.transparent ||
    material.opacity < 0.999 ||
    material.alphaTest > 0 ||
    material.blending !== THREE.NormalBlending
  );
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

function createAnalysisVisualMaterial(stableSurface = false) {
  const shared = {
    color: new THREE.Color("#89949a"),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.28,
    depthTest: true,
    depthWrite: false,
  } as const;
  if (stableSurface) {
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
) {
  const previousMaterials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  mesh.material = Array.isArray(mesh.material)
    ? previousMaterials.map(() =>
        createAnalysisVisualMaterial(stableSurface)
      )
    : createAnalysisVisualMaterial(stableSurface);
  if (disposePrevious) {
    previousMaterials.forEach((material) => material.dispose());
  }
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

function shouldShowPenetrationDamageLane(
  result: EditorNativeShotResult,
  directFireRoute: boolean,
) {
  if (effectiveDamageEventsByKind(result, "point").length > 0) return true;
  const hasDirectBallisticRoute =
    directFireRoute && (
      (result.ballistics.penetrationAtRangeMm ?? 0) > 0
      || (result.ballistics.impactDamageAtRange ?? 0) > 0
    );
  return hasDirectBallisticRoute && result.stoppedAtLayer !== null;
}

function shouldShowExplosionDamageLane(result: EditorNativeShotResult) {
  return effectiveDamageEventsByKind(result, "radial").length > 0;
}

function DamageEventListItems({
  events,
  animationKey,
  penetrationKind,
}: {
  events: readonly EditorNativeDamageEvent[];
  animationKey: string;
  penetrationKind?: WeaponPenetrationKind;
}) {
  return events.map((damage, index) => {
    const effectiveDamage = editorNativeEffectiveDamageAmount(damage);
    const effect = editorDamageCardEffect(
      damage.poolKind,
      damage.poolDamage,
      damage.maxHealth,
    );
    const damageTypeIconKind =
      damage.damageKind === "radial"
        ? explosiveDamageTypeIconKinds(
            true,
            damage.damageTypePath ?? null,
          )[0] ?? "generic"
        : null;
    return (
      <li
        key={`${animationKey}:${damage.poolIndex}:${damage.route}:${index}:${effect?.id ?? "damage"}`}
        data-penetrated="true"
        data-no-damage="false"
        data-damage-pool={damage.poolKind}
        data-damage-kind={damage.damageKind}
        data-damage-type-kind={damageTypeIconKind ?? undefined}
        data-damage-effect={effect?.id}
        style={
          damageTypeIconKind
            ? {
                "--explosion-type-color":
                  vehicleDamageTypeIconColor(damageTypeIconKind),
              } as CSSProperties
            : undefined
        }
      >
        <span className="viewer-damage-target">
          {damage.damageKind === "radial" ? (
            <span
              className="viewer-damage-target__damage-type-icon"
              title={vehicleDamageTypeIconLabel(damageTypeIconKind ?? "generic")}
              aria-label={vehicleDamageTypeIconLabel(damageTypeIconKind ?? "generic")}
            >
              <VehicleDamageTypeIcon
                kind={damageTypeIconKind ?? "generic"}
                size={24}
              />
            </span>
          ) : (
            <span
              className="viewer-damage-target__penetration-icon"
              title={penetrationKind === "shaped-charge" ? "破甲弹" : "动能穿甲弹"}
              aria-label={penetrationKind === "shaped-charge" ? "破甲弹" : "动能穿甲弹"}
            >
              <WeaponPenetrationIcon
                kind={penetrationKind ?? "kinetic"}
                size={24}
              />
            </span>
          )}
          {editorPoolLabel(damage.poolKind)}
          {effect ? (
            <em className="viewer-damage-outcome">{effect.label}</em>
          ) : null}
        </span>
        <span
          className="viewer-damage-equation"
          aria-label={
            damage.damageKind === "radial"
              ? `爆炸伤害 ${metricText(damage.incomingDamage)} 乘伤害类型系数 ${damageModifierText(damage.damageTypeModifier)}，乘直接爆炸系数 ${damageModifierText(damage.routeMultiplier)}，池伤害 ${metricText(damage.poolDamage)}，实际生效 ${metricText(effectiveDamage)}`
              : `直击伤害 ${metricText(damage.incomingDamage)} 乘伤害类型系数 ${damageModifierText(damage.damageTypeModifier)}，池伤害 ${metricText(damage.poolDamage)}，实际生效 ${metricText(effectiveDamage)}`
          }
        >
          <span data-term="damage" title="伤害">
            <Swords size={12} aria-hidden="true" />
            {metricText(damage.incomingDamage)}
          </span>
          <i aria-hidden="true">×</i>
          <span data-term="mitigation" title="伤害类型乘数">
            <Shield size={12} aria-hidden="true" />
            {damageModifierText(damage.damageTypeModifier)}
          </span>
          {damage.damageKind === "radial" ? (
            <>
              <i aria-hidden="true">×</i>
              <span data-term="radial-route" title="直接爆炸乘数">
                {damageModifierText(damage.routeMultiplier)}
              </span>
            </>
          ) : null}
          <i aria-hidden="true">=</i>
          <strong>{metricText(effectiveDamage)}</strong>
          {damage.maxHealth === null ? null : (
            <span
              className="viewer-damage-health"
              title="总血量"
              aria-hidden="true"
            >
              <HeartPulse size={12} />
              {metricText(damage.maxHealth)}
            </span>
          )}
        </span>
        {effect ? (
          <span className="viewer-damage-effect" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
      </li>
    );
  });
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

function updateShotExplosionDamageTypeIconPosition(
  visual: ShotExplosionLayerVisual,
  camera: THREE.Camera,
) {
  if (!visual.configured || !visual.root.visible) return;
  const radiusM = visual.pressureSurface.scale.x;
  if (radiusM <= 0.0001) return;
  const rootWorldPosition = visual.root.getWorldPosition(new THREE.Vector3());
  const rootWorldQuaternion = visual.root.getWorldQuaternion(
    new THREE.Quaternion(),
  );
  const localCameraDirection = camera
    .getWorldPosition(new THREE.Vector3())
    .sub(rootWorldPosition)
    .applyQuaternion(rootWorldQuaternion.invert());
  localCameraDirection.y = 0;
  if (localCameraDirection.lengthSq() < 0.000001) {
    localCameraDirection.set(0, 0, 1);
  } else {
    localCameraDirection.normalize();
  }
  localCameraDirection.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    visual.iconAngleOffsetRad,
  );
  visual.damageTypeIcon.position.set(
    localCameraDirection.x * radiusM,
    Math.max(0.025, radiusM * 0.0025),
    localCameraDirection.z * radiusM,
  );
  const iconWidthM = THREE.MathUtils.clamp(
    visual.outerRadiusM * 0.065,
    0.3,
    0.78,
  );
  visual.damageTypeIcon.scale.set(iconWidthM, iconWidthM * 0.7, 1);
}

function createShotExplosionLayerVisual(
  traceIndex: number,
  layerIndex: number,
): ShotExplosionLayerVisual {
  const renderOrder = 29 + traceIndex * 12 + layerIndex;
  const root = new THREE.Group();
  root.name = `editor-native-shot-explosion-layer-${layerIndex + 1}`;
  root.renderOrder = renderOrder;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffa12b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  core.name = "editor-native-shot-explosion-core";
  core.renderOrder = renderOrder + 3;
  root.add(core);

  const pressureSurface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
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
  pressureSurface.name = "editor-native-shot-explosion-pressure-surface";
  pressureSurface.renderOrder = renderOrder;
  root.add(pressureSurface);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.0075, 6, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffa12b,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  baseRing.name = "editor-native-shot-explosion-base-ring";
  baseRing.rotation.x = Math.PI / 2;
  baseRing.renderOrder = renderOrder + 1;
  root.add(baseRing);

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

  root.visible = false;
  const visual: ShotExplosionLayerVisual = {
    root,
    core,
    pressureSurface,
    baseRing,
    damageTypeIcon,
    damageTypeIconCanvas,
    damageTypeIconTexture,
    iconAngleOffsetRad:
      (layerIndex % 2 === 0 ? -1 : 1)
      * (Math.floor(layerIndex / 2) + 1)
      * 0.18,
    configured: false,
    delayMs: 0,
    outerRadiusM: 0,
  };
  paintShotExplosionDamageTypeIcon(
    visual,
    "generic",
    shotExplosionColor("generic"),
  );
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
  },
) {
  visual.configured = true;
  visual.delayMs = delayMs;
  visual.outerRadiusM = Math.max(0, outerRadiusM);
  visual.root.position.copy(origin);
  const safeNormal = normal.lengthSq() < 0.000001
    ? new THREE.Vector3(0, 1, 0)
    : normal.clone().normalize();
  visual.root.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    safeNormal,
  );
  visual.root.userData.layerId = layerId;
  visual.root.userData.damageTypePath = damageTypePath;
  visual.root.userData.damageTypeIconKind = damageTypeIconKind;
  visual.root.userData.outerRadiusM = outerRadiusM;
  visual.root.userData.innerRadiusM = innerRadiusM;
  visual.root.userData.visualClip = "surface-normal-hemisphere";
  visual.root.userData.surfaceNormal = safeNormal.toArray();
  visual.core.material.color.setHex(color);
  visual.pressureSurface.material.color.setHex(color);
  visual.baseRing.material.color.setHex(color);
  paintShotExplosionDamageTypeIcon(visual, damageTypeIconKind, color);
}

function clearShotExplosionLayerVisual(visual: ShotExplosionLayerVisual) {
  visual.configured = false;
  visual.root.visible = false;
  visual.core.material.opacity = 0;
  visual.pressureSurface.material.opacity = 0;
  visual.baseRing.material.opacity = 0;
  visual.damageTypeIcon.material.opacity = 0;
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
  visual.core.scale.setScalar(
    THREE.MathUtils.clamp(visual.outerRadiusM * 0.018, 0.045, 0.18),
  );
  visual.pressureSurface.scale.setScalar(visual.outerRadiusM);
  visual.baseRing.scale.setScalar(visual.outerRadiusM);
  visual.core.material.opacity = 0.2;
  visual.pressureSurface.material.opacity = 0.075;
  visual.baseRing.material.opacity = 0.34;
  visual.damageTypeIcon.material.opacity = 0.96;
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
    return;
  }
  const localElapsedMs = elapsedMs - visual.delayMs;
  if (localElapsedMs >= SHOT_EXPLOSION_DURATION_MS) {
    settleShotExplosionLayerVisual(visual, selected);
    return;
  }
  const progress = THREE.MathUtils.clamp(
    localElapsedMs / SHOT_EXPLOSION_DURATION_MS,
    0,
    1,
  );
  const expansion = easeOutCubic(progress);
  const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.46, 1);
  visual.root.visible = true;
  const currentRadiusM = Math.max(
    0.001,
    visual.outerRadiusM * expansion,
  );
  visual.pressureSurface.scale.setScalar(currentRadiusM);
  visual.baseRing.scale.setScalar(currentRadiusM);
  visual.core.scale.setScalar(
    THREE.MathUtils.clamp(
      visual.outerRadiusM
        * (0.008 + Math.sin(Math.min(1, progress * 1.7) * Math.PI) * 0.024),
      0.05,
      0.28,
    ),
  );
  visual.core.material.opacity = 0.16 + fade * 0.66;
  visual.pressureSurface.material.opacity = 0.06 + fade * 0.1;
  visual.baseRing.material.opacity = 0.18 + fade * 0.24;
  visual.damageTypeIcon.material.opacity =
    THREE.MathUtils.smoothstep(progress, 0.26, 0.64);
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

function turretStationEquipmentLabel(
  referenceData: ReferenceData,
  seat: ReferenceSeat,
) {
  const labels = [...new Set(
    referenceData.weapons
      .filter((weapon) => weapon.turretName === seat.turretName)
      .map((weapon) => weapon.displayName)
      .filter(Boolean),
  )];
  if (labels.length === 0) return seat.turretName ?? "炮塔";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} 等 ${labels.length} 项`;
}

export function RuntimeVehicleViewer({
  preview,
  showChrome = true,
  mode: requestedMode = "exterior",
  displayName = preview.variantRawName,
  referenceData,
  onModeChange,
  onClose,
  navigationState,
  onNavigationStateChange,
  onExteriorStreamingChange,
}: {
  preview: RuntimeVehiclePreview;
  showChrome?: boolean;
  mode?: ViewerAssetMode;
  displayName?: string;
  referenceData?: ReferenceData | null;
  onModeChange?: (mode: ViewerAssetMode) => void;
  onClose?: () => void;
  navigationState?: ViewerNavigationState;
  onNavigationStateChange?: (state: ViewerNavigationState) => void;
  onExteriorStreamingChange?: (state: { loaded: number; total: number } | null) => void;
}) {
  const previewIssue = officialVehiclePreviewIssue(preview.variantRawName);
  const exteriorUnavailableMessage = previewIssue?.message;
  const mode = previewIssue && requestedMode === "exterior" ? "armor" : requestedMode;
  const hostRef = useRef<HTMLDivElement>(null);
  const protectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const resetViewRef = useRef<
    ((options?: { preserveShotVisual?: boolean }) => void) | null
  >(null);
  const visualGroupRef = useRef<THREE.Group | null>(null);
  const analysisVisualGroupRef = useRef<THREE.Group | null>(null);
  const hitGroupRef = useRef<THREE.Group | null>(null);
  const activateAssetModeRef = useRef<((mode: ViewerAssetMode) => void) | null>(null);
  const applyCameraNavigationRef = useRef<
    ((state: ViewerNavigationState | undefined) => void) | null
  >(null);
  const analysisMeshRef = useRef<THREE.Mesh | null>(null);
  const parsedHitRef = useRef<ParsedRuntimeHitScene | null>(null);
  const attackModelRef = useRef<EditorNativeModel | null>(null);
  const hitModelRef = useRef<HitSceneThreeModel | null>(null);
  const shotVisualsRef = useRef<ShotVisualRuntime[]>([]);
  const shotRecordsRef = useRef<RuntimeShotRecord[]>([]);
  const activeShotIdRef = useRef<number | null>(null);
  const shotSequenceRef = useRef(0);
  const shotAnimationFrameRef = useRef(0);
  const animatedShotIdRef = useRef<number | null>(null);
  const navigationStateRef = useRef(navigationState);
  const onNavigationStateChangeRef = useRef(onNavigationStateChange);
  const pendingSharedShotsRef = useRef(
    decodeSharedShotPaths(navigationState?.shots ?? ""),
  );
  const renderRef = useRef<(() => void) | null>(null);
  const exteriorOccurrencesRef = useRef<Map<string, RuntimeExteriorOccurrence>>(
    new Map(),
  );
  const applyChassisPoseRef = useRef<((enabled: boolean) => void) | null>(null);
  const physicalPoseEnabledRef = useRef(true);
  const applyTurretPoseRef = useRef<(() => void) | null>(null);
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
  const targetDistanceRef = useRef(navigationState?.distance ?? DEFAULT_TARGET_DISTANCE_M);
  const specialArmorVisibleRef = useRef(true);
  const exteriorSpacedArmorHighlightRef = useRef(false);
  const relativeArmorScaleRef = useRef(false);
  const protectionEnabledRef = useRef(false);
  const protectionOpacityRef = useRef(70);
  const protectionPrecisionRef = useRef<RuntimeProtectionMapPrecision>(
    RUNTIME_PROTECTION_MAP_MIN_PRECISION,
  );
  const scheduleProtectionMapRef = useRef<
    ((options?: ProtectionMapScheduleOptions) => void) | null
  >(null);
  const cancelProtectionMapRef = useRef<(() => void) | null>(null);
  const visual = preview.visual;
  const hit = preview.hit;
  const chassisPose = preview.chassisPose;
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
  const vehicleMeshPlanarSuspensionPose = vehicleMeshRuntimePosePlacement
    ? runtimePlanarSuspensionPoseForVisualOccurrence(
        preview.generatedClass,
        vehicleMeshRuntimePosePlacement.stableOccurrenceId,
      )
    : null;
  const vehiclePlanarSuspensionCoverage =
    runtimePlanarSuspensionCoverageForGeneratedClass(preview.generatedClass);
  const vehicleMeshPlanarNonzeroWheelCount =
    vehicleMeshPlanarSuspensionPose?.wheels.filter(
      ({ localTranslationOffsetGltfM: [x, y, z] }) =>
        x !== 0 || y !== 0 || z !== 0,
    ).length ?? 0;
  const uniqueAssetCount = visual ? new Set(visual.placements.map(({ assetUrl }) => assetUrl)).size : 0;
  const runtimeTurretStations = useMemo<RuntimeTurretPreviewStation[]>(() => {
    if (!referenceData || !visual) return [];
    const seats = referenceData.seats.filter(
      (seat) => Boolean(seat.turret && seat.turretName),
    );
    const primarySeat = seats.find(
      (seat) => seat.role === "gunner" && seat.stationKind === "weapon-station",
    ) ?? seats.find((seat) => seat.role === "gunner") ?? seats[0];
    const dedupedPlacements = dedupeIdenticalVisualPlacements(
      visual.placements,
    ).placements;
    const allTurretNames = [
      ...new Set(seats.map((seat) => seat.turretName!)),
    ];
    const fallbackSpecs = new Map(
      allTurretNames.map((turretName) => [
        turretName,
        runtimeTurretFallbackSpec(preview.generatedClass, turretName),
      ]),
    );
    const stations = seats.map((seat) => {
      const indicatorKind: TurretPreviewIndicatorKind =
        seat === primarySeat
          ? "main-turret"
          : seat.stationKind === "remote-weapon-station"
            ? "weapon-station"
            : seat.role === "machine-gunner" ||
                seat.stationKind === "weapon-station"
              ? "machine-gun"
              : "weapon-station";
      const stationWeaponNames = referenceData.weapons
        .filter((weapon) => weapon.turretName === seat.turretName)
        .map((weapon) => weapon.gunName);
      const assembly = resolveRuntimeTurretAssembly({
        placements: dedupedPlacements,
        vehicleGeneratedClass: preview.generatedClass,
        turretName: seat.turretName!,
        stationWeaponNames,
        articulation: seat.turret!.articulation,
        primary: seat === primarySeat,
        siblingTurretNames: allTurretNames,
        absorbsSiblingStations: seat === primarySeat && seat.role === "gunner",
        fallbackYawAnchorComponentName:
          fallbackSpecs.get(seat.turretName!)?.yawAnchorComponentName,
        fallbackYawAnchorActorName:
          fallbackSpecs.get(seat.turretName!)?.yawAnchorActorName,
        fallbackPitchUsesYawAnchor:
          fallbackSpecs.get(seat.turretName!)?.pitchUsesYawAnchor,
        fallbackHitActorClassNames:
          fallbackSpecs.get(seat.turretName!)?.hitActorClassNames,
        carriedHitActorClassNames: seat === primarySeat && seat.role === "gunner"
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
      });
      return {
        id: `${seat.index}:${seat.turretName}`,
        label: `${turretStationRoleLabel(seat.role)} · F${seat.index}`,
        equipmentLabel: turretStationEquipmentLabel(referenceData, seat),
        turret: seat.turret!,
        indicatorKind,
        yawAvailable: Boolean(assembly?.yawPlacementIds.length),
        pitchAvailable: Boolean(assembly?.pitchPlacementIds.length),
        assembly,
        seat,
      };
    });
    const nestedAssemblies = carryNestedRuntimeTurretAssemblies(
      stations.map((station) => station.assembly),
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
  }, [preview.generatedClass, referenceData, visual]);
  const defaultTurretStation = runtimeTurretStations.find(
    (station) =>
      station.seat.role === "gunner" &&
      station.seat.stationKind === "weapon-station",
  ) ?? runtimeTurretStations.find(
    (station) => station.seat.role === "gunner",
  ) ?? runtimeTurretStations[0] ?? null;
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
  const [attackSourceCardId, setAttackSourceCardId] = useState(() =>
    runtimeAttackSourceForId(navigationState?.attacker ?? "")?.cardId ??
    runtimeAttackSourceForId(preview.cardId)?.cardId ??
    runtimeAttackSources[0]?.cardId ??
    ""
  );
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
    navigationState?.distance ?? DEFAULT_TARGET_DISTANCE_M,
  );
  // The parent navigation update rerenders the full catalog tree. Keep it out
  // of continuous range input and publish the final distance on interaction end.
  const [distanceInteractionActive, setDistanceInteractionActive] = useState(false);
  const [specialArmorVisible, setSpecialArmorVisible] = useState(true);
  const [exteriorSpacedArmorHighlight, setExteriorSpacedArmorHighlight] =
    useState(false);
  const [physicalPoseEnabled, setPhysicalPoseEnabled] = useState(true);
  const [relativeArmorScale, setRelativeArmorScale] = useState(false);
  const [armorThicknessRange, setArmorThicknessRange] =
    useState<HitSceneArmorThicknessRange | null>(null);
  const [shotResult, setShotResult] = useState<EditorNativeShotResult | null>(null);
  const [savedShots, setSavedShots] = useState<SavedRuntimeShot[]>([]);
  const [activeShotId, setActiveShotId] = useState<number | null>(null);
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
  const attackSource = runtimeAttackSourceForId(attackSourceCardId) ?? null;
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
  const catalogCompletedWeaponCount = attackSource?.catalogCompletedWeaponCount ?? 0;
  const attackReady =
    attackState.kind === "ready" && loadedAttackSourceCardId === attackSource?.cardId;
  const verdict = shotVerdict(shotResult);
  const maxDistanceM = attackHeader && weaponIndex >= 0
    ? maxEditorNativeWeaponDistanceM(attackHeader, weaponIndex)
    : 0;
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
  const weaponSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!attackSource) return [];
    const selectOptions: SearchableSelectOption[] = attackSource.weapons.map((weapon, optionIndex) => {
      const ballistics = resolveEditorNativeBallistics(
        weapon.ballisticsModel,
        weapon.ballisticsWeaponIndex,
        targetDistanceM,
      );
      const infantryCategory = weapon.infantryCategory
        ? INFANTRY_WEAPON_CATEGORY_BY_ID.get(weapon.infantryCategory)
        : null;
      const explosiveGroup = weapon.explosiveCategoryLabel ?? null;
      return {
        value: weaponSelectionValue(attackSource.cardId, optionIndex),
        label: weapon.displayNameZh,
        group: explosiveGroup ?? infantryCategory?.label,
        groupDescription: explosiveGroup
          ? weapon.explosiveLayerOrderClosed
            ? "官方 Editor 爆炸配方；多层顺序已有动态证据"
            : "官方 Editor 爆炸配方；多层顺序仍按资产声明展示"
          : infantryCategory?.description,
        searchText:
          `${weapon.displayNameEnglish} ${weapon.gunName} ${weapon.runtimeAssetPath ?? ""} ${(weapon.searchAliases ?? []).join(" ")}`,
        searchRank: (query) => rankVerifiedVehicleCandidateSearch({
          primary: [weapon.displayNameZh, weapon.displayNameEnglish],
          aliases: [
            weapon.gunName,
            weapon.projectileName ?? "",
            weapon.runtimeAssetPath ?? "",
            weapon.sourceCardId,
            weapon.sourceRawName,
            ...(weapon.searchAliases ?? []),
          ],
          context: [attackSource.displayName, attackSource.groupName],
        }, query),
        metrics: {
          penetrationMm: weapon.directFireRoute
            ? ballistics.penetrationAtRangeMm
            : null,
          penetrationKind: weaponPenetrationKindForDamageTypePath(ballistics.damageTypePath),
          damage: selectorDamageMetric(weapon.directFireRoute, ballistics),
          damageLabel: weapon.directFireRoute
            ? undefined
            : "各伤害类别事件的基础值合计",
          damageTypeKinds: selectorDamageTypeIconKinds(ballistics),
        },
      };
    });
    if (attackSource.sourceKind === "wiki-infantry") {
      return selectOptions
        .map((option, originalIndex) => ({ option, originalIndex }))
        .sort((left, right) => {
          const categoryOrderDifference =
            (INFANTRY_WEAPON_CATEGORY_ORDER_BY_LABEL.get(left.option.group ?? "") ??
              Number.MAX_SAFE_INTEGER) -
            (INFANTRY_WEAPON_CATEGORY_ORDER_BY_LABEL.get(right.option.group ?? "") ??
              Number.MAX_SAFE_INTEGER);
          if (categoryOrderDifference !== 0) return categoryOrderDifference;
          const leftPenetration =
            left.option.metrics?.penetrationMm ?? Number.NEGATIVE_INFINITY;
          const rightPenetration =
            right.option.metrics?.penetrationMm ?? Number.NEGATIVE_INFINITY;
          if (leftPenetration !== rightPenetration) {
            return rightPenetration - leftPenetration;
          }
          return left.originalIndex - right.originalIndex;
        })
        .map(({ option }) => option);
    }
    return selectOptions;
  }, [attackSource, targetDistanceM]);
  const allWeaponSearchOptions = useMemo<SearchableSelectOption[]>(() =>
    runtimeAttackSources.flatMap((source) =>
      source.weapons.map((weapon, optionIndex) => {
        const ballistics = resolveEditorNativeBallistics(
          weapon.ballisticsModel,
          weapon.ballisticsWeaponIndex,
          targetDistanceM,
        );
        const infantryCategory = weapon.infantryCategory
          ? INFANTRY_WEAPON_CATEGORY_BY_ID.get(weapon.infantryCategory)
          : null;
        const explosiveGroup = weapon.explosiveCategoryLabel ?? null;
        return {
          value: weaponSelectionValue(source.cardId, optionIndex),
          label: `${weapon.displayNameZh} · ${source.displayName}`,
          group: explosiveGroup ?? infantryCategory?.label ?? source.groupName,
          groupDescription: explosiveGroup
            ? weapon.explosiveLayerOrderClosed
              ? "官方 Editor 爆炸配方；多层顺序已有动态证据"
              : "官方 Editor 爆炸配方；多层顺序仍按资产声明展示"
            : infantryCategory?.description,
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
          ].join(" "),
          searchRank: (query: string) => rankVerifiedVehicleCandidateSearch({
            primary: [weapon.displayNameZh, weapon.displayNameEnglish],
            aliases: [
              weapon.gunName,
              weapon.projectileName ?? "",
              weapon.runtimeAssetPath ?? "",
              weapon.sourceCardId,
              weapon.sourceRawName,
              ...(weapon.searchAliases ?? []),
            ],
            context: [source.displayName, source.groupName, source.groupId, ...source.types],
          }, query),
          metrics: {
            penetrationMm: weapon.directFireRoute
              ? ballistics.penetrationAtRangeMm
              : null,
            penetrationKind: weaponPenetrationKindForDamageTypePath(ballistics.damageTypePath),
            damage: selectorDamageMetric(weapon.directFireRoute, ballistics),
            damageLabel: weapon.directFireRoute
              ? undefined
              : "各伤害类别事件的基础值合计",
            damageTypeKinds: selectorDamageTypeIconKinds(ballistics),
          },
        };
      }),
    ), [targetDistanceM]);
  const attackSourceOptions = useMemo<SearchableSelectOption[]>(() =>
    [
      ...runtimeAttackSources.filter((source) => source.sourceKind === "wiki-infantry"),
      ...runtimeAttackSources.filter((source) => source.sourceKind === "explosive-catalog"),
      ...runtimeAttackSources.filter((source) => source.sourceKind === "vehicle"),
    ].map((source) => ({
      value: source.cardId,
      label: source.displayName,
      group: source.groupName,
      searchText: `${source.cardIds.join(" ")} ${source.types.join(" ")} ${source.variantRawNames.join(" ")}`,
      searchRank: (query) => rankVerifiedVehicleCandidateSearch({
        primary: [source.displayName],
        aliases: [
          ...source.cardIds,
          ...source.variantRawNames,
          ...source.weapons.flatMap((weapon) => [
            weapon.displayNameZh,
            weapon.displayNameEnglish,
            weapon.gunName,
            weapon.projectileName ?? "",
            ...(weapon.searchAliases ?? []),
          ]),
        ],
        context: [source.groupName, source.groupId, ...source.types],
      }, query),
    })), []);
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
      delete host.dataset.hitExplosionOuterRadiiM;
      delete host.dataset.hitExplosionDamageTypeKinds;
      delete host.dataset.hitExplosionColors;
      delete host.dataset.shotExplosionIndicator;
      delete host.dataset.shotExplosionIconSource;
      delete host.dataset.shotExplosionVisualClip;
      delete host.dataset.shotExplosionRadiusBasis;
      delete host.dataset.shotExplosionNativeField;
      return;
    }
    host.dataset.hitResolution = result.resolution;
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
      result.radial.layers.length > 0
        ? "surface-normal-pressure-hemisphere"
        : "none";
    host.dataset.shotExplosionIconSource =
      result.radial.layers.length > 0
        ? "damage-type-legend-svg-paths"
        : "none";
    host.dataset.shotExplosionVisualClip =
      result.radial.layers.length > 0
        ? "surface-normal-outward"
        : "none";
    host.dataset.shotExplosionRadiusBasis =
      result.radial.layers.length > 0
        ? "outer-radius-exact"
        : "none";
    host.dataset.shotExplosionNativeField =
      result.radial.layers.length > 0
        ? "radial-sphere-with-visibility"
        : "none";
  }, []);

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
  }, []);

  const applyShotResultToVisual = useCallback((
    record: RuntimeShotRecord,
    result: EditorNativeShotResult,
  ) => {
    const shotVisual = record.visual;
    if (!shotVisual.rayOrigin || !shotVisual.rayDirection || result.layers.length === 0) {
      shotVisual.group.visible = false;
      shotVisual.animationLayout = null;
      shotVisual.explosionLayers.forEach(clearShotExplosionLayerVisual);
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
      const radialLayer = result.radial.layers[layerIndex];
      if (!radialLayer) {
        clearShotExplosionLayerVisual(visual);
        return;
      }
      const ballisticsLayer = result.ballistics.explosiveLayers.find(
        (layer) => layer.layerId === radialLayer.layerId,
      );
      if (!ballisticsLayer) {
        clearShotExplosionLayerVisual(visual);
        return;
      }
      const origin = impactPoint.clone().addScaledVector(
        impactNormal,
        radialLayer.explosionOriginOffsetCm / 100,
      );
      const damageTypeIconKind =
        vehicleDamageTypeIconKindForPath(radialLayer.damageTypePath)
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
        layerId: radialLayer.layerId,
        damageTypePath: radialLayer.damageTypePath,
      });
    });
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
  } satisfies SavedRuntimeShot)), []);

  const commitSelectedShot = useCallback((record: RuntimeShotRecord) => {
    activeShotIdRef.current = record.shotId;
    setActiveShotId(record.shotId);
    setShotResult(record.result);
    setDamageAnimationRevision((revision) => revision + 1);
    selectShotVisual(record.shotId);
    const firstLayer = record.result.layers[0];
    if (hitModelRef.current) {
      setHitSceneThreeModelHoveredProfile(
        hitModelRef.current,
        firstLayer?.surfaceProfileIndex ?? null,
      );
    }
    updateHostShotState(record.result);
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
  }, []);

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
      record.visual.explosionLayers.forEach((layer) => {
        setShotExplosionLayerAnimationFrame(
          layer,
          explosionElapsedMs,
          record.visual.selected,
        );
      });
      renderRef.current?.();
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
      if (host) host.dataset.shotAnimationState = "settled";
      renderRef.current?.();
    };
    shotAnimationFrameRef.current = requestAnimationFrame(animateShot);
  }, [cancelShotAnimation]);

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
    const requested = runtimeAttackSourceForId(navigationState?.attacker ?? "");
    if (requested) setAttackSourceCardId(requested.cardId);
  }, [navigationState?.attacker]);

  useEffect(() => {
    if (navigationState?.attacker) return;
    const preferred = runtimeAttackSourceForId(preview.cardId) ?? runtimeAttackSources[0];
    if (preferred) setAttackSourceCardId(preferred.cardId);
  }, [navigationState?.attacker, preview.cardId]);

  useEffect(() => {
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
          !runtimeAttackWeaponSupportsHitAnalysis(indexedWeapon)
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
      const preferredMaxDistance = maxEditorNativeWeaponDistanceM(
        preferredModel,
        preferredWeapon.ballisticsWeaponIndex,
      );
      const requestedDistance = pendingByIndex >= 0
        ? targetDistanceRef.current
        : requestedNavigation?.distance ?? DEFAULT_TARGET_DISTANCE_M;
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
        host.dataset.attackSourceRecordSha256 = preferredWeapon.sourceRecordSha256;
        host.dataset.attackSourceVehicleId = preferredWeapon.sourceVehicleId;
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
  }, [attackSource, clearShotVisual]);

  const simulateCurrentShot = useCallback((nextWeaponIndex: number, nextDistanceM: number) => {
    const parsed = parsedHitRef.current;
    const weaponModel = attackModelRef.current;
    const activeRecord = shotRecordsRef.current.find(
      (record) => record.shotId === activeShotIdRef.current,
    );
    if (!parsed || !weaponModel || !activeRecord || nextWeaponIndex < 0) return;
    cancelShotAnimation(true);
    const result = simulateEditorNativeShot({
      model: parsed.header,
      weaponModel,
      weaponIndex: nextWeaponIndex,
      targetDistanceM: nextDistanceM,
      shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
      intersections: activeRecord.intersections,
      includeRadial: true,
    });
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
    savedShotSnapshot,
  ]);

  const selectSavedShot = useCallback((shotId: number) => {
    const record = shotRecordsRef.current.find((candidate) => candidate.shotId === shotId);
    if (!record) return;
    cancelShotAnimation(true);
    targetDistanceRef.current = record.distanceM;
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
  }: {
    intersections: EditorNativeIntersection[];
    rayOrigin: THREE.Vector3;
    rayDirection: THREE.Vector3;
    distanceM: number;
    animate?: boolean;
  }) => {
    const parsed = parsedHitRef.current;
    const weaponModel = attackModelRef.current;
    const selectedWeaponIndex = weaponIndexRef.current;
    if (!parsed || !weaponModel || selectedWeaponIndex < 0 || intersections.length === 0) return null;
    cancelShotAnimation(true);
    const records = shotRecordsRef.current;
    const reusableRecord = records.length >= MAX_SHOT_TRACES ? records.shift() ?? null : null;
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
    visual.firstHitDistanceM = intersections[0].distanceFromRayOriginM;
    const result = simulateEditorNativeShot({
      model: parsed.header,
      weaponModel,
      weaponIndex: selectedWeaponIndex,
      targetDistanceM: distanceM,
      shotDamageMultiplier: STANDARD_SHOT_DAMAGE_MULTIPLIER,
      intersections,
      includeRadial: true,
    });
    const entryPoint = intersections[0].point;
    const record: RuntimeShotRecord = {
      shotId: ++shotSequenceRef.current,
      distanceM,
      result,
      entryPoint: [entryPoint[0], entryPoint[1], entryPoint[2]],
      direction: [visual.rayDirection.x, visual.rayDirection.y, visual.rayDirection.z],
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
    savedShotSnapshot,
    startShotAnimation,
  ]);

  useEffect(() => {
    navigationStateRef.current = navigationState;
    onNavigationStateChangeRef.current = onNavigationStateChange;
    if (navigationState) {
      setProtectionEnabled(navigationState.protection);
    }
    applyCameraNavigationRef.current?.(navigationState);
  }, [navigationState, onNavigationStateChange]);

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
    const requestedMaxDistance = maxEditorNativeWeaponDistanceM(
      requestedModel,
      requestedWeapon.ballisticsWeaponIndex,
    );
    const requestedDistance = requestedMaxDistance > 0
      ? Math.min(requestedMaxDistance, Math.max(0, requestedNavigation.distance))
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
      distance: targetDistanceM,
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
    host.dataset.attackSourceRecordSha256 = selectedAttackWeapon.sourceRecordSha256;
    host.dataset.attackSourceVehicleId = selectedAttackWeapon.sourceVehicleId;
    host.dataset.attackSourceWeaponIndex = String(
      selectedAttackWeapon.ballisticsWeaponIndex,
    );
    host.dataset.attackSourceBallisticsId = selectedAttackWeapon.ballisticsId;
    host.dataset.attackSourceBallisticsKind =
      selectedAttackWeapon.ballisticsSource.kind;
    if (selectedAttackWeapon.sourceKind === "explosive-catalog") {
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
    setArmorThicknessRange(null);
    host.dataset.armorThicknessScale = "absolute";

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
    let hitLoadSucceeded = false;
    let hitSettled = !hit;
    let exteriorLoaded = 0;
    let exteriorReady = false;
    let exteriorPromise: Promise<void> | null = null;
    let gridHelper: THREE.GridHelper | null = null;
    let groundScale: THREE.Group | null = null;
    let referenceSoldier: THREE.Group | null = null;
    let referenceSoldierSettled = false;
    let pendingReferenceFit: {
      targetGroup: THREE.Object3D;
      source: "hit" | "analysis" | "exterior";
    } | null = null;
    let fittedSource: "hit" | "analysis" | "exterior" | null = null;
    let fittedTargetGroup: THREE.Object3D | null = null;
    let pointerStart: { x: number; y: number } | null = null;
    let hoverFrame = 0;
    let pendingHover: { clientX: number; clientY: number } | null = null;
    let protectionFrame = 0;
    let protectionTimer = 0;
    let protectionToken = 0;
    let protectionCache: ProtectionMapComputationCache | null = null;
    const exteriorOccurrences = new Map<string, RuntimeExteriorOccurrence>();
    const analysisOccurrences = new Map<
      string,
      RuntimeExteriorOccurrence[]
    >();
    let lastAppliedHitModel: HitSceneThreeModel | null = null;
    let lastAppliedHitPoseKey: string | null = null;
    exteriorOccurrencesRef.current = exteriorOccurrences;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    const rendererLease = acquireRuntimeRenderer();
    const renderer = rendererLease.renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
    const skeletalPoseBindings = new Set<RuntimeSkeletalPoseBinding>();
    const updateSkeletalPoseDataset = (enabled: boolean) => {
      const selectedBoneNames = new Set<string>();
      const changedBoneNames = new Set<string>();
      const nativePlanarBoneNames = new Set<string>();
      const nativePlanarIdentities = new Set<string>();
      const nativePlanarOccurrenceIds = new Set<string>();
      let maxAbsContactResidualCm = 0;
      let declaredReferenceEquivalentMismatch = false;
      for (const {
        controller,
        generatedClass,
        stableOccurrenceId,
        nativePlanarRecord,
      } of skeletalPoseBindings) {
        controller.selectedBoneNames.forEach((name) =>
          selectedBoneNames.add(name),
        );
        controller.changedBoneNames.forEach((name) =>
          changedBoneNames.add(name),
        );
        declaredReferenceEquivalentMismatch ||=
          controller.declaredReferenceEquivalentMismatch;
        if (nativePlanarRecord) {
          nativePlanarIdentities.add(
            `${generatedClass ?? "unknown"}\u0000${stableOccurrenceId}`,
          );
          nativePlanarOccurrenceIds.add(stableOccurrenceId);
          maxAbsContactResidualCm = Math.max(
            maxAbsContactResidualCm,
            nativePlanarRecord.maxAbsContactResidualCm,
          );
          nativePlanarRecord.wheels.forEach((wheel) => {
            const [x, y, z] = wheel.localTranslationOffsetGltfM;
            if (x !== 0 || y !== 0 || z !== 0) {
              nativePlanarBoneNames.add(wheel.boneName);
            }
          });
        }
      }
      const nativePlanarActive =
        enabled && nativePlanarIdentities.size > 0;
      host.dataset.skeletalPoseState = enabled
        ? nativePlanarActive
          ? "native-planar"
          : skeletalPoseBindings.size > 0
            ? "observed-fallback"
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
        ? nativePlanarActive
          ? "native-planar"
          : vehiclePlanarSuspensionCoverage?.status === "not-applicable"
            ? "not-applicable"
            : skeletalPoseBindings.size > 0
              ? "observed-fallback"
              : "unavailable"
        : "reference";
      host.dataset.suspensionPoseAuthority = nativePlanarActive
        ? "odk-native-planar-sweep-reconstruction"
        : enabled &&
            vehiclePlanarSuspensionCoverage?.status === "not-applicable"
          ? "explicit-not-applicable"
          : enabled && skeletalPoseBindings.size > 0
            ? "live-pie-observed-fallback"
            : enabled
              ? "unavailable"
              : "inverse-bind-reference";
      host.dataset.suspensionPoseRecordCount = String(
        nativePlanarIdentities.size,
      );
      host.dataset.suspensionPoseAppliedWheelOffsetCount = String(
        nativePlanarActive ? nativePlanarBoneNames.size : 0,
      );
      host.dataset.suspensionPoseMaxAbsContactResidualCm = String(
        nativePlanarActive ? maxAbsContactResidualCm : 0,
      );
      host.dataset.suspensionPoseGeneratedClass =
        preview.generatedClass ?? "unavailable";
      host.dataset.suspensionPoseCoverageReason =
        vehiclePlanarSuspensionCoverage?.reason ?? "resolved";
      host.dataset.suspensionPoseStableOccurrenceIds = [
        ...nativePlanarOccurrenceIds,
      ]
        .sort()
        .join(",");
    };
    const applySkeletalPose = (enabled: boolean) => {
      for (const {
        controller,
        nativePlanarRecord,
        skinnedMeshes,
      } of skeletalPoseBindings) {
        if (!enabled) {
          controller.apply("reference");
        } else if (nativePlanarRecord) {
          controller.apply(
            "native-planar",
            runtimePlanarSuspensionOffsetsByBoneName(nativePlanarRecord),
          );
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
      const nativePlanarRecord =
        runtimePlanarSuspensionPoseForVisualOccurrence(
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
        } else if (nativePlanarRecord) {
          controller.apply(
            "native-planar",
            runtimePlanarSuspensionOffsetsByBoneName(nativePlanarRecord),
          );
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
          nativePlanarRecord,
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
        ? "runtime-probe-map"
        : "unavailable";
      if (chassisPose) {
        host.dataset.chassisPoseGeneratedClass = chassisPose.generatedClass;
        host.dataset.chassisPoseCaptureSha256 = chassisPose.captureSha256;
        host.dataset.chassisPosePitchDegrees = String(chassisPose.pitchDeg);
        host.dataset.chassisPoseRollDegrees = String(chassisPose.rollDeg);
        host.dataset.chassisPoseActorOriginHeightCm = String(
          chassisPose.heightAbovePlaneCm,
        );
        host.dataset.chassisPoseWheelCompression =
          chassisPose.wheelCompressionState;
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
    modelGroup.add(chassisPoseGroup);
    chassisPoseGroup.add(visualGroup, analysisVisualGroup);
    visualGroupRef.current = visualGroup;
    analysisVisualGroupRef.current = analysisVisualGroup;
    scene.add(modelGroup);
    host.dataset.visualTexturePolicy = "exterior-tab-only";
    host.dataset.analysisVisualAssetState = "deferred";
    host.dataset.exteriorAssetState = "deferred";

    scene.add(new THREE.HemisphereLight(0xf3f3f0, 0x242424, 2.15));
    const keyLight = new THREE.DirectionalLight(0xfff4d2, 3.2);
    keyLight.position.set(6, 9, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9aa4b3, 1.2);
    fillLight.position.set(-7, 4, -5);
    scene.add(fillLight);

    const shotVisuals = Array.from(
      { length: MAX_SHOT_TRACES },
      (_, traceIndex) => createShotVisual(traceIndex),
    );
    shotVisualsRef.current = shotVisuals;
    shotVisuals.forEach((shotVisual) => scene.add(shotVisual.group));

    const render = () => {
      scene.updateMatrixWorld(true);
      shotVisuals.forEach((shotVisual) => {
        shotVisual.explosionLayers.forEach((visual) => {
          updateShotExplosionDamageTypeIconPosition(visual, camera);
        });
      });
      renderer.render(scene, camera);
    };
    renderRef.current = render;
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
          nativePlanarRecord,
          model,
          placementMatrix,
        } of skeletalPoseBindings) {
          if (!nativePlanarRecord) continue;
          const placementInverse = placementMatrix.clone().invert();
          for (const wheel of nativePlanarRecord.wheels) {
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
        const result = setHitSceneThreeModelComponentPoses(
          hitModel,
          parsedHit,
          {
            componentPoses: [...componentTransforms].map(
              ([componentIndex, visualMatrix]) => ({
                componentIndex,
                matrix: visualToHit
                  .clone()
                  .multiply(visualMatrix)
                  .multiply(hitToVisual)
                  .elements,
              }),
            ),
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
              ? "native-planar"
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
      if (hitPoseChanged && protectionEnabledRef.current) {
        scheduleProtectionMapRef.current?.({ invalidate: true });
      }
      render();
    };
    applyTurretPoseRef.current = applyTurretPose;
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
      render();
      setRealtimePointer(null);
      protectionCache = null;
      if (protectionEnabledRef.current) scheduleProtectionMap({ invalidate: true });
    };
    const onControlsStart = () => {
      cameraFitUserLocked = true;
      initialFitStabilizationPending = false;
      window.clearTimeout(initialFitStabilizationTimer);
      initialFitStabilizationTimer = 0;
    };
    const onControlsEnd = () => publishCameraNavigation();
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
      camera.updateProjectionMatrix();
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
      if (!referenceSoldierSettled) {
        if (
          pendingReferenceFit === null
          || source === "hit"
          || pendingReferenceFit.source !== "hit"
        ) {
          pendingReferenceFit = { targetGroup, source };
        }
        return;
      }
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
      gridHelper = new THREE.GridHelper(radius * 4, 28, 0x555555, 0x292929);
      gridHelper.position.y = groundY;
      host.dataset.referencePlaneY = String(groundY);
      host.dataset.referencePlaneAuthority = runtimePoseGroundActive
        ? "runtime-probe-map"
        : "geometry-bounds";
      scene.add(gridHelper);
      const groundScaleLengthM = runtimeGroundScaleLengthM(modelLengthM);
      const groundScaleWidthM = runtimeGroundScaleLengthM(modelWidthM);
      groundScale = createRuntimeGroundScale(
        groundScaleLengthM,
        groundScaleWidthM,
      );
      const groundScaleOriginX = referenceSoldierBounds
        ? (referenceSoldierBounds.min.x + referenceSoldierBounds.max.x) / 2
          - center.x
        : bounds.min.x - groundReferenceClearanceM - center.x;
      const groundScaleOriginZ = referenceSoldierBounds
        ? (referenceSoldierBounds.min.z + referenceSoldierBounds.max.z) / 2
          - center.z
        : bounds.min.z - groundReferenceClearanceM - center.z;
      groundScale.position.set(
        groundScaleOriginX,
        groundY + 0.006,
        groundScaleOriginZ,
      );
      host.dataset.groundScaleLengthM = String(groundScaleLengthM);
      host.dataset.groundScaleWidthM = String(groundScaleWidthM);
      host.dataset.vehicleLengthM = String(modelLengthM);
      host.dataset.vehicleWidthM = String(modelWidthM);
      host.dataset.groundScaleSegments = String(
        RUNTIME_GROUND_SCALE_SEGMENTS,
      );
      host.dataset.groundScaleAxes = "length,width";
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
      resetViewRef.current = resetView;
      fittedSource = source;
      fittedTargetGroup = targetGroup;
      if (preserveCamera) {
        protectionCache = null;
        controls.target.set(0, 0, 0);
        updateCameraRangeAndFitEvidence();
        controls.update();
        clearShotVisual();
        render();
        if (protectionEnabledRef.current) {
          scheduleProtectionMap({ invalidate: true });
        }
      } else {
        resetView();
        initialFitAspect = camera.aspect;
        initialFitStabilizationPending = true;
        scheduleInitialFitStabilization();
        lastAppliedCameraNavigationKey = null;
        applyCameraNavigation(navigationStateRef.current, false);
      }
    };

    const referenceSoldierLoader = new GLTFLoader();
    referenceSoldierLoader.setMeshoptDecoder(MeshoptDecoder);
    const referenceSoldierUrl = referenceSoldierModelUrl();
    host.dataset.referenceSoldierModelUrl = referenceSoldierUrl;
    void referenceSoldierLoader
      .loadAsync(referenceSoldierUrl)
      .then(({ scene: soldierScene }) => {
        if (cancelled) {
          disposeScene(soldierScene);
          return;
        }
        const glassRebind = rebindReferenceSoldierGlassToHead(soldierScene);
        applyReferenceSoldierStandingRiflePose(soldierScene);
        soldierScene.name = "standing-rifle-reference-soldier";
        referenceSoldier = soldierScene;
        modelGroup.add(soldierScene);
        referenceSoldierSettled = true;
        host.dataset.referenceSoldierState = "ready";
        host.dataset.referenceSoldierPose = "standing-rifle";
        host.dataset.referenceSoldierGlassMeshes = String(
          glassRebind.reboundMeshCount,
        );
        host.dataset.referenceSoldierGlassVertices = String(
          glassRebind.reboundVertexCount,
        );
        const pending = pendingReferenceFit;
        pendingReferenceFit = null;
        if (pending) fitViewToGroup(pending.targetGroup, pending.source);
        render();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        referenceSoldierSettled = true;
        host.dataset.referenceSoldierState = "error";
        host.dataset.referenceSoldierError =
          error instanceof Error ? error.message : String(error);
        const pending = pendingReferenceFit;
        pendingReferenceFit = null;
        if (pending) fitViewToGroup(pending.targetGroup, pending.source);
      });

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
      if (fittedTargetGroup && fittedSource) {
        fitViewToGroup(fittedTargetGroup, fittedSource, {
          force: true,
          preserveCamera: true,
        });
      } else {
        modelGroup.updateMatrixWorld(true);
        render();
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
    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        setRealtimePointer(null);
        return;
      }
      pendingHover = { clientX: event.clientX, clientY: event.clientY };
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
        });
        const firstLayer = result.layers[0];
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
                ? (firstLayer?.incidenceFactor ?? 1) < 0.28
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
      pendingHover = null;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      setRealtimePointer(null);
    };
    const onPointerUp = (event: PointerEvent) => {
      const parsed = parsedHitRef.current;
      const analysisMesh = analysisMeshRef.current;
      if (!pointerStart || !parsed || !analysisMesh) {
        pointerStart = null;
        return;
      }
      const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (movement > SHOT_GESTURE_THRESHOLD_PX) return;
      const { pointer: shotPointer } = normalizedPointerForEvent(event);
      const intersections = collectIntersections(shotPointer);
      if (intersections.length === 0) {
        return;
      }
      saveRayShot({
        intersections,
        rayOrigin: raycaster.ray.origin,
        rayDirection: raycaster.ray.direction,
        distanceM: targetDistanceRef.current,
      });
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const urls = [...new Set(renderPlacements.map(({ assetUrl }) => assetUrl))];
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
    setHitHeader(null);

    const analysisLoadingManager = new THREE.LoadingManager();
    analysisLoadingManager.setURLModifier(runtimeAnalysisVisualUrl);
    const analysisLoader = new GLTFLoader(analysisLoadingManager);
    analysisLoader.setMeshoptDecoder(MeshoptDecoder);
    const loadAnalysisVisualAssets = async () => {
      host.dataset.analysisVisualAssetState = "loading";
      const sources = new Map<string, THREE.Object3D>();
      await Promise.all(urls.map(async (url) => {
        const gltf = await analysisLoader.loadAsync(url);
        sources.set(url, gltf.scene);
        sourceGeometryScores.set(url, analysisVisualGeometryScore(gltf.scene));
        analysisLoaded += 1;
        if (!cancelled && modeRef.current !== "exterior") {
          setViewerState({
            kind: hitLoadSucceeded ? "ready" : "loading",
            loaded: analysisLoaded,
            total: urls.length,
          });
        }
      }));
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
      const exteriorLoader = new GLTFLoader();
      exteriorLoader.setMeshoptDecoder(MeshoptDecoder);
      const exteriorPlacementsByUrl = new Map(
        urls.map((url) => [
          url,
          renderPlacements.filter((placement) => placement.assetUrl === url),
        ]),
      );
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
                    8,
                    renderer.capabilities.getMaxAnisotropy(),
                  );
                  texture.needsUpdate = true;
                });
            });
          });
          occurrence.add(model);
          visualGroup.add(occurrence);
        }
        applyTurretPose();
      };
      exteriorPromise = Promise.all(urls.map(async (url) => {
        const gltf = await exteriorLoader.loadAsync(url);
        if (cancelled) {
          disposeScene(gltf.scene);
          return;
        }
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
      }))
        .then(() => {
          if (cancelled) return;
          exteriorReady = true;
          host.dataset.exteriorAssetState = "ready";
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

    const hitPromise = hit
      ? loadRuntimeHitScene({ ...hit, accessStatus: hit.status })
          .then((parsed) => {
            if (cancelled) {
              parsed.analysisGeometry.dispose();
              return null;
            }
            parsedHitRef.current = parsed;
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
            host.dataset.hitRecordSha256 = hit.recordSha256;
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
      if (nextMode === "exterior") {
        loadExteriorAssets();
        return;
      }
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
    activateAssetModeRef.current(modeRef.current);

    const analysisVisualPromise = hitPromise.then(async (parsed) => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (cancelled) return parsed;
      await loadAnalysisVisualAssets();
      return parsed;
    });

    analysisVisualPromise
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
        if (
          !hitLoadSucceeded &&
          fittedSource === null &&
          modeRef.current !== "exterior"
        ) {
          fitViewToGroup(analysisVisualDepthGroup, "analysis");
        }
        const pendingSharedShots = pendingSharedShotsRef.current;
        if (
          pendingSharedShots.paths.length > 0 &&
          parsedHitRef.current &&
          analysisMeshRef.current &&
          weaponIndexRef.current >= 0
        ) {
          const restoredRecords: RuntimeShotRecord[] = [];
          pendingSharedShots.paths.slice(-MAX_SHOT_TRACES).forEach((sharedShot) => {
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
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.dataset.analysisVisualAssetState = "error";
        analysisVisualErrorMessage = error instanceof Error ? error.message : String(error);
        if (hitLoadSucceeded || modeRef.current === "exterior") return;
        setViewerState({ kind: "error", message: analysisVisualErrorMessage });
      });

    return () => {
      cancelled = true;
      cancelProtectionMap(true);
      cancelAnimationFrame(hoverFrame);
      if (shotAnimationFrameRef.current !== 0) {
        cancelAnimationFrame(shotAnimationFrameRef.current);
        shotAnimationFrameRef.current = 0;
      }
      animatedShotIdRef.current = null;
      window.clearTimeout(initialFitStabilizationTimer);
      resetViewRef.current = null;
      activateAssetModeRef.current = null;
      visualGroupRef.current = null;
      analysisVisualGroupRef.current = null;
      hitGroupRef.current = null;
      applyCameraNavigationRef.current = null;
      analysisMeshRef.current = null;
      parsedHitRef.current = null;
      hitModelRef.current = null;
      shotVisualsRef.current = [];
      shotRecordsRef.current = [];
      activeShotIdRef.current = null;
      renderRef.current = null;
      if (applyTurretPoseRef.current === applyTurretPose) {
        applyTurretPoseRef.current = null;
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
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.removeEventListener("start", onControlsStart);
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener("end", onControlsEnd);
      controls.dispose();
      disposeScene(scene);
      rendererLease.release();
    };
  }, [
    chassisPose,
    clearShotVisual,
    hit,
    preview.cardId,
    preview.generatedClass,
    preview.variantRawName,
    preview.visualVehicleId,
    saveRayShot,
    selectSavedShot,
    vehiclePlanarSuspensionCoverage?.reason,
    vehiclePlanarSuspensionCoverage?.status,
    vehicleMeshSkeletalPoseEvidence,
    visual,
  ]);

  if (!visual) return null;

  const ballistics = shotResult?.ballistics ?? null;
  const ballisticsPenetrationKind = weaponPenetrationKindForDamageTypePath(
    ballistics?.damageTypePath ?? null,
  );
  const ballisticsPenetrationLabel = ballisticsPenetrationKind === "shaped-charge"
    ? "破甲深度"
    : "穿深";
  const distanceLabel = maxDistanceM === 0 ? "无距离衰减" : `${targetDistanceM.toFixed(0)} m`;
  const exteriorStreaming = mode === "exterior" && viewerState.kind === "loading";
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
  const showPenetrationDamageLane = shotResult
    ? shouldShowPenetrationDamageLane(
        shotResult,
        selectedAttackWeapon?.directFireRoute ?? false,
      )
    : false;
  const showExplosionDamageLane = shotResult
    ? shouldShowExplosionDamageLane(shotResult)
    : false;
  const stoppedPenetrationLayer =
    shotResult?.stoppedAtLayer === null || shotResult?.stoppedAtLayer === undefined
      ? null
      : shotResult.layers[shotResult.stoppedAtLayer] ?? null;
  const stoppedPenetrationComponent = stoppedPenetrationLayer && hitHeader
    ? hitHeader.components[stoppedPenetrationLayer.componentIndex] ?? null
    : null;
  const damageAnimationKey = `${activeShotId}:${damageAnimationRevision}`;

  return (
    <div
      className="viewer-stage runtime-vehicle-viewer"
      data-viewer-state={viewerState.kind}
      data-viewer-package-sha256={visual.packageSha256}
      data-viewer-variant-raw-name={preview.variantRawName}
      data-hit-state={hitState.kind}
      data-hit-access={hit?.status ?? "absent"}
      data-hit-probe-verdict={verdict}
      data-static-hit-runtime={hitState.kind === "ready" ? "true" : undefined}
      data-hit-solver={hitState.kind === "ready" ? "editor-native-direct-hit" : undefined}
      data-hit-weapon-label-source={attackReady
        ? attackSource?.sourceKind === "wiki-infantry"
          ? "weapon-wiki"
          : attackSource?.sourceKind === "explosive-catalog"
            ? selectedAttackWeapon?.directFireRoute
              ? "editor-production-explosive"
              : "editor-explosive-catalog"
            : "vehicle-encyclopedia-card"
        : undefined}
      data-attack-source-card-id={attackSource?.cardId}
      data-attack-source-canonical-raw-name={attackSource?.canonicalRawName}
      data-attack-source-state={attackReady ? "ready" : attackState.kind}
      data-attack-source-catalog-completed-weapons={
        hitState.kind === "ready" ? catalogCompletedWeaponCount : undefined
      }
      data-show-chrome={showChrome}
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
          : vehicleMeshPlanarSuspensionPose
            ? "native-planar"
            : vehiclePlanarSuspensionCoverage?.status === "not-applicable"
              ? "not-applicable"
              : vehicleMeshRuntimePosePlacement
                ? "observed-fallback"
                : "unavailable"
      }
      data-suspension-pose-authority={
        !physicalPoseEnabled
          ? "inverse-bind-reference"
          : vehicleMeshPlanarSuspensionPose
            ? "odk-native-planar-sweep-reconstruction"
            : vehiclePlanarSuspensionCoverage?.status === "not-applicable"
              ? "explicit-not-applicable"
              : vehicleMeshRuntimePosePlacement
                ? "live-pie-observed-fallback"
                : "unavailable"
      }
      data-suspension-pose-coverage-reason={
        vehiclePlanarSuspensionCoverage?.reason
      }
      data-suspension-pose-nonzero-wheel-count={
        vehicleMeshPlanarNonzeroWheelCount
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
      </div>

      {viewerState.kind === "loading" && !exteriorStreaming ? (
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

      {(mode === "exterior" || mode === "armor") && activeTurretStation ? (
        <TurretPreviewControls
          stations={runtimeTurretStations}
          orientationIndicators={turretOrientationIndicators}
          activeStationId={activeTurretStation.id}
          yawDegrees={clampedTurretYaw}
          pitchDegrees={clampedTurretPitch}
          onStationChange={(stationId) => {
            setActiveTurretStationId(stationId);
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
          onInteractionEnd={() =>
            commitTurretNavigation(activeTurretStation.id)}
        />
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
              : "装甲厚度绝对连续色阶，0 至 800 毫米"}
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
        <div className="viewer-attacker-control">
          <span>攻击来源</span>
          <SearchableSelect
            ariaLabel="选择攻击来源"
            value={attackSource?.cardId ?? ""}
            options={attackSourceOptions}
            searchPlaceholder="搜索攻击来源"
            onChange={(nextCardId) => {
              if (nextCardId === attackSource?.cardId) return;
              const nextSource = runtimeAttackSourceForId(nextCardId);
              if (!nextSource) return;
              pendingAttackWeaponSelectionRef.current = null;
              setPendingAttackWeaponSelection(null);
              const current = navigationStateRef.current;
              if (current) {
                const next = {
                  ...current,
                  attacker: nextSource.shareSlug,
                  weapon: "",
                  weaponIndex: null,
                  distance: 0,
                  shots: "",
                } satisfies ViewerNavigationState;
                navigationStateRef.current = next;
                onNavigationStateChangeRef.current?.(next);
              }
              setAttackSourceCardId(nextCardId);
            }}
          />
        </div>
        <div className="viewer-weapon-control">
          <span>武器 / 弹药</span>
          <SearchableSelect
            ariaLabel="选择武器或弹药"
            value={attackSource && displayedWeaponOptionIndex >= 0
              ? weaponSelectionValue(attackSource.cardId, displayedWeaponOptionIndex)
              : ""}
            options={weaponSelectOptions}
            searchOptions={allWeaponSearchOptions}
            searchPlaceholder="搜索全部载具、步兵武器或爆炸物"
            groupJumps={
              attackSource?.sourceKind === "wiki-infantry" ||
              attackSource?.sourceKind === "explosive-catalog"
            }
            sortGroupMetrics={attackSource?.sourceKind === "wiki-infantry"}
            onChange={(nextValue) => {
              const selection = parseWeaponSelectionValue(nextValue);
              if (!selection) return;
              const nextSource = runtimeAttackSourceForId(selection.sourceCardId);
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
                    distance: targetDistanceRef.current,
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
              const nextMaxDistance = maxEditorNativeWeaponDistanceM(
                nextModel,
                nextWeapon.ballisticsWeaponIndex,
              );
              const nextDistance = nextMaxDistance > 0
                ? Math.min(targetDistanceRef.current, nextMaxDistance)
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
                  distance: nextDistance,
                } satisfies ViewerNavigationState;
                navigationStateRef.current = next;
                onNavigationStateChangeRef.current?.(next);
              }
              simulateCurrentShot(nextWeapon.ballisticsWeaponIndex, nextDistance);
            }}
          />
        </div>
        <div className="viewer-distance-control" data-disabled={maxDistanceM === 0}>
          <span><span>距离（衰减）</span><strong>{distanceLabel}</strong></span>
          <div className="viewer-distance-slider" data-has-ticks={quickDistanceTicks.length > 0}>
            <input
              type="range"
              aria-label={maxDistanceM === 0 ? "当前弹药无距离衰减" : `攻击距离 ${targetDistanceM} 米`}
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
          <div className="viewer-protection-controls" data-enabled={protectionMapAvailable}>
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
              >
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
                      "RuntimeProbeMap 绝对水平地面上的稳定刚体姿态。",
                      `俯仰 ${chassisPose.pitchDeg >= 0 ? "+" : ""}${chassisPose.pitchDeg.toFixed(2)}°，`,
                      `横滚 ${chassisPose.rollDeg >= 0 ? "+" : ""}${chassisPose.rollDeg.toFixed(2)}°，`,
                      `Actor 原点相对地面 ${chassisPose.heightAbovePlaneCm >= 0 ? "+" : ""}${chassisPose.heightAbovePlaneCm.toFixed(2)} cm。`,
                      vehicleMeshPlanarSuspensionPose
                        ? [
                            `Vehicle Mesh 使用 ODK 原生平面 sweep 关系重建 ${vehicleMeshPlanarNonzeroWheelCount} 个非零轮骨偏移，`,
                            `最大接地残差 ${vehicleMeshPlanarSuspensionPose.maxAbsContactResidualCm.toExponential(2)} cm；`,
                            "非物理辅助骨保留 live-PIE observed pose，关闭时全部恢复 inverse-bind reference。",
                          ].join(" ")
                        : vehiclePlanarSuspensionCoverage?.status ===
                            "not-applicable"
                          ? `该 exact generated class 已明确不适用可视轮骨 native-planar 变换（${vehiclePlanarSuspensionCoverage.reason}）；刚体仍使用稳定姿态。`
                          : vehicleMeshSkeletalPoseEvidence ===
                              "reference-equivalent"
                            ? "当前 exact occurrence 没有 native-planar 记录；Vehicle Mesh 的 live-PIE 轮组骨与 reference 等价，关闭时仍恢复 reference。"
                            : vehicleMeshSkeletalPoseEvidence ===
                                "observed-stable"
                              ? "当前 exact occurrence 没有 native-planar 记录，使用 normal-time observed fallback；关闭时恢复 inverse-bind reference。"
                              : vehicleMeshSkeletalPoseEvidence ===
                                  "observed-snapshot"
                                ? "当前 exact occurrence 没有 native-planar 记录，使用 observed snapshot fallback；关闭时恢复 inverse-bind reference。"
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
            <div className="viewer-clear-traces-row">
              <button
                className="viewer-clear-traces"
                type="button"
                disabled={savedShots.length === 0}
                aria-label={`清除已保留的 ${savedShots.length} 条命中射线`}
                onClick={clearShotVisual}
              >
                清除射线 <span>{savedShots.length} / {MAX_SHOT_TRACES}</span>
              </button>
            </div>
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
          {hitState.kind === "absent" ? " · 该 exact 变体尚无命中模型" : ""}
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
          <div className="viewer-shot-history" aria-label="已保存的穿透路径">
            <span>路径记录</span>
            <div role="group" aria-label="切换当前显示的命中射线">
              {savedShots.map((savedShot, index) => (
                <button
                  key={savedShot.shotId}
                  type="button"
                  data-active={savedShot.shotId === activeShotId}
                  aria-pressed={savedShot.shotId === activeShotId}
                  aria-label={`查看第 ${index + 1} 根命中射线，结算距离 ${savedShot.distanceM} 米`}
                  title={`射线 ${index + 1} · ${savedShot.distanceM} m`}
                  onClick={() => selectSavedShot(savedShot.shotId)}
                >
                  <i aria-hidden="true" />{index + 1}
                </button>
              ))}
            </div>
            <em>{savedShots.length} / {MAX_SHOT_TRACES}</em>
          </div>
          <div className="viewer-shot-heading">
            <strong>{shotResult.stoppedAtLayer === null ? "穿透路径" : "路径停止"}</strong>
            <div className="viewer-shot-metrics" aria-label="弹道摘要">
              <span
                data-penetration-kind={ballisticsPenetrationKind}
                title={ballisticsPenetrationLabel}
                aria-label={`${ballisticsPenetrationLabel} ${metricText(ballistics?.penetrationAtRangeMm ?? null)} 毫米`}
              >
                <WeaponPenetrationIcon kind={ballisticsPenetrationKind} />
                {metricText(ballistics?.penetrationAtRangeMm ?? null)} mm
              </span>
              <span title="基础伤害" aria-label={`基础伤害 ${metricText(ballistics?.impactDamageAtRange ?? null)}`}>
                <Swords size={12} aria-hidden="true" />{metricText(ballistics?.impactDamageAtRange ?? null)}
              </span>
              <span
                data-metric="post-penetration-distance"
                title="从首个有效命中点起算的最大后效距离"
                aria-label={`最大后效距离 ${metricText(ballistics?.traceDistanceAfterPenetrationM ?? null)} 米`}
              >
                <MoveRight size={13} aria-hidden="true" />
                {metricText(ballistics?.traceDistanceAfterPenetrationM ?? null)} m
              </span>
            </div>
          </div>
          <PathMetricLegend
            includeAbsorption
            penetrationKind={ballisticsPenetrationKind}
          />
          <ol className="viewer-layer-list">
            {shotResult.layers.slice(0, 8).map((layer, index) => {
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
              return (
                <li
                  key={`${layer.triangleIndex}:${index}`}
                  data-penetrated={layer.penetrated === true}
                  data-spaced-armor={isSpacedArmor}
                  data-no-penetration={isNoPenetration}
                  data-path-marker={markerKind}
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
                  <i className="viewer-layer-list__outline" aria-hidden="true" />
                  <span title={physicalMaterial ? assetLabel(physicalMaterial) : undefined}>
                    {isSpacedArmor ? "附加装甲" : isNoPenetration ? <>无敌区<br />阻穿体</> : semanticLabel(layer.semanticKind)}
                  </span>
                  <span className="viewer-layer-metrics">
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
                      <b className="viewer-layer-metric-label"><Layers3 size={14} aria-hidden="true" /></b>
                      <span className="viewer-layer-metric-value">{layer.armorThicknessMm === null ? "不可穿透" : `${layer.armorThicknessMm.toFixed(1)} mm`}</span>
                    </span>
                    <span
                      data-metric="remaining"
                      title={`剩余穿深；距首层 ${layer.distanceFromFirstHitM.toFixed(2)} m，后效距离系数 ${(layer.postPenetrationTraceFactor * 100).toFixed(1)}%`}
                      aria-label={`剩余穿深 ${layer.availablePenetrationMm.toFixed(1)} 毫米，距首层 ${layer.distanceFromFirstHitM.toFixed(2)} 米，后效距离系数 ${(layer.postPenetrationTraceFactor * 100).toFixed(1)}%`}
                    >
                      <b className="viewer-layer-metric-label"><RemainingPenetrationIcon /></b>
                      <span className="viewer-layer-metric-value">{layer.availablePenetrationMm.toFixed(1)} mm</span>
                    </span>
                    {layer.damageAbsorbedAfterHit !== null && layer.damageAbsorbedAfterHit > 0 ? (
                      <span data-metric="absorption" title="吸收伤害" aria-label={`吸收伤害 ${layer.damageAbsorbedAfterHit.toFixed(0)}`}>
                        <b className="viewer-layer-metric-label"><DamageAbsorptionIcon /></b>
                        <span className="viewer-layer-metric-value">{layer.damageAbsorbedAfterHit.toFixed(0)}</span>
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          {shotResult.layers.length > 8 ? <span className="viewer-more-layers">另有 {shotResult.layers.length - 8} 层</span> : null}
          {showPenetrationDamageLane || showExplosionDamageLane ? (
            <div
              className="viewer-damage-section"
              data-penetration-damage-lane={
                showPenetrationDamageLane ? "visible" : "hidden"
              }
              data-explosion-damage-lane={
                showExplosionDamageLane ? "visible" : "hidden"
              }
            >
              <div className="viewer-damage-lanes">
                {showPenetrationDamageLane ? (
                  <section
                    className="viewer-damage-lane viewer-damage-lane--penetration"
                    data-damage-lane="penetration"
                  >
                    <header className="viewer-damage-lane__header">
                      <span>
                        <strong>穿透伤害</strong>
                      </span>
                      <span
                        className="viewer-damage-lane__legend viewer-damage-lane__legend--penetration"
                        data-term="penetration-types"
                        aria-label="穿透方式图例"
                      >
                        <span
                          className="viewer-damage-lane__legend-item"
                          data-penetration-kind="kinetic"
                          title="动能穿甲弹"
                        >
                          <WeaponPenetrationIcon kind="kinetic" size={14} />
                          <small>动能穿甲</small>
                        </span>
                        <span
                          className="viewer-damage-lane__legend-item"
                          data-penetration-kind="shaped-charge"
                          title="破甲弹"
                        >
                          <WeaponPenetrationIcon
                            kind="shaped-charge"
                            size={14}
                          />
                          <small>破甲弹</small>
                        </span>
                      </span>
                    </header>
                    <div className="viewer-damage-lane__body">
                      <ol className="viewer-layer-list viewer-damage-list">
                        {penetrationDamageEvents.length > 0 ? (
                          <DamageEventListItems
                            events={penetrationDamageEvents}
                            animationKey={`${damageAnimationKey}:penetration`}
                            penetrationKind={ballisticsPenetrationKind}
                          />
                        ) : (
                          <li
                            data-no-damage="true"
                            data-no-pen="true"
                            data-damage-kind="point"
                          >
                            <span className="viewer-damage-target">
                              <span
                                className="viewer-damage-target__penetration-icon"
                                title={
                                  ballisticsPenetrationKind === "shaped-charge"
                                    ? "破甲弹"
                                    : "动能穿甲弹"
                                }
                                aria-label={
                                  ballisticsPenetrationKind === "shaped-charge"
                                    ? "破甲弹"
                                    : "动能穿甲弹"
                                }
                              >
                                <WeaponPenetrationIcon
                                  kind={ballisticsPenetrationKind}
                                  size={24}
                                />
                              </span>
                              {stoppedPenetrationComponent
                                ? playerHitComponentLabel(
                                    stoppedPenetrationComponent,
                                  )
                                : "命中表面"}
                              <em className="viewer-damage-outcome">
                                未击穿
                              </em>
                            </span>
                            <span
                              className="viewer-damage-equation"
                              aria-label={
                                stoppedPenetrationLayer?.stopReason
                                  ? `未击穿，${stoppedPenetrationLayer.stopReason}`
                                  : "未击穿，实际直击伤害为零"
                              }
                            >
                              <span data-term="damage" title="实际直击伤害">
                                <Swords size={12} aria-hidden="true" />0
                              </span>
                              <i aria-hidden="true">=</i>
                              <strong>0</strong>
                            </span>
                          </li>
                        )}
                      </ol>
                    </div>
                  </section>
                ) : null}

                {showExplosionDamageLane ? (
                  <section
                    className="viewer-damage-lane viewer-damage-lane--explosion"
                    data-damage-lane="explosion"
                  >
                    <header className="viewer-damage-lane__header">
                      <span>
                        <strong>爆炸伤害</strong>
                      </span>
                      <span
                        className="viewer-damage-lane__legend"
                        data-term="explosion-types"
                        aria-label="爆炸伤害图例"
                      >
                        {VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS.map((kind) => (
                          <span
                            className="viewer-damage-lane__legend-item"
                            data-damage-type-kind={kind}
                            key={kind}
                            title={vehicleDamageTypeIconLabel(kind)}
                            style={{
                              "--explosion-type-color":
                                vehicleDamageTypeIconColor(kind),
                            } as CSSProperties}
                          >
                            <VehicleDamageTypeIcon
                              kind={kind}
                              size={14}
                            />
                            <small>
                              {vehicleDamageTypeIconShortLabel(kind)}
                            </small>
                          </span>
                        ))}
                      </span>
                    </header>
                    <div className="viewer-damage-lane__body">
                      <ol className="viewer-layer-list viewer-damage-list">
                        <DamageEventListItems
                          events={explosionDamageEvents}
                          animationKey={`${damageAnimationKey}:explosion`}
                        />
                      </ol>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
