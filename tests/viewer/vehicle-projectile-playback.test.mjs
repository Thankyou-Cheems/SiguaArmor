import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  buildVehicleProjectileSimulationInput,
  compileVehicleProjectilePlaybackBinding,
  presentationProjectileSpreadSample,
  sampleProjectileTrajectory,
} from "../../lib/vehicle-projectile-playback.ts";
import {
  resolveVehicleProjectileLaunchPose,
  vehicleProjectileAnchorMatrixFromUnrealFrame,
} from "../../lib/vehicle-projectile-three-runtime.ts";

const SOURCE = "vehicle-0123456789abcdef01234567";
const STATION = `${SOURCE}:station:2`;
const EQUIPMENT = "vehicle-equipment-test";
const WEAPON_VARIANT = "weapon-variant-test";
const WEAPON_ASSIGNMENT = `${EQUIPMENT}:${WEAPON_VARIANT}`;
const WEAPON_CLASS = "/Game/Test/BP_TestWeapon.BP_TestWeapon_C";
const PROJECTILE_CLASS = "/Game/Test/BP_TestProjectile.BP_TestProjectile_C";
const SOURCE_MESH = "/Game/Test/SK_TestGun.SK_TestGun";

function stationGraph() {
  return {
    schemaVersion: "sigua-vehicle-station-graph/v1",
    sourceVehicleRef: SOURCE,
    sourceDataRevision: "a".repeat(64),
    vehicleEquipmentRefs: [],
    crewSeat: {
      generatedClass: "/Game/Test/BP_TestVehicle.BP_TestVehicle_C",
    },
    stations: [{
      id: STATION,
      catalogSeatIndex: 2,
      equipmentRefs: [EQUIPMENT],
    }],
    visualAttachment: {
      stations: [{
        catalogSeatIndex: 2,
        state: "closed",
        pitchAnchor: {
          stableOccurrenceId: "occurrence-test",
          sourceMeshPath: SOURCE_MESH,
        },
        yawAnchor: null,
        pitchMembers: [],
        yawMembers: [],
      }],
    },
  };
}

function catalog() {
  return {
    schemaVersion: "sigua-weapon-ballistics/v1",
    status: "completed",
    sourceBuildId: "squad-sdk-v10.5.3-test",
    algorithms: { projectile: "/algorithms/ballistics/native-projectile.js" },
    physics: {
      worldGravityZCentimetresPerSecondSquared: -980,
      serverFrameDeltaSeconds: 0.02,
    },
    launchOriginProfiles: [{
      id: "launch-test",
      kind: "weapon-mesh1p-socket",
      anchorRole: "weapon-actor-root",
      componentRole: "WeaponMesh1P",
      sourceMeshPath: SOURCE_MESH,
      componentRelativeTransform: {
        translation: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale3d: { x: 1, y: 1, z: 1 },
      },
      forwardOffsetCm: 0,
      shotSelection: "single-barrel-socket",
      shots: [{
        socketName: "socket_muzzle",
        socketResolved: true,
        translationCm: { x: 200, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      }],
    }],
    projectileProfiles: [{
      id: "projectile-test",
      generatedClassPath: PROJECTILE_CLASS,
      movement: {
        ProjectileGravityScale: 2,
        ConstantAcceleration: { X: 100, Y: 0, Z: 0 },
        ConstantAccelerationTimeout: 1,
        MaxSpeed: 100000,
        MaxSimulationTimeStep: 0.05,
        MaxSimulationIterations: 4,
        MovementModes: [],
        bShouldBounce: false,
      },
      collision: { sphereRadiusCm: 1 },
      fuze: { initialLifeSpanSeconds: 5, minFlightTimeSeconds: 0 },
      guided: {
        aimMaxDistanceCm: null,
        guidanceDelaySeconds: null,
        guidanceLossBehaviours: null,
        trackedFovByDistanceCurve: null,
      },
    }],
    weaponAssignments: [{
      weaponClassPath: WEAPON_CLASS,
      projectileClassPath: PROJECTILE_CLASS,
      projectileProfileRef: "projectile-test",
      muzzleVelocityCmPerSecond: 90000,
      moaDiameter: 2,
      moaCurve: null,
      guidanceController: {
        distanceFromFireLocationUntilGuidanceLossCm: null,
        maxConcurrentGuidableProjectiles: null,
        blockFiringWhenGuidingProjectile: null,
        jitterSeed: null,
      },
      launchOriginProfileRef: "launch-test",
    }],
    movementModes: [],
    curveAssets: [],
    vehicleMountBindings: [{
      equipmentBindingId: EQUIPMENT,
      cardId: "usa--test--ifv",
      rawName: "BP_TestVehicle",
      weaponClassPath: WEAPON_CLASS,
      projectileClassPath: PROJECTILE_CLASS,
      projectileProfileRef: "projectile-test",
      weaponVariantIds: [WEAPON_VARIANT],
      launchConstraintKind: "articulated-mount",
      mountProfileRef: "mount-test",
      turretClassPath: "/Game/Test/BP_TestTurret.BP_TestTurret_C",
    }],
  };
}

const weapon = {
  weaponAssignmentId: WEAPON_ASSIGNMENT,
  stationEquipmentId: EQUIPMENT,
  sourceCardId: "usa--test--ifv",
  sourceRawName: "BP_TestVehicle",
  displayNameZh: "测试弹",
  displayNameEnglish: "Test round",
};

test("joins one runtime weapon through its exact Station and WeaponMesh1P anchor", () => {
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: stationGraph(),
    stationId: STATION,
    weapon,
  });
  assert.equal(resolution.state, "ready");
  assert.deepEqual(resolution.binding.launchAnchor, {
    kind: "visual-occurrence",
    occurrenceId: "occurrence-test",
  });
  assert.equal(resolution.binding.launchShot.socketName, "socket_muzzle");
});

test("uses the source-locked Get1PAttachComponent frame when no display occurrence exists", () => {
  const graph = stationGraph();
  graph.visualAttachment.stations[0].pitchAnchor.sourceMeshPath =
    "/Game/Test/SK_OtherGun.SK_OtherGun";
  const referenceFrame = {
    translationCm: { x: 100, y: 200, z: 300 },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale3D: { x: 1, y: 1, z: 1 },
  };
  graph.stations[0].weaponAttachments = {
    firstPerson: {
      state: "derived-seat-pawn-component",
      meshRole: "WeaponMesh1P",
      attachmentRule: "SnapToTargetIncludingScale",
      parent: {
        kind: "station-component",
        stationId: STATION,
        componentName: "GunAttachPoint",
        componentClassPath: "/Script/Engine.SceneComponent",
        socketName: null,
      },
      motionChannels: ["yaw", "pitch"],
      referenceFrame: {
        state: "derived",
        value: referenceFrame,
      },
      sourceFunction: "ASQVehicleWeapon::Equip@0x1808abd20",
    },
  };
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: graph,
    stationId: STATION,
    weapon,
  });
  assert.equal(resolution.state, "ready");
  assert.deepEqual(resolution.binding.launchAnchor, {
    kind: "station-weapon-attachment",
    stationId: STATION,
    meshRole: "WeaponMesh1P",
    componentName: "GunAttachPoint",
    referenceFrame,
    motionChannels: ["yaw", "pitch"],
  });
});

test("converts a vehicle-local Unreal anchor frame without changing its scale", () => {
  const matrix = vehicleProjectileAnchorMatrixFromUnrealFrame({
    translationCm: { x: 100, y: 200, z: 300 },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale3D: { x: 2, y: 3, z: 4 },
  });
  const position = { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14] };
  assert.deepEqual(position, { x: 1, y: 3, z: 2 });
  assert.deepEqual(
    [
      Math.hypot(matrix.elements[0], matrix.elements[1], matrix.elements[2]),
      Math.hypot(matrix.elements[4], matrix.elements[5], matrix.elements[6]),
      Math.hypot(matrix.elements[8], matrix.elements[9], matrix.elements[10]),
    ],
    [2, 4, 3],
  );
});

test("fails closed when one equipment identity belongs to two Stations", () => {
  const graph = stationGraph();
  graph.stations.push({
    id: `${SOURCE}:station:4`,
    catalogSeatIndex: 4,
    equipmentRefs: [EQUIPMENT],
  });
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: graph,
    stationId: STATION,
    weapon,
  });
  assert.deepEqual(
    { state: resolution.state, reason: resolution.reason },
    { state: "unsupported", reason: "station-binding-ambiguous" },
  );
});

test("keeps guided weapons unavailable until live guidance inputs are supplied", () => {
  const data = catalog();
  data.weaponAssignments[0].guidanceController.jitterSeed = 1;
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: data,
    stationGraph: stationGraph(),
    stationId: STATION,
    weapon,
  });
  assert.deepEqual(
    { state: resolution.state, reason: resolution.reason },
    { state: "unsupported", reason: "guidance-live-input-required" },
  );
});

test("binds a vehicle-attitude weapon to the unique same-vehicle visual occurrence", () => {
  const graph = stationGraph();
  graph.stations = [];
  graph.visualAttachment.stations = [];
  graph.vehicleEquipmentRefs = [EQUIPMENT];
  const data = catalog();
  data.vehicleMountBindings[0].launchConstraintKind = "vehicle-attitude";
  data.vehicleMountBindings[0].mountProfileRef = null;
  data.vehicleMountBindings[0].turretClassPath = null;
  data.projectileProfiles[0].movement.MovementModes =
    "uobject:/Game/Test/MovementMode_Hydra.MovementMode_Hydra";
  data.movementModes.push({
    assetPath: "/Game/Test/MovementMode_Hydra.MovementMode_Hydra",
    fields: { bIsHoming: false, bApplyJitter: true },
  });
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: data,
    stationGraph: graph,
    stationId: null,
    visualPlacements: [{
      stableOccurrenceId: "occurrence-vehicle-attitude",
      actor: "/Game/Test/BP_TestVehicle.BP_TestVehicle_C_0",
      name: "CAS",
      componentClassPath: "/Script/Engine.SkeletalMeshComponent",
      sourceMeshPath: SOURCE_MESH,
      assetUrl: "/assets/test.gltf",
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    }],
    weapon,
  });
  assert.equal(resolution.state, "ready");
  assert.deepEqual(resolution.binding.operationOwner, {
    kind: "vehicle-attitude",
    sourceVehicleRef: SOURCE,
  });
  assert.equal(resolution.binding.stationId, null);
  assert.deepEqual(resolution.binding.launchAnchor, {
    kind: "vehicle-attitude-occurrence",
    occurrenceId: "occurrence-vehicle-attitude",
    componentName: "CAS",
  });
  assert.equal(
    resolution.binding.movementMode.assetPath,
    "/Game/Test/MovementMode_Hydra.MovementMode_Hydra",
  );
});

test("fails closed when a vehicle-attitude source mesh is duplicated", () => {
  const graph = stationGraph();
  graph.stations = [];
  graph.visualAttachment.stations = [];
  graph.vehicleEquipmentRefs = [EQUIPMENT];
  const data = catalog();
  data.vehicleMountBindings[0].launchConstraintKind = "vehicle-attitude";
  const placement = {
    stableOccurrenceId: "occurrence-a",
    actor: "/Game/Test/BP_TestVehicle.BP_TestVehicle_C_0",
    name: "CAS",
    componentClassPath: "/Script/Engine.SkeletalMeshComponent",
    sourceMeshPath: SOURCE_MESH,
    assetUrl: "/assets/test.gltf",
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: data,
    stationGraph: graph,
    stationId: null,
    visualPlacements: [
      placement,
      { ...placement, stableOccurrenceId: "occurrence-b", name: "CASDuplicate" },
    ],
    weapon,
  });
  assert.deepEqual(
    { state: resolution.state, reason: resolution.reason },
    { state: "unsupported", reason: "launch-anchor-ambiguous" },
  );
});

test("vehicle-attitude launch pose inherits yaw, pitch, and roll", () => {
  const launch = (rotation, socketTranslationCm = { x: 100, y: 0, z: 0 }) => {
    const chassis = new THREE.Group();
    chassis.rotation.set(rotation.x, rotation.y, rotation.z);
    const anchor = new THREE.Object3D();
    chassis.add(anchor);
    return resolveVehicleProjectileLaunchPose({
      anchor,
      socketTranslationCm,
      socketDirection: { x: 1, y: 0, z: 0 },
      forwardOffsetCm: 0,
    });
  };
  const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  const yaw = launch({ x: 0, y: Math.PI / 2, z: 0 });
  near(yaw.direction.x, 0);
  near(yaw.direction.y, -1);
  near(yaw.direction.z, 0);
  const pitch = launch({ x: 0, y: 0, z: Math.PI / 2 });
  near(pitch.direction.x, 0);
  near(pitch.direction.y, 0);
  near(pitch.direction.z, 1);
  const roll = launch(
    { x: Math.PI / 2, y: 0, z: 0 },
    { x: 0, y: 100, z: 0 },
  );
  near(roll.positionCm.x, 0);
  near(roll.positionCm.y, 0);
  near(roll.positionCm.z, -100);
});

test("retains the native component-origin fallback when the requested socket is absent", () => {
  const data = catalog();
  data.launchOriginProfiles[0].shots[0].socketResolved = false;
  data.launchOriginProfiles[0].shots[0].translationCm = { x: 0, y: 0, z: 0 };
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: data,
    stationGraph: stationGraph(),
    stationId: STATION,
    weapon,
  });
  assert.equal(resolution.state, "ready");
  assert.equal(resolution.binding.launchPrecision, "component-origin-fallback");
});

test("reports a stable reason when the Station has no matching launch anchor", () => {
  const graph = stationGraph();
  graph.visualAttachment.stations[0].pitchAnchor.sourceMeshPath =
    "/Game/Test/SK_OtherGun.SK_OtherGun";
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: graph,
    stationId: STATION,
    weapon,
  });
  assert.deepEqual(
    { state: resolution.state, reason: resolution.reason },
    { state: "unsupported", reason: "launch-anchor-missing" },
  );
});

test("reports a stable reason when one Station owns two matching launch anchors", () => {
  const graph = stationGraph();
  graph.visualAttachment.stations[0].pitchMembers.push({
    stableOccurrenceId: "occurrence-duplicate",
    sourceMeshPath: SOURCE_MESH,
  });
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: graph,
    stationId: STATION,
    weapon,
  });
  assert.deepEqual(
    { state: resolution.state, reason: resolution.reason },
    { state: "unsupported", reason: "launch-anchor-ambiguous" },
  );
});

test("intersects equipment ownership with the WeaponMesh1P source before declaring ambiguity", () => {
  const graph = stationGraph();
  graph.visualAttachment.stations[0].pitchAnchor.equipmentRefIds = [EQUIPMENT];
  graph.visualAttachment.stations[0].pitchMembers.push({
    stableOccurrenceId: "occurrence-same-equipment-other-mesh",
    sourceMeshPath: "/Game/Test/SK_OtherGun.SK_OtherGun",
    equipmentRefIds: [EQUIPMENT],
  });
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: graph,
    stationId: STATION,
    weapon,
  });
  assert.equal(resolution.state, "ready");
  assert.deepEqual(resolution.binding.launchAnchor, {
    kind: "visual-occurrence",
    occurrenceId: "occurrence-test",
  });
});

test("builds native integration input in the current launch direction", () => {
  const resolution = compileVehicleProjectilePlaybackBinding({
    catalog: catalog(),
    stationGraph: stationGraph(),
    stationId: STATION,
    weapon,
  });
  assert.equal(resolution.state, "ready");
  const input = buildVehicleProjectileSimulationInput(
    resolution.binding,
    {
      positionCm: { x: 10, y: 20, z: 30 },
      direction: { x: 0, y: 1, z: 0 },
    },
  );
  assert.deepEqual(input.positionCm, { x: 10, y: 20, z: 30 });
  assert.deepEqual(input.constantAccelerationWorld, { x: 0, y: 100, z: 0 });
  assert.equal(input.frameDeltaSeconds, 0.02);
  assert.equal(input.maximumTimeSeconds, 5);
});

test("spread samples are deterministic and trajectory interpolation is continuous", () => {
  assert.deepEqual(
    presentationProjectileSpreadSample(WEAPON_ASSIGNMENT, 3),
    presentationProjectileSpreadSample(WEAPON_ASSIGNMENT, 3),
  );
  const sample = sampleProjectileTrajectory([
    {
      timeSeconds: 0,
      positionCm: { x: 0, y: 0, z: 0 },
      velocityCmPerSecond: { x: 100, y: 0, z: 0 },
      phase: "ascending",
    },
    {
      timeSeconds: 1,
      positionCm: { x: 100, y: 20, z: 10 },
      velocityCmPerSecond: { x: 80, y: 0, z: -20 },
      phase: "descending",
    },
  ], 0.5);
  assert.deepEqual(sample.positionCm, { x: 50, y: 10, z: 5 });
  assert.deepEqual(sample.velocityCmPerSecond, { x: 90, y: 0, z: -10 });
});
