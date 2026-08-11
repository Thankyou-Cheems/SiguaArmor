import assert from "node:assert/strict";
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
    typeNameZh: "测试类型",
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

test("catalog search consumes maintained community aliases from Wiki records", () => {
  const record = structuredClone(syntheticRecord);
  record.searchAliases.push("ZCC");
  record.variants[0].searchAliases.push("TOWCHE", "ZCC TOW");
  for (const query of ["ZCC", "towche", "zcctow"]) {
    const [result] = searchCatalogIndexRecords([record], query);
    assert.equal(result?.record.promoEntryId, record.promoEntryId);
  }
});
