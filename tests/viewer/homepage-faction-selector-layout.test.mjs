import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogPath = new URL("../../app/CatalogApp.tsx", import.meta.url);
const stylesPath = new URL("../../app/globals.css", import.meta.url);
const editionPath = new URL("../../app/site-edition.ts", import.meta.url);

test("AI disclosure sits below the faction title without consuming directory rows", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  const wheelStart = catalog.indexOf("<FactionCharacterWheel");
  const brandStart = catalog.indexOf(
    '<header className="faction-selector__brand">',
    wheelStart,
  );
  const searchStart = catalog.indexOf("<GlobalVehicleSearch", brandStart);
  const disclosureStart = catalog.indexOf('id="faction-selector-ai-notice"', brandStart);
  const panelStart = catalog.indexOf(
    'className="faction-selector__choice-panel"',
    disclosureStart,
  );

  assert.ok(brandStart >= 0);
  assert.ok(disclosureStart > brandStart && disclosureStart < searchStart);
  assert.ok(disclosureStart < panelStart);
  assert.match(
    catalog,
    /aria-describedby=\{\s*siteEdition === "international"\s*\?\s*"faction-selector-ai-notice"\s*:\s*undefined\s*\}/u,
  );
  assert.match(styles, /\.faction-selector__ai-notice\s*\{[\s\S]*?position:\s*absolute;/u);
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/u);
});

test("international load notice keeps one line and clears the faction directory", async () => {
  const [catalog, edition, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(editionPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  const internationalProfile = edition.slice(
    edition.indexOf("international: {"),
    edition.indexOf("china: {"),
  );
  assert.match(
    internationalProfile,
    /noticeLines:\s*\[\s*"首次载入大型载具组件包可能需要片刻，请以游戏内实际内容为准。",?\s*\]/u,
  );
  assert.doesNotMatch(internationalProfile, /noticeTitle:/u);
  assert.match(internationalProfile, /showNoticeCountdown:\s*false/u);
  assert.match(catalog, /editionProfile\.noticeLines\.map/u);
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.data-accuracy-notice\s*\{[\s\S]*?right:\s*auto;[\s\S]*?bottom:\s*clamp\(20px,\s*3svh,\s*34px\);[\s\S]*?left:\s*clamp\(24px,\s*3\.3vw,\s*64px\);[\s\S]*?top:\s*auto;/u,
  );
});

test("faction prompt keeps the display face while closing its decorative center cuts", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(
    styles,
    /\.faction-selector__brand-title h1\s*\{[\s\S]*?font-family:\s*var\(--font-faction-display\);/u,
  );
  assert.match(
    styles,
    /\.faction-selector__brand-title h1\s*\{[\s\S]*?filter:\s*[\s\S]*?url\("#faction-title-close-cuts"\)/u,
  );
  assert.match(
    styles,
    /\.faction-selector__brand-title h1\s*\{[\s\S]*?-webkit-text-stroke:\s*0;/u,
  );
  assert.match(
    styles,
    /\.faction-selector__brand-title h1\s*\{[\s\S]*?-webkit-text-fill-color:\s*currentColor;/u,
  );
  assert.match(
    styles,
    /\.faction-selector__brand-title h1\s*\{[\s\S]*?background:\s*none;/u,
  );
  assert.match(
    catalog,
    /id="faction-title-close-cuts"[\s\S]*?<feMorphology[\s\S]*?operator="dilate"[\s\S]*?radius="0 1\.85"[\s\S]*?<feMorphology[\s\S]*?operator="erode"[\s\S]*?radius="0 1\.85"/u,
  );
});

test("edition switch label styling does not shrink the international wordmark", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.equal(
    (catalog.match(/className="site-edition-switch__label"/gu) ?? []).length,
    2,
  );
  assert.doesNotMatch(catalog, /site-edition-switch--china-dock/u);
  assert.doesNotMatch(catalog, /site-edition-switch--dock/u);
  assert.match(styles, /\.site-edition-switch__label\s*\{/u);
  assert.doesNotMatch(styles, /\.site-edition-switch\s*>\s*span\s*,/u);
  assert.doesNotMatch(styles, /\.site-edition-switch\s*>\s*small\s*\{/u);
  assert.match(
    styles,
    /\.faction-selector__brand-title \.brand-wordmark\.iron-rice-hall-wordmark\s*\{[\s\S]*?font-size:\s*clamp\(32px,\s*3vw,\s*50px\);/u,
  );
});

test("China edition preserves the exact five-person selector and lazy foreground boundary", async () => {
  const [catalog, edition, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(editionPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(
    edition,
    /CHINA_FACTION_IMAGE_ORDER\s*=\s*\[\s*"ekeqie",\s*"agesi",\s*"shenzhou",\s*"arctic-union",\s*"kaweier",?\s*\]/u,
  );
  assert.doesNotMatch(
    catalog,
    /href="\/china-assets\/china-faction-selector\.css"/u,
    "China selector must not depend on a stylesheet that is absent from the source tree",
  );
  assert.match(
    catalog,
    /src="\/china-assets\/local-preview\/official\/faction-impression\.jpg"/u,
  );
  assert.match(
    catalog,
    /<div className="faction-selector__choices" role="group" aria-label="选择阵营">/u,
  );
  assert.match(catalog, /className="faction-dock__flag-shape"/u);
  assert.match(catalog, /const requestedFactionId = activeFactionDustId \?\? morphFactionId;/u);
  assert.match(
    catalog,
    /foregroundRequested\s*\?\s*asset\.foreground\s*:\s*EMPTY_FACTION_FOREGROUND_SRC/u,
  );

  const preloadEffectStart = catalog.indexOf(
    "const requestedFactionId = activeFactionDustId ?? morphFactionId;",
  );
  const preloadEffectEnd = catalog.indexOf(
    "const previewFactionId",
    preloadEffectStart,
  );
  const preloadEffect = catalog.slice(preloadEffectStart, preloadEffectEnd);
  assert.doesNotMatch(preloadEffect, /for\s*\(\s*const group of visualGroups/u);
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector \.faction-selector__portrait/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__choice-panel \.faction-selector__choices/u,
  );
  assert.match(
    styles,
    /\.faction-selector__choice-label::after\s*\{[\s\S]*?bottom:\s*-8px;[\s\S]*?rotate\(45deg\)/u,
    "China keeps the baseline arrow-rectangle faction labels",
  );
  assert.match(
    styles,
    /\.faction-selector__choices\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/u,
    "China keeps the five-column silhouette hit areas",
  );
  for (const visualIndex of [0, 1, 2, 3, 4]) {
    assert.match(
      styles,
      new RegExp(
        String.raw`\.site-shell\[data-site-edition="china"\]\s+\.faction-selector:has\(\.faction-selector__choice\[data-visual-index="${visualIndex}"\]:is\(:hover,\s*:focus-visible\)\)\s+\.faction-selector__portrait\[data-visual-index="${visualIndex}"\]`,
        "u",
      ),
      `China hit area ${visualIndex} reveals its matching extracted foreground portrait`,
    );
  }
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="china"\][\s\S]*?\.faction-selector__portrait\[data-visual-index="4"\]\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?brightness\(1\.2\)[\s\S]*?transform:\s*scale\(1\.055\);/u,
    "China highlighted portraits restore the public-launch foreground treatment",
  );
  assert.match(
    styles,
    /\.brand-wordmark\s*\{[\s\S]*?width:\s*clamp\(224px,\s*17vw,\s*300px\);/u,
    "China hero wordmark keeps the public-launch dimensions instead of covering the selector hit areas",
  );
  assert.match(
    styles,
    /\.faction-dock__wordmark\s*\{[\s\S]*?width:\s*clamp\(177px,\s*13\.5vw,\s*252px\);/u,
    "China dock wordmark keeps the public-launch dimensions instead of covering vehicle cards",
  );
  assert.doesNotMatch(
    styles,
    /(?<!international"\] )\.faction-selector \.faction-selector__portrait\s*\{/u,
  );
  assert.equal(
    (
      styles.match(
        /\.site-shell\[data-site-edition="international"\] \.faction-selector__visual-frame--foregrounds::before/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.faction-selector__visual-frame--foregrounds::after/u,
  );
  assert.doesNotMatch(
    styles,
    /(?:^|\n)\.faction-selector__visual-frame--foregrounds::(?:before|after)\s*\{/u,
  );
});

test("China selector keeps source-registered portraits fixed during faction selection", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);
  const chinaBranchStart = catalog.indexOf(
    'siteEdition === "china" ? (',
  );
  const chinaSelectorStart = catalog.indexOf(
    '<div className="faction-selector__stage" aria-hidden="true">',
    chinaBranchStart,
  );
  const internationalWheelStart = catalog.indexOf(
    "<FactionCharacterWheel",
    chinaSelectorStart,
  );
  const chinaSelector = catalog.slice(chinaSelectorStart, internationalWheelStart);

  assert.ok(chinaBranchStart >= 0);
  assert.ok(chinaSelectorStart > chinaBranchStart);
  assert.ok(internationalWheelStart > chinaSelectorStart);
  assert.doesNotMatch(chinaSelector, /viewTransitionName:\s*"faction-selection-morph"/u);
  assert.match(
    chinaSelector,
    /data-morphing=\{morphFactionId === group\.id\}[\s\S]*?style=\{visualStyle\}/u,
  );
  assert.match(
    styles,
    /\.faction-selector__portrait\s*\{[\s\S]*?transform:\s*scale\(1\);/u,
  );
  assert.match(
    styles,
    /\.faction-selector\[data-selected="true"\] \.faction-selector__stage\s*\{[\s\S]*?transform:\s*none;/u,
  );
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="china"\][\s\S]*?\.faction-selector\[data-selected="true"\][\s\S]*?\.faction-selector__stage\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?width:\s*auto;[\s\S]*?height:\s*100svh;[\s\S]*?transform:\s*none !important;/u,
  );
});

test("filing link keeps the pinned display face after becoming an anchor", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(
    catalog,
    /className="site-footer__filing"[\s\S]*?<a[\s\S]*?\{ICP_RECORD\.number\}/u,
  );
  assert.match(
    styles,
    /\.site-footer__filing > a,[\s\S]*?\.site-footer__help-panel header strong\s*\{[\s\S]*?font-family:\s*var\(--font-faction-display\);/u,
  );
  assert.doesNotMatch(styles, /\.site-footer__filing > span/u);
});

test("feedback action opens the published form instead of copying an email address", async () => {
  const catalog = await readFile(catalogPath, "utf8");

  assert.match(
    catalog,
    /const FEEDBACK_FORM_URL = "https:\/\/docs\.qq\.com\/form\/page\/DRnd4bWtKUGNnT3Vu";/u,
  );
  assert.match(
    catalog,
    /<a[\s\S]*?className="site-footer__sponsor-button site-footer__feedback-button"[\s\S]*?href=\{FEEDBACK_FORM_URL\}[\s\S]*?target="_blank"[\s\S]*?反馈问题 \/ 提建议[\s\S]*?<\/a>/u,
  );
  assert.doesNotMatch(catalog, /FEEDBACK_EMAIL|navigator\.clipboard|feedbackNotice/u);
});

test("both editions share one update-log modal and default it to the current site", async () => {
  const [catalog, modal] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(new URL("../../app/SiteFooterUpdates.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /const chinaUpdates = useSiteUpdates\("\/updates\.json"\);/u);
  assert.match(
    catalog,
    /const internationalUpdates = useSiteUpdates\("\/squad\/updates\.json"\);/u,
  );
  assert.match(catalog, /initialEdition=\{siteEdition\}/u);
  assert.match(catalog, /supportersDocumentUrl="\/supporters\.json"/u);
  assert.match(modal, /role="tablist" aria-label="选择更新日志版本"/u);
  assert.match(modal, /\["china", "国服"\]/u);
  assert.match(modal, /\["international", "国际版"\]/u);
  assert.match(modal, /const \[edition, setEdition\] = useState<SiteEdition>\(initialEdition\);/u);
  assert.match(modal, /const cachedUpdatesDocuments = new Map/u);
});

test("help restores its crew portrait and opens the token-gated runtime content editor", async () => {
  const [catalog, styles, adminModal] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
    readFile(
      new URL("../../app/SiteContentAdminModal.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(catalog, /import\("\.\/SiteContentAdminModal"\)/u);
  assert.match(
    catalog,
    /数据仅供参考[\s\S]*?className="site-footer__help-admin"[\s\S]*?管理员内容更新/u,
  );
  assert.match(catalog, /src="\/images\/site\/vehicle-crew-help\.webp"/u);
  assert.match(
    styles,
    /\.site-shell\[data-site-edition="international"\] \.site-footer__help-portrait\s*\{\s*display:\s*block;/u,
  );
  assert.match(adminModal, /const API_ROOT = "\/__admin\/content";/u);
  assert.match(adminModal, /type="password"/u);
  assert.match(adminModal, /credentials:\s*"same-origin"/u);
  assert.match(adminModal, /"If-Match": current\.etag/u);
  assert.match(adminModal, /"X-CSRF-Token": csrfToken/u);
  assert.match(adminModal, /dispatchRuntimeDocumentUpdated\(activeDocument\)/u);
});
