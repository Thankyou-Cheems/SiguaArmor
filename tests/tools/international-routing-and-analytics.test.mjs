import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildCatalogUrl,
  parseCatalogLocation,
} from "../../lib/catalog-navigation.mjs";
import {
  buildRuntimeAttackSourceShareSlug,
  normalizeRuntimeAttackSourceShareSlug,
} from "../../lib/runtime-attack-source-share.mjs";
import { encodeViewerCameraState } from "../../lib/viewer-camera-share.mjs";
import { encodeViewerTurretState } from "../../lib/viewer-turret-share.mjs";
import {
  parseSupportersDocument,
  SUPPORTERS_DOCUMENT_URL,
} from "../../lib/supporters-document.mjs";
import { parseUpdatesDocument } from "../../lib/updates-document.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SENSITIVE_UPDATE_LOG_WORDING = /脱敏|去敏|去标|苏联红星|伊朗标志/u;
const SAMPLE_INDEX = {
  groups: [{ id: "pla" }],
  records: [
    {
      promoEntryId: "sample",
      defaultCardId: "sample-card",
      routeSlug: "sample-tank",
      official: { groupId: "pla" },
      variants: [],
    },
    {
      promoEntryId: "other",
      defaultCardId: "other-card",
      routeSlug: "other-tank",
      official: { groupId: "pla" },
      variants: [],
    },
  ],
};

test("public update logs omit internal content-handling details", async () => {
  const sources = await Promise.all(
    [
      path.join(ROOT, "public", "updates.json"),
      path.join(ROOT, "app", "updates-seed.json"),
      path.join(ROOT, "app", "updates-china-seed.json"),
    ].map((filePath) => readFile(filePath, "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, SENSITIVE_UPDATE_LOG_WORDING);
  }
});

test("both edition logs lead with the current release and omit superseded claims", async () => {
  const documents = await Promise.all(
    [
      path.join(ROOT, "public", "updates.json"),
      path.join(ROOT, "app", "updates-seed.json"),
      path.join(ROOT, "app", "updates-china-seed.json"),
    ].map(async (filePath) => {
      const parsed = parseUpdatesDocument(JSON.parse(await readFile(filePath, "utf8")));
      assert.ok(parsed, `invalid update document: ${filePath}`);
      return parsed;
    }),
  );
  const currentEntry = documents[0].entries[0];

  assert.equal(currentEntry.id, "2026-08-22-draggable-explosion-origin");
  for (const document of documents) {
    assert.equal(document.siteUpdatedOn, "2026-08-22");
    assert.deepEqual(document.entries[0], currentEntry);
    assert.ok(
      !document.entries.some(({ id }) => id === "2026-07-24-hit-path-footer-selector"),
      "superseded 2026-07-24 update entry must be removed",
    );
    assert.doesNotMatch(JSON.stringify(document), /发动机改为紫色系/u);
    assert.match(JSON.stringify(document.entries[0]), /纯径向间接伤害/u);
    assert.match(JSON.stringify(document.entries[0]), /0 伤害/u);
    assert.match(JSON.stringify(document.entries[0]), /Shift \+ 滚轮/u);
    const radialEntry = document.entries.find(
      ({ id }) => id === "2026-08-21-radial-damage-viewer-controls",
    );
    assert.ok(radialEntry, "radial viewer release entry must be retained");
    assert.match(JSON.stringify(radialEntry), /原生接收链/u);
    assert.match(JSON.stringify(radialEntry), /向左收起/u);
    assert.match(JSON.stringify(radialEntry), /自由视角/u);
    const cameraEntry = document.entries.find(
      ({ id }) => id === "2026-08-21-vehicle-camera-perspective",
    );
    assert.ok(cameraEntry, "vehicle camera release entry must be retained");
    assert.match(JSON.stringify(cameraEntry), /90° 水平 FOV/u);
    assert.match(JSON.stringify(cameraEntry), /数字键 1–5/u);
    const duelEntry = document.entries.find(
      ({ id }) => id === "2026-08-20-vehicle-duel",
    );
    assert.ok(duelEntry, "vehicle duel release entry must be retained");
    assert.match(JSON.stringify(duelEntry), /新增双载具同时交火页面/u);
    assert.match(JSON.stringify(duelEntry), /弹药架先归零时立即判负/u);
    const rhythmEntry = document.entries.find(
      ({ id }) => id === "2026-08-20-weapon-rhythm-distance-curves",
    );
    assert.ok(rhythmEntry, "weapon rhythm release entry must be retained");
    assert.match(JSON.stringify(rhythmEntry), /武器节奏与 DPS 不再使用独立搜索页/u);
    assert.match(JSON.stringify(rhythmEntry), /打开全站武器库后距离滑条变为不可用/u);
    assert.match(JSON.stringify(rhythmEntry), /距离滑条上限现在跟随/u);
    const dataRefreshEntry = document.entries.find(
      ({ id }) => id === "2026-08-14-editor-vehicle-weapon-refresh",
    );
    assert.ok(dataRefreshEntry, "Editor data refresh entry must be retained");
    assert.match(JSON.stringify(dataRefreshEntry), /不同武器时继续显示为多张变体卡片/u);
    assert.match(JSON.stringify(dataRefreshEntry), /机械配置完全一致的涂装会合并/u);
    assert.match(JSON.stringify(dataRefreshEntry), /M919 25 毫米穿甲弹/u);
    assert.match(JSON.stringify(dataRefreshEntry), /距离条会直接禁用并说明原因/u);
    const previousEntry = document.entries.find(
      ({ id }) => id === "2026-08-13-hit-analysis-polish",
    );
    assert.ok(previousEntry, "previous release entry must be retained");
    assert.match(
      JSON.stringify(previousEntry),
      /861 份载具外观与 5,924 个部件落点[：:]核显\/低配兼容模式将贴图解码像素从 40\.09 亿降至 10\.02 亿，减少 75\.00%/u,
    );
    assert.match(
      JSON.stringify(previousEntry),
      /Intel UHD 770 的公开实测[\s\S]*?2\.27–2\.86 秒[\s\S]*?12\.4–12\.5 毫秒[\s\S]*?0 次 WebGL 上下文丢失与请求失败/u,
    );
  }
});

test("both editions use the shared hot-update supporters document with safe optional links", () => {
  assert.equal(SUPPORTERS_DOCUMENT_URL, "/supporters.json");
  assert.deepEqual(
    parseSupportersDocument({
      version: 1,
      updatedAt: "2026-07-24T00:00:00.000Z",
      entries: [
        {
          id: "friend",
          name: "@友链",
          nameSegments: [
            { text: "@友", color: "#ffffff" },
            { text: "链", color: "#e1c89b" },
          ],
          kind: "friend",
          url: "https://example.com/profile",
        },
      ],
    })?.entries[0],
    {
      id: "friend",
      name: "@友链",
      nameSegments: [
        { text: "@友", color: "#ffffff" },
        { text: "链", color: "#e1c89b" },
      ],
      kind: "friend",
      url: "https://example.com/profile",
    },
  );
  assert.equal(
    parseSupportersDocument({
      version: 1,
      updatedAt: "2026-07-24T00:00:00.000Z",
      entries: [
        {
          id: "unsafe",
          name: "不安全链接",
          kind: "friend",
          url: "javascript:alert(1)",
        },
      ],
    }),
    null,
  );
  assert.equal(
    parseSupportersDocument({
      version: 1,
      updatedAt: "2026-07-24T00:00:00.000Z",
      entries: [
        {
          id: "mismatched-segments",
          name: "完整名称",
          nameSegments: [
            { text: "不完整", color: "#ffffff" },
          ],
          kind: "sponsor",
        },
      ],
    }),
    null,
  );
});

test("international catalog URLs stay under the /squad REST path", () => {
  const state = {
    groupId: "pla",
    query: "",
    selectedId: "sample-card",
    viewer: { view: "armor" },
  };
  assert.equal(
    buildCatalogUrl(state, SAMPLE_INDEX, { basePath: "/squad" }),
    "/squad/vehicles/sample-tank",
  );
  assert.equal(
    parseCatalogLocation(
      "https://sigua.example/squad/vehicles/sample-tank",
      SAMPLE_INDEX,
      { basePath: "/squad" },
    ).selectedId,
    "sample-card",
  );
});

test("weapon distance stays session-local and refreshes to zero", () => {
  const url = buildCatalogUrl(
    {
      groupId: "pla",
      query: "",
      selectedId: "sample-card",
      viewer: { view: "armor", distance: 3900 },
    },
    SAMPLE_INDEX,
    { basePath: "/squad" },
  );
  assert.equal(url, "/squad/vehicles/sample-tank");
  assert.equal(
    parseCatalogLocation(`https://sigua.example${url}`, SAMPLE_INDEX, {
      basePath: "/squad",
    }).viewer.distance,
    0,
  );
  assert.equal(
    parseCatalogLocation(
      "https://sigua.example/squad/vehicles/sample-tank?d=9999",
      SAMPLE_INDEX,
      { basePath: "/squad" },
    ).viewer.distance,
    0,
  );
});

test("attacker links use stable vehicle slugs and retain legacy numeric links", () => {
  const url = buildCatalogUrl(
    {
      groupId: "pla",
      query: "",
      selectedId: "sample-card",
      viewer: { view: "armor", attacker: "caf-lav6" },
    },
    SAMPLE_INDEX,
    { basePath: "/squad" },
  );
  assert.equal(url, "/squad/vehicles/sample-tank?a=caf-lav6");
  assert.equal(
    parseCatalogLocation(`https://sigua.example${url}`, SAMPLE_INDEX, {
      basePath: "/squad",
    }).viewer.attacker,
    "caf-lav6",
  );

  const reorderedIndex = {
    ...SAMPLE_INDEX,
    records: [...SAMPLE_INDEX.records].reverse(),
  };
  assert.equal(
    parseCatalogLocation(`https://sigua.example${url}`, reorderedIndex, {
      basePath: "/squad",
    }).viewer.attacker,
    "caf-lav6",
  );
  assert.equal(
    parseCatalogLocation(
      "https://sigua.example/squad/vehicles/sample-tank?a=0",
      SAMPLE_INDEX,
      { basePath: "/squad" },
    ).viewer.attacker,
    "sample",
  );
  assert.equal(
    buildCatalogUrl(
      {
        groupId: "pla",
        query: "",
        selectedId: "sample-card",
        viewer: { view: "armor", attacker: "sample" },
      },
      SAMPLE_INDEX,
      { basePath: "/squad" },
    ),
    "/squad/vehicles/sample-tank?attacker=sample",
  );
});

test("product card mappings yield unique stable attack-source slugs", async () => {
  const catalogIndex = JSON.parse(
    await readFile(
      path.join(ROOT, "generated", "catalog-index.json"),
      "utf8",
    ),
  );
  const sources = catalogIndex.records
    .filter(({ selectedRawName }) => selectedRawName)
    .map((record) => ({
      groupId: record.official.groupId,
      canonicalRawName: record.selectedRawName,
      cardIds: record.variants.map(({ cardId }) => cardId),
    }));
  const slugs = sources.map(buildRuntimeAttackSourceShareSlug);
  assert.ok(slugs.length > 0);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(
    slugs.every(
      (shareSlug) =>
        normalizeRuntimeAttackSourceShareSlug(shareSlug) === shareSlug,
    ),
  );
  const lav6Source = sources.find(
    ({ cardIds }) =>
      cardIds.some((cardId) =>
        cardId.startsWith("caf--lav-6--ifv--"),
      ),
  );
  assert.ok(lav6Source);
  assert.equal(buildRuntimeAttackSourceShareSlug(lav6Source), "caf-lav6");
});

test("protection-map state stays independent from armor, interior, and exterior modes", () => {
  const baseState = {
    groupId: "pla",
    query: "",
    selectedId: "sample-card",
  };
  const interiorUrl = buildCatalogUrl(
    {
      ...baseState,
      viewer: { view: "interior", protection: true },
    },
    SAMPLE_INDEX,
    { basePath: "/squad" },
  );
  assert.equal(interiorUrl, "/squad/vehicles/sample-tank?v=i&g=1");
  assert.deepEqual(
    parseCatalogLocation(`https://sigua.example${interiorUrl}`, SAMPLE_INDEX, {
      basePath: "/squad",
    }).viewer,
    {
      view: "interior",
      protection: true,
      attacker: "",
      weapon: "",
      weaponIndex: null,
      distance: 0,
      yaw: null,
      pitch: null,
      camera: "",
      shots: "",
      turrets: "",
    },
  );

  const legacyProtection = parseCatalogLocation(
    "https://sigua.example/squad/vehicles/sample-tank?v=p",
    SAMPLE_INDEX,
    { basePath: "/squad" },
  ).viewer;
  assert.equal(legacyProtection.view, "armor");
  assert.equal(legacyProtection.protection, true);
});

test("catalog links preserve the active turret and every relative station pose", () => {
  const turrets = encodeViewerTurretState({
    activeStationIndex: 1,
    poses: [
      { stationIndex: 0, yawDegrees: 80, pitchDegrees: 4.5 },
      { stationIndex: 1, yawDegrees: -25, pitchDegrees: 12 },
    ],
  });
  const url = buildCatalogUrl(
    {
      groupId: "pla",
      query: "",
      selectedId: "sample-card",
      viewer: { view: "armor", turrets },
    },
    SAMPLE_INDEX,
    { basePath: "/squad" },
  );
  assert.equal(
    url,
    `/squad/vehicles/sample-tank?t=${turrets}`,
  );
  assert.equal(
    parseCatalogLocation(`https://sigua.example${url}`, SAMPLE_INDEX, {
      basePath: "/squad",
    }).viewer.turrets,
    turrets,
  );
});

test("catalog links use one compact camera token and retain legacy angle compatibility", () => {
  const camera = encodeViewerCameraState({
    yaw: 42.25,
    pitch: 8.5,
    distance: 18.75,
    target: [0.5, -0.25, 1.75],
  });
  const url = buildCatalogUrl(
    {
      groupId: "pla",
      query: "",
      selectedId: "sample-card",
      viewer: {
        view: "exterior",
        camera,
        yaw: 12,
        pitch: 4,
      },
    },
    SAMPLE_INDEX,
    { basePath: "/squad" },
  );
  assert.equal(url, `/squad/vehicles/sample-tank?v=e&c=${camera}`);
  assert.deepEqual(
    parseCatalogLocation(`https://sigua.example${url}`, SAMPLE_INDEX, {
      basePath: "/squad",
    }).viewer,
    {
      view: "exterior",
      protection: false,
      attacker: "",
      weapon: "",
      weaponIndex: null,
      distance: 0,
      yaw: null,
      pitch: null,
      camera,
      shots: "",
      turrets: "",
    },
  );

  const legacy = parseCatalogLocation(
    "https://sigua.example/squad/vehicles/sample-tank?y=12.5&p=-4",
    SAMPLE_INDEX,
    { basePath: "/squad" },
  ).viewer;
  assert.equal(legacy.camera, "");
  assert.equal(legacy.yaw, 12.5);
  assert.equal(legacy.pitch, -4);
});

test("international homepage help stays fixed until a vehicle docks it", async () => {
  const [catalogApp, globals] = await Promise.all([
    readFile(path.join(ROOT, "app", "CatalogApp.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "globals.css"), "utf8"),
  ]);

  assert.match(catalogApp, /docked=\{selectedCard !== null\}/u);
  assert.match(
    globals,
    /\.site-footer__help \{[\s\S]*?position: fixed;/u,
  );
  assert.match(
    globals,
    /\.site-footer__help\[data-docked="true"\] \{[\s\S]*?position: absolute;/u,
  );
  assert.doesNotMatch(
    globals,
    /\.site-shell\[data-site-edition="international"\]:has\(> \.faction-selector\) \.site-footer__help \{[\s\S]*?position: absolute;/u,
  );
});

test("site editions keep independent titles while sharing the optional DAU display", async () => {
  const [
    layout,
    chinaPage,
    catalogApp,
    supportersDocument,
    updatesDocument,
    beacon,
    header,
  ] = await Promise.all([
    readFile(path.join(ROOT, "app", "layout.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "china", "page.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "CatalogApp.tsx"), "utf8"),
    readFile(path.join(ROOT, "lib", "supporters-document.mjs"), "utf8"),
    readFile(path.join(ROOT, "lib", "updates-document.mjs"), "utf8"),
    readFile(path.join(ROOT, "app", "DailyActiveBeacon.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "InternationalHeader.tsx"), "utf8"),
  ]);

  assert.match(layout, /<DailyActiveProvider>\{children\}<\/DailyActiveProvider>/u);
  assert.match(layout, /丝瓜：铁皮大饭堂/u);
  assert.doesNotMatch(layout, /藤瓜：铁皮大饭堂/u);
  assert.match(chinaPage, /absolute:\s*"藤瓜：铁皮大饭堂"/u);
  assert.match(catalogApp, /丝瓜地：铁皮饭堂/u);
  assert.doesNotMatch(catalogApp, /藤瓜：铁皮饭堂/u);
  assert.match(catalogApp, /Offworld Industries/u);
  assert.doesNotMatch(catalogApp, /《Squad》/u);
  assert.match(catalogApp, /非 Offworld Industries 或 Squad 官方站点/u);
  assert.match(catalogApp, /点击查看本站开源与隐私合规说明/u);
  assert.match(catalogApp, /className="site-footer__privacy-compliance"/u);
  assert.match(catalogApp, /href="https:\/\/space\.bilibili\.com\/636117"/u);
  assert.match(catalogApp, /AES-GCM/u);
  assert.match(catalogApp, /不超过 30 天/u);
  assert.match(catalogApp, /href="https:\/\/squad-armor\.com\/"/u);
  assert.match(
    catalogApp,
    /href="https:\/\/cloud\.tencent\.com\/document\/product\/1552\/118985"/u,
  );
  assert.match(
    catalogApp,
    /href="https:\/\/store\.epicgames\.com\/p\/squad\?lang=en-US"/u,
  );
  assert.match(catalogApp, /href="https:\/\/react\.dev\/"/u);
  assert.match(catalogApp, /href="https:\/\/threejs\.org\/"/u);
  assert.match(catalogApp, /引用的国服官网图片、文字及标识等素材权利归腾讯及相应权利人所有/u);
  assert.match(catalogApp, /具体信息以国服官网、官方公告及游戏内实装为准/u);
  assert.match(catalogApp, /引用的游戏资产、图片、文字及标识等素材权利归 Offworld Industries 及相应权利人所有/u);
  assert.match(catalogApp, /具体信息以游戏官网、官方公告及游戏内实装为准/u);
  assert.match(catalogApp, /href="https:\/\/sigua\.qq\.com\/"/u);
  assert.match(
    catalogApp,
    /href="https:\/\/www\.tencent\.com\/legal\/html\/zh-cn\/property\.html"/u,
  );
  assert.match(
    catalogApp,
    /wikiAssetUrl\("\/assets\/brand\/siguad-wiki-logo\.svg"\)/u,
  );
  assert.doesNotMatch(catalogApp, /siguad-wiki-logo-69092cecbd4b\.svg/u);
  assert.match(catalogApp, /site-footer__font-line/u);
  assert.match(catalogApp, /site-footer__sponsor-button--primary/u);
  assert.match(supportersDocument, /SUPPORTERS_DOCUMENT_URL = "\/supporters\.json"/u);
  assert.match(updatesDocument, /UPDATES_DOCUMENT_URL = "\/squad\/updates\.json"/u);
  assert.match(beacon, /fetch\("\/__analytics\/dau"/u);
  assert.match(beacon, /alreadyRecorded \? "GET" : "POST"/u);
  assert.match(beacon, /credentials: "omit"/u);
  assert.match(beacon, /mode: "same-origin"/u);
  assert.match(beacon, /sigua-public-dau\/v1/u);
  assert.match(beacon, /sigua-dau-snapshot:/u);
  assert.match(beacon, /今日活跃/u);
  assert.match(catalogApp, /<DailyActiveDisplay variant="hero" \/>/u);
  assert.match(catalogApp, /<DailyActiveDisplay variant="dock" \/>/u);
  assert.match(catalogApp, /<DailyActiveDisplay variant="dock-mobile" \/>/u);
  assert.match(header, /<DailyActiveDisplay variant="nav" \/>/u);
  assert.match(header, /href=\{SIGUA_WIKI_ORIGIN\}/u);
  assert.doesNotMatch(header, /\/wiki\//u);
});
