import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesPath = new URL("../../app/globals.css", import.meta.url);
const catalogPath = new URL("../../app/CatalogApp.tsx", import.meta.url);

test("international faction directory keeps readable metadata", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__choice-index\s*\{[\s\S]*?font-size:\s*10px;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__choice-panel \.faction-selector__choice-label > span > small\s*\{[\s\S]*?font-size:\s*10px;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__choice-panel-hint\s*\{[\s\S]*?font-size:\s*10px;/u,
  );
});

test("catalog dock keeps the faction rail centered and uses the logo as home", async () => {
  const [styles, catalog] = await Promise.all([
    readFile(stylesPath, "utf8"),
    readFile(catalogPath, "utf8"),
  ]);

  assert.match(
    styles,
    /Keep the faction rail on the true center line[\s\S]*?grid-template-areas:\s*"brand flags actions";[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(520px,\s*min\(52vw,\s*980px\)\)\s*minmax\(0,\s*1fr\);/u,
  );
  assert.match(
    styles,
    /@media \(min-width: 681px\) \{[\s\S]*?padding-top:\s*148px;[\s\S]*?max-height:\s*calc\(100dvh - 148px\);[\s\S]*?height:\s*calc\(100dvh - 148px\);/u,
  );
  assert.equal(
    (catalog.match(/className="faction-dock__home"/gu) ?? []).length,
    2,
  );
  assert.doesNotMatch(
    catalog,
    /className="faction-dock__cancel"/u,
  );
  assert.match(
    catalog,
    /className="faction-dock__home"[\s\S]*?onClick=\{\(\) => clearFactionSelection\("pointer"\)\}/u,
  );
  assert.match(
    catalog,
    /const factionDockFlagsRef = useRef<HTMLDivElement \| null>\(null\)/u,
  );
  assert.match(catalog, /resizeObserver\.observe\(rail\)/u);
  assert.match(catalog, /activeCenter - rail\.clientWidth \/ 2/u);
  assert.match(
    styles,
    /@media \(max-width: 680px\) \{[\s\S]*?\.detail-panel--viewer[\s\S]*?\.viewer-canvas \{[\s\S]*?height:\s*calc\(100dvh - 116px\);/u,
  );
});

test("international narrow layout overrides generic vertical labels and notice width", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__ai-notice\s*\{[\s\S]*?right:\s*14px;[\s\S]*?left:\s*14px;[\s\S]*?width:\s*auto;[\s\S]*?transform:\s*none;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\][\s\S]*?\.faction-selector__choice-label[\s\S]*?> span[\s\S]*?> strong\s*\{[\s\S]*?writing-mode:\s*horizontal-tb;/u,
  );
});

test("narrow wiki filters expand in flow and navigation remains readable", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(
    styles,
    /@media \(max-width: 600px\) \{[\s\S]*?\.international-nav__link\s*\{[\s\S]*?font-size:\s*10px;[\s\S]*?\.sigua-wiki-filter__menu\s*\{[\s\S]*?position:\s*static;/u,
  );
});

test("international help control drops its decorative portrait before covering controls", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.site-footer__help-portrait\s*\{[\s\S]*?display:\s*none;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\]:has\(> \.faction-selector\) \.site-footer__help\s*\{[\s\S]*?position:\s*absolute;/u,
  );
});
