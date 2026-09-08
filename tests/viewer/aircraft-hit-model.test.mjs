import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { simulateEditorNativeShot, editorNativeActorDamageEstimate, editorNativeEffectiveDamageAmount } from "../../lib/editor-native-hit-model.ts";
import { isEditorNativeVehicleDamageEvent, isEditorNativeComponentOnlyDamageEvent } from "../../lib/editor-native-hit-model.ts";

// Exercise the hover call site with the same shot that populates the health card.
const viewer = readFileSync(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
const hoverBody = viewer.slice(viewer.indexOf("        const stoppedLayer = result.stoppedAtLayer"), viewer.indexOf("        const rawThicknessMm = firstLayer?"))
  .replace(/: RuntimePointerOutline/g, "");
const hoverOutline = new Function("result", "editorNativeActorDamageEstimate", "isEditorNativeVehicleDamageEvent", "isEditorNativeComponentOnlyDamageEvent", "isRuntimeForcedRicochetLayer", `${hoverBody}; return outline;`);
const outlineFor = result => hoverOutline(result, editorNativeActorDamageEstimate, isEditorNativeVehicleDamageEvent, isEditorNativeComponentOnlyDamageEvent, () => false);

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

test("positive aircraft health estimate is also reported by the hover status",()=>{
  const result=shot(model());
  assert.equal(editorNativeActorDamageEstimate(result).damage,150);
  assert.equal(outlineFor(result),"actor-damage-estimate");
  assert.equal(editorNativeEffectiveDamageAmount(result.damage[0]),0);
  result.damage[0].certainty="native-unknown";
  assert.notEqual(outlineFor(result),"actor-damage-estimate");
});

test("zero aircraft damage is not presented as an estimated damaging hit",()=>{
  const target=model(); target.damageReceiver.damageMultiplier=0;
  assert.notEqual(outlineFor(shot(target)),"actor-damage-estimate");
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
