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
const globalStyles = await readFile(`${root}/app/globals.css`, "utf8");

test("international dock routes small raster flags through SiguaWiki without local copies", async () => {
  assert.equal(Object.keys(assets).length, 17);
  assert.equal(assets.imf, "/assets/factions/imf_flag_display-cd2924e917803092.webp");
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
  assert.doesNotMatch(globalStyles, /\.faction-dock__flag-shape img\s*\{[^}]*object-fit:\s*fill/su);
  assert.match(
    globalStyles,
    /\.faction-dock__flag-shape img\s*\{[^}]*object-fit:\s*cover/su,
  );
});

const currentFlags = {
  adf: "/assets/factions/adf_flag_display-4746ddfd99efcd60.webp",
  afu: "/assets/factions/afu_flag_display-509160df9dfdb468.webp",
  baf: "/assets/factions/baf_flag_display-5a4c4ea3393e175c.webp",
  caf: "/assets/factions/caf_flag_display-a811b21400e46e45.webp",
  crf: "/assets/factions/crf_flag_display-482bbf7f1d538f1a.webp",
  gfi: "/assets/factions/gfi_flag_display-0ab6261ca89a83c4.webp",
  mei: "/assets/factions/mei_flag_display-9a76a57afd76039f.webp",
  pla: "/assets/factions/pla_flag_display-5d25134bdf6bff72.webp",
  plaagf: "/assets/factions/plaagf_flag_display-735073dc42bc6552.webp",
  planmc: "/assets/factions/planmc_flag_display-8fdc8b29867f1f6d.webp",
  rgf: "/assets/factions/rgf_flag_display-cc62cc507b34b884.webp",
  tlf: "/assets/factions/tlf_flag_display-b32c6f17387f8a61.webp",
  usa: "/assets/factions/usa_flag_display-47d863a1c9ab9a5e.webp",
  usmc: "/assets/factions/usmc_flag_display-abbc5f2bd2bd1e3c.webp",
  vdv: "/assets/factions/vdv_flag_display-ea34eb994533be3b.webp",
  wpmc: "/assets/factions/wpmc_flag_display-70554dec83472321.webp",
};

test("international faction routes select the reviewed shared flag paths", () => {
  assert.equal(Object.keys(currentFlags).length, 16);
  for (const [id, expectedPath] of Object.entries(currentFlags)) {
    assert.equal(assets[id], expectedPath, `${id} shared flag`);
  }
});
