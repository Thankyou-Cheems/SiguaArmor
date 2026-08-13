import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRuntimeViewerBudget,
  percentile,
  summarizeFrameIntervals,
} from "../../tools/perf/runtime-viewer-metrics.mjs";

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
    viewer: { renderQuality: "compatibility", compatibilityAssetCount: 8 },
    readyMs: 1000,
    drag: { frames: { p95Ms: 16, maxMs: 20 }, longTasks: [], contextLosses: 0 },
    network: { failures: [], forbiddenCatalogRequests: [] },
    consoleErrors: [],
  }, {
    expectedRenderer: "Intel.*UHD.*770",
    minCompatibilityAssets: 8,
    maxReadyMs: 15000,
    maxDragP95Ms: 34,
    maxDragMaxMs: 80,
    maxLongTasks: 0,
    maxContextLosses: 0,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /does not match/u);
});
