import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertInventorySnapshot } from "../../tools/validation-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
}

function identityKey(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

test("China runtime marking patches close the expanded exact-hash inventory", async () => {
  const [patchConfig, patchAudit, patchIndex, visualManifest] = await Promise.all([
    readFile(path.join(root, "config", "china-runtime-texture-patches.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "generated", "china-runtime-texture-patch-audit.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(root, "generated", "china-runtime-probe-visual-patch-release-index.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(path.join(root, "generated", "china-runtime-visual-release-manifest.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(patchConfig.schemaVersion, "sigua-china-runtime-texture-patches/v1");
  assertInventorySnapshot(assert, patchConfig.profiles.length, 48, "China patch profiles");
  assert.equal(
    new Set(patchConfig.profiles.map(({ expectedSourceSha256 }) => expectedSourceSha256)).size,
    patchConfig.profiles.length,
  );
  assertInventorySnapshot(
    assert,
    patchConfig.profiles.reduce((total, profile) => total + profile.regions.length, 0),
    87,
    "China patch regions",
  );
  for (const profile of patchConfig.profiles) {
    assert.match(profile.expectedSourceSha256, /^[a-f0-9]{64}$/u, profile.label);
    assert.ok(profile.regions.length > 0, profile.label);
    for (const region of profile.regions) {
      assert.ok(region.width > 0 && region.height > 0, profile.label);
      assert.ok(
        region.sampleRadius > 0 ||
          (Number.isFinite(region.cloneSourceX) && Number.isFinite(region.cloneSourceY)),
        profile.label,
      );
      assert.ok(region.feather >= 0, profile.label);
    }
  }

  assert.equal(patchAudit.schemaVersion, "sigua-china-runtime-texture-patch-audit/v1");
  assert.equal(patchAudit.activeProfileCount, patchConfig.profiles.length);
  assert.equal(patchAudit.inactiveProfileCount, 0);
  assertInventorySnapshot(
    assert,
    patchAudit.affectedRawSourceCount,
    139,
    "affected China visual sources",
  );
  assertInventorySnapshot(
    assert,
    patchAudit.applications.length,
    143,
    "China patch applications",
  );
  assertInventorySnapshot(assert, patchIndex.descriptorCount, 76, "China patch descriptors");
  assert.equal(visualManifest.complete, true);
  assert.equal(visualManifest.selection.descriptorCount, patchIndex.descriptorCount);
  assert.equal(visualManifest.sourceAssetCount, patchAudit.affectedRawSourceCount);
  assert.equal(Object.keys(visualManifest.entries).length, visualManifest.sourceAssetCount);

  const m1151Profile = patchConfig.profiles.find(
    ({ label }) => label === "GFI M1151 Iranian roundel and emblems",
  );
  assert.ok(m1151Profile);
  assertInventorySnapshot(assert, m1151Profile.regions.length, 5, "M1151 patch regions");
  const m1151Applications = patchAudit.applications.filter(
    ({ label }) => label === m1151Profile.label,
  );
  assertInventorySnapshot(
    assert,
    m1151Applications.length,
    4,
    "M1151 patch applications",
  );
  assert.deepEqual(
    new Set(m1151Applications.map(({ sourceSha256 }) => sourceSha256)),
    new Set([m1151Profile.expectedSourceSha256]),
  );
  assert.equal(
    new Set(m1151Applications.map(({ patchedSha256 }) => patchedSha256)).size,
    1,
  );
});

test("China card impressions exactly cover the desensitized catalog and current visual index", async () => {
  const [
    catalogBytes,
    visualIndexBytes,
    selectionPolicyBytes,
    manifestBytes,
  ] = await Promise.all([
    readFile(path.join(root, "generated", "china-catalog-index.json")),
    readFile(path.join(root, "app", "china-runtime-probe-visual-release-index.json")),
    readFile(
      path.join(root, "generated", "china-runtime-probe-visual-patch-selection-policy.json"),
    ),
    readFile(path.join(root, "generated", "china-runtime-probe-card-impressions.json")),
  ]);
  const catalog = JSON.parse(catalogBytes);
  const visualIndex = JSON.parse(visualIndexBytes);
  const manifest = JSON.parse(manifestBytes);

  const expectedBindings = new Set(
    catalog.records.flatMap((record) =>
      record.variants.map((variant) =>
        identityKey(record.promoEntryId, variant.sourceRawName))),
  );
  const actualBindings = new Set(
    manifest.variants.map((variant) => identityKey(variant.cardId, variant.rawName)),
  );
  const visualBindings = new Set(
    visualIndex.descriptors.map((descriptor) =>
      identityKey(descriptor.cardId, descriptor.rawName)),
  );

  assertInventorySnapshot(assert, catalog.records.length, 129, "China catalog records");
  assertInventorySnapshot(assert, expectedBindings.size, 213, "China visual bindings");
  assert.equal(manifest.schemaVersion, "runtime-probe-card-impressions/v1");
  assert.equal(manifest.complete, true);
  assert.equal(manifest.cards.length, catalog.records.length);
  assert.equal(manifest.variants.length, expectedBindings.size);
  assert.deepEqual([...actualBindings].sort(), [...expectedBindings].sort());
  assert.deepEqual([...visualBindings].sort(), [...expectedBindings].sort());
  assert.equal(
    manifest.source.catalogSha256,
    sha256(canonicalTextBytes(catalogBytes)),
  );
  assert.equal(
    manifest.source.visualIndexSha256,
    sha256(canonicalTextBytes(visualIndexBytes)),
  );
  assert.equal(
    manifest.source.selectionPolicySha256,
    sha256(canonicalTextBytes(selectionPolicyBytes)),
  );

  const defaultByCard = new Map(
    catalog.records.map((record) => [record.promoEntryId, record.selectedRawName]),
  );
  for (const card of manifest.cards) {
    assert.equal(card.defaultVariantRawName, defaultByCard.get(card.cardId), card.cardId);
    assert.match(
      card.impressionPath,
      /^\/images\/china-vehicle-impressions\/[a-f0-9]{64}\.webp$/u,
      card.cardId,
    );
  }
});
