import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../app/VehicleRankerApp.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("vehicle ranker keeps search, solid drag following, and local persistence together", () => {
  assert.match(source, /searchCatalogIndexRecords/u);
  assert.match(source, /draggable/u);
  assert.match(source, /onDrop=/u);
  assert.match(source, /setDragImage\(transparentDragImageRef\.current/u);
  assert.match(source, /vehicle-ranker__drag-overlay/u);
  assert.match(source, /window\.localStorage/u);
});

test("vehicle ranker loads Wiki-backed cards with thumbnails instead of a product snapshot", () => {
  assert.match(source, /loadPublicRankerCatalog/u);
  assert.match(source, /wikiAssetUrl\(card\.thumbnail\.path\)/u);
  assert.doesNotMatch(source, /generated\/.*ranker/u);
});

test("vehicle ranker can collapse additions, import a faction, and enter recording mode", () => {
  assert.match(source, /data-collapsed=\{catalogCollapsed/u);
  assert.match(source, /一键导入阵营/u);
  assert.match(source, /importVehicleRankerCards/u);
  assert.match(source, /data-recording=\{recordingMode/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /siguad-wiki-logo\.svg/u);
  assert.match(source, /<kbd>ESC<\/kbd> 退出录制模式/u);
});

test("ranked cards keep only the vehicle name, optional configuration, and remove affordance", () => {
  const rankedCardSource = source.slice(
    source.indexOf("function RankerCard("),
    source.indexOf("export function VehicleRankerApp"),
  );
  assert.match(rankedCardSource, /card\.name/u);
  assert.match(rankedCardSource, /card\.configuration/u);
  assert.doesNotMatch(rankedCardSource, /card\.faction/u);
  assert.doesNotMatch(rankedCardSource, /card\.typeName/u);
  assert.doesNotMatch(rankedCardSource, /<select/u);
});

test("ranked cards use the vehicle impression as a full-card background", () => {
  assert.match(styles, /\.vehicle-ranker-card__visual \{ position: absolute;[^}]*inset: 0/u);
  assert.match(styles, /\.vehicle-ranker-card__visual img \{[^}]*inset: 2px;[^}]*width: calc\(100% - 4px\);[^}]*height: calc\(100% - 4px\);[^}]*object-fit: contain/u);
  assert.doesNotMatch(styles, /\.vehicle-ranker-card__visual img \{[^}]*transform:/u);
  assert.match(styles, /\.vehicle-ranker-card::after \{[^}]*linear-gradient/u);
  assert.match(styles, /\.vehicle-ranker-card__copy \{[^}]*background: transparent/u);
  assert.match(styles, /\.vehicle-ranker-card__copy strong \{[^}]*-webkit-text-stroke: 0\.9px #cdb37a/u);
});

test("recording controls live inside the title row and the board uses the available width", () => {
  const headingStart = source.indexOf('<header className="vehicle-ranker__heading">');
  const brandStart = source.indexOf('className="vehicle-ranker__recording-brand"');
  const headingEnd = source.indexOf("</header>", headingStart);
  assert.ok(headingStart >= 0 && brandStart > headingStart && brandStart < headingEnd);
  assert.match(styles, /data-recording="true"\] \.vehicle-ranker__heading \{ max-width: none;/u);
  assert.match(styles, /data-recording="true"\] \.vehicle-ranker__workspace \{ max-width: none;/u);
});
