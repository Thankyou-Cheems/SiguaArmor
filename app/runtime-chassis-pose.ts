import { loadWikiDataset } from "../lib/wiki-source.ts";

export type RuntimeChassisPoseMatrix = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
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
  wheelCompressionState: "native-unknown";
}

interface RuntimeChassisPoseIndex {
  schemaVersion: "runtime-chassis-pose-preview-index/v1";
  recordCount: number;
  records: RuntimeChassisPose[];
}

const chassisPoseIndex = (await loadWikiDataset(
  "/data/vehicles/chassis-poses.json",
  "runtime-chassis-pose-preview-index/v1",
)) as RuntimeChassisPoseIndex;

if (
  chassisPoseIndex.recordCount !== chassisPoseIndex.records.length ||
  chassisPoseIndex.records.some(
    ({ generatedClass, gltfMatrix }) =>
      !generatedClass ||
      gltfMatrix.length !== 16 ||
      !gltfMatrix.every(Number.isFinite),
  )
) {
  throw new Error("SiguaWiki vehicle chassis poses are invalid");
}

const chassisPoseByGeneratedClass = new Map(
  chassisPoseIndex.records.map((record) => [record.generatedClass, record]),
);
if (chassisPoseByGeneratedClass.size !== chassisPoseIndex.recordCount) {
  throw new Error("SiguaWiki vehicle chassis poses contain duplicate classes");
}

export function runtimeChassisPoseForGeneratedClass(
  generatedClass: string | null | undefined,
) {
  return generatedClass
    ? chassisPoseByGeneratedClass.get(generatedClass) ?? null
    : null;
}
