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

test("duel reuses catalog search ranking for both vehicles and weapons", () => {
  assert.match(app, /rankVehicleCandidateSearch/u);
  assert.match(app, /rankVerifiedVehicleCandidateSearch/u);
  assert.match(app, /function DuelSearchSelect/u);
  assert.match(app, /role="combobox"/u);
  assert.match(app, /role="listbox"/u);
  assert.match(app, /data-preview/u);
  assert.doesNotMatch(app, /<select/u);
  assert.match(cacheModule, /searchPrimary/u);
  assert.match(cacheModule, /searchAliases/u);
  assert.match(cacheModule, /searchContext/u);
});

test("DPS empty states and finite ammunition use player-facing terminal labels", () => {
  assert.doesNotMatch(viewer, /resultLabel="数据不可用"/u);
  assert.match(viewer, /resultLabel="暂无DPS数据"/u);
  assert.match(viewer, /ammoExhausted/u);
  assert.match(app, /弹药耗尽/u);
});

test("duel exposes exterior view, synchronized display controls, and one trace per target", () => {
  assert.match(app, /\["exterior", "外观"\]/u);
  assert.match(app, /function DuelDisplayControls/u);
  assert.match(app, /physicalPoseEnabled/u);
  assert.match(app, /relativeArmorScale/u);
  assert.match(app, /className="viewer-protection-switch"/u);
  assert.match(app, /viewer-protection-switch__track/u);
  assert.match(app, /viewer-mode-tabs vehicle-duel__mode-tabs/u);
  assert.match(app, /vehicle-duel__search-select/u);
  assert.match(app, /displayOverrides=\{displayOverrides\}/u);
  assert.equal((app.match(/shotTraceLimit=\{1\}/gu) ?? []).length, 1);
  assert.match(viewer, /shotTraceLimit = MAX_SHOT_TRACES/u);
  assert.match(viewer, /records\.length >= maxShotTraces/u);
  assert.match(viewer, /pendingSharedShots\.paths\.slice\(-maxShotTraces\)/u);
  assert.match(styles, /\.vehicle-duel__display-controls button\[aria-checked="true"\]/u);
});

test("duel header and verdict remove duplicate calls while retaining lead time", () => {
  const headingStart = app.indexOf('<header className="vehicle-duel__heading">');
  const heading = app.slice(headingStart, app.indexOf("</header>", headingStart));
  assert.match(app, /siguad-wiki-logo\.svg/u);
  assert.doesNotMatch(app, /ArrowLeft|<Swords/u);
  assert.doesNotMatch(heading, /<aside>/u);
  assert.match(app, /vehicleDuelVictoryMarginSeconds/u);
  assert.match(app, /`领先 \$\{marginSeconds\.toFixed\(2\)\}s`/u);
  assert.match(app, /leftName=\{leftOption\.displayName\}/u);
  assert.match(app, /rightName=\{rightOption\.displayName\}/u);
});
