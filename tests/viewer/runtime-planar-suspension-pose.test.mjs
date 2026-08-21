import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRuntimePlanarSuspensionPoseIndex,
  runtimePlanarSuspensionCoverageForGeneratedClass,
  runtimePlanarSuspensionPoseForOccurrence,
  runtimePlanarSuspensionPoseForVisualOccurrence,
} from "../../app/runtime-planar-suspension-pose.ts";

const GENERATED_CLASS =
  "/Game/Vehicles/T64_BM2/BP_T64BM2_Cage.BP_T64BM2_Cage_C";
const STABLE_OCCURRENCE_ID =
  "occurrence-db898447eae1a657061719c9ff876aa9eb2921a0fb06d993fca87cae7aad6d55";

function observedIndex() {
  const record = {
    generatedClass: GENERATED_CLASS,
    stableOccurrenceId: STABLE_OCCURRENCE_ID,
    poseState: "runtime-observed-normal-time",
    sourceBuildId: "squad-editor-v10.5.0.621766.2374-ue5.7.4",
    currentVersionValidation: {
      state: "representative-path-sentinel-only",
      sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
    },
    wheelCount: 16,
    wheels: Array.from({ length: 16 }, (_, index) => ({
      boneName: `wheel_${index < 8 ? "L" : "R"}${index % 8 + 1}`,
    })),
  };
  return {
    schemaVersion: "runtime-physical-suspension-pose-index/v2",
    coverage: {
      requestedGeneratedClassCount: 1,
      resolvedGeneratedClassCount: 0,
      observedGeneratedClassCount: 1,
      notApplicableGeneratedClassCount: 0,
      unavailableGeneratedClassCount: 0,
      observed: [{
        generatedClass: GENERATED_CLASS,
        reason: "runtime-observed-normal-time-visual-authority",
      }],
      notApplicable: [],
      unavailable: [],
    },
    recordCount: 1,
    records: [record],
  };
}

test("observed running-gear record resolves by exact class and occurrence", () => {
  const index = parseRuntimePlanarSuspensionPoseIndex(observedIndex());
  const record = runtimePlanarSuspensionPoseForOccurrence(
    index,
    GENERATED_CLASS,
    STABLE_OCCURRENCE_ID,
  );
  assert.ok(record);
  assert.equal(record.poseState, "runtime-observed-normal-time");
  assert.equal(record.wheelCount, 16);
  assert.equal(
    runtimePlanarSuspensionPoseForOccurrence(index, GENERATED_CLASS, "wrong"),
    null,
  );
  assert.equal(
    runtimePlanarSuspensionPoseForVisualOccurrence(
      index.records,
      GENERATED_CLASS,
      STABLE_OCCURRENCE_ID,
    )?.wheels[0].boneName,
    "wheel_L1",
  );
});

test("coverage distinguishes observed, not-applicable and unavailable", () => {
  for (const coverage of [
    { status: "observed", generatedClass: GENERATED_CLASS, reason: "runtime-observed-normal-time-visual-authority" },
    { status: "not-applicable", generatedClass: "/Game/Vehicles/RHIB/BP_RHIB_US_M2.BP_RHIB_US_M2_C", reason: "explicit-fake-physics-probes-no-visual-suspension" },
    { status: "unavailable", generatedClass: "/Game/Vehicles/Minsk_motorbike/BP_minsk.BP_minsk_C", reason: "configured-bone-missing-from-exact-release-skeleton" },
  ]) {
    assert.deepEqual(
      runtimePlanarSuspensionCoverageForGeneratedClass(
        coverage,
        coverage.generatedClass,
      ),
      coverage,
    );
  }
});

test("observed index rejects duplicate identities and malformed bone names", () => {
  const duplicate = observedIndex();
  duplicate.records.push(structuredClone(duplicate.records[0]));
  duplicate.recordCount = duplicate.records.length;
  assert.throws(
    () => parseRuntimePlanarSuspensionPoseIndex(duplicate),
    /Duplicate runtime planar suspension identity/,
  );

  const malformed = observedIndex();
  malformed.records[0].wheels[0].boneName = "";
  assert.throws(
    () => parseRuntimePlanarSuspensionPoseIndex(malformed),
    /must be a non-empty string/,
  );
});
