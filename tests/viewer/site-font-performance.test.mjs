import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const globalStyles = await readFile(`${root}/app/globals.css`, "utf8");
const loader = await readFile(`${root}/app/SiteDisplayFontLoader.tsx`, "utf8");
const layout = await readFile(`${root}/app/layout.tsx`, "utf8");

test("full display font is loaded lazily from the independent font service", async () => {
  assert.match(globalStyles, /--font-faction-display:\s*"Unbounded Sans"/u);
  assert.doesNotMatch(globalStyles, /@font-face|\/fonts\/.*\.woff2/u);
  assert.match(loader, /https:\/\/fontsapi\.zeoseven\.com\/18\/main\/result\.css/u);
  assert.match(loader, /requestIdleCallback/u);
  assert.match(loader, /window\.addEventListener\("load"/u);
  assert.match(loader, /displayFontState = "fallback"/u);
  assert.match(layout, /<SiteDisplayFontLoader \/>/u);

  const localFontFiles = (await readdir(`${root}/public/fonts`))
    .filter((name) => name.endsWith(".woff2"));
  assert.deepEqual(localFontFiles, [], "the product CDN must not ship font binaries");
});
