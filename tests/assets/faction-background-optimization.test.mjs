import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertInventorySnapshot } from "../../tools/validation-profile.mjs";

const visualSource = await readFile(
  new URL("../../app/international-faction-visuals.ts", import.meta.url),
  "utf8",
);
const packageDocument = JSON.parse(await readFile(
  new URL("../../package.json", import.meta.url),
  "utf8",
));
const releaseBuildSource = await readFile(
  new URL("../../tools/build-public-release.mjs", import.meta.url),
  "utf8",
);
const backgroundOptimizerSource = await readFile(
  new URL("../../tools/optimize-faction-backgrounds.mjs", import.meta.url),
  "utf8",
);

test("all faction catalog backgrounds use optimized WebP assets", () => {
  const paths = [...visualSource.matchAll(/catalogBackground:\s*"([^"]+)"/g)]
    .map((match) => match[1]);
  assertInventorySnapshot(assert, paths.length, 17, "faction backgrounds");
  assert.equal(new Set(paths).size, paths.length);
  for (const assetPath of paths) {
    assert.match(assetPath, /^\/images\/faction-bg\/[A-Z]+\.webp$/);
  }
});

test("production build optimizes backgrounds and prunes legacy copies", () => {
  assert.equal(packageDocument.scripts.build, "node tools/build-public-release.mjs");
  assert.match(releaseBuildSource, /optimize faction backgrounds/u);
  assert.match(releaseBuildSource, /build production application/u);
  assert.match(releaseBuildSource, /precompress and seal CDN release/u);
  assert.equal(
    packageDocument.scripts["assets:faction-backgrounds"],
    "node tools/optimize-faction-backgrounds.mjs",
  );
  assert.match(
    packageDocument.scripts["assets:prune-faction-background-sources"],
    /--prune-dist dist\/client\/images\/faction-bg$/,
  );
});

test("faction background optimization retains more source detail", () => {
  assert.match(backgroundOptimizerSource, /const BLUR_SIGMA = 0\.8;/u);
  assert.doesNotMatch(backgroundOptimizerSource, /const BLUR_SIGMA = 1\.6;/u);
});
