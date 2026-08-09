import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { searchCatalogIndexRecords } from "../../app/vehicle-search.ts";

const syntheticRecord = {
  promoEntryId: "test-fire-grenade",
  promotionOrder: 1,
  searchTerms: ["测试载具"],
  searchAliases: ["ceshizaiju", "cszj"],
  official: {
    groupId: "test",
    groupNameZh: "测试阵营",
    nameZh: "测试载具",
    typeZh: "测试类型",
  },
  selectedRawName: "BP_Test",
  selectedDisplayName: "测试载具 · 烈火榴弹",
  defaultCardId: "test-fire-grenade--test",
  routeSlug: "test-fire-grenade",
  variants: [
    {
      sourceRawName: "BP_Test",
      alias: "烈火榴弹",
      displayName: "测试载具 · 烈火榴弹",
      searchTerms: ["烈火榴弹"],
      searchAliases: ["liehuoliudan", "lhld"],
      cardId: "test-fire-grenade--test",
      routeSlug: "test-fire-grenade--test",
    },
  ],
};

test("catalog search accepts full-pinyin fragments from either half of a Chinese term", () => {
  for (const query of ["Liehuo", "liudan"]) {
    const [result] = searchCatalogIndexRecords([syntheticRecord], query);
    assert.equal(result?.record.promoEntryId, syntheticRecord.promoEntryId);
    assert.equal(result?.variants[0]?.alias, "烈火榴弹");
  }
});

test("catalog search tolerates one typo in a partial pinyin query", () => {
  const [result] = searchCatalogIndexRecords([syntheticRecord], "liehup");
  assert.equal(result?.record.promoEntryId, syntheticRecord.promoEntryId);
  assert.equal(result?.rank, 6);
});

test("generated international catalog stores compact pinyin keys for source Chinese labels", async () => {
  const index = JSON.parse(
    await readFile(new URL("../../generated/catalog-index.json", import.meta.url), "utf8"),
  );
  const exact = searchCatalogIndexRecords(index.records, "zhuangjiaxing", 2);
  const fuzzy = searchCatalogIndexRecords(index.records, "zhuangjixng", 2);
  assert.ok(exact.some((result) =>
    result.variants.some((variant) => variant.searchTerms?.includes("装甲型"))
  ));
  assert.ok(fuzzy.some((result) =>
    result.variants.some((variant) => variant.searchTerms?.includes("装甲型"))
  ));
});
