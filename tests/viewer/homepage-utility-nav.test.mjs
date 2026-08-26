import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalogSource = readFileSync(
  new URL("../../app/CatalogApp.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("homepage utility nav groups edition, activity, duel, and ranker in one surface", () => {
  const utilityStart = catalogSource.indexOf("function HomepageUtilityNav(");
  const utilityEnd = catalogSource.indexOf("\n}\n", utilityStart);
  const utilitySource = catalogSource.slice(utilityStart, utilityEnd);
  assert.match(utilitySource, /homepage-utility-nav/u);
  assert.match(utilitySource, /switchLabel/u);
  assert.match(utilitySource, /DailyActiveDisplay variant="hero"/u);
  assert.match(utilitySource, /VehicleDuelEntryLink/u);
  assert.match(utilitySource, /VehicleRankerEntryLink/u);
});

test("homepage tool links are inline instead of independent fixed overlays", () => {
  assert.match(
    styles,
    /\.homepage-utility-nav \.vehicle-duel-entry,[\s\S]*?position: static;/u,
  );
  assert.match(
    styles,
    /@media \(max-width: 680px\)[\s\S]*?\.homepage-utility-nav \{[\s\S]*?grid-template-columns: repeat\(2/u,
  );
  const readyStart = catalogSource.indexOf("function CatalogAppReady(");
  const firstNotice = catalogSource.indexOf("dataAccuracyNoticeOpen ?", readyStart);
  const rootOpening = catalogSource.slice(readyStart, firstNotice);
  assert.doesNotMatch(rootOpening, /<VehicleDuelEntryLink/u);
  assert.doesNotMatch(rootOpening, /<VehicleRankerEntryLink/u);
});

test("international character preview shows the Wiki faction full name", () => {
  const previewStart = catalogSource.indexOf(
    '<div className="faction-selector__preview-identity"',
  );
  const previewEnd = catalogSource.indexOf("</div>", previewStart);
  const previewSource = catalogSource.slice(previewStart, previewEnd);
  assert.match(previewSource, /faction-selector__faction-name/u);
  assert.match(previewSource, /\{previewFaction\.name\}/u);
  assert.doesNotMatch(previewSource, /公益项目|以游戏内实装为准/u);
});
