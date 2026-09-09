import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as THREE from "three";

// Execute the real viewer callbacks together. A test of only a ground-height
// formula misses the bug: the toggle/load callers used to leave it untouched.
const text = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("RuntimeVehicleViewer.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, required = true) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (!found && required) throw new Error(`Viewer callback missing: ${name}`);
  return found ? `const ${found.getText(parsed)};` : "";
}

function fixture() {
  const modelGroup = new THREE.Group();
  modelGroup.position.y = -2;
  const chassis = new THREE.Group();
  modelGroup.add(chassis);
  const visualGroup = new THREE.Group();
  chassis.add(visualGroup);
  const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12));
  visualGroup.add(wheel);
  const referenceSoldier = new THREE.Object3D();
  modelGroup.add(referenceSoldier);
  const environmentRoot = new THREE.Group();
  const gridHelper = new THREE.Object3D();
  const groundScale = new THREE.Group();
  environmentRoot.position.y = gridHelper.position.y = -2;
  groundScale.position.y = -2 + 0.006;
  const context = {
    THREE, modelGroup, visualGroup, referenceSoldier, environmentRoot, gridHelper, groundScale,
    host: { dataset: { referencePlaneY: "-2", referencePlaneAuthority: "runtime-probe-map" } },
    groundReferenceY: -2, chassisPose: {}, physicalPoseEnabledRef: { current: true },
    fittedSource: "exterior", exteriorReady: true, analysisVisualReady: false,
    analysisVisualGroup: new THREE.Group(), hitGroupRef: { current: null },
    applyChassisPoseMatrix(enabled) { chassis.position.y = enabled ? 0.5 : 0; },
    applySkeletalPose(enabled) { wheel.position.y = enabled ? -0.3 : 0.35; },
    applyTurretPose() {}, setRealtimePointer() {}, protectionCache: null, render() {},
    protectionEnabledRef: { current: false }, scheduleProtectionMap() {},
  };
  context.applyChassisPoseMatrix(true);
  context.applySkeletalPose(true);
  modelGroup.updateMatrixWorld(true);
  const source = [callback("syncReferencePlane", false), callback("applyChassisPose"),
    "globalThis.applyPose = applyChassisPose; globalThis.syncGround = typeof syncReferencePlane === 'function' ? syncReferencePlane : undefined;"].join("\n");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, context);
  return context;
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: expected ${expected}, got ${actual}`);
}

test("toggle regrounds reference running gear and restores the observed physical plane without drift", () => {
  const f = fixture();
  for (let repeat = 0; repeat < 3; repeat++) {
    f.applyPose(false);
    const minimum = new THREE.Box3().setFromObject(f.visualGroup, true).min.y;
    near(minimum - f.groundReferenceY, 0, "reference pose must not float at the previous physical plane");
    assert.equal(f.host.dataset.referencePlaneAuthority, "geometry-bounds");
    near(f.environmentRoot.position.y, f.groundReferenceY, "school ground");
    near(f.gridHelper.position.y, f.groundReferenceY, "grid ground");
    near(f.groundScale.position.y, f.groundReferenceY + 0.006, "scale ground");
    near(f.referenceSoldier.getWorldPosition(new THREE.Vector3()).y, f.groundReferenceY, "reference soldier feet");
    f.applyPose(true);
    near(f.groundReferenceY, -2, "observed plane");
    near(f.referenceSoldier.getWorldPosition(new THREE.Vector3()).y, -2, "restored soldier feet");
  }
});

test("late exterior loading replaces an analysis minimum in either direction", () => {
  const f=fixture();
  f.exteriorReady=false;f.analysisVisualReady=true;
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  proxy.position.y=-0.5;f.analysisVisualGroup.add(proxy);f.modelGroup.add(f.analysisVisualGroup);
  f.applyPose(false);
  near(f.groundReferenceY,-3,'analysis minimum');
  f.exteriorReady=true;f.syncGround();
  const minimum=new THREE.Box3().setFromObject(f.visualGroup,true).min.y;
  near(f.groundReferenceY,minimum,'complete exterior may raise the previous plane');
  f.applyPose(true);near(f.groundReferenceY,-2,'observed plane remains independent of proxy bounds');
});
