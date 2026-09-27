import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {validateTerrainPoseSet,terrainPoseLocalMatrices,terrainEnvironmentOffset} from '../../lib/runtime-terrain-pose.ts';
import {validateRuntimeGroundedPose} from '../../lib/runtime-grounded-pose.ts';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const binding={stableOccurrenceId:'body',assetUrl:`/assets/runtime-probe/models/${'a'.repeat(64)}.gltf`,sourceMeshPath:'/mesh',rigIndex:0};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){return {schemaVersion:'sigua-vehicle-terrain-poses/v1',sourceBuildId:'build',generatedClass:'/vehicle',method:'quasi-static-vertical-reactions/v1',basis:'gltf-y-up-metres-parent-local',flatReferenceSha256:hash('flat'),scene:{id:'narva-school',sourceBuildId:'build',anchorSourceCm:[13500,-51500,200],query:{url:'/data/maps/narva/native-query.json',sha256:hash('query')},display:{url:'/data/maps/narva/school-display.json',sha256:hash('display')}},presets:[{id:'east',label:'East',originSourceCm:[18000,-53000,300],chassis:{gltfMatrix:identity,pitchDeg:12,rollDeg:4},rigs:[{boneNames:['Wheel_L1'],localMatrices:identity}],bindings:[binding],result:{status:'friction-unknown',bodyCoverage:'complete',blocked:false,bodyShapeCount:12,relativeResidual:1e-6,maxPenetrationM:0,supportMarginM:1,activeSupports:7,totalSupports:8,stationaryCandidate:false}}]};}
test('terrain has separate authority and exact model occurrence bindings',()=>{
 const set=validateTerrainPoseSet(fixture(),'/vehicle'),pose=set.presets[0];
 assert.throws(()=>validateRuntimeGroundedPose(set,'/vehicle'));
 assert.deepEqual(terrainPoseLocalMatrices(pose,binding),{Wheel_L1:identity});
 for(const field of ['assetUrl','sourceMeshPath','stableOccurrenceId'])assert.equal(terrainPoseLocalMatrices(pose,{...binding,[field]:'changed'}),undefined);
 assert.deepEqual(terrainEnvironmentOffset(set,pose),[-45,-1,15]);
 for(const corrupt of [s=>s.presets[0].result.blocked=true,s=>s.presets[0].result.bodyCoverage='unknown',s=>s.presets[0].result.stationaryCandidate=true,s=>s.presets[0].result.relativeResidual=.001,s=>s.presets[0].rigs[0].localMatrices[15]=0,s=>s.presets.push(s.presets[0]),s=>s.generatedClass='/other']){const invalid=structuredClone(fixture());corrupt(invalid);assert.throws(()=>validateTerrainPoseSet(invalid,'/vehicle'));}
});
test('a changed scene or current flat reference prevents terrain admission',async()=>{
 const original=globalThis.fetch;
 try{for(const mode of ['valid','scene-changed','reference-changed','corrupt-record']){
  const set=fixture(),payload=JSON.stringify(set),sha=hash(payload),ref={url:`/data/vehicles/terrain-poses/v1/records/${sha}.json`,sha256:sha,bytes:Buffer.byteLength(payload)};
  globalThis.fetch=async url=>{
   const p=new URL(url).pathname;
   if(p==='/data/vehicles/terrain-poses/v1/catalog.json')return new Response(JSON.stringify({schemaVersion:'sigua-vehicle-terrain-poses-index/v1',sourceBuildId:'build',vehicles:[{generatedClass:'/vehicle',record:ref}]}));
   if(p==='/data/vehicles/grounded-poses/v1/catalog.json')return new Response(JSON.stringify({vehicles:[{generatedClass:'/vehicle',record:{sha256:mode==='reference-changed'?'f'.repeat(64):set.flatReferenceSha256}}]}));
   if(p===ref.url)return new Response(payload+(mode==='corrupt-record'?' ':''));
   if(p===set.scene.query.url)return new Response(mode==='scene-changed'?'new':'query');
   if(p===set.scene.display.url)return new Response('display');
   if(p.includes('/grounded-poses/'))return new Response('flat');
   throw Error(p);
  };
  const {loadWikiVehicleTerrainPoses}=await import(`../../lib/wiki-source.ts?terrain-test=${mode}`);
  if(mode==='valid')assert.deepEqual(await loadWikiVehicleTerrainPoses('/vehicle'),set);
  else await assert.rejects(loadWikiVehicleTerrainPoses('/vehicle'));
 }}finally{globalThis.fetch=original;}
});
