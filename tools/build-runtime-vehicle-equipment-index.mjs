import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactRevision,
  canonicalJsonBytes,
  readJsonArtifact,
  sha256,
  writeOrCheckArtifact,
} from "./lib/generated-json-artifact.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CATALOG_RELATIVE_PATH =
  "generated/internal/weapon-catalog.json";
const OUTPUT_RELATIVE_PATH =
  "app/runtime-vehicle-equipment-index.json";
const CATALOG_PATH = path.join(
  ROOT,
  ...CATALOG_RELATIVE_PATH.split("/"),
);
const OUTPUT_PATH = path.join(
  ROOT,
  ...OUTPUT_RELATIVE_PATH.split("/"),
);
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(
    `Runtime vehicle equipment index: unsupported arguments ${unknownArguments.join(", ")}`,
  );
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(
      `Runtime vehicle equipment index: ${message}`,
    );
  }
}

function validateEquipment(equipment, bindingId) {
  invariant(
    equipment &&
      typeof equipment === "object" &&
      typeof equipment.gunName === "string" &&
      typeof equipment.displayName === "string" &&
      (equipment.turretName === null ||
        typeof equipment.turretName === "string") &&
      equipment.projectile &&
      typeof equipment.projectile === "object" &&
      equipment.mechanics &&
      typeof equipment.mechanics === "object",
    `${bindingId} equipment payload is incomplete`,
  );
}

const { bytes: catalogBytes, value: catalog } =
  await readJsonArtifact(
    CATALOG_PATH,
    CATALOG_RELATIVE_PATH,
  );
const bindings =
  catalog.relations?.vehicleEquipmentBindings;
const variants = catalog.selector?.variants;
const directDamageModels =
  catalog.mechanics?.directDamageModels;
invariant(
  catalog.schemaVersion === "sigua-weapon-catalog/v2" &&
    catalog.audit?.vehicleEquipmentReferenceClosure === true &&
    catalog.audit?.vehicleEquipmentSelectorRelationClosure === true &&
    catalog.audit?.vehicleEquipmentSelectorResolutionUnambiguous === true &&
    Array.isArray(bindings) &&
    bindings.length > 0 &&
    Array.isArray(variants) &&
    Array.isArray(directDamageModels) &&
    catalog.counts?.vehicleEquipmentBindings ===
      bindings.length,
  "canonical weapon catalog binding closure is invalid",
);

const variantById = new Map(
  variants.map((variant) => [variant.id, variant]),
);
const directDamageModelById = new Map(
  directDamageModels.map((model) => [model.id, model]),
);

function canonicalEquipmentBallistics(binding) {
  if (binding.weaponVariantIds?.length !== 1) {
    return {
      armorPenetrationMm: binding.equipment.armorPenetrationMm,
      traceDistanceAfterPenM: binding.equipment.traceDistanceAfterPenM,
    };
  }
  const variant = variantById.get(binding.weaponVariantIds[0]);
  const directDamageModel = variant?.directDamageModelId
    ? directDamageModelById.get(variant.directDamageModelId)
    : null;
  if (!directDamageModel) {
    return {
      armorPenetrationMm: binding.equipment.armorPenetrationMm,
      traceDistanceAfterPenM: binding.equipment.traceDistanceAfterPenM,
    };
  }
  invariant(
    Number.isFinite(directDamageModel.penetrationMm) &&
      directDamageModel.penetrationMm >= 0 &&
      Number.isFinite(
        directDamageModel.traceDistanceAfterPenetrationM,
      ) &&
      directDamageModel.traceDistanceAfterPenetrationM >= 0,
    `${binding.id} canonical direct ballistics are invalid`,
  );
  return {
    armorPenetrationMm: directDamageModel.penetrationMm,
    traceDistanceAfterPenM:
      directDamageModel.traceDistanceAfterPenetrationM,
  };
}

const seenIds = new Set();
const projectedBindings = bindings.map((binding) => {
  invariant(
    typeof binding?.id === "string" &&
      binding.id.length > 0 &&
      !seenIds.has(binding.id) &&
      typeof binding.cardId === "string" &&
      binding.cardId.length > 0 &&
      typeof binding.rawName === "string" &&
      binding.rawName.length > 0 &&
      typeof binding.weaponClass === "string" &&
      binding.weaponClass.length > 0 &&
      Number.isInteger(binding.sourceIndex) &&
      binding.sourceIndex >= 0,
    `binding ${binding?.id ?? "missing"} is invalid or duplicated`,
  );
  seenIds.add(binding.id);
  validateEquipment(binding.equipment, binding.id);
  const canonicalBallistics = canonicalEquipmentBallistics(binding);
  return {
    id: binding.id,
    cardId: binding.cardId,
    rawName: binding.rawName,
    weaponClass: binding.weaponClass,
    turretName: binding.turretName,
    sourceIndex: binding.sourceIndex,
    equipment: {
      ...binding.equipment,
      // Raw vehicle equipment rows can retain stale weapon defaults. The
      // uniquely resolved direct model combines the native projectile
      // penetration input with the firing weapon's continuation distance.
      ...canonicalBallistics,
    },
  };
});

const core = {
  schemaVersion:
    "sigua-runtime-vehicle-equipment-index/v2",
  catalog: {
    schemaVersion: catalog.schemaVersion,
    catalogRevision: catalog.catalogRevision,
    bytes: catalogBytes.length,
    sha256: sha256(catalogBytes),
  },
  counts: {
    bindings: projectedBindings.length,
  },
  bindings: projectedBindings,
};
const output = {
  ...core,
  projectionRevision: artifactRevision(core),
};
const outputBytes = canonicalJsonBytes(output);
const result = await writeOrCheckArtifact({
  filePath: OUTPUT_PATH,
  bytes: outputBytes,
  checkOnly,
  label: OUTPUT_RELATIVE_PATH,
});

process.stdout.write(
  `${JSON.stringify({
    status: result.status,
    outputPath: OUTPUT_RELATIVE_PATH,
    catalogSha256: output.catalog.sha256,
    projectionRevision: output.projectionRevision,
    bindings: output.counts.bindings,
  })}\n`,
);
