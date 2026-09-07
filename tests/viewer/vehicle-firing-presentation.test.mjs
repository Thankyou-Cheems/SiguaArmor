import test from "node:test";
import assert from "node:assert/strict";
import { sourceMagazineDepletedTexture, sourceProjectileForShot, sourceMagazineColor, sourceHudCssColor, sourceWeaponFireModeLabel } from "../../lib/vehicle-firing-presentation.ts";

test("native magazine foreground uses reverse fullness bands and the base at both endpoints", () => {
  const icons = { base: "base", depleted: ["d0", "d1", "d2", "d3"] };
  assert.deepEqual([1, .99, .75, .5, .25, .01, 0].map(f => sourceMagazineDepletedTexture(icons, f)),
    ["base", "d0", "d1", "d2", "d3", "d3", "base"]);
});

test("tracer sequence increments before the native greater-than test, including every-round tracers", () => {
  const document = { projectiles: { base: { bodies: [] }, tracer: { bodies: [] } } };
  const weapon = { projectileClass: "base", tracerProjectileClass: "tracer", roundsBetweenTracer: 2 };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(n => sourceProjectileForShot(document, weapon, n).classPath),
    ["base", "base", "tracer", "base", "base", "tracer"]);
  assert.equal(sourceProjectileForShot(document, { ...weapon, roundsBetweenTracer: 0 }, 0).classPath, "tracer");
});

test("native magazine color interpolates through red, orange and yellow in linear HSV", () => {
  const color = (R, G, B) => ({ R, G, B, A: 1 });
  const document = { hud: { magazineColors: {
    Full: color(1, 1, 1), NearlyFull: color(1, 1, 0), Half: color(1, .3, 0),
    NearlyEmpty: color(1, 0, 0), Refillable: color(.1, .1, .1),
  } } };
  assert.deepEqual(sourceMagazineColor(document, 0), color(.1, .1, .1));
  assert.deepEqual(sourceMagazineColor(document, 1), color(1, 1, 1));
  const halfway = sourceMagazineColor(document, .5);
  assert.ok(Math.abs(halfway.R - 1) < 1e-8 && Math.abs(halfway.G - .3) < 1e-8 && halfway.B === 0);
  assert.equal(sourceHudCssColor(halfway), "rgba(255, 149, 0, 1)");
  assert.ok(sourceMagazineColor(document, .25).G < halfway.G);
  assert.ok(sourceMagazineColor(document, .75).G > halfway.G);
});

test("fire selector retains authored burst size rather than labeling every burst as three", () => {
  const document = { hud: { showFireSelector: true, fireModeLabels: { continuous: "A", single: "1", burst: "3" } } };
  const spec = value => ({ fireControl: { defaultModeIndex: 0, modes: [{ kind: "burst", sourceValue: value }] } });
  assert.equal(sourceWeaponFireModeLabel(document, spec(2)), "2");
  assert.equal(sourceWeaponFireModeLabel(document, spec(3)), "3");
});
