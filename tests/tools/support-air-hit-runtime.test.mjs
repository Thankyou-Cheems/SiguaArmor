import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertInventorySnapshot,
} from "../../tools/validation-profile.mjs";
import { resolvePublicArtifactPath } from "../../tools/worktree-runtime-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function bindingKey(value) {
  return `${value.cardId}\u0000${value.rawName}`;
}

test("support-air Editor hit runtime covers all three exact portable drone sources", async () => {
  const [sourceIndex, previewIndex, availability] = await Promise.all([
    readJson("app/support-air-hit-index.json"),
    readJson("app/support-air-hit-release-index.json"),
    readJson("app/support-air-hit-availability-index.json"),
  ]);

  assert.equal(sourceIndex.schemaVersion, "runtime-hit-preview-index/v1");
  assert.equal(sourceIndex.descriptorCount, sourceIndex.descriptors.length);
  assertInventorySnapshot(assert, sourceIndex.descriptorCount, 12, "support-air descriptors");
  assert.equal(previewIndex.schemaVersion, "runtime-hit-preview-index/v1");
  assert.equal(previewIndex.descriptorCount, previewIndex.descriptors.length);
  assertInventorySnapshot(
    assert,
    previewIndex.descriptorCount,
    12,
    "published support-air descriptors",
  );
  assert.deepEqual(
    new Set(sourceIndex.descriptors.map(bindingKey)),
    new Set(previewIndex.descriptors.map(bindingKey)),
  );
  assert.deepEqual(
    new Set(sourceIndex.descriptors.map((entry) => entry.rawName)),
    new Set([
      "BP_FlyingDrone",
      "BP_FlyingDrone_Recoverable",
      "BP_FlyingDrone_WPMC",
    ]),
  );
  assert.equal(new Set(sourceIndex.descriptors.map((entry) => entry.vehicleId)).size, 3);

  assert.equal(availability.schemaVersion, "support-air-hit-availability-index/v1");
  assert.equal(availability.entryCount, 44);
  assert.equal(
    availability.entries.filter((entry) => entry.status === "hit-runtime").length,
    12,
  );
  assert.equal(
    availability.entries.filter(
      (entry) => entry.status === "runtime-no-hit-geometry",
    ).length,
    32,
  );
  const publishedHitBindings = new Set(sourceIndex.descriptors.map(bindingKey));
  assert.ok(
    availability.entries.every(
      (entry) =>
        (entry.status === "hit-runtime") === publishedHitBindings.has(bindingKey(entry)) &&
        /^[a-f0-9]{64}$/u.test(entry.runtimeEvidenceSha256) &&
        typeof entry.reason === "string" &&
        entry.reason.length > 0,
    ),
  );
  const recordsByUrl = new Map();
  for (const descriptor of previewIndex.descriptors) {
    for (const [urlField, bytesField, hashField] of [
      ["recordUrl", "recordBytes", "recordSha256"],
      ["geometryUrl", "geometryBytes", "geometrySha256"],
      ["bvhUrl", "bvhBytes", "bvhSha256"],
    ]) {
      const artifactPath = await resolvePublicArtifactPath(
        ROOT,
        descriptor[urlField],
      );
      const bytes = await readFile(artifactPath);
      assert.equal(bytes.byteLength, descriptor[bytesField]);
      assert.equal(sha256(bytes), descriptor[hashField]);
      if (urlField === "recordUrl" && !recordsByUrl.has(descriptor.recordUrl)) {
        recordsByUrl.set(
          descriptor.recordUrl,
          JSON.parse(bytes.toString("utf8")),
        );
      }
    }
  }
  assertInventorySnapshot(assert, recordsByUrl.size, 3, "support-air runtime records");
  for (const record of recordsByUrl.values()) {
    assert.equal(record.formatVersion, "hit-scene-runtime/v1");
    assert.equal(record.header.counts.components, 2);
    assert.equal(record.header.counts.healthPools, 1);
    assert.equal(record.header.counts.weapons, 0);
    assert.equal(record.header.counts.projectiles, 0);
    assert.equal(record.header.healthPools[0].constructedHealth.state, "observed");
    assert.equal(record.header.healthPools[0].constructedHealth.value, 15);
    assert.equal(record.header.healthPools[0].maxHealth.state, "derived");
    assert.equal(record.header.healthPools[0].maxHealth.value, 15);
  }
});
