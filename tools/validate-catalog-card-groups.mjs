import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCatalogIndexFromWiki,
  buildFactionCatalogFromWiki,
} from "../app/wiki-vehicle-catalog.ts";
import { groupVehicleCardEntries } from "../app/vehicle-card-grouping.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_WIKI_ROOT = process.env.SIGUA_WIKI_ROOT
  ? path.resolve(process.env.SIGUA_WIKI_ROOT)
  : path.resolve(ROOT, "..", "SiguaWiki");

async function readWikiJson(relativePath) {
  const localPath = path.join(LOCAL_WIKI_ROOT, ...relativePath.split("/"));
  try {
    await access(localPath);
    return JSON.parse(await readFile(localPath, "utf8"));
  } catch {
    const response = await fetch(`https://wiki.siguad.icu/${relativePath}`);
    if (!response.ok) throw new Error(`${relativePath} HTTP ${response.status}`);
    return response.json();
  }
}

function configurationKey(variant) {
  return variant.presentation?.configurationZh?.trim() ?? variant.alias?.trim() ?? "";
}

function groupRecord(record) {
  if (!record.variants.length) return [{ entries: [null], liveryGroup: false }];
  return groupVehicleCardEntries(record.variants.map((variant) => ({
    cardId: variant.sourceRawName,
    alias: variant.alias,
    variant,
  }))).map((group) => ({
    entries: group.entries.map(({ variant }) => variant),
    liveryGroup: group.entries.length > 1,
  }));
}

const [vehicleCatalogBase, editorAvailability, factionCatalog, communityAliases] = await Promise.all([
  readWikiJson("data/vehicles/catalog.json"),
  readWikiJson("data/vehicles/editor-availability.json"),
  readWikiJson("data/factions/catalog.json"),
  readWikiJson("data/vehicles/community-aliases.json"),
]);
const vehicleCatalog = { ...vehicleCatalogBase, editorAvailability };
const records = [];
for (const [edition, indexName] of [
  ["international", "catalog-index.json"],
  ["china", "china-catalog-index.json"],
]) {
  const topology = JSON.parse(await readFile(path.join(ROOT, "generated", indexName), "utf8"));
  const index = buildCatalogIndexFromWiki(
    vehicleCatalog,
    factionCatalog,
    topology,
    edition,
    communityAliases,
  );
  for (const group of index.groups) {
    records.push(...buildFactionCatalogFromWiki(vehicleCatalog, index, group.id, edition).records);
  }
}

let sourceCards = 0;
let groupedCards = 0;
const liveryGroups = [];
for (const record of records) {
  sourceCards += Math.max(1, record.variants.length);
  const groups = groupRecord(record);
  groupedCards += groups.length;
  for (const group of groups) {
    if (!group.liveryGroup) continue;
    assert.equal(new Set(group.entries.map(configurationKey)).size, 1);
    assert.equal(new Set(group.entries.map((variant) => variant.presentation.liveryZh)).size, group.entries.length);
    liveryGroups.push({ record, group });
  }
}

assert(liveryGroups.length > 0, "catalog contains no collapsible livery groups");
assert(groupedCards < sourceCards, "livery grouping did not reduce card count");
assert(liveryGroups.some(({ group }) =>
  group.entries.some((variant) => /^BP_Minsk(?:_|$)/iu.test(variant.sourceRawName))),
"Minsk livery variants were not grouped");
assert(liveryGroups.some(({ record, group }) =>
  record.promoEntryId === "usa--m1a2--mbt" && group.entries.length === 2),
"USA M1A2 woodland/desert variants were not grouped");

console.log(JSON.stringify({
  records: records.length,
  sourceVariantCards: sourceCards,
  renderedConfigurationCards: groupedCards,
  cardsSaved: sourceCards - groupedCards,
  liveryGroups: liveryGroups.length,
}, null, 2));
