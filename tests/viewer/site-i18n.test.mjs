import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSiteI18n, normalizeSiteLanguage, resolveSiteLanguage } from "../../lib/site-i18n.ts";

const namespaces = ["common", "catalog", "viewer"];
test("locale normalization is independent from product edition and supports regional aliases", () => {
  for (const locale of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant-HK", "zh_hant"]) assert.equal(normalizeSiteLanguage(locale), "zh-Hant");
  for (const locale of ["zh", "zh-CN", "zh-SG", "zh-Hans-CN"]) assert.equal(normalizeSiteLanguage(locale), "zh-CN");
  assert.equal(normalizeSiteLanguage("en-GB"), "en");
  for (const invalid of ["international", "china", "fr", "../../en", "enough"]) assert.equal(normalizeSiteLanguage(invalid), null);
  assert.equal(resolveSiteLanguage("zh-Hant", ["en-US"]), "zh-Hant");
  assert.equal(resolveSiteLanguage("bad", ["fr", "en-US"]), "en");
  assert.equal(resolveSiteLanguage(null, ["fr"]), "zh-CN");
});
test("all first-batch dictionaries have identical keys and interpolation contracts", async () => {
  for (const namespace of namespaces) {
    const base = (await import(`../../lib/locales/zh-CN/${namespace}.ts`)).default;
    for (const locale of ["en", "zh-Hant"]) {
      const translated = (await import(`../../lib/locales/${locale}/${namespace}.ts`)).default;
      assert.deepEqual(Object.keys(translated).sort(), Object.keys(base).sort());
      for (const [key, value] of Object.entries(base)) {
        assert.ok(translated[key].trim());
        assert.deepEqual(translated[key].match(/{{\w+}}/g)?.sort(), value.match(/{{\w+}}/g)?.sort(), `${locale}/${namespace}/${key}`);
      }
    }
  }
});
test("SSR starts in Chinese without loading any alternate language chunks", () => {
  let loads = 0;
  const controller = createSiteI18n(async () => { loads += 1; return {}; });
  assert.equal(controller.instance.language, "zh-CN");
  assert.equal(controller.instance.t("language"), "界面语言");
  assert.equal(loads, 0);
});
test("a requested namespace is lazy, cached, and falls back to Chinese for missing translations", async () => {
  const calls = [];
  const controller = createSiteI18n(async (language, namespace) => {
    calls.push(`${language}:${namespace}`);
    return namespace === "common" ? { language: "Language" } : {};
  });
  await controller.changeLanguage("en");
  assert.deepEqual(calls, ["en:common"]);
  await Promise.all([controller.namespace("catalog"), controller.namespace("catalog")]);
  assert.deepEqual(calls, ["en:common", "en:catalog"]);
  assert.equal(controller.instance.t("chooseFaction", { ns: "catalog" }), "选择你的阵营");
  await controller.changeLanguage("zh-CN");
  await controller.changeLanguage("en");
  assert.equal(calls.length, 2);
});
test("the most recent language selection wins when chunk loads finish out of order", async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const controller = createSiteI18n(async (language) => {
    if (language === "en") await delayed;
    return { language };
  });
  const older = controller.changeLanguage("en");
  assert.equal(await controller.changeLanguage("zh-Hant"), true);
  release();
  assert.equal(await older, false);
  assert.equal(controller.instance.language, "zh-Hant");
});
test("a namespace mounted during switching is loaded before the new language is committed", async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const loaded = [];
  const controller = createSiteI18n(async (language, namespace) => {
    loaded.push(`${language}:${namespace}`);
    if (namespace === "common") await delayed;
    return {};
  });
  const switching = controller.changeLanguage("en");
  await controller.namespace("viewer");
  release();
  await switching;
  assert.deepEqual(loaded, ["en:common", "en:viewer"]);
});
test("offline chunk failures preserve the active UI and allow retry", async () => {
  let fail = true;
  const controller = createSiteI18n(async () => { if (fail) throw new Error("offline"); return { language: "English" }; });
  await assert.rejects(controller.changeLanguage("en"), /offline/);
  assert.equal(controller.instance.language, "zh-CN");
  fail = false;
  await controller.changeLanguage("en");
  assert.equal(controller.instance.t("language"), "English");
});
test("language changes have no scene, catalog, URL, edition or numerical query dependencies", () => {
  for (const path of ["lib/site-i18n.ts", "app/SiteLanguageProvider.tsx", "app/SiteLanguageSwitcher.tsx"]) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /loadPublicCatalog|loadInitialPublicCatalog|runtimePreview|pushState|replaceState|location\.(href|reload)|THREE|fetch\(/);
  }
  const root = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  assert.match(root, /<SiteLanguageProvider><DailyActiveProvider>\{children\}<\/DailyActiveProvider><\/SiteLanguageProvider>/);
});
test("a superseded failed load cannot report an error over the latest successful choice", async () => {
  let rejectOld;
  const delayed = new Promise((_resolve, reject) => { rejectOld = reject; });
  const controller = createSiteI18n(async (language) => {
    if (language === "en") await delayed;
    return {};
  });
  const old = controller.changeLanguage("en");
  await controller.changeLanguage("zh-Hant");
  rejectOld(new Error("old offline request"));
  assert.equal(await old, false);
  assert.equal(controller.instance.language, "zh-Hant");
});
test("existing namespace consumers do not broadcast redundant UI updates", async () => {
  const controller = createSiteI18n();
  let renders = 0;
  controller.subscribe(() => { renders += 1; });
  await Promise.all([controller.namespace("common"), controller.namespace("catalog"), controller.namespace("catalog")]);
  assert.equal(renders, 0);
});
