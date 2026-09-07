import assert from "node:assert/strict";
import test from "node:test";

import {
  carryNestedRuntimeTurretAssemblies,
  resolveRuntimeTurretAssembly,
  resolveRuntimeTurretHitComponentAssembly,
  resolveRuntimeTurretMotionFrame,
  turretArticulationMatrices,
} from "../../lib/turret-articulation.ts";
import { projectCrewSeatBinding } from "../../lib/vehicle-crew-seat-runtime.ts";

const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function placement({ id, name, actor, sourceMeshPath, translation }) {
  const matrix = [...IDENTITY];
  matrix[12] = translation[0];
  matrix[13] = translation[1];
  matrix[14] = translation[2];
  return {
    stableOccurrenceId: id,
    name,
    actor,
    sourceMeshPath,
    componentClassPath: name === "WeaponMesh3P"
      ? "/Script/AnimationBudgetAllocator.SkeletalMeshComponentBudgeted"
      : "/Script/Engine.StaticMeshComponent",
    matrix,
  };
}

const TIGR_TURRET = placement({
  id: "tigr-turret",
  name: "turret_static_mesh",
  actor: "BP_Arbalet_Turret_C_0",
  sourceMeshPath:
    "/Game/Vehicles/Tigr/Weapons/Arbalet/Meshes/Arbalet_rws_turret_static.Arbalet_rws_turret_static",
  translation: [0.179342213, 2.211895142, 0.000278778],
});
const TIGR_WEAPON = placement({
  id: "tigr-weapon",
  name: "WeaponMesh3P",
  actor: "BP_Arbalet_Kord_C_0",
  sourceMeshPath:
    "/Game/Vehicles/Tigr/Weapons/Arbalet/Meshes/Arbalet_Kord.Arbalet_Kord",
  translation: [-0.032986546, 2.713712158, 0.000278758],
});

test("explicit parent carry moves one child station without transferring ownership", () => {
  const parent = {
    yawPlacementIds: ["main-turret"],
    pitchPlacementIds: ["main-gun"],
    yawPivot: [0, 1.5, 0],
    pitchPivot: [1, 2, 0],
    yawComponentPlacementId: "main-turret",
    pitchComponentPlacementId: "main-gun",
  };
  const child = {
    yawPlacementIds: ["commander-cupola", "commander-weapon"],
    pitchPlacementIds: ["commander-weapon"],
    yawPivot: [0.5, 2.5, 0],
    pitchPivot: [1, 3, 0],
    yawComponentPlacementId: "commander-cupola",
    pitchComponentPlacementId: "commander-weapon",
  };
  const expanded = carryNestedRuntimeTurretAssemblies(
    [parent, child],
    [null, { parentIndex: 0, inheritedMotionChannels: ["yaw"] }],
  );
  assert.deepEqual(expanded[0].yawPlacementIds, [
    "main-turret",
    "commander-cupola",
    "commander-weapon",
  ]);
  assert.deepEqual(expanded[0].pitchPlacementIds, ["main-gun"]);
  assert.deepEqual(expanded[1].yawPlacementIds, [
    "commander-cupola",
    "commander-weapon",
  ]);
});

test("explicit parent carry rejects a relation cycle", () => {
  const assembly = (id) => ({
    yawPlacementIds: [id],
    pitchPlacementIds: [],
    yawPivot: [0, 0, 0],
    pitchPivot: [0, 0, 0],
    yawComponentPlacementId: id,
    pitchComponentPlacementId: null,
  });
  assert.throws(
    () => carryNestedRuntimeTurretAssemblies(
      [assembly("first"), assembly("second")],
      [
        { parentIndex: 1, inheritedMotionChannels: ["yaw"] },
        { parentIndex: 0, inheritedMotionChannels: ["yaw"] },
      ],
    ),
    /parent relation cycle/u,
  );
});

function driverMotion({
  state = "derived",
  frameState = state,
  driverMode = "split-yaw-pitch-components",
  yawTranslationCm = [100, 200, 300],
  pitchTranslationCm = [400, 500, 600],
  yawQuaternion = { x: 0, y: 0, z: 0, w: 1 },
  pitchQuaternion = { x: 0, y: 0, z: 0, w: 1 },
} = {}) {
  const driver = (componentName, translation, rotationQuaternion) => ({
    componentName,
    componentClassPath: "/Script/Engine.SceneComponent",
    vehicleLocalFrame: {
      state: frameState,
      value: frameState !== "unresolved"
        ? {
            translationCm: {
              x: translation[0],
              y: translation[1],
              z: translation[2],
            },
            rotationQuaternion,
            scale3D: { x: 1, y: 1, z: 1 },
          }
        : null,
      reason: frameState === "derived" ? null : `fixture ${frameState}`,
    },
  });
  return {
    state,
    driverMode,
    yawDriver: driver("YawDriver", yawTranslationCm, yawQuaternion),
    pitchDriver: driver("PitchDriver", pitchTranslationCm, pitchQuaternion),
  };
}

test("source-locked Tigr RWS attachment moves turret and weapon without an equipment resolver", () => {
  const assembly = resolveRuntimeTurretAssembly({
    placements: [TIGR_TURRET, TIGR_WEAPON],
    vehicleGeneratedClass: "/Game/Vehicles/Tigr/BP_Tigr_RWS.BP_Tigr_RWS_C",
    turretName: "BP_Arbalet_Turret_C",
    stationWeaponNames: [],
    primary: true,
    absorbsSiblingStations: false,
    visualAttachment: {
      state: "closed",
      closureMode: "visual-occurrence-membership",
      movementState: "observed",
      motion: driverMotion(),
      yawMembers: [
        {
          stableOccurrenceId: "tigr-turret",
          actorClassName: "BP_Arbalet_Turret_C",
          componentName: "turret_static_mesh",
          componentClassPath: TIGR_TURRET.componentClassPath,
          sourceMeshPath: TIGR_TURRET.sourceMeshPath,
        },
        {
          stableOccurrenceId: "tigr-weapon",
          actorClassName: "BP_Arbalet_Kord_C",
          componentName: "WeaponMesh3P",
          componentClassPath: TIGR_WEAPON.componentClassPath,
          sourceMeshPath: TIGR_WEAPON.sourceMeshPath,
        },
      ],
      pitchMembers: [
        {
          stableOccurrenceId: "tigr-weapon",
          actorClassName: "BP_Arbalet_Kord_C",
          componentName: "WeaponMesh3P",
          componentClassPath: TIGR_WEAPON.componentClassPath,
          sourceMeshPath: TIGR_WEAPON.sourceMeshPath,
        },
      ],
      yawAnchor: {
        stableOccurrenceId: "tigr-turret",
        actorClassName: "BP_Arbalet_Turret_C",
        componentName: "turret_static_mesh",
        componentClassPath: TIGR_TURRET.componentClassPath,
        sourceMeshPath: TIGR_TURRET.sourceMeshPath,
      },
      pitchAnchor: {
        stableOccurrenceId: "tigr-weapon",
        actorClassName: "BP_Arbalet_Kord_C",
        componentName: "WeaponMesh3P",
        componentClassPath: TIGR_WEAPON.componentClassPath,
        sourceMeshPath: TIGR_WEAPON.sourceMeshPath,
      },
    },
  });

  assert.ok(assembly);
  assert.deepEqual(assembly.yawPlacementIds.sort(), ["tigr-turret", "tigr-weapon"]);
  assert.deepEqual(assembly.pitchPlacementIds, ["tigr-weapon"]);
  assert.equal(assembly.yawComponentPlacementId, "tigr-turret");
  assert.equal(assembly.pitchComponentPlacementId, "tigr-weapon");
  assert.deepEqual(assembly.yawPivot, [1, 3, 2]);
  assert.deepEqual(assembly.pitchPivot, [4, 6, 5]);
  assert.deepEqual(assembly.yawAxis, [0, 1, 0]);
  assert.deepEqual(assembly.pitchAxis, [0, 0, 1]);
});

test("current driver quaternion rotates station axes without changing rigid distances", () => {
  const halfSqrt = Math.SQRT1_2;
  const visualAttachment = {
    state: "closed",
    closureMode: "visual-occurrence-membership",
    movementState: "observed",
    motion: driverMotion({
      frameState: "derived-with-fallback",
      yawTranslationCm: [0, 0, 0],
      pitchTranslationCm: [0, 0, 0],
      pitchQuaternion: { x: 0, y: 0, z: halfSqrt, w: halfSqrt },
    }),
    yawMembers: [{
      stableOccurrenceId: "tigr-turret",
      actorClassName: "BP_Arbalet_Turret_C",
      componentName: "turret_static_mesh",
      componentClassPath: TIGR_TURRET.componentClassPath,
      sourceMeshPath: TIGR_TURRET.sourceMeshPath,
    }],
    pitchMembers: [{
      stableOccurrenceId: "tigr-turret",
      actorClassName: "BP_Arbalet_Turret_C",
      componentName: "turret_static_mesh",
      componentClassPath: TIGR_TURRET.componentClassPath,
      sourceMeshPath: TIGR_TURRET.sourceMeshPath,
    }],
    yawAnchor: null,
    pitchAnchor: null,
  };
  const assembly = resolveRuntimeTurretAssembly({
    placements: [TIGR_TURRET],
    vehicleGeneratedClass: "/Game/Vehicles/Tigr/BP_Tigr_RWS.BP_Tigr_RWS_C",
    turretName: "BP_Arbalet_Turret_C",
    stationWeaponNames: [],
    primary: true,
    visualAttachment,
  });
  assert.ok(assembly);
  assert.deepEqual(assembly.yawAxis, [0, 1, 0]);
  assert.ok(Math.abs(assembly.pitchAxis[0] + 1) < 1e-12);
  assert.ok(Math.abs(assembly.pitchAxis[1]) < 1e-12);
  assert.ok(Math.abs(assembly.pitchAxis[2]) < 1e-12);

  const { pitch } = turretArticulationMatrices(assembly, 0, 90);
  const transformPoint = (matrix, point) => [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
  const first = transformPoint(pitch, [0, 1, 0]);
  const second = transformPoint(pitch, [0, 1, 2]);
  assert.ok(Math.abs(Math.hypot(
    second[0] - first[0],
    second[1] - first[1],
    second[2] - first[2],
  ) - 2) < 1e-12);
});

test("partial attachment evidence fails closed instead of using the old spatial fallback", () => {
  const assembly = resolveRuntimeTurretAssembly({
    placements: [TIGR_TURRET, TIGR_WEAPON],
    vehicleGeneratedClass: "/Game/Vehicles/Tigr/BP_Tigr_RWS.BP_Tigr_RWS_C",
    turretName: "BP_Arbalet_Turret_C",
    stationWeaponNames: [],
    primary: true,
    absorbsSiblingStations: false,
    visualAttachment: {
      state: "partial",
      closureMode: "visual-occurrence-membership",
      movementState: "unresolved",
      motion: driverMotion({ state: "unresolved" }),
      yawMembers: [],
      pitchMembers: [],
      yawAnchor: null,
      pitchAnchor: null,
    },
  });
  assert.equal(assembly, null);
});

test("closed membership with an unresolved current-build driver fails closed", () => {
  const assembly = resolveRuntimeTurretAssembly({
    placements: [TIGR_TURRET, TIGR_WEAPON],
    vehicleGeneratedClass: "/Game/Vehicles/Tigr/BP_Tigr_RWS.BP_Tigr_RWS_C",
    turretName: "BP_Arbalet_Turret_C",
    stationWeaponNames: [],
    primary: true,
    visualAttachment: {
      state: "closed",
      closureMode: "visual-occurrence-membership",
      movementState: "unresolved",
      motion: driverMotion({ state: "unresolved" }),
      yawMembers: [],
      pitchMembers: [],
      yawAnchor: null,
      pitchAnchor: null,
    },
  });
  assert.equal(assembly, null);
});

test("closed attachment evidence fails when an occurrence identity drifts", () => {
  assert.throws(
    () => resolveRuntimeTurretAssembly({
      placements: [TIGR_TURRET, TIGR_WEAPON],
      vehicleGeneratedClass: "/Game/Vehicles/Tigr/BP_Tigr_RWS.BP_Tigr_RWS_C",
      turretName: "BP_Arbalet_Turret_C",
      stationWeaponNames: [],
      primary: true,
      visualAttachment: {
        state: "closed",
        closureMode: "visual-occurrence-membership",
        movementState: "observed",
        motion: driverMotion(),
        yawMembers: [{
          stableOccurrenceId: "tigr-weapon",
          actorClassName: "BP_Wrong_Weapon_C",
          componentName: "WeaponMesh3P",
          componentClassPath: TIGR_WEAPON.componentClassPath,
          sourceMeshPath: TIGR_WEAPON.sourceMeshPath,
        }],
        pitchMembers: [],
        yawAnchor: null,
        pitchAnchor: null,
      },
    }),
    /Exact visual attachment yaw member drifted/u,
  );
});

test("identical UH-60 door-gun stations bind only their exact seat-owned hit component", () => {
  const doorGunPlacement = (id, actor, translation) => placement({
    id,
    name: "WeaponMesh3P",
    actor,
    sourceMeshPath:
      "/Game/Vehicles/UH60M/Weapons/M240H_Doorgun/M240H_Doorgun.M240H_Doorgun",
    translation,
  });
  const leftPlacement = doorGunPlacement(
    "uh60-door-left",
    "BP_M240H_DoorGun_C_0",
    [1.895, 1.493, -1.456],
  );
  const rightPlacement = doorGunPlacement(
    "uh60-door-right",
    "BP_M240H_DoorGun_C_1",
    [1.863, 1.493, 1.457],
  );
  const attachment = (member, pivotCm) => ({
    state: "closed",
    closureMode: "visual-occurrence-membership",
    movementState: "observed",
    motion: driverMotion({
      driverMode: "combined-updated-component",
      yawTranslationCm: pivotCm,
      pitchTranslationCm: pivotCm,
    }),
    yawMembers: [{
      stableOccurrenceId: member.stableOccurrenceId,
      actorClassName: member.actor,
      componentName: member.name,
      componentClassPath: member.componentClassPath,
      sourceMeshPath: member.sourceMeshPath,
    }],
    pitchMembers: [{
      stableOccurrenceId: member.stableOccurrenceId,
      actorClassName: member.actor,
      componentName: member.name,
      componentClassPath: member.componentClassPath,
      sourceMeshPath: member.sourceMeshPath,
    }],
    yawAnchor: null,
    pitchAnchor: null,
  });
  const resolveDoorGun = (member, hitOwnerSeatIndex, pivotCm) =>
    resolveRuntimeTurretAssembly({
      placements: [leftPlacement, rightPlacement],
      vehicleGeneratedClass: "/Game/Vehicles/UH60M/BP_UH60.BP_UH60_C",
      turretName: "BP_M240H_Doorgun_Turret_C",
      stationWeaponNames: ["BP_M240H_DoorGun"],
      primary: false,
      absorbsSiblingStations: false,
      hitOwnerSeatIndex,
      visualAttachment: attachment(member, pivotCm),
    });
  const leftAssembly = resolveDoorGun(leftPlacement, 1, [189.49, -145.57, 149.28]);
  const rightAssembly = resolveDoorGun(rightPlacement, 2, [186.30, 145.70, 149.28]);
  assert.ok(leftAssembly);
  assert.ok(rightAssembly);

  const components = [
    {
      componentPath:
        "/Game/RuntimeProbe/RuntimeProbeMap.RuntimeProbeMap:PersistentLevel.BP_UH60_C_0.CollisionArmorMesh",
      ownerIndex: 0,
    },
    {
      componentPath:
        "/Game/RuntimeProbe/RuntimeProbeMap.RuntimeProbeMap:PersistentLevel.BP_M240H_Doorgun_Turret_C_0.SQArmorMesh",
      ownerIndex: 1,
    },
    {
      componentPath:
        "/Game/RuntimeProbe/RuntimeProbeMap.RuntimeProbeMap:PersistentLevel.BP_M240H_Doorgun_Turret_C_1.SQArmorMesh",
      ownerIndex: 2,
    },
  ];
  const owners = [
    { seatIndex: null },
    { seatIndex: 1 },
    { seatIndex: 2 },
  ];
  const leftHitAssembly = resolveRuntimeTurretHitComponentAssembly({
    placements: [leftPlacement, rightPlacement],
    assembly: leftAssembly,
    components,
    owners,
  });
  const rightHitAssembly = resolveRuntimeTurretHitComponentAssembly({
    placements: [leftPlacement, rightPlacement],
    assembly: rightAssembly,
    components,
    owners,
  });
  assert.deepEqual(leftHitAssembly.yawComponentIndices, [1]);
  assert.deepEqual(leftHitAssembly.pitchComponentIndices, [1]);
  assert.deepEqual(rightHitAssembly.yawComponentIndices, [2]);
  assert.deepEqual(rightHitAssembly.pitchComponentIndices, [2]);
});

test("closed view-component rotation never invents a rendered turret assembly", () => {
  const visualAttachment = {
    state: "closed",
    closureMode: "view-component-rotation",
    movementState: "observed",
    motion: driverMotion(),
    yawMembers: [],
    pitchMembers: [],
    yawAnchor: null,
    pitchAnchor: null,
  };
  const assembly = resolveRuntimeTurretAssembly({
    placements: [TIGR_TURRET, TIGR_WEAPON],
    vehicleGeneratedClass: "/Game/Vehicles/LAV6/BP_LAV6.BP_LAV6_C",
    turretName: "BP_LAV_Commander_Periscope_C",
    stationWeaponNames: [],
    primary: false,
    visualAttachment,
  });
  assert.equal(assembly, null);

  const motionFrame = resolveRuntimeTurretMotionFrame(visualAttachment);
  assert.deepEqual(motionFrame?.yawPivot, [1, 3, 2]);
  assert.deepEqual(motionFrame?.pitchPivot, [4, 6, 5]);
  assert.deepEqual(motionFrame?.yawAxis, [0, 1, 0]);
  assert.deepEqual(motionFrame?.pitchAxis, [0, 0, 1]);
});

test("crew-seat projection joins an exact F2 view and occupant collision state", () => {
  const sourceVehicleRef = `vehicle-${"a".repeat(24)}`;
  const runtimeVehicleRef = `vehicle-${"b".repeat(64)}`;
  const generatedClass = "/Game/Test/BP_Test.BP_Test_C";
  const frame = {
    state: "derived",
    value: {
      translationCm: { x: 100, y: 20, z: 250 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      scale3D: { x: 1, y: 1, z: 1 },
    },
    reason: null,
  };
  const record = {
    schemaVersion: "sigua-vehicle-crew-seat/v1",
    sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
    sourceVehicleRef,
    runtimeVehicleRefs: [runtimeVehicleRef],
    catalogBindingRefs: ["catalog-vehicle-fixture"],
    rawName: "BP_Test",
    targetPackage: "/Game/Test/BP_Test",
    generatedClass,
    evidence: {
      state: "derived-static-native",
      sourceDataRevision: "c".repeat(64),
      constructionPose: "reference",
      runtimeAnimationPose: "native-unknown",
      dedicatedServerParity: "native-unknown",
    },
    seats: [{
      seatKey: `${sourceVehicleRef}:catalog-seat:2`,
      catalogSeatIndex: 2,
      additionalSeatConfigIndex: 0,
      role: "gunner",
      stationKind: "weapon-station",
      seatPawnClassPath: "/Game/Test/BP_TestTurret.BP_TestTurret_C",
      turretName: "BP_TestTurret_C",
      occupantBaseFrame: frame,
      config: {
        exposedSeat: false,
        seatAttachSocket: "socket_turret",
        soldierAttachSocket: "socket_gunner",
      },
      occupantStates: [{
        stateIndex: 0,
        soldierSeatState: "Hidden",
        hitClassification: {
          userCategory: "protected",
          naturalPointHitEligibility: "collision-ineligible",
          soldierActorCollision: "disabled",
          absoluteInvulnerability: "not-claimed",
        },
        directRadialDamageEligibility: "disabled",
      }],
      views: [{
        viewId: "gunner-default",
        source: "seat-pawn-get-camera-component",
        componentName: "FirstPersonCamera",
        dynamicParent: {
          componentName: "GunAttachPoint",
          componentClassPath: "/Script/Engine.SceneComponent",
          socketName: null,
        },
        vehicleLocalFrame: frame,
        baseHorizontalFovDegrees: { state: "observed", value: 90 },
        magnificationLevels: [1, 4],
        formulaProjectedHorizontalFovDegrees: [],
      }],
    }],
  };
  const projected = projectCrewSeatBinding(
    record,
    {
      id: `crew-seat-${"a".repeat(24)}`,
      formatVersion: "sigua-vehicle-crew-seat/v1",
      sourceVehicleRef,
      recordUrl: `/data/vehicles/crew-seats/${sourceVehicleRef}.json`,
    },
    { rawName: "BP_Test", runtimeVehicleRef, generatedClass },
  );
  assert.ok(projected);
  assert.deepEqual(
    projected.seats[0].views[0].vehicleLocalFrame.value.translationCm,
    { x: 100, y: 20, z: 250 },
  );
  assert.equal(
    projected.seats[0].occupantStates[0].hitClassification.userCategory,
    "protected",
  );
  const drifted = structuredClone(record);
  drifted.seats[0].seatKey = `${sourceVehicleRef}:catalog-seat:3`;
  assert.throws(
    () => projectCrewSeatBinding(
      drifted,
      {
        id: `crew-seat-${"a".repeat(24)}`,
        formatVersion: "sigua-vehicle-crew-seat/v1",
        sourceVehicleRef,
        recordUrl: `/data/vehicles/crew-seats/${sourceVehicleRef}.json`,
      },
      { rawName: "BP_Test", runtimeVehicleRef, generatedClass },
    ),
    /crew seat/u,
  );
});
