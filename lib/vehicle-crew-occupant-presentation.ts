import type {
  RuntimeCrewSeatBinding,
  RuntimeCrewSeatFrame,
  RuntimeCrewSeatStation,
} from "./vehicle-crew-seat-runtime";
import { crewViewBasePose } from "./vehicle-crew-viewpoint.ts";

export type CrewOccupantPosture = "standing-rifle" | "crouching";
export type CrewOccupantRenderKind =
  | "hittable-model-and-proxy"
  | "protected-outline"
  | "unresolved-outline";

export interface CrewOccupantPresentationPlan {
  seatKey: string;
  catalogSeatIndex: number;
  stationId: string | null;
  role: string;
  renderKind: CrewOccupantRenderKind;
  posture: CrewOccupantPosture;
  postureEvidence: "source-animation-family" | "role-approximation";
  frame: RuntimeCrewSeatFrame;
  soldierSeatState: string | null;
  animationRef: string | null;
  animationPoseRef: string | null;
  animationPoseState:
    | "derived-editor-animation-frame-zero"
    | "unresolved";
  animationRuntimeLayers: {
    aimOffsetRef: string | null;
    handIkRequired: boolean | null;
    weaponIkRequired: boolean | null;
  };
}

function activeOccupantState(seat: RuntimeCrewSeatStation) {
  const initialStateIndex = seat.config.initialStateIndex ??
    seat.occupantStates[0]?.stateIndex ?? null;
  return seat.occupantStates.find(
    ({ stateIndex }) => stateIndex === initialStateIndex,
  ) ?? seat.occupantStates[0] ?? null;
}

function postureForSeat(
  seat: RuntimeCrewSeatStation,
  animationRef: string | null,
): Pick<CrewOccupantPresentationPlan, "posture" | "postureEvidence"> {
  const animation = animationRef?.toLowerCase() ?? "";
  const standingFamily = /(?:^|[/_.-])stand(?:[/_.-]|$)/u.test(animation);
  const seatedFamily =
    /(?:^|[/_.-])sit(?:[/_.-]|$)|driver|passenger|helicopter/u.test(animation);
  if (standingFamily) {
    return {
      posture: "standing-rifle",
      postureEvidence: "source-animation-family",
    };
  }
  if (seatedFamily) {
    return {
      posture: "crouching",
      postureEvidence: "source-animation-family",
    };
  }
  return {
    posture: seat.role === "driver" || seat.role === "passenger"
      ? "crouching"
      : "standing-rifle",
    postureEvidence: "role-approximation",
  };
}

function renderKindForSeat(
  state: RuntimeCrewSeatStation["occupantStates"][number] | null,
  animationPoseRef: string | null,
): CrewOccupantRenderKind {
  const classification = state?.hitClassification;
  if (
    classification?.userCategory === "hittable" &&
    classification.naturalPointHitEligibility === "collision-eligible" &&
    classification.soldierActorCollision === "enabled"
  ) return animationPoseRef
    ? "hittable-model-and-proxy"
    : "unresolved-outline";
  if (
    classification?.userCategory === "protected" &&
    classification.naturalPointHitEligibility === "collision-ineligible" &&
    classification.soldierActorCollision === "disabled"
  ) return "protected-outline";
  return "unresolved-outline";
}

export function buildCrewOccupantPresentationPlan(
  binding: Pick<RuntimeCrewSeatBinding, "seats"> | null,
): CrewOccupantPresentationPlan[] {
  return (binding?.seats ?? [])
    .flatMap((seat) => {
      if (
        !seat.occupantBaseFrame?.value ||
        !["observed", "derived", "derived-with-fallback"].includes(
          seat.occupantBaseFrame.state,
        )
      ) return [];
      const state = activeOccupantState(seat);
      const animationRef = state?.baseAnimation ?? null;
      const animationPoseRef = state?.baseAnimationPoseRef ?? null;
      return [{
        seatKey: seat.seatKey,
        catalogSeatIndex: seat.catalogSeatIndex,
        stationId: seat.stationId ?? null,
        role: seat.role,
        renderKind: renderKindForSeat(state, animationPoseRef),
        ...postureForSeat(seat, animationRef),
        frame: seat.occupantBaseFrame,
        soldierSeatState: state?.soldierSeatState ?? null,
        animationRef,
        animationPoseRef,
        animationPoseState: animationPoseRef
          ? "derived-editor-animation-frame-zero" as const
          : "unresolved" as const,
        animationRuntimeLayers: {
          aimOffsetRef: state?.animationState?.aimOffsets ?? null,
          handIkRequired: state?.animationState?.useHandIK ?? null,
          weaponIkRequired: state?.animationState?.useWeaponForHandIK ?? null,
        },
      }];
    })
    .sort((left, right) => left.catalogSeatIndex - right.catalogSeatIndex);
}

export function crewOccupantBasePose(frame: RuntimeCrewSeatFrame) {
  const viewPose = crewViewBasePose({
    vehicleLocalFrame: frame,
    baseHorizontalFovDegrees: { state: "not-applicable", value: 90 },
  });
  const scale = frame.value!.scale3D;
  return {
    position: viewPose.position,
    forward: viewPose.forward,
    up: viewPose.up,
    scale: [scale.x, scale.z, scale.y] as [number, number, number],
  };
}
