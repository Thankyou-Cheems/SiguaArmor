// Cross-check the applicator receipt before candidate activation.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  receiptPath,
  manifestPath,
  expectedBase,
  expectedTarget,
  expectedEntryCount,
  expectedTotalBytes,
  expectedCommit,
] = process.argv.slice(2);

assert.ok(
  receiptPath &&
    manifestPath &&
    expectedBase &&
    expectedTarget &&
    expectedEntryCount &&
    expectedTotalBytes &&
    expectedCommit,
  "receipt, manifest, closure values, and commit are required",
);

const [receipt, manifest] = await Promise.all([
  readFile(receiptPath, "utf8").then(JSON.parse),
  readFile(manifestPath, "utf8").then(JSON.parse),
]);

assert.equal(receipt.baseManifestSha256, expectedBase);
assert.equal(receipt.targetManifestSha256, expectedTarget);
assert.equal(receipt.entryCount, Number(expectedEntryCount));
assert.equal(receipt.totalBytes, Number(expectedTotalBytes));
assert.equal(receipt.activationPerformed, false);
assert.equal(manifest.schemaVersion, "sigua-unified-public-release/v1");
assert.equal(manifest.entryCount, Number(expectedEntryCount));
assert.equal(manifest.totalBytes, Number(expectedTotalBytes));
assert.equal(manifest.sources?.monorepo?.commit, expectedCommit);
assert.equal(manifest.sources?.china?.commit, expectedCommit);
assert.equal(manifest.sources?.china?.runtimeCommit, expectedCommit);
assert.equal(manifest.sources?.international?.commit, expectedCommit);

process.stdout.write(
  `${JSON.stringify({
    status: "verified",
    baseManifestSha256: expectedBase,
    targetManifestSha256: expectedTarget,
    entryCount: manifest.entryCount,
    totalBytes: manifest.totalBytes,
    commit: expectedCommit,
  })}\n`,
);
