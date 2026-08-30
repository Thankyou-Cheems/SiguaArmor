import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [viewerSource, runtimeSource, referenceSource, styles] = await Promise.all([
  readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/runtime-crew-occupants.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/runtime-reference-soldier.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
]);

test("crew display is opt-in and loads the detailed layer only on demand", () => {
  assert.match(
    viewerSource,
    /const \[crewOccupantDisplayEnabled,[\s\S]{0,120}useState\(false\)/u,
  );
  assert.match(viewerSource, /显示乘员位置与受击判定/u);
  assert.match(viewerSource, /exact BaseAnimation 的 Editor frame-zero 骨姿态/u);
  assert.match(viewerSource, /原生 PhysicsAsset 参考判定体按同一骨姿态变换/u);
  assert.match(viewerSource, /PhysicsAsset 逐帧变形仍不声称已复现/u);
  assert.doesNotMatch(viewerSource, /三段简化判定体/u);
  assert.match(viewerSource, /import\("\.\/runtime-crew-occupants"\)/u);
  assert.match(viewerSource, /crewOccupantDisplayEnabledRef/u);
  assert.match(referenceSource, /referenceSoldierSourceRequest/u);
  assert.match(referenceSource, /cloneSkeleton\(source\.scene\)/u);
});

test("hittable occupants use exact animation poses and the shared PhysicsAsset", () => {
  assert.match(runtimeSource, /new THREE\.InstancedMesh/u);
  assert.match(runtimeSource, /realistic-low-poly-appearance/u);
  assert.match(runtimeSource, /appearanceModels\.crowdReal\.assetUrl/u);
  assert.match(runtimeSource, /loadVehicleCrewPhysicsAsset/u);
  assert.match(runtimeSource, /posedCrewPhysicsAssetGeometry/u);
  assert.match(
    runtimeSource,
    /includeHittableGeometry \? loadVehicleCrewPhysicsAsset\(\) : null/u,
  );
  assert.match(runtimeSource, /skeletonOutlineGeometry/u);
  assert.doesNotMatch(runtimeSource, /skeletonMannequinGeometry/u);
  assert.match(runtimeSource, /loadVehicleCrewAnimationPose/u);
  assert.match(runtimeSource, /loadRuntimeReferenceSoldierAnimationPose/u);
  assert.match(runtimeSource, /proxyBindings/u);
  assert.match(runtimeSource, /geometry\.dispose\(\)/u);
  assert.doesNotMatch(runtimeSource, /posedGeometryRequests/u);
  assert.doesNotMatch(runtimeSource, /plans\.map[\s\S]{0,200}new THREE\.SkinnedMesh/u);
});

test("hittable crew geometry is keyed by the exact seat animation pose", () => {
  assert.doesNotMatch(
    runtimeSource,
    /loadRuntimeReferenceSoldier\(posture\)/u,
    "generic infantry postures must not stand in for vehicle-seat animations",
  );
  assert.doesNotMatch(
    runtimeSource,
    /const key = `\$\{posture\}:\$\{geometryMode\}`/u,
    "geometry reuse must follow exact animation-pose identity, not a posture bucket",
  );
  assert.match(runtimeSource, /animationPoseRef/u);
});

test("protected occupants use exact-pose wireframes with sprites only as fail-closed fallback", () => {
  assert.match(runtimeSource, /protectedWithPose/u);
  assert.match(runtimeSource, /protectedPoseBindings/u);
  assert.match(runtimeSource, /protectedPoseMaterial/u);
  assert.match(
    runtimeSource,
    /plan\.renderKind === "protected-outline" &&\s*plan\.animationPoseRef === null/u,
  );
  assert.match(runtimeSource, /new THREE\.Sprite\(material\)/u);
  assert.match(runtimeSource, /outline-fallback/u);
  assert.match(styles, /\.viewer-crew-occupant-legend/u);
  assert.match(runtimeSource, /plan\.renderKind !== "protected-nonspatial"/u);
  assert.match(viewerSource, /无人物 socket 的 Hidden/u);
  assert.match(viewerSource, /viewer-crew-nonspatial-seats/u);
  assert.match(viewerSource, /查看未绘制席位/u);
  assert.match(viewerSource, /crewOccupantCounts\.rendered/u);
  assert.match(viewerSource, /席说明/u);
  assert.match(viewerSource, /occupant\.requestedSocketName/u);
  assert.match(viewerSource, /直接爆炸伤害仍启用/u);
});

test("crew readability never collapses exact poses into standing sprites or capsule mannequins", () => {
  assert.doesNotMatch(
    runtimeSource,
    /hittable\.length > 4/u,
    "crew count must not select a capsule mannequin representation",
  );
  assert.match(runtimeSource, /realistic-low-poly-appearance/u);
  assert.doesNotMatch(runtimeSource, /prototype-(?:near|balanced|crowd)/u);
  assert.doesNotMatch(referenceSource, /CREW_PROTOTYPE_MODEL_PATHS/u);
  assert.match(viewerSource, /crewHitProxyDisplayEnabled/u);
});

test("real crew appearance is opaque so equipment and the body remain readable", () => {
  assert.match(
    runtimeSource,
    /const appearanceMaterial = new THREE\.MeshStandardMaterial\(\{[\s\S]*?transparent: false,[\s\S]*?opacity: 1,/u,
  );
  assert.doesNotMatch(runtimeSource, /opacity: 0\.72/u);
  assert.match(runtimeSource, /\["MI_USArmyGlass", 0x101714\]/u);
  assert.match(runtimeSource, /materialName === "MI_GreenEye"/u);
  assert.match(runtimeSource, /vertexColors: true/u);
  assert.match(runtimeSource, /depthTest: true,[\s\S]{0,80}depthWrite: true/u);
  assert.match(runtimeSource, /crew-occupant-depth-reset/u);
  assert.match(
    runtimeSource,
    /crewDepthReset\.onBeforeRender = \(renderer\) => \{\s*renderer\.clearDepth\(\)/u,
  );
});

test("crew roots use occupant attachment channels instead of weapon pitch", () => {
  assert.match(viewerSource, /stationOccupantArticulationMatrixChain/u);
  const updateBody = viewerSource.match(
    /const updateCrewOccupantArticulation = \(\) => \{[\s\S]*?\n    \};/u,
  )?.[0] ?? "";
  assert.doesNotMatch(updateBody, /stationArticulationMatrixChain\(station\)/u);
  assert.match(updateBody, /stationOccupantArticulationMatrixChain\(station\)/u);
});
