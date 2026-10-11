import assert from "node:assert/strict";
import React, { act, StrictMode, useLayoutEffect } from "react";
import { JSDOM } from "jsdom";
import { RuntimeVehicleViewer } from "../../app/RuntimeVehicleViewer";
import { SiteLanguageProvider } from "../../app/SiteLanguageProvider";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "https://armor.test/squad/", pretendToBeVisual: true,
});
const probe = globalThis.__viewerFailureProbe = {
  failure: null, attempts: 0, disposals: 0, animationStops: 0,
  disposedCanvases: new Set(), renderListDisposals: 0, contextLosses: 0,
  renders: 0, observerDisposals: 0, canvases: [],
};
let activeObservers = 0;
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLCanvasElement: dom.window.HTMLCanvasElement, Event: dom.window.Event,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), Path2D: class {},
  ResizeObserver: class {
    constructor() { activeObservers++; this.active = true; }
    observe() {}
    disconnect() { if (this.active) { this.active = false; activeObservers--; probe.observerDisposals++; } }
  },
  // Leave network work pending to exercise teardown before assets have settled.
  fetch: () => new Promise(() => {}),
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
localStorage.setItem("sigua.ui-language", "zh-CN");
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const context = new Proxy({ canvas: document.createElement("canvas"), measureText: () => ({ width: 1 }),
  createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, {
  get: (target, key) => target[key] ?? (() => {}),
});
HTMLCanvasElement.prototype.getContext = () => context;

// Keep native dispatch/removal semantics while counting the real OrbitControls
// callbacks. Do not inspect controls' private fields or replace its implementation.
const keyListeners = [];
const add = document.addEventListener.bind(document);
const remove = document.removeEventListener.bind(document);
const captures = (options) => typeof options === "boolean" ? options : !!options?.capture;
document.addEventListener = (type, callback, options) => {
  if (type !== "keydown" || !captures(options)) return add(type, callback, options);
  let entry = keyListeners.find((entry) => entry.active && entry.callback === callback);
  if (!entry) {
    entry = { callback, calls: 0, active: true };
    entry.listener = (event) => { entry.calls++; callback.call(document, event); };
    keyListeners.push(entry);
  }
  return add(type, entry.listener, options);
};
document.removeEventListener = (type, callback, options) => {
  const entry = type === "keydown" && captures(options)
    ? keyListeners.find((entry) => entry.active && entry.callback === callback) : null;
  if (entry) { entry.active = false; return remove(type, entry.listener, options); }
  return remove(type, callback, options);
};
let unrelatedCalls = 0;
const unrelated = () => { unrelatedCalls++; };
document.addEventListener("keydown", unrelated, true);
const liveControls = () => keyListeners.filter((entry) => entry.active && entry.callback !== unrelated);
function assertListeners(expected, label) {
  assert.equal(liveControls().length, expected, label);
  const counts = keyListeners.map((entry) => entry.calls);
  const beforeUnrelated = unrelatedCalls;
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Control", code: "ControlLeft" }));
  document.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Control", code: "ControlLeft" }));
  for (const [index, entry] of keyListeners.entries()) {
    assert.equal(entry.calls - counts[index], entry.active ? 1 : 0, `${label}: only live callbacks run`);
  }
  assert.equal(unrelatedCalls, beforeUnrelated + 1, `${label}: unrelated document listener survives`);
}

const preview = {
  cardId: "test-vehicle", variantRawName: "Test vehicle", status: "visual-ready",
  generatedClass: null, visualVehicleId: "test-vehicle", chassisPose: null,
  suspension: { records: [], coverage: null },
  visual: { artifactRef: "test", placements: [], requiredOccurrences: 0, sourceAssets: 0 },
  hit: null, radialQuery: null, visualAttachment: null, crewSeat: null,
  stationGraph: null, gunnerSight: null, driverView: null,
};
function Viewer({ model = preview }) {
  return <RuntimeVehicleViewer preview={model} showChrome={false} allowGlobalAttackSources={false} />;
}
const { createRoot } = await import("react-dom/client");
const errors = [];
const root = createRoot(document.getElementById("root"), {
  onCaughtError: (error) => errors.push(error.message), onUncaughtError: (error) => { throw error; },
});
const render = (children, strict = false) => act(async () => {
  const app = <SiteLanguageProvider>{children}</SiteLanguageProvider>;
  root.render(strict ? <StrictMode>{app}</StrictMode> : app);
});
const canvas = (scope = document) => scope.querySelector(".runtime-vehicle-viewer__host canvas");
const unavailable = (scope = document) => scope.querySelector('[data-viewer-state="unavailable"]');
const close = async () => {
  await render(null);
  assertListeners(0, "closed viewer leaves no control listener");
  assert.equal(activeObservers, 0);
  assert.equal(canvas(), null);
};
const layoutSetupChecks = [];
function SetupPhaseProbe() {
  useLayoutEffect(() => {
    layoutSetupChecks.push({ attempts: probe.attempts, canvas: canvas() });
  }, []);
  return null;
}
const beforePassiveSetup = probe.attempts;
await render(<><Viewer /><SetupPhaseProbe /></>);
assert.deepEqual(layoutSetupChecks, [{ attempts: beforePassiveSetup, canvas: null }], "GPU setup stays out of the layout phase");
await close();
const repeatedCloseCounts = [];
for (let cycle = 0; cycle < 5; cycle++) {
  await render(<Viewer />);
  assert.ok(canvas()?.isConnected);
  assertListeners(1, "one viewer owns one root listener");
  const stops = probe.animationStops;
  await close();
  assert.equal(probe.animationStops, stops + 1, "layout and passive cleanup release the lease only once");
  repeatedCloseCounts.push(liveControls().length);
}

const beforeStrictMount = probe.animationStops;
await render(<Viewer />, true);
assert.equal(probe.animationStops, beforeStrictMount + 1, "StrictMode really replays effect setup and teardown");
assertListeners(1, "StrictMode replay keeps only the current controls");
const strictCanvas = canvas();
const beforeRerender = probe.animationStops;
await render(<Viewer />, true);
assert.equal(canvas(), strictCanvas);
assert.equal(probe.animationStops, beforeRerender, "ordinary rerender does not rebuild scene in layout");
await close();

await render(<Viewer />);
const beforeReplacement = liveControls()[0];
const replacementCanvas = canvas();
const replacementRoot = document.querySelector(".runtime-vehicle-viewer");
const beforeReplacementStops = probe.animationStops;
await render(<Viewer model={{ ...preview, visual: { ...preview.visual, artifactRef: "replacement" } }} />);
assert.equal(canvas(), replacementCanvas, "dependency change retains the shared renderer");
assert.equal(document.querySelector(".runtime-vehicle-viewer"), replacementRoot, "dependency change is not a keyed component remount");
assert.equal(beforeReplacement.active, false);
assert.equal(probe.animationStops, beforeReplacementStops + 1);
assertListeners(1, "dependency replacement owns exactly one new controls instance");
await close();
// No visual means the heavy initialization effect does not acquire anything.
await render(<Viewer model={{ ...preview, visual: null }} />);
assertListeners(0, "uninitialized viewer can unmount safely");
await close();

for (const failure of ["configuration", "initial-resize"]) {
  probe.failure = failure;
  await render(<Viewer />);
  assert.ok(unavailable());
  assertListeners(0, "partially initialized failure releases controls");
  const stops = probe.animationStops;
  probe.failure = null;
  await act(async () => { unavailable().querySelector("button").click(); });
  assert.ok(canvas()?.isConnected);
  assert.equal(probe.animationStops, stops, "retry does not clean up the failed instance twice");
  assertListeners(1, "explicit retry installs only its own controls");
  await close();
}

function Pair({ left = true, model = preview }) {
  return <main><section data-left>{left ? <Viewer model={model} /> : null}</section>
    <section data-right><Viewer /></section></main>;
}
await render(<Pair />);
const right = document.querySelector("[data-right]");
const rightCanvas = canvas(right);
assertListeners(2, "two consumers own independent controls");
await render(<Pair left={false} />);
assert.equal(canvas(right), rightCanvas);
assert.ok(!probe.disposedCanvases.has(rightCanvas));
assertListeners(1, "closing one consumer preserves the other listener");
await render(<Pair />);
assert.equal(canvas(right), rightCanvas);
assertListeners(2, "reopening one consumer does not replace its neighbor");
const left = document.querySelector("[data-left]");
const lostCanvas = canvas(left);
const beforeLoss = probe.animationStops;
await act(async () => { lostCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
assert.ok(unavailable(left));
assertListeners(1, "context loss releases only the lost consumer");
assert.equal(probe.animationStops, beforeLoss + 1);
await act(async () => { lostCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
assert.equal(probe.animationStops, beforeLoss + 1, "repeated loss and boundary unmount are idempotent");
await act(async () => { unavailable(left).querySelector("button").click(); });
assertListeners(2, "context-loss retry rebuilds only the affected controls");
assert.equal(canvas(right), rightCanvas);
await close();
assert.ok(errors.some((message) => message.includes("configuration failure")));
assert.ok(errors.some((message) => message.includes("initial resize failure")));
await act(async () => { root.unmount(); });
assertListeners(0, "final React root teardown remains clean");
document.removeEventListener("keydown", unrelated, true);
dom.window.close();
console.log(JSON.stringify({ result: "passed", repeatedCloseCounts,
  checks: ["real OrbitControls callbacks stop after detach", "StrictMode", "passive dependency replacement", "no visual", "partial setup failures and retry", "two consumers", "repeated context loss", "unrelated listener preservation"] }));
