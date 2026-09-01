import assert from "node:assert/strict";
import test from "node:test";

import { compileVehicleGunnerSight } from "../../lib/vehicle-gunner-sight.ts";

const source = "vehicle-aaaaaaaaaaaaaaaaaaaaaaaa";
const stationId = `${source}:station:2`;
const projectionId = `gunner-sight-projection-${"b".repeat(24)}`;
const graph = {
  schemaVersion: "sigua-vehicle-station-graph/v1",
  sourceVehicleRef: source,
  sourceDataRevision: "c".repeat(64),
  stations: [{
    id: stationId,
    catalogSeatIndex: 2,
    seatPawnClassPath: "/Game/Test/BP_Turret.BP_Turret_C",
    equipmentRefs: ["vehicle-equipment-test"],
  }],
};

function fixture() {
  return {
    schemaVersion: "sigua-vehicle-gunner-sight/v1",
    sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
    sourceVehicleRef: source,
    sourceDataRevision: "d".repeat(64),
    stationGraphDataRevision: graph.sourceDataRevision,
    evidence: {
      state: "sdk-blueprint-static-projection-and-local-dynamic-binding",
      network: "out-of-scope",
      hitMechanics: "not-applicable-presentation-only",
      damageBlindnessMechanic: "not-claimed",
    },
    projectionRefs: [projectionId],
    projections: [{
      id: projectionId,
      assetUrl: `/assets/vehicle-gunner-sights/reticle-${"e".repeat(64)}.webp`,
      sha256: "f".repeat(64),
      pixelAbsoluteError: 0,
    }],
    stations: [{
      stationId,
      catalogSeatIndex: 2,
      seatPawnClassPath: graph.stations[0].seatPawnClassPath,
      equipmentRefs: ["vehicle-equipment-test"],
      state: "observed-static-presentation",
      overlayClassPath: "/Game/Test/W_Reticle.W_Reticle_C",
      widgetPackage: "/Game/Test/W_Reticle",
      layers: [{
        widgetName: "Tunnel",
        role: "viewport-screen",
        state: "observed-static-brush-resource",
        visibility: "Visible",
        projectionRef: projectionId,
      }],
      textLayers: [],
      defaultZoomStages: [{ zoomIndex: 0, projectionRef: projectionId }],
      weaponModes: [{
        equipmentRef: "vehicle-equipment-test",
        source: { routeKind: "EqualEqual_ClassClass-to-K2Node_Select" },
        zoomStages: [{ zoomIndex: 0, projectionRef: projectionId }],
      }],
      dynamicChannels: ["weapon-change", "zoom-change"],
      dynamicBindings: [],
    }],
  };
}

test("compiles gunner presentation only when its exact Station relation matches", () => {
  const compiled = compileVehicleGunnerSight(fixture(), graph);
  assert.equal(compiled.stations[0].stationId, stationId);
  assert.equal(compiled.projections[0].id, projectionId);
});

test("rejects a weapon mode copied to another Station equipment identity", () => {
  const record = fixture();
  record.stations[0].weaponModes[0].equipmentRef = "vehicle-equipment-foreign";
  assert.throws(
    () => compileVehicleGunnerSight(record, graph),
    /weapon mode is invalid/u,
  );
});

test("rejects activating the default-collapsed damage overlay", () => {
  const record = fixture();
  record.stations[0].layers = [{
    role: "damage-overlay",
    state: "excluded-default-collapsed-damage-layer",
    visibility: "Visible",
    projectionRef: projectionId,
  }];
  assert.throws(
    () => compileVehicleGunnerSight(record, graph),
    /enabled a damage overlay/u,
  );
});

test("accepts a source-proven dynamic widget with no static image layer", () => {
  const record = fixture();
  record.projectionRefs = [];
  record.projections = [];
  Object.assign(record.stations[0], {
    state: "observed-dynamic-presentation",
    absenceReason: null,
    layers: [],
    textLayers: [{ widgetName: "RotationText" }],
    defaultZoomStages: [],
    weaponModes: [],
    dynamicChannels: ["station-relative-yaw-degrees"],
    dynamicBindings: [{
      id: "text:RotationText:station-relative-yaw-degrees:K2Node_CallFunction_1",
      state: "observed-blueprint-property-route",
      semantic: "station-relative-yaw-degrees",
      targetWidgetName: "RotationText",
      property: "text",
      relatedSeatPawnClassPaths: [],
      valueModel: { kind: "station-angle-degrees" },
      source: {
        declaringClassPath: "/Game/Test/W_Reticle.W_Reticle_C",
        graphPath: "/Game/Test/W_Reticle.W_Reticle:EventGraph",
        setterNode: "K2Node_CallFunction_1",
        setterFunction: "SetText",
        contextFunctions: ["SetText"],
        contextVariables: ["RotationText"],
        inheritedDepth: 0,
        aliasNode: null,
      },
    }],
  });
  const compiled = compileVehicleGunnerSight(record, graph);
  assert.equal(
    compiled.stations[0].state,
    "observed-dynamic-presentation",
  );
});
