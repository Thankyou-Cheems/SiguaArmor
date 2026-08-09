import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  runtimeAnalysisVisualUrl,
  runtimeWikiAssetUrl,
} from "../../lib/runtime-visual-lazy-load.ts";

test("shared runtime files resolve directly to SiguaWiki", () => {
  const model = "/assets/runtime-probe/models/" + "a".repeat(64) + ".gltf";
  assert.equal(
    runtimeWikiAssetUrl(model),
    `https://wiki.siguad.icu${model}`,
  );
  const blob = "/assets/runtime-probe/models/../blob/" + "b".repeat(64) + ".bin";
  assert.equal(
    runtimeWikiAssetUrl(blob),
    `https://wiki.siguad.icu/assets/runtime-probe/blob/${"b".repeat(64)}.bin`,
  );
  assert.throws(
    () => runtimeWikiAssetUrl("/assets/../../data/vehicles/catalog.json"),
    /Invalid SiguaWiki asset path/,
  );
  assert.equal(runtimeWikiAssetUrl("/images/product.webp"), "/images/product.webp");
});

test("analysis mode skips shared appearance textures", () => {
  assert.equal(
    runtimeAnalysisVisualUrl(
      "/assets/runtime-probe/blob/" + "b".repeat(64) + ".webp",
    ),
    RUNTIME_ANALYSIS_PLACEHOLDER_TEXTURE_URL,
  );
});
