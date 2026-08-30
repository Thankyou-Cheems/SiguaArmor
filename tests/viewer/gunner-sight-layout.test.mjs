import assert from "node:assert/strict";
import test from "node:test";

import { gunnerSightLayerPlacement } from "../../lib/gunner-sight-layout.ts";

const transform = (scale) => ({
  Translation: { X: 0, Y: 0 },
  Scale: { X: scale, Y: scale },
  Shear: { X: 0, Y: 0 },
  Angle: 0,
});
const centeredSlot = (left, top, width, height) => ({
  Offsets: { Left: left, Top: top, Right: width, Bottom: height },
  Anchors: {
    Minimum: { X: 0.5, Y: 0.5 },
    Maximum: { X: 0.5, Y: 0.5 },
  },
  Alignment: { X: 0.5, Y: 0.5 },
});

function crowsLayout(widgetName, slot, scale) {
  return {
    state: "observed-canvas-panel-path",
    referenceCanvas: { width: 1920, height: 1080 },
    steps: [{
      widgetName: "Unzoomed",
      layoutMode: "canvas-panel",
      layoutData: centeredSlot(0, 0, 1920, 1080),
      renderTransform: transform(1.3),
      renderTransformPivot: { X: 0.5, Y: 0.5 },
    }, {
      widgetName,
      layoutMode: "canvas-panel",
      layoutData: slot,
      renderTransform: transform(scale),
      renderTransformPivot: { X: 0.5, Y: 0.5 },
    }],
  };
}

test("CROWS reticle composes parent and child UMG render scales", () => {
  const placement = gunnerSightLayerPlacement({
    layout: crowsLayout(
      "MainReticle",
      centeredSlot(0, 0, 800, 800),
      0.4,
    ),
  });
  assert.deepEqual(placement?.viewBox, [0, 0, 1920, 1080]);
  assert.equal(placement?.width, 800);
  assert.equal(placement?.height, 800);
  assert.deepEqual(
    placement?.matrix.map((value) => Number(value.toFixed(5))),
    [0.52, 0, 0, 0.52, 752, 332],
  );
});

test("CROWS panel image keeps its authored offset and two 1.3 scales", () => {
  const placement = gunnerSightLayerPlacement({
    layout: crowsLayout(
      "UnzoomedImage",
      centeredSlot(-76, -47.6075, 1050, 1050),
      1.3,
    ),
  });
  assert.deepEqual(
    placement?.matrix.map((value) => Number(value.toFixed(5))),
    [1.69, 0, 0, 1.69, -26.05, -409.13975],
  );
});

test("unresolved or malformed layout fails closed", () => {
  assert.equal(gunnerSightLayerPlacement({ layout: null }), null);
  assert.equal(gunnerSightLayerPlacement({
    layout: {
      state: "unresolved-unsupported-slot-class",
      referenceCanvas: { width: 1920, height: 1080 },
      steps: [],
    },
  }), null);
});
