export interface VehicleRadialDamageModel {
  schemaVersion: "sigua-vehicle-radial-damage-model/v2";
  sourceBuildId: string;
  sourceCase: "radial-query-payload-v10.5.3";
  algorithmPath: "/algorithms/explosion/editor-radial-damage.js";
  queryAlgorithmPath: "/algorithms/explosion/vehicle-radial-query.js";
  evidenceBoundary: "native-query-static-closed-runtime-placement-required";
  query: {
    objectMask: 71;
    onlyDamageMeshes: true;
    candidateMode: "native-sphere-overlap-by-object-type";
    killZoneMode: "strict-point-to-component-aabb";
    visibilityMode: "multi-hit-object-trace-to-bounds-origin";
    hitMultiplicity: "preserved";
    payloadSchemaVersion: "sigua-vehicle-radial-query-source/v1";
    sourceDataRevision: string;
    artifactCount: 470;
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
  "squad-sdk-v10.5.3-17c100ea5182370e" as const;

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
    model?.schemaVersion !== "sigua-vehicle-radial-damage-model/v2" ||
    model.sourceBuildId !== VEHICLE_RADIAL_DAMAGE_SOURCE_BUILD_ID ||
    model.sourceCase !== "radial-query-payload-v10.5.3" ||
    model.algorithmPath !== "/algorithms/explosion/editor-radial-damage.js" ||
    model.queryAlgorithmPath !== "/algorithms/explosion/vehicle-radial-query.js" ||
    model.evidenceBoundary !==
      "native-query-static-closed-runtime-placement-required" ||
    model.query?.objectMask !== 0x47 ||
    model.query.onlyDamageMeshes !== true ||
    model.query.candidateMode !== "native-sphere-overlap-by-object-type" ||
    model.query.killZoneMode !== "strict-point-to-component-aabb" ||
    model.query.visibilityMode !==
      "multi-hit-object-trace-to-bounds-origin" ||
    model.query.hitMultiplicity !== "preserved" ||
    model.query.payloadSchemaVersion !== "sigua-vehicle-radial-query-source/v1" ||
    !/^[a-f0-9]{64}$/u.test(model.query.sourceDataRevision) ||
    model.query.artifactCount !== 470 ||
    model.receiver?.rootActorDeliveriesPerLayer !== 1 ||
    !stringArray(model.receiver.driveTrainClassPaths) ||
    model.receiver.driveTrainDispatch !== "once-per-component-hit" ||
    model.receiver.nonDriveTrainComponentFanout !== "none" ||
    model.receiver.seatForwarding !== "pass-damage-and-pass-radial"
  ) {
    throw new Error("SiguaWiki 径向载具伤害模型格式不受支持");
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

export function isVehicleRadialDriveTrainClass(
  model: VehicleRadialDamageModel,
  classPath: string,
) {
  return model.receiver.driveTrainClassPaths.includes(classPath);
}
