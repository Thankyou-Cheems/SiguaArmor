import * as THREE from "three";

export const ANALYSIS_PROJECTED_MARK_OPACITY_SCALE = 1 / 3;
export const ANALYSIS_PROJECTED_MARK_ALPHA_TEST = 0.01;

/**
 * Projected marks are authored as alpha-blended GLTF materials. Analysis mode
 * renders them over an already translucent vehicle shell, so reusing the
 * exterior material makes the projected region read as a solid patch. Keep
 * the authored texture/alpha channel, but give analysis its own faint,
 * non-depth-writing material instead of mutating the shared GLTF material.
 */
export function createAnalysisProjectedMarkMaterial<T extends THREE.Material>(
  source: T,
): T {
  const analysis = source.clone() as T;
  analysis.transparent = true;
  analysis.opacity = source.opacity * ANALYSIS_PROJECTED_MARK_OPACITY_SCALE;
  analysis.alphaTest = Math.max(source.alphaTest, ANALYSIS_PROJECTED_MARK_ALPHA_TEST);
  analysis.depthTest = true;
  analysis.depthWrite = false;
  analysis.blending = THREE.NormalBlending;
  analysis.premultipliedAlpha = false;
  analysis.polygonOffset = true;
  analysis.polygonOffsetFactor = -2;
  analysis.polygonOffsetUnits = -2;
  analysis.userData = {
    ...source.userData,
    siguadAnalysisProjectedMark: true,
    siguadSourceOpacity: source.opacity,
  };
  analysis.needsUpdate = true;
  return analysis;
}
