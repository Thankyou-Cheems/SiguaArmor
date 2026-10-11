import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const dockStyles = styles.slice(
  styles.indexOf("/* Keep the faction rail on the true center line."),
  styles.indexOf("/* The international dock keeps its compact detail alignment."),
);

test("international dock keeps language and search inside their desktop side track", () => {
  assert.match(dockStyles, /\.faction-dock__actions\s*\{\s*width:\s*100%;\s*align-items:\s*flex-end;\s*flex-direction:\s*column;/u);
  assert.match(dockStyles, /\.global-vehicle-search--dock\s*\{\s*max-width:\s*100%;/u);
});

test("tablet dock gives every faction the full second row", () => {
  const tabletStyles = dockStyles.slice(
    dockStyles.indexOf("@media (max-width: 1040px) and (min-width: 681px)"),
    dockStyles.indexOf("@media (max-width: 680px)"),
  );
  assert.match(tabletStyles, /grid-template-areas:\s*"brand actions"\s*"flags flags";/u);
  assert.match(tabletStyles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/u);
  assert.doesNotMatch(tabletStyles, /minmax\(500px/u);
});

test("mobile language/search rows reserve matching catalog and viewer clearance", () => {
  const mobileStyles = dockStyles.slice(dockStyles.indexOf("@media (max-width: 680px)"));
  assert.match(mobileStyles, /grid-template-rows:\s*80px minmax\(0, 1fr\);/u);
  assert.match(mobileStyles, /\.faction-dock\s*\{\s*height:\s*148px;/u);
  assert.match(mobileStyles, /\.global-vehicle-search--dock\s*\{\s*grid-column:\s*1 \/ -1;\s*width:\s*100%;/u);
  assert.match(mobileStyles, /overflow-x:\s*auto;/u);
  assert.match(mobileStyles, /scroll-margin-top:\s*148px;\s*padding-top:\s*164px;/u);
  assert.equal((mobileStyles.match(/height:\s*calc\(100dvh - 148px\);/gu) ?? []).length, 2);
});
