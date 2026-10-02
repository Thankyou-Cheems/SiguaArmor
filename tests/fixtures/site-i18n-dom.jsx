import assert from "node:assert/strict";
import React, { act, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { SiteLanguageProvider, useSiteTranslation } from "../../app/SiteLanguageProvider";
import { SiteLanguageSwitcher } from "../../app/SiteLanguageSwitcher";

let sceneMounts = 0;
let sceneUnmounts = 0;
function Probe() {
  const { t } = useSiteTranslation("catalog");
  const [count, setCount] = useState(41);
  useEffect(() => { sceneMounts++; return () => { sceneUnmounts++; }; }, []);
  return <section><h1>{t("chooseFaction")}</h1><SiteLanguageSwitcher /><input aria-label="search" defaultValue="BTR" /><button onClick={() => setCount(count + 1)}>{count}</button><canvas id="scene" /></section>;
}
function App() { return <SiteLanguageProvider><Probe /></SiteLanguageProvider>; }
const markup = renderToString(<App />);
assert.ok(markup.includes("选择你的阵营"));
const dom = new JSDOM(`<html lang="zh-CN"><body><div id="root">${markup}</div></body></html>`, { url: "https://armor.test/squad/?faction=rgf&vehicle=stable-id" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
localStorage.setItem("sigua.ui-language", "zh-Hant");
const errors = [];
let root;
await act(async () => {
  root = hydrateRoot(document.getElementById("root"), <App />, { onRecoverableError: (error) => errors.push(error) });
  await new Promise((resolve) => setTimeout(resolve, 40));
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
await settle();
assert.equal(document.querySelector("h1").textContent, "選擇你的陣營");
assert.equal(document.documentElement.lang, "zh-Hant");
assert.equal(errors.length, 0, "no hydration errors");
const canvas = document.querySelector("canvas");
const input = document.querySelector("input");
const originalUrl = window.location.href;
await act(async () => { document.querySelector("button").click(); });
async function change(locale) {
  await act(async () => {
    const select = document.querySelector("select");
    select.value = locale;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}
await change("en");
assert.equal(document.querySelector("h1").textContent, "Choose your faction");
assert.equal(document.documentElement.lang, "en");
assert.equal(localStorage.getItem("sigua.ui-language"), "en");
assert.equal(document.querySelector("canvas"), canvas);
assert.equal(document.querySelector("input"), input);
assert.equal(input.value, "BTR");
assert.equal(document.querySelector("button").textContent, "42");
assert.equal(window.location.href, originalUrl);
assert.equal(sceneMounts, 1);
assert.equal(sceneUnmounts, 0);
await change("zh-CN");
assert.equal(document.querySelector("h1").textContent, "选择你的阵营");
assert.equal(sceneMounts, 1);
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("storage denied"); } });
await change("en");
assert.equal(document.documentElement.lang, "en");
assert.equal(document.querySelector("h1").textContent, "Choose your faction");
assert.equal(errors.length, 0);
await act(async () => { root.unmount(); });
dom.window.close();
console.log(JSON.stringify({ result: "passed", checks: ["SSR Chinese", "hydration with saved Traditional Chinese", "English switch", "locale lang attribute", "persistence", "search node/value preserved", "numeric state preserved", "URL preserved", "scene node/mount preserved", "storage denied fallback"], recoverableHydrationErrors: errors.length, sceneMounts }));
