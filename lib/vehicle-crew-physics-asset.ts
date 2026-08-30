import { loadWikiDataset } from "./wiki-source";

export type VehicleCrewPhysicsPrimitive = {
  id: string;
  centerCm: { x: number; y: number; z: number };
  rotationDegrees: { pitch: number; yaw: number; roll: number };
} & (
  | { type: "capsule"; radiusCm: number; lengthCm: number }
  | { type: "box"; sizeCm: { x: number; y: number; z: number } }
);

export interface VehicleCrewPhysicsBody {
  id: string;
  boneName: string;
  referenceComponentTransform: {
    translationCm: { x: number; y: number; z: number };
    rotationQuaternion: { x: number; y: number; z: number; w: number };
    scale3D: { x: number; y: number; z: number };
  };
  damageMultiplier:
    | { state: "observed"; value: number }
    | { state: "not-explicit"; value: null };
  primitives: VehicleCrewPhysicsPrimitive[];
}

export interface VehicleCrewPhysicsAsset {
  schemaVersion: "sigua-vehicle-crew-physics-asset/v1";
  sourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e";
  sourceDataRevision: string;
  id: string;
  state: "observed-editor-cdo-physics-asset";
  skeletonPath: string;
  physicsAssetPath: string;
  physicsShapeFingerprintSha256: string;
  coordinateSystem: {
    space: "unreal-skeleton-component-and-bone-local";
    units: "unreal-centimeters";
    axes: "x-forward-y-right-z-up";
  };
  sharing: {
    productionSoldierBlueprints: 558;
    skeletonGroups: 1;
    physicsAssetGroups: 1;
  };
  counts: {
    bodies: 12;
    primitives: 14;
    explicitDamageMultipliers: number;
  };
  bodies: VehicleCrewPhysicsBody[];
  evidence: {
    state: "validated-static-current-build";
    priorV1050PhysicsShapeFingerprintMatched: true;
    pieStarted: false;
    actorSpawned: false;
    packageSaved: false;
  };
  nonClaims: string[];
}

const PHYSICS_ASSET_PATH =
  "/Game/Art/Soldier2/TEST_US_Soldier_Skeleton_V3_Physics.TEST_US_Soldier_Skeleton_V3_Physics";
const PHYSICS_FINGERPRINT =
  "b7d3a998ac73187a6ee3b470e8981f8ed415cc678d0f072c33407f64e52760cc";

let request: Promise<VehicleCrewPhysicsAsset> | null = null;

function finiteVector(
  value: Record<string, unknown> | undefined,
  fields: string[],
) {
  return Boolean(value) && fields.every(
    (field) => typeof value?.[field] === "number" && Number.isFinite(value[field]),
  );
}

function validate(value: unknown) {
  const record = value as VehicleCrewPhysicsAsset;
  const primitiveCount = record.bodies?.reduce(
    (total, body) => total + (body.primitives?.length ?? 0),
    0,
  );
  if (
    record.schemaVersion !== "sigua-vehicle-crew-physics-asset/v1" ||
    record.sourceBuildId !== "squad-sdk-v10.5.3-17c100ea5182370e" ||
    record.state !== "observed-editor-cdo-physics-asset" ||
    record.physicsAssetPath !== PHYSICS_ASSET_PATH ||
    record.physicsShapeFingerprintSha256 !== PHYSICS_FINGERPRINT ||
    record.sharing?.productionSoldierBlueprints !== 558 ||
    record.counts?.bodies !== 12 ||
    record.counts.primitives !== 14 ||
    record.bodies?.length !== record.counts.bodies ||
    primitiveCount !== record.counts.primitives ||
    new Set(record.bodies.map(({ boneName }) => boneName)).size !==
      record.bodies.length
  ) {
    throw new Error("SiguaWiki crew PhysicsAsset identity is invalid");
  }
  for (const body of record.bodies) {
    if (
      !finiteVector(body.referenceComponentTransform?.translationCm, ["x", "y", "z"]) ||
      !finiteVector(body.referenceComponentTransform?.rotationQuaternion, ["x", "y", "z", "w"]) ||
      !finiteVector(body.referenceComponentTransform?.scale3D, ["x", "y", "z"]) ||
      body.primitives.length === 0
    ) {
      throw new Error(`SiguaWiki crew PhysicsAsset body ${body.id} is invalid`);
    }
    for (const primitive of body.primitives) {
      const dimensionsValid = primitive.type === "capsule"
        ? primitive.radiusCm > 0 && primitive.lengthCm >= 0
        : primitive.type === "box" &&
          primitive.sizeCm.x > 0 &&
          primitive.sizeCm.y > 0 &&
          primitive.sizeCm.z > 0;
      if (
        !finiteVector(primitive.centerCm, ["x", "y", "z"]) ||
        !finiteVector(primitive.rotationDegrees, ["pitch", "yaw", "roll"]) ||
        !dimensionsValid
      ) {
        throw new Error(
          `SiguaWiki crew PhysicsAsset primitive ${primitive.id} is invalid`,
        );
      }
    }
  }
  return record;
}

export function loadVehicleCrewPhysicsAsset() {
  if (request) return request;
  request = loadWikiDataset(
    "/data/vehicles/crew-physics-asset.json",
    "sigua-vehicle-crew-physics-asset/v1",
  ).then(validate).catch((error) => {
    request = null;
    throw error;
  });
  return request;
}
