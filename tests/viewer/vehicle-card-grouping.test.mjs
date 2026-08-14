import assert from "node:assert/strict";
import test from "node:test";

import { groupVehicleCardEntries } from "../../app/vehicle-card-grouping.ts";

function entry(rawName, configurationZh, liveryZh, mechanicsSignatureId) {
  return {
    cardId: `test--${rawName}`,
    alias: null,
    variant: {
      sourceRawName: rawName,
      presentation: {
        vehicleNameZh: "测试载具",
        configurationZh,
        liveryZh,
      },
      editorAvailability: { mechanicsSignatureId },
    },
  };
}

test("T-72B3 woodland and desert are one livery card despite distinct Editor identities", () => {
  const groups = groupVehicleCardEntries([
    entry("BP_T72B3", null, "林地涂装", "vehicle-mechanics-woodland"),
    entry("BP_T72B3_Desert", null, "沙漠涂装", "vehicle-mechanics-desert"),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].entries.map(({ variant }) => variant.sourceRawName),
    ["BP_T72B3", "BP_T72B3_Desert"],
  );
});

test("Leopard 2A6M keeps normal and cage variants separate while merging each livery pair", () => {
  const groups = groupVehicleCardEntries([
    entry("BP_2A6_Desert", null, "沙漠涂装", "normal-desert"),
    entry("BP_2A6_Woodland", null, "林地涂装", "normal-woodland"),
    entry("BP_2A6_Desert_Cage", "笼式装甲", "沙漠涂装", "cage-desert"),
    entry("BP_2A6_Woodland_Cage", "笼式装甲", "林地涂装", "cage-woodland"),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(({ entries }) => entries.length), [2, 2]);
  assert.deepEqual(
    groups.map(({ entries }) => entries[0].variant.presentation.configurationZh),
    [null, "笼式装甲"],
  );
});

test("different weapon configurations remain separate cards even when both have liveries", () => {
  const groups = groupVehicleCardEntries([
    entry("BP_ZSL92A_QJZ89", "QJZ89 重机枪", "沙漠涂装", "qjz-desert"),
    entry("BP_ZSL92A_QJZ89_Woodland", "QJZ89 重机枪", "林地涂装", "qjz-woodland"),
    entry("BP_ZSL92A_QLZ87", "QLZ87 榴弹发射器", "沙漠涂装", "qlz-desert"),
    entry("BP_ZSL92A_QLZ87_Woodland", "QLZ87 榴弹发射器", "林地涂装", "qlz-woodland"),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(({ entries }) => entries.length), [2, 2]);
});
