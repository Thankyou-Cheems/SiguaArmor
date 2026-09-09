import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {validateRuntimeGroundedPose,groundedPoseLocalMatrices} from '../../lib/runtime-grounded-pose.ts';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const generatedClass='/Game/Vehicle.BP_C';
const binding={stableOccurrenceId:'body',assetUrl:`/assets/runtime-probe/models/${'a'.repeat(64)}.gltf`,sourceMeshPath:'/Game/Mesh.Mesh',rigIndex:0};
function pose(){return {schemaVersion:'sigua-vehicle-grounded-pose/v1',sourceBuildId:'build-a',generatedClass,
  basis:'gltf-y-up-metres-parent-local',admission:'rendered-physics-three-stable-samples',
  chassis:{gltfMatrix:[...identity],pitchDeg:0,rollDeg:0,heightAbovePlaneCm:0},
  rigs:[{boneNames:['wheel_L2'],localMatrices:[...identity]}],bindings:[{...binding}]};}

test('rendered pose requires exact class, model bytes, occurrence and source mesh',()=>{
  const p=validateRuntimeGroundedPose(pose(),generatedClass);
  assert.deepEqual(groundedPoseLocalMatrices(p,generatedClass,binding),{wheel_L2:identity});
  for(const field of ['stableOccurrenceId','assetUrl','sourceMeshPath']) {
    assert.equal(groundedPoseLocalMatrices(p,generatedClass,{...binding,[field]:'different'}),undefined);
  }
  assert.equal(groundedPoseLocalMatrices(p,'other class',binding),undefined);
  assert.throws(()=>validateRuntimeGroundedPose(p,'other class'));
  for(const corrupt of [p=>p.rigs[0].localMatrices.fill(0),p=>p.chassis.gltfMatrix[3]=1,
    p=>p.rigs[0].localMatrices[0]=NaN,p=>p.bindings.push({...binding}),p=>p.bindings[0].rigIndex=1]) {
    const invalid=pose();corrupt(invalid);assert.throws(()=>validateRuntimeGroundedPose(invalid,generatedClass));
  }
});

test('Wiki loader verifies bytes and build before admitting an immutable record',async()=>{
  const original=globalThis.fetch;
  try {
    for(const mode of ['valid','altered','wrong-size','wrong-build','duplicate','unavailable']) {
      const payload=JSON.stringify(pose()),hash=createHash('sha256').update(payload).digest('hex');
      const record={url:`/data/vehicles/grounded-poses/v1/records/${hash}.json`,sha256:hash,bytes:Buffer.byteLength(payload)+(mode==='wrong-size'?1:0)};
      const row={generatedClass,status:mode==='unavailable'?'unavailable':'observed',record};
      const catalog={schemaVersion:'sigua-vehicle-grounded-pose-index/v1',sourceBuildId:mode==='wrong-build'?'other-build':'build-a',vehicles:mode==='duplicate'?[row,row]:[row]};
      let recordRequests=0;
      globalThis.fetch=async url=>{
        if(String(url).endsWith('/catalog.json'))return new Response(JSON.stringify(catalog));
        assert.ok(String(url).endsWith(record.url));recordRequests++;
        return new Response(mode==='altered'?payload+' ':payload);
      };
      const {loadWikiVehicleGroundedPose}=await import(`../../lib/wiki-source.ts?integrity=${mode}`);
      if(mode==='valid') {
        assert.deepEqual(await loadWikiVehicleGroundedPose(generatedClass),pose());
        await loadWikiVehicleGroundedPose(generatedClass);assert.equal(recordRequests,1);
      } else if(mode==='duplicate'||mode==='unavailable') {
        assert.equal(await loadWikiVehicleGroundedPose(generatedClass),null);assert.equal(recordRequests,0);
      } else { await assert.rejects(loadWikiVehicleGroundedPose(generatedClass)); }
    }
  } finally {globalThis.fetch=original;}
});
