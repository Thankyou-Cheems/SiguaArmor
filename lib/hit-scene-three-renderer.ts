import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
} from "three";

import {
  buildHitSceneRenderBatches,
  type HitSceneRenderBatch,
  type HitSceneRenderLayer,
} from "./hit-scene-render-batches.ts";
import { relativeArmorThicknessRgb } from "./armor-thickness-ramp.ts";
import type {
  ParsedHitSceneRuntime,
  ParsedRuntimeHitScene,
} from "./runtime-hit-scene";
import { VEHICLE_MODEL_CATEGORY_COLORS } from "./vehicle-model-category-palette.ts";

const VERTEX_SHADER = `
  attribute vec3 color;
  attribute float surfaceOpacity;
  attribute float patternCode;
  attribute float surfaceProfileCode;
  attribute float damageHighlight;
  attribute vec3 outlineBarycentric;
  attribute vec3 spacedArmorEdgeMask;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPatternCode;
  varying float vSurfaceProfileCode;
  varying float vDamageHighlight;
  varying vec3 vLocalPosition;
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vOutlineBarycentric;
  varying vec3 vSpacedArmorEdgeMask;

  void main() {
    vColor = color;
    vOpacity = surfaceOpacity;
    vPatternCode = patternCode;
    vSurfaceProfileCode = surfaceProfileCode;
    vDamageHighlight = damageHighlight;
    vLocalPosition = position;
    vLocalNormal = normal;
    vViewNormal = normalize(normalMatrix * normal);
    vOutlineBarycentric = outlineBarycentric;
    vSpacedArmorEdgeMask = spacedArmorEdgeMask;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float globalOpacity;
  uniform float hatchStrength;
  uniform float shapeCueStrength;
  uniform float hoveredSurfaceProfileCode;
  uniform float specialArmorVisible;
  uniform float exteriorSpacedArmorOnly;
  uniform float spacedArmorAlphaScale;
  uniform float spacedArmorDashOffset;
  uniform float outlineStrength;
  uniform vec3 modelSpacedArmorColor;
  uniform vec3 modelNoPenetrationColor;
  uniform vec3 modelComponentColor;
  uniform vec3 modelEngineColor;
  uniform vec3 modelAmmoRackColor;
  uniform vec3 modelCollisionColor;
  uniform vec3 damageHighlightColor;
  uniform float damageHighlightStrength;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPatternCode;
  varying float vSurfaceProfileCode;
  varying float vDamageHighlight;
  varying vec3 vLocalPosition;
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vOutlineBarycentric;
  varying vec3 vSpacedArmorEdgeMask;

  vec2 surfacePatternUv(vec3 position, vec3 surfaceNormal) {
    vec3 dominantAxis = abs(normalize(surfaceNormal));
    if (dominantAxis.x > dominantAxis.y && dominantAxis.x > dominantAxis.z) {
      return position.yz;
    }
    if (dominantAxis.y > dominantAxis.z) {
      return position.xz;
    }
    return position.xy;
  }

  float proceduralGrid(vec2 coordinate) {
    vec2 derivativeWidth = max(fwidth(coordinate), vec2(0.0001));
    vec2 lineDistance =
      abs(fract(coordinate - 0.5) - 0.5) / derivativeWidth;
    return 1.0 - min(min(lineDistance.x, lineDistance.y), 1.0);
  }

  void main() {
    float alpha = clamp(vOpacity * globalOpacity, 0.0, 1.0);
    if (alpha < 0.01) discard;
    bool isNoPenetrationMarker = vPatternCode > 0.5 && vPatternCode < 1.5;
    bool isSpacedArmorMarker = vPatternCode > 2.5 && vPatternCode < 3.5;
    bool isEngineMaterial = vPatternCode > 5.5 && vPatternCode < 6.5;
    bool isAmmoRackMaterial = vPatternCode > 6.5 && vPatternCode < 7.5;
    bool isSubtleDamageableMaterial = vPatternCode > 7.5 && vPatternCode < 8.5;
    bool isDamageableGunCollisionMaterial = vPatternCode > 8.5 && vPatternCode < 9.5;
    if ((isNoPenetrationMarker || isSpacedArmorMarker) && specialArmorVisible < 0.5) discard;
    if (exteriorSpacedArmorOnly > 0.5 && !isSpacedArmorMarker) discard;

    vec3 lightDirection = normalize(vec3(-0.35, 0.55, 0.76));
    float diffuse = 0.55 + 0.45 * abs(dot(normalize(vViewNormal), lightDirection));
    vec3 shaded = vColor * diffuse;
    float spacedArmorOutlineAlpha = 0.0;

    float hoveredSurface =
      hoveredSurfaceProfileCode >= 0.0 &&
      abs(vSurfaceProfileCode - hoveredSurfaceProfileCode) < 0.25
        ? 1.0
        : 0.0;
    vec2 hatchCell = floor(gl_FragCoord.xy / 5.0);
    float diagonal = mod(hatchCell.x + hatchCell.y, 2.0);
    float opposite = mod(hatchCell.x - hatchCell.y, 2.0);
    if (isEngineMaterial) {
      // A dark diamond mechanical mesh keeps the engine orange while making
      // its surface readable as a distinct internal machine volume.
      shaded = modelEngineColor * diffuse;
      vec2 engineUv = surfacePatternUv(vLocalPosition, vLocalNormal);
      vec2 engineDiamond = vec2(
        engineUv.x + engineUv.y,
        engineUv.x - engineUv.y
      ) * 8.0;
      float engineMesh = proceduralGrid(engineDiamond);
      vec3 engineMeshColor = vec3(0.24, 0.075, 0.018);
      shaded = mix(shaded, engineMeshColor, engineMesh * 0.58);

      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float engineEdge =
        max(coreBand.x, max(coreBand.y, coreBand.z)) * outlineStrength;
      vec3 engineEdgeColor = modelEngineColor;
      shaded = mix(shaded, engineEdgeColor, engineEdge * 0.92);
      shaded += engineEdgeColor * engineEdge * 0.15;
      alpha = max(alpha, engineEdge * 0.88);
    } else if (isAmmoRackMaterial) {
      // Orthogonal illuminated cells evoke separate ammunition stowage bays
      // and remain visually unlike the engine's diagonal dark lattice.
      shaded = modelAmmoRackColor * diffuse;
      vec2 ammoUv = surfacePatternUv(vLocalPosition, vLocalNormal) * 10.0;
      float ammoGrid = proceduralGrid(ammoUv);
      float ammoCell =
        mod(floor(ammoUv.x) + floor(ammoUv.y), 2.0);
      shaded *= mix(0.86, 1.04, ammoCell * 0.32);
      vec3 ammoGridColor = modelAmmoRackColor;
      shaded = mix(shaded, ammoGridColor, ammoGrid * 0.54);

      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float ammoEdge =
        max(coreBand.x, max(coreBand.y, coreBand.z)) * outlineStrength;
      vec3 ammoEdgeColor = modelAmmoRackColor;
      shaded = mix(shaded, ammoEdgeColor, ammoEdge * 0.92);
      shaded += ammoEdgeColor * ammoEdge * 0.16;
      alpha = max(alpha, ammoEdge * 0.88);
    } else if (isDamageableGunCollisionMaterial) {
      // Damageable weapon/collision meshes keep a readable white core while a
      // lime outer edge also identifies them as a component health pool.
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      vec3 haloBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.8, edgeWidth * 3.6, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float outlineCore = max(coreBand.x, max(coreBand.y, coreBand.z)) * outlineStrength;
      float componentHalo = max(haloBand.x, max(haloBand.y, haloBand.z)) * outlineStrength;
      vec3 collisionColor = modelCollisionColor;
      vec3 damageColor = modelComponentColor;
      shaded = mix(shaded, damageColor, componentHalo * 0.2);
      shaded = mix(shaded, collisionColor, outlineCore * 0.62);
      shaded += collisionColor * outlineCore * 0.07;
      alpha = max(alpha, max(outlineCore * 0.54, componentHalo * 0.2));
    } else if (isSubtleDamageableMaterial) {
      // Parent-forwarding pools such as turret rings remain damageable but are
      // subordinate to independent engine/ammo/component-only silhouettes.
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 edgeBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.35, edgeWidth * 2.2, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float componentEdge = max(edgeBand.x, max(edgeBand.y, edgeBand.z)) * outlineStrength;
      vec3 damageColor = modelComponentColor;
      shaded = mix(shaded, damageColor, componentEdge * 0.38);
      shaded += damageColor * componentEdge * 0.05;
      alpha = max(alpha, componentEdge * 0.34);
    } else if (vPatternCode > 4.5) {
      // Weapon and generic collision geometry keeps its base face color. When
      // the source profile declares armor thickness, that base is the same
      // absolute/relative thickness color used by armor; otherwise it is the
      // neutral fallback. Add only a high-white solid outline, without a face
      // hatch, independently of the spaced-armor visibility toggle.
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float outlineCore = max(coreBand.x, max(coreBand.y, coreBand.z));
      float collisionEdge = outlineCore * outlineStrength;
      vec3 collisionColor = modelCollisionColor;
      shaded = mix(shaded, collisionColor, collisionEdge * 0.88);
      shaded += collisionColor * collisionEdge * 0.18;
      alpha = max(alpha, collisionEdge * 0.82);
    } else if (vPatternCode > 3.5) {
      // Damageable non-hull components preserve their engine/ammo/etc. face
      // color, then add a solid lime topology outline. This marker must not
      // disappear with attached armor.
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float outlineCore = max(coreBand.x, max(coreBand.y, coreBand.z)) * outlineStrength;
      vec3 damageColor = modelComponentColor;
      shaded = mix(shaded, damageColor, outlineCore * 0.92);
      shaded += damageColor * outlineCore * 0.18;
      alpha = max(alpha, outlineCore * 0.88);
    } else if (vPatternCode > 2.5) {
      // Preserve the thickness-colored face and use only topology boundaries
      // and sharp creases as a sparse dashed emissive outline. The edge mask is
      // built once on the CPU, so this stays in the existing armor draw.
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 glowBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.5, edgeWidth * 3.6, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      vec3 haloBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.7, edgeWidth * 6.4, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      vec3 coreBand =
        (vec3(1.0) - smoothstep(edgeWidth * 0.25, edgeWidth * 1.35, vOutlineBarycentric)) *
        vSpacedArmorEdgeMask;
      float outlineGlow = max(glowBand.x, max(glowBand.y, glowBand.z)) * outlineStrength;
      float outlineHalo = max(haloBand.x, max(haloBand.y, haloBand.z)) * outlineStrength;
      float outlineCore = max(coreBand.x, max(coreBand.y, coreBand.z)) * outlineStrength;
      float dashPhase = mod(
        gl_FragCoord.x * 0.76 + gl_FragCoord.y * 0.43 + spacedArmorDashOffset,
        15.0
      );
      float dash = 1.0 - smoothstep(8.0, 9.5, dashPhase);
      // Keep the crisp dashed line opaque even though the spaced-armor face
      // is deliberately translucent. The wider glow remains alpha blended.
      spacedArmorOutlineAlpha =
        max(outlineCore, max(outlineGlow * 0.62, outlineHalo * 0.22)) * dash;
      vec3 glowColor = modelSpacedArmorColor;
      float haloStrength = mix(0.1, 0.2, hoveredSurface) * outlineHalo * dash;
      float glowStrength = mix(0.38, 0.58, hoveredSurface) * outlineGlow * dash;
      float coreStrength = mix(0.78, 1.0, hoveredSurface) * outlineCore * dash;
      shaded = mix(shaded, glowColor, glowStrength);
      shaded += glowColor * (coreStrength * 0.46 + haloStrength * 0.24);
    } else if (vPatternCode > 1.5) {
      shaded = mix(shaded, vec3(0.93), hatchStrength * 0.12 * max(diagonal, opposite));
    } else if (vPatternCode > 0.5) {
      // Match the legend's sparse pale-purple diagonal stripes, but rotate
      // their screen-space direction with the NoPen surface normal so angled
      // boards do not all read as one flat screen-aligned patch.
      vec2 projectedNormal = vViewNormal.xy;
      float projectedNormalLength = length(projectedNormal);
      vec2 surfaceStripeDirection = vec2(0.7071, 0.7071);
      if (projectedNormalLength > 0.08) {
        surfaceStripeDirection = normalize(vec2(-projectedNormal.y, projectedNormal.x));
      }
      float noPenDashPhase = mod(
        dot(gl_FragCoord.xy, surfaceStripeDirection) * 0.28,
        18.0
      );
      float noPenDash = 1.0 - smoothstep(4.8, 6.0, noPenDashPhase);
      float noPenDot =
        smoothstep(9.0, 9.35, noPenDashPhase) *
        (1.0 - smoothstep(10.0, 10.35, noPenDashPhase));
      float noPenDotDash = max(noPenDash, noPenDot);
      vec3 edgeWidth = max(fwidth(vOutlineBarycentric), vec3(0.00001));
      vec3 edgeBand =
        vec3(1.0) - smoothstep(edgeWidth * 0.45, edgeWidth * 2.8, vOutlineBarycentric);
      float noPenEdge = max(edgeBand.x, max(edgeBand.y, edgeBand.z));
      vec3 glowColor = modelNoPenetrationColor;
      float glow = noPenEdge * noPenDotDash * outlineStrength;
      shaded = mix(shaded, glowColor, glow * 0.86);
      shaded += glowColor * glow * 0.42;
    }

    if (shapeCueStrength > 0.0) {
      // Keep the purple shape cue from washing the two semantic markers back
      // into the same neutral-looking rim color.
      float semanticPatternCueScale = vPatternCode > 3.5 ? 0.35 : 1.0;
      float backFaceTone = gl_FrontFacing ? 1.0 : 0.66;
      shaded *= mix(1.0, backFaceTone, shapeCueStrength * semanticPatternCueScale);
      float rim = pow(1.0 - abs(normalize(vViewNormal).z), 2.0);
      shaded = mix(
        shaded,
        vec3(0.96, 0.76, 1.0),
        shapeCueStrength * semanticPatternCueScale * rim * 0.38
      );
    }

    float settledDamageHighlight = clamp(
      vDamageHighlight * damageHighlightStrength,
      0.0,
      1.0
    );
    if (settledDamageHighlight > 0.001) {
      float damageRim = pow(
        1.0 - abs(normalize(vViewNormal).z),
        1.45
      );
      float damageTint = settledDamageHighlight * mix(0.16, 0.3, damageRim);
      shaded = mix(shaded, damageHighlightColor, damageTint);
      shaded += damageHighlightColor * settledDamageHighlight * (0.025 + damageRim * 0.045);
    }

    // A spaced plate is an analysis surface, not an opaque replacement for
    // the armor/components behind it. Keep its thickness color in the
    // vertex data, lower only the face alpha, and restore an opaque core for
    // the luminous dashed topology outline.
    if (vPatternCode > 2.5 && vPatternCode < 3.5) {
      alpha = max(alpha * spacedArmorAlphaScale, spacedArmorOutlineAlpha);
    }
    gl_FragColor = vec4(shaded, alpha);
  }
`;

const TRIANGLE_BARYCENTRICS = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
] as const;

const SHARP_EDGE_COSINE = Math.cos((30 * Math.PI) / 180);

interface SpacedArmorEdgeReference {
  triangleIndex: number;
  barycentricAxis: number;
  faceNormal: [number, number, number];
}

function pointKey(positions: Float32Array, offset: number) {
  return `${positions[offset]},${positions[offset + 1]},${positions[offset + 2]}`;
}

function triangleFaceNormal(
  positions: Float32Array,
  triangleIndex: number,
): [number, number, number] {
  const offset = triangleIndex * 9;
  const ux = positions[offset + 3] - positions[offset];
  const uy = positions[offset + 4] - positions[offset + 1];
  const uz = positions[offset + 5] - positions[offset + 2];
  const vx = positions[offset + 6] - positions[offset];
  const vy = positions[offset + 7] - positions[offset + 1];
  const vz = positions[offset + 8] - positions[offset + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 0];
}

function spacedArmorOutlineAttributes(batch: HitSceneRenderBatch) {
  const outlineBarycentrics = new Float32Array(batch.triangleCount * 9);
  const spacedArmorEdgeMasks = new Float32Array(batch.triangleCount * 9);
  const edgeReferences = new Map<string, SpacedArmorEdgeReference[]>();
  const edgeCorners = [
    [1, 2],
    [2, 0],
    [0, 1],
  ] as const;

  for (let triangleIndex = 0; triangleIndex < batch.triangleCount; triangleIndex += 1) {
    outlineBarycentrics.set(TRIANGLE_BARYCENTRICS, triangleIndex * 9);
    if (batch.patternCodes[triangleIndex * 3] <= 2.5) continue;

    const triangleOffset = triangleIndex * 9;
    const componentIndex = batch.componentIndices[triangleIndex];
    const surfaceProfileIndex = batch.surfaceProfileIndices[triangleIndex];
    const faceNormal = triangleFaceNormal(batch.positions, triangleIndex);
    edgeCorners.forEach(([firstCorner, secondCorner], barycentricAxis) => {
      const first = pointKey(batch.positions, triangleOffset + firstCorner * 3);
      const second = pointKey(batch.positions, triangleOffset + secondCorner * 3);
      const orderedEdge = first < second ? `${first}|${second}` : `${second}|${first}`;
      const key = `${componentIndex}:${surfaceProfileIndex}:${orderedEdge}`;
      const references = edgeReferences.get(key) ?? [];
      references.push({ triangleIndex, barycentricAxis, faceNormal });
      edgeReferences.set(key, references);
    });
  }

  for (const references of edgeReferences.values()) {
    const isBoundary = references.length === 1;
    const isSharpCrease =
      references.length === 2 &&
      Math.abs(
        references[0].faceNormal[0] * references[1].faceNormal[0] +
          references[0].faceNormal[1] * references[1].faceNormal[1] +
          references[0].faceNormal[2] * references[1].faceNormal[2],
      ) < SHARP_EDGE_COSINE;
    if (!isBoundary && !isSharpCrease && references.length <= 2) continue;

    for (const reference of references) {
      for (let corner = 0; corner < 3; corner += 1) {
        spacedArmorEdgeMasks[
          reference.triangleIndex * 9 + corner * 3 + reference.barycentricAxis
        ] = 1;
      }
    }
  }

  return { outlineBarycentrics, spacedArmorEdgeMasks };
}

export interface HitSceneRenderMesh extends Mesh<BufferGeometry, ShaderMaterial> {
  userData: {
    hitSceneLayer: HitSceneRenderLayer;
    componentIndices: Uint16Array | Uint32Array;
    surfaceProfileIndices: Uint16Array | Uint32Array;
    sourceTriangleIndices: Uint32Array;
    nominalThicknessMm: Float32Array;
    absoluteColors: Float32Array;
  };
}

export interface HitSceneArmorThicknessRange {
  minMm: number;
  maxMm: number;
  surfaceCount: number;
  distinctThicknessCount: number;
}

export interface HitSceneThreeModel {
  armor: HitSceneRenderMesh;
  armorOverlay: HitSceneRenderMesh;
  blockerOverlay: HitSceneRenderMesh;
  interior: HitSceneRenderMesh;
  armorThicknessRange: HitSceneArmorThicknessRange | null;
  triangleCount: number;
  drawCallUpperBound: 4;
  dispose(): void;
}

interface HitSceneMeshPoseBase {
  positions: Float32Array;
  normals: Float32Array;
}

interface RuntimeHitScenePoseBase {
  positions: Float32Array;
  faceNormals: Float32Array;
}

export interface HitSceneTurretPoseResult {
  appliedComponentCount: number;
  conflictedVertexCount: number;
}

export interface HitSceneComponentPose {
  componentIndex: number;
  matrix: readonly number[];
}

const hitSceneMeshPoseBases = new WeakMap<
  HitSceneRenderMesh,
  HitSceneMeshPoseBase
>();
const runtimeHitScenePoseBases = new WeakMap<
  ParsedRuntimeHitScene,
  RuntimeHitScenePoseBase
>();

function createGeometry(batch: HitSceneRenderBatch) {
  const geometry = new BufferGeometry();
  const { outlineBarycentrics, spacedArmorEdgeMasks } = spacedArmorOutlineAttributes(batch);
  const surfaceProfileCodes = new Float32Array(batch.triangleCount * 3);
  const damageHighlights = new Float32Array(batch.triangleCount * 3);
  for (let triangleIndex = 0; triangleIndex < batch.triangleCount; triangleIndex += 1) {
    surfaceProfileCodes.fill(
      batch.surfaceProfileIndices[triangleIndex],
      triangleIndex * 3,
      triangleIndex * 3 + 3,
    );
  }
  geometry.setAttribute("position", new BufferAttribute(batch.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(batch.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(batch.colors, 3));
  geometry.setAttribute("surfaceOpacity", new BufferAttribute(batch.opacities, 1));
  geometry.setAttribute("patternCode", new BufferAttribute(batch.patternCodes, 1));
  geometry.setAttribute("surfaceProfileCode", new BufferAttribute(surfaceProfileCodes, 1));
  geometry.setAttribute("damageHighlight", new BufferAttribute(damageHighlights, 1));
  geometry.setAttribute("outlineBarycentric", new BufferAttribute(outlineBarycentrics, 3));
  geometry.setAttribute("spacedArmorEdgeMask", new BufferAttribute(spacedArmorEdgeMasks, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export const INTERIOR_MODE_ARMOR_OPACITY = 0.16;
export const INTERIOR_MODE_NON_INTERIOR_OUTLINE_STRENGTH = 0.28;
export const ARMOR_MODE_BLOCKER_OPACITY = 0.16;
export const SPACED_ARMOR_ALPHA_SCALE = 0.42;
export const SPACED_ARMOR_DASH_CYCLE_SECONDS = 8;
const SPACED_ARMOR_DASH_CYCLE_UNITS = 15;

function createMaterial(layer: HitSceneRenderLayer) {
  const isBlocker = layer === "blocker-overlay";
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      globalOpacity: { value: 1 },
      // The blocker remains a faint through-shell cue in armor mode; its
      // categorical NoPen outline is drawn in this same material.
      hatchStrength: { value: isBlocker ? 0 : 1 },
      shapeCueStrength: { value: isBlocker ? 1 : 0 },
      hoveredSurfaceProfileCode: { value: -1 },
      specialArmorVisible: { value: 1 },
      exteriorSpacedArmorOnly: { value: 0 },
      spacedArmorAlphaScale: { value: SPACED_ARMOR_ALPHA_SCALE },
      spacedArmorDashOffset: { value: 0 },
      outlineStrength: { value: 1 },
      modelSpacedArmorColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS["spaced-armor"]) },
      modelNoPenetrationColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS["no-penetration"]) },
      modelComponentColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS.component) },
      modelEngineColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS.engine) },
      modelAmmoRackColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS["ammo-rack"]) },
      modelCollisionColor: { value: new Color(VEHICLE_MODEL_CATEGORY_COLORS.collision) },
      damageHighlightColor: { value: new Color(0xffc45c) },
      damageHighlightStrength: { value: 0 },
    },
    side: DoubleSide,
    transparent: layer !== "interior",
    depthTest: layer !== "blocker-overlay",
    depthWrite: layer !== "armor-overlay" && layer !== "blocker-overlay",
    toneMapped: false,
  });
}

function createMesh(batch: HitSceneRenderBatch): HitSceneRenderMesh {
  const mesh = new Mesh(createGeometry(batch), createMaterial(batch.layer)) as HitSceneRenderMesh;
  mesh.name = `editor-hit-scene-${batch.layer}`;
  mesh.renderOrder = batch.layer === "blocker-overlay" ? 2 : batch.layer === "armor-overlay" ? 1 : 0;
  mesh.userData = {
    hitSceneLayer: batch.layer,
    componentIndices: batch.componentIndices,
    surfaceProfileIndices: batch.surfaceProfileIndices,
    sourceTriangleIndices: batch.sourceTriangleIndices,
    nominalThicknessMm: batch.nominalThicknessMm,
    absoluteColors: Float32Array.from(batch.colors),
  };
  hitSceneMeshPoseBases.set(mesh, {
    positions: Float32Array.from(batch.positions),
    normals: Float32Array.from(batch.normals),
  });
  return mesh;
}

function modelMeshes(model: HitSceneThreeModel) {
  return [model.armor, model.armorOverlay, model.blockerOverlay, model.interior] as const;
}

const hitSceneDamageHighlightStates = new WeakMap<
  HitSceneThreeModel,
  { componentKey: string; colorHex: number }
>();

function armorThicknessRange(
  meshes: readonly HitSceneRenderMesh[],
): HitSceneArmorThicknessRange | null {
  let minMm = Number.POSITIVE_INFINITY;
  let maxMm = Number.NEGATIVE_INFINITY;
  let surfaceCount = 0;
  const distinctThicknesses = new Set<number>();
  for (const mesh of meshes) {
    for (const thicknessMm of mesh.userData.nominalThicknessMm) {
      if (!Number.isFinite(thicknessMm)) continue;
      minMm = Math.min(minMm, thicknessMm);
      maxMm = Math.max(maxMm, thicknessMm);
      surfaceCount += 1;
      distinctThicknesses.add(thicknessMm);
    }
  }
  if (surfaceCount === 0) return null;
  return {
    minMm,
    maxMm,
    surfaceCount,
    distinctThicknessCount: distinctThicknesses.size,
  };
}

export function createHitSceneThreeModel(pack: ParsedHitSceneRuntime): HitSceneThreeModel {
  const batches = buildHitSceneRenderBatches(pack);
  const armor = createMesh(batches.armor);
  const armorOverlay = createMesh(batches.armorOverlay);
  const blockerOverlay = createMesh(batches.blockerOverlay);
  const interior = createMesh(batches.interior);
  const meshes = [armor, armorOverlay, blockerOverlay, interior] as const;
  return {
    armor,
    armorOverlay,
    blockerOverlay,
    interior,
    armorThicknessRange: armorThicknessRange(meshes),
    triangleCount: batches.renderTriangleCount,
    drawCallUpperBound: batches.drawCallUpperBound,
    dispose() {
      armor.geometry.dispose();
      armor.material.dispose();
      armorOverlay.geometry.dispose();
      armorOverlay.material.dispose();
      blockerOverlay.geometry.dispose();
      blockerOverlay.material.dispose();
      interior.geometry.dispose();
      interior.material.dispose();
    },
  };
}

function transformPosition(
  source: Float32Array,
  sourceOffset: number,
  target: Float32Array,
  targetOffset: number,
  matrix: readonly number[],
) {
  const x = source[sourceOffset];
  const y = source[sourceOffset + 1];
  const z = source[sourceOffset + 2];
  target[targetOffset] =
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  target[targetOffset + 1] =
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  target[targetOffset + 2] =
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
}

function transformNormal(
  source: Float32Array,
  sourceOffset: number,
  target: Float32Array,
  targetOffset: number,
  matrix: readonly number[],
) {
  const x = source[sourceOffset];
  const y = source[sourceOffset + 1];
  const z = source[sourceOffset + 2];
  const transformedX = matrix[0] * x + matrix[4] * y + matrix[8] * z;
  const transformedY = matrix[1] * x + matrix[5] * y + matrix[9] * z;
  const transformedZ = matrix[2] * x + matrix[6] * y + matrix[10] * z;
  const length = Math.hypot(transformedX, transformedY, transformedZ) || 1;
  target[targetOffset] = transformedX / length;
  target[targetOffset + 1] = transformedY / length;
  target[targetOffset + 2] = transformedZ / length;
}

function applyRenderMeshComponentPoses(
  mesh: HitSceneRenderMesh,
  componentMatrices: ReadonlyMap<number, readonly number[]>,
) {
  const base = hitSceneMeshPoseBases.get(mesh);
  if (!base) throw new Error(`Missing pose base for ${mesh.name}`);
  const positionAttribute = mesh.geometry.getAttribute("position");
  const normalAttribute = mesh.geometry.getAttribute("normal");
  const positions = positionAttribute.array as Float32Array;
  const normals = normalAttribute.array as Float32Array;
  positions.set(base.positions);
  normals.set(base.normals);

  for (
    let triangleIndex = 0;
    triangleIndex < mesh.userData.componentIndices.length;
    triangleIndex += 1
  ) {
    const matrix = componentMatrices.get(
      mesh.userData.componentIndices[triangleIndex],
    );
    if (!matrix) continue;
    const triangleOffset = triangleIndex * 9;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexOffset = triangleOffset + corner * 3;
      transformPosition(
        base.positions,
        vertexOffset,
        positions,
        vertexOffset,
        matrix,
      );
      transformNormal(
        base.normals,
        vertexOffset,
        normals,
        vertexOffset,
        matrix,
      );
    }
  }

  positionAttribute.needsUpdate = true;
  normalAttribute.needsUpdate = true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

/**
 * Apply exact component-bound poses to both the visible hit meshes and the
 * raycast/BVH geometry. Every update starts from immutable base data, so
 * parent/child station composition cannot accumulate floating-point drift.
 */
export function setHitSceneThreeModelComponentPoses(
  model: HitSceneThreeModel,
  pack: ParsedRuntimeHitScene,
  {
    componentPoses,
  }: {
    componentPoses: readonly HitSceneComponentPose[];
  },
): HitSceneTurretPoseResult {
  const componentMatrices = new Map<number, readonly number[]>();
  for (const pose of componentPoses) {
    if (
      !Number.isInteger(pose.componentIndex) ||
      pose.componentIndex < 0 ||
      pose.matrix.length !== 16 ||
      componentMatrices.has(pose.componentIndex)
    ) {
      throw new Error("Component pose entries must be unique and contain 16-value matrices");
    }
    componentMatrices.set(pose.componentIndex, pose.matrix);
  }
  for (const mesh of modelMeshes(model)) {
    applyRenderMeshComponentPoses(mesh, componentMatrices);
  }

  let base = runtimeHitScenePoseBases.get(pack);
  if (!base) {
    base = {
      positions: Float32Array.from(pack.positions),
      faceNormals: Float32Array.from(pack.faceNormals),
    };
    runtimeHitScenePoseBases.set(pack, base);
  }
  pack.positions.set(base.positions);
  pack.faceNormals.set(base.faceNormals);

  const matrixIds = new Map<string, number>();
  const matricesById: Array<readonly number[] | null> = [null];
  const componentMatrixIds = new Map<number, number>();
  for (const [componentIndex, matrix] of componentMatrices) {
    const identity = matrix.join(",");
    let matrixId = matrixIds.get(identity);
    if (matrixId === undefined) {
      matrixId = matricesById.length;
      matrixIds.set(identity, matrixId);
      matricesById.push(matrix);
    }
    componentMatrixIds.set(componentIndex, matrixId);
  }
  const vertexModes = new Int32Array(pack.header.counts.vertices);
  vertexModes.fill(-1);
  const appliedComponents = new Set<number>();
  for (
    let triangleIndex = 0;
    triangleIndex < pack.header.counts.triangles;
    triangleIndex += 1
  ) {
    const componentIndex = pack.triangleComponentIndex[triangleIndex];
    const mode = componentMatrixIds.get(componentIndex) ?? 0;
    if (mode > 0) appliedComponents.add(componentIndex);
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = pack.indices[triangleIndex * 3 + corner];
      const existingMode = vertexModes[vertexIndex];
      if (existingMode === -1) vertexModes[vertexIndex] = mode;
      else if (existingMode !== mode) vertexModes[vertexIndex] = -2;
    }
    if (mode === 0) continue;
    const matrix = matricesById[mode];
    if (!matrix) continue;
    transformNormal(
      base.faceNormals,
      triangleIndex * 3,
      pack.faceNormals,
      triangleIndex * 3,
      matrix,
    );
  }

  let conflictedVertexCount = 0;
  for (let vertexIndex = 0; vertexIndex < vertexModes.length; vertexIndex += 1) {
    const mode = vertexModes[vertexIndex];
    if (mode === -2) {
      conflictedVertexCount += 1;
      continue;
    }
    if (mode <= 0) continue;
    const matrix = matricesById[mode];
    if (!matrix) continue;
    transformPosition(
      base.positions,
      vertexIndex * 3,
      pack.positions,
      vertexIndex * 3,
      matrix,
    );
  }

  const analysisPositionAttribute = pack.analysisGeometry.getAttribute("position");
  analysisPositionAttribute.needsUpdate = true;
  pack.analysisGeometry.computeBoundingBox();
  pack.analysisGeometry.computeBoundingSphere();
  pack.boundsTree.refit();

  return {
    appliedComponentCount: appliedComponents.size,
    conflictedVertexCount,
  };
}

/**
 * Backward-compatible single-station wrapper used by focused renderer tests.
 */
export function setHitSceneThreeModelTurretPose(
  model: HitSceneThreeModel,
  pack: ParsedRuntimeHitScene,
  {
    yawComponentIndices,
    pitchComponentIndices,
    yawMatrix,
    yawPitchMatrix,
  }: {
    yawComponentIndices: readonly number[];
    pitchComponentIndices: readonly number[];
    yawMatrix: readonly number[];
    yawPitchMatrix: readonly number[];
  },
): HitSceneTurretPoseResult {
  if (yawMatrix.length !== 16 || yawPitchMatrix.length !== 16) {
    throw new Error("Turret pose matrices must contain 16 values");
  }
  const pitchComponents = new Set(pitchComponentIndices);
  const componentMatrices = new Map<number, readonly number[]>();
  for (const componentIndex of yawComponentIndices) {
    componentMatrices.set(
      componentIndex,
      pitchComponents.has(componentIndex) ? yawPitchMatrix : yawMatrix,
    );
  }
  return setHitSceneThreeModelComponentPoses(model, pack, {
    componentPoses: [...componentMatrices].map(
      ([componentIndex, matrix]) => ({ componentIndex, matrix }),
    ),
  });
}

export function setHitSceneThreeModelArmorThicknessScale(
  model: HitSceneThreeModel,
  mode: "absolute" | "relative",
) {
  const range = model.armorThicknessRange;
  for (const mesh of modelMeshes(model)) {
    const colorAttribute = mesh.geometry.getAttribute("color");
    const colors = colorAttribute.array as Float32Array;
    colors.set(mesh.userData.absoluteColors);
    if (mode === "relative" && range) {
      for (
        let triangleIndex = 0;
        triangleIndex < mesh.userData.nominalThicknessMm.length;
        triangleIndex += 1
      ) {
        const thicknessMm = mesh.userData.nominalThicknessMm[triangleIndex];
        if (!Number.isFinite(thicknessMm)) continue;
        const rgb = relativeArmorThicknessRgb(
          thicknessMm,
          range.minMm,
          range.maxMm,
        );
        const triangleOffset = triangleIndex * 9;
        for (let corner = 0; corner < 3; corner += 1) {
          const colorOffset = triangleOffset + corner * 3;
          colors[colorOffset] = rgb[0];
          colors[colorOffset + 1] = rgb[1];
          colors[colorOffset + 2] = rgb[2];
        }
      }
    }
    colorAttribute.needsUpdate = true;
  }
}

export function setHitSceneThreeModelMode(
  model: HitSceneThreeModel,
  mode: "exterior" | "armor" | "interior",
  exteriorSpacedArmorHighlight = false,
) {
  const showExteriorSpacedArmor =
    mode === "exterior" && exteriorSpacedArmorHighlight;
  model.armor.visible = mode !== "exterior";
  model.armorOverlay.visible = mode !== "exterior" || showExteriorSpacedArmor;
  model.blockerOverlay.visible = mode !== "exterior";
  model.interior.visible = mode === "interior";
  for (const mesh of modelMeshes(model)) {
    mesh.material.uniforms.exteriorSpacedArmorOnly.value =
      showExteriorSpacedArmor ? 1 : 0;
  }
  model.armor.material.uniforms.globalOpacity.value =
    mode === "interior" ? INTERIOR_MODE_ARMOR_OPACITY : 1;
  // A transparent shell must not populate the depth buffer in interior mode:
  // otherwise its nearest face discards the engine/ammo geometry behind it,
  // especially from side and rear camera angles.
  model.armor.material.depthWrite = mode !== "interior";
  model.armorOverlay.material.uniforms.globalOpacity.value =
    mode === "interior" ? INTERIOR_MODE_ARMOR_OPACITY : 1;
  model.armorOverlay.material.depthWrite = false;
  model.blockerOverlay.material.uniforms.globalOpacity.value =
    mode === "armor" ? ARMOR_MODE_BLOCKER_OPACITY : 1;
  // Keep the NoPen overlay faintly visible through the shell in armor mode.
  model.blockerOverlay.material.depthTest = mode === "interior";
  // Writing the nearest blocker surface in interior mode prevents unsorted
  // transparent back faces from creating a misleading checkerboard volume.
  model.blockerOverlay.material.depthWrite = mode === "interior";
  model.interior.material.uniforms.globalOpacity.value = 1;
  model.interior.material.depthWrite = true;
  const nonInteriorOutlineStrength =
    mode === "interior" ? INTERIOR_MODE_NON_INTERIOR_OUTLINE_STRENGTH : 1;
  model.armor.material.uniforms.outlineStrength.value = nonInteriorOutlineStrength;
  model.armorOverlay.material.uniforms.outlineStrength.value =
    nonInteriorOutlineStrength;
  model.blockerOverlay.material.uniforms.outlineStrength.value =
    nonInteriorOutlineStrength;
  model.interior.material.uniforms.outlineStrength.value = 1;
}

export function setHitSceneThreeModelDamageHighlight(
  model: HitSceneThreeModel,
  {
    componentIndices,
    colorHex,
    strength,
  }: {
    componentIndices: readonly number[];
    colorHex: number;
    strength: number;
  },
) {
  const normalizedComponentIndices = Array.from(new Set(
    componentIndices.filter(
      (componentIndex) =>
        Number.isInteger(componentIndex) && componentIndex >= 0,
    ),
  )).sort((left, right) => left - right);
  const componentKey = normalizedComponentIndices.join(",");
  const safeColorHex = Number.isFinite(colorHex)
    ? Math.trunc(colorHex) & 0xffffff
    : 0xffc45c;
  const previous = hitSceneDamageHighlightStates.get(model);

  if (previous?.componentKey !== componentKey) {
    const highlightedComponents = new Set(normalizedComponentIndices);
    for (const mesh of modelMeshes(model)) {
      const highlightAttribute = mesh.geometry.getAttribute("damageHighlight");
      const highlightValues = highlightAttribute.array as Float32Array;
      for (
        let triangleIndex = 0;
        triangleIndex < mesh.userData.componentIndices.length;
        triangleIndex += 1
      ) {
        highlightValues.fill(
          highlightedComponents.has(
            mesh.userData.componentIndices[triangleIndex],
          )
            ? 1
            : 0,
          triangleIndex * 3,
          triangleIndex * 3 + 3,
        );
      }
      highlightAttribute.needsUpdate = true;
    }
  }

  if (previous?.colorHex !== safeColorHex) {
    for (const mesh of modelMeshes(model)) {
      mesh.material.uniforms.damageHighlightColor.value.setHex(safeColorHex);
    }
  }

  const safeStrength = Number.isFinite(strength)
    ? Math.max(0, Math.min(1, strength))
    : 0;
  for (const mesh of modelMeshes(model)) {
    mesh.material.uniforms.damageHighlightStrength.value =
      mesh.userData.hitSceneLayer === "armor-overlay" ||
        mesh.userData.hitSceneLayer === "blocker-overlay"
        ? 0
        : safeStrength;
  }
  hitSceneDamageHighlightStates.set(model, {
    componentKey,
    colorHex: safeColorHex,
  });
}

export function clearHitSceneThreeModelDamageHighlight(
  model: HitSceneThreeModel,
) {
  setHitSceneThreeModelDamageHighlight(model, {
    componentIndices: [],
    colorHex: 0xffc45c,
    strength: 0,
  });
}

export function setHitSceneThreeModelHoveredProfile(
  model: HitSceneThreeModel,
  surfaceProfileIndex: number | null,
) {
  const value = surfaceProfileIndex ?? -1;
  for (const mesh of modelMeshes(model)) {
    mesh.material.uniforms.hoveredSurfaceProfileCode.value = value;
  }
}

export function setHitSceneThreeModelSpecialArmorVisible(
  model: HitSceneThreeModel,
  visible: boolean,
) {
  const value = visible ? 1 : 0;
  for (const mesh of modelMeshes(model)) {
    mesh.material.uniforms.specialArmorVisible.value = value;
  }
}

export function setHitSceneThreeModelSpacedArmorAnimationTime(
  model: HitSceneThreeModel,
  elapsedSeconds: number,
) {
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const wrappedSeconds = (
    (safeElapsedSeconds % SPACED_ARMOR_DASH_CYCLE_SECONDS) +
    SPACED_ARMOR_DASH_CYCLE_SECONDS
  ) % SPACED_ARMOR_DASH_CYCLE_SECONDS;
  const dashOffset = (
    wrappedSeconds / SPACED_ARMOR_DASH_CYCLE_SECONDS
  ) * SPACED_ARMOR_DASH_CYCLE_UNITS;
  for (const mesh of modelMeshes(model)) {
    mesh.material.uniforms.spacedArmorDashOffset.value = dashOffset;
  }
}
