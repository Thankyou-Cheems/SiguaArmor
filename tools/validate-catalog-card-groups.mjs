import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_ROOT = path.join(ROOT, "public", "catalog-data", "factions");

function configurationKey(variant) {
  if (variant.presentation) return variant.presentation.configurationZh?.trim() ?? "";
  return variant.alias?.trim() ?? "";
}

function groupRecord(record) {
  if (!record.variants.length) return [{ entries: [null], liveryGroup: false }];
  const buckets = new Map();
  for (const variant of record.variants) {
    const key = configurationKey(variant);
    const bucket = buckets.get(key) ?? [];
    bucket.push(variant);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].flatMap((entries) => {
    const liveries = entries.map((variant) => variant.presentation?.liveryZh ?? null);
    const liveryGroup =
      entries.length > 1 &&
      liveries.every(Boolean) &&
      new Set(liveries).size === entries.length;
    return liveryGroup
      ? [{ entries, liveryGroup: true }]
      : entries.map((entry) => ({ entries: [entry], liveryGroup: false }));
  });
}

const files = (await readdir(CATALOG_ROOT))
  .filter((name) => name.endsWith(".json"))
  .sort();
const records = [];
for (const file of files) {
  const catalog = JSON.parse(await readFile(path.join(CATALOG_ROOT, file), "utf8"));
  records.push(...catalog.records);
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
    const keys = new Set(group.entries.map(configurationKey));
    const liveries = group.entries.map((variant) => variant.presentation?.liveryZh ?? null);
    assert.equal(keys.size, 1, `${record.promoEntryId}: mixed configurations in livery group`);
    assert(liveries.every(Boolean), `${record.promoEntryId}: unlabeled livery in collapsed group`);
    assert.equal(
      new Set(liveries).size,
      liveries.length,
      `${record.promoEntryId}: duplicate livery label in collapsed group`,
    );
    assert(
      group.entries.every((variant) => record.variants.includes(variant)),
      `${record.promoEntryId}: grouping replaced a source variant instead of preserving it`,
    );
    liveryGroups.push({ record, group });
  }
}

assert(liveryGroups.length > 0, "catalog contains no collapsible livery groups");
assert(groupedCards < sourceCards, "livery grouping did not reduce card count");

const minsk = liveryGroups.find(({ group }) =>
  group.entries.some((variant) => /^BP_Minsk(?:_|$)/i.test(variant.sourceRawName)),
);
assert(minsk, "Minsk livery variants were not grouped");
assert(minsk.group.entries.length >= 4, "Minsk group does not expose all color variants");

const m1a2 = liveryGroups.find(({ record }) => record.promoEntryId === "usa--m1a2--mbt");
assert(m1a2, "USA M1A2 woodland/desert variants were not grouped");
assert.equal(m1a2.group.entries.length, 2, "USA M1A2 group does not expose both liveries");

const camouflagePair = liveryGroups.find(({ group }) => {
  const labels = new Set(group.entries.map((variant) => variant.presentation?.liveryZh));
  return labels.has("林地") && labels.has("沙漠");
});
assert(camouflagePair, "woodland/desert camouflage pair was not grouped");

const multiConfiguration = records.find((record) => {
  const configurationKeys = new Set(record.variants.map(configurationKey));
  return configurationKeys.size > 1 && groupRecord(record).some((group) => group.liveryGroup);
});
assert(multiConfiguration, "no multi-configuration livery record found for separation check");
assert.equal(
  groupRecord(multiConfiguration).length,
  new Set(multiConfiguration.variants.map(configurationKey)).size,
  `${multiConfiguration.promoEntryId}: weapon/seat configurations were collapsed together`,
);

console.log(JSON.stringify({
  factions: files.length,
  records: records.length,
  sourceVariantCards: sourceCards,
  renderedConfigurationCards: groupedCards,
  cardsSaved: sourceCards - groupedCards,
  liveryGroups: liveryGroups.length,
  examples: {
    minsk: {
      cardId: minsk.record.promoEntryId,
      liveries: minsk.group.entries.map((variant) => variant.presentation.liveryZh),
    },
    camouflage: {
      cardId: camouflagePair.record.promoEntryId,
      liveries: camouflagePair.group.entries.map((variant) => variant.presentation.liveryZh),
    },
    m1a2: {
      cardId: m1a2.record.promoEntryId,
      liveries: m1a2.group.entries.map((variant) => variant.presentation.liveryZh),
    },
    configurationSeparation: {
      cardId: multiConfiguration.promoEntryId,
      configurations: [...new Set(multiConfiguration.variants.map(configurationKey))],
    },
  },
}, null, 2));
