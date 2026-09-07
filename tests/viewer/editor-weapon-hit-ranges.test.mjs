import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorWeaponHitRanges } from '../../lib/editor-native-hit-model.ts';

const model={weapons:[{armorPenetrationCurveIndex:0,damageFalloffCurveIndex:1,armorPenetrationDepthMm:50.9,maxDamage:500}],
  curves:[{keys:[{time:0,value:100},{time:100,value:0}]},{keys:[{time:0,value:1000},{time:10000,value:0}]}]};

test('native weapon hit uses distinct penetration metres and receiver-origin damage centimetres',()=>{
  const result=resolveEditorWeaponHitRanges(model,0,{penetrationDistanceM:25,damageDistanceCm:7500,shotDamageMultiplier:.5});
  assert.equal(result.penetrationAtRangeMm,75);
  assert.equal(result.impactDamageAtRange,125);
});

test('missing native origins cannot be replaced by the other curve range',()=>{
  assert.equal(resolveEditorWeaponHitRanges(model,0,{penetrationDistanceM:25,damageDistanceCm:null,shotDamageMultiplier:1}).impactDamageAtRange,null);
  assert.equal(resolveEditorWeaponHitRanges(model,0,{penetrationDistanceM:null,damageDistanceCm:7500,shotDamageMultiplier:1}).penetrationAtRangeMm,null);
});

test('source-confirmed absent curves use weapon constants, not projectile direct config',()=>{
  const constant={...model,weapons:[{...model.weapons[0],armorPenetrationCurveIndex:{state:'absent',value:null},damageFalloffCurveIndex:{state:'absent',value:null}}]};
  const result=resolveEditorWeaponHitRanges(constant,0,{penetrationDistanceM:null,damageDistanceCm:null,shotDamageMultiplier:.5});
  assert.equal(result.penetrationAtRangeMm,50);
  assert.equal(result.impactDamageAtRange,250);
  assert.equal(resolveEditorWeaponHitRanges(constant,0,{penetrationDistanceM:null,damageDistanceCm:null,shotDamageMultiplier:null}).impactDamageAtRange,null);
});
