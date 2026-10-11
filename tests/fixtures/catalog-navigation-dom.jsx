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
const language = parameters.get("language") ?? "en";
const isHomeRecovery = scenario.startsWith("home-");
const hasViewerFixture = scenario === "viewer-history" || scenario === "reference-focus";
const ids = siteEdition === "china" ? ["ekeqie", "agesi", "shenzhou"] : ["afu", "baf", "pla"];
const [first, slow, latest] = ids;
const basePath = siteEdition === "china" ? "/sigua" : "/squad";
const groups = ids.map((id, order) => ({ id, order, name: id.toUpperCase(), recordCount: 1 }));
function catalog(loaded = [first, latest]) {
  return { schemaVersion: "1.0.0", catalogId: "navigation-dom", groups,
    records: loaded.map(id => ({
      promoEntryId: `${id}--test`, promotionOrder: ids.indexOf(id),
      official: { groupId: id, groupNameZh: id.toUpperCase(), nameZh: `${id} vehicle`, typeZh: "MBT", typeNameZh: "坦克" },
      selectedRawName: null, selectedDisplayName: `${id} vehicle`, defaultCardId: hasViewerFixture ? `${id}--test--test` : `${id}--test`, routeSlug: `${id}--test`, variants: hasViewerFixture ? [{ sourceRawName: "BP_Test", runtimeVehicleRef: "test-runtime", visualArtifactRef: "test-visual", cardId: `${id}--test--test`, routeSlug: `${id}--test` }] : [],
    })),
  };
}
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: `https://armor.test${basePath}${isHomeRecovery ? "/" : `/factions/${first}`}`, pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, HTMLImageElement: dom.window.HTMLImageElement,
  Event: dom.window.Event, Image: dom.window.Image, IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class { observe() {} disconnect() {} },
  fetch: async () => { throw new Error("Network is disabled in the catalog regression test"); },
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
localStorage.setItem("sigua.ui-language", language);
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

if (scenario === "initial-retry-focus" || scenario === "home-initial-retry-focus") {
  locationRequest = deferred();
  await mount();
  await act(async () => locationRequest.reject(new Error("initial failure")));
  await flush();
  for (let attempt = 0; attempt < 2; attempt++) {
    locationRequest = deferred();
    const retry = document.querySelector("main.catalog-data-state button");
    assert.ok(retry);
    await act(async () => { retry.focus(); retry.click(); });
    await flush();
    assert.ok(document.querySelector("main.catalog-data-state") && document.activeElement === document.querySelector("main.catalog-data-state"), "retry retains a visible loading anchor");
    assert.ok(document.querySelector("main.catalog-data-state [role=status]"));
    await act(async () => attempt === 0 ? locationRequest.reject(new Error("still offline")) : locationRequest.resolve(catalog()));
    await flush();
    assert.notEqual(document.activeElement, document.body, "both another failure and success keep focus connected");
  }
  if (isHomeRecovery) {
    assert.equal(document.querySelector(".site-shell").dataset.factionSelected, "false");
    assert.equal(document.activeElement.id, "faction-selector-title");
    assert.ok(!document.activeElement.closest("[inert]"));
  } else assertFaction(first);
} else if (scenario === "home-navigation-focus") {
  await mount();
  assert.ok(document.getElementById("main-content").closest("[inert]"), "unselected catalog is present but cannot be a focus target");
  const failSelection = async () => {
    const request = deferred(); pendingGroups.set(slow, request);
    const choice = [...document.querySelectorAll(".faction-selector__choice")].find(button => button.getAttribute("aria-label").includes(slow.toUpperCase()));
    await act(async () => { choice.focus(); choice.click(); });
    await act(async () => request.reject(new Error("home faction offline")));
    await flush();
    return document.querySelector(".catalog-navigation-error");
  };
  let notice = await failSelection();
  await act(async () => { const dismiss = notice.querySelectorAll("button")[1]; dismiss.focus(); dismiss.click(); });
  assert.equal(document.activeElement.id, "faction-selector-title");
  assert.ok(!document.activeElement.closest("[inert]"));
  notice = await failSelection();
  const retryRequest = deferred(); pendingGroups.set(slow, retryRequest);
  await act(async () => { const retry = notice.querySelector("button"); retry.focus(); retry.click(); });
  assert.equal(document.activeElement.id, "faction-selector-title");
  await act(async () => retryRequest.resolve(catalog([slow])));
  await flush();
  assertFaction(slow);
  assert.equal(document.activeElement.id, "main-content");
  assert.ok(!document.activeElement.closest("[inert]"));
} else if (scenario === "recovery-focus") {
  await mount();
  assert.equal(document.documentElement.lang, language);
  fullRequest = deferred();
  await search("vehicle");
  await act(async () => fullRequest.reject(new Error("controlled diagnostic")));
  await flush();
  const input = inputProps().input;
  const searchError = document.querySelector(".global-vehicle-search__empty:has([role=alert]), .global-vehicle-search__empty[role=alert]");
  assert.ok(searchError);
  fullRequest = deferred();
  await act(async () => { const retry = searchError.querySelector("button"); retry.focus(); retry.click(); });
  assert.ok(document.activeElement === input, "search retry preserves keyboard context");
  assert.equal(input.value, "vehicle");
  assert.ok(!searchError.querySelector("[role=alert] button, [role=alert] details"));
  assert.ok(!searchError.closest('[role="listbox"]'), "recovery controls are outside the option list");
  assert.ok(searchError.querySelector("details"), "technical diagnostics are disclosed on demand");
  await act(async () => fullRequest.resolve(catalog()));
  await flush();
  assert.equal(document.activeElement, input);
  assert.ok(!document.querySelector(".global-vehicle-search__empty [role=alert]"));
} else if (scenario === "navigation-focus") {
  await mount();
  const input = inputProps().input;
  const failFaction = async () => {
    const request = deferred(); pendingGroups.set(slow, request);
    await click(slow);
    await act(async () => request.reject(new Error("controlled faction diagnostic")));
    await flush();
    return document.querySelector(".catalog-navigation-error");
  };
  let notice = await failFaction();
  await act(async () => { const dismiss = notice.querySelectorAll("button")[1]; dismiss.focus(); dismiss.click(); });
  assert.equal(document.activeElement.id, "main-content", "dismiss returns to a visible catalog anchor");
  assert.ok(notice.querySelector("[role=alert]"));
  assert.ok(!notice.querySelector("[role=alert] button, [role=alert] details"));
  notice = await failFaction();
  const delayed = deferred(); pendingGroups.set(slow, delayed);
  await act(async () => { const retry = notice.querySelector("button"); retry.focus(); retry.click(); });
  assert.equal(document.activeElement.id, "main-content", "retry does not leave focus on a removed notice");
  await act(async () => input.focus());
  await act(async () => delayed.resolve(catalog([slow])));
  await flush();
  assertFaction(slow);
  assert.equal(document.activeElement, input, "completion must not steal focus after the user moves elsewhere");
} else if (scenario === "reference-focus") {
  window.history.replaceState(null, "", vehicleUrl(first));
  await mount();
  const button = document.querySelector("[data-fixture-open-reference]");
  assert.ok(button);
  const viewer = button.closest("[data-fixture-viewer]");
  await act(async () => { button.focus(); button.click(); });
  await flush();
  const reference = document.querySelector('.vehicle-encyclopedia[data-open="true"]');
  assert.ok(reference);
  assert.ok(document.activeElement === reference.querySelector("h3"), "reference heading receives focus");
  assert.ok(button.closest("[inert]"), "covered preview cannot receive keyboard focus");
  assert.ok(viewer.isConnected, "opening reference preserves the viewer rather than remounting it");
  assert.equal(document.querySelector("[data-fixture-viewer]"), viewer);
  await act(async () => reference.querySelector("button").click());
  await flush();
  assert.equal(document.querySelector(".site-shell").dataset.detailOpen, "false");
  assert.notEqual(document.activeElement, document.body, "close has a catalog fallback when the original card cannot be focused");
} else if (scenario === "initial-history") {
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
    assert.match(document.querySelector(".global-vehicle-search__empty:has([role=alert])").textContent, /search offline/);
    await act(async () => document.querySelector(".global-vehicle-search__empty:has([role=alert]) button").click());
    await flush();
    assert.equal(document.querySelector(".global-vehicle-search__empty [role=alert]"), null);
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
console.log(JSON.stringify({ result: "passed", siteEdition, scenario, language, uncaughtErrors: errors.length }));
