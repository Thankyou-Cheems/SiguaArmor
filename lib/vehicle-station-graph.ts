import {
  projectCrewSeatBinding,
  type RuntimeCrewSeatBinding,
  type RuntimeCrewSeatStation,
} from "./vehicle-crew-seat-runtime.ts";

export interface StationGraphTransform {
  translationCm: { x: number; y: number; z: number };
  rotationQuaternion: { x: number; y: number; z: number; w: number };
  scale3D: { x: number; y: number; z: number };
}

export interface StationGraphFrame {
  state: "observed" | "derived" | "derived-with-fallback" | "unresolved";
  value: StationGraphTransform | null;
  source: string;
  reason: string | null;
  evidenceRefs: string[];
}

interface StationGraphMotionChannel {
  channel: "yaw" | "pitch";
  state: "derived" | "unresolved";
  driver: {
    componentName: string;
    componentClassPath: string;
    sourceMeshPath: string | null;
  } | null;
  stationLocalFrame: StationGraphFrame;
  referenceFrame: StationGraphFrame;
  sourceFunction: string | null;
}

export interface StationGraphStation {
  id: string;
  seatKey: string;
  catalogSeatIndex: number;
  additionalSeatConfigIndex: number | null;
  seatProfileRef: string;
  role: string;
  stationKind: string;
  seatPawnClassPath: string;
  turretName: string;
  mount: {
    id: string;
    childStationId: string;
    parent:
      | {
          kind: "vehicle-root";
          stationId: null;
          inheritedMotionChannels: [];
        }
      | {
          kind: "station";
          stationId: string;
          inheritedMotionChannels: Array<"yaw" | "pitch">;
        };
    parentComponent: {
      componentName: string;
      componentClassPath: string;
      sourceMeshPath: string | null;
    } | null;
    socketName: string | null;
    referenceFrame: StationGraphFrame;
    parentRelativeFrame: StationGraphFrame | null;
    evidence: {
      state: StationGraphFrame["state"];
      source: string;
      evidenceRefs: string[];
      reason: string | null;
    };
  };
  motion: {
    driverMode:
      | "split-yaw-pitch-components"
      | "combined-updated-component"
      | "paired-rotating-components";
    control: unknown;
    yaw: StationGraphMotionChannel;
    pitch: StationGraphMotionChannel;
  };
  views: Array<{
    viewId: string;
    component: {
      componentName: string;
      componentClassPath: string;
    };
    stationLocalFrame: StationGraphFrame;
    referenceFrame: StationGraphFrame;
    baseHorizontalFovDegrees: { state: string; value: number | null };
    magnificationLevels: number[];
    formulaProjectedHorizontalFovDegrees: Array<{
      magnification: number;
      horizontalDegrees: number;
      state: string;
    }>;
  }>;
  equipmentRefs: string[];
  closure: {
    position: "closed" | "unresolved";
    motion: "closed" | "unresolved";
    view: "closed" | "unresolved";
    visual: "closed" | "unresolved";
    equipment: "closed" | "unresolved";
    hit: "unresolved";
    reasons: string[];
  };
}

interface StationGraphOccurrence {
  stableOccurrenceId: string;
  ownerStationId: string;
  motionChannels: Array<"yaw" | "pitch">;
  actorClassName: string;
  componentName: string;
  componentClassPath: string;
  sourceMeshPath: string;
  source:
    | "v10.5.3-seat-pawn-component-descendant"
    | "exact-station-equipment";
  equipmentRefIds: string[];
  gunNames: string[];
  assetUrl: string;
  referenceMatrixGltf: number[];
  assetState: "present" | "missing" | "extraction-required";
}

export interface VehicleStationGraphRecord {
  schemaVersion: "sigua-vehicle-station-graph/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceDataRevision: string;
  sourceVehicleRef: string;
  runtimeVehicleRefs: string[];
  catalogBindingRefs: string[];
  rawName: string;
  targetPackage: string;
  generatedClass: string;
  coordinateSystem: unknown;
  evidence: {
    sourceDataRevision: string;
    runtimeAnimationPose: string;
    network: "out-of-scope";
    hitRelations: "unresolved-not-consumed-by-armor";
  };
  seats: RuntimeCrewSeatStation[];
  stations: StationGraphStation[];
  vehicleEquipmentRefs: string[];
  visualBindings: Array<{
    catalogBindingRef: string;
    cardId: string;
    rawName: string;
    runtimeVehicleRef: string;
    edition: "international" | "china";
    visualArtifactRef: string;
    occurrences: StationGraphOccurrence[];
    stationClosures: Array<{
      stationId: string;
      state: "closed" | "partial";
      closureMode:
        | "visual-occurrence-membership"
        | "view-component-rotation";
      reasons: string[];
    }>;
  }>;
}

export interface VehicleStationGraphPointer {
  id: string;
  formatVersion: "sigua-vehicle-station-graph/v1";
  sourceVehicleRef: string;
  recordUrl: string;
}

interface VehicleStationGraphOwner {
  rawName: string;
  runtimeVehicleRef: string;
  generatedClass: string;
  cardId: string;
  edition: "international" | "china";
  visualArtifactRef: string;
  catalogBindingRef?: string;
}

interface VehicleStationGraphVisualPlacement {
  stableOccurrenceId: string;
  actor: string;
  name: string;
  componentClassPath: string;
  sourceMeshPath: string;
  assetUrl: string;
  matrix: number[];
}

function frameClosed(frame: StationGraphFrame) {
  const value = frame?.value;
  if (frame?.state === "unresolved") return value === null;
  return Boolean(
    ["observed", "derived", "derived-with-fallback"].includes(frame?.state) &&
      value &&
      [value.translationCm.x, value.translationCm.y, value.translationCm.z]
        .every(Number.isFinite) &&
      [
        value.rotationQuaternion.x,
        value.rotationQuaternion.y,
        value.rotationQuaternion.z,
        value.rotationQuaternion.w,
      ].every(Number.isFinite) &&
      Math.hypot(
        value.rotationQuaternion.x,
        value.rotationQuaternion.y,
        value.rotationQuaternion.z,
        value.rotationQuaternion.w,
      ) > Number.EPSILON &&
      [value.scale3D.x, value.scale3D.y, value.scale3D.z].every(Number.isFinite)
  );
}

function runtimeActorClass(value: string) {
  return (value.split(/[/.]/u).at(-1) ?? value).replace(/_\d+$/u, "");
}

export interface RuntimeStationGraphVisualMember {
  stableOccurrenceId: string;
  actorClassName: string;
  componentName: string;
  componentClassPath: string;
  sourceMeshPath: string;
  source: StationGraphOccurrence["source"];
  equipmentRefIds?: string[];
  gunNames?: string[];
  assignmentMode?: "exact-class-and-seat-anchor";
}

export interface RuntimeStationGraphVisualStation {
  seatKey: string;
  catalogSeatIndex: number;
  turretName: string;
  state: "closed" | "partial";
  closureMode:
    | "visual-occurrence-membership"
    | "view-component-rotation";
  movementState: "observed" | "unresolved";
  motion: {
    state: "derived" | "unresolved";
    driverMode: StationGraphStation["motion"]["driverMode"];
    coordinateSystem: {
      space: "vehicle-local";
      units: "unreal-centimeters";
      axes: "x-forward-y-right-z-up";
      pose: "construction-reference-pose";
    };
    sourceFunction:
      | "USQTurretMovementComponent::SetCurrentRotation@0x18043ed50"
      | "USQRotatingMovementComponent::SetCurrentRotation@0x1803f03f0";
    yawDriver: {
      componentName: string;
      componentClassPath: string;
      vehicleLocalFrame: {
        state: "derived" | "derived-with-fallback" | "unresolved";
        value: StationGraphTransform | null;
        reason: string | null;
      };
    } | null;
    pitchDriver: {
      componentName: string;
      componentClassPath: string;
      vehicleLocalFrame: {
        state: "derived" | "derived-with-fallback" | "unresolved";
        value: StationGraphTransform | null;
        reason: string | null;
      };
    } | null;
    reason: string | null;
  };
  control: unknown;
  evidenceLimits: string[];
  yawMembers: RuntimeStationGraphVisualMember[];
  pitchMembers: RuntimeStationGraphVisualMember[];
  yawAnchor: RuntimeStationGraphVisualMember | null;
  pitchAnchor: RuntimeStationGraphVisualMember | null;
  viewComponent: null;
  reasons: string[];
  parentStationId: string | null;
  parentCatalogSeatIndex: number | null;
  inheritedMotionChannels: Array<"yaw" | "pitch">;
}

export interface CompiledVehicleStationGraph {
  schemaVersion: "sigua-vehicle-station-graph/v1";
  sourceVehicleRef: string;
  sourceDataRevision: string;
  stations: StationGraphStation[];
  crewSeat: RuntimeCrewSeatBinding;
  visualAttachment: {
    schemaVersion: "sigua-vehicle-visual-attachment/v2";
    sourceBuildId: string;
    sourceDataRevision: string;
    sourceVehicleRef: string;
    catalogBindingRef: string;
    cardId: string;
    rawName: string;
    runtimeVehicleRef: string;
    edition: "international" | "china";
    visualArtifactRef: string;
    stations: RuntimeStationGraphVisualStation[];
  };
}

function visualMember(occurrence: StationGraphOccurrence): RuntimeStationGraphVisualMember {
  return {
    stableOccurrenceId: occurrence.stableOccurrenceId,
    actorClassName: occurrence.actorClassName,
    componentName: occurrence.componentName,
    componentClassPath: occurrence.componentClassPath,
    sourceMeshPath: occurrence.sourceMeshPath,
    source: occurrence.source,
    ...(occurrence.equipmentRefIds.length > 0
      ? {
          equipmentRefIds: occurrence.equipmentRefIds,
          gunNames: occurrence.gunNames,
          assignmentMode: "exact-class-and-seat-anchor" as const,
        }
      : {}),
  };
}

function motionDriver(channel: StationGraphMotionChannel) {
  return channel.driver
    ? {
        componentName: channel.driver.componentName,
        componentClassPath: channel.driver.componentClassPath,
        vehicleLocalFrame: {
          state: channel.referenceFrame.state === "unresolved"
            ? "unresolved" as const
            : channel.referenceFrame.state === "derived-with-fallback"
              ? "derived-with-fallback" as const
              : "derived" as const,
          value: channel.referenceFrame.value,
          reason: channel.referenceFrame.reason,
        },
      }
    : null;
}

export function compileVehicleStationGraph(
  record: VehicleStationGraphRecord | null,
  pointer: VehicleStationGraphPointer | null,
  owner: VehicleStationGraphOwner,
  placements: VehicleStationGraphVisualPlacement[],
): CompiledVehicleStationGraph | null {
  if (!record || !pointer) return null;
  if (
    record.schemaVersion !== "sigua-vehicle-station-graph/v1" ||
    record.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
    pointer.formatVersion !== record.schemaVersion ||
    pointer.sourceVehicleRef !== record.sourceVehicleRef ||
    pointer.id !==
      `station-graph-${record.sourceVehicleRef.slice("vehicle-".length)}` ||
    pointer.recordUrl !==
      `/data/vehicles/station-graphs/${record.sourceVehicleRef}.json` ||
    !record.runtimeVehicleRefs.includes(owner.runtimeVehicleRef) ||
    record.rawName !== owner.rawName ||
    record.generatedClass !== owner.generatedClass ||
    record.evidence?.sourceDataRevision !== record.sourceDataRevision ||
    record.evidence?.network !== "out-of-scope" ||
    record.evidence?.hitRelations !== "unresolved-not-consumed-by-armor" ||
    !/^[a-f0-9]{64}$/u.test(record.sourceDataRevision)
  ) {
    throw new Error(`SiguaWiki station graph differs for ${owner.rawName}`);
  }
  const binding = record.visualBindings.find(
    (candidate) =>
      (owner.catalogBindingRef === undefined ||
        candidate.catalogBindingRef === owner.catalogBindingRef) &&
      candidate.cardId === owner.cardId &&
      candidate.rawName === owner.rawName &&
      candidate.runtimeVehicleRef === owner.runtimeVehicleRef &&
      candidate.edition === owner.edition &&
      candidate.visualArtifactRef === owner.visualArtifactRef,
  );
  if (!binding) {
    throw new Error(`SiguaWiki station graph binding is missing for ${owner.rawName}`);
  }
  const placementById = new Map(
    placements.map((placement) => [placement.stableOccurrenceId, placement]),
  );
  const stationById = new Map<string, StationGraphStation>();
  const stationBySeat = new Set<number>();
  for (const station of record.stations) {
    if (
      station.id !== `${record.sourceVehicleRef}:station:${station.catalogSeatIndex}` ||
      station.seatKey !== `${record.sourceVehicleRef}:catalog-seat:${station.catalogSeatIndex}` ||
      station.mount.childStationId !== station.id ||
      stationById.has(station.id) ||
      stationBySeat.has(station.catalogSeatIndex) ||
      !frameClosed(station.mount.referenceFrame) ||
      station.closure.hit !== "unresolved"
    ) {
      throw new Error(`SiguaWiki station ${station.id} is invalid`);
    }
    for (const channel of [station.motion.yaw, station.motion.pitch]) {
      if (
        !frameClosed(channel.stationLocalFrame) ||
        !frameClosed(channel.referenceFrame)
      ) throw new Error(`SiguaWiki station ${station.id} motion is invalid`);
    }
    for (const view of station.views) {
      if (!frameClosed(view.stationLocalFrame) || !frameClosed(view.referenceFrame)) {
        throw new Error(`SiguaWiki station ${station.id} view is invalid`);
      }
    }
    stationById.set(station.id, station);
    stationBySeat.add(station.catalogSeatIndex);
  }
  for (const station of record.stations) {
    const parent = station.mount.parent;
    const inheritedChannels = parent.inheritedMotionChannels;
    if (
      new Set(inheritedChannels).size !== inheritedChannels.length ||
      inheritedChannels.some((channel) => channel !== "yaw" && channel !== "pitch") ||
      (parent.kind === "vehicle-root" &&
        (parent.stationId !== null || inheritedChannels.length !== 0 ||
          station.mount.parentRelativeFrame !== null)) ||
      (parent.kind === "station" &&
        (!stationById.has(parent.stationId) ||
          parent.stationId === station.id ||
          inheritedChannels.length === 0 ||
          !station.mount.parentRelativeFrame ||
          !frameClosed(station.mount.parentRelativeFrame)))
    ) {
      throw new Error(`SiguaWiki station ${station.id} parent is invalid`);
    }
  }
  const visitState = new Map<string, "visiting" | "visited">();
  const visitParent = (stationId: string) => {
    const state = visitState.get(stationId);
    if (state === "visiting") {
      throw new Error(`SiguaWiki station graph contains a cycle at ${stationId}`);
    }
    if (state === "visited") return;
    visitState.set(stationId, "visiting");
    const parent = stationById.get(stationId)!.mount.parent;
    if (parent.kind === "station") visitParent(parent.stationId);
    visitState.set(stationId, "visited");
  };
  for (const stationId of stationById.keys()) visitParent(stationId);
  const stationSeatIds = new Set<string>();
  for (const seat of record.seats) {
    const station = seat.stationId ? stationById.get(seat.stationId) : null;
    if (
      (seat.stationKind === null) !== (seat.stationId === null) ||
      (seat.stationId &&
        (!station ||
          stationSeatIds.has(seat.stationId) ||
          station.catalogSeatIndex !== seat.catalogSeatIndex ||
          station.seatKey !== seat.seatKey ||
          station.role !== seat.role ||
          station.stationKind !== seat.stationKind ||
          station.seatPawnClassPath !== seat.seatPawnClassPath ||
          station.turretName !== seat.turretName))
    ) {
      throw new Error(`SiguaWiki crew/station relation ${seat.seatKey} is invalid`);
    }
    if (seat.stationId) stationSeatIds.add(seat.stationId);
  }
  if (stationSeatIds.size !== stationById.size) {
    throw new Error("SiguaWiki station graph has an unowned station");
  }
  const occurrenceIds = new Set<string>();
  for (const occurrence of binding.occurrences) {
    const placement = placementById.get(occurrence.stableOccurrenceId);
    if (
      occurrenceIds.has(occurrence.stableOccurrenceId) ||
      !stationById.has(occurrence.ownerStationId) ||
      occurrence.assetState !== "present" ||
      !placement ||
      runtimeActorClass(placement.actor) !== occurrence.actorClassName ||
      placement.name !== occurrence.componentName ||
      placement.componentClassPath !== occurrence.componentClassPath ||
      placement.sourceMeshPath !== occurrence.sourceMeshPath ||
      placement.assetUrl !== occurrence.assetUrl ||
      JSON.stringify(placement.matrix) !==
        JSON.stringify(occurrence.referenceMatrixGltf)
    ) {
      throw new Error(
        `SiguaWiki station graph occurrence ${occurrence.stableOccurrenceId} drifted`,
      );
    }
    occurrenceIds.add(occurrence.stableOccurrenceId);
  }
  const visualStations: RuntimeStationGraphVisualStation[] = record.stations.map(
    (station) => {
      const closure = binding.stationClosures.find(
        ({ stationId }) => stationId === station.id,
      );
      if (!closure) {
        throw new Error(`SiguaWiki station ${station.id} visual closure is missing`);
      }
      const owned = binding.occurrences.filter(
        ({ ownerStationId }) => ownerStationId === station.id,
      );
      const yawMembers = owned.map(visualMember);
      const pitchMembers = owned.filter(({ motionChannels }) =>
        motionChannels.includes("pitch")
      ).map(visualMember);
      const preferredYawAnchor = owned.find(
        ({ source }) => source === "v10.5.3-seat-pawn-component-descendant",
      ) ?? owned[0] ?? null;
      return {
        seatKey: station.seatKey,
        catalogSeatIndex: station.catalogSeatIndex,
        turretName: station.turretName,
        state: closure.state,
        closureMode: closure.closureMode,
        movementState:
          station.closure.motion === "closed" ? "observed" : "unresolved",
        motion: {
          state:
            station.closure.motion === "closed" ? "derived" : "unresolved",
          driverMode: station.motion.driverMode,
          coordinateSystem: {
            space: "vehicle-local",
            units: "unreal-centimeters",
            axes: "x-forward-y-right-z-up",
            pose: "construction-reference-pose",
          },
          sourceFunction: station.motion.yaw.sourceFunction as
            | "USQTurretMovementComponent::SetCurrentRotation@0x18043ed50"
            | "USQRotatingMovementComponent::SetCurrentRotation@0x1803f03f0",
          yawDriver: motionDriver(station.motion.yaw),
          pitchDriver: motionDriver(station.motion.pitch),
          reason: station.closure.motion === "closed"
            ? null
            : station.closure.reasons.join("; "),
        },
        control: station.motion.control,
        evidenceLimits: station.closure.reasons,
        yawMembers,
        pitchMembers,
        yawAnchor: preferredYawAnchor ? visualMember(preferredYawAnchor) : null,
        pitchAnchor: pitchMembers[0] ?? null,
        viewComponent: null,
        reasons: closure.reasons,
        parentStationId: station.mount.parent.kind === "station"
          ? station.mount.parent.stationId
          : null,
        parentCatalogSeatIndex: station.mount.parent.kind === "station"
          ? stationById.get(station.mount.parent.stationId)?.catalogSeatIndex ?? null
          : null,
        inheritedMotionChannels: station.mount.parent.inheritedMotionChannels,
      };
    },
  );
  const seats: RuntimeCrewSeatStation[] = record.seats.map((seat) => {
    const station = seat.stationId ? stationById.get(seat.stationId) : null;
    return {
      ...seat,
      ...(station?.mount.parent.kind === "station"
        ? {
            positionSemantics: {
              ...seat.positionSemantics,
              seatPawnAttachment: {
                mode: "station-graph-parent" as const,
                parentCatalogSeatIndex:
                  stationById.get(station.mount.parent.stationId)!
                    .catalogSeatIndex,
              },
            },
          }
        : {}),
    };
  });
  const crewSeat: RuntimeCrewSeatBinding = {
    schemaVersion: "sigua-vehicle-crew-seat/v1",
    sourceBuildId: record.sourceBuildId,
    sourceVehicleRef: record.sourceVehicleRef,
    runtimeVehicleRefs: record.runtimeVehicleRefs,
    catalogBindingRefs: record.catalogBindingRefs,
    rawName: record.rawName,
    targetPackage: record.targetPackage,
    generatedClass: record.generatedClass,
    evidence: {
      state: "derived-from-vehicle-station-graph",
      sourceDataRevision: record.sourceDataRevision,
      constructionPose: "reference",
      runtimeAnimationPose: record.evidence.runtimeAnimationPose,
      dedicatedServerParity: "native-unknown",
    },
    seats,
  };
  projectCrewSeatBinding(
    crewSeat,
    {
      id: `crew-seat-${record.sourceVehicleRef.slice("vehicle-".length)}`,
      formatVersion: "sigua-vehicle-crew-seat/v1",
      sourceVehicleRef: record.sourceVehicleRef,
      recordUrl: `/data/vehicles/crew-seats/${record.sourceVehicleRef}.json`,
    },
    owner,
  );
  return {
    schemaVersion: record.schemaVersion,
    sourceVehicleRef: record.sourceVehicleRef,
    sourceDataRevision: record.sourceDataRevision,
    stations: record.stations,
    crewSeat,
    visualAttachment: {
      schemaVersion: "sigua-vehicle-visual-attachment/v2",
      sourceBuildId: record.sourceBuildId,
      sourceDataRevision: record.sourceDataRevision,
      sourceVehicleRef: record.sourceVehicleRef,
      catalogBindingRef: binding.catalogBindingRef,
      cardId: binding.cardId,
      rawName: binding.rawName,
      runtimeVehicleRef: binding.runtimeVehicleRef,
      edition: binding.edition,
      visualArtifactRef: binding.visualArtifactRef,
      stations: visualStations,
    },
  };
}
