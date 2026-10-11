// Synthetic inputs passed through the real preview/pose/station/view validators.
import assert from "node:assert/strict";
export const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0.45,0,1];
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const sourceRef='vehicle-0123456789abcdef01234567', runtimeRef=`vehicle-${'b'.repeat(64)}`, generatedClass='/Game/Test/BP_Test.BP_Test_C';
const rawName='BP_Test', artifact='visual-test', assetUrl=`/assets/runtime-probe/models/${'c'.repeat(64)}.gltf`, revision='a'.repeat(64);
function fixture(cardId) {
 const graphPointer={id:`station-graph-${sourceRef.slice(8)}`,formatVersion:'sigua-vehicle-station-graph/v1',sourceVehicleRef:sourceRef,recordUrl:`/data/vehicles/station-graphs/${sourceRef}.json`};
 const owner={cardId,rawName,runtimeVehicleRef:runtimeRef,edition:'international',visualArtifactRef:artifact};
 const transform={translationCm:{x:20,y:30,z:120},rotationQuaternion:{x:0,y:0,z:0,w:1},scale3D:{x:1,y:1,z:1}};
 return {
  runtime:{source:{cardId},variants:[{rawName,runtimeVehicleRef:runtimeRef,generatedClass,chassisPose:null,suspension:{records:[],coverage:null},visualArtifacts:{international:{id:artifact,generatedClass,placementCount:1}},hit:null,radialQuery:null,crewSeat:null,visualAttachment:null,stationGraph:graphPointer}]},
  visual:{edition:'international',runtimeVehicleRef:runtimeRef,generatedClass,status:'complete',visualAcceptanceStatus:'web-usable',webUsable:true,reason:'controlled fixture',totalBytes:100,placements:[{stableOccurrenceId:'body',actor:'BP_Test_C_0',name:'Vehicle Mesh',assetUrl,matrix:identity,sourceMeshPath:'/Game/Test/Body',componentClassPath:'/Script/Engine.SkeletalMeshComponent',materialState:'runtime-effective-bindings-baked-parameters-unresolved',runtimeBonePoseStatus:'observed'}]},
  graph:{schemaVersion:'sigua-vehicle-station-graph/v1',sourceBuildId:'squad-sdk-v10.5.3-17c100ea5182370e',sourceDataRevision:revision,sourceVehicleRef:sourceRef,runtimeVehicleRefs:[runtimeRef],catalogBindingRefs:['binding-test'],rawName,targetPackage:'/Game/Test/BP_Test',generatedClass,evidence:{sourceDataRevision:revision,runtimeAnimationPose:'native-unknown',network:'out-of-scope',hitRelations:'unresolved-not-consumed-by-armor'},seats:[],stations:[],vehicleEquipmentRefs:[],visualBindings:[{...owner,catalogBindingRef:'binding-test',occurrences:[],stationClosures:[]}]},
  sight:{schemaVersion:'sigua-vehicle-gunner-sight/v1',sourceBuildId:'squad-sdk-v10.5.3-17c100ea5182370e',sourceVehicleRef:sourceRef,stationGraphDataRevision:revision,sourceDataRevision:revision,evidence:{state:'sdk-blueprint-static-projection-and-local-dynamic-binding',network:'out-of-scope',hitMechanics:'not-applicable-presentation-only',damageBlindnessMechanic:'not-claimed'},stations:[],projections:[],projectionRefs:[]},
  driver:{schemaVersion:'sigua-vehicle-driver-view/v1',sourceBuildId:'squad-sdk-v10.5.3-17c100ea5182370e',sourceVehicleRef:sourceRef,rawName,targetPackage:'/Game/Test/BP_Test',generatedClass,seatKey:`${sourceRef}:catalog-seat:1`,catalogSeatIndex:1,role:'driver',camera:{viewId:'driver-default',source:'constructed-vehicle-camera-component',componentName:'FirstPersonVehicleCam',dynamicParent:{componentName:'FirstPersonVehicleSpringArm'},vehicleLocalFrame:{state:'derived',value:transform,reason:null},baseHorizontalFovDegrees:{state:'observed',value:90},focusZoom:{fovDegrees:null,alwaysAvailable:null,maxSpeed:null}},mask:{state:'absent-no-first-person-viewport-geometry',reason:'fixture'},evidence:{sourceDataRevision:revision,network:'out-of-scope',finalRuntimeViewTarget:'native-unknown'}},
  pose:{schemaVersion:'sigua-vehicle-grounded-pose/v1',sourceBuildId:'source-build',generatedClass,basis:'gltf-y-up-metres-parent-local',admission:'rendered-physics-three-stable-samples',chassis:{gltfMatrix:matrix,pitchDeg:2,rollDeg:1,heightAbovePlaneCm:45},rigs:[{boneNames:['root'],localMatrices:identity}],bindings:[{stableOccurrenceId:'body',assetUrl,sourceMeshPath:'/Game/Test/Body',rigIndex:0}]},
 };
}
let unique=0;
export async function runPreviewWithDelays(loader, delays, mutate=()=>{}) {
 const cardId=`critical-path-${++unique}`;
 const values=fixture(cardId);mutate(values);
 let now=0, done=false, output, error; const pending=[],events=[];
 globalThis.__previewTimingHarness={load(key,args){
  events.push({key,start:now,args});
  return new Promise((resolve,reject)=>pending.push({key,due:now+(delays[key]??0),resolve,reject}));
 }};
 const request=loader(cardId,rawName,runtimeRef,artifact).then(v=>{output=v;done=true},e=>{error=e;done=true});
 const drain=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
 await drain();
 for(let step=0;!done && step<100;step++) {
  assert(pending.length,'loader must progress');
  now=Math.min(...pending.map(t=>t.due));
  for(const task of pending.filter(t=>t.due===now)){
   pending.splice(pending.indexOf(task),1);
   events.find(e=>e.key===task.key).end=now;
   values[task.key] instanceof Error ? task.reject(values[task.key]) : task.resolve(values[task.key]);
  }
  await drain();
 }
 assert(done, "loader must settle within the bounded virtual schedule");
 await request;
 // Consume remaining independent work to expose any late rejection problems.
 for(const task of pending){ values[task.key] instanceof Error ? task.reject(values[task.key]) : task.resolve(values[task.key]); }
 await drain();
 await new Promise(resolve => setImmediate(resolve));
 if(output) { output.cardId='normalized-fixture'; if(output.visualAttachment) output.visualAttachment.cardId='normalized-fixture'; }
 return {ms:now,events,output,error:error?.message.replace(/critical-path-\d+/g,"normalized-fixture")};
}
