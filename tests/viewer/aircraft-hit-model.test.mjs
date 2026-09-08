import assert from "node:assert/strict";
import test from "node:test";
import { simulateEditorNativeShot, editorNativeActorDamageEstimate, editorNativeEffectiveDamageAmount } from "../../lib/editor-native-hit-model.ts";

const absent={state:"absent",value:null};
function model() { return {
  damageReceiver:{kind:"actor-health-component",healthPoolIndex:0,damageMultiplier:2},
  owners:[{ownerId:"aircraft",kind:"actor-root",parentOwnerIndex:null,healthPoolIndex:0}],
  healthPools:[{poolId:"aircraft-health",kind:"actor",ownerIndex:0,componentIndex:0,maxHealth:1000,damageModifiers:[]}],
  components:[{componentId:"body",semanticKind:"armor",ownerIndex:0,placementState:"resolved",directDamagePoolIndex:0}],
  surfaceProfiles:[{surfaceProfileId:"trucks",componentIndex:0,armorThicknessMm:2,considerForPenetration:true,allowPenetration:true,damageParentActor:true,armorDamageMultiplier:1,damageAbsorbed:30}],
  weapons:[{weaponId:"fixture",role:"test",projectileIndex:0,armorPenetrationDepthMm:10,armorPenetrationCurveIndex:absent,damageFalloffCurveIndex:absent,maxDamage:75,traceDistanceAfterPenetrationMeters:100}],
  projectiles:[{projectileId:"fixture",role:"test",damageTypePath:"/Script/Engine.DamageType",armorPenetrationDepthMm:10,impactDamage:75,isExplosive:false,traceDistanceAfterPenetrationMeters:100}],
  curves:[],capabilities:{directHitDamage:{state:"partial"},finalTargetTakeDamageRouting:{state:"observed"}},
}; }
const hit={triangleIndex:0,componentIndex:0,surfaceProfileIndex:0,distanceFromRayOriginM:1,point:[0,0,0],faceNormal:[-1,0,0],incidenceFactor:1};
function shot(target,intersections=[hit]) {return simulateEditorNativeShot({model:target,weaponIndex:0,targetDistanceM:0,shotDamageMultiplier:1,intersections});}
test("aircraft applies the Actor health multiplier once across repeated body faces",()=>{
  const result=shot(model(),[hit,{...hit,triangleIndex:1,point:[1,0,0],distanceFromRayOriginM:2}]);
  assert.equal(result.damage.length,1);
  assert.equal(result.damage[0].incomingDamage,75);
  assert.equal(result.damage[0].poolDamage,150);
  assert.equal(result.damage[0].certainty,"partial");
  assert.equal(result.damage[0].poolKind,"actor");
  assert.equal(editorNativeEffectiveDamageAmount(result.damage[0]),0);
  assert.deepEqual(editorNativeActorDamageEstimate(result),{damage:150,maxHealth:1000,remainingHealth:850});
  result.damage[0].certainty="native-unknown";
  assert.equal(editorNativeActorDamageEstimate(result),null);
});
test("aircraft preserves material gates, unknown material and strict penetration threshold",()=>{
  for(const change of [{allowPenetration:false},{damageParentActor:false},{armorThicknessMm:10},{armorThicknessMm:{state:"native-unknown",value:null}}]) {
    const target=model(); Object.assign(target.surfaceProfiles[0],change);
    assert.equal(shot(target).damage.length,0);
  }
  assert.equal(shot(model(),[]).damage.length,0);
});
test("Actor receiver mismatch cannot fall through to vehicle damage modifiers",()=>{
  const target=model(); target.damageReceiver.healthPoolIndex=1;
  assert.equal(shot(target).damage.length,0);
});
test("ordinary vehicle receivers keep their existing damage-type resistance",()=>{
  const target=model(); delete target.damageReceiver;
  target.owners[0].kind="vehicle-root";
  target.healthPools[0].kind="hull";
  target.healthPools[0].damageModifiers=[{damageTypePath:"/Script/Engine.DamageType",modifier:.25}];
  assert.equal(shot(target).damage[0].poolDamage,18.75);
});
