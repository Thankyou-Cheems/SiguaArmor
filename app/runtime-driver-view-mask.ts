import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { runtimeWikiAssetUrl } from "../lib/runtime-visual-lazy-load.ts";
import type {
  VehicleDriverMaskAsset,
  VehicleDriverViewRecord,
} from "../lib/vehicle-driver-view.ts";
import type { RuntimeCrewComponentTransform } from "../lib/vehicle-crew-seat-runtime.ts";

const UE_TO_THREE = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
);
const THREE_TO_UE = UE_TO_THREE.clone().invert();

function mappedQuaternion(value: {
  x: number;
  y: number;
  z: number;
  w: number;
}) {
  return new THREE.Quaternion().setFromRotationMatrix(
    UE_TO_THREE.clone().multiply(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion(value.x, value.y, value.z, value.w),
      ),
    ).multiply(THREE_TO_UE),
  );
}

export function driverMaskVehicleMatrix(value: RuntimeCrewComponentTransform) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      value.translationCm.x,
      value.translationCm.z,
      value.translationCm.y,
    ).multiplyScalar(0.01),
    mappedQuaternion(value.rotationQuaternion),
    new THREE.Vector3(value.scale3D.x, value.scale3D.z, value.scale3D.y),
  );
}

function driverMaskMaterial(role: "frame" | "glass") {
  return role === "glass"
    ? new THREE.MeshBasicMaterial({
        name: "driver-mask-glass-matte",
        color: 0x315147,
        transparent: true,
        opacity: 0.18,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    : new THREE.MeshBasicMaterial({
        name: "driver-mask-frame-matte",
        color: 0x030504,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
}

const sourceRequests = new Map<string, Promise<THREE.Group>>();

function loadDriverMaskSource(asset: VehicleDriverMaskAsset) {
  const existing = sourceRequests.get(asset.assetUrl);
  if (existing) return existing;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const request = loader.loadAsync(runtimeWikiAssetUrl(asset.assetUrl))
    .then(({ scene }) => scene)
    .catch((error) => {
      sourceRequests.delete(asset.assetUrl);
      throw error;
    });
  sourceRequests.set(asset.assetUrl, request);
  return request;
}

function assignPrimitiveRoles(
  root: THREE.Group,
  asset: VehicleDriverMaskAsset,
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry = object.geometry.clone();
      meshes.push(object);
    }
  });
  const roles = asset.primitiveMaterialRoles.map(({ role }) => role);
  if (meshes.length === roles.length) {
    meshes.forEach((mesh, index) => {
      mesh.material = driverMaskMaterial(roles[index]);
      mesh.frustumCulled = false;
      mesh.renderOrder = roles[index] === "glass" ? 151 : 150;
    });
    return;
  }
  if (meshes.length === 1 && meshes[0].geometry.groups.length === roles.length) {
    meshes[0].material = roles.map(driverMaskMaterial);
    meshes[0].geometry.groups.forEach((group, index) => {
      group.materialIndex = index;
    });
    meshes[0].frustumCulled = false;
    meshes[0].renderOrder = 150;
    return;
  }
  throw new Error(
    `Driver mask primitive mapping differs: ${asset.id} ` +
      `${meshes.length}/${roles.length}`,
  );
}

export interface RuntimeDriverMaskLayer {
  root: THREE.Group;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export async function loadRuntimeDriverMask(
  record: VehicleDriverViewRecord,
): Promise<RuntimeDriverMaskLayer | null> {
  if (record.mask.state !== "observed-source-viewport-geometry") return null;
  if (record.mask.asset.materialPolicy !== "source-geometry-product-matte") {
    throw new Error("Driver mask material policy differs");
  }
  const source = await loadDriverMaskSource(record.mask.asset);
  const root = source.clone(true);
  root.name = "runtime-driver-view-mask";
  assignPrimitiveRoles(root, record.mask.asset);
  root.matrix.copy(driverMaskVehicleMatrix(record.mask.vehicleLocalFrame.value!));
  root.matrixAutoUpdate = false;
  root.visible = false;
  root.updateMatrixWorld(true);
  return {
    root,
    setVisible(visible) {
      root.visible = visible;
    },
    dispose() {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
        object.geometry.dispose();
      });
      root.removeFromParent();
    },
  };
}
