import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const visualSource = await readFile(
  new URL("../../app/international-faction-visuals.ts", import.meta.url),
  "utf8",
);
const packageDocument = JSON.parse(await readFile(
  new URL("../../package.json", import.meta.url),
  "utf8",
));
const backgroundOptimizerSource = await readFile(
  new URL("../../tools/optimize-faction-backgrounds.mjs", import.meta.url),
  "utf8",
);

test("faction catalog backgrounds use unique optimized WebP assets", () => {
  const paths = [...visualSource.matchAll(/catalogBackground:\s*"([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(paths.length > 0);
  assert.equal(new Set(paths).size, paths.length);
  for (const assetPath of paths) {
    assert.match(assetPath, /^\/images\/faction-bg\/[A-Z]+\.webp$/);
  }
});

test("background optimization remains an explicit maintenance command", () => {
  assert.equal(packageDocument.scripts.build, "vinext build");
  assert.equal(
    packageDocument.scripts["assets:faction-backgrounds"],
    "node tools/optimize-faction-backgrounds.mjs",
  );
  assert.match(backgroundOptimizerSource, /const BLUR_SIGMA = 0\.8;/u);
});
