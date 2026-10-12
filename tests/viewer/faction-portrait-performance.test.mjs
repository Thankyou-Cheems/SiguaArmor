import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const root = fileURLToPath(new URL("../..", import.meta.url));
const assets = JSON.parse(await readFile(`${root}/generated/international-faction-portrait-assets.json`, "utf8"));
const expectedIds = ["adf", "afu", "baf", "caf", "crf", "gfi", "imf", "mei", "plaagf", "pla", "planmc", "rgf", "tlf", "usa", "usmc", "vdv", "wpmc"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("international portraits keep bounded delivery bytes and versioned compatible URLs", async () => {
  assert.deepEqual(Object.keys(assets).sort(), [...expectedIds].sort());
  const sizes = [];
  for (const [id, asset] of Object.entries(assets)) {
    const fileId = id === "mei" ? "ins" : id;
    assert.equal(asset.path, `/assets/factions/portraits/${fileId}-clean-${asset.sha256.slice(0, 16)}.webp`);
    const image = await readFile(`${root}/public${asset.path}`);
    assert.equal(image.length, asset.bytes);
    assert.equal(sha256(image), asset.sha256, `${id} must get a new URL when its bytes change`);
    assert.ok(image.length <= 320 * 1024, `${id} exceeds the 320 KiB portrait budget`);
    const legacy = await readFile(`${root}/public/images/faction-art/${fileId}-clean.webp`);
    assert.equal(sha256(legacy), asset.sha256, `${id} must retain the old page's resource URL`);
    sizes.push(image.length);
  }
  assert.ok(sizes.reduce((sum, value) => sum + value, 0) <= 4 * 1024 * 1024, "17 portraits exceed the 4 MiB delivery budget");
  assert.ok(sizes.sort((a, b) => b - a).slice(0, 7).reduce((sum, value) => sum + value, 0) <= 1.75 * 1024 * 1024, "the seven mounted portraits exceed the 1.75 MiB wheel budget");
});

test("international portrait delivery preserves reviewed canvas and alpha geometry", async () => {
  sharp.concurrency(1);
  for (const [id, asset] of Object.entries(assets)) {
    const image = `${root}/public${asset.path}`;
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, "webp", id);
    assert.equal(metadata.width, 1024, id);
    assert.equal(metadata.height, 1536, id);
    assert.equal(metadata.hasAlpha, true, id);
    const alpha = await sharp(image).extractChannel("alpha").raw().toBuffer();
    assert.equal(sha256(alpha), asset.alphaSha256, `${id} changed reviewed height, baseline or transparent edges`);
  }
});

test("all responsive portraits preserve approved alpha and use bounded content-versioned resources", async () => {
  sharp.concurrency(1);
  assert.deepEqual(
    Object.entries(assets).filter(([, asset]) => asset.responsiveCandidates).map(([id]) => id).sort(),
    [...expectedIds].sort(),
  );
  for (const [id, asset] of Object.entries(assets)) {
    const fileId = id === "mei" ? "ins" : id;
    const candidates = asset.responsiveCandidates;
    assert.deepEqual(candidates.map(({ width }) => width), [384, 640, 768, 1024]);
    for (const candidate of candidates) {
      const image = await readFile(`${root}/public${candidate.path}`);
      assert.equal(image.length, candidate.bytes);
      assert.equal(sha256(image), candidate.sha256);
      assert.equal(candidate.path, `/assets/factions/portraits/${fileId}-clean-w${candidate.width}-q85-${candidate.sha256.slice(0, 16)}.webp`);
      assert.ok(image.length < asset.bytes, `${id}/${candidate.width} must improve delivery bytes`);
      const metadata = await sharp(image).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, candidate.width);
      assert.equal(metadata.height, candidate.width * 1.5);
      assert.equal(metadata.hasAlpha, true);
      const alpha = await sharp(image).extractChannel("alpha").raw().toBuffer();
      assert.equal(sha256(alpha), candidate.alphaSha256, `${id}/${candidate.width} reviewed resized transparency changed`);
    }
  }
});
