import { loadWikiDataset } from "./wiki-source";

export interface VehicleCrewAnimationBoneTransform {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

export interface VehicleCrewAnimationPose {
  schemaVersion: "sigua-vehicle-crew-animation-pose/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceDataRevision: string;
  id: string;
  sourceAnimationPath: string;
  sampleTimeSeconds: 0;
  sampleState: "derived-editor-animation-frame-zero";
  skeletonPath: string;
  boneCount: number;
  runtimeLayers: {
    aimOffset: "not-applied";
    handIk: "not-applied";
    weaponIk: "not-applied";
    perFramePhase: "not-reproduced";
  };
  bones: Record<string, VehicleCrewAnimationBoneTransform>;
}

interface VehicleCrewAnimationPoseIndexRecord {
  id: string;
  sourceAnimationPath: string;
  state: "derived-editor-animation-frame-zero";
  assetUrl: string;
  bytes: number;
  sha256: string;
  boneCount: number;
  runtimeLayers: VehicleCrewAnimationPose["runtimeLayers"];
}

export interface VehicleCrewAppearanceModel {
  assetUrl: string;
  boneCount: number;
  bytes: number;
  sha256: string;
  state: "observed-source-appearance" | "derived-meshoptimizer-skinned-lod";
  triangles: number;
  vertices: number;
  simplification?: {
    error: number;
    lockBorder: boolean;
    ratio: number;
    tool: string;
    weldTolerance: number;
  };
  presentationCleanup?: {
    policy: "source-locked-internal-face-cull-v1";
    removedEye: {
      materialName: "MI_GreenEye";
      primitives: 1;
      triangles: 840;
    };
    removedOralCavity: {
      materialName: "MI_USA_Heads";
      connectedComponents: 8;
      triangles: 984;
    };
    retainedGlasses: {
      materialName: "MI_USArmyGlass";
      primitives: 1;
    };
    afterCleanup: {
      vertices: number;
      triangles: number;
      meshes: number;
      primitives: number;
      skins: number;
      bones: number;
      skinnedPrimitives: number;
    };
  };
}

export interface VehicleCrewAnimationPoseLibrary {
  schemaVersion: "sigua-vehicle-crew-animation-pose-library/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceDataRevision: string;
  skeletonPath: string;
  compatibleBoneCount: number;
  counts: { poses: number; unresolved: 0 };
  appearanceModels: {
    fullReference: VehicleCrewAppearanceModel;
    crowdReal: VehicleCrewAppearanceModel;
  };
  poses: VehicleCrewAnimationPoseIndexRecord[];
}

let poseIndexRequest: Promise<VehicleCrewAnimationPoseLibrary> | null = null;
const poseRequests = new Map<string, Promise<VehicleCrewAnimationPose>>();

function finite(values: unknown[], expectedLength: number) {
  return values.length === expectedLength &&
    values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function validateAppearanceModels(library: VehicleCrewAnimationPoseLibrary) {
  const { fullReference, crowdReal } = library.appearanceModels ?? {};
  if (
    fullReference?.assetUrl !==
      "/assets/infantry-hit/models/4b6caa60516b49563a968cbcf53875126157d15665cc54b9d8921d832d09ae14.glb" ||
    fullReference.sha256 !==
      "4b6caa60516b49563a968cbcf53875126157d15665cc54b9d8921d832d09ae14" ||
    fullReference.state !== "observed-source-appearance" ||
    fullReference.boneCount !== library.compatibleBoneCount ||
    fullReference.triangles !== 117_364 ||
    fullReference.vertices !== 90_462 ||
    fullReference.bytes !== 2_548_376 ||
    crowdReal?.assetUrl !==
      "/assets/vehicle-crew/models/reference-soldier-crowd-real-68ffdddd34f93e12a3feee2f3aeb2f13344e9b99916cfe27422e4588524a1b52.glb" ||
    crowdReal.sha256 !==
      "68ffdddd34f93e12a3feee2f3aeb2f13344e9b99916cfe27422e4588524a1b52" ||
    crowdReal.state !== "derived-meshoptimizer-skinned-lod" ||
    crowdReal.boneCount !== library.compatibleBoneCount ||
    crowdReal.triangles !== 12_688 ||
    crowdReal.triangles > 13_000 ||
    crowdReal.vertices !== 24_217 ||
    crowdReal.bytes !== 1_669_408 ||
    crowdReal.simplification?.ratio !== 0.07 ||
    crowdReal.simplification.error !== 0.025 ||
    crowdReal.simplification.weldTolerance !== 0.00001 ||
    crowdReal.presentationCleanup?.policy !==
      "source-locked-internal-face-cull-v1" ||
    crowdReal.presentationCleanup.removedEye.materialName !== "MI_GreenEye" ||
    crowdReal.presentationCleanup.removedEye.primitives !== 1 ||
    crowdReal.presentationCleanup.removedEye.triangles !== 840 ||
    crowdReal.presentationCleanup.removedOralCavity.materialName !==
      "MI_USA_Heads" ||
    crowdReal.presentationCleanup.removedOralCavity.connectedComponents !== 8 ||
    crowdReal.presentationCleanup.removedOralCavity.triangles !== 984 ||
    crowdReal.presentationCleanup.retainedGlasses.materialName !==
      "MI_USArmyGlass" ||
    crowdReal.presentationCleanup.retainedGlasses.primitives !== 1 ||
    crowdReal.presentationCleanup.afterCleanup.primitives !== 7 ||
    crowdReal.presentationCleanup.afterCleanup.skinnedPrimitives !== 7
  ) {
    throw new Error("SiguaWiki crew appearance model index is invalid");
  }
  return library.appearanceModels;
}

function validatePose(
  value: unknown,
  index: VehicleCrewAnimationPoseIndexRecord,
  library: VehicleCrewAnimationPoseLibrary,
) {
  const pose = value as VehicleCrewAnimationPose;
  if (
    pose.schemaVersion !== "sigua-vehicle-crew-animation-pose/v1" ||
    pose.sourceBuildId !== library.sourceBuildId ||
    pose.sourceDataRevision !== library.sourceDataRevision ||
    pose.id !== index.id ||
    pose.sourceAnimationPath !== index.sourceAnimationPath ||
    pose.sampleTimeSeconds !== 0 ||
    pose.sampleState !== index.state ||
    pose.skeletonPath !== library.skeletonPath ||
    pose.boneCount !== library.compatibleBoneCount ||
    Object.keys(pose.bones ?? {}).length !== pose.boneCount
  ) throw new Error(`SiguaWiki crew animation pose differs for ${index.id}`);
  for (const transform of Object.values(pose.bones)) {
    if (
      !finite(transform.translation, 3) ||
      !finite(transform.rotation, 4) ||
      !finite(transform.scale, 3)
    ) throw new Error(`SiguaWiki crew animation pose contains invalid bones for ${index.id}`);
  }
  return pose;
}

async function loadPoseIndex() {
  if (poseIndexRequest) return poseIndexRequest;
  poseIndexRequest = loadWikiDataset(
    "/data/vehicles/crew-animation-poses/index.json",
    "sigua-vehicle-crew-animation-pose-library/v1",
  ).then((value) => {
    const library = value as VehicleCrewAnimationPoseLibrary;
    if (
      library.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
      library.compatibleBoneCount !== 141 ||
      library.counts?.poses !== library.poses?.length ||
      library.counts.unresolved !== 0 ||
      new Set(library.poses.map(({ id }) => id)).size !== library.poses.length
    ) throw new Error("SiguaWiki crew animation pose index is invalid");
    validateAppearanceModels(library);
    return library;
  }).catch((error) => {
    poseIndexRequest = null;
    throw error;
  });
  return poseIndexRequest;
}

export async function loadVehicleCrewAppearanceModels() {
  const library = await loadPoseIndex();
  return validateAppearanceModels(library);
}

export async function loadVehicleCrewAppearanceModel(
  kind: keyof VehicleCrewAnimationPoseLibrary["appearanceModels"],
) {
  const models = await loadVehicleCrewAppearanceModels();
  return models[kind];
}

export async function loadVehicleCrewAnimationPose(poseRef: string) {
  const existing = poseRequests.get(poseRef);
  if (existing) return existing;
  const request = loadPoseIndex().then(async (library) => {
    const matches = library.poses.filter(({ id }) => id === poseRef);
    if (matches.length !== 1) {
      throw new Error(`SiguaWiki crew animation pose ${poseRef} is missing`);
    }
    const index = matches[0];
    const value = await loadWikiDataset(
      index.assetUrl,
      "sigua-vehicle-crew-animation-pose/v1",
    );
    return validatePose(value, index, library);
  }).catch((error) => {
    poseRequests.delete(poseRef);
    throw error;
  });
  poseRequests.set(poseRef, request);
  return request;
}
