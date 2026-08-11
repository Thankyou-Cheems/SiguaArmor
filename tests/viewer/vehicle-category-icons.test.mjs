import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { resolveCatalogVehicleCategoryIconAsset } from "../../app/vehicle-category-icons.ts";

const currentCatalogs = await Promise.all(
  ["../../generated/catalog-index.json", "../../generated/china-catalog-index.json"].map(
    async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")),
  ),
);

test("every current vehicle card resolves to a published category icon", async () => {
  const publishedAssets = new Set(
    await readdir(new URL("../../public/images/game-ui/vehicle-categories", import.meta.url)),
  );
  const unresolved = [];
  const missingAssets = [];

  for (const catalog of currentCatalogs) {
    for (const record of catalog.records) {
      const vehicleType = record.promoEntryId.split("--").at(-1)?.toUpperCase() ?? "UNKNOWN";
      for (const variant of record.variants) {
        try {
          const asset = resolveCatalogVehicleCategoryIconAsset({
            cardId: variant.cardId,
            promoEntryId: record.promoEntryId,
            vehicleType,
          });
          if (!publishedAssets.has(`${asset}.webp`)) {
            missingAssets.push(`${variant.cardId}: ${asset}.webp`);
          }
        } catch (error) {
          unresolved.push(`${variant.cardId}: ${error.message}`);
        }
      }
    }
  }

  assert.deepEqual({ unresolved, missingAssets }, { unresolved: [], missingAssets: [] });
});

test("unmapped catalog cards fail closed instead of receiving an unrelated icon", () => {
  assert.throws(
    () =>
      resolveCatalogVehicleCategoryIconAsset({
        cardId: "future--unknown--vehicle",
        promoEntryId: "future--unknown",
        vehicleType: "UNKNOWN",
      }),
    /Unknown catalog vehicle category icon/u,
  );
});

test("large logistics vehicle cards use the truck logistics icon", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "pla--ctm131-logistics--logi--ctm131-logistic",
      promoEntryId: "pla--ctm131-logistics--logi",
      vehicleType: "LOGI",
    }),
    "truck_logistics",
  );
});

test("light logistics vehicle cards keep the jeep logistics icon", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "pla--lynx8x8-logistics--logi--lynxatv-logistic",
      promoEntryId: "pla--lynx8x8-logistics--logi",
      vehicleType: "LOGI",
    }),
    "jeep_logistics",
  );
});

test("logistics boat cards use the boat icon", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "pla--rhib-logistics--logi--rhib-logistics",
      promoEntryId: "pla--rhib-logistics--logi",
      vehicleType: "LOGI",
    }),
    "boat",
  );
});

test("tracked logistics vehicle cards use the tracked logistics icon", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "afu--mtlb-logistics--logi--mtlb-logi-afu",
      promoEntryId: "afu--mtlb-logistics--logi",
      vehicleType: "LOGI",
    }),
    "trackedapc_logistics",
  );
});

test("light logistics overrides apply outside the PLA catalog", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "gfi--safir-logistics--logi--safir",
      promoEntryId: "gfi--safir-logistics--logi",
      vehicleType: "LOGI",
    }),
    "jeep_logistics",
  );
});

test("logistics boat overrides apply across faction catalogs", () => {
  assert.equal(
    resolveCatalogVehicleCategoryIconAsset({
      cardId: "adf--rhib-logistics--logi--rhib-logistics",
      promoEntryId: "adf--rhib-logistics--logi",
      vehicleType: "LOGI",
    }),
    "boat",
  );
});
