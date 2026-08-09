import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUNTIME_PROTECTION_MAP_CELL,
  RUNTIME_PROTECTION_MAP_SUPER_PRECISION,
  classifyRuntimeProtectionShot,
  reconstructRuntimeProtectionMapBlock,
  runtimeProtectionMapCumulativeSampleCount,
  runtimeProtectionMapGridSize,
  runtimeProtectionMapSuperGridSize,
} from "../../lib/runtime-protection-map.ts";
import {
  FACTION_IMAGE_ORDER,
  FACTION_VISUAL_ASSETS,
} from "../../app/international-faction-visuals.ts";
import {
  CPV_OFFICIAL_RESOURCE_NOTICE,
  isCpvVehicleRawName,
} from "../../app/vehicle-preview-policy.ts";
import {
  RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M,
  RUNTIME_GROUND_SCALE_TICK_INTERVAL_M,
  runtimeGroundScaleLengthM,
} from "../../lib/runtime-ground-scale.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the 3D ground reference follows vehicle size with half-metre ticks", () => {
  assert.equal(RUNTIME_GROUND_SCALE_TICK_INTERVAL_M, 0.5);
  assert.equal(RUNTIME_GROUND_SCALE_LABEL_INTERVAL_M, 1);
  assert.equal(runtimeGroundScaleLengthM(0.3), 1);
  assert.equal(runtimeGroundScaleLengthM(2.5), 3);
  assert.equal(runtimeGroundScaleLengthM(5.2), 6);
  assert.equal(runtimeGroundScaleLengthM(24), 24);
});

test("new faction backgrounds drive both catalog and detail viewer surfaces", async () => {
  const exactFactionBackgrounds = {
    adf: "ADF.webp",
    afu: "AFU.webp",
    baf: "BAF.webp",
    caf: "CAF.webp",
    crf: "CRF.webp",
    gfi: "GFI.webp",
    imf: "IMF.webp",
    mei: "INS.webp",
    pla: "PLA.webp",
    plaagf: "PLAAGF.webp",
    planmc: "PLANMC.webp",
    rgf: "RGF.webp",
    tlf: "TLF.webp",
    usa: "USA.webp",
    usmc: "USMC.webp",
    vdv: "VDV.webp",
    wpmc: "WPMC.webp",
  };
  for (const [groupId, filename] of Object.entries(exactFactionBackgrounds)) {
    const expectedUrl = `/images/faction-bg/${filename}`;
    assert.equal(FACTION_VISUAL_ASSETS[groupId].catalogBackground, expectedUrl);
    await access(path.join(root, "public", "images", "faction-bg", filename));
  }
  const rendererSource = await readFile(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(rendererSource, /alpha: true/u);
  assert.match(rendererSource, /renderer\.setClearColor\(0x000000, 0\)/u);
  assert.doesNotMatch(rendererSource, /scene\.background\s*=/u);
  assert.doesNotMatch(
    styles,
    /\.detail-panel--viewer \.international-vehicle-viewer \.runtime-vehicle-viewer[^}]*var\(--faction-catalog-background/su,
  );
  assert.match(
    styles,
    /\.detail-panel--viewer \.international-vehicle-viewer \.runtime-vehicle-viewer[^}]*backdrop-filter:\s*blur\(24px\)/su,
  );
  assert.match(styles, /\.vehicle-encyclopedia[^}]*var\(--faction-catalog-background/su);
});

test("runtime viewer resizes without resetting the shared camera", async () => {
  const rendererSource = await readFile(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    rendererSource,
    /const sizeChanged = width !== rendererWidth \|\| height !== rendererHeight;/u,
  );
  const resizeStart = rendererSource.indexOf("const resize = () => {");
  const resizeEnd = rendererSource.indexOf("const resizeObserver", resizeStart);
  assert.ok(resizeStart >= 0 && resizeEnd > resizeStart);
  const resizeSource = rendererSource.slice(resizeStart, resizeEnd);
  assert.match(resizeSource, /camera\.updateProjectionMatrix\(\);\s+render\(\);/u);
  assert.doesNotMatch(resizeSource, /resetViewRef/u);
  assert.match(
    rendererSource,
    /if \(!preserveShotVisual\) clearShotVisual\(\);/u,
  );
});

test("homepage character wheel keeps faction flags subdued until their portrait gains focus", async () => {
  const [catalogSource, styles] = await Promise.all([
    readFile(new URL("../../app/CatalogApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(catalogSource, /const flagFocus = Math\.exp\(-depth \* 1\.85\);/u);
  assert.match(catalogSource, /"--wheel-flag-opacity": flagOpacity\.toFixed\(3\)/u);
  assert.match(catalogSource, /const flagLift = 2 \+ \(1 - flagFocus\) \* 6;/u);
  assert.match(catalogSource, /className="faction-character-wheel__flag"/u);
  assert.match(catalogSource, /src=\{asset\.logo\}/u);
  assert.match(
    styles,
    /\.faction-character-wheel__flag\s*\{[^}]*opacity:\s*var\(--wheel-flag-opacity,\s*0\.08\)/su,
  );
  assert.match(
    styles,
    /\.faction-character-wheel__flag img\s*\{[^}]*saturate\(0\.82\)[^}]*brightness\(0\.9\)/su,
  );
  assert.match(styles, /--wheel-flag-headroom:\s*34px/u);
  assert.match(
    styles,
    /\.faction-character-wheel__image-shell\s*\{[^}]*padding-top:\s*var\(--wheel-flag-headroom\)/su,
  );
});

test("PLA follows PLAAGF in the shared international wheel and directory order", () => {
  const plaagfIndex = FACTION_IMAGE_ORDER.indexOf("plaagf");
  assert.equal(FACTION_IMAGE_ORDER[plaagfIndex + 1], "pla");
});

test("runtime protection map keeps the publish progressive grid contract", () => {
  const grid = runtimeProtectionMapGridSize(1920, 1080);
  assert.ok(grid.width <= 384);
  assert.ok(grid.height <= 256);
  assert.equal(grid.width % 8, 0);
  assert.equal(grid.height % 8, 0);

  const samples = [1, 2, 3, 4, 5].map((level) =>
    runtimeProtectionMapCumulativeSampleCount(grid.width, grid.height, level),
  );
  assert.deepEqual([...samples].sort((left, right) => left - right), samples);
  assert.equal(samples.at(-1), grid.width * grid.height);

  const superGrid = runtimeProtectionMapSuperGridSize(1920, 1080);
  assert.equal(superGrid.width, grid.width * 2);
  assert.equal(superGrid.height, grid.height * 2);
  assert.equal(superGrid.width * superGrid.height, grid.width * grid.height * 4);
  assert.equal(RUNTIME_PROTECTION_MAP_SUPER_PRECISION, 6);
});

test("protection map supports every viewer mode and exposes a distinct high-load super tier", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(
    source,
    /const protectionMapAvailable =\s*mode === "armor"/u,
  );
  assert.doesNotMatch(
    source,
    /!protectionEnabledRef\.current \|\|\s*modeRef\.current !== "armor"/u,
  );
  assert.match(source, /seedSuperProtectionMap\(standardGrid, cache\.superGrid\)/u);
  assert.match(source, /runtimeProtectionMapSuperGridSize/u);
  assert.match(source, /高负载 · 可能严重卡顿/u);
  assert.match(source, /data-super=\{level === RUNTIME_PROTECTION_MAP_SUPER_PRECISION\}/u);
  assert.match(styles, /\.viewer-protection-precision\[data-super="true"\]/u);
  assert.match(styles, /\.viewer-protection-precision__warning\[data-visible="true"\]/u);
});

test("all CPV variants suppress official appearance previews but retain hit runtime access", async () => {
  const [
    catalog,
    hitIndex,
    catalogSource,
    impressionSource,
    internationalSource,
    runtimeSource,
    styles,
  ] = await Promise.all([
    readFile(path.join(root, "generated", "international-catalog.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "app", "runtime-probe-hit-index.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "app", "CatalogApp.tsx"), "utf8"),
    readFile(path.join(root, "app", "runtime-probe-card-impressions.ts"), "utf8"),
    readFile(path.join(root, "app", "InternationalVehicleViewer.tsx"), "utf8"),
    readFile(path.join(root, "app", "RuntimeVehicleViewer.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);
  const cpvVariants = catalog.factions
    .flatMap((faction) => faction.cards)
    .flatMap((card) => card.variants.map((variant) => ({
      cardId: card.cardId,
      rawName: variant.rawName,
    })))
    .filter((variant) => isCpvVehicleRawName(variant.rawName));
  assert.deepEqual(
    cpvVariants.map(({ rawName }) => rawName).sort(),
    [
      "BP_CPV_M134",
      "BP_CPV_M134_Blue",
      "BP_CPV_M134_Red",
      "BP_CPV_Transport",
      "BP_CPV_Transport_Blue",
      "BP_CPV_Transport_CRF",
      "BP_CPV_Transport_Red",
    ],
  );
  assert.equal(isCpvVehicleRawName("BP_M1A2"), false);
  assert.equal(
    CPV_OFFICIAL_RESOURCE_NOTICE,
    "此载具的官方资源存在问题，暂时无法预览外观，装甲计算仍可用",
  );

  for (const variant of cpvVariants) {
    assert.ok(
      hitIndex.descriptors.some((descriptor) =>
        descriptor.cardId === variant.cardId &&
        descriptor.rawName === variant.rawName &&
        descriptor.accessStatus === "public"
      ),
      `${variant.cardId}/${variant.rawName} retains public hit runtime access`,
    );
  }

  assert.match(
    catalogSource,
    /runtimeCardImpressionForVariant\(card\.record\.promoEntryId, rawName, siteEdition\)/u,
  );
  assert.match(
    impressionSource,
    /china-runtime-probe-card-impressions\.json/u,
  );
  assert.match(
    impressionSource,
    /china:\s*indexManifest\(chinaManifest\)/u,
  );
  assert.match(catalogSource, /const previewIssue = catalogCardPreviewIssue\(card\);/u);
  assert.match(catalogSource, /className="vehicle-card__preview-notice"/u);
  assert.match(catalogSource, /\{previewIssue\.message\}/u);
  assert.equal(
    (catalogSource.match(/\{previewNotice\}/gu) ?? []).length,
    2,
    "single and multi-livery cards both render the shared CPV notice",
  );
  assert.match(
    styles,
    /\.vehicle-card__preview-notice[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/su,
  );
  assert.match(
    styles,
    /\.catalog-workspace\[data-detail-open="true"\] \.vehicle-card__preview-notice > span[^}]*display:\s*none;/su,
  );
  assert.match(impressionSource, /if \(isCpvVehicleRawName\(rawName\)\) return null;/u);
  assert.match(
    impressionSource,
    /impression && !isCpvVehicleRawName\(impression\.rawName\) \? impression : null/u,
  );
  assert.match(
    internationalSource,
    /const mode = previewIssue && requestedMode === "exterior" \? "armor" : requestedMode;/u,
  );
  assert.match(
    internationalSource,
    /!previewIssue && mode === "exterior" && textureVariants\.length > 1/u,
  );
  assert.match(
    runtimeSource,
    /const previewIssue = officialVehiclePreviewIssue\(preview\.variantRawName\);/u,
  );
  assert.match(
    runtimeSource,
    /analysisVisualGroup\.name = "runtime-analysis-visual-occurrences";/u,
  );
  assert.match(runtimeSource, /visualGroup\.visible = modeRef\.current === "exterior";/u);
  assert.match(
    runtimeSource,
    /analysisVisualGroup\.visible = modeRef\.current !== "exterior";/u,
  );
  assert.match(
    runtimeSource,
    /\.filter\(\(\[value\]\) => !exteriorUnavailableMessage \|\| value !== "exterior"\)/u,
  );
});

test("runtime protection map classifies resolved native damage pools", () => {
  const result = (damage, resolution = "resolved") => ({ resolution, damage });
  const event = (poolKind, overrides = {}) => ({
    certainty: "resolved",
    poolDamage: 10,
    effectiveDamage: 10,
    poolKind,
    route: "direct",
    ...overrides,
  });

  assert.equal(
    classifyRuntimeProtectionShot(result([], "native-unknown")),
    RUNTIME_PROTECTION_MAP_CELL.none,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("hull")])),
    RUNTIME_PROTECTION_MAP_CELL.damage,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("engine")])),
    RUNTIME_PROTECTION_MAP_CELL.engine,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("ammo-rack")])),
    RUNTIME_PROTECTION_MAP_CELL.ammo,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("engine"), event("ammo-rack")])),
    RUNTIME_PROTECTION_MAP_CELL.engineAndAmmo,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("seat", { effectiveDamage: 0 })])),
    RUNTIME_PROTECTION_MAP_CELL.none,
  );
  assert.equal(
    classifyRuntimeProtectionShot(result([event("seat")])),
    RUNTIME_PROTECTION_MAP_CELL.none,
  );
});

test("a coarse protection sample reconstructs its publish-sized block", () => {
  const width = 8;
  const height = 8;
  const samples = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const reconstructed = new Uint8Array(width * height);
  samples[0] = RUNTIME_PROTECTION_MAP_CELL.engine;
  mask[0] = 1;

  reconstructRuntimeProtectionMapBlock(samples, mask, width, height, 0, 0, reconstructed);
  assert.ok(reconstructed.every((value) => value === RUNTIME_PROTECTION_MAP_CELL.engine));
});

test("weapon selector stays source-scoped until the user searches globally", async () => {
  const [source, weaponLabelSource, styles] = await Promise.all([
    readFile(
      new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../app/runtime-probe-weapon-labels.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    source,
    /const sourceFilteredOptions = useMemo\([\s\S]*?selectedSource[\s\S]*?options\.filter/u,
  );
  assert.match(
    source,
    /const showAllSources = !selectedSource \|\| Boolean\(normalizedQuery\)/u,
  );
  assert.match(
    source,
    /normalizedQuery \? options : sourceFilteredOptions/u,
  );
  assert.match(
    source,
    /option\.provenanceLabels\.join\(\s*" ",?\s*\)/u,
    "a weapon-name search must include every delivery provenance label",
  );
  assert.match(
    source,
    /selectedSource\s*\?\s*selected\.weaponLabel\s*:\s*selected\.triggerLabel/u,
    "the closed selector must suppress repeated source labels",
  );
  assert.match(
    source,
    /showAllSources\s*\?\s*option\.label\s*:\s*option\.weaponLabel/u,
    "global search must restore complete source-qualified labels",
  );
  assert.match(
    source,
    /id: vehicleSource[\s\S]*?`\$\{source\.sourceKind\}::\$\{source\.cardId\}`[\s\S]*?`category::\$\{source\.sourceCategory\}`/u,
    "vehicle identity must stay card-specific while shared categories use an explicit category identity",
  );
  assert.match(
    source,
    /group: vehicleSource[\s\S]*?source\.groupName[\s\S]*?supportSource[\s\S]*?"支援武器"[\s\S]*?"步兵"/u,
    "vehicle sources must group by faction and special sources by support category",
  );
  assert.match(
    source,
    /menuLabel: source\.displayName/u,
    "source rows must display the runtime source name",
  );
  assert.doesNotMatch(source, /VEHICLE_SOURCE_UNSCOPED_GROUP/u);
  assert.match(weaponLabelSource, /runtimeHitRecordReferenceForVariant/u);
  assert.match(
    weaponLabelSource,
    /from "\.\.\/lib\/weapon-catalog\.ts"/u,
  );
  assert.match(weaponLabelSource, /runtime-weapon-source-index\.json/u);
  assert.match(weaponLabelSource, /weaponCatalogShippingVariants/u);
  assert.match(weaponLabelSource, /weaponCatalogBallisticProfileForId/u);
  assert.doesNotMatch(
    weaponLabelSource,
    /wiki-infantry-weapon-ballistics-index\.json|runtime-probe-weapon-label-index\.json/u,
  );
  assert.match(
    source,
    /const penetrationMm = ballistics\.penetrationAtRangeMm \?\? 0/u,
    "direct-fire rows must retain a visible zero penetration value",
  );
  assert.match(
    source,
    /effect\.penetrationKind === "shaped-charge"[\s\S]*?<WeaponPenetrationIcon[\s\S]*?kind="shaped-charge"[\s\S]*?<VehicleDamageTypeIcon[\s\S]*?kind="kinetic"/u,
    "penetration must use the shaped-charge icon or the encyclopedia kinetic icon",
  );
  const selectorLegendSource = source.match(
    /function RuntimeWeaponEffectLegend[\s\S]*?(?=function RuntimeWeaponSelectorLegend)/u,
  )?.[0];
  assert.ok(selectorLegendSource);
  assert.doesNotMatch(
    selectorLegendSource,
    /<Swords\b/u,
    "the direct-damage column must stay icon free",
  );
  assert.match(
    source,
    /<VehicleDamageTypeIcon[\s\S]*?kind=\{effect\.damageTypeKind\}/u,
    "radial events must keep their actual damage-type icon",
  );
  assert.match(
    source,
    /function RuntimeWeaponSelectorLegend[\s\S]*?>穿深（mm）<[\s\S]*?>直击伤害<[\s\S]*?>范围伤害</u,
    "the selector menu must carry its three-column legend",
  );
  assert.match(
    source,
    /className="infantry-weapon-select__option-scroll"[\s\S]*?<RuntimeWeaponSelectorLegend \/>[\s\S]*?className="viewer-search-select__options"/u,
    "the selector legend and rows must share one scrollbar gutter",
  );
  assert.match(
    source,
    /const weaponLabel = weaponNameZh\([\s\S]*?selectorVariant\?\.label \?\? weapon\.displayNameZh[\s\S]*?const familyLabel = weaponNameZh\([\s\S]*?const qualifier = weaponNameZh\(/u,
    "runtime selector labels must use the shared Chinese military-name projection",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-legend\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*var\(--weapon-penetration-column-width\)\)\s+minmax\(0,\s*var\(--weapon-direct-column-width\)\)\s+minmax\(0,\s*1fr\);/su,
    "penetration, direct, and radial values must align in fixed columns",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-legend\s*\{[^}]*--weapon-penetration-column-width:\s*80px;[^}]*--weapon-direct-column-width:\s*62px;[^}]*max-width:\s*250px;[^}]*column-gap:\s*0;/su,
    "the damage columns must stay compact without a dead gap between penetration and direct damage",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-header\s*>\s*span\s*\{[^}]*border-left:\s*1px solid rgba\(225,\s*200,\s*155,\s*0\.16\);[^}]*\}[\s\S]*?\.infantry-weapon-effect-legend__column\s*\{[^}]*border-left:\s*1px solid rgba\(225,\s*200,\s*155,\s*0\.16\);/su,
    "the selector header and every damage row must share subtle column separators",
  );
  assert.match(
    styles,
    /\.infantry-weapon-select__option-scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*\}[\s\S]*?>\s*\.viewer-search-select__options\s*\{[^}]*overflow:\s*visible;/su,
    "the selector header and rows must use the same scrollport width",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-header\s*>\s*span\s*\{[^}]*justify-content:\s*flex-start;[^}]*\}[\s\S]*?\.infantry-weapon-effect-legend__column--direct,[\s\S]*?justify-content:\s*flex-start;/su,
    "column headings and row contents must share their left edge",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-chip\[data-effect-role="direct-damage"\]\s*>\s*b\s*\{[^}]*color:\s*#ff7378;[^}]*text-align:\s*left;[^}]*text-shadow:/su,
    "direct damage must use aligned red glowing text without an icon",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-chip\[data-effect-role="penetration"\]\s*\{[^}]*grid-template-columns:\s*30px minmax\(0,\s*1fr\);[^}]*\}[\s\S]*?\.infantry-weapon-effect-chip\[data-effect-role="radial-damage"\]\s*\{[^}]*grid-template-columns:\s*24px minmax\(0,\s*auto\);/su,
    "penetration and radial icons must reserve fixed slots so their numbers align across rows",
  );
  assert.match(
    styles,
    /\.infantry-weapon-effect-chip\[data-effect-role="radial-damage"\][\s\S]*?\[data-damage-type-kind="heat"\][\s\S]*?\[data-damage-type-kind="hat"\][^}]*\{[^}]*width:\s*24px;[^}]*height:\s*18px;/su,
    "HEAT and HAT role icons must remain visibly larger in selector rows",
  );
});

test("detail chrome and multi-variant cards share continuous aligned geometry", async () => {
  const [catalogSource, styles] = await Promise.all([
    readFile(new URL("../../app/CatalogApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(catalogSource, /data-detail-open=\{selectedCard !== null\}/u);
  assert.match(
    styles,
    /\.site-shell\[data-detail-open="true"\][\s\S]*?\.faction-selector\[data-selected="true"\][\s\S]*?\.faction-dock\s*\{[\s\S]*?padding-inline:\s*8px;/u,
  );
  assert.match(
    catalogSource,
    /function liverySliceSkew\(count: number\)\s*\{\s*if \(count <= 2\) return 11;\s*if \(count === 3\) return 8;\s*return 6;\s*\}/u,
  );
  assert.match(catalogSource, /const LIVERY_SLICE_THUMBNAIL_BAND_START = 80;/u);
  assert.match(catalogSource, /const LIVERY_SLICE_DETAIL_BOUNDARY_SHIFT = 8;/u);
  assert.match(
    catalogSource,
    /if \(!thumbnailMode\) \{\s*return \(index \/ count\) \* 100 \+ LIVERY_SLICE_DETAIL_BOUNDARY_SHIFT;\s*\}/u,
    "full-size faction cards must retain their prior shifted equal-width slices",
  );
  assert.match(
    catalogSource,
    /LIVERY_SLICE_THUMBNAIL_BAND_START \+\s*\(\(index - 1\) \/ \(count - 1\)\) \* \(100 - LIVERY_SLICE_THUMBNAIL_BAND_START\)/u,
    "only thumbnail cards place all secondary livery impressions in the rightmost fifth",
  );
  assert.match(
    catalogSource,
    /thumbnailMode=\{selectedCard !== null\}/u,
    "the rightmost-fifth geometry must activate only after the detail view creates the thumbnail rail",
  );
  assert.match(
    catalogSource,
    /const diagonalOffset =\s*liverySliceSkew\(liveryOptions\.length\) \* \(1 - y \* 2\);/u,
    "pointer hit testing must use the same shallower diagonal as the clip path",
  );
  assert.match(
    catalogSource,
    /liverySliceIndexAtPosition\(\s*sourceX,\s*liveryOptions\.length,\s*thumbnailMode,\s*\)/u,
    "pointer hit testing must use the same full-size or thumbnail boundary mode as the visual clip",
  );
  assert.match(
    catalogSource,
    /data-impression-alignment=\{impressionAlignment\}/u,
  );
  assert.match(
    styles,
    /\.vehicle-card__impression\[data-impression-alignment="zvb4a-woodland"\]\s*\{\s*scale:\s*1\.09 1;/u,
  );
  assert.match(
    styles,
    /\.faction-dock__flag-shape\s*\{[\s\S]*?height:\s*clamp\(90px, 7\.5vw, 112px\);[\s\S]*?clip-path:\s*polygon\(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%\);/u,
    "China detail flags must keep the prior triangular pennant silhouette",
  );
  assert.match(
    styles,
    /\.vehicle-card--split:is\(\[data-livery-expanded="true"\], \[data-selected="true"\]\)::before\s*\{/u,
    "expanded and selected states must use one uninterrupted parent highlight",
  );
  assert.doesNotMatch(
    styles,
    /\.vehicle-card__livery-slice\[data-active="true"\]::after\s*\{[^}]*opacity:\s*1;/su,
  );
});

test("native pointer is hidden exactly while the vehicle crosshair is visible", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    source,
    /data-realtime-crosshair=\{realtimePointer \? "visible" : "hidden"\}/u,
  );
  assert.match(
    styles,
    /\.runtime-vehicle-viewer\[data-realtime-crosshair="visible"\] \.runtime-vehicle-viewer__host canvas\s*\{[^}]*cursor:\s*none;/su,
  );
});

test("international runtime viewer uses the published viewer layout surfaces", async () => {
  const source = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
  const internationalSource = await readFile(
    new URL("../../app/InternationalVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  const catalogSource = await readFile(
    new URL("../../app/CatalogApp.tsx", import.meta.url),
    "utf8",
  );
  const loaderSource = await readFile(
    new URL("../../app/VehicleViewerLoading.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  for (const contract of [
    'className="viewer-top-guide"',
    'className="viewer-engagement-controls"',
    'className="viewer-protection-controls"',
    'className="viewer-shot-result"',
    'className="viewer-armor-thickness-legend"',
    'className="runtime-protection-map-canvas"',
  ]) {
    assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /className="viewer-search-select(?:\s|")/u);
  assert.doesNotMatch(source, /className="runtime-hit-controls"/);
  assert.doesNotMatch(source, /className="runtime-armor-legend"/);
  assert.match(source, /const MAX_SHOT_TRACES = 3;/);
  assert.match(source, /encodeSharedShotPaths/);
  assert.match(source, /encodeViewerCameraState/);
  assert.match(source, /decodeViewerCameraState/);
  assert.match(source, /controls\.addEventListener\("end", onControlsEnd\)/);
  assert.match(source, /aria-label="高亮附加装甲"/u);
  assert.match(source, /useState\(false\)/u);
  assert.match(source, /data-penetration-kind=\{penetrationKind\}/u);
  assert.match(source, /<WeaponPenetrationIcon kind=\{penetrationKind\} size=\{15\} \/>/u);
  assert.match(source, /savedShots\.map/);
  assert.match(source, /new THREE\.CanvasTexture\(canvas\)/);
  assert.match(source, /context\.fillText\(String\(number\), 48, 49\)/);
  assert.match(source, /function resolveShotPathMarkerStyle/u);
  assert.doesNotMatch(source, /hatched/u);
  assert.match(source, /data-damage-effect=\{effect\?\.id\}/);
  assert.match(source, /className="viewer-damage-effect"/);
  assert.match(
    source,
    /const rowKey = `\$\{animationKey\}:[\s\S]*?key=\{rowKey\}/u,
  );
  assert.match(
    source,
    /function shouldShowPenetrationDamageLane[\s\S]*?effectiveDamageEventsByKind\(result, "point"\)[\s\S]*?directFireRoute[\s\S]*?result\.ballistics\.penetrationAtRangeMm[\s\S]*?result\.ballistics\.impactDamageAtRange[\s\S]*?result\.stoppedAtLayer !== null/u,
  );
  assert.match(
    source,
    /function shouldShowExplosionDamageLane[\s\S]*?result\.radial\.layers\.length > 0/u,
  );
  assert.match(source, /data-damage-lane="penetration"/u);
  assert.match(source, /data-damage-lane="explosion"/u);
  assert.doesNotMatch(source, /RadialDamageRouteSummary/u);
  assert.doesNotMatch(source, /viewer-radial-route-summary/u);
  assert.doesNotMatch(source, /爆心来源|候选搜索|实际收伤/u);
  assert.doesNotMatch(source, /组件收伤准入|overlap \/ visibility/u);
  assert.doesNotMatch(styles, /viewer-radial-route-summary/u);
  assert.match(source, /settledShotExplosionDamageHighlight/u);
  assert.match(source, /shotExplosionHighlightedComponents/u);
  assert.match(source, /data-no-pen="true"/u);
  assert.match(source, /data-term="penetration-types"/u);
  assert.match(source, /data-penetration-kind="kinetic"/u);
  assert.match(source, /data-penetration-kind="shaped-charge"/u);
  assert.doesNotMatch(source, /已造成直击伤害/u);
  assert.doesNotMatch(source, /viewer-post-penetration-note|shotStatusLabel/u);
  assert.doesNotMatch(
    source,
    /selectedWeaponLabel\?\.displayNameZh \?\? shotResult\.ballistics\.weaponId/u,
  );
  assert.match(
    source,
    /damage\.damageKind === "radial"[\s\S]*?viewer-damage-target__damage-type-icon[\s\S]*?viewer-damage-target__penetration-icon[\s\S]*?WeaponPenetrationIcon/u,
    "penetration cards must use the route icon rather than an explosion damage-type icon",
  );
  assert.doesNotMatch(source, /viewer-damage-heading|>伤害计算</u);
  assert.match(
    styles,
    /\.viewer-damage-lane\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*border-top:\s*1px solid var\(--brand\);/su,
    "penetration and explosion damage use full-width sections below a yellow divider",
  );
  assert.match(
    styles,
    /\.viewer-damage-lane__header strong\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*700;/su,
    "each damage lane owns the former section-heading hierarchy",
  );
  assert.match(
    styles,
    /\.viewer-path-metric-legend\s*\{[^}]*justify-content:\s*flex-end;/su,
    "the penetration-path legend must align to the right",
  );
  assert.match(
    styles,
    /\.viewer-shot-result\s*\{[^}]*box-sizing:\s*border-box;[^}]*max-height:\s*min\(calc\(100% - 24px\),\s*520px\);[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/su,
    "the damage result remains fully reachable inside the viewer height",
  );
  assert.match(
    styles,
    /\.viewer-search-select__menu\s*\{[^}]*display:\s*flex;[^}]*max-height:\s*min\(460px,\s*calc\(100dvh - 190px\)\);[^}]*flex-direction:\s*column;/su,
    "the weapon menu adapts to the available viewport height",
  );
  assert.match(
    styles,
    /\.viewer-search-select__options\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*min\(220px,\s*calc\(100dvh - 300px\)\);[^}]*overflow-y:\s*auto;/su,
    "all weapon options stay reachable through the menu's own scroll area",
  );
  assert.match(source, /className="viewer-search-select__clear"/);
  assert.match(source, /aria-label="清除武器搜索关键词"/u);
  assert.match(
    source,
    /const runtimeWeaponOptions = useMemo<RuntimeWeaponOption\[\]>[\s\S]*?runtimeAttackSources[\s\S]*?\.flatMap\(\(source\)/u,
    "the published selector must project every runtime source through one option model",
  );
  assert.match(
    source,
    /const selectorVariant = weapon\.selectorVariant/u,
    "runtime weapons must resolve their canonical selector variant reference",
  );
  assert.match(
    source,
    /resolveEditorNativeBallistics\(\s*weapon\.ballisticsModel,\s*weapon\.ballisticsWeaponIndex,\s*targetDistanceM/u,
  );
  assert.match(
    source,
    /const sourceIdentity = runtimeWeaponSourceIdentity\(source\)[\s\S]*?const sourceSummary = sourceIdentity\.label[\s\S]*?source: sourceIdentity,[\s\S]*?provenanceLabels/u,
    "runtime source identity must stay separate from delivery provenance labels",
  );
  assert.match(source, /<RuntimeWeaponSelector[\s\S]*?options=\{runtimeWeaponOptions\}/u);
  assert.match(source, /runtimeAttackSourceMatchesId\(source, requestedNavigation\.attacker\)/);
  assert.match(source, /runtimeAttackSourceMatchesId\(attackSource, requestedNavigation\.attacker\)/);
  assert.doesNotMatch(source, /loadRuntimeHitRecord/u);
  assert.match(source, /const model = indexedWeapon\.ballisticsModel/u);
  assert.match(source, /const preferredModel = preferredWeapon\.ballisticsModel/u);
  assert.match(source, /weaponModel: attackerModel|weaponModel,/);
  assert.match(source, /attacker: attackSource\.shareSlug/);
  assert.match(source, /loadedAttackSourceCardId === attackSource\?\.cardId/);
  assert.match(source, /<VehicleViewerLoading[\s\S]*?embedded/u);
  assert.match(source, /const showSceneLoadingOverlay = viewerPresentation === "loading"/u);
  assert.match(source, /data-viewer-presentation=\{viewerPresentation\}/u);
  assert.doesNotMatch(source, /className="viewer-texture-streaming"/u);
  assert.match(internationalSource, /className="viewer-texture-streaming"/u);
  assert.match(internationalSource, /onExteriorStreamingChange=\{setTextureStreaming\}/u);
  assert.match(
    internationalSource,
    /className="international-vehicle-viewer__stage"[\s\S]*className="viewer-texture-streaming"[\s\S]*<RuntimeVehicleViewer/u,
    "texture loading status is overlaid inside the 3D stage",
  );
  assert.doesNotMatch(
    source,
    /event\.buttons !== 0 \|\| modeRef\.current === "exterior"/u,
  );
  assert.doesNotMatch(
    source,
    /!pointerStart \|\| modeRef\.current === "exterior"/u,
  );
  assert.doesNotMatch(source, /if \(mode === "exterior"\) clearShotVisual\(\);/u);
  assert.match(source, /SOURCE-NATIVE GLTF \+ SPLIT HIT RUNTIME/u);
  assert.match(
    styles,
    /\.viewer-texture-streaming\s*\{[^}]*position:\s*absolute;[^}]*top:\s*12px;[^}]*right:\s*54px;[^}]*max-width:\s*min\(198px,\s*calc\(100% - 66px\)\);[^}]*min-height:\s*34px;[^}]*border-left:\s*3px solid #48b0ff;/su,
    "texture loading status is a compact overlay immediately left of the top-right close button",
  );
  assert.doesNotMatch(
    styles,
    /\.viewer-texture-streaming\s*\{[^}]*(?:position:\s*relative|top:\s*(?:52|54|98)px|right:\s*(?:8|12)px|margin:\s*0 12px 8px auto)/su,
  );
  assert.match(
    internationalSource,
    /aria-label=\{`外观贴图载入中，\$\{textureStreaming\.loaded\} \/ \$\{textureStreaming\.total\} 源资产，已完成部分将直接显示`\}/u,
  );
  assert.match(
    source,
    /let sharedRuntimeRenderer: THREE\.WebGLRenderer \| null = null;[\s\S]*function acquireRuntimeRenderer\(\): RuntimeRendererLease/u,
    "sequential vehicle viewers lease one reusable WebGL renderer",
  );
  assert.match(
    source,
    /if \(shared && sharedRuntimeRenderer === renderer\) \{\s*sharedRuntimeRendererLeased = false;\s*return;/u,
    "releasing the shared renderer keeps its context available for the next vehicle",
  );
  assert.match(
    source,
    /disposeScene\(scene\);\s*rendererLease\.release\(\);/u,
    "vehicle cleanup disposes scene assets before returning the renderer lease",
  );
  assert.match(
    source,
    /if \(sizeChanged && initialFitStabilizationPending\) \{\s*scheduleInitialFitStabilization\(\);/u,
    "a viewer opened during a faction transition waits for the final viewport before locking its fit",
  );
  assert.match(source, /host\.dataset\.viewerFitStabilized = "true";/u);
  assert.match(
    source,
    /preview\.cardId\.includes\("--portable-recon-drone--"\)[\s\S]*?controls\.minDistance = compactPortableDrone \? 0\.18 : 2;[\s\S]*?compactPortableDrone \? 0\.3 : 2\.5/su,
    "portable recon drones use their real sub-metre bounds instead of the vehicle fit floor",
  );
  assert.match(source, /controls\.addEventListener\("start", onControlsStart\);/u);
  assert.doesNotMatch(source, /runtime-vehicle-viewer__loading/u);
  assert.doesNotMatch(source, /正在加载真实组件包/u);
  assert.doesNotMatch(source, /源资产载入中/u);
  assert.match(loaderSource, /正在从就近节点接收模型、装甲与材质清单/u);
  assert.match(source, /aria-label="按当前载具相对厚度着色"/u);
  assert.match(source, /setHitSceneThreeModelArmorThicknessScale/u);
  assert.match(source, /relativeArmorScaleActive \? "relative" : "absolute"/u);
  assert.doesNotMatch(
    source,
    /group:\s*model\.weapons\[weapon\.weaponIndex\]\?\.role/,
    "weapon selector must not render internal weapon role IDs as group headings",
  );
  assert.doesNotMatch(source, /onChange=\{\(\) => undefined\}/);
  assert.match(internationalSource, /return state\.view;/);
  assert.match(source, /navigationState\?\.protection \?\? false/);
  assert.match(source, /view: mode,\s+protection: protectionActive,/);
  assert.match(
    internationalSource,
    /mode === "exterior" && textureVariants\.length > 1 && onTextureVariantChange/u,
  );
  assert.match(internationalSource, /aria-label="选择外观"/u);
  assert.match(internationalSource, /<span>选择外观<\/span>/u);
  assert.match(internationalSource, /className="international-vehicle-viewer__stage"/u);
  assert.match(catalogSource, /textureVariants=\{selectedCardGroup\?\.entries/u);
  assert.match(catalogSource, /onTextureVariantSelect=\{selectTextureVariant\}/u);
  assert.doesNotMatch(
    styles,
    /\.international-vehicle-viewer \.viewer-canvas[^}]*height:\s*100%/s,
  );
  assert.match(
    styles,
    /\.catalog-main\[data-detail-open="true"\][^}]*padding-bottom:\s*0;/s,
  );
  assert.match(
    catalogSource,
    /className="catalog-reveal"[\s\S]*?data-detail-open=\{selectedCard !== null\}/,
  );
  assert.match(
    styles,
    /\.catalog-reveal\[data-active="true"\]\[data-detail-open="true"\] \.catalog-reveal__inner[^}]*min-height:\s*0;/s,
  );
  assert.match(styles, /\.viewer-search-select__clear[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  assert.match(
    styles,
    /\.viewer-load-status[^}]*top:\s*auto;[^}]*bottom:\s*12px;/s,
    "loaded asset diagnostics stay clear of the top control cluster",
  );
  assert.match(
    styles,
    /\.viewer-texture-variant-switcher[^}]*top:\s*12px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s,
    "texture variants occupy their own centered top lane",
  );
  assert.match(
    styles,
    /\.turret-preview-controls[^}]*top:\s*54px;[^}]*right:\s*12px;/s,
    "the collapsed turret control occupies a separate upper-right lane",
  );
  assert.match(styles, /\.viewer-relative-armor-row[^}]*display:\s*flex;/s);
  assert.match(
    styles,
    /\.viewer-layer-list li\[data-path-marker="gun-collision"\][\s\S]*?--path-marker-border-style:\s*var\(--hit-marker-gun-collision-border-style\);/u,
  );
  assert.match(
    styles,
    /\.viewer-damage-list li\[data-damage-effect\][^}]*animation:\s*viewer-damage-card-impact/u,
  );
  assert.match(
    styles,
    /\.vehicle-viewer--data-loading-overlay[^}]*position:\s*absolute;[^}]*inset:\s*0;/s,
  );
  assert.match(
    styles,
    /\.viewer-search-select__search > input::-webkit-search-cancel-button[^}]*display:\s*none;/s,
  );
});
