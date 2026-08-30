import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CrewOccupantPresentationPlan } from "../lib/vehicle-crew-occupant-presentation";
import { crewOccupantBasePose } from "../lib/vehicle-crew-occupant-presentation";
import {
  loadVehicleCrewAnimationPose,
  loadVehicleCrewAppearanceModels,
} from "../lib/vehicle-crew-animation-pose";
import { loadRuntimeReferenceSoldierAnimationPose } from "./runtime-reference-soldier";

type OccupantMatrixMap = ReadonlyMap<string, readonly number[]>;

export interface RuntimeCrewOccupantLayer {
  root: THREE.Group;
  detailState: "instanced-model" | "outline-fallback";
  stats: {
    occupants: number;
    hittable: number;
    protectedOutlines: number;
    unresolvedOutlines: number;
    modelDrawCalls: number;
    modelInstances: number;
    modelGeometryMode:
      | "realistic-low-poly-appearance"
      | "outline-fallback";
    uniqueModelVertices: number;
    estimatedModelTriangles: number;
    hitProxyDrawCalls: number;
    protectedPoseDrawCalls: number;
    exactAnimationPoses: number;
    buildDurationMs: number;
  };
  setVisible(visible: boolean): void;
  setHitProxyVisible(visible: boolean): void;
  updateArticulation(matrices: OccupantMatrixMap): void;
  dispose(): void;
}

const OUTLINE_PATH = "/images/reference-soldier-outline.webp";

function baseMatrix(plan: CrewOccupantPresentationPlan) {
  const pose = crewOccupantBasePose(plan.frame);
  const forward = new THREE.Vector3().fromArray(pose.forward).normalize();
  const up = new THREE.Vector3().fromArray(pose.up).normalize();
  const right = forward.clone().cross(up).normalize();
  const matrix = new THREE.Matrix4().makeBasis(forward, up, right);
  matrix.scale(new THREE.Vector3().fromArray(pose.scale));
  matrix.setPosition(new THREE.Vector3().fromArray(pose.position));
  return matrix;
}

function posedGeometry(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.skeleton.update();
    const sourcePosition = object.geometry.getAttribute("position");
    if (!sourcePosition || sourcePosition.count === 0) return;
    const positions = new Float32Array(sourcePosition.count * 3);
    const vertex = new THREE.Vector3();
    for (let index = 0; index < sourcePosition.count; index += 1) {
      vertex.fromBufferAttribute(sourcePosition, index);
      object.applyBoneTransform(index, vertex);
      vertex.applyMatrix4(object.matrixWorld);
      positions[index * 3] = vertex.x;
      positions[index * 3 + 1] = vertex.y;
      positions[index * 3 + 2] = vertex.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (object.geometry.index) geometry.setIndex(object.geometry.index.clone());
    geometry.computeVertexNormals();
    geometries.push(geometry);
  });
  if (geometries.length === 0) {
    throw new Error("Reference soldier contains no skinned appearance geometry");
  }
  const geometry = geometries.length === 1
    ? geometries[0]
    : mergeGeometries(
        geometries.map((candidate) => candidate.toNonIndexed()),
        false,
      );
  if (!geometry) throw new Error("Reference soldier geometry merge failed");
  if (geometries.length > 1) geometries.forEach((candidate) => candidate.dispose());
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || bounds.isEmpty()) {
    geometry.dispose();
    throw new Error("Reference soldier posed bounds are empty");
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function capsuleBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
) {
  const direction = end.clone().sub(start);
  const distance = direction.length();
  if (distance <= 0.001) return null;
  const geometry = new THREE.CapsuleGeometry(
    radius,
    Math.max(0.015, distance - radius * 2),
    3,
    6,
  );
  const matrix = new THREE.Matrix4().compose(
    start.clone().add(end).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function skeletonMannequinGeometry(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bonePosition = (name: string) => {
    const bone = root.getObjectByName(name);
    return bone instanceof THREE.Bone
      ? bone.getWorldPosition(new THREE.Vector3())
      : null;
  };
  const segments = [
    ["Bip01_Pelvis", "Bip01_Spine2", 0.18],
    ["Bip01_L_UpperArm", "Bip01_L_Forearm", 0.07],
    ["Bip01_L_Forearm", "Bip01_L_Hand", 0.055],
    ["Bip01_R_UpperArm", "Bip01_R_Forearm", 0.07],
    ["Bip01_R_Forearm", "Bip01_R_Hand", 0.055],
    ["Bip01_L_Thigh", "Bip01_L_Calf", 0.09],
    ["Bip01_L_Calf", "Bip01_L_Foot", 0.072],
    ["Bip01_R_Thigh", "Bip01_R_Calf", 0.09],
    ["Bip01_R_Calf", "Bip01_R_Foot", 0.072],
  ] as const;
  const geometries: THREE.BufferGeometry[] = segments.flatMap(
    ([startName, endName, radius]) => {
    const start = bonePosition(startName);
    const end = bonePosition(endName);
    if (!start || !end) return [];
    const geometry = capsuleBetween(start, end, radius);
    return geometry ? [geometry] : [];
    },
  );
  const head = bonePosition("Bip01_Head");
  if (head) {
    const headGeometry = new THREE.SphereGeometry(0.125, 8, 6);
    headGeometry.translate(head.x, head.y, head.z);
    geometries.push(headGeometry);
  }
  if (geometries.length < 8) {
    geometries.forEach((geometry) => geometry.dispose());
    throw new Error("Reference soldier skeleton mannequin is incomplete");
  }
  const merged = mergeGeometries(
    geometries.map((geometry) => geometry.toNonIndexed()),
    false,
  );
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Reference soldier mannequin merge failed");
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds || bounds.isEmpty()) {
    merged.dispose();
    throw new Error("Reference soldier mannequin bounds are empty");
  }
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

async function loadPosedGeometry(
  animationPoseRef: string,
  modelPath: string,
  includeAppearance: boolean,
) {
  const pose = await loadVehicleCrewAnimationPose(animationPoseRef);
  const { scene } = await loadRuntimeReferenceSoldierAnimationPose(
    pose,
    modelPath,
  );
  const hitProxy = skeletonMannequinGeometry(scene);
  return {
    appearance: includeAppearance ? posedGeometry(scene) : null,
    hitProxy,
  };
}

function outlineMaterial(
  texture: THREE.Texture,
  color: number,
  opacity: number,
) {
  return new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    alphaTest: 0.05,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export async function createRuntimeCrewOccupantLayer({
  plans,
  detailedModels,
}: {
  plans: CrewOccupantPresentationPlan[];
  detailedModels: boolean;
}): Promise<RuntimeCrewOccupantLayer> {
  const buildStartedAt = performance.now();
  const root = new THREE.Group();
  root.name = "runtime-crew-occupants";
  root.visible = false;
  const texture = await new THREE.TextureLoader().loadAsync(OUTLINE_PATH);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const hittable = plans.filter(
    ({ renderKind }) => renderKind === "hittable-model-and-proxy",
  );
  const protectedWithPose = plans.filter(
    ({ renderKind, animationPoseRef }) =>
      renderKind === "protected-outline" && animationPoseRef !== null,
  );
  const exactPosePlans = [...hittable, ...protectedWithPose];
  let detailState: RuntimeCrewOccupantLayer["detailState"] =
    detailedModels ? "instanced-model" : "outline-fallback";
  const modelGeometryMode = detailedModels
    ? "realistic-low-poly-appearance" as const
    : "outline-fallback" as const;
  const posed = new Map<
    string,
    { appearance: THREE.BufferGeometry | null; hitProxy: THREE.BufferGeometry }
  >();
  if (detailedModels && exactPosePlans.length > 0) {
    try {
      const appearanceModels = await loadVehicleCrewAppearanceModels();
      const modelPath = appearanceModels.crowdReal.assetUrl;
      const requiredPoseRefs = [...new Set(
        exactPosePlans.map(({ animationPoseRef }) => {
          if (!animationPoseRef) {
            throw new Error("Hittable crew plan lacks an exact animation pose");
          }
          return animationPoseRef;
        }),
      )];
      const geometries = await Promise.all(
        requiredPoseRefs.map(async (animationPoseRef) => [
          animationPoseRef,
          await loadPosedGeometry(
            animationPoseRef,
            modelPath,
            hittable.some((plan) => plan.animationPoseRef === animationPoseRef),
          ),
        ] as const),
      );
      geometries.forEach(([poseRef, geometry]) => posed.set(poseRef, geometry));
    } catch {
      detailState = "outline-fallback";
      posed.clear();
    }
  }

  const appearanceMaterial = new THREE.MeshStandardMaterial({
    color: 0xcdbd90,
    roughness: 0.86,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
  });
  const modelBindings = [...posed].flatMap(([poseRef, geometry]) => {
    const posePlans = hittable.filter(
      (plan) => plan.animationPoseRef === poseRef,
    );
    if (posePlans.length === 0 || !geometry.appearance) return [];
    const mesh = new THREE.InstancedMesh(
      geometry.appearance,
      appearanceMaterial,
      posePlans.length,
    );
    mesh.name = `crew-occupant-${poseRef}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 21;
    root.add(mesh);
    return [{ mesh, plans: posePlans }];
  });

  const hitProxyMaterial = new THREE.MeshBasicMaterial({
    color: 0xff5c55,
    transparent: true,
    opacity: 0.24,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const hitProxyHolder = new THREE.Group();
  hitProxyHolder.name = "crew-hit-proxy-holder";
  hitProxyHolder.visible = false;
  root.add(hitProxyHolder);
  const proxyBindings = [...posed].flatMap(([poseRef, geometry]) => {
    const posePlans = hittable.filter(
      (plan) => plan.animationPoseRef === poseRef,
    );
    if (posePlans.length === 0) return [];
    const mesh = new THREE.InstancedMesh(
      geometry.hitProxy,
      hitProxyMaterial,
      posePlans.length,
    );
    mesh.name = `crew-hit-proxy-${poseRef}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 24;
    hitProxyHolder.add(mesh);
    return [{ mesh, plans: posePlans }];
  });

  const protectedPoseMaterial = new THREE.MeshBasicMaterial({
    color: 0x8fc2cf,
    transparent: true,
    opacity: 0.42,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const protectedPoseBindings = [...posed].flatMap(([poseRef, geometry]) => {
    const posePlans = protectedWithPose.filter(
      (plan) => plan.animationPoseRef === poseRef,
    );
    if (posePlans.length === 0) return [];
    const mesh = new THREE.InstancedMesh(
      geometry.hitProxy,
      protectedPoseMaterial,
      posePlans.length,
    );
    mesh.name = `crew-protected-pose-outline-${poseRef}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 22;
    root.add(mesh);
    return [{ mesh, plans: posePlans }];
  });

  const outlinePlans = plans.filter((plan) =>
    detailState === "outline-fallback" ||
      plan.renderKind === "unresolved-outline" ||
      (
        plan.renderKind === "protected-outline" &&
        plan.animationPoseRef === null
      )
  );
  const protectedMaterial = outlineMaterial(texture, 0x8fc2cf, 0.7);
  const unresolvedMaterial = outlineMaterial(texture, 0xe5ad5b, 0.76);
  const hittableFallbackMaterial = outlineMaterial(texture, 0xe9c082, 0.82);
  const outlineBindings = outlinePlans.map((plan) => {
    const material = plan.renderKind === "protected-outline"
      ? protectedMaterial
      : plan.renderKind === "unresolved-outline"
        ? unresolvedMaterial
        : hittableFallbackMaterial;
    const sprite = new THREE.Sprite(material);
    sprite.name = `crew-occupant-outline-f${plan.catalogSeatIndex}`;
    sprite.center.set(0.5, 0);
    sprite.scale.set(
      plan.posture === "crouching" ? 0.72 : 0.85,
      plan.posture === "crouching" ? 1.18 : 1.7,
      1,
    );
    sprite.renderOrder = 23;
    sprite.userData.crewSeatKey = plan.seatKey;
    sprite.userData.crewRenderKind = plan.renderKind;
    root.add(sprite);
    return { sprite, plan };
  });

  let articulationMatrices: OccupantMatrixMap = new Map();

  const finalMatrix = (plan: CrewOccupantPresentationPlan) => {
    const matrix = baseMatrix(plan);
    const articulation = articulationMatrices.get(plan.seatKey);
    return articulation
      ? new THREE.Matrix4().fromArray(articulation).multiply(matrix)
      : matrix;
  };
  const update = () => {
    for (const { mesh, plans: posePlans } of modelBindings) {
      posePlans.forEach((plan, index) => {
        mesh.setMatrixAt(index, finalMatrix(plan));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    outlineBindings.forEach(({ sprite, plan }) => {
      sprite.position.setFromMatrixPosition(finalMatrix(plan));
    });
    proxyBindings.forEach(({ mesh, plans: posePlans }) => {
      posePlans.forEach((plan, index) => {
        mesh.setMatrixAt(index, finalMatrix(plan));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    protectedPoseBindings.forEach(({ mesh, plans: posePlans }) => {
      posePlans.forEach((plan, index) => {
        mesh.setMatrixAt(index, finalMatrix(plan));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    root.updateMatrixWorld(true);
  };
  update();

  const disposableMaterials = new Set<THREE.Material>([
    appearanceMaterial,
    protectedMaterial,
    unresolvedMaterial,
    hittableFallbackMaterial,
    hitProxyMaterial,
    protectedPoseMaterial,
  ]);
  return {
    root,
    detailState,
    stats: {
      occupants: plans.length,
      hittable: hittable.length,
      protectedOutlines: plans.filter(
        ({ renderKind }) => renderKind === "protected-outline",
      ).length,
      unresolvedOutlines: plans.filter(
        ({ renderKind }) => renderKind === "unresolved-outline",
      ).length,
      modelDrawCalls: modelBindings.length,
      modelInstances: modelBindings.reduce(
        (sum, binding) => sum + binding.plans.length,
        0,
      ),
      modelGeometryMode: detailState === "outline-fallback"
        ? "outline-fallback"
        : modelGeometryMode,
      uniqueModelVertices: modelBindings.reduce(
        (sum, binding) =>
          sum + (binding.mesh.geometry.getAttribute("position")?.count ?? 0),
        0,
      ),
      estimatedModelTriangles: modelBindings.reduce((sum, binding) => {
        const geometry = binding.mesh.geometry;
        const triangles = geometry.index
          ? geometry.index.count / 3
          : (geometry.getAttribute("position")?.count ?? 0) / 3;
        return sum + triangles * binding.plans.length;
      }, 0),
      hitProxyDrawCalls: proxyBindings.length,
      protectedPoseDrawCalls: protectedPoseBindings.length,
      exactAnimationPoses: posed.size,
      buildDurationMs: performance.now() - buildStartedAt,
    },
    setVisible(visible) {
      root.visible = visible;
    },
    setHitProxyVisible(visible) {
      hitProxyHolder.visible = visible;
    },
    updateArticulation(matrices) {
      articulationMatrices = matrices;
      update();
    },
    dispose() {
      root.removeFromParent();
      new Set(
        [...posed.values()].flatMap(({ appearance, hitProxy }) => [
          ...(appearance ? [appearance] : []),
          hitProxy,
        ]),
      ).forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      texture.dispose();
    },
  };
}
