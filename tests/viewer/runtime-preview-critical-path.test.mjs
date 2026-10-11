import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { runPreviewWithDelays, matrix } from "../fixtures/runtime-preview-delays.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const beforeParallel = JSON.parse(await readFile(new URL("../fixtures/runtime-preview-before-parallel.json", import.meta.url), "utf8"));
// The snapshot was produced by the exact 4eda7ed loader with these same inputs.
// Only the network seam is mocked; all binding, pose, station and view validators run.
const bundle = await build({
  stdin: { contents: "export { runtimePreviewForCatalogBinding } from './app/runtime-probe-preview-data.ts';", resolveDir: root },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "preview-wiki-delays", setup(builder) {
    builder.onResolve({ filter: /\/wiki-source$/ }, () => ({ path: "wiki", namespace: "controlled-wiki" }));
    builder.onLoad({ filter: /.*/, namespace: "controlled-wiki" }, () => ({ contents: [
      ["loadWikiVehicleRuntimeSource", "runtime"], ["loadWikiRuntimeVisual", "visual"],
      ["loadWikiVehicleStationGraph", "graph"], ["loadOptionalWikiVehicleGunnerSight", "sight"],
      ["loadWikiVehicleDriverView", "driver"], ["loadWikiVehicleGroundedPose", "pose"],
    ].map(([name, key]) => `export function ${name}(...args) { return globalThis.__previewTimingHarness.load('${key}', args); }`).join("\n") }));
  } }],
});
const { runtimePreviewForCatalogBinding: load } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

for (const [label, delays, expectedMs, baselineMs] of [
  ["station and driver delayed", { runtime: 80, visual: 100, graph: 200, sight: 250, driver: 300, pose: 150 }, 400, 600],
  ["grounded pose delayed", { runtime: 80, visual: 100, graph: 200, sight: 30, driver: 40, pose: 500 }, 600, 800],
  ["sidecars already warm", { runtime: 80, visual: 100, graph: 200, sight: 0, driver: 0, pose: 0 }, 300, 300],
]) {
  test(`preview critical path: ${label} preserves the complete baseline preview`, async () => {
    const result = await runPreviewWithDelays(load, delays);
    assert.equal(result.error, undefined);
    assert.equal(result.ms, expectedMs);
    assert.deepEqual(result.output, beforeParallel);
    assert.deepEqual(result.output.chassisPose.gltfMatrix, matrix);
    assert.equal(result.events.length, 6, "parallel scheduling does not add logical data requests");
    for (const key of ["graph", "sight", "driver", "pose"]) {
      assert.equal(result.events.find(event => event.key === key).start, 100, "all independent metadata starts after runtime and visual identity validation");
    }
    console.log(JSON.stringify({ scope: "controlled logical delay, not browser timing", label, baselineMs, candidateMs: result.ms, savedMs: baselineMs - result.ms }));
  });
}

for (const [label, mutate, expectedError] of [
  ["graph identity mismatch", values => { values.graph.sourceVehicleRef = "vehicle-ffff"; }, /station graph mapping differs/u],
  ["missing driver", values => { values.driver = null; }, /driver view is missing/u],
  ["wrong driver identity", values => { values.driver.rawName = "wrong"; }, /driver view differs/u],
  ["stale gunner sight revision", values => { values.sight.stationGraphDataRevision = "f".repeat(64); }, /gunner-sight record differs/u],
]) {
  test(`parallel preview still rejects ${label}`, async () => {
    const result = await runPreviewWithDelays(load, { graph: 200, sight: 10, driver: 1, pose: 300 }, mutate);
    assert.match(result.error, expectedError);
    assert.equal(result.output, undefined, "no incomplete preview is published");
  });
}

test("invalid grounded pose retains the prior null-pose fallback", async () => {
  const result = await runPreviewWithDelays(load, { graph: 200, pose: 300 }, values => { values.pose.generatedClass = "wrong"; });
  assert.equal(result.error, undefined);
  assert.equal(result.output.chassisPose, null);
  assert.equal(result.output.groundedPose, null);
  assert.deepEqual(result.output.visual.placements[0].matrix, beforeParallel.visual.placements[0].matrix);
});

test("early sidecar failure consumes later graph and sidecar rejections without retry loops", async () => {
  const result = await runPreviewWithDelays(load, { graph: 200, driver: 1, sight: 150, pose: 300 }, values => {
    values.driver = new Error("driver offline");
    values.graph = new Error("late graph offline");
    values.sight = new Error("late sight offline");
  });
  assert.equal(result.error, "driver offline");
  assert.equal(result.output, undefined);
  assert.equal(result.events.length, 6);
});
