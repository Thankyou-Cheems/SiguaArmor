import {
  armorCategoricalStyle,
  armorThicknessStyle,
  type ArmorSurfaceVisualStyle,
} from "./armor-thickness-ramp.ts";
import type {
  Evidence,
  HitSceneComponent,
  HitSceneSurfaceProfile,
  ParsedHitSceneRuntime,
} from "./runtime-hit-scene";

export type HitSceneRenderLayer =
  | "armor"
  | "armor-overlay"
  | "blocker-overlay"
  | "interior";

export interface HitSceneRenderBatch {
  layer: HitSceneRenderLayer;
  triangleCount: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  opacities: Float32Array;
  patternCodes: Float32Array;
  componentIndices: Uint16Array | Uint32Array;
  surfaceProfileIndices: Uint16Array | Uint32Array;
  sourceTriangleIndices: Uint32Array;
  nominalThicknessMm: Float32Array;
}

export interface HitSceneRenderBatches {
  armor: HitSceneRenderBatch;
  armorOverlay: HitSceneRenderBatch;
  blockerOverlay: HitSceneRenderBatch;
  interior: HitSceneRenderBatch;
  sourceTriangleCount: number;
  renderTriangleCount: number;
  drawCallUpperBound: 4;
}

export interface SpacedArmorSurfaceInfo {
  isSpacedArmor: boolean;
  damageAbsorbed: number | null;
}

export interface NoPenetrationSurfaceInfo {
  isNoPenetration: boolean;
}

const SPACED_ARMOR_MATERIAL_IDENTITY = /(?:add.?on|no.?pass|sideskirt|spaced|hatch)/iu;
const SPACED_ARMOR_PATTERN_CODE = 3 as const;

const INTERIOR_STYLES: Readonly<Record<"engine" | "ammo-rack" | "other", ArmorSurfaceVisualStyle>> = {
  engine: {
    category: "unknown",
    // Match the orange engine accent used by the damage-resolution card.
    rgb: [1, 156 / 255, 82 / 255],
    opacity: 1,
    depthWrite: true,
    pattern: "none",
    normalizedThickness: null,
    thicknessMm: null,
  },
  "ammo-rack": {
    category: "unknown",
    rgb: [0.91, 0.12, 0.16],
    opacity: 1,
    depthWrite: true,
    pattern: "none",
    normalizedThickness: null,
    thicknessMm: null,
  },
  other: {
    category: "unknown",
    rgb: [0.35, 0.67, 0.92],
    opacity: 1,
    depthWrite: true,
    pattern: "none",
    normalizedThickness: null,
    thicknessMm: null,
  },
};

/**
 * Gun collision without explicit thickness remains contextual hit geometry.
 * Its common PhysMat_Default profile reports allowPenetration=false, which
 * would otherwise paint a fine barrel with the penetration-blocker hatch.
 * Thickness-bearing gun collision is handled by armorThicknessStyle instead;
 * both paths retain pattern code 5 and its broken white outline.
 */
const GUN_COLLISION_FALLBACK_STYLE: ArmorSurfaceVisualStyle = {
  category: "unknown",
  rgb: [54 / 255, 58 / 255, 68 / 255],
  opacity: 0.34,
  depthWrite: false,
  pattern: "none",
  normalizedThickness: null,
  thicknessMm: null,
};

function fail(message: string): never {
  throw new Error(`Invalid Editor render geometry: ${message}`);
}

function evidenceBoolean(field: Evidence<boolean>, label: string): boolean | null {
  if (field.state === "observed" || field.state === "derived") {
    if (typeof field.value !== "boolean") fail(`${label} has ${field.state} state without a boolean`);
    return field.value;
  }
  return null;
}

function evidenceNonNegativeNumber(field: Evidence<number>, label: string): number | null {
  if (field.state !== "observed" && field.state !== "derived") return null;
  if (typeof field.value !== "number" || !Number.isFinite(field.value) || field.value < 0) {
    fail(`${label} has ${field.state} state without a finite non-negative value`);
  }
  return field.value;
}

function profileArmorThicknessMm(profile: HitSceneSurfaceProfile) {
  return evidenceNonNegativeNumber(
    profile.armorThicknessMm,
    `${profile.surfaceProfileId}.armorThicknessMm`,
  );
}

/**
 * Resolves the gameplay semantics that make a penetrable armor surface act as
 * spaced armor. The test is deliberately fail-closed: missing or unresolved
 * evidence never becomes a visual label.
 */
export function spacedArmorSurfaceInfo(
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
): SpacedArmorSurfaceInfo {
  const allowPenetration = evidenceBoolean(
    profile.allowPenetration,
    `${profile.surfaceProfileId}.allowPenetration`,
  );
  const damageParentActor = evidenceBoolean(
    profile.damageParentActor,
    `${profile.surfaceProfileId}.damageParentActor`,
  );
  const damageAbsorbed = evidenceNonNegativeNumber(
    profile.damageAbsorbed,
    `${profile.surfaceProfileId}.damageAbsorbed`,
  );
  const materialPath =
    profile.physicalMaterialPath.state === "observed" ||
    profile.physicalMaterialPath.state === "derived"
      ? profile.physicalMaterialPath.value
      : null;
  return {
    isSpacedArmor:
      component.semanticKind === "armor" &&
      allowPenetration === true &&
      damageParentActor === false &&
      damageAbsorbed !== null &&
      damageAbsorbed > 0 &&
      typeof materialPath === "string" &&
      SPACED_ARMOR_MATERIAL_IDENTITY.test(materialPath),
    damageAbsorbed,
  };
}

/**
 * Some current Editor exports expose a NoPen plate as a generically named
 * StaticMeshComponent. In that case the component-level semantic remains
 * `gun-collision`, while the effective physical material still carries the
 * authoritative NoPen identity and penetration flag. Use both evidence
 * channels so these plates render like the older M1A2 blocker without turning
 * ordinary PhysMat_Default gun collision into a blocker.
 */
export function noPenetrationSurfaceInfo(
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
): NoPenetrationSurfaceInfo {
  if (component.semanticKind === "penetration-blocker") {
    return { isNoPenetration: true };
  }
  const allowPenetration = evidenceBoolean(
    profile.allowPenetration,
    `${profile.surfaceProfileId}.allowPenetration`,
  );
  const materialPath =
    profile.physicalMaterialPath.state === "observed" ||
    profile.physicalMaterialPath.state === "derived"
      ? profile.physicalMaterialPath.value
      : null;
  return {
    isNoPenetration:
      allowPenetration === false &&
      typeof materialPath === "string" &&
      /no[_ -]?penetration/u.test(materialPath.toLocaleLowerCase("en")),
  };
}

function renderLayer(
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
): HitSceneRenderLayer {
  if (component.semanticKind === "engine" ||
    component.semanticKind === "ammo-rack" ||
    component.semanticKind === "other") {
    return "interior";
  }
  // NoPen meshes are commonly placed behind the visible hull as internal
  // gameplay baffles. They need their own late draw: armor mode reveals that
  // layer through the hull, while interior mode restores normal depth testing
  // so nearer damageable components can occlude it. Sharing the mobility
  // overlay would make tracks and gun collision visible through the vehicle.
  if (noPenetrationSurfaceInfo(component, profile).isNoPenetration) {
    return "blocker-overlay";
  }
  const allowPenetration = evidenceBoolean(
    profile.allowPenetration,
    `${profile.surfaceProfileId}.allowPenetration`,
  );
  if (allowPenetration === false && component.semanticKind !== "gun-collision") {
    return "blocker-overlay";
  }
  // Spaced armor is intentionally translucent. Keep it in the existing
  // non-depth-writing overlay so the armor and components behind it remain
  // visible when the camera looks through the add-on plate.
  if (spacedArmorSurfaceInfo(component, profile).isSpacedArmor) {
    return "armor-overlay";
  }
  return profileStyle(component, profile).depthWrite ? "armor" : "armor-overlay";
}

function profileStyle(
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
): ArmorSurfaceVisualStyle {
  if (component.semanticKind === "engine") return INTERIOR_STYLES.engine;
  if (component.semanticKind === "ammo-rack") return INTERIOR_STYLES["ammo-rack"];
  if (component.semanticKind === "other") return INTERIOR_STYLES.other;
  if (noPenetrationSurfaceInfo(component, profile).isNoPenetration) {
    return armorCategoricalStyle("no-penetration");
  }
  if (component.semanticKind === "gun-collision") {
    const thicknessMm = profileArmorThicknessMm(profile);
    return thicknessMm === null
      ? GUN_COLLISION_FALLBACK_STYLE
      : armorThicknessStyle(thicknessMm);
  }
  if (component.semanticKind === "track" || component.semanticKind === "wheel") {
    return armorCategoricalStyle("track-wheel");
  }

  const allowPenetration = evidenceBoolean(
    profile.allowPenetration,
    `${profile.surfaceProfileId}.allowPenetration`,
  );
  if (allowPenetration === false) return armorCategoricalStyle("no-penetration");

  const thicknessMm = profileArmorThicknessMm(profile);
  return thicknessMm === null
    ? armorCategoricalStyle("unknown")
    : armorThicknessStyle(thicknessMm);
}

function patternCode(
  pack: ParsedHitSceneRuntime,
  style: ArmorSurfaceVisualStyle,
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
): number {
  if (spacedArmorSurfaceInfo(component, profile).isSpacedArmor) {
    return SPACED_ARMOR_PATTERN_CODE;
  }
  if (
    component.semanticKind === "gun-collision" &&
    !noPenetrationSurfaceInfo(component, profile).isNoPenetration
  ) return 5;
  // Interior semantics use distinct procedural materials in the shared
  // interior draw call: engine = diamond mechanical mesh, ammo = rack grid.
  if (component.semanticKind === "engine") return 6;
  if (component.semanticKind === "ammo-rack") return 7;
  if (componentOnlyDamageSurfaceInfo(pack, component, profile)) return 4;
  if (style.pattern === "diagonal-hatch") return 1;
  if (style.pattern === "cross-hatch") return 2;
  return 0;
}

export function componentOnlyDamageSurfaceInfo(
  pack: Pick<ParsedHitSceneRuntime, "header">,
  component: HitSceneComponent,
  profile: HitSceneSurfaceProfile,
) {
  // Spaced armor is an armor surface cue, even when it absorbs damage without
  // forwarding it. Keep it on the existing cyan dashed outline instead.
  if (spacedArmorSurfaceInfo(component, profile).isSpacedArmor) return false;
  // Gun-collision meshes (barrels, launchers, and similar hit geometry) use a
  // dedicated high-white outline in patternCode above. They must never inherit
  // the cyan attached-armor cue or its visibility toggle.
  if (noPenetrationSurfaceInfo(component, profile).isNoPenetration) return false;
  const directDamagePoolIndex = evidenceNonNegativeNumber(
    component.directDamagePoolIndex,
    `${component.componentId}.directDamagePoolIndex`,
  );
  if (directDamagePoolIndex === null) return false;
  const pool = pack.header.healthPools[directDamagePoolIndex];
  if (!pool || pool.kind === "hull") return false;
  if (pool.kind === "seat") {
    const passDamage = evidenceBoolean(
      pool.passDamageToParent,
      `${pool.poolId}.passDamageToParent`,
    );
    const passPointDamage = evidenceBoolean(
      pool.passPointDamageToParent,
      `${pool.poolId}.passPointDamageToParent`,
    );
    return passDamage === false || passPointDamage === false;
  }
  return ["engine", "ammo-rack", "track", "wheel", "other"].includes(pool.kind);
}

interface MutableBatch {
  sourceTriangles: number[];
  components: number[];
  profiles: number[];
}

function typedIndexArray(values: readonly number[], upperBound: number) {
  return upperBound <= 0xffff ? Uint16Array.from(values) : Uint32Array.from(values);
}

function materializeBatch(
  pack: ParsedHitSceneRuntime,
  layer: HitSceneRenderLayer,
  selection: MutableBatch,
): HitSceneRenderBatch {
  const triangleCount = selection.sourceTriangles.length;
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  const colors = new Float32Array(triangleCount * 9);
  const opacities = new Float32Array(triangleCount * 3);
  const patternCodes = new Float32Array(triangleCount * 3);
  const nominalThicknessMm = new Float32Array(triangleCount);

  selection.sourceTriangles.forEach((sourceTriangleIndex, outputTriangleIndex) => {
    const profileIndex = selection.profiles[outputTriangleIndex];
    const componentIndex = selection.components[outputTriangleIndex];
    const profile = pack.header.surfaceProfiles[profileIndex];
    const component = pack.header.components[componentIndex];
    const style = profileStyle(component, profile);
    nominalThicknessMm[outputTriangleIndex] = style.thicknessMm ?? Number.NaN;

    const sourceNormalOffset = sourceTriangleIndex * 3;
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceVertexIndex = pack.indices[sourceTriangleIndex * 3 + corner];
      if (sourceVertexIndex >= pack.header.counts.vertices) {
        fail(`triangle ${sourceTriangleIndex} references vertex ${sourceVertexIndex} out of range`);
      }
      const outputVertexOffset = outputTriangleIndex * 9 + corner * 3;
      const sourceVertexOffset = sourceVertexIndex * 3;
      positions[outputVertexOffset] = pack.positions[sourceVertexOffset];
      positions[outputVertexOffset + 1] = pack.positions[sourceVertexOffset + 1];
      positions[outputVertexOffset + 2] = pack.positions[sourceVertexOffset + 2];
      normals[outputVertexOffset] = pack.faceNormals[sourceNormalOffset];
      normals[outputVertexOffset + 1] = pack.faceNormals[sourceNormalOffset + 1];
      normals[outputVertexOffset + 2] = pack.faceNormals[sourceNormalOffset + 2];
      colors[outputVertexOffset] = style.rgb[0];
      colors[outputVertexOffset + 1] = style.rgb[1];
      colors[outputVertexOffset + 2] = style.rgb[2];
      opacities[outputTriangleIndex * 3 + corner] = style.opacity;
      patternCodes[outputTriangleIndex * 3 + corner] = patternCode(
        pack,
        style,
        component,
        profile,
      );
    }
  });

  return {
    layer,
    triangleCount,
    positions,
    normals,
    colors,
    opacities,
    patternCodes,
    componentIndices: typedIndexArray(selection.components, pack.header.counts.components),
    surfaceProfileIndices: typedIndexArray(
      selection.profiles,
      pack.header.counts.surfaceProfiles,
    ),
    sourceTriangleIndices: Uint32Array.from(selection.sourceTriangles),
    nominalThicknessMm,
  };
}

/**
 * Builds four non-indexed GPU batches from the exact analysis triangles.
 *
 * Depth-writing armor is separated from translucent tracks, wheels, and other
 * overlays so those surfaces cannot hide armor behind them. Internal NoPen
 * baffles use a separate mode-aware overlay: armor mode reveals them through
 * the exterior hull, while interior mode uses normal depth relationships. The
 * interior batch contains damageable internals. Thickness is resolved from the
 * same triangle -> surface-profile table used by the hit worker, so the viewer
 * cannot silently fall back to a dense section index or asset default.
 */
export function buildHitSceneRenderBatches(pack: ParsedHitSceneRuntime): HitSceneRenderBatches {
  const selections: Record<HitSceneRenderLayer, MutableBatch> = {
    armor: { sourceTriangles: [], components: [], profiles: [] },
    "armor-overlay": { sourceTriangles: [], components: [], profiles: [] },
    "blocker-overlay": { sourceTriangles: [], components: [], profiles: [] },
    interior: { sourceTriangles: [], components: [], profiles: [] },
  };

  for (let triangleIndex = 0; triangleIndex < pack.header.counts.triangles; triangleIndex += 1) {
    const componentIndex = pack.triangleComponentIndex[triangleIndex];
    const profileIndex = pack.triangleSurfaceProfileIndex[triangleIndex];
    const component = pack.header.components[componentIndex];
    const profile = pack.header.surfaceProfiles[profileIndex];
    if (!component) fail(`triangle ${triangleIndex} has unknown component ${componentIndex}`);
    if (!profile) fail(`triangle ${triangleIndex} has unknown surface profile ${profileIndex}`);
    if (profile.componentIndex !== componentIndex) {
      fail(
        `triangle ${triangleIndex} component ${componentIndex} does not match surface profile ${profileIndex} component ${profile.componentIndex}`,
      );
    }
    const layer = renderLayer(component, profile);
    selections[layer].sourceTriangles.push(triangleIndex);
    selections[layer].components.push(componentIndex);
    selections[layer].profiles.push(profileIndex);
  }

  const armor = materializeBatch(pack, "armor", selections.armor);
  const armorOverlay = materializeBatch(
    pack,
    "armor-overlay",
    selections["armor-overlay"],
  );
  const blockerOverlay = materializeBatch(
    pack,
    "blocker-overlay",
    selections["blocker-overlay"],
  );
  const interior = materializeBatch(pack, "interior", selections.interior);
  const renderTriangleCount =
    armor.triangleCount +
    armorOverlay.triangleCount +
    blockerOverlay.triangleCount +
    interior.triangleCount;
  if (renderTriangleCount !== pack.header.counts.triangles) {
    fail(`rendered ${renderTriangleCount} of ${pack.header.counts.triangles} triangles`);
  }

  return {
    armor,
    armorOverlay,
    blockerOverlay,
    interior,
    sourceTriangleCount: pack.header.counts.triangles,
    renderTriangleCount,
    drawCallUpperBound: 4,
  };
}
