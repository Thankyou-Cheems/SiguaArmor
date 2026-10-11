import assert from "node:assert/strict";
import React, { act, useCallback, useLayoutEffect, useRef } from "react";
import { JSDOM } from "jsdom";
import { ViewerErrorBoundary } from "../../app/ViewerErrorBoundary";
import { SiteLanguageProvider } from "../../app/SiteLanguageProvider";

const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: "https://armor.test" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
localStorage.setItem("sigua.ui-language", "zh-CN");
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"), { onCaughtError() {}, onUncaughtError(error) { throw error; } });
const state = { left: true, right: true, afterMount: null };
function Scene({ name, sceneRef }) {
  useLayoutEffect(() => { state.afterMount?.(name); }, [name]);
  if (state[name]) throw new Error(`${name} scene failure`);
  return <div tabIndex={-1} data-scene={name} ref={sceneRef}>{name} scene</div>;
}
function Consumer({ name }) {
  const sceneRef = useRef(null);
  const getRetryFocusTarget = useCallback(() => sceneRef.current, []);
  return <section data-consumer={name}><ViewerErrorBoundary getRetryFocusTarget={getRetryFocusTarget}>
    <Scene name={name} sceneRef={sceneRef} />
  </ViewerErrorBoundary></section>;
}
function App() {
  return <SiteLanguageProvider><button data-outside>Catalog</button><Consumer name="left" /><Consumer name="right" /></SiteLanguageProvider>;
}
async function mount() {
  await act(async () => { root.render(null); });
  state.left = true; state.right = true; state.afterMount = null;
  await act(async () => { root.render(<App />); });
}
const consumer = name => document.querySelector(`[data-consumer="${name}"]`);
const scene = name => consumer(name).querySelector("[data-scene]");
async function retry(name) {
  const button = consumer(name).querySelector("button");
  button.focus();
  await act(async () => { button.click(); });
}

await mount();
await retry("left");
assert.equal(document.activeElement, consumer("left").querySelector("button"), "render-time retry failure preserves its visible button");
state.left = false;
await retry("left");
assert.equal(document.activeElement, scene("left"), "successful retry uses this consumer's root");
assert.equal(scene("left").parentElement, consumer("left"), "boundary adds no direct-child wrapper DOM");

// A layout effect can move focus before the boundary's retry commit callback.
// Also blur again: body focus is not proof that the original intent survived.
for (const blurAgain of [false, true]) {
  await mount();
  state.left = false;
  const outside = document.querySelector("[data-outside]");
  state.afterMount = () => { outside.focus(); if (blurAgain) outside.blur(); };
  await retry("left");
  assert.equal(document.activeElement, blurAgain ? document.body : outside, "intervening focus cancels restoration even after blur");
}

// Reference overlays can make a root inert between a retry and its commit.
for (const attribute of ["inert", "hidden", "aria-hidden", "display", "visibility"]) {
  await mount();
  state.left = false;
  state.afterMount = () => {
    if (attribute === "display") consumer("left").style.display = "none";
    else if (attribute === "visibility") consumer("left").style.visibility = "hidden";
    else consumer("left").setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
  };
  await retry("left");
  assert.notEqual(document.activeElement, scene("left"), `${attribute} viewer does not receive focus`);
}

await mount();
state.right = false;
await retry("right");
const rightRoot = scene("right");
state.left = false;
state.afterMount = name => { if (name === "left") rightRoot.focus(); };
await retry("left");
assert.equal(document.activeElement, rightRoot, "a left retry cannot reclaim focus moved to the right consumer");
state.afterMount = null;
state.left = true;
await act(async () => { root.render(<App />); });
assert.equal(document.activeElement, rightRoot, "a later automatic failure preserves another consumer's focus");
await act(async () => { root.unmount(); });
dom.window.close();
console.log(JSON.stringify({ result: "passed", checks: ["failed and successful local retry focus", "no added wrapper DOM", "intervening focus and blur", "hidden and inert overlay guards", "independent consumers"] }));
