import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { decodeSchoolQueryPacket } from "./runtime-school-query-packet.ts";
import { createSchoolQuery, schoolQueryPlacementMatrix, type SchoolCollision, type SchoolSurfaceProfile, type SchoolQueryPlacement, type SchoolRayHit } from "./runtime-narva-school-query.ts";
import { fetchNarvaSchoolResource } from "./runtime-narva-school-environment.ts";
import type { NativeMeshTree, NativeSchoolPose } from "./runtime-school-native-ray.ts";
import type { NativeTraceReceiver } from "./editor-native-hit-state.ts";
import type { SchoolNativeConvex } from "./runtime-school-native-convex.ts";

type Resource={url:string;bytes:number};
type XYZ={X:number;Y:number;Z:number};
type PrimitiveTransform={Translation:XYZ;Rotation:XYZ&{W:number};Scale3D:XYZ};
type Metadata={prototypeId:string;cullsBackFace:boolean;placementSupport:{geometryKind:"simple"|"complex"};
  surfaceProfiles:{complex:SchoolSurfaceProfile[]};
  primitives:{boxes:Array<{Center:XYZ;Rotation:{Roll:number;Pitch:number;Yaw:number};X:number;Y:number;Z:number;CollisionEnabled:string}>;
  convexes:Array<{queryEnabled:boolean;index:number;planes:number[];transform:PrimitiveTransform}>}};
export type NativeSchoolManifest={schemaVersion:"sigua-school-native-query/v1";sourceBuildId:string;
  anchorSourceCm:[number,number,number];
  boundsSourceCm:[number,number,number,number];
  prototypes:Array<Resource&{prototypeId:string}>;
  placements:Array<{stableId:number;prototypeId:string;nativePose:NativeSchoolPose;actorId:string;isInstanced:boolean;simpleMaterial:string;
    surfaceBindings:Array<{slotIndex:number;physicalMaterialPath:string}>}>;
  actors:NativeTraceReceiver[];physicalMaterials:Record<string,Omit<SchoolSurfaceProfile,"sourceMaterialSlot"|"physicalMaterialPath">>;
  terrain:Resource;
};
type TerrainMeta={components:Array<{id:string;translationCm:[number,number,number];originCell:[number,number];width:number;height:number;
  receiver:NativeTraceReceiver;profiles:SchoolSurfaceProfile[]}>};

function collision(positions:Float32Array,indices:Uint16Array|Uint32Array,profileIndices:Uint16Array|Uint32Array,profiles:SchoolSurfaceProfile[]):SchoolCollision {
  if (!positions.length || positions.length%3 || !indices.length || indices.length%3 || profileIndices.length!==indices.length/3 || indices.some(i=>i>=positions.length/3) || profileIndices.some(i=>i>=profiles.length)) throw new Error("Incomplete school topology/materials");
  const geometry=new THREE.BufferGeometry().setAttribute("position",new THREE.BufferAttribute(positions,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();
  const normals=new Float32Array(indices.length),triangle=new THREE.Triangle(),normal=new THREE.Vector3();
  for (let i=0;i<indices.length;i+=3) {
    triangle.a.fromArray(positions,indices[i]*3);triangle.b.fromArray(positions,indices[i+1]*3);triangle.c.fromArray(positions,indices[i+2]*3);
    triangle.getNormal(normal).toArray(normals,i);
  }
  return {geometry,tree:new MeshBVH(geometry,{indirect:true}),normals,profiles,profileIndices};
}

export function schoolNativePrototype(buffer:ArrayBuffer) {
  const {metadata,arrays}=decodeSchoolQueryPacket(buffer),meta=metadata as Metadata;
  const profiles=meta.surfaceProfiles.complex.filter(p=>p.sourceMaterialSlot>=0);
  const profileIndices=new Uint16Array(Array.from(arrays.materialIndices,slot=>profiles.findIndex(p=>p.sourceMaterialSlot===slot)));
  const complex=collision(arrays.positionsCm as Float32Array,arrays.indices as Uint16Array|Uint32Array,profileIndices,profiles);
  const {bounds,children,counts}=arrays;
  if (bounds.length%12 || children.length!==bounds.length/6 || counts.length!==children.length) throw new Error("Invalid native BVH arrays");
  const tree:NativeMeshTree={nodes:Array.from({length:bounds.length/12},(_,i)=>({bounds:[Array.from(bounds.subarray(i*12,i*12+6)),Array.from(bounds.subarray(i*12+6,i*12+12))],children:[children[i*2],children[i*2+1]],counts:[counts[i*2],counts[i*2+1]]}))};
  const seen=new Set<number>(),faces=new Set<number>(),stack=[0],ranks=new Uint32Array(profileIndices.length);
  while (stack.length) {
    const index=stack.pop()!;
    if (seen.has(index)||!tree.nodes[index]) throw new Error("Invalid native BVH graph");seen.add(index);
    const node=tree.nodes[index];
    for (let side=0;side<2;side++) {
      const child=node.children[side],count=node.counts[side];
      if (child<0) {if (count) throw new Error("Invalid native leaf");continue;}
      if (!count) stack.push(child);
      else for (let face=child;face<child+count;face++) {
        if (face>=ranks.length||faces.has(face)) throw new Error("Invalid native face coverage");ranks[face]=faces.size;faces.add(face);
      }
    }
  }
  if (seen.size!==tree.nodes.length||faces.size!==ranks.length||arrays.externalFaceIndices.length!==ranks.length) throw new Error("Incomplete native BVH");
  const primitives=meta.primitives,nativeConvexes:SchoolNativeConvex[]=[];
  for (const [elementIndex,b] of primitives.boxes.entries()) {
    if (!["QueryOnly","QueryAndPhysics"].includes(b.CollisionEnabled)) continue;
    const planes:number[]=[];
    for (let axis=0;axis<3;axis++) for (const sign of [-1,1]) {const p=[0,0,0],n=[0,0,0];p[axis]=[b.X,b.Y,b.Z][axis]*sign/2;n[axis]=sign;planes.push(...p,...n);}
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-b.Rotation.Roll*Math.PI/180,-b.Rotation.Pitch*Math.PI/180,b.Rotation.Yaw*Math.PI/180,"ZYX"));
    nativeConvexes.push({elementIndex,planes,isBox:true,matrix:new THREE.Matrix4().compose(new THREE.Vector3(b.Center.X,b.Center.Y,b.Center.Z),q,new THREE.Vector3(1,1,1))});
  }
  for (const c of primitives.convexes) if (c.queryEnabled) {
    const t=c.transform;
    nativeConvexes.push({elementIndex:primitives.boxes.length+c.index,planes:c.planes,matrix:new THREE.Matrix4().compose(new THREE.Vector3(t.Translation.X,t.Translation.Y,t.Translation.Z),new THREE.Quaternion(t.Rotation.X,t.Rotation.Y,t.Rotation.Z,t.Rotation.W),new THREE.Vector3(t.Scale3D.X,t.Scale3D.Y,t.Scale3D.Z))});
  }
  complex.nativeCooked={cullsBackFace:meta.cullsBackFace,externalFaceIndices:arrays.externalFaceIndices as Int32Array,elementIndex:primitives.boxes.length+primitives.convexes.length,triangleVisitRanks:ranks,nativeTree:tree};
  return {meta,complex,nativeConvexes};
}

export function schoolNativeTerrain(buffer:ArrayBuffer):SchoolQueryPlacement[] {
  const {metadata,arrays}=decodeSchoolQueryPacket(buffer),meta=metadata as TerrainMeta;
  return meta.components.map((c,k)=>{
    const {width:w,height:h}=c,heights=arrays[`heights${k}`],materials=arrays[`materials${k}`];
    if (!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<2||h<2||w*h>100000||heights.length!==w*h) throw new Error("Invalid heightfield grid");
    const positions=new Float32Array(w*h*3),indices=new Uint32Array((w-1)*(h-1)*6),external=new Int32Array(indices.length/3);
    for (let i=0;i<w*h;i++) positions.set([(c.originCell[0]+i%w)*100,(c.originCell[1]+Math.floor(i/w))*100,heights[i]],i*3);
    let n=0;
    for (let y=0;y<h-1;y++) for (let x=0;x<w-1;x++) {const a=y*w+x;indices.set([a,a+1,a+w+1,a,a+w+1,a+w],n*3);const face=2*((y+c.originCell[1])*254+x+c.originCell[0]);external[n++]=face;external[n++]=face+1;}
    const ground=collision(positions,indices,materials as Uint16Array,c.profiles);
    ground.nativeCooked={cullsBackFace:false,externalFaceIndices:external,elementIndex:0};
    const pose:NativeSchoolPose={translationCm:c.translationCm,rotationQuaternion:[0,0,0,1],scale3d:[1,1,1]};
    const matrix=new THREE.Matrix4().set(.01,0,0,c.translationCm[0]/100,0,0,.01,c.translationCm[2]/100,0,.01,0,c.translationCm[1]/100,0,0,0,1);
    return {id:c.id,label:"地形",simple:ground,complex:ground,movementKind:"simple",matrix,surface:s=>s,receiver:c.receiver,nativePose:pose,nativeHeightfield:true};
  });
}

export function schoolNativePlacements(manifest:NativeSchoolManifest,packets:Map<string,ArrayBuffer>,terrain:ArrayBuffer) {
  if (manifest.schemaVersion!=="sigua-school-native-query/v1"||manifest.sourceBuildId!=="squad-sdk-v10.5.3-d341d671c7d80407"||manifest.placements.length!==79) throw new Error("Unsupported school query source");
  const models=new Map(manifest.prototypes.map(p=>{const parsed=schoolNativePrototype(packets.get(p.prototypeId)!);if(parsed.meta.prototypeId!==p.prototypeId)throw new Error("School prototype mismatch");return [p.prototypeId,parsed] as const;}));
  const material=(path:string,slot=0):SchoolSurfaceProfile=>{const p=manifest.physicalMaterials[path];if(!p)throw new Error("Missing native material");return {...p,sourceMaterialSlot:slot,physicalMaterialPath:path};};
  const rows:SchoolQueryPlacement[]=manifest.placements.map(p=>{
    const model=models.get(p.prototypeId),receiver=manifest.actors.find(a=>a.actorId===p.actorId);
    if (!model||!receiver) throw new Error("Missing native school binding");
    const placement={stableId:p.stableId,prototypeId:p.prototypeId,sourceTransform:{translationMeters:p.nativePose.translationCm.map(v=>v/100) as [number,number,number],rotationQuaternion:p.nativePose.rotationQuaternion,scale3d:p.nativePose.scale3d}};
    return {id:String(p.stableId),label:model.meta.prototypeId,simple:null,complex:model.complex,nativeConvexes:model.nativeConvexes,
      simpleSurface:material(p.simpleMaterial),movementKind:model.meta.placementSupport.geometryKind,
      matrix:schoolQueryPlacementMatrix(placement,{sourceCenterMeters:{x:0,y:0},sourceBaseZMeters:0,scale:100},[0,0,0]),
      surface:s=>{const binding=p.surfaceBindings.find(b=>b.slotIndex===s.sourceMaterialSlot);if(!binding)throw new Error("Missing material slot");return material(binding.physicalMaterialPath,s.sourceMaterialSlot);},
      isInstanced:p.isInstanced,nativePose:p.nativePose,receiver};
  });
  rows.push(...schoolNativeTerrain(terrain));
  return rows;
}

export function assembleSchoolNativeQuery(manifest:NativeSchoolManifest,packets:Map<string,ArrayBuffer>,terrain:ArrayBuffer) {
  const raw=createSchoolQuery(schoolNativePlacements(manifest,packets,terrain)),anchor=manifest.anchorSourceCm;
  const shifted=(offset=new THREE.Vector3())=>offset.clone().sub(new THREE.Vector3(anchor[0]/100,anchor[2]/100,anchor[1]/100));
  const bounds=manifest.boundsSourceCm;
  if (!bounds || bounds.length!==4 || !bounds.every(Number.isFinite) || bounds[0]>=bounds[2] || bounds[1]>=bounds[3]) throw new Error("Missing school query coverage");
  const boundary=(start:THREE.Vector3,end:THREE.Vector3,offset?:THREE.Vector3):SchoolRayHit|null=>{
    const a=raw.toSourcePointCm(start,shifted(offset)),b=raw.toSourcePointCm(end,shifted(offset));
    const t=schoolCoverageExit(a,b,bounds);
    if (t===null) return null;
    const point=start.clone().lerp(end,t),normal=start.clone().sub(end).normalize();
    return {componentId:"school-query-boundary",label:"学校场景边界",triangleIndex:-1,surfaceProfileIndex:0,
      surface:{sourceMaterialSlot:0,physicalMaterialPath:null,armorThicknessMm:null,considerForPenetration:null,allowPenetration:null,damageAbsorbed:null},
      point,distanceM:start.distanceTo(point),faceNormal:normal,incidenceFactor:1,
      sourcePointCm:a.map((v,i)=>v+(b[i]-v)*t) as [number,number,number],queryUncertainty:"超出学校场景查询范围"};
  };
  return {...raw,toSourcePointCm:(point:THREE.Vector3,offset?:THREE.Vector3)=>raw.toSourcePointCm(point,shifted(offset)),
    raycast:(...args:Parameters<typeof raw.raycast>)=>raw.raycast(args[0],args[1],args[2],shifted(args[3]),args[4],args[5]),
    postImpact:(...args:Parameters<typeof raw.postImpact>)=>{
      const hits=raw.postImpact(args[0],args[1],args[2],shifted(args[3]),args[4]);
      const edge=boundary(args[0],args[0].clone().addScaledVector(args[1].clone().normalize(),args[2]),args[3]);
      return edge ? [...hits.filter(r=>r.hit.distanceM<edge.distanceM),{hit:edge,exit:null}] : hits;
    },
    sweepSphere:(...args:Parameters<typeof raw.sweepSphere>)=>{
      const hit=raw.sweepSphere(args[0],shifted(args[1]),args[2]);
      const v=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x/100,p.z/100,p.y/100);
      const start=v(args[0].startCm),end=v(args[0].endCm),edge=boundary(start,end,args[1]);
      const time=edge ? edge.distanceM/start.distanceTo(end) || 0 : Infinity;
      if (!edge || hit && hit.timeFraction<=time) return hit;
      const normal={x:edge.faceNormal.x,y:edge.faceNormal.z,z:edge.faceNormal.y};
      return {timeFraction:time,normal,impactNormal:normal,sceneHit:edge};
    }};
}

/** The published rectangle is the authority boundary; the 2 m terrain guard
 * supports edge queries, but does not turn absent neighboring buildings into air. */
export function schoolCoverageExit(start:readonly number[],end:readonly number[],bounds:readonly number[]):number|null {
  let exit=Infinity;
  for (let axis=0;axis<2;axis++) {
    if (start[axis]<bounds[axis] || start[axis]>bounds[axis+2]) return 0;
    const delta=end[axis]-start[axis];
    if (end[axis]<bounds[axis]) exit=Math.min(exit,(bounds[axis]-start[axis])/delta);
    if (end[axis]>bounds[axis+2]) exit=Math.min(exit,(bounds[axis+2]-start[axis])/delta);
  }
  return Number.isFinite(exit)?exit:null;
}

export async function loadSchoolNativeQuery() {
  const manifest=await (await fetchNarvaSchoolResource("/data/maps/narva/native-query.json")).json() as NativeSchoolManifest;
  if (manifest.schemaVersion!=="sigua-school-native-query/v1"||manifest.prototypes?.length!==24||manifest.placements?.length!==79) throw new Error("Incomplete school manifest");
  const buffers=new Map<string,ArrayBuffer>();let next=0;
  const read=async(r:Resource)=>{if(!r.url.startsWith("/assets/maps/narva/native-query/")||!Number.isSafeInteger(r.bytes)||r.bytes<=0||r.bytes>16*1024*1024)throw new Error("Invalid school resource");const b=await(await fetchNarvaSchoolResource(r.url)).arrayBuffer();if(b.byteLength!==r.bytes)throw new Error("Incomplete school resource");return b;};
  const [terrain]=await Promise.all([read(manifest.terrain),Promise.all(Array.from({length:4},async()=>{while(next<manifest.prototypes.length){const p=manifest.prototypes[next++];buffers.set(p.prototypeId,await read(p));}}))]);
  return assembleSchoolNativeQuery(manifest,buffers,terrain);
}
