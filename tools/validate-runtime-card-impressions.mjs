import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  buildRenderEntries,
  flattenCatalog,
  runtimeCardImpressionEditionConfig,
} from "./render-runtime-card-impressions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEdition(argv) {
  let edition = "international";
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--edition") {
      assert.ok(argv[index + 1], "--edition requires international or china");
      edition = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--edition=")) {
      edition = argument.slice("--edition=".length);
    } else {
      assert.fail(`Unknown argument: ${argument}`);
    }
  }
  return edition;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
}

function identityKey(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

const edition = parseEdition(process.argv);
const config = runtimeCardImpressionEditionConfig(edition);
const [manifestBytes, catalogBytes, visualIndexBytes, selectionPolicyBytes] = await Promise.all([
  readFile(config.outputManifest),
  readFile(config.catalogPath),
  readFile(config.visualIndexPath),
  readFile(config.selectionPolicyPath),
]);
const manifest = JSON.parse(manifestBytes);
const catalog = JSON.parse(catalogBytes);
const visualIndex = JSON.parse(visualIndexBytes);
const selectionPolicy = JSON.parse(selectionPolicyBytes);
assert.equal(manifest.schemaVersion, "runtime-probe-card-impressions/v1");
assert.equal(manifest.complete, true);
assert.equal(manifest.source.catalogSha256, sha256(canonicalTextBytes(catalogBytes)));
assert.equal(
  manifest.source.visualIndexSha256,
  sha256(canonicalTextBytes(visualIndexBytes)),
);
assert.equal(
  manifest.source.selectionPolicySha256,
  sha256(canonicalTextBytes(selectionPolicyBytes)),
);
assert.deepEqual(manifest.settings.cameraDirection, [1.7, 1.25, 2.7]);
assert.equal(manifest.settings.cameraFovDeg, 32);
assert.equal(manifest.settings.lighting.exposure, 1.18);
assert.deepEqual(manifest.settings.lighting.key.position, [6.5, -8.5, 10.5]);
assert.deepEqual(manifest.settings.lighting.fill.position, [-7, 2.5, 5.5]);
assert.deepEqual(manifest.settings.lighting.rim.position, [-4.5, 8, 8]);
assert.deepEqual(manifest.settings.lighting.front.position, [3, 5, 4]);

const { entries: catalogRenderEntries, cards: catalogCards } = flattenCatalog(catalog);
const catalogVariants = catalogRenderEntries.map(({ cardId, rawName }) => ({ cardId, rawName }));
const catalogBindings = new Set(
  catalogVariants.map(({ cardId, rawName }) => identityKey(cardId, rawName)),
);
assert.equal(catalogBindings.size, catalogVariants.length);
const visualBindings = new Set();
const visualSourceShaByBinding = new Map();
visualIndex.descriptors.forEach((descriptor, index) => {
  const key = identityKey(descriptor.cardId, descriptor.rawName);
  assert.equal(visualBindings.has(key), false, `duplicate visual binding: ${key}`);
  visualBindings.add(key);
  visualSourceShaByBinding.set(key, visualIndex.sources?.[index]?.sha256 ?? null);
});
assert.deepEqual(
  [...visualBindings].sort(),
  [...catalogBindings].sort(),
  "catalog and visual binding closures differ",
);
assert.equal(manifest.summary.cards, catalogCards.length);
assert.equal(manifest.summary.variants, catalogVariants.length);
assert.equal(manifest.variants.length, catalogVariants.length);
assert.equal(visualIndex.descriptors.length, catalogVariants.length);
const expectedRenderEntryByBinding = new Map(
  buildRenderEntries({
    catalogEntries: catalogRenderEntries,
    visualIndex,
    selectionPolicy,
    assetUrlPrefixes: config.assetUrlPrefixes,
  }).map((entry) => [entry.key, entry]),
);
assert.equal(expectedRenderEntryByBinding.size, catalogBindings.size);

const seen = new Set();
let totalBytes = 0;
for (const entry of manifest.variants) {
  const key = identityKey(entry.cardId, entry.rawName);
  assert.equal(seen.has(key), false, `duplicate impression: ${key}`);
  seen.add(key);
  assert.equal(entry.width, 640, key);
  assert.equal(entry.height, 360, key);
  assert.equal(entry.path.startsWith(`${config.outputUrlRoot}/`), true, key);
  assert.match(path.basename(entry.path), /^[a-f0-9]{64}\.webp$/u, key);
  assert.ok(entry.bytes <= 32 * 1024, `${key}: ${entry.bytes}`);
  assert.ok(entry.sourceOccurrenceCount > 0, key);
  assert.match(entry.renderSourceSha256, /^[a-f0-9]{64}$/u, key);
  assert.equal(
    entry.renderSourceSha256,
    expectedRenderEntryByBinding.get(key)?.renderSourceSha256,
    `${key}: render source generation`,
  );
  assert.equal(
    entry.sourceDescriptorSha256,
    visualSourceShaByBinding.get(key),
    `${key}: source descriptor generation`,
  );
  const absolutePath = path.join(ROOT, "public", ...entry.path.split("/").filter(Boolean));
  const bytes = await readFile(absolutePath);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp", key);
  assert.equal(metadata.width, 640, key);
  assert.equal(metadata.height, 360, key);
  assert.equal(metadata.hasAlpha, true, key);
  assert.equal(bytes.length, entry.bytes, key);
  assert.equal(sha256(bytes), entry.sha256, key);
  totalBytes += bytes.length;
}
assert.equal(seen.size, catalogVariants.length);
assert.deepEqual([...seen].sort(), [...catalogBindings].sort());
assert.equal(manifest.summary.bytes, totalBytes);
assert.equal(manifest.summary.maxBytes, Math.max(...manifest.variants.map((entry) => entry.bytes)));

const byCard = new Map(manifest.cards.map((card) => [card.cardId, card]));
assert.equal(byCard.size, catalogCards.length);
for (const card of manifest.cards) {
  const defaultEntry = manifest.variants.find(
    (entry) => entry.cardId === card.cardId && entry.rawName === card.defaultVariantRawName,
  );
  assert.ok(defaultEntry, card.cardId);
  assert.equal(card.impressionPath, defaultEntry.path, card.cardId);
  assert.equal(card.impressionSha256, defaultEntry.sha256, card.cardId);
}

console.log(JSON.stringify({
  status: "passed",
  edition,
  cards: manifest.summary.cards,
  variants: manifest.summary.variants,
  bytes: manifest.summary.bytes,
  maxBytes: manifest.summary.maxBytes,
}));
