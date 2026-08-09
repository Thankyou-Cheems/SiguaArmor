import { createHash } from "node:crypto";

export const RUNTIME_VISUAL_ARTIFACT_INDEX_SCHEMA_VERSION =
  "sigua-runtime-visual-artifact-index/v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VEHICLE_ID_PATTERN = /^vehicle-[a-f0-9]{64}$/u;
const SUPPORTED_EDITIONS = new Set(["international", "china"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function requireString(value, label) {
  invariant(
    typeof value === "string" && value.length > 0,
    `${label} is missing`,
  );
  return value;
}

function requireInteger(value, label, minimum = 0) {
  invariant(
    Number.isInteger(value) && value >= minimum,
    `${label} is invalid`,
  );
  return value;
}

function optionalString(value, label) {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function optionalInteger(value, label) {
  if (value === undefined) return undefined;
  return requireInteger(value, label);
}

function optionalBoolean(value, label) {
  if (value === undefined) return undefined;
  invariant(typeof value === "boolean", `${label} is invalid`);
  return value;
}

function projectPlacement(placement, descriptorLabel) {
  invariant(
    placement && typeof placement === "object" && !Array.isArray(placement),
    `${descriptorLabel} placement is invalid`,
  );
  const stableOccurrenceId = requireString(
    placement.stableOccurrenceId,
    `${descriptorLabel} placement stableOccurrenceId`,
  );
  invariant(
    Array.isArray(placement.matrix) &&
      placement.matrix.length === 16 &&
      placement.matrix.every(Number.isFinite),
    `${descriptorLabel} placement ${stableOccurrenceId} matrix is invalid`,
  );
  const runtimeBonePoseStatus = requireString(
    placement.runtimeBonePoseStatus,
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseStatus`,
  );
  invariant(
    runtimeBonePoseStatus === "observed" ||
      runtimeBonePoseStatus === "not-applicable",
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseStatus is unsupported`,
  );
  const runtimeBonePoseSha256 = optionalString(
    placement.runtimeBonePoseSha256,
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseSha256`,
  );
  if (runtimeBonePoseSha256 !== undefined) {
    invariant(
      SHA256_PATTERN.test(runtimeBonePoseSha256),
      `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseSha256 is invalid`,
    );
  }
  const runtimeBonePoseJointCount = optionalInteger(
    placement.runtimeBonePoseJointCount,
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseJointCount`,
  );
  const runtimeBonePoseNormalTimeSampleCount = optionalInteger(
    placement.runtimeBonePoseNormalTimeSampleCount,
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseNormalTimeSampleCount`,
  );
  const runtimeBonePoseReferenceEquivalent = optionalBoolean(
    placement.runtimeBonePoseReferenceEquivalent,
    `${descriptorLabel} placement ${stableOccurrenceId} runtimeBonePoseReferenceEquivalent`,
  );
  return {
    stableOccurrenceId,
    name: requireString(
      placement.name,
      `${descriptorLabel} placement ${stableOccurrenceId} name`,
    ),
    actor: requireString(
      placement.actor,
      `${descriptorLabel} placement ${stableOccurrenceId} actor`,
    ),
    assetUrl: requireString(
      placement.assetUrl,
      `${descriptorLabel} placement ${stableOccurrenceId} assetUrl`,
    ),
    matrix: [...placement.matrix],
    sourceMeshPath: requireString(
      placement.sourceMeshPath,
      `${descriptorLabel} placement ${stableOccurrenceId} sourceMeshPath`,
    ),
    componentClassPath: requireString(
      placement.componentClassPath,
      `${descriptorLabel} placement ${stableOccurrenceId} componentClassPath`,
    ),
    materialState: requireString(
      placement.materialState,
      `${descriptorLabel} placement ${stableOccurrenceId} materialState`,
    ),
    runtimeBonePoseStatus,
    ...(runtimeBonePoseSha256 === undefined
      ? {}
      : { runtimeBonePoseSha256 }),
    ...(runtimeBonePoseJointCount === undefined
      ? {}
      : { runtimeBonePoseJointCount }),
    ...(runtimeBonePoseNormalTimeSampleCount === undefined
      ? {}
      : { runtimeBonePoseNormalTimeSampleCount }),
    ...(runtimeBonePoseReferenceEquivalent === undefined
      ? {}
      : { runtimeBonePoseReferenceEquivalent }),
  };
}

export function createRuntimeVisualArtifact(
  descriptor,
  { edition, indexPath } = {},
) {
  invariant(
    descriptor && typeof descriptor === "object" && !Array.isArray(descriptor),
    "runtime visual descriptor is invalid",
  );
  invariant(
    SUPPORTED_EDITIONS.has(edition),
    `runtime visual edition is unsupported: ${edition ?? "missing"}`,
  );
  requireString(indexPath, "runtime visual indexPath");
  invariant(
    descriptor.schemaVersion === "runtime-visual-preview/v1",
    `runtime visual descriptor schema is ${descriptor.schemaVersion ?? "missing"}`,
  );

  const cardId = requireString(descriptor.cardId, "runtime visual cardId");
  const rawName = requireString(descriptor.rawName, "runtime visual rawName");
  const descriptorLabel = `${edition} ${cardId}/${rawName}`;
  const runtimeVehicleRef = requireString(
    descriptor.vehicleId,
    `${descriptorLabel} vehicleId`,
  );
  const identitySha256 = requireString(
    descriptor.identitySha256,
    `${descriptorLabel} identitySha256`,
  );
  const packageSha256 = requireString(
    descriptor.packageSha256,
    `${descriptorLabel} packageSha256`,
  );
  invariant(
    VEHICLE_ID_PATTERN.test(runtimeVehicleRef) &&
      SHA256_PATTERN.test(identitySha256) &&
      runtimeVehicleRef === `vehicle-${identitySha256}` &&
      SHA256_PATTERN.test(packageSha256),
    `${descriptorLabel} runtime identity is invalid`,
  );

  invariant(
    Array.isArray(descriptor.placements),
    `${descriptorLabel} placements are missing`,
  );
  const placements = descriptor.placements
    .map((placement) => projectPlacement(placement, descriptorLabel))
    .sort((left, right) =>
      left.stableOccurrenceId.localeCompare(
        right.stableOccurrenceId,
        "en",
      ),
    );
  const occurrenceIds = new Set(
    placements.map(({ stableOccurrenceId }) => stableOccurrenceId),
  );
  invariant(
    occurrenceIds.size === placements.length,
    `${descriptorLabel} has duplicate placement identities`,
  );
  const requiredOccurrences = requireInteger(
    descriptor.requiredOccurrences,
    `${descriptorLabel} requiredOccurrences`,
  );
  invariant(
    requiredOccurrences === placements.length,
    `${descriptorLabel} placement closure is incomplete`,
  );
  const sourceAssets = requireInteger(
    descriptor.sourceAssets,
    `${descriptorLabel} sourceAssets`,
  );
  invariant(
    sourceAssets ===
      new Set(placements.map(({ assetUrl }) => assetUrl)).size,
    `${descriptorLabel} source asset closure is invalid`,
  );
  const totalBytes = requireInteger(
    descriptor.totalBytes,
    `${descriptorLabel} totalBytes`,
  );
  const status = requireString(
    descriptor.status,
    `${descriptorLabel} status`,
  );
  const visualAcceptanceStatus = requireString(
    descriptor.visualAcceptanceStatus,
    `${descriptorLabel} visualAcceptanceStatus`,
  );
  const generatedClass = requireString(
    descriptor.generatedClass,
    `${descriptorLabel} generatedClass`,
  );
  const bindingKey = `${cardId}\u0000${rawName}`;

  const preimage = {
    schemaVersion: descriptor.schemaVersion,
    edition,
    bindingKey,
    factionId: requireString(
      descriptor.factionId,
      `${descriptorLabel} factionId`,
    ),
    targetKey: requireString(
      descriptor.targetKey,
      `${descriptorLabel} targetKey`,
    ),
    runtimeVehicleRef,
    generatedClass,
    identitySha256,
    packageSha256,
    requiredOccurrences,
    sourceAssets,
    totalBytes,
    runtimeBonePoseStatus: requireString(
      descriptor.runtimeBonePoseStatus,
      `${descriptorLabel} runtimeBonePoseStatus`,
    ),
    runtimeBonePoseOccurrenceCount: requireInteger(
      descriptor.runtimeBonePoseOccurrenceCount,
      `${descriptorLabel} runtimeBonePoseOccurrenceCount`,
    ),
    runtimeBonePoseJointCount: requireInteger(
      descriptor.runtimeBonePoseJointCount,
      `${descriptorLabel} runtimeBonePoseJointCount`,
    ),
    runtimeBonePoseReferenceEquivalentOccurrenceCount:
      requireInteger(
        descriptor.runtimeBonePoseReferenceEquivalentOccurrenceCount,
        `${descriptorLabel} runtimeBonePoseReferenceEquivalentOccurrenceCount`,
      ),
    placements,
  };
  const digest = createHash("sha256")
    .update(stableJson(preimage))
    .digest("hex");

  return {
    id: `visual-artifact-${digest}`,
    edition,
    bindingKey,
    cardId,
    rawName,
    runtimeVehicleRef,
    generatedClass,
    identitySha256,
    packageSha256,
    status,
    visualAcceptanceStatus,
    sourceAssets,
    totalBytes,
    placementCount: placements.length,
    indexPath,
  };
}
