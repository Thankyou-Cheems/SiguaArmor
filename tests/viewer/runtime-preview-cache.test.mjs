import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Exercise the real preview loader at its Wiki seam, without live assets.
const bundle = await build({
  stdin: { contents: `export { runtimePreviewForCatalogBinding } from './app/runtime-probe-preview-data.ts';
    export { calls } from 'wiki-source-fixture';`, resolveDir: fileURLToPath(new URL("../../", import.meta.url)) },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "wiki-fixture", setup(build) {
    build.onResolve({ filter: /(?:wiki-source|wiki-source-fixture)$/ }, () => ({ path: "wiki-fixture", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export const calls = [];
      export async function loadWikiVehicleRuntimeSource(card) { calls.push(card); throw new Error('source unavailable'); }
      export async function loadWikiRuntimeVisual() { return {}; }
      export async function loadOptionalWikiVehicleGunnerSight() { return null; }
      export async function loadWikiVehicleDriverView() { return null; }
      export async function loadWikiVehicleStationGraph() { return null; }
    ` }));
  } }],
});
const { runtimePreviewForCatalogBinding: load, calls } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);

test("different variant bindings cannot share validation through one visual asset", async () => {
  const start = calls.length;
  await Promise.allSettled([
    load("card", "default-variant", "runtime", "exterior"),
    load("card", "selected-variant", "runtime", "exterior"),
  ]);
  assert.equal(calls.length - start, 2);
});

test("concurrent preview requests share work, but a failure does not poison retry", async () => {
  const start = calls.length;
  const args = ["retry-card", "selected-variant", "runtime", "retry-exterior"];
  await Promise.allSettled([load(...args), load(...args)]);
  assert.equal(calls.length - start, 1);
  await assert.rejects(load(...args), /source unavailable/);
  assert.equal(calls.length - start, 2);
});
