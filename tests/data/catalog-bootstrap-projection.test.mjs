import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";

const editions = [
  ["international", "catalog-index.json"],
  ["china", "china-catalog-index.json"],
];

for (const [edition, sourceFilename] of editions) {
  test(`${edition} catalog bootstrap slices exactly partition product topology`, async () => {
    const source = JSON.parse(
      await readFile(new URL(`../../generated/${sourceFilename}`, import.meta.url), "utf8"),
    );
    const index = JSON.parse(
      await readFile(
        new URL(`../../generated/catalog-bootstrap/${edition}/index.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(index.records, []);
    assert.deepEqual(index.groups, source.groups);
    const routes = JSON.parse(
      await readFile(
        new URL(`../../generated/catalog-bootstrap/${edition}/routes.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(routes.routes.length, source.records.length);
    assert.deepEqual(
      new Set(routes.routes.flatMap(({ cardIds }) => cardIds)),
      new Set(source.records.flatMap((record) => [
        record.promoEntryId,
        record.defaultCardId,
        ...record.variants.map((variant) => variant.cardId),
      ])),
    );
    const groupDirectory = new URL(
      `../../generated/catalog-bootstrap/${edition}/groups/`,
      import.meta.url,
    );
    const files = (await readdir(groupDirectory)).filter((name) => name.endsWith(".json"));
    assert.deepEqual(files.sort(), source.groups.map(({ id }) => `${id}.json`).sort());
    const records = [];
    const sizes = [];
    for (const group of source.groups) {
      const documentBytes = await readFile(new URL(`${group.id}.json`, groupDirectory));
      const document = JSON.parse(documentBytes);
      assert.deepEqual(document.groups, source.groups);
      assert.ok(document.records.every((record) => record.official.groupId === group.id));
      records.push(...document.records);
      sizes.push(gzipSync(documentBytes, { level: 9 }).length);
    }
    assert.deepEqual(
      records.sort((left, right) => left.promotionOrder - right.promotionOrder),
      [...source.records].sort((left, right) => left.promotionOrder - right.promotionOrder),
    );
    assert.ok(Math.max(...sizes) < gzipSync(JSON.stringify(source), { level: 9 }).length / 3);
  });
}
