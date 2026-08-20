import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  "../../app/VehicleDuelApp.tsx",
  "../../app/VehicleDuelEntryLink.tsx",
  "../../app/RuntimeVehicleViewer.tsx",
  "../../app/vehicle-duel-data.ts",
  "../../lib/vehicle-duel-data-cache.ts",
  "../../app/duel/page.tsx",
  "../../app/china/duel/page.tsx",
  "../../app/globals.css",
].map((relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8")));

const [app, entry, viewer, dataAdapter, cacheModule, internationalRoute, chinaRoute, styles] = files;

test("production duel contains two real hit viewers and no prototype surface", () => {
  assert.match(app, /function TargetViewer/u);
  assert.match(app, /<RuntimeVehicleViewer/u);
  assert.equal((app.match(/<TargetViewer/gu) ?? []).length, 2);
  assert.match(app, /<WeaponRhythmTimeline/u);
  assert.match(app, /resolveVehicleDuel/u);
  assert.match(app, /vehicleDuelData\.loadCatalog/u);
  assert.match(app, /vehicleDuelData\.loadVehicle/u);
  assert.match(internationalRoute, /VehicleDuelApp siteEdition="international"/u);
  assert.match(chinaRoute, /VehicleDuelApp siteEdition="china"/u);
  const productionSurface = [app, entry, internationalRoute, chinaRoute, styles].join("\n");
  assert.doesNotMatch(
    productionSurface,
    /THROWAWAY|UI PROTOTYPE|PROTOTYPE STATE|演示数值|镜像竞技场|伤害赛道|裁判直播台|variant=[ABC]/u,
  );
});

test("duel reuses exact cached vehicle bundles and one shared weapon mechanics parse", () => {
  assert.match(cacheModule, /catalogRequests = new Map/u);
  assert.match(cacheModule, /vehicleRequests = new Map/u);
  assert.match(dataAdapter, /runtimePreviewForCatalogBinding/u);
  assert.match(dataAdapter, /loadWikiVehicleWeaponRuntimeSource/u);
  assert.match(dataAdapter, /loadWikiVehicleFactionMechanics/u);
  assert.match(dataAdapter, /referenceDataForWikiVehicleBinding/u);
  assert.match(viewer, /sharedWeaponDpsFactsRequest/u);
  assert.match(viewer, /vehicleTargetBurningProfile/u);
  assert.match(viewer, /referenceData/u);
  assert.doesNotMatch(viewer, /weaponDpsFactsRequestRef/u);
  assert.match(viewer, /attackLibraryOverride/u);
  assert.match(viewer, /onDuelHitChange/u);
  assert.match(viewer, /data-duel-target/u);
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-duel-target="true"\] \.viewer-engagement-controls/u,
  );
});

test("catalog entry uses client navigation so warm module caches survive launch", () => {
  assert.match(entry, /import Link from "next\/link"/u);
  assert.match(entry, /className="vehicle-duel-entry"/u);
  assert.match(entry, /prefetch/u);
  assert.match(entry, /initialVehicleId/u);
});
