import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { catalogStaticParams } from "../../lib/catalog-static-params.mjs";
import { findCatalogCard } from "../../lib/catalog-navigation.mjs";

test("static routes cover every current faction, vehicle variant and supported legacy identifier", async () => {
  for (const [edition, filename] of [["international", "catalog-index.json"], ["china", "china-catalog-index.json"]]) {
    const catalog = JSON.parse(await readFile(new URL(`../../generated/${filename}`, import.meta.url), "utf8"));
    const groups = catalogStaticParams(edition, "groupId").map(({ groupId }) => groupId);
    assert.deepEqual(new Set(groups), new Set(catalog.groups.map(({ id }) => id)));
    const routes = catalogStaticParams(edition, "cardId").map(({ cardId }) => cardId);
    assert.equal(routes.length, new Set(routes).size);
    for (const value of routes) {
      assert.ok(findCatalogCard(catalog, value), `exported route must resolve: ${edition}/${value}`);
      assert.ok(value && !/[\\/]/u.test(value), "route names cannot escape their segment");
    }
    const known = new Set(routes);
    for (const record of catalog.records) {
      for (const value of [record.routeSlug, record.defaultCardId, record.promoEntryId,
        ...record.variants.flatMap(({ cardId, routeSlug }) => [cardId, routeSlug])]) {
        assert.ok(known.has(value), `supported link must survive export: ${edition}/${value}`);
      }
    }
  }
});
