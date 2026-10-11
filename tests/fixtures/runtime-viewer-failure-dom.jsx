import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { RuntimeVehicleViewer } from "../../app/RuntimeVehicleViewer";
import { SiteLanguageProvider } from "../../app/SiteLanguageProvider";
import { ViewerErrorBoundary, createViewerCleanup } from "../../app/ViewerErrorBoundary";

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
  fetch: () => new Promise(() => {}),
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const context = new Proxy({ canvas: document.createElement("canvas"), measureText: () => ({ width: 1 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, {
  get: (target, key) => target[key] ?? (() => {}),
});
HTMLCanvasElement.prototype.getContext = () => context;

const probe = globalThis.__viewerFailureProbe = {
  failure: "constructor", attempts: 0, disposals: 0, animationStops: 0,
  renderListDisposals: 0, contextLosses: 0, renders: 0, observerDisposals: 0, canvases: [],
};
const preview = {
  cardId: "test-vehicle", variantRawName: "Test vehicle", status: "visual-ready",
  generatedClass: null, visualVehicleId: "test-vehicle", chassisPose: null,
  suspension: { records: [], coverage: null },
  visual: { artifactRef: "test", placements: [], requiredOccurrences: 0, sourceAssets: 0 },
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
    <nav data-catalog><button onClick={() => setOpen(true)}>打开载具</button><button onClick={() => setOpen(false)}>关闭详情</button></nav>
    <input aria-label="目录搜索" defaultValue="保留的搜索" />
    <section data-reference hidden={!referenceOpen}>保留的载具资料</section>
    {open ? <RuntimeVehicleViewer preview={preview} showChrome={false}
      allowGlobalAttackSources={false} onExteriorStreamingChange={setStreaming} onClose={() => setOpen(false)}
      onOpenReference={() => setReferenceOpen(true)} /> : null}
  </main>;
}
const caughtErrors = [];
const root = createRoot(document.getElementById("root"), {
  onCaughtError: (error) => caughtErrors.push(error.message),
  onUncaughtError: (error) => { throw error; },
});
const click = async (label) => {
  const button = [...document.querySelectorAll("button")].find((button) => button.textContent === label);
  assert.ok(button, `button exists: ${label}`);
  await act(async () => button.click());
};
const unavailable = () => document.querySelector('[data-viewer-state="unavailable"]');
await act(async () => { root.render(<SiteLanguageProvider><App /></SiteLanguageProvider>); });
assert.ok(unavailable(), "constructor failure is confined to the viewer");
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
const beforeLoss = { renders: probe.renders, disposals: probe.disposals };
const lost = new Event("webglcontextlost", { cancelable: true });
await act(async () => { activeCanvas.dispatchEvent(lost); });
assert.ok(lost.defaultPrevented);
assert.ok(unavailable(), "context loss is contained in the same local fallback");
assert.equal(activeCanvas.isConnected, false);
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

// The catalog-level boundary also contains failed lazy module imports.
const RejectedViewer = React.lazy(() => Promise.reject(new Error("Test viewer chunk unavailable")));
await act(async () => {
  root.render(<main><nav data-catalog>目录</nav><ViewerErrorBoundary onClose={() => {}}>
    <React.Suspense fallback="loading"><RejectedViewer /></React.Suspense>
  </ViewerErrorBoundary></main>);
});
assert.ok(unavailable());
assert.ok(document.querySelector("[data-catalog]"));
assert.ok(caughtErrors.includes("Test viewer chunk unavailable"));
await act(async () => { root.unmount(); });
dom.window.close();
console.log(JSON.stringify({ result: "passed", attempts: probe.attempts,
  checks: ["constructor failure isolation", "no automatic retry", "repeated explicit retry", "reference and exit survive", "partial setup cleanup", "discard failed shared lease", "successful retry", "context loss and recovery", "idempotent cleanup", "lazy import failure isolation"] }));
