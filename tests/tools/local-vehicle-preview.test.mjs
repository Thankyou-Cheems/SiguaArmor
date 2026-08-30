import assert from "node:assert/strict";
import test from "node:test";

import { createWikiHybridViteConfig } from "../../tools/dev/wiki-hybrid-vite-config.mjs";

test("local preview serves gunner-sight and crew assets before the upstream fallback", () => {
  const config = createWikiHybridViteConfig({
    wikiRoot: "D:\\Dev\\SiguaWiki",
    localAssetOrigin: "http://127.0.0.1:4174",
  });
  assert.equal(config.root, "D:/Dev/SiguaWiki");
  assert.deepEqual(Object.keys(config.server.proxy), [
    "/assets/vehicle-crew",
    "/assets/vehicle-gunner-sights",
    "/assets",
  ]);
  assert.equal(
    config.server.proxy["/assets/vehicle-gunner-sights"].target,
    "http://127.0.0.1:4174",
  );
});
