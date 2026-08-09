import { loadWikiDataset } from "../lib/wiki-source.ts";

export const RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA =
  "runtime-planar-suspension-pose-index/v1" as const;

export interface RuntimePlanarSuspensionWheelPose {
  boneName: string;
  localTranslationOffsetGltfM: [number, number, number];
  contactState: string;
  clamped: boolean;
}

export interface RuntimePlanarSuspensionPoseRecord {
  generatedClass: string;
  stableOccurrenceId: string;
  poseState: "native-planar-reconstructed";
  wheelCount: number;
  maxAbsContactResidualCm: number;
  wheels: RuntimePlanarSuspensionWheelPose[];
}

export interface RuntimePlanarSuspensionCoverageEntry {
  generatedClass: string;
  reason: string;
}

export interface RuntimePlanarSuspensionCoverageResult
  extends RuntimePlanarSuspensionCoverageEntry {
  status: "not-applicable" | "unavailable";
}

interface RuntimePlanarSuspensionPoseCoverage {
  requestedGeneratedClassCount: number;
  resolvedGeneratedClassCount: number;
  notApplicableGeneratedClassCount: number;
  unavailableGeneratedClassCount: number;
  notApplicable: RuntimePlanarSuspensionCoverageEntry[];
  unavailable: RuntimePlanarSuspensionCoverageEntry[];
}

export interface RuntimePlanarSuspensionPoseIndex {
  schemaVersion: typeof RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA;
  coverage: RuntimePlanarSuspensionPoseCoverage;
  recordCount: number;
  records: RuntimePlanarSuspensionPoseRecord[];
}

function objectValue(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function countValue(value: unknown, label: string) {
  const count = finiteNumber(value, label);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return count;
}

function parseCoverageEntry(value: unknown, label: string) {
  const entry = objectValue(value, label);
  return {
    generatedClass: stringValue(entry.generatedClass, `${label}.generatedClass`),
    reason: stringValue(entry.reason, `${label}.reason`),
  };
}

function parseWheel(value: unknown, label: string) {
  const wheel = objectValue(value, label);
  if (
    !Array.isArray(wheel.localTranslationOffsetGltfM) ||
    wheel.localTranslationOffsetGltfM.length !== 3
  ) {
    throw new Error(`${label}.localTranslationOffsetGltfM must contain three numbers`);
  }
  const offset = wheel.localTranslationOffsetGltfM.map((component, index) =>
    finiteNumber(component, `${label}.localTranslationOffsetGltfM[${index}]`),
  ) as [number, number, number];
  if (typeof wheel.clamped !== "boolean") {
    throw new Error(`${label}.clamped must be a boolean`);
  }
  return {
    boneName: stringValue(wheel.boneName, `${label}.boneName`),
    localTranslationOffsetGltfM: offset,
    contactState: stringValue(wheel.contactState, `${label}.contactState`),
    clamped: wheel.clamped,
  };
}

function parseRecord(value: unknown, label: string) {
  const record = objectValue(value, label);
  if (record.poseState !== "native-planar-reconstructed") {
    throw new Error(`${label}.poseState is unsupported`);
  }
  if (!Array.isArray(record.wheels)) {
    throw new Error(`${label}.wheels must be an array`);
  }
  const wheels = record.wheels.map((wheel, index) =>
    parseWheel(wheel, `${label}.wheels[${index}]`),
  );
  const wheelCount = countValue(record.wheelCount, `${label}.wheelCount`);
  if (wheelCount !== wheels.length) {
    throw new Error(`${label}.wheelCount does not match wheels`);
  }
  if (new Set(wheels.map(({ boneName }) => boneName)).size !== wheels.length) {
    throw new Error(`${label} repeats a wheel bone`);
  }
  return {
    generatedClass: stringValue(record.generatedClass, `${label}.generatedClass`),
    stableOccurrenceId: stringValue(
      record.stableOccurrenceId,
      `${label}.stableOccurrenceId`,
    ),
    poseState: "native-planar-reconstructed" as const,
    wheelCount,
    maxAbsContactResidualCm: finiteNumber(
      record.maxAbsContactResidualCm,
      `${label}.maxAbsContactResidualCm`,
    ),
    wheels,
  };
}

export function parseRuntimePlanarSuspensionPoseIndex(
  value: unknown,
): RuntimePlanarSuspensionPoseIndex {
  const index = objectValue(value, "runtime planar suspension index");
  if (index.schemaVersion !== RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA) {
    throw new Error(`Unsupported suspension schema ${String(index.schemaVersion)}`);
  }
  if (!Array.isArray(index.records)) {
    throw new Error("records must be an array");
  }
  const records = index.records.map((record, recordIndex) =>
    parseRecord(record, `records[${recordIndex}]`),
  );
  const recordCount = countValue(index.recordCount, "recordCount");
  if (recordCount !== records.length) {
    throw new Error("recordCount does not match records");
  }
  const identities = records.map(
    ({ generatedClass, stableOccurrenceId }) =>
      `${generatedClass}\u0000${stableOccurrenceId}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new Error("Duplicate runtime planar suspension identity");
  }

  const coverageValue = objectValue(index.coverage, "coverage");
  if (
    !Array.isArray(coverageValue.notApplicable) ||
    !Array.isArray(coverageValue.unavailable)
  ) {
    throw new Error("coverage lists must be arrays");
  }
  const coverage = {
    requestedGeneratedClassCount: countValue(
      coverageValue.requestedGeneratedClassCount,
      "coverage.requestedGeneratedClassCount",
    ),
    resolvedGeneratedClassCount: countValue(
      coverageValue.resolvedGeneratedClassCount,
      "coverage.resolvedGeneratedClassCount",
    ),
    notApplicableGeneratedClassCount: countValue(
      coverageValue.notApplicableGeneratedClassCount,
      "coverage.notApplicableGeneratedClassCount",
    ),
    unavailableGeneratedClassCount: countValue(
      coverageValue.unavailableGeneratedClassCount,
      "coverage.unavailableGeneratedClassCount",
    ),
    notApplicable: coverageValue.notApplicable.map((entry, entryIndex) =>
      parseCoverageEntry(entry, `coverage.notApplicable[${entryIndex}]`),
    ),
    unavailable: coverageValue.unavailable.map((entry, entryIndex) =>
      parseCoverageEntry(entry, `coverage.unavailable[${entryIndex}]`),
    ),
  };
  if (
    coverage.notApplicable.length !==
      coverage.notApplicableGeneratedClassCount ||
    coverage.unavailable.length !== coverage.unavailableGeneratedClassCount ||
    coverage.requestedGeneratedClassCount !==
      coverage.resolvedGeneratedClassCount +
        coverage.notApplicableGeneratedClassCount +
        coverage.unavailableGeneratedClassCount
  ) {
    throw new Error("coverage counts are inconsistent");
  }

  return {
    schemaVersion: RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA,
    coverage,
    recordCount,
    records,
  };
}

export const runtimePlanarSuspensionPoseIndex =
  parseRuntimePlanarSuspensionPoseIndex(
    await loadWikiDataset(
      "/data/vehicles/suspension-poses.json",
      RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA,
    ),
  );

export function runtimePlanarSuspensionPoseForOccurrence(
  index: RuntimePlanarSuspensionPoseIndex,
  generatedClass: string | null,
  stableOccurrenceId: string,
) {
  if (!generatedClass) return null;
  return (
    index.records.find(
      (record) =>
        record.generatedClass === generatedClass &&
        record.stableOccurrenceId === stableOccurrenceId,
    ) ?? null
  );
}

export function runtimePlanarSuspensionPoseForVisualOccurrence(
  generatedClass: string | null,
  stableOccurrenceId: string,
) {
  return runtimePlanarSuspensionPoseForOccurrence(
    runtimePlanarSuspensionPoseIndex,
    generatedClass,
    stableOccurrenceId,
  );
}

export function runtimePlanarSuspensionCoverageForGeneratedClass(
  generatedClass: string | null,
): RuntimePlanarSuspensionCoverageResult | null {
  if (!generatedClass) return null;
  const notApplicable =
    runtimePlanarSuspensionPoseIndex.coverage.notApplicable.find(
      (entry) => entry.generatedClass === generatedClass,
    );
  if (notApplicable) return { status: "not-applicable", ...notApplicable };
  const unavailable = runtimePlanarSuspensionPoseIndex.coverage.unavailable.find(
    (entry) => entry.generatedClass === generatedClass,
  );
  return unavailable ? { status: "unavailable", ...unavailable } : null;
}

export function runtimePlanarSuspensionOffsetsByBoneName(
  record: RuntimePlanarSuspensionPoseRecord,
) {
  return Object.fromEntries(
    record.wheels.map((wheel) => [
      wheel.boneName,
      {
        x: wheel.localTranslationOffsetGltfM[0],
        y: wheel.localTranslationOffsetGltfM[1],
        z: wheel.localTranslationOffsetGltfM[2],
      },
    ]),
  );
}
