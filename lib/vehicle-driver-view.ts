import type { RuntimeCrewSeatFrame } from "./vehicle-crew-seat-runtime.ts";
import { crewViewBasePose } from "./vehicle-crew-viewpoint.ts";

export interface VehicleDriverMaskAsset {
  id: string;
  sourceMeshPath: string;
  state: "derived-geometry-only-glb";
  assetUrl: string;
  bytes: number;
  sha256: string;
  stats: {
    meshes: number;
    primitives: number;
    vertices: number;
    triangles: number;
    materials: 0;
    textures: 0;
  };
  materialPolicy: "source-geometry-product-matte";
  primitiveMaterialRoles: Array<{
    meshIndex: number;
    primitiveIndex: number;
    sourceMaterialName: string | null;
    role: "frame" | "glass";
  }>;
}

export type VehicleDriverMask = {
  state: "observed-source-viewport-geometry";
  componentName: string;
  componentClassPath: "/Script/Engine.StaticMeshComponent";
  sourceMeshPath: string;
  attachParent: {
    componentName: string;
    componentClassPath: string;
    sourceMeshPath: string | null;
  } | null;
  attachSocketName: string | null;
  vehicleLocalFrame: RuntimeCrewSeatFrame;
  cameraRelativeFrame: RuntimeCrewSeatFrame;
  presentationMaterial: "source-geometry-matte";
  asset: VehicleDriverMaskAsset;
} | {
  state: "absent-no-first-person-viewport-geometry";
  reason: string;
};

export interface VehicleDriverViewRecord {
  schemaVersion: "sigua-vehicle-driver-view/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceVehicleRef: string;
  rawName: string;
  targetPackage: string;
  generatedClass: string;
  seatKey: string;
  catalogSeatIndex: 1;
  role: "driver";
  camera: {
    viewId: "driver-default";
    source: "constructed-vehicle-camera-component";
    componentName: "FirstPersonVehicleCam";
    dynamicParent: {
      componentName: "FirstPersonVehicleSpringArm";
      componentClassPath: string;
      socketName: string | null;
    };
    vehicleLocalFrame: RuntimeCrewSeatFrame;
    baseHorizontalFovDegrees: { state: "observed"; value: number };
    focusZoom: {
      fovDegrees: number | null;
      alwaysAvailable: boolean | null;
      maxSpeed: number | null;
    };
  };
  mask: VehicleDriverMask;
  evidence: {
    state: "derived-static-editor-driver-view";
    sourceCrewDataRevision: string;
    sourceProbeEvidenceRevision: string;
    sourceDataRevision: string;
    maskSelection: string;
    network: "out-of-scope";
    finalRuntimeViewTarget: "native-unknown";
  };
}

function finiteFrame(frame: RuntimeCrewSeatFrame) {
  const value = frame?.value;
  return Boolean(
    value &&
      ["observed", "derived", "derived-with-fallback"].includes(frame.state) &&
      [value.translationCm.x, value.translationCm.y, value.translationCm.z]
        .every(Number.isFinite) &&
      [
        value.rotationQuaternion.x,
        value.rotationQuaternion.y,
        value.rotationQuaternion.z,
        value.rotationQuaternion.w,
      ].every(Number.isFinite) &&
      [value.scale3D.x, value.scale3D.y, value.scale3D.z].every(Number.isFinite),
  );
}

export function projectVehicleDriverView(
  value: unknown,
  expected: {
    sourceVehicleRef: string;
    rawName: string;
    generatedClass: string;
  },
) {
  const record = value as VehicleDriverViewRecord;
  if (
    record.schemaVersion !== "sigua-vehicle-driver-view/v1" ||
    record.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
    record.sourceVehicleRef !== expected.sourceVehicleRef ||
    record.rawName !== expected.rawName ||
    record.generatedClass !== expected.generatedClass ||
    record.seatKey !== `${record.sourceVehicleRef}:catalog-seat:1` ||
    record.catalogSeatIndex !== 1 ||
    record.role !== "driver" ||
    record.camera?.viewId !== "driver-default" ||
    record.camera.source !== "constructed-vehicle-camera-component" ||
    record.camera.componentName !== "FirstPersonVehicleCam" ||
    record.camera.dynamicParent?.componentName !==
      "FirstPersonVehicleSpringArm" ||
    !finiteFrame(record.camera.vehicleLocalFrame) ||
    record.camera.baseHorizontalFovDegrees?.state !== "observed" ||
    !Number.isFinite(record.camera.baseHorizontalFovDegrees.value) ||
    !/^[a-f0-9]{64}$/u.test(record.evidence?.sourceDataRevision ?? "") ||
    record.evidence.network !== "out-of-scope" ||
    record.evidence.finalRuntimeViewTarget !== "native-unknown"
  ) throw new Error(`SiguaWiki driver view differs for ${expected.rawName}`);

  if (record.mask.state === "observed-source-viewport-geometry") {
    const asset = record.mask.asset;
    if (
      record.mask.componentClassPath !== "/Script/Engine.StaticMeshComponent" ||
      !record.mask.sourceMeshPath.startsWith("/Game/") ||
      !finiteFrame(record.mask.vehicleLocalFrame) ||
      !finiteFrame(record.mask.cameraRelativeFrame) ||
      record.mask.presentationMaterial !== "source-geometry-matte" ||
      asset.state !== "derived-geometry-only-glb" ||
      !/^\/assets\/vehicle-driver-views\/mask-[a-f0-9]{64}\.glb$/u.test(
        asset.assetUrl,
      ) ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256) ||
      asset.bytes <= 0 ||
      asset.stats.materials !== 0 ||
      asset.stats.textures !== 0 ||
      asset.primitiveMaterialRoles.length !== asset.stats.primitives
    ) throw new Error(`SiguaWiki driver mask differs for ${expected.rawName}`);
  } else if (
    record.mask.state !== "absent-no-first-person-viewport-geometry" ||
    typeof record.mask.reason !== "string"
  ) throw new Error(`SiguaWiki driver mask state differs for ${expected.rawName}`);
  return record;
}

export function driverViewPose(record: VehicleDriverViewRecord) {
  return crewViewBasePose({
    vehicleLocalFrame: record.camera.vehicleLocalFrame,
    baseHorizontalFovDegrees: record.camera.baseHorizontalFovDegrees,
  });
}
