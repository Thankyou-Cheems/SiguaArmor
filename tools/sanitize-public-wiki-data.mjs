import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(root, "generated");

function invariant(condition, message) {
  if (!condition) throw new Error(`Public Wiki snapshot sanitization stopped: ${message}`);
}

function requiredString(value, label) {
  invariant(typeof value === "string", `${label} must be a string`);
  return value;
}

function requiredNumber(value, label) {
  invariant(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function requiredBoolean(value, label) {
  invariant(typeof value === "boolean", `${label} must be a boolean`);
  return value;
}

function stringArray(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value.map((item, index) => requiredString(item, `${label}[${index}]`));
}

function validateSourceSchema(document, schemas, label) {
  invariant(document && typeof document === "object", `${label} must be an object`);
  invariant(schemas.has(document.schemaVersion), `${label} has unsupported schema ${document.schemaVersion}`);
  invariant(Array.isArray(document.items), `${label}.items must be an array`);
}

function projectVehicle(entry, index) {
  const label = `wiki-vehicles.items[${index}]`;
  invariant(entry && typeof entry === "object", `${label} must be an object`);
  return {
    catalogBindingRef: requiredString(
      entry.catalogBindingRef,
      `${label}.catalogBindingRef`,
    ),
    vehicleRef: requiredString(entry.vehicleRef, `${label}.vehicleRef`),
    runtimeVehicleRef: requiredString(
      entry.runtimeVehicleRef,
      `${label}.runtimeVehicleRef`,
    ),
    cardId: requiredString(entry.cardId, `${label}.cardId`),
    factionId: requiredString(entry.factionId, `${label}.factionId`),
    rawName: requiredString(entry.rawName, `${label}.rawName`),
    displayName: requiredString(entry.displayName, `${label}.displayName`),
    icon: requiredString(entry.icon, `${label}.icon`),
    factions: stringArray(entry.factions, `${label}.factions`),
    type: requiredString(entry.type, `${label}.type`),
    vehicleTags: stringArray(entry.vehicleTags, `${label}.vehicleTags`),
    amphibious: requiredBoolean(entry.amphibious, `${label}.amphibious`),
    weaponVariantIds: stringArray(
      entry.weaponVariantIds,
      `${label}.weaponVariantIds`,
    ),
  };
}

function projectVehicles(document) {
  validateSourceSchema(
    document,
    new Set(["sigua-wiki-vehicles/v3"]),
    "wiki-vehicles",
  );
  invariant(document.summary && typeof document.summary === "object", "wiki-vehicles.summary must be an object");
  return {
    schemaVersion: "sigua-wiki-vehicles/v3",
    vehicleCatalogRevision: requiredString(
      document.vehicleCatalogRevision,
      "wiki-vehicles.vehicleCatalogRevision",
    ),
    weaponCatalogRevision: requiredString(
      document.weaponCatalogRevision,
      "wiki-vehicles.weaponCatalogRevision",
    ),
    summary: {
      catalogVariants: requiredNumber(
        document.summary.catalogVariants,
        "wiki-vehicles.summary.catalogVariants",
      ),
      sourceVehicles: requiredNumber(
        document.summary.sourceVehicles,
        "wiki-vehicles.summary.sourceVehicles",
      ),
      runtimeVehicles: requiredNumber(
        document.summary.runtimeVehicles,
        "wiki-vehicles.summary.runtimeVehicles",
      ),
      weaponVariantReferences: requiredNumber(
        document.summary.weaponVariantReferences,
        "wiki-vehicles.summary.weaponVariantReferences",
      ),
      armedVariants: requiredNumber(
        document.summary.armedVariants,
        "wiki-vehicles.summary.armedVariants",
      ),
    },
    items: document.items.map(projectVehicle),
  };
}

function projectFaction(entry, index) {
  const label = `wiki-factions.items[${index}]`;
  invariant(entry && typeof entry === "object", `${label} must be an object`);
  const imagePath = requiredString(entry.imagePath, `${label}.imagePath`);
  invariant(imagePath.startsWith("/"), `${label}.imagePath must be a local public path`);
  return {
    code: requiredString(entry.code, `${label}.code`),
    imagePath,
    name: requiredString(entry.name, `${label}.name`),
    order: requiredNumber(entry.order, `${label}.order`),
    setupCount: requiredNumber(entry.setupCount, `${label}.setupCount`),
  };
}

function projectFactions(document) {
  validateSourceSchema(
    document,
    new Set(["squad-armor-wiki-factions/v1", "sigua-wiki-factions/v1"]),
    "wiki-factions",
  );
  return {
    schemaVersion: "sigua-wiki-factions/v1",
    items: document.items.map(projectFaction),
  };
}

function assertPublicProjection(value, label, location = label) {
  const forbiddenKeys = new Set([
    "source",
    "sourcePage",
    "sourceUrl",
    "observedAt",
    "pageUrl",
    "bundleUrl",
    "dataUrl",
    "provider",
    "wikiUrl",
  ]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicProjection(item, label, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    invariant(
      typeof value !== "string" || !/^https?:\/\//iu.test(value),
      `${location} contains a third-party URL`,
    );
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    invariant(!forbiddenKeys.has(key), `${location}.${key} is forbidden in a public snapshot`);
    assertPublicProjection(item, label, `${location}.${key}`);
  }
}

async function sanitize(fileName, projector) {
  const filePath = path.join(generatedRoot, fileName);
  const sourceBytes = await readFile(filePath);
  const document = JSON.parse(sourceBytes.toString("utf8"));
  const projection = projector(document);
  assertPublicProjection(projection, fileName);
  const outputBytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, "utf8");
  const changed = !sourceBytes.equals(outputBytes);
  if (changed) await writeFile(filePath, outputBytes);
  return {
    file: path.relative(root, filePath).split(path.sep).join("/"),
    changed,
    sourceBytes: sourceBytes.byteLength,
    publicBytes: outputBytes.byteLength,
    items: projection.items.length,
    schemaVersion: projection.schemaVersion,
  };
}

const results = [
  await sanitize("wiki-vehicles.json", projectVehicles),
  await sanitize("wiki-factions.json", projectFactions),
];

console.log(JSON.stringify({ status: "complete", results }, null, 2));
