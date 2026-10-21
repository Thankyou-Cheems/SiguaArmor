import * as THREE from 'three';
import {openMapResourceView, prepareMapResourceView} from '@wiki/resource-view.js';
import {FixedDisplayStore} from '@calc/fixed-display-store.ts';
import {resourceDisplayTerrain} from '@calc/resource-display-terrain.ts';
import {deformSplinePosition} from '@calc/spline.ts';
import {SoftVegetationScene} from '@calc/soft-vegetation-scene.ts';
import {prepareSchoolDisplay} from '../../lib/runtime-school-resource-environment.ts';
import {createNarvaSchoolEnvironment, setNarvaSchoolInspectionTone} from '../../lib/runtime-narva-school-environment.ts';

const result={scope:'local existing-publication display; no production CORS, native world-pose reconstruction or Query acceptance',errors:[]};
window.addEventListener('error',event=>result.errors.push(event.message));
window.addEventListener('unhandledrejection',event=>result.errors.push(String(event.reason)));
const assert=(value,message)=>{if(!value)throw Error(message);};
try {
  const config=await (await fetch('/qa-config')).json(), sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const session=await openMapResourceView({entryUrl:'https://offline.invalid/map-data/views/narva-school.json',objectBaseUrl:'https://offline.invalid/map-data/',scope:config.scope,sha256,async fetchBytes(url){const response=await fetch('/qa-map/'+new URL(url).pathname.slice('/map-data/'.length));assert(response.ok,'Local fixture resource failed: '+response.status);return response.arrayBuffer();}});
  const resources=await prepareMapResourceView(session), byId=new Map(resources.view.resources.map(r=>[r.resourceId,r]));
  const rigid=resources.view.records.filter(r=>r.kind==='rigid'), prototypes=[], lookup=new Map();
  for(const row of rigid)if(!lookup.has(row.meshPath)) {
    assert(row.presentation,'Candidate needs explicit display stability metadata');lookup.set(row.meshPath,prototypes.length);
    const resource=byId.get(row.resourceIds[0]);prototypes.push({meshPath:row.meshPath,...row.presentation,geometry:{sha256:resource.decoded.sha256,bytes:resource.decoded.bytes,url:resource.resourceId}});
  }
  const store=new FixedDisplayStore({prototypes},undefined,undefined,async id=>resources.resourceBytes(prototypes[id].geometry.url));
  const terrainRecord=resources.view.records.find(r=>r.kind==='surface'), terrain=resourceDisplayTerrain(resources.resourceBytes(terrainRecord.resourceIds[0]));
  const b=config.scope.boundsSourceCm, anchor=[(b[0]+b[2])/200,(b[1]+b[3])/200,0], ray=new THREE.Ray(new THREE.Vector3(anchor[0],-anchor[1],10000),new THREE.Vector3(0,0,-1)), hit=new THREE.Vector3(), hits=[];
  for(let i=0;i<terrain.indices.length;i+=3){const points=Array.from(terrain.indices.subarray(i,i+3),v=>new THREE.Vector3().fromArray(terrain.positions,v*3));if(ray.intersectTriangle(...points,false,hit))hits.push(hit.z);}
  assert(hits.length&&Math.max(...hits)-Math.min(...hits)<1e-4,'School center terrain must have an unambiguous displayed height');anchor[2]=hits[0];
  let vegetationScene;
  const decoders={
    async rigid(row){
      const source=await store.geometry(lookup.get(row.meshPath));assert(source,'Missing fixed display geometry');
      const positions=source.positions.slice();
      if(row.geometryKind===1){const d=row.deformation;for(let i=0;i<positions.length;i+=3)positions.set(deformSplinePosition(Float32Array.from(d.parameters),d.sourceBoundsCm.min,d.sourceBoundsCm.max,Array.from(positions.subarray(i,i+3),v=>v*100)).map(v=>v/100),i);}
      return {positions,indices:source.indices,colorsRgb:source.colors};
    },
    async terrain(){return {...terrain,colorsRgb:terrain.colors};},
    async vegetation(records){
      const models=new Map(), transforms=new Map(),tiles=[],grass=[];
      for(const row of records) {
        if(row.kind==='grass'){grass.push(row.component);for(const p of row.prototypes)models.set(p.id,p);continue;}
        assert(row.payloadFrame==='source-local-centimeters','SGVF input is centimetres');
        const groups=row.groups.map((group,i)=>{models.set(group.prototype.id,group.prototype);const id=row.id+':'+i;transforms.set(id,Float32Array.from(group.transforms.flat()).buffer);return{prototypeId:group.prototype.id,instances:id,count:group.transforms.length};});
        tiles.push({id:row.id,layerIds:[config.scope.layerId],boundsCm:row.boundsSourceCm,groups});
      }
      const catalog={schemaVersion:'sigua-soft-vegetation-display/v3',mapId:resources.view.source.mapId,sourceBuild:resources.view.source.sourceBuild,coverage:'partial',detail:'bounded existing source display, local candidate',prototypes:[...models.values()],tiles,grass};
      const assets={catalog:async()=>catalog,catalogIdentity:()=>config.viewSha256,bytes:async(id,role)=>{assert(byId.get(id)?.role===role,'Vegetation requested wrong authority');return resources.resourceBytes(id).slice(0);},instances:async groups=>groups.map(g=>{assert(transforms.has(g.instances),'Unselected vegetation transform');return transforms.get(g.instances);})};
      vegetationScene=new SoftVegetationScene(assets,()=>config.scope.layerId,()=>{},128*1048576,true,false);
      await vegetationScene.prepare([{originCm:{x:anchor[0]*100,y:anchor[1]*100,z:anchor[2]*100+200}}],9000,true);
      assert(vegetationScene.coverage().status!=='unavailable',vegetationScene.coverage().detail);
      result.vegetation={...vegetationScene.diagnostics(),coverage:vegetationScene.coverage()};
      return {root:vegetationScene.root,dispose:()=>vegetationScene.dispose()};
    },
  };
  const prepared=await prepareSchoolDisplay(resources,decoders,anchor), environment=createNarvaSchoolEnvironment(prepared);setNarvaSchoolInspectionTone(environment,false);
  environment.updateMatrixWorld(true);
  // Compare actual instance matrices to direct source-point scale/rotation/
  // translation, independent of Armor's matrix-conjugation implementation.
  let maxError=0,checked=0;
  const original=new Map(prepared.rigid.map(r=>[r.record.id,r]));
  for(const mesh of environment.children.filter(c=>c.isInstancedMesh))for(let i=0;i<mesh.count;i++){
    const {record,geometry}=original.get(mesh.userData.stableIds[i]),p=record.placement,q=new THREE.Quaternion(...p.rotationQuaternion).normalize(),m=new THREE.Matrix4();mesh.getMatrixAt(i,m);
    // First drawn vertex survives index compaction as vertex zero.
    const v=geometry.indices[0],source=new THREE.Vector3().fromArray(geometry.positions,v*3).multiply(new THREE.Vector3(...p.scale3d)).applyQuaternion(q).add(new THREE.Vector3(...p.translationCm).multiplyScalar(.01)).sub(new THREE.Vector3(...anchor));
    const actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(m);
    maxError=Math.max(maxError,actual.distanceTo(new THREE.Vector3(source.x,source.z,source.y)));checked++;
  }
  assert(checked===rigid.length&&maxError<.0002,'Rendered world placement differs: '+maxError);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.localClippingEnabled=environment.userData.requiresLocalClipping;renderer.setSize(1100,680);renderer.setPixelRatio(1);renderer.setClearColor(0xaac8d2);renderer.outputColorSpace=THREE.SRGBColorSpace;
  document.querySelector('#results').before(renderer.domElement);
  const scene=new THREE.Scene();scene.add(environment,new THREE.HemisphereLight(0xddeeff,0x665e48,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-20,90,50);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(55,1100/680,.1,1000);camera.position.set(105,85,115);camera.lookAt(0,4,0);scene.updateMatrixWorld(true);renderer.render(scene,camera);
  const gl=renderer.getContext(),pixel=new Uint8Array(1100*680*4);gl.readPixels(0,0,1100,680,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  const unique=new Set();for(let i=0;i<pixel.length;i+=64)unique.add(pixel[i]+256*pixel[i+1]+65536*pixel[i+2]);assert(unique.size>100,'Rendered school framebuffer is empty');
  result.state='passed';result.viewSha256=config.viewSha256;result.anchorSourceMeters=anchor;result.rigid={checked,maxWorldErrorMeters:maxError,splines:rigid.filter(r=>r.geometryKind===1).length};result.render={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sampledColors:unique.size,webglError:gl.getError()};
  assert(result.render.webglError===gl.NO_ERROR,'WebGL error');assert(result.errors.length===0,'Browser fixture errors');
  window.schoolResourceFixture={result,environment,renderer,camera,scene,vegetationScene};
} catch(error) {result.state='failed';result.errors.push(error.stack??String(error));}
document.querySelector('#results').textContent=JSON.stringify(result,null,2);
