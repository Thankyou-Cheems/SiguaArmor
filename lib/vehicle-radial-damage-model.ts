export interface VehicleRadialDamageModel {
  schemaVersion: "sigua-vehicle-radial-damage-model/v1";
  sourceBuildId: string;
  sourceCase: "radial-vehicle-module-damage-closure";
  algorithmPath: "/algorithms/explosion/editor-radial-damage.js";
  evidenceBoundary: "native-receiver-closed-native-hit-multiset-required";
  query: {
    objectMask: 71;
    eligibleCollisionProfiles: string[];
    excludedCollisionProfiles: string[];
    unresolvedCollisionProfiles: string[];
    candidateMode: "native-sphere-overlap-by-object-type";
    killZoneMode: "strict-point-to-component-aabb";
    visibilityMode: "multi-hit-object-trace-to-bounds-origin";
    hitMultiplicity: "preserved";
  };
  receiver: {
    rootActorDeliveriesPerLayer: 1;
    driveTrainClassPaths: string[];
    driveTrainDispatch: "once-per-component-hit";
    nonDriveTrainComponentFanout: "none";
    seatForwarding: "pass-damage-and-pass-radial";
  };
}

export const VEHICLE_RADIAL_DAMAGE_SOURCE_BUILD_ID =
  "squad-sdk-v10.5.2-543fd6c7f4ae13f0" as const;

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length;
}

export function validateVehicleRadialDamageModel(
  value: unknown,
): VehicleRadialDamageModel {
  const model = value as VehicleRadialDamageModel;
  if (
    model?.schemaVersion !== "sigua-vehicle-radial-damage-model/v1" ||
    model.sourceBuildId !== VEHICLE_RADIAL_DAMAGE_SOURCE_BUILD_ID ||
    model.sourceCase !== "radial-vehicle-module-damage-closure" ||
    model.algorithmPath !== "/algorithms/explosion/editor-radial-damage.js" ||
    model.evidenceBoundary !==
      "native-receiver-closed-native-hit-multiset-required" ||
    model.query?.objectMask !== 0x47 ||
    !stringArray(model.query.eligibleCollisionProfiles) ||
    !stringArray(model.query.excludedCollisionProfiles) ||
    !stringArray(model.query.unresolvedCollisionProfiles) ||
    model.query.candidateMode !== "native-sphere-overlap-by-object-type" ||
    model.query.killZoneMode !== "strict-point-to-component-aabb" ||
    model.query.visibilityMode !==
      "multi-hit-object-trace-to-bounds-origin" ||
    model.query.hitMultiplicity !== "preserved" ||
    model.receiver?.rootActorDeliveriesPerLayer !== 1 ||
    !stringArray(model.receiver.driveTrainClassPaths) ||
    model.receiver.driveTrainDispatch !== "once-per-component-hit" ||
    model.receiver.nonDriveTrainComponentFanout !== "none" ||
    model.receiver.seatForwarding !== "pass-damage-and-pass-radial"
  ) {
    throw new Error("SiguaWiki 径向载具伤害模型格式不受支持");
  }
  const classifiedProfiles = [
    ...model.query.eligibleCollisionProfiles,
    ...model.query.excludedCollisionProfiles,
    ...model.query.unresolvedCollisionProfiles,
  ];
  if (new Set(classifiedProfiles).size !== classifiedProfiles.length) {
    throw new Error("SiguaWiki 径向碰撞配置存在冲突");
  }
  for (const requiredClass of [
    "/Script/Squad.SQDriveTrainComponent",
    "/Script/Squad.SQVehicleTrack",
    "/Script/Squad.SQVehicleWheel",
  ]) {
    if (!model.receiver.driveTrainClassPaths.includes(requiredClass)) {
      throw new Error(`SiguaWiki 径向模型缺少 ${requiredClass}`);
    }
  }
  return model;
}

export function vehicleRadialCollisionProfileState(
  model: VehicleRadialDamageModel,
  collisionProfile: string | null,
): "eligible" | "excluded" | "native-unknown" {
  if (
    collisionProfile !== null &&
    model.query.eligibleCollisionProfiles.includes(collisionProfile)
  ) return "eligible";
  if (
    collisionProfile !== null &&
    model.query.excludedCollisionProfiles.includes(collisionProfile)
  ) return "excluded";
  return "native-unknown";
}

export function isVehicleRadialDriveTrainClass(
  model: VehicleRadialDamageModel,
  classPath: string,
) {
  return model.receiver.driveTrainClassPaths.includes(classPath);
}
