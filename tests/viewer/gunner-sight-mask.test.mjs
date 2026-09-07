import assert from "node:assert/strict";
import test from "node:test";
import { gunnerSightMaskHasClosedFrame, gunnerSightMaskPolygon } from "../../lib/gunner-sight-mask.ts";

const pixels = (...alphas) => Uint8ClampedArray.from(alphas.flatMap((a) => [0, 0, 0, a]));

test("closed panel rims with a real aperture can extend black beyond the source image", () => {
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(255, 255, 255), pixels(255, 0, 255)), true);
  // CROWS/TOW source rims are translucent, not alpha 255.
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(222, 202, 194), pixels(255, 0)), true);
});

test("open transparent artwork and solid status images do not create black gutters", () => {
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(255, 0, 255), pixels(0)), false);
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(0, 0, 0), pixels(255, 0)), false);
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(255, 255), pixels(255, 255)), false);
  assert.equal(gunnerSightMaskHasClosedFrame(pixels(127, 255), pixels(0)), false);
});

test("Arbalet mask keeps its source offset and dimensions instead of stretching to 16:9", () => {
  const polygon = gunnerSightMaskPolygon({
    viewBox: [0, 0, 1920, 1080], width: 760, height: 760,
    matrix: [1.69, 0, 0, 1.69, 317.8, -102.2],
  });
  assert.deepEqual(polygon.map((p) => p.map((v) => Math.round(v * 10) / 10)),
    [[317.8, -102.2], [1602.2, -102.2], [1602.2, 1182.2], [317.8, 1182.2]]);
});

test("non-square and rotated source rectangles retain their full footprint", () => {
  const polygon = gunnerSightMaskPolygon({
    viewBox: [0, 0, 1920, 1080], width: 800, height: 400,
    matrix: [1, 0, 0, 1, 560, 340],
  }, 90);
  assert.deepEqual(polygon.map((p) => p.map(Math.round)),
    [[1160, 140], [1160, 940], [760, 940], [760, 140]]);
});
