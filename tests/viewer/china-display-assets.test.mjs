import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fingerprintedDisplayPath } from "../../tools/build-china-display-assets.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(await readFile(path.join(root, "generated/china-display-assets.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("changing China display bytes changes the immutable resource address", () => {
  const source = "/china-assets/local-preview/official/faction-impression.jpg";
  const first = fingerprintedDisplayPath(source, Buffer.from("approved first version"));
  const second = fingerprintedDisplayPath(source, Buffer.from("approved revised version"));
  assert.notEqual(first, second);
  assert.equal(first, fingerprintedDisplayPath(source, Buffer.from("approved first version")));
  assert.throws(() => fingerprintedDisplayPath("/private/asset.jpg", Buffer.alloc(0)));
  assert.throws(() => fingerprintedDisplayPath("/china-assets/../private.jpg", Buffer.alloc(0)));
});

test("China fingerprint copies preserve exact legacy bytes and matching digests", async () => {
  const assets = [manifest.base, manifest.wordmark, ...Object.values(manifest.factions).flatMap(({ background, logo }) => [background, logo])];
  assert.equal(assets.length, 12);
  assert.deepEqual(Object.keys(manifest.factions).sort(), ["agesi", "arctic-union", "ekeqie", "kaweier", "shenzhou"]);
  for (const asset of assets) {
    const source = await readFile(path.join(root, "public", asset.legacyPath.slice(1)));
    const copy = await readFile(path.join(root, "public", asset.path.slice(1)));
    assert.deepEqual(copy, source, asset.legacyPath + " display pixels must not change");
    assert.equal(copy.length, asset.bytes);
    assert.equal(sha256(copy), asset.sha256);
    assert.equal(asset.path, fingerprintedDisplayPath(asset.legacyPath, source));
  }
});
