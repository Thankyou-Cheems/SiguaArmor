import chassisPoseIndexJson from "./runtime-chassis-pose-index.json";

export type RuntimeChassisPoseMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface RuntimeChassisPose {
  targetKey: string;
  generatedClass: string;
  rawName: string;
  promoEntryIds: string[];
  pitchDeg: number;
  rollDeg: number;
  heightAbovePlaneCm: number;
  gltfMatrix: RuntimeChassisPoseMatrix;
  captureSha256: string;
  captureEvidenceSha256: string;
  wheelCompressionState: "native-unknown";
}

interface RuntimeChassisPoseIndex {
  schemaVersion: "runtime-chassis-pose-preview-index/v1";
  source: {
    path: string;
    fileSha256: string;
    datasetSha256: string;
    generatedAt: string;
    sourceBuildId: string;
    sourceMap: "/Game/RuntimeProbe/RuntimeProbeMap";
    pieNetworkMode: "standalone";
    spawnRoute: string;
  };
  coverage: {
    requestedTargetCount: number;
    observedTargetCount: number;
    unavailableTargetCount: number;
    unavailableTargetKeys: string[];
  };
  recordCount: number;
  recordsSha256: string;
  records: RuntimeChassisPose[];
}

const chassisPoseIndex =
  chassisPoseIndexJson as unknown as RuntimeChassisPoseIndex;

function fail(message: string): never {
  throw new Error(`Runtime chassis pose index: ${message}`);
}

function validSha256(value: string) {
  return /^[0-9a-f]{64}$/u.test(value);
}

if (chassisPoseIndex.schemaVersion !== "runtime-chassis-pose-preview-index/v1") {
  fail("unsupported schema");
}
if (
  chassisPoseIndex.recordCount !== chassisPoseIndex.records.length ||
  chassisPoseIndex.coverage.observedTargetCount !== chassisPoseIndex.recordCount ||
  chassisPoseIndex.coverage.requestedTargetCount !==
    chassisPoseIndex.coverage.observedTargetCount +
      chassisPoseIndex.coverage.unavailableTargetCount ||
  chassisPoseIndex.coverage.unavailableTargetKeys.length !==
    chassisPoseIndex.coverage.unavailableTargetCount
) {
  fail("coverage counts are inconsistent");
}
if (
  chassisPoseIndex.source.sourceMap !==
    "/Game/RuntimeProbe/RuntimeProbeMap" ||
  chassisPoseIndex.source.pieNetworkMode !== "standalone" ||
  !validSha256(chassisPoseIndex.source.fileSha256) ||
  !validSha256(chassisPoseIndex.source.datasetSha256) ||
  !validSha256(chassisPoseIndex.recordsSha256)
) {
  fail("source provenance is incomplete");
}

const chassisPoseByGeneratedClass = new Map<string, RuntimeChassisPose>();
for (const record of chassisPoseIndex.records) {
  if (
    !record.generatedClass ||
    !record.targetKey ||
    !record.rawName ||
    record.promoEntryIds.length === 0 ||
    !record.gltfMatrix ||
    record.gltfMatrix.length !== 16 ||
    !record.gltfMatrix.every(Number.isFinite) ||
    !Number.isFinite(record.pitchDeg) ||
    !Number.isFinite(record.rollDeg) ||
    !Number.isFinite(record.heightAbovePlaneCm) ||
    !validSha256(record.captureSha256) ||
    !validSha256(record.captureEvidenceSha256) ||
    record.wheelCompressionState !== "native-unknown"
  ) {
    fail(`invalid record ${record.targetKey || "unknown"}`);
  }
  if (chassisPoseByGeneratedClass.has(record.generatedClass)) {
    fail(`duplicate generated class ${record.generatedClass}`);
  }
  chassisPoseByGeneratedClass.set(record.generatedClass, record);
}

export const runtimeChassisPoseRecordCount = chassisPoseIndex.recordCount;
export const runtimeChassisPoseSource = chassisPoseIndex.source;
export const runtimeChassisPoseUnavailableTargetKeys =
  chassisPoseIndex.coverage.unavailableTargetKeys;

export function runtimeChassisPoseForGeneratedClass(
  generatedClass: string | null | undefined,
) {
  return generatedClass
    ? chassisPoseByGeneratedClass.get(generatedClass) ?? null
    : null;
}
