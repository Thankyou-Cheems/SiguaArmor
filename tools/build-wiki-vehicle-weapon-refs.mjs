import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createVehicleCatalogResolver,
  validateVehicleCatalog,
} from "../lib/vehicle-catalog.mjs";
import {
  writeFileWithRetry,
} from "./lib/generated-json-artifact.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const WEAPON_CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "weapon-catalog.json",
);
const VEHICLE_CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "vehicle-catalog.json",
);
const VEHICLES_PATH = path.join(
  ROOT,
  "generated",
  "wiki-vehicles.json",
);
const OUTPUT_SCHEMA = "sigua-wiki-vehicles/v3";
const SOURCE_SCHEMAS = new Set([
  "sigua-wiki-vehicles/v2",
  OUTPUT_SCHEMA,
]);
const checkOnly = process.argv.includes("--check");

const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");
if (unknownArguments.length > 0) {
  throw new Error(
    `Wiki vehicle weapon refs: unsupported arguments ${unknownArguments.join(", ")}`,
  );
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Wiki vehicle weapon refs: ${message}`);
  }
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), "en");
}

function sortedUnique(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ].sort(compareText);
}

function requiredString(value, label) {
  invariant(
    typeof value === "string" && value.length > 0,
    `${label} must be a non-empty string`,
  );
  return value;
}

function requiredBoolean(value, label) {
  invariant(typeof value === "boolean", `${label} must be a boolean`);
  return value;
}

function stringArray(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value.map((item, index) =>
    requiredString(item, `${label}[${index}]`),
  );
}

function sourceVehicleIndex(vehicles) {
  const index = new Map();
  for (const [itemIndex, entry] of vehicles.items.entries()) {
    invariant(
      entry && typeof entry === "object",
      `source item ${itemIndex} must be an object`,
    );
    const cardId = requiredString(
      entry.cardId,
      `source item ${itemIndex}.cardId`,
    );
    const rawName = requiredString(
      entry.rawName,
      `source item ${itemIndex}.rawName`,
    );
    const key = `${cardId}\u0000${rawName}`;
    invariant(!index.has(key), `duplicate source identity ${cardId}/${rawName}`);
    index.set(key, entry);
  }
  return index;
}

function weaponBindingIndex(catalog) {
  const index = new Map();
  for (const binding of catalog.relations.vehicleEquipmentBindings) {
    invariant(
      typeof binding?.id === "string" && !index.has(binding.id),
      `weapon equipment binding identity is invalid for ${binding?.id ?? "missing"}`,
    );
    index.set(binding.id, binding);
  }
  return index;
}

function projectVehicle(entry, binding, variantIds) {
  const label = `${binding.cardId}/${binding.rawName}`;
  const sourceDisplayName = requiredString(
    entry.displayName,
    `${label}.displayName`,
  );
  const sourceType = requiredString(entry.type, `${label}.type`);
  invariant(
    requiredString(entry.factionId, `${label}.factionId`).toLowerCase() ===
      binding.factionId,
    `${label} faction identity drifted`,
  );
  invariant(
    sourceDisplayName === binding.displayName,
    `${label} display name drifted`,
  );
  invariant(sourceType === binding.type, `${label} type drifted`);
  return {
    catalogBindingRef: binding.id,
    vehicleRef: binding.vehicleRef,
    runtimeVehicleRef: binding.runtimeVehicleRef,
    cardId: binding.cardId,
    factionId: binding.factionId,
    rawName: binding.rawName,
    displayName: binding.displayName,
    icon: requiredString(entry.icon, `${label}.icon`),
    factions: stringArray(entry.factions, `${label}.factions`),
    type: binding.type,
    vehicleTags: stringArray(
      entry.vehicleTags,
      `${label}.vehicleTags`,
    ),
    amphibious: requiredBoolean(
      entry.amphibious,
      `${label}.amphibious`,
    ),
    weaponVariantIds: variantIds,
  };
}

function buildPayload(weaponCatalog, vehicleCatalog, vehicles) {
  invariant(
    weaponCatalog.schemaVersion === "sigua-weapon-catalog/v2" &&
      weaponCatalog.audit?.referenceClosure === true &&
      weaponCatalog.audit?.exactVehicleOwnership === true,
    "canonical weapon catalog is not closed",
  );
  validateVehicleCatalog(vehicleCatalog);
  invariant(
    SOURCE_SCHEMAS.has(vehicles.schemaVersion) &&
      Array.isArray(vehicles.items),
    `unsupported vehicle source schema ${vehicles.schemaVersion}`,
  );
  invariant(
    vehicleCatalog.dataRevision?.weaponCatalog ===
      weaponCatalog.catalogRevision,
    "vehicle and weapon catalog revisions disagree",
  );

  const variantById = new Map(
    weaponCatalog.selector.variants.map((variant) => [
      variant.id,
      variant,
    ]),
  );
  const equipmentById = weaponBindingIndex(weaponCatalog);
  const sourceByIdentity = sourceVehicleIndex(vehicles);
  const vehicleResolver = createVehicleCatalogResolver(vehicleCatalog);
  const usedSourceIdentities = new Set();
  const items = vehicleCatalog.identities.catalogBindings.map((binding) => {
    const entry = sourceByIdentity.get(binding.bindingKey);
    invariant(
      entry,
      `missing Wiki source for ${binding.cardId}/${binding.rawName}`,
    );
    usedSourceIdentities.add(binding.bindingKey);
    invariant(
      vehicleResolver.binding(binding.cardId, binding.rawName)?.id ===
        binding.id,
      `${binding.id} is not the exact canonical binding`,
    );
    if (vehicles.schemaVersion === OUTPUT_SCHEMA) {
      invariant(
        entry.catalogBindingRef === binding.id &&
          entry.vehicleRef === binding.vehicleRef &&
          entry.runtimeVehicleRef === binding.runtimeVehicleRef,
        `${binding.cardId}/${binding.rawName} canonical refs drifted`,
      );
    }
    const variantIds = sortedUnique(
      binding.weaponBindingIds.flatMap((weaponBindingId) => {
        const equipment = equipmentById.get(weaponBindingId);
        invariant(
          equipment,
          `${binding.id} references missing weapon binding ${weaponBindingId}`,
        );
        invariant(
          equipment.cardId === binding.cardId &&
            equipment.rawName === binding.rawName,
          `${weaponBindingId} belongs to another vehicle`,
        );
        return equipment.weaponVariantIds;
      }),
    );
    invariant(
      variantIds.every((id) => variantById.has(id)),
      `${binding.cardId}/${binding.rawName} references a missing weapon variant`,
    );
    return projectVehicle(entry, binding, variantIds);
  });
  invariant(
    usedSourceIdentities.size === sourceByIdentity.size &&
      items.length === vehicleCatalog.counts.coreCatalogBindings,
    "Wiki source and canonical core binding closure disagree",
  );
  const weaponVariantReferences = items.reduce(
    (total, entry) => total + entry.weaponVariantIds.length,
    0,
  );
  return {
    schemaVersion: OUTPUT_SCHEMA,
    vehicleCatalogRevision: vehicleCatalog.catalogRevision,
    weaponCatalogRevision: weaponCatalog.catalogRevision,
    summary: {
      catalogVariants: items.length,
      sourceVehicles: vehicleCatalog.counts.sourceVehicles,
      runtimeVehicles: vehicleCatalog.counts.runtimeVehicles,
      weaponVariantReferences,
      armedVariants: items.filter(
        ({ weaponVariantIds }) => weaponVariantIds.length > 0,
      ).length,
    },
    items,
  };
}

const [weaponCatalogBytes, vehicleCatalogBytes, vehicleBytes] =
  await Promise.all([
    readFile(WEAPON_CATALOG_PATH),
    readFile(VEHICLE_CATALOG_PATH),
    readFile(VEHICLES_PATH),
  ]);
const payload = buildPayload(
  JSON.parse(weaponCatalogBytes.toString("utf8")),
  JSON.parse(vehicleCatalogBytes.toString("utf8")),
  JSON.parse(vehicleBytes.toString("utf8")),
);
const outputBytes = Buffer.from(
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

if (checkOnly) {
  invariant(
    vehicleBytes.equals(outputBytes),
    "generated/wiki-vehicles.json is stale",
  );
  process.stdout.write(
    `${JSON.stringify({
      status: "current",
      schemaVersion: payload.schemaVersion,
      summary: payload.summary,
    })}\n`,
  );
} else {
  await writeFileWithRetry(VEHICLES_PATH, outputBytes);
  process.stdout.write(
    `${JSON.stringify({
      status: "written",
      schemaVersion: payload.schemaVersion,
      summary: payload.summary,
    })}\n`,
  );
}
