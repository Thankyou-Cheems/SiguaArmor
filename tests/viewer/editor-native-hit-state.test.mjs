import test from "node:test";
import assert from "node:assert/strict";
import { NativeWeaponArmorCache, resolveNativeRepeatingActor } from "../../lib/editor-native-hit-state.ts";

const receiver = (actorId, attachParentActorId = null) => ({ kind: "static-actor", actorId,
  actorLocationCm: [0, 0, 0], passesDamageToParent: attachParentActorId !== null, attachParentActorId });
const key = (point = [1, 2, 3]) => ({ distanceCm: 1, timeFraction: .25, impactPointCm: point });

test("native cache is a last-hit key, preserves double points and copies the decision", () => {
  const cache = new NativeWeaponArmorCache();
  let calls = 0;
  const compute = () => { calls++; return { penetrated: true, availablePenetrationMm: 42 }; };
  const first = cache.evaluate(key(), compute);
  first.penetrated = false;
  assert.equal(cache.evaluate(key(), compute).penetrated, true);
  assert.equal(calls, 1);
  // Unlike a material-keyed or rounded-coordinate map, one double ULP misses.
  cache.evaluate(key([1 + Number.EPSILON, 2, 3]), compute);
  cache.evaluate(key(), compute);
  assert.equal(calls, 3);
  assert.equal(cache.evaluate({ ...key(), distanceCm: 1 + Number.EPSILON }, compute).cached, true);
  assert.equal(cache.evaluate({ ...key(), timeFraction: Math.fround(.25001) }, compute).cached, false);
});

test("zero-initialized weapon cache and NaN follow native equality", () => {
  const cache = new NativeWeaponArmorCache();
  const result = cache.evaluate({ distanceCm: 0, timeFraction: 0, impactPointCm: [0, 0, 0] }, () => assert.fail());
  assert.equal(result.penetrated, false);
  let calls = 0;
  for (let i = 0; i < 2; i++) cache.evaluate(key([NaN, 0, 0]), () => {
    calls++; return { penetrated: true, availablePenetrationMm: 1 };
  });
  assert.equal(calls, 2);
});

test("Actor and pass-damage parent share the native set without merging distinct children", () => {
  const seen = new Set();
  assert.deepEqual(resolveNativeRepeatingActor(seen, receiver("a", "parent"), true), { useActor: true, forwardDamageToParent: true });
  assert.deepEqual(resolveNativeRepeatingActor(seen, receiver("b", "parent"), true), { useActor: true, forwardDamageToParent: false });
  assert.deepEqual(resolveNativeRepeatingActor(seen, receiver("a", "parent"), true), { useActor: false, forwardDamageToParent: false });
  assert.equal(resolveNativeRepeatingActor(seen, receiver("parent"), true).useActor, false);
});

test("disabled DamageParentActor neither consults nor changes repetition state", () => {
  const seen = new Set();
  resolveNativeRepeatingActor(seen, receiver("a"), false);
  assert.equal(seen.size, 0);
  assert.equal(resolveNativeRepeatingActor(seen, receiver("a"), true).useActor, true);
  assert.equal(resolveNativeRepeatingActor(seen, receiver("a"), false).useActor, true);
});
