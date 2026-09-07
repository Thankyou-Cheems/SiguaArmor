import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import * as fontkit from "fontkit";

import {
  ARMOR_ORIGIN,
  ICP_RECORD,
  LANDING_ORIGIN,
  NAVIGATOR_PATH,
  NAVIGATOR_URL,
  PUBLIC_SECURITY_RECORD,
  armorPath,
  armorUrl,
  landingArmorRedirectUrl,
} from "../../lib/public-site-topology.mjs";
import {
  PUBLIC_DOCUMENT_CACHE,
  classifyPublicDocumentRequest,
} from "../../tools/deploy/public-document-policy.mjs";
import {
  renderPublicSiteConfig,
  renderPublicSiteTemplate,
} from "../../tools/deploy/render-public-site-config.mjs";
import { patchPublicOriginCaddy } from "../../tools/deploy/patch-public-origin-caddy.mjs";
import { SITE_PORTAL_BRAND } from "../../tools/deploy/site-portal-brand.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

test("public topology owns the landing, Armor routes, and exact filing records", () => {
  assert.equal(LANDING_ORIGIN, "https://siguad.icu");
  assert.equal(ARMOR_ORIGIN, "https://armor.siguad.icu");
  assert.equal(NAVIGATOR_PATH, "/navigator");
  assert.equal(NAVIGATOR_URL, "https://siguad.icu/navigator");
  assert.equal(ICP_RECORD.number, "黑ICP备2025043874号-2");
  assert.equal(PUBLIC_SECURITY_RECORD.number, "黑公网安备 23050202000040号");
  assert.equal(
    PUBLIC_SECURITY_RECORD.url,
    "https://beian.mps.gov.cn/#/query/webSearch?code=23050202000040",
  );
  assert.equal(SITE_PORTAL_BRAND.displayName, "丝瓜地.爱惜呦");
  assert.equal(SITE_PORTAL_BRAND.englishName, "SiguaD.icu");
  assert.equal(armorPath("international"), "/squad/");
  assert.equal(armorPath("china"), "/sigua/");
  assert.equal(armorUrl("international"), "https://armor.siguad.icu/squad/");
  assert.equal(armorUrl("china"), "https://armor.siguad.icu/sigua/");
  assert.equal(
    landingArmorRedirectUrl("/squad/vehicles/sample", "?v=e"),
    "https://armor.siguad.icu/squad/vehicles/sample?v=e",
  );
  assert.equal(landingArmorRedirectUrl("/future-product/"), null);
});

test("document policy caches only ordinary HTML and never varies by mobile UA", () => {
  const desktop = classifyPublicDocumentRequest({
    host: "armor.siguad.icu",
    pathname: "/sigua/vehicles/sample",
    method: "GET",
    headers: { Accept: "text/html", "User-Agent": "desktop" },
  });
  const mobile = classifyPublicDocumentRequest({
    host: "armor.siguad.icu",
    pathname: "/sigua/vehicles/sample",
    method: "GET",
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 iPhone Mobile",
      "Sec-CH-UA-Mobile": "?1",
    },
  });
  assert.deepEqual(mobile, desktop);
  assert.equal(desktop.kind, "armor-html");
  assert.equal(desktop.cacheControl, PUBLIC_DOCUMENT_CACHE.armorHtml);

  for (const request of [
    { headers: { Accept: "text/x-component", RSC: "1" }, search: "" },
    { headers: { Accept: "*/*" }, search: "?_rsc=abc" },
    {
      headers: { Accept: "text/html", "Next-Router-State-Tree": "tree" },
      search: "",
    },
  ]) {
    const result = classifyPublicDocumentRequest({
      host: "armor.siguad.icu",
      pathname: "/sigua/vehicles/sample",
      method: "GET",
      ...request,
    });
    assert.equal(result.kind, "armor-rsc");
    assert.equal(result.cacheControl, "private, no-store");
  }

  assert.deepEqual(
    classifyPublicDocumentRequest({
      host: "armor.siguad.icu",
      pathname: "/__analytics/dau",
      method: "POST",
    }),
    { kind: "dynamic-control", cacheControl: "private, no-store" },
  );
});

test("selector roots and navigator remain short-cache documents while legacy Armor paths redirect", () => {
  assert.deepEqual(
    classifyPublicDocumentRequest({
      host: "siguad.icu",
      pathname: "/squad/vehicles/sample",
      search: "?v=e",
    }),
    {
      kind: "armor-redirect",
      status: 301,
      location: "https://armor.siguad.icu/squad/vehicles/sample?v=e",
    },
  );
  assert.deepEqual(
    classifyPublicDocumentRequest({ host: "siguad.icu", pathname: "/" }),
    { kind: "landing-html", cacheControl: PUBLIC_DOCUMENT_CACHE.landing },
  );
  assert.deepEqual(
    classifyPublicDocumentRequest({ host: "armor.siguad.icu", pathname: "/" }),
    { kind: "landing-html", cacheControl: PUBLIC_DOCUMENT_CACHE.landing },
  );
  for (const pathname of ["/navigator", "/navigator/", "/navigator/index.html"]) {
    assert.deepEqual(
      classifyPublicDocumentRequest({ host: "siguad.icu", pathname }),
      { kind: "navigator-html", cacheControl: PUBLIC_DOCUMENT_CACHE.landing },
    );
  }
  assert.deepEqual(
    classifyPublicDocumentRequest({
      host: "armor.siguad.icu",
      pathname: "/squad/vehicles/sample",
      headers: { Accept: "text/html" },
    }),
    { kind: "armor-html", cacheControl: PUBLIC_DOCUMENT_CACHE.armorHtml },
  );
});

test("catalog bootstrap stays visually empty until the full homepage is ready", async () => {
  const catalogApp = await readFile(
    path.join(ROOT, "app", "CatalogApp.tsx"),
    "utf8",
  );

  assert.doesNotMatch(catalogApp, /正在读取统一载具资料/u);
  assert.match(
    catalogApp,
    /if \(!catalogIndex\) \{\s*return null;\s*\}/u,
  );
});

test("catalog routes do not serialize the full product topology into every document", async () => {
  const routePaths = [
    "app/page.tsx",
    "app/duel/page.tsx",
    "app/vehicles/[cardId]/page.tsx",
    "app/factions/[groupId]/page.tsx",
    "app/china/page.tsx",
    "app/china/duel/page.tsx",
    "app/china/vehicles/[cardId]/page.tsx",
    "app/china/factions/[groupId]/page.tsx",
  ];
  const routeSources = await Promise.all(
    routePaths.map((relativePath) =>
      readFile(path.join(ROOT, ...relativePath.split("/")), "utf8"),
    ),
  );
  for (const [index, source] of routeSources.entries()) {
    assert.doesNotMatch(
      source,
      /generated\/(?:china-)?catalog-index\.json|catalogIndex=/u,
      `${routePaths[index]} must pass only the site edition to CatalogApp`,
    );
  }

  const bootstrap = await readFile(
    path.join(ROOT, "app", "catalog-bootstrap.ts"),
    "utf8",
  );
  assert.match(bootstrap, /import\("\.\.\/generated\/catalog-index\.json"\)/u);
  assert.match(
    bootstrap,
    /import\("\.\.\/generated\/china-catalog-index\.json"\)/u,
  );
});

test("direct catalog routes apply their location before rendering faction artwork", async () => {
  const catalogApp = await readFile(
    path.join(ROOT, "app", "CatalogApp.tsx"),
    "utf8",
  );

  assert.match(
    catalogApp,
    /const initialLocation = useMemo\([\s\S]*?parseCatalogLocation\(window\.location\.href/u,
  );
  assert.match(catalogApp, /useState\(initialLocation\.groupId\)/u);
  assert.doesNotMatch(
    catalogApp,
    /requestAnimationFrame\(applyLocation\)/u,
  );
  assert.match(
    catalogApp,
    /groupId === ALL_GROUPS[\s\S]*?visualGroups\.filter\(\(group\) => group\.id === groupId\)/u,
  );
});

test("deployment templates render from topology without mobile routing or stale legal data", async () => {
  const [selectorTemplate, landingTemplate, caddyTemplate, composeTemplate] =
    await Promise.all([
      readFile(
        path.join(
          ROOT,
          "deploy",
          "public-site",
          "armor-selector.template.html",
        ),
        "utf8",
      ),
      readFile(
        path.join(ROOT, "deploy", "public-site", "landing.template.html"),
        "utf8",
      ),
      readFile(
        path.join(ROOT, "deploy", "public-site", "Caddyfile.template"),
        "utf8",
      ),
      readFile(
        path.join(ROOT, "deploy", "public-site", "docker-compose.template.yml"),
        "utf8",
      ),
    ]);
  const selector = renderPublicSiteTemplate(selectorTemplate, "armor-selector");
  const landing = renderPublicSiteTemplate(landingTemplate, "landing");
  const caddy = renderPublicSiteTemplate(caddyTemplate, "Caddyfile");
  const compose = renderPublicSiteTemplate(composeTemplate, "docker-compose");

  assert.match(
    selector,
    /<title>藤瓜 \/ 丝瓜：战术小队铁皮饭堂<\/title>/u,
  );
  assert.match(selector, /aria-label="选择载具资料站"/u);
  assert.match(selector, /href="https:\/\/armor\.siguad\.icu\/sigua\/"/u);
  assert.match(selector, /href="https:\/\/armor\.siguad\.icu\/squad\/"/u);
  assert.match(selector, /tactical-squad-wordmark-62bff6fb051e\.png/u);
  assert.match(
    selector,
    /src="https:\/\/wiki\.siguad\.icu\/assets\/brand\/siguad-wiki-logo\.svg"/u,
  );
  assert.doesNotMatch(selector, /\/portal-assets\/siguad-wiki-logo/u);
  assert.match(selector, /class="portal__siguad-logo"/u);
  assert.match(selector, /alt="丝瓜地百科 SiguaD Wiki"/u);
  assert.match(selector, /siguad-armor-china-soldier-ddd587081da0\.webp/u);
  assert.match(selector, /siguad-armor-global-soldier-ccb90707110a\.webp/u);
  assert.match(selector, /藤瓜 · 国服载具资料/u);
  assert.match(selector, /丝瓜 · 国际服载具资料/u);
  assert.match(selector, /@media \(max-width: 720px\)/u);
  assert.match(selector, /href="https:\/\/siguad\.icu\/"/u);
  assert.match(selector, /黑公网安备 23050202000040号/u);
  assert.match(selector, /public-security-record-icon\.svg/u);

  assert.match(landing, /href="https:\/\/armor\.siguad\.icu\/squad\/"/u);
  assert.match(landing, /href="https:\/\/armor\.siguad\.icu\/sigua\/"/u);
  assert.match(landing, /<title>丝瓜地\.爱惜呦 · SiguaD\.icu<\/title>/u);
  assert.match(
    landing,
    /<link rel="canonical" href="https:\/\/siguad\.icu\/navigator" \/>/u,
  );
  assert.match(landing, /data-landmark="armor-pot"/u);
  assert.match(landing, /data-landmark="mortar"/u);
  assert.match(landing, /data-landmark="siguamap"/u);
  assert.match(landing, /data-landmark="more"/u);
  assert.equal((landing.match(/data-landmark=/gu) ?? []).length, 4);
  assert.equal((landing.match(/data-preview-target="armor"/gu) ?? []).length, 1);
  assert.equal((landing.match(/data-product-preview=/gu) ?? []).length, 4);
  assert.match(landing, /id="product-armor"/u);
  assert.match(landing, /id="product-mortar"/u);
  assert.match(landing, /id="product-map"/u);
  assert.match(landing, /id="product-more"/u);
  assert.match(landing, /aria-label="进入铁皮饭堂藤瓜国服站"/u);
  assert.match(landing, /aria-label="进入铁皮饭堂丝瓜国际站"/u);
  assert.match(
    landing,
    /url\("https:\/\/armor\.siguad\.icu\/squad\/images\/faction-bg\/PLA\.webp"\) center \/ cover no-repeat/u,
  );
  assert.match(
    landing,
    /url\("https:\/\/armor\.siguad\.icu\/squad\/images\/faction-bg\/PLAAGF\.webp"\) center \/ cover no-repeat/u,
  );
  assert.match(landing, /Shenzhou Defense Community/u);
  assert.match(landing, /People's Liberation Army/u);
  assert.match(landing, /Select database · 选择数据版本/u);
  assert.equal((landing.match(/火热开发中，敬请期待/gu) ?? []).length, 6);
  assert.match(landing, /pointerenter/u);
  assert.match(landing, /pointerleave/u);
  assert.match(landing, /17 个阵营的写实士兵/u);
  assert.match(landing, /class="brand__cn">丝瓜地·爱惜呦<\/span>/u);
  assert.match(landing, /class="brand__en" lang="en">SiguaD\.icu<\/span>/u);
  assert.match(landing, /font-size: clamp\(16px, 1\.6vw, 24px\)/u);
  assert.match(landing, /linear-gradient\(180deg, #fffef2 4%, #ffe4a3 58%, #fff6dc 100%\)/u);
  assert.doesNotMatch(landing, /Q 版|战术工具花园|正在生长/u);
  assert.doesNotMatch(
    landing,
    /brand__lockup|17 FACTIONS|siguad-tactical-lockup|点击高亮目标|装甲 · 火力 · 战术规划|装甲计算器|已开席|NOW OPEN|feature-dock|data-dialog-target/u,
  );
  assert.match(
    landing,
    new RegExp(
      `url\\("${SITE_PORTAL_BRAND.fontAsset.portalPath.replaceAll(".", "\\.")}"\\)`,
      "u",
    ),
  );
  assert.match(
    landing,
    new RegExp(
      `src="${SITE_PORTAL_BRAND.sceneAsset.portalPath.replaceAll(".", "\\.")}"`,
      "u",
    ),
  );
  for (const figure of Object.values(SITE_PORTAL_BRAND.armorFigures)) {
    assert.match(
      landing,
      new RegExp(`src="${figure.portalPath.replaceAll(".", "\\.")}"`, "u"),
    );
  }
  assert.match(landing, /黑ICP备2025043874号-2/u);
  assert.match(landing, /黑公网安备 23050202000040号/u);
  assert.match(
    landing,
    /https:\/\/beian\.mps\.gov\.cn\/#\/query\/webSearch\?code=23050202000040/u,
  );
  assert.doesNotMatch(
    landing,
    /黑ICP备2025043874号-1|href="\/(?:squad|sigua)\//u,
  );

  assert.match(caddy, /host siguad\.icu/u);
  assert.match(caddy, /host armor\.siguad\.icu/u);
  assert.match(caddy, /host wiki\.siguad\.icu/u);
  assert.match(
    caddy,
    /@wikiContentAdminRequest \{[\s\S]*?host wiki\.siguad\.icu[\s\S]*?path \/__admin\/content \/__admin\/content\/\*/u,
  );
  assert.ok(
    caddy.indexOf("@wikiContentAdminRequest {") < caddy.indexOf("@unauthorized not header"),
    "Wiki management must reach the key-protected admin service before the Armor-only origin gate",
  );
  assert.match(caddy, /@selectorDocument path \/ \/index\.html/u);
  assert.match(
    caddy,
    /@navigatorDocument path \/navigator \/navigator\/ \/navigator\/index\.html/u,
  );
  assert.match(caddy, /rewrite \* \/navigator\/index\.html/u);
  assert.match(caddy, /handle @armorRoot \{/u);
  assert.doesNotMatch(caddy, /redir @armorRoot/u);
  assert.doesNotMatch(caddy, /legacyWeaponDps|\/weapon-dps/u);
  assert.match(caddy, /@selectorAssets path \/portal-assets\/tactical-squad-wordmark/u);
  assert.match(caddy, /header !RSC/u);
  assert.equal(
    (caddy.match(/uri replace \/sigua \/china 1/gu) ?? []).length,
    2,
    "both China HTML and application requests must reach the /china route",
  );
  assert.equal(
    (caddy.match(/rewrite \/sigua\/ \/china/gu) ?? []).length,
    2,
    "the China root must avoid leaking Vinext's internal /china redirect",
  );
  assert.match(caddy, /@squadApplication path \/squad\.rsc \/squad\/\*/u);
  assert.match(caddy, /rewrite \/squad\.rsc \/\.rsc/u);
  assert.match(caddy, /@siguaApplication path \/sigua\.rsc \/sigua\/\*/u);
  assert.match(caddy, /rewrite \/sigua\.rsc \/china\.rsc/u);
  assert.match(caddy, /s-maxage=60/u);
  assert.match(caddy, /path \/notices\.json \/supporters\.json \/updates\.json/u);
  assert.doesNotMatch(caddy, /generatedPortalAssets|squad\/images\/site/u);
  assert.match(caddy, /root \* \{\$SIGUA_PUBLIC_ROOT:\/srv\/public\}\/squad/u);
  assert.match(compose, /image: node:22-alpine/u);
  assert.match(compose, /command: \["node", "\/app\/server\.js"\]/u);
  assert.match(compose, /context: \.\/services\/analytics/u);
  assert.match(compose, /\.\/services\/content-admin:\/app:ro/u);
  assert.match(compose, /SIGUA_WIKI_ORIGIN: https:\/\/wiki\.siguad\.icu/u);
  assert.match(compose, /SIGUA_WIKI_ROOT: \/srv\/wiki/u);
  assert.match(
    compose,
    /SIGUA_ANALYTICS_ADMIN_URL: http:\/\/sigua-analytics:8081\/__analytics\/admin\/overview/u,
  );
  assert.ok(
    compose.includes(
      "${SIGUA_WIKI_VEHICLE_DATA_ROOT:-/opt/Website/sigua-wiki/data/vehicles}:/srv/wiki/data/vehicles",
    ),
  );
  assert.doesNotMatch(caddy, /mobile\.html|User-Agent|Sec-CH-UA-Mobile/u);
  assert.equal(
    (compose.match(/SIGUA_PUBLIC_ORIGIN: https:\/\/armor\.siguad\.icu/gu) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(
    `${selector}\n${landing}\n${caddy}\n${compose}`,
    /\{\{[A-Z0-9_]+\}\}/u,
  );
});

test("Site Portal brand assets are copied beside rendered config", async () => {
  await mkdir(path.join(ROOT, "outputs"), { recursive: true });
  const outputRoot = await mkdtemp(
    path.join(ROOT, "outputs", "site-portal-render-"),
  );
  try {
    await renderPublicSiteConfig(outputRoot);
    const selector = await readFile(
      path.join(outputRoot, "release", "index.html"),
      "utf8",
    );
    assert.equal(
      SITE_PORTAL_BRAND.brandLogoAsset.sourceUrl,
      "https://wiki.siguad.icu/assets/brand/siguad-wiki-logo.svg",
    );
    assert.equal(
      SITE_PORTAL_BRAND.releaseAssets.includes(SITE_PORTAL_BRAND.brandLogoAsset),
      false,
    );
    const navigator = await readFile(
      path.join(outputRoot, "release", "navigator", "index.html"),
      "utf8",
    );
    assert.match(selector, /藤瓜 · 国服载具资料/u);
    assert.match(selector, /丝瓜 · 国际服载具资料/u);
    assert.match(navigator, /data-landmark="armor-pot"/u);
    assert.equal(
      (await readFile(
        path.join(
          outputRoot,
          "release",
          "portal-assets",
          "public-security-record-icon.svg",
        ),
        "utf8",
      )).includes("data:image/png;base64"),
      true,
    );
    assert.match(
      navigator,
      /<link rel="canonical" href="https:\/\/siguad\.icu\/navigator" \/>/u,
    );
    for (const asset of SITE_PORTAL_BRAND.releaseAssets) {
      const sourceBytes = await readFile(
        path.join(ROOT, "deploy", "public-site", "assets", asset.fileName),
      );
      assert.deepEqual(
        await readFile(
          path.join(outputRoot, "release", "portal-assets", asset.fileName),
        ),
        sourceBytes,
      );
    }
    const wordmarkFont = fontkit.openSync(
      path.join(
        ROOT,
        "deploy",
        "public-site",
        "assets",
        SITE_PORTAL_BRAND.fontAsset.fileName,
      ),
    );
    for (const character of "丝瓜地·爱惜呦SiguaD.icu") {
      assert.equal(
        wordmarkFont.hasGlyphForCodePoint(character.codePointAt(0)),
        true,
        `temporary wordmark font lacks ${character}`,
      );
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("outer Caddy patch adds only the Armor host and is idempotent", () => {
  const source = [
    "http://unrelated.example { respond 200 }",
    "http://siguad.icu {",
    "  import sigua_public_static",
    "}",
    "https://siguad.icu {",
    "  tls internal",
    "  import sigua_public_static",
    "}",
    "",
  ].join("\n");
  const expected = source
    .replace(
      "http://siguad.icu {",
      "http://siguad.icu, http://armor.siguad.icu {",
    )
    .replace(
      "https://siguad.icu {",
      "https://siguad.icu, https://armor.siguad.icu {",
    );

  assert.equal(patchPublicOriginCaddy(source), expected);
  assert.equal(patchPublicOriginCaddy(expected), expected);
  assert.match(expected, /http:\/\/unrelated\.example/u);
  assert.throws(
    () => patchPublicOriginCaddy("http://siguad.icu {\n}"),
    /expected exactly one outer Caddy site label/u,
  );
});

test("deployment preflight resolves the Armor host instead of injecting Host", async () => {
  const [caddy, probe] = await Promise.all([
    readFile(
      path.join(ROOT, "deploy", "public-site", "Caddyfile.template"),
      "utf8",
    ),
    readFile(
      path.join(ROOT, "tools", "deploy", "preflight-public-probe.sh"),
      "utf8",
    ),
  ]);

  assert.match(probe, /http:\/\/\$\{public_host\}:8080\/healthz/u);
  assert.match(
    probe,
    /http:\/\/\$\{public_host\}:8080\/__admin\/content\/session/u,
  );
  assert.doesNotMatch(probe, /--header="Host:/u);
  assert.match(caddy, /route @landingHost \{/u);
  assert.match(caddy, /route @armorHost \{/u);
  assert.doesNotMatch(caddy, /handle @(?:landing|armor)Host \{/u);
});
