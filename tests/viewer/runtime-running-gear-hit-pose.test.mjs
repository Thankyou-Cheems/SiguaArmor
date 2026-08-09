import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4 } from "three";

import { resolveRuntimeRunningGearHitComponentPoses } from "../../lib/runtime-running-gear-hit-pose.ts";
import { runtimePlanarSuspensionPoseIndex } from "../../app/runtime-planar-suspension-pose.ts";

const ASLAV_GENERATED_CLASS =
  "/Game/Vehicles/ASLAV/BP_ASLAV.BP_ASLAV_C";
const ASLAV_WHEEL_COMPONENTS = [
  "SQVehicleWheel_R4",
  "SQVehicleWheel_L3",
  "SQVehicleWheel_L1",
  "SQVehicleWheel_L4",
  "SQVehicleWheel_R3",
  "SQVehicleWheel_R2",
  "SQVehicleWheel_R1",
  "SQVehicleWheel_L2",
];

test("ASLAV maps all eight exact wheel hit components to native-planar bones", () => {
  const record = runtimePlanarSuspensionPoseIndex.records.find(
    ({ generatedClass }) => generatedClass === ASLAV_GENERATED_CLASS,
  );
  assert.ok(record);
  assert.equal(record.wheelCount, 8);

  const components = ASLAV_WHEEL_COMPONENTS.map((name) => ({
    componentPath:
      `/Game/RuntimeProbe/RuntimeProbeMap.RuntimeProbeMap:` +
      `PersistentLevel.BP_ASLAV_C_0.${name}`,
    semanticKind: "wheel",
  }));
  components.push({
    componentPath:
      "/Game/RuntimeProbe/RuntimeProbeMap.RuntimeProbeMap:" +
      "PersistentLevel.BP_ASLAV_C_0.SQArmorMesh",
    semanticKind: "armor",
  });
  const bonePoses = record.wheels.map((wheel) => ({
    stableOccurrenceId: record.stableOccurrenceId,
    boneName: wheel.boneName,
    matrix: new Matrix4()
      .makeTranslation(...wheel.localTranslationOffsetGltfM)
      .toArray(),
  }));

  const resolution = resolveRuntimeRunningGearHitComponentPoses(
    components,
    bonePoses,
  );
  assert.equal(resolution.componentPoses.length, 8);
  assert.deepEqual(resolution.unmatchedComponentIndices, []);
  assert.deepEqual(resolution.ambiguousComponentIndices, []);
  assert.deepEqual(
    new Set(resolution.componentPoses.map(({ boneName }) => boneName)),
    new Set(record.wheels.map(({ boneName }) => boneName)),
  );
});

test("track geometry stays rigid and ambiguous wheel identities fail closed", () => {
  const identity = new Matrix4().toArray();
  const components = [
    {
      componentPath: "Vehicle.TrackLeftComponent",
      semanticKind: "track",
    },
    {
      componentPath: "Vehicle.SQVehicleWheel_L1",
      semanticKind: "wheel",
    },
  ];
  const resolution = resolveRuntimeRunningGearHitComponentPoses(components, [
    {
      stableOccurrenceId: "occurrence-a",
      boneName: "Wheel_L1",
      matrix: identity,
    },
    {
      stableOccurrenceId: "occurrence-b",
      boneName: "Wheel_L1",
      matrix: identity,
    },
  ]);

  assert.deepEqual(resolution.componentPoses, []);
  assert.deepEqual(resolution.unmatchedComponentIndices, []);
  assert.deepEqual(resolution.ambiguousComponentIndices, [1]);
});
