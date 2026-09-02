import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    "wiki-root": { type: "string" },
    output: { type: "string" },
  },
});

if (!values["wiki-root"]) {
  throw new Error(
    "Usage: node tools/audit-vehicle-loadout-closure.mjs --wiki-root <SiguaWiki checkout> [--output <report.json>]",
  );
}

const wikiRoot = path.resolve(values["wiki-root"]);
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const indexUnique = (values, label) => {
  const result = new Map();
  for (const value of values ?? []) {
    if (typeof value?.id !== "string" || result.has(value.id)) {
      throw new Error(`${label} identity drifted`);
    }
    result.set(value.id, value);
  }
  return result;
};
const sorted = (values) => [...new Set(values)].sort((left, right) =>
  left.localeCompare(right, "en")
);

const [armorCatalog, vehicleCatalog, weaponCatalog] = await Promise.all([
  readJson(path.join(root, "generated", "catalog-index.json")),
  readJson(path.join(wikiRoot, "data", "vehicles", "catalog.json")),
  readJson(path.join(wikiRoot, "data", "weapons", "catalog.json")),
]);
if (armorCatalog.schemaVersion !== "1.0.0") {
  throw new Error(`Armor catalog schema drifted: ${armorCatalog.schemaVersion}`);
}
if (vehicleCatalog.schemaVersion !== "sigua-vehicle-catalog/v3.1") {
  throw new Error(`vehicle catalog schema drifted: ${vehicleCatalog.schemaVersion}`);
}
if (weaponCatalog.schemaVersion !== "sigua-weapon-catalog/v2") {
  throw new Error(`weapon catalog schema drifted: ${weaponCatalog.schemaVersion}`);
}

const bindingById = indexUnique(vehicleCatalog.identities?.catalogBindings, "vehicle binding");
const equipmentById = indexUnique(
  weaponCatalog.relations?.vehicleEquipmentBindings,
  "equipment binding",
);
const runtimeByCardId = new Map();
const rows = [];

for (const record of armorCatalog.records ?? []) {
  for (const variant of record.variants ?? []) {
    const binding = bindingById.get(variant.catalogBindingRef);
    if (!binding) {
      rows.push({
        promoEntryId: record.promoEntryId,
        sourceRawName: variant.sourceRawName,
        catalogBindingId: variant.catalogBindingRef,
        state: "outside-vehicle-catalog",
        selectorEquipmentIds: [],
      });
      continue;
    }
    if (binding.rawName !== variant.sourceRawName) {
      throw new Error(`${record.promoEntryId}/${variant.sourceRawName} catalog identity drifted`);
    }
    const selectorEquipmentIds = sorted((binding.weaponBindingIds ?? []).filter((equipmentId) => {
      const equipment = equipmentById.get(equipmentId);
      if (!equipment) throw new Error(`${binding.id} references missing ${equipmentId}`);
      return (equipment.weaponVariantIds ?? []).length > 0;
    }));
    if (selectorEquipmentIds.length === 0) {
      rows.push({
        promoEntryId: record.promoEntryId,
        sourceRawName: variant.sourceRawName,
        catalogBindingId: binding.id,
        state: "non-selector-only-or-unarmed",
        selectorEquipmentIds: [],
      });
      continue;
    }
    let runtime = runtimeByCardId.get(binding.cardId);
    if (!runtime) {
      runtime = await readJson(path.join(
        wikiRoot,
        "data",
        "weapons",
        "runtime",
        "vehicles",
        `${binding.cardId}.json`,
      ));
      runtimeByCardId.set(binding.cardId, runtime);
    }
    const loadouts = (runtime.loadouts ?? []).filter(({ rawName }) => rawName === variant.sourceRawName);
    if (loadouts.length !== 1) {
      throw new Error(`${binding.cardId}/${variant.sourceRawName} exact loadout count is ${loadouts.length}`);
    }
    const assignmentEquipmentIds = sorted(
      (loadouts[0].weapons ?? []).map(({ stationEquipmentId }) => stationEquipmentId),
    );
    if (JSON.stringify(assignmentEquipmentIds) !== JSON.stringify(selectorEquipmentIds)) {
      throw new Error(
        `${binding.cardId}/${variant.sourceRawName} exact equipment drifted: expected ` +
        `${JSON.stringify(selectorEquipmentIds)}, received ${JSON.stringify(assignmentEquipmentIds)}`,
      );
    }
    rows.push({
      promoEntryId: record.promoEntryId,
      sourceRawName: variant.sourceRawName,
      catalogBindingId: binding.id,
      state: "exact-loadout",
      selectorEquipmentIds,
    });
  }
}

const summary = {
  schemaVersion: "sigua-vehicle-loadout-closure-audit/v1",
  armorRecords: armorCatalog.records.length,
  visibleVariants: rows.length,
  exactLoadouts: rows.filter(({ state }) => state === "exact-loadout").length,
  nonSelectorOnlyOrUnarmed: rows.filter(
    ({ state }) => state === "non-selector-only-or-unarmed",
  ).length,
  outsideVehicleCatalog: rows.filter(({ state }) => state === "outside-vehicle-catalog").length,
  mechanicalFallbacks: 0,
  selectorEquipmentAssignments: rows.reduce(
    (sum, row) => sum + row.selectorEquipmentIds.length,
    0,
  ),
};

if (values.output) {
  const output = path.resolve(values.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ summary, rows }, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
