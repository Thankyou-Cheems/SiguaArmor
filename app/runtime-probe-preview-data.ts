import visualSelectionPolicyJson from "./runtime-probe-visual-selection-policy.json";
import type { SiteEdition } from "./site-edition";
import {
  loadWikiRuntimeVisual,
  loadOptionalWikiVehicleGunnerSight,
  loadWikiVehicleRuntimeSource,
  loadWikiVehicleStationGraph,
} from "../lib/wiki-source";
import type {
  RuntimePlanarSuspensionCoverageResult,
  RuntimePlanarSuspensionPoseRecord,
} from "./runtime-planar-suspension-pose";
import type { RuntimeHitBufferRef } from "../lib/runtime-hit-buffer";
import type { RuntimeCrewSeatBinding } from "../lib/vehicle-crew-seat-runtime";
import {
  compileVehicleStationGraph,
  type CompiledVehicleStationGraph,
  type VehicleStationGraphRecord,
  type VehicleStationGraphPointer,
} from "../lib/vehicle-station-graph";
import {
  compileVehicleGunnerSight,
  type CompiledVehicleGunnerSight,
  type VehicleGunnerSightRecord,
} from "../lib/vehicle-gunner-sight";

export type RuntimePreviewStatus =
  | "visual-ready"
  | "runtime-only"
  | "blocked";

type RuntimeChassisPoseMatrix = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

interface RuntimeChassisPose {
  targetKey: string;
  generatedClass: string;
  rawName: string;
  promoEntryIds: string[];
  poseState: "runtime-observed-normal-time";
  sourceBuildId: "squad-editor-v10.5.0.621766.2374-ue5.7.4";
  pitchDeg: number;
  rollDeg: number;
  heightAbovePlaneCm: number;
  gltfMatrix: RuntimeChassisPoseMatrix;
}

export interface RuntimeVisualPlacement {
  stableOccurrenceId: string;
  name: string;
  actor: string;
  assetUrl: string;
  compatibilityAssetUrl?: string;
  matrix: number[];
  sourceMeshPath: string;
  componentClassPath: string;
  materialState: "runtime-effective-bindings-baked-parameters-unresolved";
  runtimeBonePoseStatus: "observed" | "not-applicable";
  runtimeBonePoseJointCount?: number;
  runtimeBonePoseNormalTimeSampleCount?: number;
  runtimeBonePoseReferenceEquivalent?: boolean;
}

export interface RuntimeVisualAttachmentMember {
  stableOccurrenceId: string;
  actorClassName: string;
  componentName: string;
  componentClassPath: string;
  sourceMeshPath: string;
  source:
    | "v10.5.3-seat-pawn-component-descendant"
    | "exact-station-equipment";
  equipmentRefIds?: string[];
  gunNames?: string[];
  assignmentMode?: "exact-class-and-seat-anchor";
}

interface RuntimeComponentTransform {
  translationCm: { x: number; y: number; z: number };
  rotationQuaternion: { x: number; y: number; z: number; w: number };
  scale3D: { x: number; y: number; z: number };
}

interface RuntimeMotionVehicleLocalFrame {
  state: "derived" | "derived-with-fallback" | "unresolved";
  value: RuntimeComponentTransform | null;
  reason: string | null;
}

interface RuntimeMotionDriver {
  componentName: string;
  componentClassPath: string;
  vehicleLocalFrame: RuntimeMotionVehicleLocalFrame;
}

interface RuntimeStationMotion {
  state: "derived" | "unresolved";
  driverMode:
    | "split-yaw-pitch-components"
    | "combined-updated-component"
    | "paired-rotating-components";
  coordinateSystem: {
    space: "vehicle-local";
    units: "unreal-centimeters";
    axes: "x-forward-y-right-z-up";
    pose: "construction-reference-pose";
  };
  sourceFunction:
    | "USQTurretMovementComponent::SetCurrentRotation@0x18043ed50"
    | "USQRotatingMovementComponent::SetCurrentRotation@0x1803f03f0";
  yawDriver: RuntimeMotionDriver | null;
  pitchDriver: RuntimeMotionDriver | null;
  reason: string | null;
}

export interface RuntimeStationControl {
  state: "observed" | "unresolved";
  source: "paired-sq-rotating-movement-components-native-layout";
  sourceFunction:
    "USQRotatingMovementComponent::SetCurrentRotation@0x1803f03f0";
  maxYawSpeedDegreesPerSecond: number | null;
  maxPitchSpeedDegreesPerSecond: number | null;
  yaw: {
    minDegrees: number;
    maxDegrees: number;
    continuous: boolean;
  } | null;
  pitch: {
    minDegrees: number;
    maxDegrees: number;
  } | null;
  reason: string | null;
}

interface RuntimeViewVehicleLocalFrame {
  state: "derived";
  value: RuntimeComponentTransform;
  relation: {
    mode: "nested-seat-pawn-via-parent-seat-socket";
    ownerCatalogSeatIndex: 3;
    ownerRole: "commander";
    ownerSeatPawnClassPath: string;
    parentCatalogSeatIndex: 2;
    parentRole: "gunner";
    parentSeatPawnClassPath: string;
    parentComponentName: string;
    parentComponentClassPath: string;
    parentSourceMeshPath: string;
    socketName: "socket_commander";
  };
  reason: null;
}

export interface RuntimeViewRotationComponent {
  actorClassName: string;
  componentName: string;
  componentClassPath: "/Script/Engine.CameraComponent";
  source: "v10.5.3-seat-pawn-get-camera-component";
  yawDepth: number;
  pitchDepth: number;
  componentToSeatPawn: RuntimeComponentTransform;
  vehicleLocalFrame: RuntimeViewVehicleLocalFrame;
  cameraMeshState: "hidden-no-mesh";
}

export interface RuntimeVisualAttachmentStation {
  seatKey: string;
  catalogSeatIndex: number;
  turretName: string;
  state: "closed" | "partial";
  closureMode:
    | "visual-occurrence-membership"
    | "view-component-rotation";
  movementState: "observed" | "unresolved";
  motion: RuntimeStationMotion;
  control: RuntimeStationControl | null;
  evidenceLimits: string[];
  yawMembers: RuntimeVisualAttachmentMember[];
  pitchMembers: RuntimeVisualAttachmentMember[];
  yawAnchor: RuntimeVisualAttachmentMember | null;
  pitchAnchor: RuntimeVisualAttachmentMember | null;
  viewComponent: RuntimeViewRotationComponent | null;
  reasons: string[];
  parentStationId?: string | null;
  parentCatalogSeatIndex?: number | null;
  inheritedMotionChannels?: Array<"yaw" | "pitch">;
}

export interface RuntimeVisualAttachmentBinding {
  schemaVersion: "sigua-vehicle-visual-attachment/v2";
  sourceBuildId: string;
  sourceDataRevision: string;
  sourceVehicleRef: string;
  catalogBindingRef: string;
  cardId: string;
  rawName: string;
  runtimeVehicleRef: string;
  edition: SiteEdition;
  visualArtifactRef: string;
  stations: RuntimeVisualAttachmentStation[];
}

interface RuntimeVisualSelectionSummary {
  mode: string;
  label: string;
  componentName: string;
  selectedComponentName: string;
  targetActorIncludes: string[];
  selectedOccurrences: number;
  filteredOccurrences: number;
  selectedRepresentation: "turret-component";
}

type RuntimeHitGeometrySource =
  | { geometryUrl: string; geometry?: never }
  | { geometryUrl?: never; geometry: RuntimeHitBufferRef };

export interface RuntimeVehiclePreview {
  cardId: string;
  status: RuntimePreviewStatus;
  statusLabel: string;
  variantRawName: string;
  generatedClass: string | null;
  visualVehicleId: string | null;
  note: string;
  chassisPose: RuntimeChassisPose | null;
  suspension: {
    records: RuntimePlanarSuspensionPoseRecord[];
    coverage: RuntimePlanarSuspensionCoverageResult | null;
  };
  runtime: {
    actors: number | null;
    components: number | null;
    stableTargets: number | null;
    residualActors: number | null;
  };
  visual: {
    artifactRef: string;
    requiredOccurrences: number;
    sourceAssets: number;
    totalBytes: number;
    runtimeBonePoseStatus: "observed";
    runtimeBonePoseOccurrenceCount: number;
    runtimeBonePoseJointCount: number;
    runtimeBonePoseReferenceEquivalentOccurrenceCount: number;
    placements: RuntimeVisualPlacement[];
    selection: RuntimeVisualSelectionSummary | null;
  } | null;
  hit: ({
    status: "public";
    formatVersion: "hit-scene-runtime/v1";
    vehicleId: string;
    recordUrl: string;
    bvhUrl: string;
    triangles: number;
    components: number;
    surfaceProfiles: number;
    bvhNodes: number;
    reason: string;
  } & RuntimeHitGeometrySource) | null;
  hitAvailability: {
    status: "runtime-no-hit-geometry";
    reasonCode: string;
    reason: string;
  } | null;
  radialQuery: {
    id: string;
    formatVersion: "sigua-vehicle-radial-query-source/v1";
    recordUrl: string;
  } | null;
  visualAttachment: RuntimeVisualAttachmentBinding | null;
  crewSeat: RuntimeCrewSeatBinding | null;
  stationGraph: CompiledVehicleStationGraph | null;
  gunnerSight: CompiledVehicleGunnerSight | null;
}

interface WikiRuntimeVisual {
  schemaVersion: "sigua-runtime-visual/v1";
  id: string;
  edition: SiteEdition;
  runtimeVehicleRef: string;
  generatedClass: string;
  status: "complete" | "partial";
  visualAcceptanceStatus: string;
  webUsable: boolean;
  reason: string;
  totalBytes: number;
  placements: RuntimeVisualPlacement[];
}

interface WikiVehicleRuntimeVariant {
  rawName: string;
  runtimeVehicleRef: string;
  generatedClass: string;
  chassisPose: RuntimeChassisPose | null;
  suspension: {
    records: RuntimePlanarSuspensionPoseRecord[];
    coverage: RuntimePlanarSuspensionCoverageResult | null;
  };
  visualArtifacts: Partial<Record<SiteEdition, {
    id: string;
    generatedClass: string;
    placementCount: number;
  }>>;
  hit: null | ({
    id: string;
    formatVersion: "hit-scene-runtime/v1";
    recordUrl: string;
    bvhUrl: string;
  } & RuntimeHitGeometrySource);
  radialQuery: null | {
    id: string;
    formatVersion: "sigua-vehicle-radial-query-source/v1";
    recordUrl: string;
  };
  visualAttachment: null | {
    id: string;
    formatVersion: "sigua-vehicle-visual-attachment/v2";
    sourceVehicleRef: string;
    recordUrl: string;
  };
  crewSeat: null | {
    id: string;
    formatVersion: "sigua-vehicle-crew-seat/v1";
    sourceVehicleRef: string;
    recordUrl: string;
  };
  stationGraph: VehicleStationGraphPointer | null;
}

interface WikiVehicleRuntimeSource {
  schemaVersion: "sigua-vehicle-runtime-source/v1";
  source: { cardId: string };
  variants: WikiVehicleRuntimeVariant[];
}

interface RuntimeVisualSelectionRule {
  cardId: string;
  rawName: string;
  selectionMode: string;
  label: string;
  target: { componentName: string; actorIncludes: string[] };
  suppressComponentNames: string[];
  suppressActorIncludes?: string[];
}

interface RuntimeVisualComponentSuppressionRule {
  componentNames: string[];
  sourceMeshPaths?: string[];
  actorIncludes?: string[];
}

interface RuntimeVisualSynchronizedWeaponGroup {
  groupId: string;
  bindings: Array<{ cardId: string; rawName: string }>;
  sourceMeshPath: string;
  activeActor: string;
  suppressedActors: string[];
}

interface RuntimeVisualSynchronizedWeaponPolicy {
  schemaVersion: "runtime-visual-weapon-synchronization/v1";
  groups: RuntimeVisualSynchronizedWeaponGroup[];
}

const visualSelectionRules =
  visualSelectionPolicyJson.rules as RuntimeVisualSelectionRule[];
const visualComponentSuppressionRules =
  (visualSelectionPolicyJson.globalSuppressions ?? []) as RuntimeVisualComponentSuppressionRule[];
const synchronizedWeaponPolicy =
  visualSelectionPolicyJson.synchronizedWeaponPolicy as RuntimeVisualSynchronizedWeaponPolicy;

const previewCache = new Map<string, Promise<RuntimeVehiclePreview>>();

function applySynchronizedWeaponPolicy(
  cardId: string,
  rawName: string,
  placements: RuntimeVisualPlacement[],
) {
  if (
    synchronizedWeaponPolicy.schemaVersion !==
      "runtime-visual-weapon-synchronization/v1" ||
    !Array.isArray(synchronizedWeaponPolicy.groups)
  ) {
    throw new Error("Unsupported runtime visual synchronized weapon policy");
  }
  const groups = synchronizedWeaponPolicy.groups.filter((group) =>
    group.bindings.some(
      (binding) => binding.cardId === cardId && binding.rawName === rawName,
    ),
  );
  let filteredPlacements = placements;
  const selectedActors: string[] = [];
  let filteredOccurrences = 0;
  for (const group of groups) {
    const candidates = filteredPlacements.filter(
      (placement) =>
        placement.name === "WeaponMesh3P" &&
        placement.sourceMeshPath === group.sourceMeshPath &&
        (placement.actor === group.activeActor ||
          group.suppressedActors.includes(placement.actor)),
    );
    const active = candidates.filter(
      (placement) => placement.actor === group.activeActor,
    );
    const suppressedIds = new Set(
      candidates
        .filter((placement) => group.suppressedActors.includes(placement.actor))
        .map((placement) => placement.stableOccurrenceId),
    );
    if (suppressedIds.size === 0) continue;
    if (active.length !== 1) {
      throw new Error(`Visual weapon selection failed for ${cardId} / ${rawName}`);
    }
    selectedActors.push(group.activeActor);
    filteredOccurrences += suppressedIds.size;
    filteredPlacements = filteredPlacements.filter(
      (placement) => !suppressedIds.has(placement.stableOccurrenceId),
    );
  }
  return { placements: filteredPlacements, selectedActors, filteredOccurrences };
}

function applyVisualSelection(
  cardId: string,
  rawName: string,
  sourcePlacements: RuntimeVisualPlacement[],
) {
  const globallySuppressedIds = new Set(
    sourcePlacements
      .filter((placement) =>
        visualComponentSuppressionRules.some(
          (rule) =>
            rule.componentNames.includes(placement.name) &&
            (!rule.sourceMeshPaths || rule.sourceMeshPaths.includes(placement.sourceMeshPath)) &&
            (!rule.actorIncludes || rule.actorIncludes.some((needle) => placement.actor.includes(needle))),
        ),
      )
      .map((placement) => placement.stableOccurrenceId),
  );
  const globallyFiltered = sourcePlacements.filter(
    (placement) => !globallySuppressedIds.has(placement.stableOccurrenceId),
  );
  const synchronized = applySynchronizedWeaponPolicy(
    cardId,
    rawName,
    globallyFiltered,
  );
  const rule = visualSelectionRules.find(
    (candidate) => candidate.cardId === cardId && candidate.rawName === rawName,
  );
  if (!rule) {
    return {
      placements: synchronized.placements,
      selection: synchronized.filteredOccurrences > 0
        ? {
            mode: "actor-parent-transform-synchronization",
            label: "保留与挂载父级同步的武器组件",
            componentName: "WeaponMesh3P",
            selectedComponentName: "WeaponMesh3P",
            targetActorIncludes: synchronized.selectedActors,
            selectedOccurrences: synchronized.selectedActors.length,
            filteredOccurrences: synchronized.filteredOccurrences,
            selectedRepresentation: "turret-component" as const,
          }
        : null,
    };
  }

  const managedNames = new Set(rule.suppressComponentNames);
  const targets = synchronized.placements.filter(
    (placement) =>
      placement.name === rule.target.componentName &&
      rule.target.actorIncludes.some((needle) => placement.actor.includes(needle)),
  );
  const managed = synchronized.placements.filter(
    (placement) =>
      managedNames.has(placement.name) &&
      (!rule.suppressActorIncludes ||
        rule.suppressActorIncludes.some((needle) => placement.actor.includes(needle))),
  );
  if (targets.length === 0) {
    throw new Error(`Visual component selection failed for ${cardId} / ${rawName}`);
  }
  const selectedId = targets[0].stableOccurrenceId;
  const managedIds = new Set(managed.map(({ stableOccurrenceId }) => stableOccurrenceId));
  return {
    placements: synchronized.placements.filter(
      (placement) =>
        !managedIds.has(placement.stableOccurrenceId) ||
        placement.stableOccurrenceId === selectedId,
    ),
    selection: {
      mode: rule.selectionMode,
      label: rule.label,
      componentName: rule.target.componentName,
      selectedComponentName: rule.target.componentName,
      targetActorIncludes: rule.target.actorIncludes,
      selectedOccurrences: 1,
      filteredOccurrences:
        managed.filter(({ stableOccurrenceId }) => stableOccurrenceId !== selectedId).length +
        synchronized.filteredOccurrences,
      selectedRepresentation: "turret-component" as const,
    },
  };
}

function hitForRuntimeVariant(variant: WikiVehicleRuntimeVariant) {
  const artifact = variant.hit;
  if (!artifact) return null;
  const geometrySource = artifact.geometry
    ? { geometry: artifact.geometry }
    : { geometryUrl: artifact.geometryUrl };
  return {
    status: "public" as const,
    formatVersion: artifact.formatVersion,
    vehicleId: variant.runtimeVehicleRef,
    recordUrl: artifact.recordUrl,
    ...geometrySource,
    bvhUrl: artifact.bvhUrl,
    triangles: 0,
    components: 0,
    surfaceProfiles: 0,
    bvhNodes: 0,
    reason: "SiguaWiki 已发布该载具的浏览器命中模型。",
  };
}

function toRuntimePreview(
  cardId: string,
  rawName: string,
  artifactRef: string,
  runtimeVariant: WikiVehicleRuntimeVariant,
  descriptor: WikiRuntimeVisual,
  stationGraphRecord: VehicleStationGraphRecord | null,
  gunnerSightRecord: VehicleGunnerSightRecord | null,
): RuntimeVehiclePreview {
  if (
    descriptor.status !== "complete" ||
    descriptor.visualAcceptanceStatus !== "web-usable" ||
    descriptor.webUsable !== true
  ) {
    throw new Error(`SiguaWiki visual is not web-usable: ${artifactRef}`);
  }
  const { placements, selection } = applyVisualSelection(
    cardId,
    rawName,
    descriptor.placements,
  );
  const skeletalPlacements = placements.filter((placement) =>
    placement.componentClassPath.includes("SkeletalMeshComponent"),
  );
  const stationGraph = compileVehicleStationGraph(
    stationGraphRecord,
    runtimeVariant.stationGraph,
    {
      rawName,
      runtimeVehicleRef: runtimeVariant.runtimeVehicleRef,
      generatedClass: runtimeVariant.generatedClass,
      cardId,
      edition: descriptor.edition,
      visualArtifactRef: artifactRef,
    },
    placements,
  );
  if (!stationGraph) {
    throw new Error(`SiguaWiki station graph is missing for ${cardId} / ${rawName}`);
  }
  const visualAttachment =
    stationGraph.visualAttachment as RuntimeVisualAttachmentBinding;
  const crewSeat = stationGraph.crewSeat;
  const gunnerSight = compileVehicleGunnerSight(
    gunnerSightRecord,
    stationGraph,
  );
  const hit = hitForRuntimeVariant(runtimeVariant);
  return {
    cardId,
    status: "visual-ready",
    statusLabel: "SIGUAWIKI / WEB-USABLE",
    variantRawName: rawName,
    generatedClass: descriptor.generatedClass,
    visualVehicleId: descriptor.runtimeVehicleRef,
    note: `该变体直接读取 SiguaWiki 的已发布视觉记录。${descriptor.reason}`,
    chassisPose: runtimeVariant.chassisPose,
    suspension: runtimeVariant.suspension,
    runtime: {
      actors: null,
      components: null,
      stableTargets: null,
      residualActors: null,
    },
    visual: {
      artifactRef,
      requiredOccurrences: placements.length,
      sourceAssets: new Set(placements.map(({ assetUrl }) => assetUrl)).size,
      totalBytes: descriptor.totalBytes,
      runtimeBonePoseStatus: "observed",
      runtimeBonePoseOccurrenceCount: skeletalPlacements.length,
      runtimeBonePoseJointCount: skeletalPlacements.reduce(
        (sum, placement) => sum + (placement.runtimeBonePoseJointCount ?? 0),
        0,
      ),
      runtimeBonePoseReferenceEquivalentOccurrenceCount: skeletalPlacements.filter(
        ({ runtimeBonePoseReferenceEquivalent }) =>
          runtimeBonePoseReferenceEquivalent === true,
      ).length,
      placements,
      selection,
    },
    hit,
    hitAvailability: hit
      ? null
      : {
          status: "runtime-no-hit-geometry",
          reasonCode: "not-published",
          reason: "该变体尚无已发布的命中模型。",
        },
    radialQuery: runtimeVariant.radialQuery,
    visualAttachment,
    crewSeat,
    stationGraph,
    gunnerSight,
  };
}

export async function runtimePreviewForCatalogBinding(
  cardId: string,
  rawName: string,
  expectedRuntimeVehicleId: string | null,
  expectedVisualArtifactRef: string | null,
  siteEdition: SiteEdition = "international",
) {
  if (!expectedVisualArtifactRef || !expectedRuntimeVehicleId) {
    throw new Error(`Vehicle catalog has no Wiki visual for ${cardId} / ${rawName}`);
  }
  const cached = previewCache.get(expectedVisualArtifactRef);
  if (cached) return cached;
  const request = Promise.all([
    loadWikiVehicleRuntimeSource(cardId),
    loadWikiRuntimeVisual(expectedVisualArtifactRef),
  ]).then(async ([runtimeValue, value]) => {
    const runtimeSource = runtimeValue as WikiVehicleRuntimeSource;
    const runtimeVariant = runtimeSource.variants.find(
      (variant) => variant.rawName === rawName,
    );
    const artifact = runtimeVariant?.visualArtifacts[siteEdition] ?? null;
    if (
      !runtimeVariant ||
      runtimeVariant.runtimeVehicleRef !== expectedRuntimeVehicleId ||
      artifact?.id !== expectedVisualArtifactRef
    ) {
      throw new Error(`Vehicle runtime mapping is invalid for ${cardId} / ${rawName}`);
    }
    const descriptor = value as WikiRuntimeVisual;
    if (
      descriptor.edition !== siteEdition ||
      descriptor.runtimeVehicleRef !== expectedRuntimeVehicleId ||
      descriptor.generatedClass !== artifact.generatedClass ||
      descriptor.placements.length !== artifact.placementCount
    ) {
      throw new Error(`SiguaWiki visual mapping differs for ${cardId} / ${rawName}`);
    }
    const stationGraphRecord = runtimeVariant.stationGraph
      ? await loadWikiVehicleStationGraph(
          runtimeVariant.stationGraph.recordUrl,
        ) as VehicleStationGraphRecord
      : null;
    if (
      stationGraphRecord &&
      (
        runtimeVariant.stationGraph?.formatVersion !==
          stationGraphRecord.schemaVersion ||
        runtimeVariant.stationGraph?.sourceVehicleRef !==
          stationGraphRecord.sourceVehicleRef
      )
    ) {
      throw new Error(`SiguaWiki station graph mapping differs for ${cardId} / ${rawName}`);
    }
    const gunnerSightRecord = stationGraphRecord
      ? await loadOptionalWikiVehicleGunnerSight(
          stationGraphRecord.sourceVehicleRef,
        ) as VehicleGunnerSightRecord
      : null;
    return toRuntimePreview(
      cardId,
      rawName,
      expectedVisualArtifactRef,
      runtimeVariant,
      descriptor,
      stationGraphRecord,
      gunnerSightRecord,
    );
  });
  previewCache.set(expectedVisualArtifactRef, request);
  return request;
}

export async function runtimePreviewForVariant(
  cardId: string,
  rawName: string,
  siteEdition: SiteEdition = "international",
) {
  const runtimeSource = await loadWikiVehicleRuntimeSource(
    cardId,
  ) as WikiVehicleRuntimeSource;
  const runtimeVariant = runtimeSource.variants.find(
    (variant) => variant.rawName === rawName,
  );
  if (!runtimeVariant) return null;
  const visualArtifactRef = runtimeVariant.visualArtifacts[siteEdition]?.id ?? null;
  if (!visualArtifactRef) return null;
  return runtimePreviewForCatalogBinding(
    cardId,
    rawName,
    runtimeVariant.runtimeVehicleRef,
    visualArtifactRef,
    siteEdition,
  );
}

export function loadRuntimePreviewForVariant(
  cardId: string,
  rawName: string,
  siteEdition: SiteEdition = "international",
) {
  return runtimePreviewForVariant(cardId, rawName, siteEdition);
}
