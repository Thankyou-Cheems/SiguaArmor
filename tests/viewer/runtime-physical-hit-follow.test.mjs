import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

import {
  createHitSceneThreeModel,
  setHitSceneThreeModelComponentPoses,
  setHitSceneThreeModelDamageHighlight,
} from "../../lib/hit-scene-three-renderer.ts";

const observed = (value) => ({ state: "observed", value });
const absent = () => ({ state: "absent", value: null, reason: "fixture" });

function component(componentId, semanticKind) {
  return {
    componentId,
    componentPath: `/fixture/Vehicle.${componentId}`,
    semanticKind,
    directDamagePoolIndex: absent(),
  };
}

function surface(surfaceProfileId, componentIndex) {
  return {
    surfaceProfileId,
    componentIndex,
    physicalMaterialPath: observed(`/fixture/${surfaceProfileId}`),
    armorThicknessMm: observed(20),
    considerForPenetration: observed(true),
    allowPenetration: observed(true),
    damageParentActor: observed(false),
    damageAbsorbed: observed(0),
  };
}

function physicalHitPack() {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    10, 0, 0, 11, 0, 0, 10, 1, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const analysisGeometry = new THREE.BufferGeometry();
  analysisGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  analysisGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const boundsTree = new MeshBVH(analysisGeometry, { indirect: true });
  return {
    header: {
      counts: {
        vertices: 6,
        triangles: 2,
        components: 2,
        surfaceProfiles: 2,
      },
      components: [
        component("SQVehicleWheel_L1", "wheel"),
        component("SQArmorMesh", "armor"),
      ],
      surfaceProfiles: [surface("wheel", 0), surface("hull", 1)],
      healthPools: [],
    },
    positions,
    indices,
    triangleComponentIndex: new Uint16Array([0, 1]),
    triangleSurfaceProfileIndex: new Uint16Array([0, 1]),
    faceNormals: new Float32Array([0, 0, 1, 0, 0, 1]),
    analysisGeometry,
    boundsTree,
    bvh: null,
  };
}

test("observed wheel pose moves only its hit component and the BVH source", () => {
  const pack = physicalHitPack();
  const model = createHitSceneThreeModel(pack);
  const wheelTranslation = new THREE.Matrix4()
    .makeTranslation(0, 2, 0)
    .toArray();

  const result = setHitSceneThreeModelComponentPoses(model, pack, {
    componentPoses: [{ componentIndex: 0, matrix: wheelTranslation }],
  });

  assert.equal(result.appliedComponentCount, 1);
  assert.equal(result.conflictedVertexCount, 0);
  assert.deepEqual([...pack.positions.slice(0, 9)], [
    0, 2, 0, 1, 2, 0, 0, 3, 0,
  ]);
  assert.deepEqual([...pack.positions.slice(9)], [
    10, 0, 0, 11, 0, 0, 10, 1, 0,
  ]);
  assert.deepEqual(
    [...pack.analysisGeometry.getAttribute("position").array],
    [...pack.positions],
  );

  setHitSceneThreeModelComponentPoses(model, pack, { componentPoses: [] });
  assert.deepEqual([...pack.positions.slice(0, 9)], [
    0, 0, 0, 1, 0, 0, 0, 1, 0,
  ]);
  model.dispose();
  pack.analysisGeometry.dispose();
});

test("viewer parents visual and hit groups under the same chassis pose", () => {
  const source = fs.readFileSync(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /chassisPoseGroup\.add\(visualGroup, analysisVisualGroup\)/u);
  assert.match(source, /chassisPoseGroup\.add\(hitGroup\)/u);
  assert.match(source, /setHitSceneThreeModelComponentPoses\(/u);
});

test("interactive turret frames cannot return before the armor hit layer is posed", () => {
  const source = fs.readFileSync(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const applyTurretPose = (");
  const end = source.indexOf(
    "applyTurretPoseRef.current = applyTurretPose",
    start,
  );
  assert.ok(start >= 0 && end > start, "applyTurretPose implementation is present");
  const applySource = source.slice(start, end);
  const interactiveStart = applySource.indexOf("if (interactive)");
  const hitPoseStart = applySource.indexOf(
    "setHitSceneThreeModelComponentPoses(",
  );
  assert.ok(interactiveStart >= 0, "interactive turret path is present");
  assert.ok(hitPoseStart > interactiveStart, "hit pose path is present");
  assert.doesNotMatch(
    applySource.slice(interactiveStart, hitPoseStart),
    /\brender\(\);\s*return;/u,
    "continuous WASD/slider frames must update green armor and hit geometry before rendering",
  );
});

test("radial damage highlight never lights translucent overlay volumes", () => {
  const pack = physicalHitPack();
  const model = createHitSceneThreeModel(pack);
  setHitSceneThreeModelDamageHighlight(model, {
    componentIndices: [0],
    colorHex: 0xd97967,
    strength: 0.82,
  });

  assert.equal(model.armor.material.uniforms.damageHighlightStrength.value, 0.82);
  assert.equal(model.interior.material.uniforms.damageHighlightStrength.value, 0.82);
  assert.equal(model.armorOverlay.material.uniforms.damageHighlightStrength.value, 0);
  assert.equal(model.blockerOverlay.material.uniforms.damageHighlightStrength.value, 0);
  model.dispose();
  pack.analysisGeometry.dispose();
});
