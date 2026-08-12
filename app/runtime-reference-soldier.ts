import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { runtimeWikiAssetUrl } from "../lib/runtime-visual-lazy-load";
import { loadWikiDataset } from "../lib/wiki-source";

const REFERENCE_SOLDIER_MODEL_PATH =
  "/assets/infantry-hit/models/4b6caa60516b49563a968cbcf53875126157d15665cc54b9d8921d832d09ae14.glb";
const REFERENCE_SOLDIER_GLASS_MATERIAL_NAME = "MI_USArmyGlass";
const REFERENCE_SOLDIER_GLASS_HEAD_BONE_NAME = "Bip01_Head";

type ReferenceSoldierBoneTransform = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

type InfantryPosture = {
  boneCount: number;
  bones: Record<string, ReferenceSoldierBoneTransform>;
};

type InfantryPostureDataset = {
  schemaVersion: "sigua-infantry-posture-runtime/v1";
  count: number;
  postures: Record<string, InfantryPosture>;
};

function standingRiflePose(value: unknown) {
  const dataset = value as InfantryPostureDataset;
  if (
    dataset.count !== Object.keys(dataset.postures).length ||
    Object.values(dataset.postures).some(
      (posture) => posture.boneCount !== Object.keys(posture.bones).length,
    )
  ) {
    throw new Error("SiguaWiki infantry posture data is invalid");
  }
  const posture = dataset.postures["standing-rifle"];
  if (!posture) {
    throw new Error("SiguaWiki is missing the standing-rifle infantry posture");
  }
  return posture;
}

function applyStandingRiflePose(
  root: THREE.Object3D,
  posture: InfantryPosture,
) {
  let appliedBoneCount = 0;
  for (const [boneName, transform] of Object.entries(posture.bones)) {
    const bone = root.getObjectByName(boneName);
    if (!(bone instanceof THREE.Bone)) continue;
    bone.position.fromArray(transform.translation);
    bone.quaternion.fromArray(transform.rotation);
    bone.scale.fromArray(transform.scale);
    appliedBoneCount += 1;
  }
  if (appliedBoneCount !== posture.boneCount) {
    throw new Error(
      `Reference soldier pose matched ${appliedBoneCount}/${posture.boneCount} bones`,
    );
  }
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.frustumCulled = false;
    object.skeleton.update();
  });
}

function rebindGlassToHead(root: THREE.Object3D) {
  let reboundMeshCount = 0;
  let reboundVertexCount = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (
      !materials.some(
        ({ name }) => name === REFERENCE_SOLDIER_GLASS_MATERIAL_NAME,
      )
    ) {
      return;
    }
    if (
      materials.some(
        ({ name }) => name !== REFERENCE_SOLDIER_GLASS_MATERIAL_NAME,
      )
    ) {
      throw new Error(
        "Reference soldier glass primitive is merged with another material",
      );
    }
    const headJointIndex = object.skeleton.bones.findIndex(
      ({ name }) => name === REFERENCE_SOLDIER_GLASS_HEAD_BONE_NAME,
    );
    if (headJointIndex < 0) {
      throw new Error("Reference soldier glass is missing its head bone");
    }
    const vertexCount = object.geometry.getAttribute("position")?.count ?? 0;
    if (vertexCount <= 0) {
      throw new Error("Reference soldier glass contains no vertices");
    }
    const jointIndices = new Uint16Array(vertexCount * 4);
    const jointWeights = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      jointIndices[vertex * 4] = headJointIndex;
      jointWeights[vertex * 4] = 1;
    }
    object.geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(jointIndices, 4),
    );
    object.geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(jointWeights, 4),
    );
    object.skeleton.update();
    reboundMeshCount += 1;
    reboundVertexCount += vertexCount;
  });
  if (reboundMeshCount === 0 || reboundVertexCount === 0) {
    throw new Error("Reference soldier glass primitive was not found");
  }
  return { reboundMeshCount, reboundVertexCount };
}

export async function loadRuntimeReferenceSoldier() {
  const modelUrl = runtimeWikiAssetUrl(REFERENCE_SOLDIER_MODEL_PATH);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [postureValue, { scene }] = await Promise.all([
    loadWikiDataset(
      "/data/infantry/postures.json",
      "sigua-infantry-posture-runtime/v1",
    ),
    loader.loadAsync(modelUrl),
  ]);
  const glassRebind = rebindGlassToHead(scene);
  applyStandingRiflePose(scene, standingRiflePose(postureValue));
  scene.name = "standing-rifle-reference-soldier";
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  return { scene, modelUrl, glassRebind };
}
