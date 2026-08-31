import * as THREE from "three";

import {
  sampleProjectileTrajectory,
  type NativeProjectileTrajectorySample,
  type ProjectileVector3,
} from "./vehicle-projectile-playback.ts";
import type { StationGraphTransform } from "./vehicle-station-graph.ts";

export const VEHICLE_PROJECTILE_PLAYBACK_MAX_DISTANCE_M = 3_000;
const DEFAULT_MAX_ACTIVE_PROJECTILES = 32;

export interface VehicleProjectileLaunchPose {
  positionCm: ProjectileVector3;
  direction: ProjectileVector3;
}

export interface VehicleProjectileVisualRequest {
  weaponAssignmentId: string;
  weaponLabel: string;
  samples: NativeProjectileTrajectorySample[];
}

function threePointFromUnrealCentimetres(value: ProjectileVector3) {
  return new THREE.Vector3(value.x / 100, value.z / 100, value.y / 100);
}

function threeDirectionFromUnreal(value: ProjectileVector3) {
  return new THREE.Vector3(value.x, value.z, value.y).normalize();
}

function unrealCentimetresFromThreePoint(value: THREE.Vector3) {
  return { x: value.x * 100, y: value.z * 100, z: value.y * 100 };
}

function unrealDirectionFromThree(value: THREE.Vector3) {
  return { x: value.x, y: value.z, z: value.y };
}

export function vehicleProjectileAnchorMatrixFromUnrealFrame(
  frame: StationGraphTransform,
) {
  const unrealToGltf = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
  const quaternion = new THREE.Quaternion(
    frame.rotationQuaternion.x,
    frame.rotationQuaternion.y,
    frame.rotationQuaternion.z,
    frame.rotationQuaternion.w,
  ).normalize();
  const unrealFrame = new THREE.Matrix4().compose(
    new THREE.Vector3(
      frame.translationCm.x / 100,
      frame.translationCm.y / 100,
      frame.translationCm.z / 100,
    ),
    quaternion,
    new THREE.Vector3(
      frame.scale3D.x,
      frame.scale3D.y,
      frame.scale3D.z,
    ),
  );
  return unrealToGltf.clone().multiply(unrealFrame).multiply(unrealToGltf);
}

export function resolveVehicleProjectileLaunchPose({
  anchor,
  socketTranslationCm,
  socketDirection,
  forwardOffsetCm,
}: {
  anchor: THREE.Object3D;
  socketTranslationCm: ProjectileVector3;
  socketDirection: ProjectileVector3;
  forwardOffsetCm: number;
}): VehicleProjectileLaunchPose {
  anchor.updateWorldMatrix(true, false);
  const position = threePointFromUnrealCentimetres(
    socketTranslationCm,
  ).applyMatrix4(anchor.matrixWorld);
  const direction = threeDirectionFromUnreal(socketDirection)
    .transformDirection(anchor.matrixWorld)
    .normalize();
  position.addScaledVector(direction, forwardOffsetCm / 100);
  return {
    positionCm: unrealCentimetresFromThreePoint(position),
    direction: unrealDirectionFromThree(direction),
  };
}

export function createVehicleProjectileThreeRuntime({
  scene,
  render,
  onActiveCountChange,
  onSettled,
  maxActiveProjectiles = DEFAULT_MAX_ACTIVE_PROJECTILES,
}: {
  scene: THREE.Scene;
  render: () => void;
  onActiveCountChange?: (count: number) => void;
  onSettled?: () => void;
  maxActiveProjectiles?: number;
}) {
  const root = new THREE.Group();
  root.name = "runtime-source-locked-projectiles";
  root.visible = false;
  const bodyGeometry = new THREE.CylinderGeometry(
    0.008,
    0.008,
    0.085,
    6,
    1,
    false,
  );
  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd76f,
    toneMapped: false,
  });
  const bodies = new THREE.InstancedMesh(
    bodyGeometry,
    bodyMaterial,
    maxActiveProjectiles,
  );
  bodies.name = "runtime-source-locked-projectile-bodies";
  bodies.count = 0;
  bodies.frustumCulled = false;
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const trailPositions = new Float32Array(maxActiveProjectiles * 2 * 3);
  const trailGeometry = new THREE.BufferGeometry();
  const trailAttribute = new THREE.BufferAttribute(trailPositions, 3);
  trailAttribute.setUsage(THREE.DynamicDrawUsage);
  trailGeometry.setAttribute("position", trailAttribute);
  trailGeometry.setDrawRange(0, 0);
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0xffe29a,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
  });
  const trails = new THREE.LineSegments(trailGeometry, trailMaterial);
  trails.name = "runtime-source-locked-projectile-trails";
  trails.frustumCulled = false;
  root.add(bodies, trails);
  scene.add(root);

  const active: Array<{
    request: VehicleProjectileVisualRequest;
    startedAtMs: number;
  }> = [];
  const bodyTransform = new THREE.Object3D();
  const bodyUp = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const trailStart = new THREE.Vector3();
  let animationFrame = 0;
  let disposed = false;

  const animate = (frameTimeMs: number) => {
    animationFrame = 0;
    if (disposed) return;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const playback = active[index]!;
      const finalTime = playback.request.samples.at(-1)?.timeSeconds ?? 0;
      if ((frameTimeMs - playback.startedAtMs) / 1000 > finalTime) {
        active.splice(index, 1);
      }
    }
    bodies.count = active.length;
    root.visible = active.length > 0;
    active.forEach((playback, index) => {
      const sample = sampleProjectileTrajectory(
        playback.request.samples,
        (frameTimeMs - playback.startedAtMs) / 1000,
      );
      if (!sample) return;
      position.set(
        sample.positionCm.x / 100,
        sample.positionCm.z / 100,
        sample.positionCm.y / 100,
      );
      direction.set(
        sample.velocityCmPerSecond.x,
        sample.velocityCmPerSecond.z,
        sample.velocityCmPerSecond.y,
      );
      if (direction.lengthSq() < 1e-10) direction.set(1, 0, 0);
      else direction.normalize();
      bodyTransform.position.copy(position);
      bodyTransform.quaternion.setFromUnitVectors(bodyUp, direction);
      bodyTransform.scale.set(1, 1, 1);
      bodyTransform.updateMatrix();
      bodies.setMatrixAt(index, bodyTransform.matrix);
      const speedMPerSecond = Math.hypot(
        sample.velocityCmPerSecond.x,
        sample.velocityCmPerSecond.y,
        sample.velocityCmPerSecond.z,
      ) / 100;
      const trailLengthM = THREE.MathUtils.clamp(
        speedMPerSecond * 0.0015,
        0.12,
        1.8,
      );
      trailStart.copy(position).addScaledVector(direction, -trailLengthM);
      const offset = index * 6;
      trailPositions[offset] = trailStart.x;
      trailPositions[offset + 1] = trailStart.y;
      trailPositions[offset + 2] = trailStart.z;
      trailPositions[offset + 3] = position.x;
      trailPositions[offset + 4] = position.y;
      trailPositions[offset + 5] = position.z;
    });
    bodies.instanceMatrix.needsUpdate = true;
    trailGeometry.setDrawRange(0, active.length * 2);
    trailAttribute.needsUpdate = true;
    onActiveCountChange?.(active.length);
    render();
    if (active.length > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      onSettled?.();
    }
  };

  return {
    spawn(request: VehicleProjectileVisualRequest) {
      if (disposed || request.samples.length < 2) return false;
      if (active.length >= maxActiveProjectiles) active.shift();
      active.push({ request, startedAtMs: performance.now() });
      root.visible = true;
      if (animationFrame === 0) {
        animationFrame = requestAnimationFrame(animate);
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      active.length = 0;
      root.removeFromParent();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
    },
  };
}
