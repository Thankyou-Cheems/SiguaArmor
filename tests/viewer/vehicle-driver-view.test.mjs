import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { driverMaskVehicleMatrix } from "../../app/runtime-driver-view-mask.ts";

const [viewerSource, previewSource, wikiSource, maskSource, styles] =
  await Promise.all([
    readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/runtime-probe-preview-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/wiki-source.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/runtime-driver-view-mask.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);

test("driver mask transform maps UE centimetres and axes into the viewer", () => {
  const matrix = driverMaskVehicleMatrix({
    translationCm: { x: 100, y: 20, z: 250 },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale3D: { x: 1, y: 2, z: 3 },
  }).elements;
  assert.deepEqual([matrix[12], matrix[13], matrix[14]], [1, 2.5, 0.2]);
  assert.deepEqual([matrix[0], matrix[5], matrix[10]], [1, 3, 2]);
});

test("preview loads one exact Wiki driver-view sidecar", () => {
  assert.match(wikiSource, /loadWikiVehicleDriverView/u);
  assert.match(wikiSource, /\/data\/vehicles\/driver-views\//u);
  assert.match(previewSource, /projectVehicleDriverView/u);
  assert.match(previewSource, /driverViewRecord/u);
});

test("driver UI keeps marker, real-view action, immersive mask and exit distinct", () => {
  assert.match(viewerSource, /显示驾驶员观察点/u);
  assert.match(viewerSource, /进入真实驾驶视角/u);
  assert.match(viewerSource, /驾驶员视角控制/u);
  assert.match(viewerSource, /驾驶遮罩/u);
  assert.match(maskSource, /source-geometry-product-matte/u);
  assert.match(maskSource, /driver-mask-frame-matte/u);
  assert.match(maskSource, /driver-mask-glass-matte/u);
  assert.match(styles, /\.viewer-driver-view-controls/u);
});
