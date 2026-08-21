// The filename is retained for import stability. Schema v2 contains observed
// runtime running-gear identities only; it never carries or applies planar offsets.
export const RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA =
  "runtime-physical-suspension-pose-index/v2" as const;

export interface RuntimePlanarSuspensionWheelPose {
  boneName: string;
}

export interface RuntimePlanarSuspensionPoseRecord {
  generatedClass: string;
  stableOccurrenceId: string;
  poseState: "runtime-observed-normal-time";
  sourceBuildId: "squad-editor-v10.5.0.621766.2374-ue5.7.4";
  currentVersionValidation: {
    state: "exact-class-sentinel-validated" | "representative-path-sentinel-only";
    sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
    summarySha256?: string;
  };
  wheelCount: number;
  wheels: RuntimePlanarSuspensionWheelPose[];
}

export interface RuntimePlanarSuspensionCoverageEntry {
  generatedClass: string;
  reason: string;
}

export interface RuntimePlanarSuspensionCoverageResult
  extends RuntimePlanarSuspensionCoverageEntry {
  status: "observed" | "not-applicable" | "unavailable";
}

interface RuntimePlanarSuspensionPoseCoverage {
  requestedGeneratedClassCount: number;
  resolvedGeneratedClassCount: number;
  observedGeneratedClassCount: number;
  notApplicableGeneratedClassCount: number;
  unavailableGeneratedClassCount: number;
  observed: RuntimePlanarSuspensionCoverageEntry[];
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
  return {
    boneName: stringValue(wheel.boneName, `${label}.boneName`),
  };
}

function parseRecord(value: unknown, label: string) {
  const record = objectValue(value, label);
  if (record.poseState !== "runtime-observed-normal-time") {
    throw new Error(`${label}.poseState is unsupported`);
  }
  if (record.sourceBuildId !== "squad-editor-v10.5.0.621766.2374-ue5.7.4") {
    throw new Error(`${label}.sourceBuildId is unsupported`);
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
  const validation = objectValue(
    record.currentVersionValidation,
    `${label}.currentVersionValidation`,
  );
  if (
    validation.state !== "exact-class-sentinel-validated" &&
    validation.state !== "representative-path-sentinel-only"
  ) {
    throw new Error(`${label}.currentVersionValidation.state is unsupported`);
  }
  if (validation.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e") {
    throw new Error(`${label}.currentVersionValidation.sourceBuildId is unsupported`);
  }
  const summarySha256 = validation.summarySha256;
  const validationState = validation.state as
    | "exact-class-sentinel-validated"
    | "representative-path-sentinel-only";
  if (
    summarySha256 !== undefined &&
    (typeof summarySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(summarySha256))
  ) {
    throw new Error(`${label}.currentVersionValidation.summarySha256 is invalid`);
  }
  return {
    generatedClass: stringValue(record.generatedClass, `${label}.generatedClass`),
    stableOccurrenceId: stringValue(
      record.stableOccurrenceId,
      `${label}.stableOccurrenceId`,
    ),
    poseState: "runtime-observed-normal-time" as const,
    sourceBuildId: stringValue(record.sourceBuildId, `${label}.sourceBuildId`) as "squad-editor-v10.5.0.621766.2374-ue5.7.4",
    currentVersionValidation: {
      state: validationState,
      sourceBuildId: stringValue(
        validation.sourceBuildId,
        `${label}.currentVersionValidation.sourceBuildId`,
      ) as "squad-sdk-v10.5.3-17c100ea5182370e",
      ...(summarySha256 ? { summarySha256 } : {}),
    },
    wheelCount,
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
    !Array.isArray(coverageValue.observed) ||
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
    observedGeneratedClassCount: countValue(
      coverageValue.observedGeneratedClassCount,
      "coverage.observedGeneratedClassCount",
    ),
    notApplicableGeneratedClassCount: countValue(
      coverageValue.notApplicableGeneratedClassCount,
      "coverage.notApplicableGeneratedClassCount",
    ),
    unavailableGeneratedClassCount: countValue(
      coverageValue.unavailableGeneratedClassCount,
      "coverage.unavailableGeneratedClassCount",
    ),
    observed: coverageValue.observed.map((entry, entryIndex) =>
      parseCoverageEntry(entry, `coverage.observed[${entryIndex}]`),
    ),
    notApplicable: coverageValue.notApplicable.map((entry, entryIndex) =>
      parseCoverageEntry(entry, `coverage.notApplicable[${entryIndex}]`),
    ),
    unavailable: coverageValue.unavailable.map((entry, entryIndex) =>
      parseCoverageEntry(entry, `coverage.unavailable[${entryIndex}]`),
    ),
  };
  if (
    coverage.observed.length !== coverage.observedGeneratedClassCount ||
    coverage.notApplicable.length !==
      coverage.notApplicableGeneratedClassCount ||
    coverage.unavailable.length !== coverage.unavailableGeneratedClassCount ||
    coverage.requestedGeneratedClassCount !==
      coverage.resolvedGeneratedClassCount +
        coverage.observedGeneratedClassCount +
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
  records: readonly RuntimePlanarSuspensionPoseRecord[],
  generatedClass: string | null,
  stableOccurrenceId: string,
) {
  if (!generatedClass) return null;
  return (
    records.find(
      (record) =>
        record.generatedClass === generatedClass &&
        record.stableOccurrenceId === stableOccurrenceId,
    ) ?? null
  );
}

export function runtimePlanarSuspensionCoverageForGeneratedClass(
  coverage: RuntimePlanarSuspensionCoverageResult | null,
  generatedClass: string | null,
): RuntimePlanarSuspensionCoverageResult | null {
  if (!coverage || !generatedClass) return null;
  return coverage.generatedClass === generatedClass ? coverage : null;
}
