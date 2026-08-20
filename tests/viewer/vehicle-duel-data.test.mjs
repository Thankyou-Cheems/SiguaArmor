import assert from "node:assert/strict";
import test from "node:test";

import {
  createVehicleDuelDataLoader,
  vehicleDuelOptionsFromCatalog,
} from "../../lib/vehicle-duel-data-cache.ts";

const catalog = {
  schemaVersion: "1.0.0",
  catalogId: "fixture",
  groups: [{ id: "test", name: "Test", order: 0, recordCount: 1 }],
  records: [{
    promoEntryId: "test--ifv",
    promotionOrder: 1,
    official: {
      groupId: "test",
      groupNameZh: "测试阵营",
      nameZh: "测试步战车",
      typeZh: "IFV",
      typeNameZh: "步兵战车",
    },
    selectedRawName: "BP_TEST_IFV",
    selectedDisplayName: "测试步战车",
    defaultCardId: "test--ifv--default",
    routeSlug: "test--ifv",
    variants: [
      {
        sourceRawName: "BP_TEST_IFV_DESERT",
        catalogBindingRef: "binding-livery",
        vehicleRef: "vehicle-ref-livery",
        runtimeVehicleRef: "vehicle-" + "1".repeat(64),
        visualArtifactRef: "visual-artifact-" + "2".repeat(64),
        alias: "沙漠涂装",
        displayName: "测试步战车 · 沙漠",
        cardId: "test--ifv--desert",
        routeSlug: "test--ifv--desert",
        presentation: { liveryZh: "沙漠", configurationZh: null },
      },
      {
        sourceRawName: "BP_TEST_IFV",
        catalogBindingRef: "binding-default",
        vehicleRef: "vehicle-ref-default",
        runtimeVehicleRef: "vehicle-" + "3".repeat(64),
        visualArtifactRef: "visual-artifact-" + "4".repeat(64),
        alias: "林地涂装",
        displayName: "测试步战车",
        cardId: "test--ifv--default",
        routeSlug: "test--ifv--default",
        presentation: { liveryZh: "林地", configurationZh: null },
      },
    ],
  }],
};

test("duel catalog keeps one product card and selects its canonical default variant", () => {
  const options = vehicleDuelOptionsFromCatalog(catalog, "international");
  assert.equal(options.length, 1);
  assert.equal(options[0].cardId, "test--ifv");
  assert.equal(options[0].wikiSourceCardId, "test--ifv");
  assert.equal(options[0].wikiFactionId, "test");
  assert.equal(options[0].rawName, "BP_TEST_IFV");
  assert.equal(options[0].displayName, "测试步战车");
  assert.equal(options[0].runtimeVehicleRef, "vehicle-" + "3".repeat(64));
});

test("duel data loader shares catalog and exact vehicle promises across concurrent callers", async () => {
  let catalogReads = 0;
  let vehicleReads = 0;
  const expectedBundle = { id: "bundle" };
  const loader = createVehicleDuelDataLoader({
    async loadCatalog() {
      catalogReads += 1;
      return catalog;
    },
    async loadVehicle() {
      vehicleReads += 1;
      await Promise.resolve();
      return expectedBundle;
    },
  });
  const [firstCatalog, secondCatalog] = await Promise.all([
    loader.loadCatalog("international"),
    loader.loadCatalog("international"),
  ]);
  const option = firstCatalog[0];
  const [firstBundle, secondBundle] = await Promise.all([
    loader.loadVehicle(option),
    loader.loadVehicle(option),
  ]);
  assert.equal(catalogReads, 1);
  assert.equal(vehicleReads, 1);
  assert.equal(firstCatalog, secondCatalog);
  assert.equal(firstBundle, expectedBundle);
  assert.equal(secondBundle, expectedBundle);
  assert.equal(await loader.loadVehicle(option), expectedBundle);
  assert.equal(vehicleReads, 1);
});
