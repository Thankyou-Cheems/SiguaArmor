import assert from "node:assert/strict";
import test from "node:test";

import { compileVehicleStationGraph } from "../../lib/vehicle-station-graph.ts";

const REVISION = "a".repeat(64);
const SOURCE = "vehicle-0123456789abcdef01234567";
const RUNTIME = `vehicle-${"b".repeat(64)}`;

function transform(z = 200) {
  return {
    translationCm: { x: 0, y: 0, z },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale3D: { x: 1, y: 1, z: 1 },
  };
}

function graphFrame(z = 200) {
  return {
    state: "derived",
    value: transform(z),
    source: "fixture",
    reason: null,
    evidenceRefs: [],
  };
}

function crewFrame(z = 200) {
  return { state: "derived", value: transform(z), reason: null };
}

function seat(index) {
  return {
    stationId: `${SOURCE}:station:${index}`,
    seatKey: `${SOURCE}:catalog-seat:${index}`,
    catalogSeatIndex: index,
    additionalSeatConfigIndex: index - 2,
    role: index === 4 ? "gunner" : "machine-gunner",
    stationKind: "weapon-station",
    seatPawnClassPath: `/Game/Fixture/BP_F${index}.BP_F${index}_C`,
    turretName: `BP_F${index}_C`,
    occupantBaseFrame: crewFrame(200 + index),
    config: {
      exposedSeat: false,
      seatAttachSocket: "None",
      soldierAttachSocket: "None",
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
    views: [],
  };
}

function motionChannel(channel, z) {
  return {
    channel,
    state: "derived",
    driver: {
      componentName: channel === "yaw" ? "DefaultSceneRoot" : "GunAttachPoint",
      componentClassPath: "/Script/Engine.SceneComponent",
      sourceMeshPath: null,
    },
    stationLocalFrame: graphFrame(0),
    referenceFrame: graphFrame(z),
    sourceFunction: "USQTurretMovementComponent::SetCurrentRotation@0x18043ed50",
  };
}

function station(index, parentIndex = null) {
  const id = `${SOURCE}:station:${index}`;
  return {
    id,
    seatKey: `${SOURCE}:catalog-seat:${index}`,
    catalogSeatIndex: index,
    additionalSeatConfigIndex: index - 2,
    seatProfileRef: `seat-profile-${index}`,
    role: index === 4 ? "gunner" : "machine-gunner",
    stationKind: "weapon-station",
    seatPawnClassPath: `/Game/Fixture/BP_F${index}.BP_F${index}_C`,
    turretName: `BP_F${index}_C`,
    mount: {
      id: `${SOURCE}:mount:${index}`,
      childStationId: id,
      parent: parentIndex === null
        ? { kind: "vehicle-root", stationId: null, inheritedMotionChannels: [] }
        : {
            kind: "station",
            stationId: `${SOURCE}:station:${parentIndex}`,
            inheritedMotionChannels: ["yaw"],
          },
      parentComponent: null,
      socketName: null,
      referenceFrame: graphFrame(200 + index),
      parentRelativeFrame: parentIndex === null ? null : graphFrame(1),
      evidence: {
        state: "derived",
        source: "fixture",
        evidenceRefs: [],
        reason: null,
      },
    },
    motion: {
      driverMode: "split-yaw-pitch-components",
      control: null,
      yaw: motionChannel("yaw", 200 + index),
      pitch: motionChannel("pitch", 200 + index),
    },
    occupantMotion: {
      state: "derived-static-component-ancestry",
      channels: ["yaw"],
      attachmentComponent: {
        componentName: "YawRoot",
        componentClassPath: "/Script/Engine.SceneComponent",
      },
      source: "v10.5.3-get-soldier-attach-component-ancestry",
      reason: null,
    },
    occupantAttachment: {
      state: "derived-seat-pawn-component-ancestry",
      parent: {
        kind: "station-component",
        stationId: id,
        componentName: "YawRoot",
        componentClassPath: "/Script/Engine.SceneComponent",
        socketName: "socket_operator",
      },
      referenceFrame: graphFrame(200 + index),
      spatialMeaning: "runtime-soldier-attachment",
      source: "v10.5.3-get-soldier-attach-component-ancestry",
      sourcePackage: null,
      reason: null,
    },
    views: [],
    equipmentRefs: [],
    closure: {
      position: "closed",
      motion: "closed",
      view: "closed",
      visual: "closed",
      equipment: "closed",
      hit: "unresolved",
      reasons: [],
    },
  };
}

function fixtureRecord() {
  const stations = [station(4), station(5, 4)];
  return {
    schemaVersion: "sigua-vehicle-station-graph/v1",
    sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
    sourceDataRevision: REVISION,
    sourceVehicleRef: SOURCE,
    runtimeVehicleRefs: [RUNTIME],
    catalogBindingRefs: ["catalog-binding-fixture"],
    rawName: "BP_Fixture",
    targetPackage: "/Game/Fixture/BP_Fixture",
    generatedClass: "/Game/Fixture/BP_Fixture.BP_Fixture_C",
    coordinateSystem: {},
    evidence: {
      sourceDataRevision: REVISION,
      runtimeAnimationPose: "native-unknown",
      network: "out-of-scope",
      hitRelations: "unresolved-not-consumed-by-armor",
    },
    seats: [seat(4), seat(5)],
    stations,
    vehicleEquipmentRefs: [],
    visualBindings: [{
      catalogBindingRef: "catalog-binding-fixture",
      cardId: "fixture-card",
      rawName: "BP_Fixture",
      runtimeVehicleRef: RUNTIME,
      edition: "international",
      visualArtifactRef: "visual-artifact-fixture",
      occurrences: [],
      stationClosures: stations.map(({ id }) => ({
        stationId: id,
        state: "closed",
        closureMode: "view-component-rotation",
        reasons: [],
      })),
    }],
  };
}

const pointer = {
  id: `station-graph-${SOURCE.slice("vehicle-".length)}`,
  formatVersion: "sigua-vehicle-station-graph/v1",
  sourceVehicleRef: SOURCE,
  recordUrl: `/data/vehicles/station-graphs/${SOURCE}.json`,
};
const owner = {
  rawName: "BP_Fixture",
  runtimeVehicleRef: RUNTIME,
  generatedClass: "/Game/Fixture/BP_Fixture.BP_Fixture_C",
  cardId: "fixture-card",
  edition: "international",
  visualArtifactRef: "visual-artifact-fixture",
};

test("station graph compiles an arbitrary F5 parent without role inference", () => {
  const compiled = compileVehicleStationGraph(fixtureRecord(), pointer, owner, []);
  assert.ok(compiled);
  assert.equal(compiled.stations[1].catalogSeatIndex, 5);
  assert.equal(
    compiled.visualAttachment.stations[1].parentStationId,
    `${SOURCE}:station:4`,
  );
  assert.deepEqual(
    compiled.visualAttachment.stations[1].inheritedMotionChannels,
    ["yaw"],
  );
});

test("station graph fails closed on a parent cycle", () => {
  const record = fixtureRecord();
  record.stations[0].mount.parent = {
    kind: "station",
    stationId: `${SOURCE}:station:5`,
    inheritedMotionChannels: ["yaw"],
  };
  record.stations[0].mount.parentRelativeFrame = graphFrame(1);
  assert.throws(
    () => compileVehicleStationGraph(record, pointer, owner, []),
    /contains a cycle/u,
  );
});
