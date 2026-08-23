import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogIndexFromWiki } from "../../app/wiki-vehicle-catalog.ts";

test("ranker catalog projects the exact Wiki thumbnail for the selected edition", () => {
  const topology = {
    schemaVersion: "1.0.0",
    catalogId: "ranker-thumbnail-fixture",
    groups: [{ id: "pla", order: 0, recordCount: 1 }],
    records: [{
      promoEntryId: "pla--ztz99a--mbt",
      promotionOrder: 0,
      official: { groupId: "pla" },
      selectedRawName: "BP_ZTZ99A",
      defaultCardId: "pla--ztz99a--mbt--default",
      routeSlug: "pla--ztz99a--mbt",
      variants: [{
        sourceRawName: "BP_ZTZ99A",
        catalogBindingRef: "binding",
        vehicleRef: "vehicle",
        runtimeVehicleRef: "runtime-vehicle",
        visualArtifactRef: "visual-99a",
        cardId: "pla--ztz99a--mbt--default",
        routeSlug: "pla--ztz99a--mbt--default",
      }],
    }],
  };
  const vehicles = {
    schemaVersion: "sigua-vehicle-catalog/v3.1",
    runtime: {
      visualArtifacts: [{
        id: "visual-99a",
        edition: "international",
        cardId: "pla--ztz99a--mbt",
        rawName: "BP_ZTZ99A",
        thumbnail: { path: "/assets/vehicles/cards/99a.webp", width: 640, height: 360 },
      }],
    },
    presentation: {
      editions: {
        international: { records: [{
          cardId: "pla--ztz99a--mbt",
          nameZh: "ZTZ99A",
          type: "MBT",
          typeNameZh: "主战坦克",
          configurationZh: null,
          searchTerms: [],
          searchAliases: [],
          variants: [{
            rawName: "BP_ZTZ99A",
            nameZh: "ZTZ99A",
            vehicleNameZh: null,
            configurationZh: null,
            liveryZh: null,
            searchTerms: [],
            searchAliases: [],
          }],
        }] },
        china: { records: [] },
      },
    },
  };
  const factions = {
    schemaVersion: "sigua-faction-catalog/v1",
    factions: [{ code: "PLA", labels: { zhHans: "中国人民解放军陆军" } }],
    catalogGroups: { china: [] },
  };
  const index = buildCatalogIndexFromWiki(
    vehicles,
    factions,
    topology,
    "international",
  );
  assert.deepEqual(index.records[0].variants[0].thumbnail, {
    path: "/assets/vehicles/cards/99a.webp",
    width: 640,
    height: 360,
  });
});
