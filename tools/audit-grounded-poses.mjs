// Reconstruct actual source skins with the product controller. This checks
// data/consumer compatibility and precise skinned bounds, not GPU rendering.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createRuntimeSkeletalPoseController} from '../lib/runtime-skeletal-pose.ts';
import {validateRuntimeGroundedPose,groundedPoseLocalMatrices} from '../lib/runtime-grounded-pose.ts';

globalThis.ProgressEvent??=class {constructor(type,init){this.type=type;Object.assign(this,init);}};
const [poseRoot,assetRoot,output]=process.argv.slice(2);
if(!output)throw Error('Usage: audit-grounded-poses <pose Wiki root> <restored Wiki asset root> <output.json>');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=await readJson(path.join(poseRoot,'data/vehicles/grounded-poses/v1/catalog.json'));
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),rows=[];
for(const entry of catalog.vehicles) {
  if(entry.status!=='observed')continue;
  const data=await readFile(path.join(poseRoot,entry.record.url));
  if(data.length!==entry.record.bytes||sha(data)!==entry.record.sha256)throw Error('Pose hash mismatch');
  const pose=validateRuntimeGroundedPose(JSON.parse(data),entry.generatedClass);
  for(const binding of pose.bindings) {
    const file=path.join(assetRoot,binding.assetUrl),original=await readFile(file);
    if(!binding.assetUrl.includes('/'+sha(original)+'.gltf'))throw Error('Source glTF hash mismatch');
    const document=JSON.parse(original);
    // Materials are irrelevant to vertex positions; don't download textures.
    document.materials=[];document.textures=[];document.images=[];
    for(const mesh of document.meshes)for(const primitive of mesh.primitives)delete primitive.material;
    for(const buffer of document.buffers)if(buffer.uri) {
      const bytes=await readFile(path.resolve(path.dirname(file),buffer.uri));
      buffer.uri=`data:application/octet-stream;base64,${bytes.toString('base64')}`;
    }
    const {scene:model}=await loader.parseAsync(JSON.stringify(document),'');
    const root=new THREE.Group();root.matrixAutoUpdate=false;root.add(model);
    const meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    const matrices=groundedPoseLocalMatrices(pose,entry.generatedClass,binding);
    const controllers=[...new Set(meshes.map(m=>m.skeleton))].map(s=>createRuntimeSkeletalPoseController(s,{observedSampleCount:3,referenceEquivalent:false,observedLocalMatricesByBoneName:matrices}));
    if(!controllers.length||controllers.some(c=>!c))throw Error('Unusable source skin: '+entry.generatedClass);
    const selected=[...new Set(controllers.flatMap(c=>c.selectedBoneNames))];
    const missing=selected.filter(name=>!matrices[name]);
    if(missing.length)throw Error(`Missing selected source joints: ${entry.generatedClass}: ${missing}`);
    const states=[];
    for(const mode of ['observed','reference','observed']) {
      root.matrix.copy(mode==='observed'?new THREE.Matrix4().fromArray(pose.chassis.gltfMatrix):new THREE.Matrix4());
      controllers.forEach(c=>c.apply(mode));root.updateMatrixWorld(true);
      if(mode==='observed') {
        for(const skeleton of new Set(meshes.map(m=>m.skeleton)))for(const bone of skeleton.bones) {
          const name=typeof bone.userData.name==='string'?bone.userData.name:bone.name;
          if(selected.includes(name)&&bone.matrix.elements.some((v,i)=>Math.abs(v-matrices[name][i])>1e-6))throw Error(`Joint TRS loses observed matrix: ${entry.generatedClass}: ${name}`);
        }
      }
      const precise=new THREE.Box3().setFromObject(root,true);
      if(precise.isEmpty()||![...precise.min.toArray(),...precise.max.toArray()].every(Number.isFinite))throw Error('Invalid deformed geometry');
      states.push({mode,minY:precise.min.y,maxY:precise.max.y});
    }
    if(Math.abs(states[0].minY-states[2].minY)>1e-10)throw Error('Pose toggle drift');
    rows.push({generatedClass:entry.generatedClass,model:binding.assetUrl,selectedBones:selected.length,states});
    model.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});
  }
}
await writeFile(output,JSON.stringify({sourceBuildId:catalog.sourceBuildId,rows},null,2)+'\n');
console.log(JSON.stringify({classes:new Set(rows.map(r=>r.generatedClass)).size,bindings:rows.length,
  gapsOver5cm:rows.filter(r=>r.states[0].minY>0.05).map(r=>({generatedClass:r.generatedClass,gapCm:r.states[0].minY*100})),output}));
