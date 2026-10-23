import type { Mesh, Object3D, SkinnedMesh } from "three";

// A descriptor/occurrence wrapper can be complete while its actual glTF is
// empty. Validate the loaded vertex domain before reporting exterior success.
export function validateRuntimeExteriorModel(model: Object3D) {
  model.updateMatrixWorld(true);
  let meshes = 0;
  model.traverse((object) => {
    if (!object.matrix.elements.every(Number.isFinite) || !object.matrixWorld.elements.every(Number.isFinite)) {
      throw new Error("外观组件矩阵无效");
    }
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const position = mesh.geometry.getAttribute("position");
    if (!position || position.count === 0 || position.itemSize !== 3) throw new Error("外观组件没有几何");
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      if (attribute.count !== position.count) throw new Error("外观属性顶点域不一致");
      for (let i = 0; i < attribute.count; i++) for (let axis = 0; axis < attribute.itemSize; axis++) {
        if (!Number.isFinite(attribute.getComponent(i, axis))) throw new Error("外观顶点属性无效");
      }
    }
    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) {
      const vertex = index.getX(i);
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= position.count) throw new Error("外观索引超出顶点域");
    }
    const skin = mesh as SkinnedMesh;
    if (skin.isSkinnedMesh) {
      skin.skeleton.update();
      if (skin.skeleton.bones.length === 0 || !skin.skeleton.boneMatrices?.every(Number.isFinite)) {
        throw new Error("外观骨架无效");
      }
      const joints = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight");
      if (!joints || !weights || joints.itemSize !== 4 || weights.itemSize !== 4) throw new Error("外观骨骼影响域缺失");
      for (let i = 0; i < position.count; i++) {
        let totalWeight = 0;
        for (let axis = 0; axis < 4; axis++) {
          const joint = joints.getComponent(i, axis), weight = weights.getComponent(i, axis);
          if (!Number.isInteger(joint) || joint < 0 || joint >= skin.skeleton.bones.length || weight < 0) {
            throw new Error("外观骨骼影响域无效");
          }
          totalWeight += weight;
        }
        if (totalWeight <= 0) throw new Error("外观骨骼权重为空");
      }
    }
  });
  if (!meshes) throw new Error("外观模型为空");
}
