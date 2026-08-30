import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCrewOccupantPresentationPlan,
  crewOccupantBasePose,
} from "../../lib/vehicle-crew-occupant-presentation.ts";

const identityFrame = (translationCm = { x: 0, y: 0, z: 0 }) => ({
  state: "derived",
  value: {
    translationCm,
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale3D: { x: 1, y: 1, z: 1 },
  },
  reason: null,
});

function seat({
  index,
  role,
  category,
  soldierSeatState,
  collision,
  eligibility,
  animation,
  stationId = null,
  spatialMeaning = "runtime-soldier-attachment",
  poseRef = category === "hittable"
    ? "vehicle-crew-animation-aaaaaaaaaaaaaaaaaaaaaaaa"
    : null,
}) {
  return {
    seatKey: `vehicle-test:catalog-seat:${index}`,
    stationId,
    catalogSeatIndex: index,
    role,
    positionSemantics: { spatialMeaning },
    occupantBaseFrame: identityFrame({ x: index * 100, y: 20, z: 50 }),
    config: { initialStateIndex: 0, exposedSeat: index > 1 },
    occupantStates: [{
      stateIndex: 0,
      soldierSeatState,
      baseAnimation: animation,
      baseAnimationPoseRef: poseRef,
      animationState: {
        aimOffsets: null,
        useHandIK: false,
        useWeaponForHandIK: false,
      },
      hitClassification: {
        userCategory: category,
        naturalPointHitEligibility: eligibility,
        soldierActorCollision: collision,
        absoluteInvulnerability: "not-claimed",
      },
      directRadialDamageEligibility: "disabled",
    }],
    views: [],
  };
}

test("hittable standing weapon operators use the shared model and hit proxy", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [seat({
      index: 4,
      role: "machine-gunner",
      category: "hittable",
      soldierSeatState: "Locked",
      collision: "enabled",
      eligibility: "collision-eligible",
      animation: "/Game/Vehicles/M1A2/Animations/A_Char_M240Loaders_Neutral",
      stationId: "vehicle-test:station:4",
    })],
  });
  assert.equal(plans[0].renderKind, "hittable-model-and-proxy");
  assert.equal(plans[0].posture, "standing-rifle");
  assert.equal(plans[0].stationId, "vehicle-test:station:4");
  assert.equal(
    plans[0].animationPoseRef,
    "vehicle-crew-animation-aaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(
    plans[0].animationPoseState,
    "derived-editor-animation-frame-zero",
  );
});

test("seat animation families select a crouching seated approximation", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [seat({
      index: 2,
      role: "passenger",
      category: "hittable",
      soldierSeatState: "LockedWithWeapon",
      collision: "enabled",
      eligibility: "collision-eligible",
      animation: "/Game/Art/Soldier2/VehiclePoses/PassengerIdles/Sit_Idle_Rifle",
    })],
  });
  assert.equal(plans[0].posture, "crouching");
  assert.equal(plans[0].postureEvidence, "source-animation-family");
});

test("standing passenger animation overrides the passenger role fallback", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [seat({
      index: 3,
      role: "passenger",
      category: "hittable",
      soldierSeatState: "LockedWithWeapon",
      collision: "enabled",
      eligibility: "collision-eligible",
      animation: "/Game/Art/Soldier2/VehiclePoses/PassengerIdles/Stand_Idle_Rear_Truck",
    })],
  });
  assert.equal(plans[0].posture, "standing-rifle");
  assert.equal(plans[0].postureEvidence, "source-animation-family");
});

test("hidden and classification-mismatched occupants never receive a body model", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [
      seat({
        index: 1,
        role: "driver",
        category: "protected",
        soldierSeatState: "Hidden",
        collision: "disabled",
        eligibility: "collision-ineligible",
        animation: "/Game/Vehicles/MATV/Animations/Driver/Aimoffset",
      }),
      seat({
        index: 2,
        role: "passenger",
        category: "hittable",
        soldierSeatState: "LockedWithWeapon",
        collision: "disabled",
        eligibility: "collision-eligible",
        animation: "/Game/Art/Soldier2/VehiclePoses/PassengerIdles/Sit_Idle_Rifle",
      }),
    ],
  });
  assert.equal(plans[0].renderKind, "protected-outline");
  assert.equal(plans[1].renderKind, "unresolved-outline");
});

test("Hidden actors without a real socket are not drawn at a misleading fallback transform", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [seat({
      index: 3,
      role: "commander",
      category: "protected",
      soldierSeatState: "Hidden",
      collision: "disabled",
      eligibility: "collision-ineligible",
      animation: "/Game/Vehicles/MATV/Animations/Passenger/Aimoffset",
      spatialMeaning: "hidden-runtime-fallback-no-rendered-body",
    })],
  });
  assert.equal(plans[0].renderKind, "protected-nonspatial");
  assert.equal(
    plans[0].spatialMeaning,
    "hidden-runtime-fallback-no-rendered-body",
  );
});

test("hittable crew without an exact BaseAnimation pose fails closed to an outline", () => {
  const plans = buildCrewOccupantPresentationPlan({
    seats: [seat({
      index: 4,
      role: "machine-gunner",
      category: "hittable",
      soldierSeatState: "Locked",
      collision: "enabled",
      eligibility: "collision-eligible",
      animation: "/Game/Test/Unknown.Unknown",
      poseRef: null,
    })],
  });
  assert.equal(plans[0].renderKind, "unresolved-outline");
  assert.equal(plans[0].animationPoseState, "unresolved");
});

test("occupant frames convert UE centimetres and axes into glTF metres", () => {
  assert.deepEqual(crewOccupantBasePose(identityFrame({ x: 100, y: 20, z: 250 })), {
    position: [1, 2.5, 0.2],
    forward: [1, 0, 0],
    up: [0, 1, 0],
    scale: [1, 1, 1],
  });
});
