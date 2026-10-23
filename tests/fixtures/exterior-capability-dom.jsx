import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import InternationalVehicleViewer from "../../app/InternationalVehicleViewer";

// Controlled selections and transport, not official asset observations.
const dom = new JSDOM('<div id="root"></div>', { url: "https://armor.test/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const requests = [];
globalThis.__exteriorFixture = { requests, viewer: null };
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"));
const variants = ["blue", "red"].map(rawName => ({ id: rawName, rawName, label: rawName, displayName: rawName }));
function App({ edition = "international" }) {
  const [rawName, setRawName] = React.useState("blue"), [navigationState, setNavigation] = React.useState({ view: "exterior" });
  return <InternationalVehicleViewer siteEdition={edition} cardId="controlled-card" rawName={rawName}
    runtimeVehicleRef={rawName + "-runtime"} visualArtifactRef={rawName + "-visual"} displayName={rawName}
    referenceData={null} attackSourcePresentation={{ cardId: "controlled-card", displayName: rawName }}
    navigationState={navigationState} onNavigationStateChange={setNavigation} textureVariants={variants}
    onTextureVariantChange={next => { setRawName(next); setNavigation({ view: "exterior" }); }} />;
}
try {
  await act(async () => root.render(<App />));
  assert.equal(requests.length, 1);
  await act(async () => requests[0].resolve({ visual: { artifactRef: "blue-visual" } }));
  const blue = globalThis.__exteriorFixture.viewer;
  assert.equal(document.querySelector("[data-exterior-capability]").dataset.exteriorCapability, "pending");
  await act(async () => blue.onExteriorCapabilityChange({ state: "available" }));
  assert.equal(document.querySelector("[data-exterior-capability]").dataset.exteriorCapability, "available");
  await act(async () => blue.onExteriorCapabilityChange({ state: "unavailable", message: "controlled texture failure" }));
  assert.equal(globalThis.__exteriorFixture.viewer.mode, "armor");
  assert.ok(document.querySelector('[aria-label="选择外观"]'), "another precise livery remains reachable");
  await act(async () => document.querySelector('button[title="red"]').click());
  assert.equal(requests.length, 2);
  assert.ok(document.querySelector('[aria-busy="true"]'), "old resolved model is hidden immediately");
  await act(async () => blue.onExteriorCapabilityChange({ state: "available" }));
  assert.ok(document.querySelector('[aria-busy="true"]'), "late old callback cannot authorize the new selection");
  await act(async () => requests[1].reject(new Error("controlled exact identity failure")));
  assert.match(document.body.textContent, /controlled exact identity failure/);
  await act(async () => root.render(<App edition="china" />));
  assert.equal(requests.length, 3, "edition change creates a separate precise request");
  assert.ok(document.querySelector('[aria-busy="true"]'));
} finally {
  await act(async () => root.unmount());
  dom.window.close(); delete globalThis.__exteriorFixture;
}
