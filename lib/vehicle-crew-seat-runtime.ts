export interface RuntimeCrewComponentTransform {
  translationCm: { x: number; y: number; z: number };
  rotationQuaternion: { x: number; y: number; z: number; w: number };
  scale3D: { x: number; y: number; z: number };
}

export interface RuntimeCrewSeatFrame {
  state: "observed" | "derived" | "derived-with-fallback" | "unresolved";
  value: RuntimeCrewComponentTransform | null;
  reason: string | null;
}

export interface RuntimeCrewSeatView {
  viewId: string;
  source: string;
  componentName: string;
  dynamicParent: {
    componentName: string;
    componentClassPath: string;
    socketName: string | null;
  } | null;
  vehicleLocalFrame: RuntimeCrewSeatFrame;
  baseHorizontalFovDegrees: { state: string; value: number | null };
  magnificationLevels: number[];
  formulaProjectedHorizontalFovDegrees: Array<{
    magnification: number;
    horizontalDegrees: number;
    state: string;
  }>;
}

export interface RuntimeCrewSeatStation {
  stationId?: string | null;
  seatKey: string;
  catalogSeatIndex: number;
  additionalSeatConfigIndex: number | null;
  role: string;
  stationKind: string | null;
  seatPawnClassPath: string | null;
  turretName: string | null;
  occupantBaseFrame: RuntimeCrewSeatFrame;
  positionSemantics?: {
    seatPawnAttachment?: {
      mode:
        | "nested-seat-pawn-via-parent-seat-socket"
        | "station-graph-parent";
      parentCatalogSeatIndex: number;
    };
  };
  config: {
    initialStateIndex?: number;
    exposedSeat: boolean;
    seatAttachSocket: string | null;
    soldierAttachSocket: string | null;
  };
  occupantStates: Array<{
    stateIndex: number;
    soldierSeatState: string;
    hitClassification: {
      userCategory: "protected" | "hittable" | "unresolved";
      naturalPointHitEligibility: string;
      soldierActorCollision: string;
      absoluteInvulnerability: "not-claimed";
    };
    directRadialDamageEligibility: string;
    baseAnimation?: string | null;
    pawnAnimation?: string | null;
    seatAnimation?: string | null;
    animationState?: {
      baseAnimation: string | null;
      pawnAnimation: string | null;
      seatAnimation: string | null;
      aimOffsets: string | null;
      aimOffsets1pOverride: string | null;
      useWheelBlendSpace1D: boolean | null;
      wheelBlendSpace1D: string | null;
      useHandIK: boolean | null;
      useWeaponForHandIK: boolean | null;
      leftHandIKAlpha: number | null;
      leftHandIKSocketName: string | null;
      rightHandIKAlpha: number | null;
      rightHandIKSocketName: string | null;
      steeringWheelSingleFrameAnimation: string | null;
    };
    baseAnimationPoseRef?: string | null;
  }>;
  views: RuntimeCrewSeatView[];
}

export interface RuntimeCrewSeatBinding {
  schemaVersion: "sigua-vehicle-crew-seat/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceVehicleRef: string;
  runtimeVehicleRefs: string[];
  catalogBindingRefs: string[];
  rawName: string;
  targetPackage: string;
  generatedClass: string;
  evidence: {
    state: string;
    sourceDataRevision: string;
    constructionPose: "reference";
    runtimeAnimationPose: string;
    dedicatedServerParity: string;
  };
  seats: RuntimeCrewSeatStation[];
}

export interface RuntimeCrewSeatPointer {
  id: string;
  formatVersion: "sigua-vehicle-crew-seat/v1";
  sourceVehicleRef: string;
  recordUrl: string;
}

interface RuntimeCrewSeatOwner {
  rawName: string;
  runtimeVehicleRef: string;
  generatedClass: string;
}

function crewFrameClosed(frame: RuntimeCrewSeatFrame) {
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

export function projectCrewSeatBinding(
  record: RuntimeCrewSeatBinding | null,
  pointer: RuntimeCrewSeatPointer | null,
  runtimeVariant: RuntimeCrewSeatOwner,
): RuntimeCrewSeatBinding | null {
  if (!record || !pointer) return null;
  if (
    record.schemaVersion !== "sigua-vehicle-crew-seat/v1" ||
    record.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
    pointer.formatVersion !== record.schemaVersion ||
    pointer.sourceVehicleRef !== record.sourceVehicleRef ||
    pointer.id !==
      `crew-seat-${record.sourceVehicleRef.slice("vehicle-".length)}` ||
    pointer.recordUrl !==
      `/data/vehicles/crew-seats/${record.sourceVehicleRef}.json` ||
    !record.runtimeVehicleRefs.includes(runtimeVariant.runtimeVehicleRef) ||
    record.rawName !== runtimeVariant.rawName ||
    record.generatedClass !== runtimeVariant.generatedClass ||
    record.evidence?.constructionPose !== "reference" ||
    !/^[a-f0-9]{64}$/u.test(record.evidence?.sourceDataRevision ?? "")
  ) {
    throw new Error(`SiguaWiki crew-seat mapping differs for ${runtimeVariant.rawName}`);
  }
  const seenIndexes = new Set<number>();
  for (const seat of record.seats) {
    if (
      !Number.isSafeInteger(seat.catalogSeatIndex) ||
      seat.catalogSeatIndex <= 0 ||
      seenIndexes.has(seat.catalogSeatIndex) ||
      seat.seatKey !==
        `${record.sourceVehicleRef}:catalog-seat:${seat.catalogSeatIndex}` ||
      !crewFrameClosed(seat.occupantBaseFrame) ||
      typeof seat.config?.exposedSeat !== "boolean" ||
      !Array.isArray(seat.occupantStates) ||
      !Array.isArray(seat.views)
    ) {
      throw new Error(`SiguaWiki crew seat ${seat.seatKey} is invalid`);
    }
    seenIndexes.add(seat.catalogSeatIndex);
    for (const state of seat.occupantStates) {
      if (
        !Number.isSafeInteger(state.stateIndex) ||
        !["protected", "hittable", "unresolved"].includes(
          state.hitClassification?.userCategory,
        ) ||
        state.hitClassification?.absoluteInvulnerability !== "not-claimed"
      ) {
        throw new Error(`SiguaWiki crew state ${seat.seatKey} is invalid`);
      }
    }
    for (const view of seat.views) {
      if (
        typeof view.viewId !== "string" ||
        view.viewId.length === 0 ||
        typeof view.componentName !== "string" ||
        view.componentName.length === 0 ||
        !crewFrameClosed(view.vehicleLocalFrame) ||
        !Array.isArray(view.magnificationLevels) ||
        !view.magnificationLevels.every(Number.isFinite)
      ) {
        throw new Error(`SiguaWiki crew view ${seat.seatKey}/${view.viewId} is invalid`);
      }
    }
  }
  return record;
}
