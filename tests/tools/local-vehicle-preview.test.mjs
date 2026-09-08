import assert from "node:assert/strict";
import test from "node:test";

import { createWikiHybridViteConfig } from "../../tools/dev/wiki-hybrid-vite-config.mjs";

test("local preview serves crew, gunner-sight and driver-view assets before the upstream fallback", () => {
  const config = createWikiHybridViteConfig({
    wikiRoot: "D:\\Dev\\SiguaWiki",
    localAssetOrigin: "http://127.0.0.1:4174",
  });
  assert.equal(config.root, "D:/Dev/SiguaWiki");
  assert.deepEqual(Object.keys(config.server.proxy), [
    "/assets/vehicle-crew",
    "/assets/vehicle-gunner-sights",
    "/assets/vehicle-driver-views",
    "/assets",
  ]);
  assert.equal(
    config.server.proxy["/assets/vehicle-gunner-sights"].target,
    "http://127.0.0.1:4174",
  );
  assert.equal(
    config.server.proxy["/assets/vehicle-driver-views"].target,
    "http://127.0.0.1:4174",
  );
});

test("aircraft preview serves only explicitly named local payloads", () => {
  const local="/assets/runtime-probe/hit-runtime/records/aircraft.json";
  const config=createWikiHybridViteConfig({wikiRoot:"D:/Dev/SiguaWiki",localAssetOrigin:"https://wiki.siguad.icu",localAssetPaths:[local]});
  assert.equal(config.server.proxy["/assets"].bypass({url:local+"?query=v1"}),local+"?query=v1");
  assert.equal(config.server.proxy["/assets"].bypass({url:"/assets/runtime-probe/models/other.gltf"}),undefined);
  assert.throws(()=>createWikiHybridViteConfig({wikiRoot:"x",localAssetOrigin:"https://wiki.siguad.icu",localAssetPaths:["/assets/../secret"]}),/local asset paths/);
});
