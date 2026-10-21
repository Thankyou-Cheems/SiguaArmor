import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareSchoolDisplay, schoolWorldMatrix} from '../../lib/runtime-school-resource-environment.ts';
import {createNarvaSchoolEnvironment, setNarvaSchoolInspectionTone} from '../../lib/runtime-narva-school-environment.ts';

const triangle = () => ({positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),colorsRgb:new Uint8Array(9).fill(255),indices:new Uint32Array([0,1,2])});
function fixture() {
  const record={id:'source-1',kind:'rigid',payloadFrame:'source-local-meters',geometryKind:0,resourceIds:['mesh'],placement:{translationCm:[100,200,300],rotationQuaternion:[0,0,0,.9983],scale3d:[1,-1,2]}};
  const resources={view:{source:{mapId:'fixture'},coverage:'partial-display',scope:{id:'school',layerId:'AAS',boundsSourceCm:[-1000,-1000,1000,1000]},records:[record,{...record,id:'source-2'}, {id:'terrain',kind:'surface',payloadFrame:'render-world-meters',resourceIds:['terrain']}],resources:[{resourceId:'mesh',transport:{bytes:10}},{resourceId:'terrain',transport:{bytes:20}}]},resourceBytes:()=>new ArrayBuffer(1)};
  let loads=0,disposed=0;
  const vegetation=new THREE.Group();vegetation.add(new THREE.Object3D());vegetation.children[0].position.set(1,-2,3);
  const decoders={async rigid(){loads++;return triangle();},async terrain(){return triangle();},async vegetation(){return{root:vegetation,dispose(){disposed++;}};}};
  return {resources,decoders,counts:()=>({loads,disposed})};
}
test('existing school entry accepts a verified resource display, deduplicates geometry and disposes once',async()=>{
  const f=fixture(),ready=await prepareSchoolDisplay(f.resources,f.decoders,[1,2,3]),root=createNarvaSchoolEnvironment(ready);
  assert.equal(f.counts().loads,1);assert.equal(root.children[1].count,2);assert.equal(root.userData.collisionAuthority,false);assert.equal(root.userData.coverage,'partial-display');
  const instance=new THREE.Matrix4();root.children[1].getMatrixAt(0,instance);
  // Source point (0,1,0) -> scale (0,-1,0), anchor cancels translation;
  // Armor X/Z/Y ordering gives (0,0,-1), with no second Y reflection.
  assert.deepEqual(new THREE.Vector3(0,0,1).applyMatrix4(instance).toArray(),[0,0,-1]);
  root.updateMatrixWorld(true);assert.deepEqual(root.children[2].children[0].children[0].getWorldPosition(new THREE.Vector3()).toArray(),[0,0,0]);
  assert.equal(root.userData.requiresLocalClipping,true);
  root.position.set(30,4,-12);root.updateMatrixWorld(true);root.children[0].onBeforeRender();
  const planes=root.children[0].material.clippingPlanes;
  const inside=new THREE.Vector3(0,0,0).applyMatrix4(root.matrixWorld);
  assert.ok(planes.every(p=>p.distanceToPoint(inside)>0));
  assert.ok(planes.some(p=>p.distanceToPoint(new THREE.Vector3(50,0,0).applyMatrix4(root.matrixWorld))<0));
  setNarvaSchoolInspectionTone(root,false);assert.equal(root.userData.inspectionTone.value,0);
  root.userData.disposeResourceView();root.userData.disposeResourceView();assert.equal(f.counts().disposed,1);
});
test('wrong frame and failed codec cannot return a prepared partial scene',async()=>{
  const f=fixture();f.resources.view.records[0].payloadFrame='render-local-meters';
  await assert.rejects(prepareSchoolDisplay(f.resources,f.decoders,[0,0,0]),/刚体空间/);
  const g=fixture();g.decoders.rigid=async()=>{throw Error('bad mesh');};
  await assert.rejects(prepareSchoolDisplay(g.resources,g.decoders,[0,0,0]),/bad mesh/);
});
test('world pose conversion preserves asymmetric rotation and signed nonuniform scale',()=>{
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.7,.4));
  const transform={translationMeters:[12,-5,8],rotationQuaternion:q.toArray().map(v=>v*.9983),scale3d:[-2,3,.5]};
  const source=new THREE.Vector3(2,3,5).multiply(new THREE.Vector3(-2,3,.5)).applyQuaternion(q).add(new THREE.Vector3(12,-5,8)).sub(new THREE.Vector3(1,2,3));
  const armor=new THREE.Vector3(2,5,3).applyMatrix4(schoolWorldMatrix(transform,[1,2,3]));
  assert.ok(armor.distanceTo(new THREE.Vector3(source.x,source.z,source.y))<1e-12);
});
