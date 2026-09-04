import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import {
  sampleProjectileTrajectory,
  type NativeProjectileTrajectorySample,
  type ProjectileVector3,
  type VehicleGuidanceAimPose,
} from "./vehicle-projectile-playback.ts";
import type { StationGraphTransform } from "./vehicle-station-graph.ts";
import type { SourceProjectileVisual } from "./vehicle-firing-presentation.ts";
import { wikiUrl } from "./wiki-source.ts";

export const VEHICLE_PROJECTILE_PLAYBACK_MAX_DISTANCE_M = 3_000;
const DEFAULT_MAX_ACTIVE_PROJECTILES = 32;
const VISIBILITY_TRAIL_SEGMENTS = 10;

export interface VehicleProjectileLaunchPose {
  positionCm: ProjectileVector3;
  direction: ProjectileVector3;
}

export interface VehicleProjectileVisualRequest {
  weaponAssignmentId: string;
  weaponLabel: string;
  samples: NativeProjectileTrajectorySample[];
  visual: SourceProjectileVisual;
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

export function resolveVehicleGuidanceAimPose(
  camera: THREE.Camera,
): VehicleGuidanceAimPose {
  camera.updateWorldMatrix(true, false);
  const position = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
  return {
    aimLocationCm: unrealCentimetresFromThreePoint(position),
    aimDirection: unrealDirectionFromThree(direction),
  };
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
  loadModel,
  onResourceError,
  visibilityEnhanced = true,
}: {
  scene: THREE.Scene;
  render: () => void;
  onActiveCountChange?: (count: number) => void;
  onSettled?: () => void;
  maxActiveProjectiles?: number;
  loadModel?: (pathname: string) => Promise<THREE.Object3D>;
  onResourceError?: (error: Error) => void;
  visibilityEnhanced?: boolean;
}) {
  const root = new THREE.Group();
  root.name = "runtime-source-locked-projectiles";
  root.visible = false;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const readModel = loadModel ?? (async (pathname: string) =>
    (await loader.loadAsync(wikiUrl(pathname))).scene);
  type Primitive = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4; batch: THREE.InstancedMesh };
  type Part = { primitive: Primitive; local: THREE.Matrix4 };
  const models = new Map<string, Promise<Primitive[]>>();
  const readyModels = new Map<string, Primitive[]>();
  const multiplicities = new Map<string, number>();
  const preparations = new Map<SourceProjectileVisual, Promise<void>>();
  const readyVisuals = new Map<SourceProjectileVisual, Part[]>();
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const ownedTextures = new Set<THREE.Texture>();
  let disposed = false;
  const batchFor = (primitive: Omit<Primitive, "batch">, capacity: number) => {
    const batch = new THREE.InstancedMesh(primitive.geometry, primitive.material, capacity);
    batch.name = "runtime-source-projectile-model";
    batch.count = 0;
    batch.frustumCulled = false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(batch);
    return batch;
  };
  const releaseSource = (source: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
  };
  const prepare = async (visual: SourceProjectileVisual) => {
    if (disposed) return;
    const previous = preparations.get(visual);
    if (previous) return previous;
    const run = async () => {
      const counts = new Map<string, number>();
      for (const body of visual.bodies) counts.set(body.model, (counts.get(body.model) ?? 0) + 1);
      for (const [pathname, count] of counts) {
        if (count > (multiplicities.get(pathname) ?? 0)) {
          multiplicities.set(pathname, count);
          for (const primitive of readyModels.get(pathname) ?? []) {
            primitive.batch.removeFromParent();
            primitive.batch.dispose();
            primitive.batch = batchFor(primitive, maxActiveProjectiles * count);
          }
        }
        if (!models.has(pathname)) {
          const request = readModel(pathname).then(source => {
            if (disposed) { releaseSource(source); return []; }
            source.updateWorldMatrix(true, true);
            const primitives: Primitive[] = [];
            source.traverseVisible(object => {
              if (!(object instanceof THREE.Mesh)) return;
              ownedGeometry.add(object.geometry);
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                ownedMaterials.add(material);
                for (const value of Object.values(material)) if (value instanceof THREE.Texture) ownedTextures.add(value);
              }
              const primitive = { geometry: object.geometry, material: object.material, local: object.matrixWorld.clone() };
              primitives.push({ ...primitive, batch: batchFor(primitive, maxActiveProjectiles * multiplicities.get(pathname)!) });
            });
            readyModels.set(pathname, primitives);
            return primitives;
          }).catch(error => { models.delete(pathname); throw error; });
          models.set(pathname, request);
        }
      }
      const parts = (await Promise.all(visual.bodies.map(async body => {
        const primitives = await models.get(body.model)!;
        const frame = vehicleProjectileAnchorMatrixFromUnrealFrame(body.componentToActor);
        return primitives.map(primitive => ({ primitive, local: frame.clone().multiply(primitive.local) }));
      }))).flat();
      if (!disposed) readyVisuals.set(visual, parts);
    };
    const request = run().catch(error => { preparations.delete(visual); throw error; });
    preparations.set(visual, request);
    return request;
  };
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
  root.add(trails);

  // Explicit webpage assistance, not a source mesh or a native tracer. Both
  // buffers are fixed-capacity and shared by every active round, including
  // meshless/non-tracer bullets. The source body keeps its real dimensions.
  const cuePositions = new Float32Array(maxActiveProjectiles * VISIBILITY_TRAIL_SEGMENTS * 6);
  const cueGeometry = new LineSegmentsGeometry().setPositions(cuePositions);
  const cueAttribute = (cueGeometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data;
  cueAttribute.setUsage(THREE.DynamicDrawUsage);
  cueGeometry.instanceCount = 0;
  const cueMaterial = new LineMaterial({ color: 0xffd878, linewidth: 2.4,
    transparent: true, opacity: .8, depthWrite: false, toneMapped: false });
  const flightCues = new LineSegments2(cueGeometry, cueMaterial);
  flightCues.name = "runtime-projectile-visibility-trails";
  flightCues.frustumCulled = false;
  root.add(flightCues);

  const markerPositions = new Float32Array(maxActiveProjectiles * 3);
  const markerGeometry = new THREE.BufferGeometry();
  const markerAttribute = new THREE.BufferAttribute(markerPositions, 3).setUsage(THREE.DynamicDrawUsage);
  markerGeometry.setAttribute("position", markerAttribute);
  markerGeometry.setDrawRange(0, 0);
  const markerMaterial = new THREE.ShaderMaterial({
    uniforms: { pointSize: { value: 7 } },
    vertexShader: `uniform float pointSize;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointSize;
      }`,
    fragmentShader: `void main() {
      float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
      float alpha = 1.0 - smoothstep(0.5, 1.0, radius);
      if (alpha <= 0.0) discard;
      gl_FragColor = vec4(mix(vec3(1.0), vec3(1.0, 0.65, 0.18), smoothstep(0.15, 0.85, radius)), alpha);
    }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const markers = new THREE.Points(markerGeometry, markerMaterial);
  markers.name = "runtime-projectile-visibility-markers";
  markers.frustumCulled = false;
  markers.onBeforeRender = (renderer) => { markerMaterial.uniforms.pointSize!.value = 7 * renderer.getPixelRatio(); };
  root.add(markers);
  scene.add(root);

  const active: Array<{
    request: VehicleProjectileVisualRequest;
    startedAtMs: number;
  }> = [];
  const bodyTransform = new THREE.Object3D();
  const instanceMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const trailStart = new THREE.Vector3();
  let animationFrame = 0;
  let publishedCount = -1;
  let enhanced = visibilityEnhanced;

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
    for (const primitives of readyModels.values()) for (const primitive of primitives) primitive.batch.count = 0;
    root.visible = active.length > 0;
    flightCues.visible = markers.visible = enhanced;
    trails.visible = !enhanced;
    let trailCount = 0;
    let cueCount = 0;
    let markerCount = 0;
    active.forEach((playback) => {
      const elapsedSeconds = (frameTimeMs - playback.startedAtMs) / 1000;
      const sample = sampleProjectileTrajectory(
        playback.request.samples,
        elapsedSeconds,
      );
      if (!sample) return;
      position.set(
        sample.positionCm.x / 100,
        sample.positionCm.z / 100,
        sample.positionCm.y / 100,
      );
      const facing = sample.bodyDirection ?? sample.velocityCmPerSecond;
      direction.set(facing.x, facing.z, facing.y);
      if (direction.lengthSq() < 1e-10) direction.set(1, 0, 0);
      else direction.normalize();
      bodyTransform.position.copy(position);
      // SpawnProjectile uses ShootDir.ToOrientationRotator(): yaw/pitch with
      // zero roll, not the shortest-arc rotation (which rolls diagonal shots).
      bodyTransform.rotation.set(0, -Math.atan2(direction.z, direction.x),
        Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), "YZX");
      bodyTransform.scale.set(1, 1, 1);
      bodyTransform.updateMatrix();
      for (const part of readyVisuals.get(playback.request.visual) ?? []) {
        const batch = part.primitive.batch;
        instanceMatrix.multiplyMatrices(bodyTransform.matrix, part.local);
        batch.setMatrixAt(batch.count++, instanceMatrix);
      }
      if (enhanced) {
        position.toArray(markerPositions, markerCount++ * 3);
        const speedMPerSecond = Math.hypot(sample.velocityCmPerSecond.x,
          sample.velocityCmPerSecond.y, sample.velocityCmPerSecond.z) / 100;
        const tailSeconds = Math.min(.18, 120 / Math.max(1, speedMPerSecond));
        const fromSeconds = Math.max(0, elapsedSeconds - tailSeconds);
        // Follow the already solved curve, never extrapolate a straight streak
        // through a bend or change the projectile's speed to keep it visible.
        let previous = sampleProjectileTrajectory(playback.request.samples, fromSeconds)!;
        for (let step = 1; step <= VISIBILITY_TRAIL_SEGMENTS; step++) {
          const next = step === VISIBILITY_TRAIL_SEGMENTS ? sample : sampleProjectileTrajectory(
            playback.request.samples, fromSeconds + (elapsedSeconds - fromSeconds) * step / VISIBILITY_TRAIL_SEGMENTS,
          )!;
          const offset = cueCount++ * 6;
          cuePositions[offset] = previous.positionCm.x / 100;
          cuePositions[offset + 1] = previous.positionCm.z / 100;
          cuePositions[offset + 2] = previous.positionCm.y / 100;
          cuePositions[offset + 3] = next.positionCm.x / 100;
          cuePositions[offset + 4] = next.positionCm.z / 100;
          cuePositions[offset + 5] = next.positionCm.y / 100;
          previous = next;
        }
        return;
      }
      // A flight cue represents only an authored particle route. Mesh-only and
      // invisible projectiles must not acquire the old universal gold trail.
      if (!playback.request.visual.effects.length &&
          !(playback.request.visual.nativeTracer.isTracer && playback.request.visual.nativeTracer.effect)) return;
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
      // The flight cue follows travel, even when the authored body keeps its
      // launch facing instead of turning with gravity.
      direction.set(sample.velocityCmPerSecond.x, sample.velocityCmPerSecond.z,
        sample.velocityCmPerSecond.y).normalize();
      trailStart.copy(position).addScaledVector(direction, -trailLengthM);
      const offset = trailCount++ * 6;
      trailPositions[offset] = trailStart.x;
      trailPositions[offset + 1] = trailStart.y;
      trailPositions[offset + 2] = trailStart.z;
      trailPositions[offset + 3] = position.x;
      trailPositions[offset + 4] = position.y;
      trailPositions[offset + 5] = position.z;
    });
    for (const primitives of readyModels.values()) for (const primitive of primitives) primitive.batch.instanceMatrix.needsUpdate = true;
    trailGeometry.setDrawRange(0, trailCount * 2);
    trailAttribute.needsUpdate = true;
    cueGeometry.instanceCount = cueCount;
    cueAttribute.needsUpdate = true;
    markerGeometry.setDrawRange(0, markerCount);
    markerAttribute.needsUpdate = true;
    if (publishedCount !== active.length) { onActiveCountChange?.(active.length); publishedCount = active.length; }
    render();
    if (active.length > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      onSettled?.();
    }
  };

  return {
    prepare,
    setVisibilityEnhanced(value: boolean) {
      enhanced = value;
      flightCues.visible = markers.visible = value;
      trails.visible = !value;
      if (!disposed && active.length > 0 && animationFrame === 0) animationFrame = requestAnimationFrame(animate);
    },
    spawn(request: VehicleProjectileVisualRequest) {
      if (disposed || request.samples.length < 2) return false;
      void prepare(request.visual).catch(error => onResourceError?.(error instanceof Error ? error : new Error(String(error))));
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
      for (const primitives of readyModels.values()) for (const primitive of primitives) primitive.batch.dispose();
      ownedGeometry.forEach(value => value.dispose());
      ownedMaterials.forEach(value => value.dispose());
      ownedTextures.forEach(value => value.dispose());
      models.clear(); readyModels.clear(); preparations.clear(); readyVisuals.clear();
      trailGeometry.dispose();
      trailMaterial.dispose();
      cueGeometry.dispose(); cueMaterial.dispose();
      markerGeometry.dispose(); markerMaterial.dispose();
    },
  };
}
