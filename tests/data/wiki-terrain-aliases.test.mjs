import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {assertAppendOnlyGroundedPoseAliases} from '../../lib/grounded-pose-model-aliases.ts';

const generatedClass='/vehicle';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const model=letter=>`/assets/runtime-probe/models/${letter.repeat(64)}.gltf`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function flat(){return {
  schemaVersion:'sigua-vehicle-grounded-pose/v1',sourceBuildId:'build',generatedClass,
  basis:'gltf-y-up-metres-parent-local',admission:'rendered-physics-three-stable-samples',
  chassis:{gltfMatrix:[...identity],pitchDeg:0,rollDeg:0,heightAbovePlaneCm:0},
  rigs:[{boneNames:['wheel'],localMatrices:[...identity]},{boneNames:['panel'],localMatrices:[...identity]}],
  bindings:[{stableOccurrenceId:'body',assetUrl:model('a'),sourceMeshPath:'/mesh',rigIndex:0},
    {stableOccurrenceId:'panel',assetUrl:model('b'),sourceMeshPath:'/panel',rigIndex:1}],
  provenance:{method:'historical-observation',detail:{retained:true}},
};}
function aliases(reference){const current=structuredClone(reference);current.bindings.push({...current.bindings[0],assetUrl:model('c')});return current;}

test('only new model URLs append to the exact original binding and complete pose',()=>{
  for(const admission of ['rendered-physics-three-stable-samples','source-solved-flat-rest']) {
    const reference=flat();reference.admission=admission;
    if(admission==='source-solved-flat-rest')reference.derivation={method:'ue-source-grounded/v1',inputsSha256:'1'.repeat(64),implementationSha256:'2'.repeat(64),comparisonSha256:'3'.repeat(64)};
    const before=structuredClone(reference),current=aliases(reference),currentBefore=structuredClone(current);
    assert.doesNotThrow(()=>assertAppendOnlyGroundedPoseAliases(reference,current,generatedClass));
    assert.deepEqual(reference,before);assert.deepEqual(current,currentBefore);
  }
});

test('rig, matrix, source, build, order and unknown-field changes cannot ride an alias',()=>{
  const changes={
    'rig name':p=>p.rigs[0].boneNames[0]='different',
    'joint matrix':p=>p.rigs[0].localMatrices[12]=.000001,
    'chassis matrix':p=>p.chassis.gltfMatrix[13]=.000001,
    'signed zero':p=>p.rigs[0].localMatrices[12]=-0,
    'source mesh':p=>p.bindings.at(-1).sourceMeshPath='/different',
    'occurrence':p=>p.bindings.at(-1).stableOccurrenceId='different',
    'rig association':p=>p.bindings.at(-1).rigIndex=1,
    'build':p=>p.sourceBuildId='different',
    'class':p=>p.generatedClass='/different',
    'old binding':p=>p.bindings[0].assetUrl=model('d'),
    'old order':p=>[p.bindings[0],p.bindings[1]]=[p.bindings[1],p.bindings[0]],
    'removed old binding':p=>p.bindings.splice(1,1),
    'duplicate alias':p=>p.bindings.push({...p.bindings.at(-1)}),
    'extra alias metadata':p=>p.bindings.at(-1).newAuthority=true,
    'unknown nested field':p=>p.provenance.detail.retained=false,
    'new record field':p=>p.currentBuildRenewed=true,
  };
  for(const [label,change] of Object.entries(changes)) {
    const reference=flat(),current=aliases(reference);change(current);
    assert.throws(()=>assertAppendOnlyGroundedPoseAliases(reference,current,generatedClass),undefined,label);
  }
  assert.throws(()=>assertAppendOnlyGroundedPoseAliases(flat(),flat(),generatedClass));
});

function terrain(flatSha){return {
  schemaVersion:'sigua-vehicle-terrain-poses/v1',sourceBuildId:'build',generatedClass,
  method:'quasi-static-vertical-reactions/v1',basis:'gltf-y-up-metres-parent-local',flatReferenceSha256:flatSha,
  scene:{id:'narva-school',sourceBuildId:'build',anchorSourceCm:[0,0,0],
    query:{url:'/data/maps/narva/native-query.json',sha256:hash('query')},
    display:{url:'/data/maps/narva/school-display.json',sha256:hash('display')}},
  presets:[{id:'east',label:'East',originSourceCm:[0,0,0],chassis:{gltfMatrix:[...identity],pitchDeg:0,rollDeg:0},
    rigs:flat().rigs,bindings:flat().bindings,result:{status:'friction-unknown',bodyCoverage:'complete',blocked:false,
      bodyShapeCount:12,relativeResidual:1e-6,maxPenetrationM:0,supportMarginM:1,activeSupports:7,totalSupports:8,stationaryCandidate:false}}],
};}
function record(payload,domain){const sha256=hash(payload);return {url:`/data/vehicles/${domain}/v1/records/${sha256}.json`,sha256,bytes:Buffer.byteLength(payload)};}

test('terrain aliases require hash-verified original, current flat and both original scene files',async()=>{
  const originalFetch=globalThis.fetch;
  try {
    for(const mode of ['aliases','historical-flat-build','original-corrupt','current-corrupt','current-size','scene-corrupt','matrix-changed','build-changed','unavailable']) {
      const reference=flat(),current=aliases(reference);
      // Flat capture and derived terrain have independently recorded build IDs.
      // The original flat bytes are bound by SHA, not by equal display labels.
      if(mode==='historical-flat-build')reference.sourceBuildId=current.sourceBuildId='historical-flat-build';
      if(mode==='matrix-changed')current.rigs[0].localMatrices[12]=.000001;
      if(mode==='build-changed')current.sourceBuildId='different';
      const originalPayload=JSON.stringify(reference),originalRef=record(originalPayload,'grounded-poses');
      const currentPayload=JSON.stringify(current),currentRef=record(currentPayload,'grounded-poses');
      if(mode==='current-size')currentRef.bytes++;
      const set=terrain(originalRef.sha256),terrainPayload=JSON.stringify(set),terrainRef=record(terrainPayload,'terrain-poses');
      const paths=[];
      globalThis.fetch=async url=>{
        const path=new URL(url).pathname;paths.push(path);
        if(path==='/data/vehicles/terrain-poses/v1/catalog.json')return Response.json({schemaVersion:'sigua-vehicle-terrain-poses-index/v1',sourceBuildId:'build',vehicles:[{generatedClass,record:terrainRef}]});
        if(path==='/data/vehicles/grounded-poses/v1/catalog.json')return Response.json({schemaVersion:'sigua-vehicle-grounded-pose-index/v1',sourceBuildId:current.sourceBuildId,vehicles:[{generatedClass,status:mode==='unavailable'?'unavailable':'observed',record:currentRef}]});
        if(path===terrainRef.url)return new Response(terrainPayload);
        if(path===originalRef.url)return new Response(originalPayload+(mode==='original-corrupt'?' ':''));
        if(path===currentRef.url)return new Response(currentPayload+(mode==='current-corrupt'?' ':''));
        if(path===set.scene.query.url)return new Response(mode==='scene-corrupt'?'changed':'query');
        if(path===set.scene.display.url)return new Response('display');
        throw Error(path);
      };
      const {loadWikiVehicleTerrainPoses}=await import(`../../lib/wiki-source.ts?terrain-alias=${mode}`);
      if(mode==='aliases'||mode==='historical-flat-build') {
        assert.deepEqual(await loadWikiVehicleTerrainPoses(generatedClass),set);
        for(const path of [originalRef.url,currentRef.url,set.scene.query.url,set.scene.display.url])assert.ok(paths.includes(path),path);
      } else await assert.rejects(loadWikiVehicleTerrainPoses(generatedClass),undefined,mode);
    }
  } finally {globalThis.fetch=originalFetch;}
});
