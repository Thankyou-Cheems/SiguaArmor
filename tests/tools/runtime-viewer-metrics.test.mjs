import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateRuntimeViewerBudget,
  percentile,
  summarizeFrameIntervals,
} from "../../tools/perf/runtime-viewer-metrics.mjs";

const wrapperSource = await readFile(
  new URL("../../tools/perf/Run-RuntimeViewerIgpuProbe.ps1", import.meta.url),
  "utf8",
);
const browserProbeSource = await readFile(
  new URL("../../tools/perf/runtime-viewer-browser-probe.mjs", import.meta.url),
  "utf8",
);

test("repeatable iGPU gate defaults match the reviewed acceptance contract", () => {
  assert.match(wrapperSource, /\$MaxReadyMs = 12000/u);
  assert.match(wrapperSource, /\$MaxDragP95Ms = 25/u);
  assert.match(wrapperSource, /\$MaxDragMaxMs = 160/u);
  assert.match(wrapperSource, /\$MaxLongTasks = 1/u);
  assert.match(wrapperSource, /\$MinOptimizedAssets = 8/u);
  assert.match(browserProbeSource, /maxReadyMs: number\("max-ready-ms", 12_000\)/u);
  assert.match(browserProbeSource, /maxDragP95Ms: number\("max-drag-p95-ms", 25\)/u);
  assert.match(browserProbeSource, /maxDragMaxMs: number\("max-drag-max-ms", 160\)/u);
  assert.match(browserProbeSource, /maxLongTasks: number\("max-long-tasks", 1\)/u);
  assert.match(browserProbeSource, /minOptimizedAssets: number\("min-optimized-assets", 8\)/u);
});

test("runtime viewer frame summaries use nearest-rank percentiles", () => {
  assert.equal(percentile([17, 8, 16, 50, 15], 0.95), 50);
  assert.deepEqual(summarizeFrameIntervals([16, 17, 33, 51]), {
    samples: 4,
    medianMs: 17,
    p95Ms: 51,
    maxMs: 51,
    over32Ms: 2,
    over50Ms: 1,
  });
});

test("runtime viewer budget fails closed on the wrong adapter", () => {
  const result = evaluateRuntimeViewerBudget({
    browser: { pageRenderer: "ANGLE (NVIDIA GeForce RTX 4080 SUPER)" },
    viewer: { renderQuality: "compatibility", optimizedAssetCount: 8 },
    readyMs: 1000,
    drag: { frames: { p95Ms: 16, maxMs: 20 }, longTasks: [], contextLosses: 0 },
    network: {
      failures: [],
      forbiddenCatalogRequests: [],
      forbiddenWeaponImpressionRequests: [],
    },
    consoleErrors: [],
  }, {
    expectedRenderer: "Intel.*UHD.*770",
    minOptimizedAssets: 8,
    maxReadyMs: 15000,
    maxDragP95Ms: 34,
    maxDragMaxMs: 80,
    maxLongTasks: 0,
    maxContextLosses: 0,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /does not match/u);
});

test("runtime viewer budget rejects weapon impression requests", () => {
  const result = evaluateRuntimeViewerBudget({
    browser: { pageRenderer: "ANGLE (Intel(R) UHD Graphics 770)" },
    viewer: { renderQuality: "compatibility", optimizedAssetCount: 8 },
    readyMs: 1000,
    drag: { frames: { p95Ms: 16, maxMs: 20 }, longTasks: [], contextLosses: 0 },
    network: {
      failures: [],
      forbiddenCatalogRequests: [],
      forbiddenWeaponImpressionRequests: ["https://wiki.siguad.icu/assets/weapons/impressions/example.webp"],
    },
    consoleErrors: [],
  }, {
    expectedRenderer: "Intel.*UHD.*770",
    minOptimizedAssets: 8,
    maxReadyMs: 15000,
    maxDragP95Ms: 34,
    maxDragMaxMs: 80,
    maxLongTasks: 0,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /weapon impression assets/u);
});
