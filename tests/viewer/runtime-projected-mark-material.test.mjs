import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  ANALYSIS_PROJECTED_MARK_ALPHA_TEST,
  ANALYSIS_PROJECTED_MARK_OPACITY_SCALE,
  createAnalysisProjectedMarkMaterial,
} from "../../lib/runtime-projected-mark-material.ts";

test("analysis projected marks preserve texture alpha without becoming an opaque patch", () => {
  const map = new THREE.Texture();
  const source = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.65,
    alphaTest: 0,
    depthTest: true,
    depthWrite: true,
  });
  source.name = "SiguaD vehicle projected mark";
  source.userData = {
    siguadRole: "projected-mark",
    opacity: 0.65,
  };

  const analysis = createAnalysisProjectedMarkMaterial(source);

  assert.notEqual(analysis, source, "analysis mode must not mutate the shared GLTF material");
  assert.equal(analysis.map, map, "the alpha-bearing projected-mark texture must survive");
  assert.equal(analysis.transparent, true);
  assert.equal(analysis.opacity, source.opacity * ANALYSIS_PROJECTED_MARK_OPACITY_SCALE);
  assert.equal(analysis.alphaTest, ANALYSIS_PROJECTED_MARK_ALPHA_TEST);
  assert.equal(analysis.depthTest, true);
  assert.equal(analysis.depthWrite, false);
  assert.equal(analysis.polygonOffset, true);
  assert.equal(analysis.userData.siguadRole, "projected-mark");

  assert.equal(source.opacity, 0.65, "the source/exterior material stays at 65 percent");
  assert.equal(source.alphaTest, 0);
  assert.equal(source.depthWrite, true);
  assert.equal(source.polygonOffset, false);
});
