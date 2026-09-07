import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { resolveWorldPenetration, buildSchoolImpactTrace } from "../../lib/runtime-world-penetration.ts";
import { NativeWeaponArmorCache } from "../../lib/editor-native-hit-state.ts";

const ballistics = { penetrationAtRangeMm: 200, penetrationTraceDistanceM: 100, impactDamageAtRange: 100, traceDistanceAfterPenetrationM: 10 };
const hit = (distanceM, surface = {}, incidenceFactor = 1) => ({ distanceM, incidenceFactor,
  surface: { considerForPenetration: true, allowPenetration: true, armorThicknessMm: 10, damageAbsorbed: 0, ...surface } });

const actorHit = (distance, actorId, surface = {}) => ({ ...hit(distance, { damageParentActor: true, ...surface }),
  receiver: { kind: "static-actor", actorId, actorLocationCm: [0, 0, 0], passesDamageToParent: false, attachParentActorId: null } });

test("static Actor dispatch keeps native receiver and material gates separate from penetration",()=>{
  const admitted=actorHit(.01,"actor");admitted.receiver.canBeDamaged=true;
  const disabled=actorHit(.02,"disabled");disabled.receiver.canBeDamaged=false;
  const noParent=actorHit(.03,"no-parent",{damageParentActor:false});noParent.receiver.canBeDamaged=true;
  const result=resolveWorldPenetration(ballistics,[admitted,disabled,noParent]);
  assert.deepEqual(result.layers.map(l=>l.dispatchedPointDamage),[100,0,0]);
  assert.deepEqual(result.layers.map(l=>l.remainingDamage),[100,100,100]);
  assert.deepEqual(result.layers.map(l=>l.penetrated),[true,true,true]);
});

test("continuation preserves source centimetres across a large display offset",()=>{
  const sourcePointCm=[19216.521141191348,-58058.438306000884,680.1013141149903];
  const contact={...hit(.01),sourcePointCm,point:new THREE.Vector3(1,2,3)};
  let segment;
  buildSchoolImpactTrace({query:{postImpact(_a,_b,_c,_d,s){segment=s;return [];}},offset:new THREE.Vector3(100,-20,300),hit:contact,
    center:contact.point,direction:new THREE.Vector3(1,0,0),timeSeconds:0,armed:true,terminalImpact:true,
    ballistics:{...ballistics,isExplosive:false,traceDistanceAfterPenetrationM:5}});
  assert.deepEqual(segment,{startCm:[sourcePointCm[0]-1,sourcePointCm[1],sourcePointCm[2]],endCm:[sourcePointCm[0]+500,sourcePointCm[1],sourcePointCm[2]]});
});

test("same Actor across distinct ISM placements neither re-tests armor nor absorbs twice", () => {
  let samples = 0;
  const result = resolveWorldPenetration(ballistics, [actorHit(0, "shared", { damageAbsorbed: 60 }),
    actorHit(.1, "shared", { armorThicknessMm: 9999, damageAbsorbed: 99 }), actorHit(.2, "other", { armorThicknessMm: 60 })], () => {
      samples++; return ballistics;
    });
  assert.equal(samples, 2);
  assert.deepEqual(result.layers.map(row => row.penetrated), [true, true]);
  assert.equal(result.complete, true);
  // Material flag false keeps separate physical accounting even for one Actor.
  const independent = resolveWorldPenetration(ballistics, [actorHit(0, "shared", { damageParentActor: false, damageAbsorbed: 60 }),
    actorHit(.1, "shared", { damageParentActor: false, damageAbsorbed: 60 }), actorHit(.2, "other")]);
  assert.match(independent.reason, /耗尽/);
  assert.equal(independent.layers.length, 2);
});

test("cache reuse occurs only after DealDamage's allow and positive-damage gates", () => {
  const cache = new NativeWeaponArmorCache();
  const nativeHitKey = { distanceCm: 1, timeFraction: .001, impactPointCm: [100, 200, 300] };
  const first = { ...hit(.01), nativeHitKey };
  assert.equal(resolveWorldPenetration(ballistics, [first], undefined, cache).layers[0].penetrated, true);
  const changed = { ...hit(.01, { armorThicknessMm: 9999 }), nativeHitKey };
  assert.equal(resolveWorldPenetration(ballistics, [changed], undefined, cache).layers[0].penetrated, true);
  assert.equal(resolveWorldPenetration(ballistics, [{ ...changed, surface: { ...changed.surface, allowPenetration: false } }], undefined, cache).layers[0].penetrated, false);
  assert.equal(resolveWorldPenetration({ ...ballistics, impactDamageAtRange: 0 }, [changed], undefined, cache).layers[0].penetrated, false);
});

test("known HE point route preserves the Fallujah wood/terminal-concrete distinction without claiming radial damage", () => {
  for (const allowPenetration of [true, false]) {
    const contact = { ...hit(.01, { armorThicknessMm: 3, allowPenetration }), point: new THREE.Vector3(10,0,0) };
    let calls = 0;
    const args = { query: { postImpact() { calls++; return [{hit: contact}]; } },
      offset: new THREE.Vector3(), hit: contact, center: new THREE.Vector3(9.68,0,0),
      direction: new THREE.Vector3(1,0,0), timeSeconds:.2, armed:true, terminalImpact:true,
      ballistics: { ...ballistics, penetrationAtRangeMm:8, isExplosive:true, impactRadialOrder:"point-before-radial", impactRadialOrderSourceKnown:true } };
    const result = buildSchoolImpactTrace(args);
    assert.equal(calls,1);
    assert.equal(result.contacts[0].penetrated,allowPenetration);
    assert.match(result.summary,/爆炸范围伤害未模拟/);
    const unresolved = buildSchoolImpactTrace({...args,ballistics:{...args.ballistics,impactRadialOrder:null}});
    assert.equal(calls,1);
    assert.equal(unresolved.contacts[0].penetrated,null);
    const fallback = buildSchoolImpactTrace({...args,ballistics:{...args.ballistics,impactRadialOrderSourceKnown:false}});
    assert.equal(calls,1);
    assert.equal(fallback.contacts[0].penetrated,null);
  }
});

test("native zero and sub-centimetre spans query two centimetres around ImpactPoint", () => {
  for (const distance of [0, .001, .009]) {
    const surfaceHit = { ...hit(.01), point: new THREE.Vector3(10, 0, 0) };
    let observed;
    buildSchoolImpactTrace({ query: { postImpact(start, direction, far) {
      observed = { start: start.x, far, end: start.x + far }; return [];
    } }, offset: new THREE.Vector3(), hit: surfaceHit, center: new THREE.Vector3(9.68, 0, 0),
      direction: new THREE.Vector3(1, 0, 0), timeSeconds: .2,
      ballistics: { ...ballistics, traceDistanceAfterPenetrationM: distance, isExplosive: false },
      armed: true, terminalImpact: true });
    assert.equal(observed.far, .02);
    assert.equal(observed.start, 9.99);
    assert.ok(Math.abs(observed.end - 10.01) < 1e-12);
  }
});

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

test("zero armor bypasses positive-thickness arithmetic but still requires damage and allow", () => {
  const zero={...hit(1,{armorThicknessMm:0},-1),traceDistanceM:1};
  assert.equal(resolveWorldPenetration(ballistics,[zero]).layers[0].penetrated,true);
  assert.equal(resolveWorldPenetration({...ballistics,impactDamageAtRange:0},[zero]).layers[0].penetrated,false);
  assert.equal(resolveWorldPenetration(ballistics,[{...zero,surface:{...zero.surface,allowPenetration:false}}]).layers[0].penetrated,false);
});

test("each receiver evaluates its own range; exact absorption equality reaches the next layer", () => {
  const layers=[hit(0,{damageAbsorbed:100}),hit(.1)];
  const evaluate=h=>({penetrationAtRangeMm:200,impactDamageAtRange:h.distanceM===0?100:200});
  assert.deepEqual(resolveWorldPenetration(ballistics,layers,evaluate).layers.map(l=>l.penetrated),[true,true]);
  assert.deepEqual(resolveWorldPenetration(ballistics,layers).layers.map(l=>l.penetrated),[true,false]);
  const over=[hit(0,{damageAbsorbed:101}),hit(.1)];
  assert.equal(resolveWorldPenetration(ballistics,over,evaluate).layers.length,1);
});

test("native TraceStart survives skipped front surfaces and component refinement", () => {
  const parameters={...ballistics,penetrationAtRangeMm:100,penetrationTraceDistanceM:10};
  const late={...hit(5,{armorThicknessMm:75}),traceDistanceM:5};
  const result=resolveWorldPenetration(parameters,[hit(0,{considerForPenetration:false}),late]);
  assert.equal(result.layers[0].availablePenetrationMm,50);
  assert.equal(result.layers[0].penetrated,false);
  // A refined component query has its own TraceStart even though its point is
  // five metres from the original world query origin.
  const refined=resolveWorldPenetration(parameters,[{...late,traceDistanceM:.1}]);
  assert.ok(refined.layers[0].availablePenetrationMm>98);
  assert.equal(refined.layers[0].penetrated,true);
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

test("impact presentation uses ImpactPoint independently of sphere Location and preserves the finite query", () => {
  let queries = 0;
  const surfaceHit = {...hit(.33),point:new THREE.Vector3(10,0,0)};
  const input = { query:{ postImpact(start,direction,far) {
    queries++;
    assert.ok(Math.abs(start.x-9.99)<1e-9);
    assert.equal(far,10.01);
    return [{hit:surfaceHit,exit:null}];
  }}, offset:new THREE.Vector3(), hit:surfaceHit, center:new THREE.Vector3(9.68,0,0),
    direction:new THREE.Vector3(1,0,0),timeSeconds:.2,
    ballistics:{...ballistics,isExplosive:false},armed:true,terminalImpact:true };
  const trace = buildSchoolImpactTrace(input);
  assert.equal(queries,1);
  assert.equal(trace.timeSeconds,.2);
  assert.equal(trace.contacts[0].penetrated,true);
  // Native +0x28 is the surface ImpactPoint (10 m), so the query ends at 20 m.
  assert.ok(Math.abs(trace.pointsCm.at(-1).x-2000)<1e-6);
  assert.match(buildSchoolImpactTrace({...input,armed:false}).summary,/引信未解锁/);
  assert.match(buildSchoolImpactTrace({...input,ballistics:{...ballistics,isExplosive:true}}).summary,/爆炸与穿透顺序未确认/);
  assert.equal(queries,1);
});
