import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildCatalogUrl, parseCatalogLocation } from "../../lib/catalog-navigation.mjs";

test("aircraft shared URLs retain simple collision and reject unknown query modes", async () => {
  const index=JSON.parse(await readFile(new URL("../../generated/catalog-index.json",import.meta.url),"utf8"));
  const state=parseCatalogLocation("/vehicles/adf--mq9--uav?collision=simple",index);
  assert.equal(state.viewer.collisionQuery,"simple");
  assert.match(buildCatalogUrl(state,index),/collision=simple/u);
  const invalid=parseCatalogLocation("/vehicles/adf--mq9--uav?collision=guessed",index);
  assert.equal(invalid.viewer.collisionQuery,undefined);
  assert.doesNotMatch(buildCatalogUrl(invalid,index),/collision=/u);
});
