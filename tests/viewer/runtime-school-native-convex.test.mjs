import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {raycastSchoolConvex} from '../../lib/runtime-school-native-convex.ts';
import {createSchoolQuery} from '../../lib/runtime-narva-school-query.ts';
const cube=[1,0,0,1,0,0,-1,0,0,-1,0,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,0,1,0,0,1,0,0,-1,0,0,-1];
const profile={sourceMaterialSlot:0,physicalMaterialPath:'fixture',armorThicknessMm:3,considerForPenetration:true,allowPenetration:true,damageAbsorbed:0};
test('native convex ray returns entry, preserves starts-inside and rejects a parallel exterior',()=>{
 const x=new T.Vector3(1,0,0);
 assert.equal(raycastSchoolConvex(cube,new T.Vector3(-3,0,0),x,10).distance,2);
 const inside=raycastSchoolConvex(cube,new T.Vector3(),x,10);
 assert.equal(inside.distance,0);assert.deepEqual(inside.normal.toArray(),[-1,-0,-0]);
 assert.equal(raycastSchoolConvex(cube,new T.Vector3(-3,2,0),x,10),null);
 assert.equal(raycastSchoolConvex(cube,new T.Vector3(-3,0,0),x,1),null);
});
test('coincident native hulls retain two shape identities even without legacy simple triangles',()=>{
 const query=createSchoolQuery([{id:'wall',label:'wall',simple:null,complex:null,movementKind:'simple',matrix:new T.Matrix4(),surface:p=>p,simpleSurface:profile,
  nativeConvexes:[2,3].map(elementIndex=>({elementIndex,planes:cube,matrix:new T.Matrix4()}))}]);
 const hits=query.raycast(new T.Vector3(-3,0,0),new T.Vector3(1,0,0),10,undefined,'simple');
 assert.deepEqual(hits.map(h=>h.elementIndex),[2,3]);assert.deepEqual(hits.map(h=>h.distanceM),[2,2]);
});
test('cooked triangle queries cull backfaces and retain one nearest hit per native mesh',()=>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([1,-2,-2,1,2,-2,1,0,2,2,-2,-2,2,2,-2,2,0,2],3));
 geometry.setIndex([0,2,1,3,5,4]);geometry.computeBoundingBox();
 const complex={geometry,tree:new MeshBVH(geometry,{indirect:true}),profiles:[profile],profileIndices:new Uint16Array([0,0]),normals:new Float32Array([-1,0,0,-1,0,0]),nativeCooked:{cullsBackFace:true,externalFaceIndices:new Int32Array([17,31]),elementIndex:4}};
 const query=createSchoolQuery([{id:'wall',label:'wall',simple:null,complex,movementKind:'complex',matrix:new T.Matrix4(),surface:p=>p,isInstanced:false}]);
 const hits=query.raycast(new T.Vector3(),new T.Vector3(1,0,0),5);
 assert.equal(hits.length,1);assert.equal(hits[0].externalFaceIndex,17);assert.equal(hits[0].distanceM,1);
 assert.equal(query.raycast(new T.Vector3(3,0,0),new T.Vector3(-1,0,0),5).length,0);
});

test('native parallel sphere contact admits initial overlap but rejects a later edge entry',()=>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([-2,-2,0,2,-2,0,0,2,0],3));
 geometry.setIndex([0,1,2]);geometry.computeBoundingBox();
 const complex={geometry,tree:new MeshBVH(geometry,{indirect:true}),profiles:[profile],profileIndices:new Uint16Array([0]),normals:new Float32Array([0,0,1]),nativeCooked:{cullsBackFace:true,externalFaceIndices:new Int32Array([0]),elementIndex:0}};
 const query=createSchoolQuery([{id:'face',label:'face',simple:null,complex,movementKind:'complex',matrix:new T.Matrix4(),surface:p=>p}]);
 const sweep=x=>query.sweepSphere({startCm:{x,y:10,z:0},endCm:{x:300,y:10,z:0},sphereRadiusCm:50});
 assert.equal(sweep(0).timeFraction,0);
 assert.equal(sweep(-300),null);
});
