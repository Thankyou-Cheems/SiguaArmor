import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { RuntimeVehicleViewer } from "../../app/RuntimeVehicleViewer";
import { SiteLanguageProvider } from "../../app/SiteLanguageProvider";
import { SiteLanguageSwitcher } from "../../app/SiteLanguageSwitcher";
import { ViewerErrorBoundary, createViewerCleanup } from "../../app/ViewerErrorBoundary";

let resourceRequests = 0;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "https://armor.test/squad/?faction=test&vehicle=test-vehicle",
  pretendToBeVisual: true,
});
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLCanvasElement: dom.window.HTMLCanvasElement, Event: dom.window.Event,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  Path2D: class {},
  ResizeObserver: class { observe() {} disconnect() { probe.observerDisposals++; } },
  fetch: () => { resourceRequests++; return new Promise(() => {}); },
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
localStorage.setItem("sigua.ui-language", "zh-CN");
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const context = new Proxy({ canvas: document.createElement("canvas"), measureText: () => ({ width: 1 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, {
  get: (target, key) => target[key] ?? (() => {}),
});
HTMLCanvasElement.prototype.getContext = () => context;

const probe = globalThis.__viewerFailureProbe = {
  failure: "constructor", attempts: 0, disposals: 0, animationStops: 0,
  disposedCanvases: new Set(), renderListDisposals: 0, contextLosses: 0, renders: 0, observerDisposals: 0, canvases: [],
};
const preview = {
  cardId: "test-vehicle", variantRawName: "Test vehicle", status: "visual-ready",
  generatedClass: null, visualVehicleId: "test-vehicle", chassisPose: null,
  suspension: { records: [], coverage: null },
  // Controlled pending geometry keeps renderer failure tests inside a valid
  // visual selection; an empty selection intentionally acquires no renderer.
  visual: { artifactRef: "test", placements: [{
    actor: "controlled", name: "pending", stableOccurrenceId: "controlled-pending",
    assetUrl: "/controlled-pending.gltf", sourceMeshPath: "/controlled/pending",
    matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  }], requiredOccurrences: 1, sourceAssets: 1 },
  hit: null, radialQuery: null, visualAttachment: null, crewSeat: null,
  stationGraph: null, gunnerSight: null, driverView: null,
};
let catalogMounts = 0;
function App() {
  const [open, setOpen] = useState(true);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [streaming, setStreaming] = useState(null);
  React.useEffect(() => { catalogMounts++; }, []);
  return <main data-streaming={streaming ? "loading" : "idle"}>
    <SiteLanguageSwitcher />
    <nav data-catalog><button onClick={() => setOpen(true)}>打开载具</button><button onClick={() => setOpen(false)}>关闭详情</button></nav>
    <input aria-label="目录搜索" defaultValue="保留的搜索" />
    <section data-reference hidden={!referenceOpen}>保留的载具资料</section>
    {open ? <RuntimeVehicleViewer preview={preview} showChrome={false}
      allowGlobalAttackSources={false} onExteriorStreamingChange={setStreaming} onClose={() => setOpen(false)}
      onOpenReference={() => setReferenceOpen(true)} /> : null}
  </main>;
}
const { createRoot } = await import("react-dom/client");
const caughtErrors = [];
const root = createRoot(document.getElementById("root"), {
  onCaughtError: (error) => caughtErrors.push(error.message),
  onUncaughtError: (error) => { throw error; },
});
const click = async (label) => {
  const button = [...document.querySelectorAll("button")].find((button) => button.textContent === label);
  assert.ok(button, `button exists: ${label}`);
  await act(async () => { button.focus(); button.click(); });
};
async function changeLanguage(locale) {
  await act(async () => {
    const select = document.querySelector("select");
    select.value = locale;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
const unavailable = () => document.querySelector('[data-viewer-state="unavailable"]');
await act(async () => { root.render(<SiteLanguageProvider><App /></SiteLanguageProvider>); });
assert.ok(unavailable(), "constructor failure is confined to the viewer");
assert.equal(unavailable().dataset.viewerRetry, "remount", "renderer failure keeps a local rebuild path");
assert.ok(caughtErrors.includes("Test WebGL initialization failure"), caughtErrors.join("\n"));
assert.equal(probe.attempts, 1);
assert.equal(document.querySelector("main").dataset.streaming, "idle", "failed viewer stops the parent loading indicator");
const catalog = document.querySelector("[data-catalog]");
const search = document.querySelector("input");
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
assert.equal(probe.attempts, 1, "no automatic retry loop");
await click("重试 3D 预览");
assert.equal(probe.attempts, 2, "each retry makes exactly one new attempt");
assert.ok(unavailable());
assert.equal(document.activeElement, unavailable().querySelector("button"), "failed explicit retry keeps focus on its recovery control");
const failureRoot = unavailable();
const retryButton = failureRoot.querySelector("button");
const rawDiagnostic = failureRoot.querySelector("details span").textContent;
const beforeLanguageFailure = { attempts: probe.attempts, requests: resourceRequests };
for (const [locale, title, retry, reference, back, details] of [
  ["en", "3D preview is temporarily unavailable", "Retry 3D preview", "View vehicle reference", "Back to catalog", "Error details"],
  ["zh-Hant", "3D 預覽暫時無法使用", "重試 3D 預覽", "查看載具資料", "返回目錄", "錯誤資訊"],
  ["zh-CN", "3D 预览暂时不可用", "重试 3D 预览", "查看载具资料", "返回目录", "错误信息"],
]) {
  await changeLanguage(locale);
  assert.equal(unavailable(), failureRoot, "locale changes preserve the failed boundary DOM");
  assert.equal(failureRoot.querySelector("button"), retryButton);
  assert.ok(failureRoot.querySelector('[role="alert"]').textContent.endsWith(title));
  assert.deepEqual([...failureRoot.querySelectorAll("button")].map(button => button.textContent), [retry, reference, back]);
  assert.equal(failureRoot.querySelector("summary").textContent, details);
  assert.equal(failureRoot.querySelector("details span").textContent, rawDiagnostic, "raw diagnostics remain inspectable");
  assert.equal(failureRoot.querySelector('[role="alert"]').querySelector("button, details"), null, "assertive announcement excludes controls and raw diagnostics");
}
assert.deepEqual({ attempts: probe.attempts, requests: resourceRequests }, beforeLanguageFailure, "language changes never retry or refetch a failed renderer");
const alertMutations = [];
const alertObserver = new dom.window.MutationObserver(records => alertMutations.push(...records));
alertObserver.observe(failureRoot.querySelector('[role="alert"]'), { childList: true, characterData: true, subtree: true });
await act(async () => { root.render(<SiteLanguageProvider><App /></SiteLanguageProvider>); });
assert.equal(alertMutations.length, 0, "an unrelated render does not mutate the live announcement");
alertObserver.disconnect();
assert.equal(document.querySelector("[data-catalog]"), catalog);
assert.equal(document.querySelector("input"), search);
assert.equal(search.value, "保留的搜索");
await click("查看载具资料");
assert.equal(document.querySelector("[data-reference]").hidden, false);
await click("返回目录");
assert.ok(!unavailable());
assert.equal(document.querySelector("[data-catalog]"), catalog);

probe.failure = "configuration";
await click("打开载具");
assert.ok(unavailable());
assert.ok(caughtErrors.includes("Test renderer configuration failure"), caughtErrors.join("\n"));
assert.equal(probe.disposals, 1, "partially configured renderer is disposed");
assert.equal(probe.contextLosses, 1, "failed shared renderer is discarded");
assert.equal(document.querySelectorAll("canvas").length, 0);
await click("重试 3D 预览");
assert.equal(probe.disposals, 2);
assert.equal(probe.attempts, 4, "failed shared lease is not reused or stranded");

probe.failure = "initial-resize";
await click("重试 3D 预览");
assert.ok(unavailable(), "a later initialization failure is also isolated");
assert.ok(caughtErrors.includes("Test initial resize failure"));
assert.equal(probe.disposals, 3);
assert.equal(probe.observerDisposals, 1, "partially initialized observer is disconnected");
assert.equal(document.querySelectorAll("canvas").length, 0);
probe.failure = null;
await click("重试 3D 预览");
assert.ok(!unavailable(), caughtErrors.join("\n"));
const activeCanvas = probe.canvases.at(-1);
assert.ok(activeCanvas.isConnected, "retry can recover after WebGL becomes available");
assert.equal(probe.attempts, 6);
const recoveredRoot = document.querySelector(".runtime-vehicle-viewer");
assert.equal(document.activeElement, recoveredRoot, "successful explicit retry focuses this viewer's visible root");
assert.equal(recoveredRoot.tabIndex, -1);
const beforeLanguageSuccess = { attempts: probe.attempts, requests: resourceRequests };
for (const locale of ["en", "zh-Hant", "zh-CN"]) {
  await changeLanguage(locale);
  assert.equal(document.querySelector(".runtime-vehicle-viewer"), recoveredRoot);
  assert.equal(document.querySelector(".runtime-vehicle-viewer__host canvas"), activeCanvas);
}
assert.deepEqual({ attempts: probe.attempts, requests: resourceRequests }, beforeLanguageSuccess, "language changes preserve the live renderer and requests");
// A later automatic failure must not steal focus from the surrounding catalog.
search.focus();
const beforeLoss = { renders: probe.renders, disposals: probe.disposals };
const lost = new Event("webglcontextlost", { cancelable: true });
await act(async () => { activeCanvas.dispatchEvent(lost); });
assert.ok(lost.defaultPrevented);
assert.ok(unavailable(), "context loss is contained in the same local fallback");
assert.equal(activeCanvas.isConnected, false);
assert.equal(document.activeElement, search, "automatic context loss does not move focus from catalog controls");
for (const [locale, detail] of [
  ["en", "The browser lost its WebGL graphics context. Please retry manually."],
  ["zh-Hant", "瀏覽器的 WebGL 圖形環境已遺失，請手動重試。"],
  ["zh-CN", "浏览器的 WebGL 图形上下文已丢失，请手动重试。"],
]) {
  await changeLanguage(locale);
  assert.equal(unavailable().querySelector("details span").textContent, detail, "known context-loss diagnostic uses the active locale");
}
assert.equal(probe.disposals, beforeLoss.disposals + 1);
assert.ok(probe.observerDisposals > 0);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
await act(async () => { activeCanvas.dispatchEvent(new Event("webglcontextrestored")); });
assert.equal(probe.renders, beforeLoss.renders, "lost scene stops rendering");
assert.equal(probe.attempts, 6, "context loss does not trigger an automatic restart");
await click("重试 3D 预览");
assert.ok(!unavailable());
assert.equal(probe.attempts, 7);
const recoveredCanvas = probe.canvases.at(-1);
await click("关闭详情");
assert.equal(recoveredCanvas.isConnected, false);
assert.equal(catalogMounts, 1, "viewer failure/retry never remounts the catalog");

// A cleanup failure must not strand a later resource or execute anything twice.
const cleanup = createViewerCleanup();
const released = [];
cleanup.add(() => released.push("renderer"));
cleanup.add(() => { released.push("faulty"); throw new Error("cleanup probe"); });
cleanup.add(() => released.push("listener"));
const originalError = console.error;
console.error = () => {};
try { cleanup.dispose(); cleanup.dispose(); } finally { console.error = originalError; }
assert.deepEqual(released, ["listener", "faulty", "renderer"]);
cleanup.add(() => released.push("late resource"));
assert.equal(released.at(-1), "late resource", "late acquisition cannot leak after cancellation");

// Concurrent viewers must never release one another's renderer leases.
function DualViewerApp() {
  return <main><section data-left><RuntimeVehicleViewer preview={preview} showChrome={false} allowGlobalAttackSources={false} /></section>
    <section data-right><RuntimeVehicleViewer preview={preview} showChrome={false} allowGlobalAttackSources={false} /></section></main>;
}
await act(async () => { root.render(<SiteLanguageProvider><DualViewerApp /></SiteLanguageProvider>); });
const left = document.querySelector("[data-left]");
const right = document.querySelector("[data-right]");
const leftCanvas = left.querySelector(".runtime-vehicle-viewer__host canvas");
const rightCanvas = right.querySelector(".runtime-vehicle-viewer__host canvas");
assert.ok(leftCanvas && rightCanvas && leftCanvas !== rightCanvas);
assert.equal(leftCanvas.parentElement.dataset.webglRendererLease, "shared");
assert.equal(rightCanvas.parentElement.dataset.webglRendererLease, "isolated");
right.querySelector(".runtime-vehicle-viewer").focus();
await act(async () => { leftCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
assert.ok(left.querySelector('[data-viewer-state="unavailable"]'));
assert.equal(document.activeElement, right.querySelector(".runtime-vehicle-viewer"), "automatic loss never focuses another consumer");
assert.ok(probe.disposedCanvases.has(leftCanvas));
assert.ok(rightCanvas.isConnected && !probe.disposedCanvases.has(rightCanvas), "shared consumer loss leaves isolated renderer alive");
await act(async () => { left.querySelector("button").focus(); left.querySelector("button").click(); });
const nextLeftCanvas = left.querySelector(".runtime-vehicle-viewer__host canvas");
assert.ok(nextLeftCanvas && nextLeftCanvas !== leftCanvas);
assert.equal(document.activeElement, left.querySelector(".runtime-vehicle-viewer"), "left retry focuses only the left root");
await act(async () => { rightCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
assert.ok(probe.disposedCanvases.has(rightCanvas));
assert.ok(nextLeftCanvas.isConnected && !probe.disposedCanvases.has(nextLeftCanvas), "isolated loss leaves the replacement shared renderer alive");
await act(async () => { right.querySelector("button").focus(); right.querySelector("button").click(); });
const nextRightCanvas = right.querySelector(".runtime-vehicle-viewer__host canvas");
assert.ok(nextRightCanvas && nextRightCanvas !== rightCanvas);
assert.equal(document.activeElement, right.querySelector(".runtime-vehicle-viewer"), "right retry focuses only the right root");
assert.equal(nextRightCanvas.parentElement.dataset.webglRendererLease, "isolated");
await act(async () => { root.render(null); });
assert.ok(!nextLeftCanvas.isConnected && !nextRightCanvas.isConnected);
assert.ok(!probe.disposedCanvases.has(nextLeftCanvas), "ordinary close retains the reusable shared renderer");
assert.ok(probe.disposedCanvases.has(nextRightCanvas), "ordinary close disposes only the isolated renderer");

// The outer catalog boundary must not offer a fake remount retry for a cached
// React.lazy rejection. A user can reload the current URL, inspect data or close.
// English common is already active before the viewer chunk fails. Recovery
// must be English on its first render, without requesting a viewer dictionary.
await act(async () => { root.render(<SiteLanguageProvider><SiteLanguageSwitcher /></SiteLanguageProvider>); });
await changeLanguage("en");
let lazyAttempts = 0, referenceClicks = 0, closeClicks = 0;
const RejectedViewer = React.lazy(() => {
  lazyAttempts++;
  return Promise.reject(new Error("Test viewer chunk unavailable"));
});
await act(async () => {
  root.render(<SiteLanguageProvider><main><SiteLanguageSwitcher /><nav data-catalog>目录</nav><ViewerErrorBoundary retryMode="reload"
    onOpenReference={() => { referenceClicks++; }} onClose={() => { closeClicks++; }}>
    <React.Suspense fallback="loading"><RejectedViewer /></React.Suspense>
  </ViewerErrorBoundary></main></SiteLanguageProvider>);
});
assert.ok(unavailable());
assert.equal(unavailable().dataset.viewerRetry, "reload");
assert.equal(unavailable().querySelector('[role="alert"]').textContent, "3D preview is temporarily unavailable", "a late chunk failure immediately uses the already-active common locale");
assert.ok(document.querySelector("[data-catalog]"));
assert.ok(caughtErrors.includes("Test viewer chunk unavailable"));
assert.equal(lazyAttempts, 1);
for (const [locale, label, hint] of [
  ["en", "Reload page to retry", "The 3D component could not start."],
  ["zh-Hant", "重新整理頁面重試", "3D 元件未能啟動。"],
  ["zh-CN", "刷新页面重试", "3D 组件未能启动。"],
]) {
  await changeLanguage(locale);
  assert.equal(unavailable().querySelector("button").textContent, label);
  assert.ok(unavailable().querySelector("span").textContent.startsWith(hint));
  assert.equal(lazyAttempts, 1, "locale changes do not retry a rejected module");
}
assert.ok(![...document.querySelectorAll("button")].some(button => button.textContent === "重试 3D 预览"));
const savedWindow = globalThis.window;
const reloadUrls = [];
// Keep real DOM events and substitute only the browser navigation operation.
globalThis.window = new Proxy(savedWindow, { get(target, key) {
  if (key === "location") return { href: target.location.href, reload: () => reloadUrls.push(target.location.href) };
  return Reflect.get(target, key, target);
} });
try { await click("刷新页面重试"); } finally { globalThis.window = savedWindow; }
assert.deepEqual(reloadUrls, [dom.window.location.href], "reload preserves the current deep link and query");
assert.equal(lazyAttempts, 1, "reload action does not pretend to invalidate React.lazy in place");
await click("查看载具资料");
await click("返回目录");
assert.equal(referenceClicks, 1);
assert.equal(closeClicks, 1);
await act(async () => { root.unmount(); });
dom.window.close();
console.log(JSON.stringify({ result: "passed", attempts: probe.attempts,
  checks: ["constructor failure isolation", "no automatic retry", "repeated explicit retry", "reference and exit survive", "partial setup cleanup", "discard failed shared lease", "successful retry", "context loss and recovery", "idempotent cleanup", "lazy import failure isolation and explicit same-URL reload", "two simultaneous renderer consumers", "three-language recovery and diagnostics", "scoped non-interactive live announcement", "local success/failure focus", "language changes preserve renderer and data requests"] }));
