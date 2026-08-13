import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const assets = JSON.parse(
  await readFile(
    `${root}/generated/international-faction-flag-assets.json`,
    "utf8",
  ),
);
const visualsSource = await readFile(
  `${root}/app/international-faction-visuals.ts`,
  "utf8",
);

test("international dock routes small raster flags through SiguaWiki without local copies", async () => {
  assert.equal(Object.keys(assets).length, 17);
  assert.match(
    visualsSource,
    /import factionFlagAssets from "\.\.\/generated\/international-faction-flag-assets\.json"/u,
  );
  assert.doesNotMatch(visualsSource, /_flag_display\.(?:svg|webp)/u);

  for (const [id, assetPath] of Object.entries(assets)) {
    assert.match(
      assetPath,
      new RegExp(`/${id}_flag_display-[a-f0-9]{16}\\.webp$`, "u"),
    );
    await assert.rejects(access(`${root}/public${assetPath}`), { code: "ENOENT" });
  }
  assert.match(
    visualsSource,
    /const factionFlag = \(pathname: string\) => wikiUrl\(pathname\)/u,
  );
});
