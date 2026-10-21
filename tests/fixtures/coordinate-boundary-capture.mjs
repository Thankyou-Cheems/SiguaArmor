// Synthetic inputs through real consumer APIs; no game data, network or renderer.
import * as THREE from 'three';
import {crewViewBasePose} from '../../lib/vehicle-crew-viewpoint.ts';
import {resolveRuntimeTurretMotionFrame} from '../../lib/turret-articulation.ts';
import {vehicleProjectileAnchorMatrixFromUnrealFrame,resolveVehicleProjectileLaunchPose,resolveVehicleGuidanceAimPose} from '../../lib/vehicle-projectile-three-runtime.ts';
import {narvaPlacementMatrix} from '../../lib/runtime-narva-school-environment.ts';
const current={crewViewBasePose,resolveRuntimeTurretMotionFrame,vehicleProjectileAnchorMatrixFromUnrealFrame,resolveVehicleProjectileLaunchPose,resolveVehicleGuidanceAimPose,narvaPlacementMatrix};
export function captureCoordinateBoundaries(input,api=current) {
  const vector=values=>Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,values[i]]));
  const frame=(t=input.translationCm,q=input.quaternion)=>({translationCm:vector(t),rotationQuaternion:Object.fromEntries(['x','y','z','w'].map((axis,i)=>[axis,q[i]])),scale3D:vector(input.scale)});
  const state=value=>({state:'derived',value,reason:null});
  const crew=api.crewViewBasePose({vehicleLocalFrame:state(frame()),baseHorizontalFovDegrees:{state:'observed',value:input.horizontalFov}});
  const driver=t=>({componentName:'synthetic-driver',componentClassPath:'/Script/Engine.SceneComponent',vehicleLocalFrame:state(frame(t))});
  const turret=api.resolveRuntimeTurretMotionFrame({state:'closed',movementState:'observed',motion:{state:'derived',yawDriver:driver(input.translationCm),pitchDriver:driver(input.pitchTranslationCm)}});
  const projectileAnchor=api.vehicleProjectileAnchorMatrixFromUnrealFrame(frame());
  const parent=new THREE.Object3D(); parent.position.fromArray(input.viewerOriginM); parent.quaternion.fromArray(input.viewerQuaternion); parent.scale.fromArray(input.viewerScale);
  const anchor=new THREE.Object3D(); anchor.matrixAutoUpdate=false; anchor.matrix.copy(projectileAnchor); parent.add(anchor);
  const projectileLaunch=api.resolveVehicleProjectileLaunchPose({anchor,socketTranslationCm:vector(input.socketCm),socketDirection:vector(input.socketDirection),forwardOffsetCm:input.forwardOffsetCm});
  const camera=new THREE.PerspectiveCamera(); camera.position.fromArray(input.viewerOriginM);camera.quaternion.fromArray(input.viewerQuaternion);
  const guidance=api.resolveVehicleGuidanceAimPose(camera);
  const schoolPlacement=api.narvaPlacementMatrix({sourceTransform:{translationMeters:input.translationCm.map(v=>v/100),rotationQuaternion:input.quaternion,scale3d:input.scale}},input.sourceAnchorM).elements;
  return {crew,turret,projectileAnchor:projectileAnchor.elements,projectileLaunch,guidance,schoolPlacement};
}
