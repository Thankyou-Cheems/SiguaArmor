import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  parseRuntimePlanarSuspensionPoseIndex,
  runtimePlanarSuspensionCoverageForGeneratedClass,
  runtimePlanarSuspensionPoseIndex,
  runtimePlanarSuspensionOffsetsByBoneName,
  runtimePlanarSuspensionPoseForOccurrence,
  runtimePlanarSuspensionPoseForVisualOccurrence,
} from "../../app/runtime-planar-suspension-pose.ts";

const vectorPath = new URL(
  "../fixtures/t64-planar-native-suspension-test-vector.json",
  import.meta.url,
);

function checkpointFromT64Vector() {
  const vector = JSON.parse(fs.readFileSync(vectorPath, "utf8"));
  const stableOccurrenceId =
    "occurrence-db898447eae1a657061719c9ff876aa9eb2921a0fb06d993fca87cae7aad6d55";
  const record = {
    generatedClass: vector.generatedClass,
    stableOccurrenceId,
    poseState: "native-planar-reconstructed",
    wheelCount: vector.wheels.length,
    maxAbsContactResidualCm: Math.max(
      ...vector.wheels
        .filter((wheel) => wheel.contactResidualCm !== null)
        .map((wheel) => Math.abs(wheel.contactResidualCm)),
    ),
    wheels: vector.wheels.map((wheel) => ({
      boneName: wheel.sourceBone,
      localTranslationOffsetGltfM: vector.method.localAxisGltf.map(
        (component) => (component * wheel.offsetCm) / 100,
      ),
      contactState: wheel.clamped ? "clamped" : "plane-contact",
      clamped: wheel.clamped,
    })),
  };
  return {
    schemaVersion: "runtime-planar-suspension-pose-index/v1",
    coverage: {
      requestedGeneratedClassCount: 1,
      resolvedGeneratedClassCount: 1,
      notApplicableGeneratedClassCount: 0,
      unavailableGeneratedClassCount: 0,
      notApplicable: [],
      unavailable: [],
    },
    recordCount: 1,
    records: [record],
  };
}

test("T-64 native planar checkpoint resolves by exact class and occurrence", () => {
  const index = parseRuntimePlanarSuspensionPoseIndex(
    checkpointFromT64Vector(),
  );
  const record = runtimePlanarSuspensionPoseForOccurrence(
    index,
    "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C",
    "occurrence-db898447eae1a657061719c9ff876aa9eb2921a0fb06d993fca87cae7aad6d55",
  );
  assert.ok(record);
  assert.equal(record.wheelCount, 16);
  assert.equal(
    record.wheels.filter(
      ({ localTranslationOffsetGltfM: [x, y, z] }) =>
        x !== 0 || y !== 0 || z !== 0,
    ).length,
    12,
  );
  assert.equal(
    runtimePlanarSuspensionPoseForOccurrence(
      index,
      "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C",
      "wrong-occurrence",
    ),
    null,
  );
});

test("SiguaWiki index exposes 12 exact nonzero native T-64 wheel offsets", () => {
  assert.ok(runtimePlanarSuspensionPoseIndex.recordCount > 1);
  const record = runtimePlanarSuspensionPoseForVisualOccurrence(
    "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C",
    "occurrence-db898447eae1a657061719c9ff876aa9eb2921a0fb06d993fca87cae7aad6d55",
  );
  assert.ok(record);
  assert.equal(record.poseState, "native-planar-reconstructed");
  assert.equal(record.wheelCount, 16);
  assert.equal(
    record.wheels.filter(
      ({ localTranslationOffsetGltfM: [x, y, z] }) =>
        x !== 0 || y !== 0 || z !== 0,
    ).length,
    12,
  );
  assert.ok(record.maxAbsContactResidualCm < 1e-9);
});

test("T-64 native planar offsets use GLTF local meters and keep end wheels static", () => {
  const [record] = parseRuntimePlanarSuspensionPoseIndex(
    checkpointFromT64Vector(),
  ).records;
  const offsets = runtimePlanarSuspensionOffsetsByBoneName(record);
  assert.ok(Object.values(offsets.wheel_L1).every((value) => value === 0));
  assert.ok(Object.values(offsets.wheel_R8).every((value) => value === 0));
  assert.ok(offsets.wheel_L2.y < 0);
  assert.ok(offsets.wheel_L7.y > 0);
  assert.equal(
    Object.values(offsets).filter(
      ({ x, y, z }) => x !== 0 || y !== 0 || z !== 0,
    ).length,
    12,
  );
});

test("fleet coverage distinguishes explicit not-applicable from fail-closed fallback", () => {
  assert.deepEqual(
    runtimePlanarSuspensionCoverageForGeneratedClass(
      "/Game/Vehicles/RHIB/BP_RHIB_US_M2.BP_RHIB_US_M2_C",
    ),
    {
      status: "not-applicable",
      generatedClass:
        "/Game/Vehicles/RHIB/BP_RHIB_US_M2.BP_RHIB_US_M2_C",
      reason: "explicit-fake-physics-probes-no-visual-suspension",
    },
  );
  assert.deepEqual(
    runtimePlanarSuspensionCoverageForGeneratedClass(
      "/Game/Vehicles/Minsk_motorbike/BP_minsk.BP_minsk_C",
    ),
    {
      status: "unavailable",
      generatedClass:
        "/Game/Vehicles/Minsk_motorbike/BP_minsk.BP_minsk_C",
      reason: "configured-bone-missing-from-exact-release-skeleton",
    },
  );
  assert.equal(
    runtimePlanarSuspensionCoverageForGeneratedClass(
      "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C",
    ),
    null,
  );
});

test("planar index rejects duplicate exact identities and malformed offsets", () => {
  const duplicate = checkpointFromT64Vector();
  duplicate.records.push(structuredClone(duplicate.records[0]));
  duplicate.recordCount = duplicate.records.length;
  assert.throws(
    () => parseRuntimePlanarSuspensionPoseIndex(duplicate),
    /Duplicate runtime planar suspension identity/,
  );

  const malformed = checkpointFromT64Vector();
  malformed.records[0].wheels[0].localTranslationOffsetGltfM = [0, 0];
  assert.throws(
    () => parseRuntimePlanarSuspensionPoseIndex(malformed),
    /must contain three numbers/,
  );
});
