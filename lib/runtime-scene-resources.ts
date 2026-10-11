import * as THREE from "three";

// The source cache owns these objects. SkeletonUtils clones keep their geometry,
// materials and textures, while each clone has its own skeleton/bone texture.
// Weak membership adds no extra lifetime or duplicate GPU/CPU asset copies.
const cachedResources = new WeakSet<object>();

function sceneResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const instances = new Set<THREE.InstancedMesh>();
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instances.add(object);
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line) && !(object instanceof THREE.Sprite)) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  return { geometries, materials, textures, skeletons, instances };
}

/** Call once when a shared source is successfully admitted to its owning cache. */
export function retainCachedRuntimeSceneResources(root: THREE.Object3D) {
  const resources = sceneResources(root);
  for (const group of Object.values(resources)) {
    for (const resource of group) cachedResources.add(resource);
  }
}

/** Release viewer-owned resources, without disposing another consumer's source. */
export function disposeRuntimeScene(root: THREE.Object3D) {
  const { geometries, materials, textures, skeletons, instances } = sceneResources(root);
  for (const group of [instances, skeletons, textures, materials, geometries]) {
    for (const resource of group) {
      if (!cachedResources.has(resource)) resource.dispose();
    }
  }
}
