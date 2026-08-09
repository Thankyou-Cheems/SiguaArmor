import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  preparePublishedAssets,
  validatePublicManifest,
} from "../../tools/public-assets/prepare.mjs";
import { validatePublicAssetLock } from "../../tools/public-assets/restore.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureManifest(files) {
  const entries = [...files.entries()].map(([relativePath, bytes]) => ({
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  }));
  return {
    schemaVersion: "sigua-public-release/v1",
    entryCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    entries,
  };
}

function fixtureAssetLock() {
  const resultManifest = { bytes: 100, sha256: "a".repeat(64) };
  return {
    schemaVersion: "sigua-armor-public-assets/v1",
    distribution: {
      purpose: "developer-and-ci-bootstrap",
      productionHotlinking: false,
    },
    archive: {
      name: "bootstrap.tar.gz",
      url: "https://github.com/example/project/releases/download/bootstrap/bootstrap.tar.gz",
      bytes: 1000,
      sha256: "b".repeat(64),
      resultManifest,
    },
    incrementalArchives: [],
    preparedManifest: resultManifest,
  };
}

test("public asset lock reserves GitHub for the frozen bootstrap", () => {
  const lock = fixtureAssetLock();
  assert.equal(validatePublicAssetLock(lock), lock);

  const incrementalResult = { bytes: 110, sha256: "c".repeat(64) };
  lock.incrementalArchives.push({
    name: "increment-2026-09.tar.gz",
    url: "https://armor.siguad.icu/bootstrap/increment-2026-09.tar.gz",
    bytes: 200,
    sha256: "d".repeat(64),
    resultManifest: incrementalResult,
  });
  lock.preparedManifest = incrementalResult;
  assert.equal(validatePublicAssetLock(lock), lock);

  lock.incrementalArchives[0].url =
    "https://github.com/example/project/releases/download/bootstrap/increment-2026-09.tar.gz";
  assert.throws(
    () => validatePublicAssetLock(lock),
    /project-owned origin\/CDN instead of GitHub/u,
  );
});

test("published assets are prepared from one exact manifest", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "sigua-public-assets-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sourcePublic = path.join(temporaryRoot, "source", "public");
  const releasePublic = path.join(temporaryRoot, "release", "public");
  const files = new Map([
    ["assets/model.bin", Buffer.from([0, 1, 2, 3])],
    ["catalog-data/vehicles.json", Buffer.from('{"ok":true}\n', "utf8")],
  ]);
  for (const [relativePath, bytes] of files) {
    const target = path.join(sourcePublic, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const manifest = fixtureManifest(files);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(sourcePublic, "release-manifest.json"), manifestBytes);

  const result = await preparePublishedAssets({ sourcePublic, releasePublic });

  assert.equal(result.entryCount, 2);
  assert.equal(result.totalBytes, 16);
  for (const [relativePath, expected] of files) {
    assert.deepEqual(
      await readFile(path.join(releasePublic, ...relativePath.split("/"))),
      expected,
    );
  }
  assert.deepEqual(
    await readFile(path.join(releasePublic, "release-manifest.json")),
    manifestBytes,
  );
});

test("public manifest validation rejects traversal, duplicates, and wrong totals", () => {
  const bytes = Buffer.from("data", "utf8");
  const entry = { path: "data.json", bytes: 4, sha256: sha256(bytes) };
  const base = {
    schemaVersion: "sigua-public-release/v1",
    entryCount: 1,
    totalBytes: 4,
    entries: [entry],
  };

  assert.throws(
    () => validatePublicManifest({ ...base, entries: [{ ...entry, path: "../data.json" }] }),
    /not normalized|unsafe/u,
  );
  assert.throws(
    () => validatePublicManifest({ ...base, entryCount: 2, entries: [entry, entry] }),
    /duplicate public asset path/u,
  );
  assert.throws(
    () => validatePublicManifest({ ...base, totalBytes: 5 }),
    /total byte count differs/u,
  );
});

test("a mismatched source does not replace the existing release", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "sigua-public-assets-fail-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sourcePublic = path.join(temporaryRoot, "source", "public");
  const releasePublic = path.join(temporaryRoot, "release", "public");
  await mkdir(sourcePublic, { recursive: true });
  await mkdir(releasePublic, { recursive: true });
  await writeFile(path.join(sourcePublic, "data.json"), "tampered", "utf8");
  await writeFile(path.join(releasePublic, "keep.txt"), "previous", "utf8");
  const declared = Buffer.from("approved", "utf8");
  const manifest = fixtureManifest(new Map([["data.json", declared]]));
  await writeFile(
    path.join(sourcePublic, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    preparePublishedAssets({ sourcePublic, releasePublic }),
    /byte count differs|SHA-256 differs/u,
  );
  assert.equal(await readFile(path.join(releasePublic, "keep.txt"), "utf8"), "previous");
});
