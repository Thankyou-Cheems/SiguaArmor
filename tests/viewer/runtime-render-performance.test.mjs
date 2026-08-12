import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runtimeRenderQualityProfile } from "../../lib/runtime-render-quality.ts";

const viewerSource = await readFile(
  new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
  "utf8",
);

test("runtime render quality lowers fill-rate cost on integrated and constrained devices", () => {
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)",
      deviceMemoryGb: 16,
      hardwareConcurrency: 12,
    }),
    { tier: "compatibility", pixelRatio: 1 },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 2,
      rendererName: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER)",
      deviceMemoryGb: 32,
      hardwareConcurrency: 24,
    }),
    { tier: "balanced", pixelRatio: 1.25 },
  );
  assert.deepEqual(
    runtimeRenderQualityProfile({
      devicePixelRatio: 1,
      rendererName: null,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
    }),
    { tier: "balanced", pixelRatio: 1 },
  );
});

test("viewer camera fit uses an immediate scale proxy and defers the detailed soldier", () => {
  assert.match(viewerSource, /function createReferenceSoldierProxy\(/u);
  assert.match(viewerSource, /host\.dataset\.referenceSoldierState = "proxy"/u);
  assert.match(viewerSource, /startReferenceSoldierAsset\?\.\(\)/u);
  assert.doesNotMatch(viewerSource, /if \(!referenceSoldierSettled\)/u);
});

test("orbit redraws rely on Three.js dirty matrices instead of forcing the whole scene", () => {
  const renderLoop = viewerSource.slice(
    viewerSource.indexOf("const render = () =>"),
    viewerSource.indexOf("renderRef.current = render"),
  );
  assert.match(renderLoop, /renderer\.render\(scene, camera\)/u);
  assert.doesNotMatch(renderLoop, /scene\.updateMatrixWorld\(true\)/u);
});
