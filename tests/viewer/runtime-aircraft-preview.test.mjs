import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle=await build({
  stdin:{contents:`export { runtimePreviewForCatalogBinding } from './app/runtime-probe-preview-data.ts'; export { fixture } from 'aircraft-fixture';`,resolveDir:fileURLToPath(new URL("../../",import.meta.url))},
  bundle:true,platform:"node",format:"esm",write:false,
  plugins:[{name:"aircraft-wiki",setup(build){
    build.onResolve({filter:/(?:wiki-source|aircraft-fixture)$/},()=>({path:"wiki",namespace:"fixture"}));
    build.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:`
      export const fixture={variant:null,descriptor:null,driverCalls:0};
      export async function loadWikiVehicleRuntimeSource(card) { return {source:{cardId:card},variants:[fixture.variant]}; }
      export async function loadWikiRuntimeVisual() { return fixture.descriptor; }
      export async function loadOptionalWikiVehicleGunnerSight() { return null; }
      export async function loadWikiVehicleDriverView() { fixture.driverCalls++; throw new Error('no aircraft driver'); }
      export async function loadWikiVehicleStationGraph() { throw new Error('no aircraft stations'); }
    `}));
  }}],
});
const {runtimePreviewForCatalogBinding:load,fixture}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
function reset() {
  const hit={id:"hit",formatVersion:"hit-scene-runtime/v1",recordUrl:"/record.json",geometryUrl:"/geometry.bin",bvhUrl:"/bvh.bin"};
  fixture.variant={rawName:"MQ9",runtimeVehicleRef:"runtime",generatedClass:"class",targetKind:"command-aircraft",
    chassisPose:null,suspension:{records:[],coverage:null},visualArtifacts:{international:{id:"visual",generatedClass:"class",placementCount:1}},
    hit,simpleHit:{...hit,id:"simple-hit",recordUrl:"/simple-record.json"},radialQuery:null,crewSeat:null,visualAttachment:null,stationGraph:null};
  fixture.descriptor={edition:"international",runtimeVehicleRef:"runtime",generatedClass:"class",status:"complete",visualAcceptanceStatus:"web-usable",webUsable:true,reason:"fixture",totalBytes:100,
    placements:[{actorName:"MQ9",componentName:"Mesh",componentClassPath:"/Script/Engine.StaticMeshComponent",stableOccurrenceId:"mq9-mesh",sourceMeshPath:"/Game/MQ9",assetUrl:"/mq9.gltf",matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}]};
}
test("aircraft loads both collision records without vehicle stations or a driver",async()=>{
  reset();
  const preview=await load("aircraft","MQ9","runtime","visual");
  assert.equal(preview.targetKind,"command-aircraft");
  assert.equal(preview.hit.recordUrl,"/record.json");
  assert.equal(preview.simpleHit.recordUrl,"/simple-record.json");
  assert.equal(preview.driverView,null); assert.equal(preview.stationGraph,null);
  assert.equal(fixture.driverCalls,0);
});
test("vehicle preview still requires its station graph and driver",async()=>{
  reset(); delete fixture.variant.targetKind;
  await assert.rejects(load("vehicle","MQ9","runtime","visual"),/driver view is missing/);
});
test("aircraft rejects a visual class mismatch and missing simple collision",async()=>{
  reset(); fixture.descriptor.generatedClass="other-class";
  await assert.rejects(load("mismatch","MQ9","runtime","visual"),/visual mapping differs/);
  reset(); fixture.variant.simpleHit=null;
  await assert.rejects(load("missing-simple","MQ9","runtime","visual"),/aircraft receiver mapping is invalid/);
});
