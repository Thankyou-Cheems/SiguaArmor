import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  VehicleCrewPhysicsAsset,
  VehicleCrewPhysicsPrimitive,
} from "../lib/vehicle-crew-physics-asset";

const UE_TO_THREE = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
);
const THREE_TO_UE = UE_TO_THREE.clone().invert();

export function ueVectorCmToThreeMeters(value: {
  x: number;
  y: number;
  z: number;
}) {
  return new THREE.Vector3(value.x, value.z, value.y).multiplyScalar(0.01);
}

function mapUeRotation(rotation: THREE.Matrix4) {
  return UE_TO_THREE.clone().multiply(rotation).multiply(THREE_TO_UE);
}

function mappedQuaternion(value: { x: number; y: number; z: number; w: number }) {
  return new THREE.Quaternion().setFromRotationMatrix(
    mapUeRotation(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion(value.x, value.y, value.z, value.w),
      ),
    ),
  );
}

function mappedScale(value: { x: number; y: number; z: number }) {
  return new THREE.Vector3(value.x, value.z, value.y);
}

function mappedRotator(value: { pitch: number; yaw: number; roll: number }) {
  const rotation = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(value.roll),
      THREE.MathUtils.degToRad(value.pitch),
      THREE.MathUtils.degToRad(value.yaw),
      "ZYX",
    ),
  );
  return new THREE.Quaternion().setFromRotationMatrix(mapUeRotation(rotation));
}

function primitiveGeometry(primitive: VehicleCrewPhysicsPrimitive) {
  if (primitive.type === "capsule") {
    return new THREE.CapsuleGeometry(
      primitive.radiusCm * 0.01,
      primitive.lengthCm * 0.01,
      3,
      6,
    );
  }
  return new THREE.BoxGeometry(
    primitive.sizeCm.x * 0.01,
    primitive.sizeCm.z * 0.01,
    primitive.sizeCm.y * 0.01,
  );
}

function primitiveMatrix(primitive: VehicleCrewPhysicsPrimitive) {
  return new THREE.Matrix4().compose(
    ueVectorCmToThreeMeters(primitive.centerCm),
    mappedRotator(primitive.rotationDegrees),
    new THREE.Vector3(1, 1, 1),
  );
}

export function posedCrewPhysicsAssetGeometry({
  physicsAsset,
  referenceRoot,
  posedRoot,
}: {
  physicsAsset: VehicleCrewPhysicsAsset;
  referenceRoot: THREE.Object3D;
  posedRoot: THREE.Object3D;
}) {
  referenceRoot.updateMatrixWorld(true);
  posedRoot.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  for (const body of physicsAsset.bodies) {
    const referenceBone = referenceRoot.getObjectByName(body.boneName);
    const posedBone = posedRoot.getObjectByName(body.boneName);
    if (!(referenceBone instanceof THREE.Bone) || !(posedBone instanceof THREE.Bone)) {
      geometries.forEach((geometry) => geometry.dispose());
      throw new Error(`Reference soldier lacks PhysicsAsset bone ${body.boneName}`);
    }
    const referenceBodyMatrix = new THREE.Matrix4().compose(
      ueVectorCmToThreeMeters(
        body.referenceComponentTransform.translationCm,
      ),
      mappedQuaternion(body.referenceComponentTransform.rotationQuaternion),
      mappedScale(body.referenceComponentTransform.scale3D),
    );
    const poseDelta = posedBone.matrixWorld.clone().multiply(
      referenceBone.matrixWorld.clone().invert(),
    );
    for (const primitive of body.primitives) {
      const geometry = primitiveGeometry(primitive);
      geometry.applyMatrix4(
        poseDelta.clone().multiply(referenceBodyMatrix).multiply(
          primitiveMatrix(primitive),
        ),
      );
      geometries.push(geometry);
    }
  }
  if (geometries.length !== physicsAsset.counts.primitives) {
    geometries.forEach((geometry) => geometry.dispose());
    throw new Error("Crew PhysicsAsset primitive count drifted");
  }
  const merged = mergeGeometries(
    geometries.map((geometry) => geometry.toNonIndexed()),
    false,
  );
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Crew PhysicsAsset geometry merge failed");
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  if (!merged.boundingBox || merged.boundingBox.isEmpty()) {
    merged.dispose();
    throw new Error("Crew PhysicsAsset posed bounds are empty");
  }
  return merged;
}
