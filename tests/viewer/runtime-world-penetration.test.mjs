import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { resolveWorldPenetration, buildSchoolImpactTrace } from "../../lib/runtime-world-penetration.ts";

const ballistics = { penetrationAtRangeMm: 200, penetrationTraceDistanceM: 100, impactDamageAtRange: 100, traceDistanceAfterPenetrationM: 10 };
const hit = (distanceM, surface = {}, incidenceFactor = 1) => ({ distanceM, incidenceFactor,
  surface: { considerForPenetration: true, allowPenetration: true, armorThicknessMm: 10, damageAbsorbed: 0, ...surface } });

test("building no-consider, no-penetration zero, penetrable zero and unknown are distinct", () => {
  const result = resolveWorldPenetration(ballistics, [hit(0, { considerForPenetration: false, allowPenetration: false }),
    hit(1, { armorThicknessMm: 0 }), hit(2, { allowPenetration: false, armorThicknessMm: 0 }), hit(3)]);
  assert.deepEqual(result.layers.map(layer => layer.penetrated), [true, false]);
  assert.equal(result.terminalDistanceM, 2);
  const unknown = resolveWorldPenetration(ballistics, [hit(0, { considerForPenetration: null })]);
  assert.equal(unknown.layers[0].penetrated, null);
  assert.equal(unknown.complete, false);
});

test("authored threshold is independent of wall separation; prior absorption affects the next layer", () => {
  const result = resolveWorldPenetration(ballistics, [hit(0, { damageAbsorbed: 90 }), hit(.1, { armorThicknessMm: 50 })]);
  assert.deepEqual(result.layers.map(layer => layer.penetrated), [true, false]);
  assert.ok(result.layers[1].availablePenetrationMm < 20);
});

test("strict equality fails and signed negative incidence is not converted with abs", () => {
  const available = resolveWorldPenetration(ballistics, [hit(0)]).layers[0].availablePenetrationMm;
  assert.equal(resolveWorldPenetration(ballistics, [hit(0, { armorThicknessMm: available })]).layers[0].penetrated, false);
  assert.equal(resolveWorldPenetration(ballistics, [hit(0, {}, -1)]).layers[0].penetrated, false);
});

test("finite weapon continuation bounds the line, independently of the penetration falloff length", () => {
  const result = resolveWorldPenetration(ballistics, [hit(.01), hit(30, { allowPenetration: false })]);
  assert.equal(result.layers.length, 1);
  assert.equal(result.terminalDistanceM, 10.01);
});

test("unknown parameters and absorption cannot fabricate an extension past the last verified layer", () => {
  const missing = resolveWorldPenetration({ ...ballistics, penetrationAtRangeMm: null }, [hit(0)]);
  assert.equal(missing.complete, false);
  assert.equal(missing.terminalDistanceM, 0);
  const absorption = resolveWorldPenetration(ballistics, [hit(0, { damageAbsorbed: null }), hit(2)]);
  assert.equal(absorption.complete, false);
  assert.equal(absorption.terminalDistanceM, 0);
  assert.equal(absorption.layers.length, 1);
});

test("unverified native query metadata stops the reference at an amber contact, not a fabricated penetration", () => {
  const uncertain = { ...hit(2), queryUncertainty: "原生命中列表尚未确认" };
  const result = resolveWorldPenetration(ballistics, [hit(0), uncertain, hit(4)]);
  assert.deepEqual(result.layers.map(layer => layer.penetrated), [true, null]);
  assert.equal(result.complete, false);
  assert.equal(result.terminalDistanceM, 2);
  assert.equal(result.reason, uncertain.queryUncertainty);
  const surfaceHit = { ...uncertain, point: new THREE.Vector3(10, 0, 0) };
  const trace = buildSchoolImpactTrace({ query: { postImpact: () => [{ hit: surfaceHit, exit: null }] },
    offset: new THREE.Vector3(), hit: surfaceHit, center: new THREE.Vector3(9.68, 0, 0),
    direction: new THREE.Vector3(1, 0, 0), timeSeconds: .2,
    ballistics: { ...ballistics, isExplosive: false }, armed: true, terminalImpact: true });
  assert.equal(trace.contacts[0].penetrated, null);
  assert.match(trace.summary, /穿透未确认/);
  assert.doesNotMatch(trace.summary, /穿透参考 0 层/);
});

test("impact presentation starts the native trace at sphere Location, uses a finite end and gates unarmed/explosive routes", () => {
  let queries = 0;
  const surfaceHit = {...hit(.33),point:new THREE.Vector3(10,0,0)};
  const input = { query:{ postImpact(start,direction,far) {
    queries++;
    assert.ok(Math.abs(start.x-9.67)<1e-9);
    assert.equal(far,10.01);
    return [{hit:surfaceHit,exit:null}];
  }}, offset:new THREE.Vector3(), hit:surfaceHit, center:new THREE.Vector3(9.68,0,0),
    direction:new THREE.Vector3(1,0,0),timeSeconds:.2,
    ballistics:{...ballistics,isExplosive:false},armed:true,terminalImpact:true };
  const trace = buildSchoolImpactTrace(input);
  assert.equal(queries,1);
  assert.equal(trace.timeSeconds,.2);
  assert.equal(trace.contacts[0].penetrated,true);
  // The continuation ends relative to the swept sphere Location (9.68 m),
  // not an extra full span after its later surface ImpactPoint (10 m).
  assert.ok(Math.abs(trace.pointsCm.at(-1).x-1968)<1e-6);
  assert.match(buildSchoolImpactTrace({...input,armed:false}).summary,/引信未解锁/);
  assert.match(buildSchoolImpactTrace({...input,ballistics:{...ballistics,isExplosive:true}}).summary,/爆炸后效未模拟/);
  assert.equal(queries,1);
});
