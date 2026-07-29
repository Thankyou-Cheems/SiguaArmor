import runtimePlanarSuspensionPoseIndexJson from "./runtime-suspension-pose-index.json" with { type: "json" };

export const RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA =
  "runtime-planar-suspension-pose-index/v1" as const;

export type RuntimePlanarSuspensionPoseState =
  "native-planar-reconstructed";

export interface RuntimePlanarSuspensionWheelPose {
  boneName: string;
  localTranslationOffsetGltfM: [number, number, number];
  contactState: string;
  clamped: boolean;
}

export interface RuntimePlanarSuspensionPoseRecord {
  generatedClass: string;
  stableOccurrenceId: string;
  poseState: RuntimePlanarSuspensionPoseState;
  wheelCount: number;
  maxAbsContactResidualCm: number;
  wheels: RuntimePlanarSuspensionWheelPose[];
}

interface RuntimePlanarSuspensionPoseIndexSource {
  method: "odk-native-planar-sweep-reconstruction/v1";
  sourceMap: string;
  sourceBuildId: string;
  odkDllSha256: string;
  chassisPoseRecordsSha256: string;
  visualIndexSha256: string;
  evidenceLogicalPath: string;
  evidenceSha256: string;
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
  source: RuntimePlanarSuspensionPoseIndexSource;
  coverage: RuntimePlanarSuspensionPoseCoverage;
  recordCount: number;
  recordsSha256: string;
  records: RuntimePlanarSuspensionPoseRecord[];
}

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSha256(value: unknown, label: string) {
  const stringValue = requireString(value, label);
  if (!/^[0-9a-f]{64}$/u.test(stringValue)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return stringValue;
}

function requireFinite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string) {
  const numberValue = requireFinite(value, label);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return numberValue;
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function requireGeneratedClass(value: unknown, label: string) {
  const generatedClass = requireString(value, label);
  if (
    !generatedClass.startsWith("/Game/") ||
    !generatedClass.includes(".") ||
    generatedClass.length > 512
  ) {
    throw new Error(`${label} must be an exact generated class`);
  }
  return generatedClass;
}

function requireReasonCode(value: unknown, label: string) {
  const reason = requireString(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(reason)) {
    throw new Error(`${label} must be a sanitized reason code`);
  }
  return reason;
}

function requireFiniteTuple3(
  value: unknown,
  label: string,
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must contain exactly three numbers`);
  }
  return [
    requireFinite(value[0], `${label}[0]`),
    requireFinite(value[1], `${label}[1]`),
    requireFinite(value[2], `${label}[2]`),
  ];
}

function parseWheel(
  value: unknown,
  label: string,
): RuntimePlanarSuspensionWheelPose {
  const object = requireObject(value, label);
  return {
    boneName: requireString(object.boneName, `${label}.boneName`),
    localTranslationOffsetGltfM: requireFiniteTuple3(
      object.localTranslationOffsetGltfM,
      `${label}.localTranslationOffsetGltfM`,
    ),
    contactState: requireString(object.contactState, `${label}.contactState`),
    clamped: requireBoolean(object.clamped, `${label}.clamped`),
  };
}

function parseRecord(
  value: unknown,
  label: string,
): RuntimePlanarSuspensionPoseRecord {
  const object = requireObject(value, label);
  if (!Array.isArray(object.wheels)) {
    throw new Error(`${label}.wheels must be an array`);
  }
  const wheels = object.wheels.map((wheel, index) =>
    parseWheel(wheel, `${label}.wheels[${index}]`),
  );
  const wheelCount = requireNonNegativeInteger(
    object.wheelCount,
    `${label}.wheelCount`,
  );
  if (wheelCount !== wheels.length) {
    throw new Error(
      `${label}.wheelCount ${wheelCount} does not match ${wheels.length} wheels`,
    );
  }
  const boneNames = new Set<string>();
  for (const wheel of wheels) {
    if (boneNames.has(wheel.boneName)) {
      throw new Error(`${label} repeats wheel bone ${wheel.boneName}`);
    }
    boneNames.add(wheel.boneName);
  }
  if (object.poseState !== "native-planar-reconstructed") {
    throw new Error(`${label}.poseState is not native-planar-reconstructed`);
  }
  return {
    generatedClass: requireGeneratedClass(
      object.generatedClass,
      `${label}.generatedClass`,
    ),
    stableOccurrenceId: requireString(
      object.stableOccurrenceId,
      `${label}.stableOccurrenceId`,
    ),
    poseState: "native-planar-reconstructed",
    wheelCount,
    maxAbsContactResidualCm: requireFinite(
      object.maxAbsContactResidualCm,
      `${label}.maxAbsContactResidualCm`,
    ),
    wheels,
  };
}

export function parseRuntimePlanarSuspensionPoseIndex(
  value: unknown,
): RuntimePlanarSuspensionPoseIndex {
  const object = requireObject(value, "runtime planar suspension index");
  if (object.schemaVersion !== RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA) {
    throw new Error(
      `Unsupported runtime planar suspension schema ${String(object.schemaVersion)}`,
    );
  }
  const sourceObject = requireObject(object.source, "source");
  if (
    sourceObject.method !== "odk-native-planar-sweep-reconstruction/v1"
  ) {
    throw new Error(`Unsupported suspension method ${String(sourceObject.method)}`);
  }
  const coverageObject = requireObject(object.coverage, "coverage");
  if (!Array.isArray(coverageObject.notApplicable)) {
    throw new Error("coverage.notApplicable must be an array");
  }
  if (!Array.isArray(coverageObject.unavailable)) {
    throw new Error("coverage.unavailable must be an array");
  }
  if (!Array.isArray(object.records)) {
    throw new Error("records must be an array");
  }
  const records = object.records.map((record, index) =>
    parseRecord(record, `records[${index}]`),
  );
  const recordCount = requireNonNegativeInteger(
    object.recordCount,
    "recordCount",
  );
  if (recordCount !== records.length) {
    throw new Error(
      `recordCount ${recordCount} does not match ${records.length} records`,
    );
  }
  const requestedGeneratedClassCount = requireNonNegativeInteger(
    coverageObject.requestedGeneratedClassCount,
    "coverage.requestedGeneratedClassCount",
  );
  const resolvedGeneratedClassCount = requireNonNegativeInteger(
    coverageObject.resolvedGeneratedClassCount,
    "coverage.resolvedGeneratedClassCount",
  );
  const notApplicableGeneratedClassCount = requireNonNegativeInteger(
    coverageObject.notApplicableGeneratedClassCount,
    "coverage.notApplicableGeneratedClassCount",
  );
  const unavailableGeneratedClassCount = requireNonNegativeInteger(
    coverageObject.unavailableGeneratedClassCount,
    "coverage.unavailableGeneratedClassCount",
  );
  if (
    requestedGeneratedClassCount !==
    resolvedGeneratedClassCount +
      notApplicableGeneratedClassCount +
      unavailableGeneratedClassCount
  ) {
    throw new Error("coverage counts do not close to requestedGeneratedClassCount");
  }
  if (
    coverageObject.notApplicable.length !== notApplicableGeneratedClassCount
  ) {
    throw new Error(
      "coverage.notApplicable length does not match notApplicableGeneratedClassCount",
    );
  }
  if (
    coverageObject.unavailable.length !== unavailableGeneratedClassCount
  ) {
    throw new Error(
      "coverage.unavailable length does not match unavailableGeneratedClassCount",
    );
  }
  const identities = new Set<string>();
  for (const record of records) {
    const identity = `${record.generatedClass}\u0000${record.stableOccurrenceId}`;
    if (identities.has(identity)) {
      throw new Error(
        `Duplicate runtime planar suspension identity ${record.generatedClass} / ${record.stableOccurrenceId}`,
      );
    }
    identities.add(identity);
  }
  const parseCoverageEntry = (
    entry: unknown,
    label: string,
  ): RuntimePlanarSuspensionCoverageEntry => {
    const coverageEntry = requireObject(entry, label);
    return {
      generatedClass: requireGeneratedClass(
        coverageEntry.generatedClass,
        `${label}.generatedClass`,
      ),
      reason: requireReasonCode(coverageEntry.reason, `${label}.reason`),
    };
  };
  return {
    schemaVersion: RUNTIME_PLANAR_SUSPENSION_POSE_SCHEMA,
    source: {
      method: "odk-native-planar-sweep-reconstruction/v1",
      sourceMap: requireString(sourceObject.sourceMap, "source.sourceMap"),
      sourceBuildId: requireString(
        sourceObject.sourceBuildId,
        "source.sourceBuildId",
      ),
      odkDllSha256: requireSha256(
        sourceObject.odkDllSha256,
        "source.odkDllSha256",
      ),
      chassisPoseRecordsSha256: requireSha256(
        sourceObject.chassisPoseRecordsSha256,
        "source.chassisPoseRecordsSha256",
      ),
      visualIndexSha256: requireSha256(
        sourceObject.visualIndexSha256,
        "source.visualIndexSha256",
      ),
      evidenceLogicalPath: requireString(
        sourceObject.evidenceLogicalPath,
        "source.evidenceLogicalPath",
      ),
      evidenceSha256: requireSha256(
        sourceObject.evidenceSha256,
        "source.evidenceSha256",
      ),
    },
    coverage: {
      requestedGeneratedClassCount,
      resolvedGeneratedClassCount,
      notApplicableGeneratedClassCount,
      unavailableGeneratedClassCount,
      notApplicable: coverageObject.notApplicable.map((entry, index) =>
        parseCoverageEntry(entry, `coverage.notApplicable[${index}]`),
      ),
      unavailable: coverageObject.unavailable.map((entry, index) =>
        parseCoverageEntry(entry, `coverage.unavailable[${index}]`),
      ),
    },
    recordCount,
    recordsSha256: requireSha256(object.recordsSha256, "recordsSha256"),
    records,
  };
}

export const runtimePlanarSuspensionPoseIndex =
  parseRuntimePlanarSuspensionPoseIndex(runtimePlanarSuspensionPoseIndexJson);

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
  if (notApplicable) {
    return { status: "not-applicable", ...notApplicable };
  }
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
