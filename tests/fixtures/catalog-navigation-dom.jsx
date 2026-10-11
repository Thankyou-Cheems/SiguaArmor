import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CatalogApp } from "../../app/CatalogApp";
import { SiteLanguageProvider } from "../../app/SiteLanguageProvider";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const parameters = new URL(import.meta.url).searchParams;
const siteEdition = parameters.get("edition") ?? "international";
const scenario = parameters.get("scenario") ?? "latest";
const ids = siteEdition === "china" ? ["ekeqie", "agesi", "shenzhou"] : ["afu", "baf", "pla"];
const [first, slow, latest] = ids;
const basePath = siteEdition === "china" ? "/sigua" : "/squad";
const groups = ids.map((id, order) => ({ id, order, name: id.toUpperCase(), recordCount: 1 }));
function catalog(loaded = [first, latest]) {
  return { schemaVersion: "1.0.0", catalogId: "navigation-dom", groups,
    records: loaded.map(id => ({
      promoEntryId: `${id}--test`, promotionOrder: ids.indexOf(id),
      official: { groupId: id, groupNameZh: id.toUpperCase(), nameZh: `${id} vehicle`, typeZh: "MBT", typeNameZh: "坦克" },
      selectedRawName: null, selectedDisplayName: `${id} vehicle`, defaultCardId: scenario === "viewer-history" ? `${id}--test--test` : `${id}--test`, routeSlug: `${id}--test`, variants: scenario === "viewer-history" ? [{ sourceRawName: "BP_Test", runtimeVehicleRef: "test-runtime", visualArtifactRef: "test-visual", cardId: `${id}--test--test`, routeSlug: `${id}--test` }] : [],
    })),
  };
}
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: `https://armor.test${basePath}/factions/${first}`, pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement, HTMLImageElement: dom.window.HTMLImageElement,
  Event: dom.window.Event, Image: dom.window.Image, IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class { observe() {} disconnect() {} },
  fetch: async () => { throw new Error("Network is disabled in the catalog regression test"); },
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
document.fonts = { ready: Promise.resolve() };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// React was imported before jsdom; its legacy input-event detection expects
// these methods. Tests call the actual React onChange handler explicitly.
HTMLElement.prototype.attachEvent = function () {};
HTMLElement.prototype.detachEvent = function () {};
HTMLElement.prototype.scrollIntoView = function () {};
HTMLElement.prototype.scrollTo = function () {};
HTMLImageElement.prototype.decode = async function () {};
const errors = [];
const root = createRoot(document.getElementById("root"), { onUncaughtError: e => errors.push(e) });
globalThis.__cleanupArmorCatalogDom = async () => {
  await act(async () => root.unmount());
  dom.window.close();
};
let pendingGroups = new Map();
let locationRequest = null;
let fullRequest = null;
const groupCalls = [];
globalThis.__armorCatalogHarness = {
  initial: (_edition, href) => locationRequest ? locationRequest.promise : Promise.resolve(catalog(new URL(href).pathname.includes(slow) ? [slow] : undefined)),
  group: (_edition, groupId) => {
    groupCalls.push(groupId);
    return pendingGroups.get(groupId)?.promise ?? Promise.resolve(catalog([groupId]));
  },
  full: () => fullRequest?.promise ?? Promise.resolve(catalog(ids)),
};
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function mount() {
  await act(async () => root.render(<SiteLanguageProvider><CatalogApp siteEdition={siteEdition} /></SiteLanguageProvider>));
  await flush();
}
function active() {
  return document.querySelector('.faction-dock__flag[data-active="true"]')?.getAttribute("aria-label");
}
function assertFaction(id) {
  assert.equal(window.location.pathname, `${basePath}/factions/${id}`);
  assert.ok(active()?.endsWith(id.toUpperCase()), `expected active ${id}, got ${active()}`);
  assert.equal(document.querySelector("main.catalog-data-state"), null);
  assert.equal(errors.length, 0, errors.map(String).join("\n"));
}
async function click(id) {
  const button = [...document.querySelectorAll(".faction-dock__flag")].find(b => b.getAttribute("aria-label")?.endsWith(id.toUpperCase()));
  assert.ok(button, `faction ${id} must remain available`);
  await act(async () => button.click());
  await flush();
}
function inputProps() {
  const input = document.querySelector("#dock-vehicle-search");
  assert.ok(input, "search input remains available");
  const key = Object.keys(input).find(name => name.startsWith("__reactProps$"));
  return { input, props: input[key] };
}
async function search(value) {
  await act(async () => {
    const { input, props } = inputProps();
    input.focus();
    props.onChange({ target: { value } });
  });
  await flush();
}
async function pop(pathname) {
  await act(async () => {
    window.history.replaceState(null, "", pathname);
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  await flush();
}
const factionUrl = id => `${basePath}/factions/${id}`;
const vehicleUrl = id => `${basePath}/vehicles/${id}--test`;

if (scenario === "initial-history") {
  const initial = deferred(); locationRequest = initial;
  await mount();
  const next = deferred(); locationRequest = next;
  await pop(vehicleUrl(slow));
  await act(async () => next.resolve(catalog([slow])));
  await flush();
  await act(async () => initial.resolve(catalog([first])));
  await flush();
  assert.equal(window.location.pathname, vehicleUrl(slow));
  assert.ok(active()?.endsWith(slow.toUpperCase()));
  assert.equal(document.querySelector(".site-shell").dataset.detailOpen, "true");
} else if (scenario === "initial-failure") {
  locationRequest = deferred();
  await mount();
  await act(async () => locationRequest.reject(new Error("initial offline")));
  await flush();
  assert.ok(document.querySelector("main.catalog-data-state button"));
  locationRequest = null;
  await pop(factionUrl(latest));
  assertFaction(latest);
} else if (scenario === "viewer-history") {
  window.history.replaceState(null, "", vehicleUrl(first));
  await mount();
  const previousViewer = globalThis.__armorViewerProps;
  assert.ok(previousViewer?.onNavigationStateChange);
  locationRequest = deferred();
  await pop(factionUrl(slow));
  await act(async () => previousViewer.onNavigationStateChange({ ...previousViewer.navigationState, attacker: "normalized-attacker" }));
  assert.equal(window.location.pathname, factionUrl(slow));
  await act(async () => locationRequest.resolve(catalog([slow])));
  await flush();
  assertFaction(slow);
  await act(async () => previousViewer.onNavigationStateChange({ ...previousViewer.navigationState, attacker: "late-normalized-attacker" }));
  assertFaction(slow);
} else if (scenario.startsWith("search-")) {
  await mount();
  const pendingLocation = deferred(); locationRequest = pendingLocation;
  const pendingSearch = deferred(); fullRequest = pendingSearch;
  await pop(factionUrl(slow));
  await search("vehicle");
  if (scenario === "search-full-first") {
    await act(async () => pendingSearch.resolve(catalog(ids)));
    await act(async () => pendingLocation.resolve(catalog([slow])));
  } else {
    await act(async () => pendingLocation.resolve(catalog([slow])));
    await act(async () => scenario === "search-failure"
      ? pendingSearch.reject(new Error("search offline"))
      : pendingSearch.resolve(catalog(ids)));
  }
  locationRequest = null; fullRequest = null;
  await flush();
  assertFaction(slow);
  if (scenario === "search-failure") {
    assert.match(document.querySelector(".global-vehicle-search__empty[role=alert]").textContent, /search offline/);
    await act(async () => document.querySelector(".global-vehicle-search__empty[role=alert] button").click());
    await flush();
    assert.equal(document.querySelector(".global-vehicle-search__empty[role=alert]"), null);
  }
  // Selecting a search result is a route change and publishes matching data.
  await act(async () => inputProps().props.onKeyDown({ key: "Enter", preventDefault() {} }));
  await flush();
  assert.equal(window.location.pathname, vehicleUrl(first));
  assert.ok(active()?.endsWith(first.toUpperCase()));
  assert.equal(document.querySelector(".site-shell").dataset.detailOpen, "true");
  assert.equal(errors.length, 0);
} else if (scenario === "current-failure") {
  await mount();
  let request = deferred(); pendingGroups.set(slow, request);
  await click(slow);
  await act(async () => request.reject(new Error("faction offline")));
  await flush();
  assertFaction(first);
  assert.match(document.querySelector(".catalog-navigation-error").textContent, /faction offline/);
  await pop(factionUrl(latest));
  assertFaction(latest);
  assert.equal(document.querySelector(".catalog-navigation-error"), null);
  request = deferred(); pendingGroups.set(slow, request);
  await click(slow);
  await act(async () => request.reject(new Error("retry faction")));
  await flush();
  pendingGroups.delete(slow);
  await act(async () => document.querySelector(".catalog-navigation-error button").click());
  await flush();
  assertFaction(slow);
} else if (scenario === "history-failure") {
  await mount();
  locationRequest = deferred();
  const length = window.history.length;
  await pop(factionUrl(slow));
  await act(async () => locationRequest.reject(new Error("history offline")));
  await flush();
  assertFaction(first);
  assert.equal(window.history.length, length);
  assert.ok(document.querySelector(".catalog-navigation-error"));
  locationRequest = null;
  await act(async () => document.querySelector(".catalog-navigation-error button").click());
  await flush();
  assertFaction(slow);
  assert.equal(window.history.length, length);
} else {
await mount();
assertFaction(first);

// Older cold success cannot replace a newer warm selection or push stale history.
let old = deferred(); pendingGroups.set(slow, old);
await click(slow);
await click(latest);
assertFaction(latest);
const historyLength = window.history.length;
await act(async () => old.resolve(catalog([slow])));
await flush();
assertFaction(latest);
assert.equal(window.history.length, historyLength);

// Older failure cannot replace the catalog with a whole-page error.
old = deferred(); pendingGroups.set(slow, old);
await click(slow);
await click(first);
await act(async () => old.reject(new Error("old BAF failed")));
await flush();
assertFaction(first);

// Back/Forward intent invalidates a still-pending explicit selection.
old = deferred(); pendingGroups.set(slow, old);
await click(slow);
await act(async () => {
  window.history.replaceState(null, "", `${basePath}/factions/${latest}`);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
});
await flush();
assertFaction(latest);
await act(async () => old.resolve(catalog([slow])));
await flush();
assertFaction(latest);

// A late popstate response cannot roll back a subsequently selected faction.
locationRequest = deferred();
await act(async () => {
  window.history.replaceState(null, "", `${basePath}/factions/${slow}`);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
});
await click(first);
await act(async () => locationRequest.resolve(catalog([slow])));
locationRequest = null;
await flush();
assertFaction(first);

// Deferred view-transition commits also honor latest intent.
const callbacks = [];
const transitions = [];
document.startViewTransition = callback => {
  callbacks.push(callback);
  const done = deferred(); transitions.push(done);
  return { finished: done.promise, ready: Promise.reject(new Error("transition skipped")), updateCallbackDone: Promise.resolve(), skipTransition() {} };
};
// Escape returns to the faction picker through a deferred transition.
await act(async () => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
assert.equal(callbacks.length, 1);
await click(latest);
await act(async () => { callbacks.shift()(); transitions.shift().resolve(); });
await flush();
assertFaction(latest);
delete document.startViewTransition;

assert.ok(groupCalls.filter(id => id === slow).length >= 3);
// Hidden headings use the visible main landmark as the keyboard focus target.
assert.equal(document.activeElement.id, "main-content");
}

assert.equal(errors.length, 0, errors.map(String).join("\n"));
await act(async () => root.unmount());
dom.window.close();
console.log(JSON.stringify({ result: "passed", siteEdition, scenario, uncaughtErrors: errors.length }));
