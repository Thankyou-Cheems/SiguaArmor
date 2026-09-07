import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildHitSceneRenderBatches } from "../../lib/hit-scene-render-batches.ts";
import { armorThicknessStyle } from "../../lib/armor-thickness-ramp.ts";
import {
  VEHICLE_MODEL_CATEGORY_COLORS,
  vehicleModelCategoryColorRgb,
} from "../../lib/vehicle-model-category-palette.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function observed(value) {
  return { state: "observed", value };
}

function absent(reason = "not linked") {
  return { state: "absent", value: null, reason };
}

function gunCollisionPack(thicknessMm = null) {
  return {
    header: {
      counts: { vertices: 3, triangles: 1, components: 1, surfaceProfiles: 1 },
      components: [{
        componentId: "component:weapon-collision",
        componentPath: "/Game/RuntimeProbe/Map:PersistentLevel.BP_Turret_C_0.GunCollisionMesh",
        semanticKind: "gun-collision",
        directDamagePoolIndex: absent(),
      }],
      surfaceProfiles: [{
        surfaceProfileId: "surface:weapon-collision",
        componentIndex: 0,
        physicalMaterialPath: observed("/Game/Vehicle/Common/PhysMat_Default"),
        allowPenetration: observed(false),
        damageParentActor: observed(false),
        damageAbsorbed: observed(0),
        armorThicknessMm: thicknessMm === null ? absent() : observed(thicknessMm),
      }],
      healthPools: [],
    },
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    triangleComponentIndex: new Uint16Array([0]),
    triangleSurfaceProfileIndex: new Uint16Array([0]),
    faceNormals: new Float32Array([0, 0, 1]),
    bvh: null,
  };
}

function damageableComponentPack() {
  const pack = gunCollisionPack();
  pack.header.components[0] = {
    ...pack.header.components[0],
    componentId: "component:damageable-radio",
    componentPath: "/Game/RuntimeProbe/Map:PersistentLevel.BP_Vehicle_C_0.Radio",
    semanticKind: "other",
    directDamagePoolIndex: observed(0),
  };
  pack.header.surfaceProfiles[0] = {
    ...pack.header.surfaceProfiles[0],
    surfaceProfileId: "surface:damageable-radio",
    allowPenetration: observed(true),
  };
  pack.header.healthPools = [{
    poolId: "health:damageable-radio",
    kind: "other",
  }];
  return pack;
}

function parentForwardingTurretPack() {
  const pack = damageableComponentPack();
  pack.header.components[0] = {
    ...pack.header.components[0],
    componentId: "component:turret-ring",
    componentPath: "/Game/RuntimeProbe/Map:PersistentLevel.BP_Vehicle_C_0.TurretRing",
    semanticKind: "armor",
  };
  pack.header.healthPools[0] = {
    poolId: "health:turret-ring",
    kind: "other",
    passDamageToParent: observed(true),
    passPointDamageToParent: observed(true),
  };
  return pack;
}

function damageableGunCollisionPack() {
  const pack = gunCollisionPack();
  pack.header.components[0] = {
    ...pack.header.components[0],
    directDamagePoolIndex: observed(0),
  };
  pack.header.healthPools = [{
    poolId: "health:weapon-collision",
    kind: "other",
  }];
  return pack;
}

function semanticInteriorPack(semanticKind) {
  const pack = damageableComponentPack();
  pack.header.components[0] = {
    ...pack.header.components[0],
    componentId: `component:${semanticKind}`,
    componentPath: `/Game/RuntimeProbe/Map:PersistentLevel.BP_Vehicle_C_0.${semanticKind}`,
    semanticKind,
  };
  pack.header.surfaceProfiles[0] = {
    ...pack.header.surfaceProfiles[0],
    surfaceProfileId: `surface:${semanticKind}`,
  };
  pack.header.healthPools[0] = {
    poolId: `health:${semanticKind}`,
    kind: semanticKind,
  };
  return pack;
}

test("weapon and generic collision geometry has its own marker, never attached armor", () => {
  const batches = buildHitSceneRenderBatches(gunCollisionPack());
  assert.equal(batches.armorOverlay.triangleCount, 1);
  assert.deepEqual([...batches.armorOverlay.patternCodes], [5, 5, 5]);
  assert.ok(![...batches.armorOverlay.patternCodes].includes(3));
  assert.deepEqual(
    [...batches.armorOverlay.colors.slice(0, 3)],
    [...Float32Array.from([54 / 255, 58 / 255, 68 / 255])],
  );
  assert.deepEqual(
    [...batches.armorOverlay.opacities],
    [...Float32Array.from([0.34, 0.34, 0.34])],
  );
});

test("weapon collision with armor thickness keeps the white marker over thickness color", () => {
  const thicknessMm = 150;
  const expectedStyle = armorThicknessStyle(thicknessMm);
  const batches = buildHitSceneRenderBatches(gunCollisionPack(thicknessMm));
  assert.equal(batches.armor.triangleCount, 1);
  assert.equal(batches.armorOverlay.triangleCount, 0);
  assert.deepEqual([...batches.armor.patternCodes], [5, 5, 5]);
  assert.deepEqual(
    [...batches.armor.colors.slice(0, 3)],
    [...Float32Array.from(expectedStyle.rgb)],
  );
  assert.deepEqual(
    [...batches.armor.opacities],
    [...Float32Array.from([expectedStyle.opacity, expectedStyle.opacity, expectedStyle.opacity])],
  );
  assert.deepEqual([...batches.armor.nominalThicknessMm], [thicknessMm]);
});

test("damageable components retain a separate solid marker code", () => {
  const batches = buildHitSceneRenderBatches(damageableComponentPack());
  assert.equal(batches.interior.triangleCount, 1);
  assert.deepEqual([...batches.interior.patternCodes], [4, 4, 4]);
  assert.ok(![...batches.interior.patternCodes].includes(5));
});

test("parent-forwarding and white collision components receive subtle damageable outlines", () => {
  const turret = buildHitSceneRenderBatches(parentForwardingTurretPack());
  const collision = buildHitSceneRenderBatches(damageableGunCollisionPack());

  assert.deepEqual([...turret.armorOverlay.patternCodes], [8, 8, 8]);
  assert.deepEqual([...collision.armorOverlay.patternCodes], [9, 9, 9]);
});

test("engine and ammo rack receive distinct procedural interior materials", () => {
  const engine = buildHitSceneRenderBatches(semanticInteriorPack("engine"));
  const ammoRack = buildHitSceneRenderBatches(semanticInteriorPack("ammo-rack"));

  assert.deepEqual([...engine.interior.patternCodes], [6, 6, 6]);
  assert.deepEqual([...ammoRack.interior.patternCodes], [7, 7, 7]);
  assert.deepEqual(
    [...engine.interior.colors.slice(0, 3)],
    [...Float32Array.from(vehicleModelCategoryColorRgb("engine"))],
  );
  assert.deepEqual(
    [...ammoRack.interior.colors.slice(0, 3)],
    [...Float32Array.from(vehicleModelCategoryColorRgb("ammo-rack"))],
  );
});

test("gun-collision is independent from the combined add-on and no-penetration toggle", () => {
  const rendererSource = fs.readFileSync(
    path.join(root, "lib/hit-scene-three-renderer.ts"),
    "utf8",
  );
  assert.match(
    rendererSource,
    /bool isNoPenetrationMarker = vPatternCode > 0\.5 && vPatternCode < 1\.5/u,
  );
  assert.match(rendererSource, /bool isSpacedArmorMarker = vPatternCode > 2\.5 && vPatternCode < 3\.5/u);
  assert.match(
    rendererSource,
    /\(isNoPenetrationMarker \|\| isSpacedArmorMarker\) && specialArmorVisible < 0\.5/u,
  );
  assert.match(rendererSource, /if \(vPatternCode > 4\.5\)/u);
  assert.match(rendererSource, /high-white solid outline, without a face/u);
  assert.match(rendererSource, /absolute\/relative thickness color used by armor/u);
  assert.doesNotMatch(rendererSource, /collisionStripe/u);
  assert.doesNotMatch(rendererSource, /collisionDash/u);
  assert.match(rendererSource, /float collisionEdge = outlineCore \* outlineStrength;/u);
  assert.match(rendererSource, /INTERIOR_MODE_NON_INTERIOR_OUTLINE_STRENGTH = 0\.28/u);
  assert.doesNotMatch(rendererSource, /damageDot/u);
  assert.match(rendererSource, /vec3 collisionColor = modelCollisionColor/u);
  assert.match(rendererSource, /vec3 damageColor = modelComponentColor/u);
  assert.match(rendererSource, /bool isSubtleDamageableMaterial = vPatternCode > 7\.5/u);
  assert.match(rendererSource, /bool isDamageableGunCollisionMaterial = vPatternCode > 8\.5/u);
  assert.match(rendererSource, /alpha = max\(alpha, componentEdge \* 0\.34\);/u);
  assert.match(rendererSource, /outlineCore \* 0\.54, componentHalo \* 0\.2/u);
  assert.match(rendererSource, /semanticPatternCueScale/u);
});

test("viewer labels gun collision separately from attached armor", () => {
  const viewerSource = fs.readFileSync(path.join(root, "app/RuntimeVehicleViewer.tsx"), "utf8");
  assert.match(viewerSource, /semanticKind === "gun-collision"\) return "gun-collision"/u);
  assert.match(viewerSource, /data-kind="gun-collision" \/>武器\/碰撞轮廓/u);
  assert.match(viewerSource, /data-kind="spaced-armor" \/>附加装甲/u);
  assert.match(viewerSource, /aria-label="显示附加装甲\/无敌区域"/u);
  assert.match(viewerSource, /<span>附加装甲\/无敌区域<\/span>/u);
  assert.doesNotMatch(viewerSource, /减伤组件/u);

  const cssSource = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(cssSource, /--component-only-damage-accent: var\(--model-component\)/u);
  assert.match(cssSource, /--gun-collision-accent: var\(--model-collision\)/u);
  assert.match(cssSource, /--hit-marker-gun-collision-fill: #303330/u);
  assert.match(cssSource, /--hit-marker-gun-collision-fill-share: 32%/u);
  assert.match(cssSource, /--hit-marker-gun-collision-border-style: solid/u);
  assert.match(
    viewerSource,
    /getPropertyValue\(`--hit-marker-\$\{kind\}-\$\{property\}`\)/u,
  );
  assert.doesNotMatch(viewerSource, /SHOT_PATH_MARKER_STYLES/u);
  assert.doesNotMatch(viewerSource, /hatched/u);
  assert.match(
    viewerSource,
    /marker\.sphere\.material\.opacity =\s*marker\.fillOpacity \* marker\.visibilityOpacity/u,
  );
  assert.match(
    cssSource,
    /i\[data-kind="component-only-damage"\][\s\S]*?--hit-marker-component-only-damage-fill/u,
  );
  assert.doesNotMatch(
    cssSource,
    /i\[data-kind="component-only-damage"\][^}]*radial-gradient/u,
  );
  assert.match(
    cssSource,
    /i\[data-kind="gun-collision"\][\s\S]*?--hit-marker-gun-collision-border-style[\s\S]*?--hit-marker-gun-collision-fill/u,
  );
  const gunCollisionLegendBlocks = cssSource.match(
    /[^{}]*i\[data-kind="gun-collision"\]\s*\{[^}]*\}/gu,
  ) ?? [];
  assert.equal(gunCollisionLegendBlocks.length, 2);
  assert.ok(gunCollisionLegendBlocks.every((block) => !block.includes("repeating-linear-gradient")));
  const gunCollisionPathBlock = cssSource.match(
    /\.viewer-causal-spine__layer\[data-path-marker="gun-collision"\]\s*\{[^}]*\}/u,
  )?.[0];
  assert.ok(gunCollisionPathBlock);
  assert.match(gunCollisionPathBlock, /--hit-marker-gun-collision-fill/u);
  assert.doesNotMatch(gunCollisionPathBlock, /repeating-linear-gradient/u);
});

test("3D categories and component outcome cards share one palette", () => {
  const viewerSource = fs.readFileSync(path.join(root, "app/RuntimeVehicleViewer.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  const rendererSource = fs.readFileSync(
    path.join(root, "lib/hit-scene-three-renderer.ts"),
    "utf8",
  );
  const paletteSource = fs.readFileSync(
    path.join(root, "lib/vehicle-model-category-palette.ts"),
    "utf8",
  );
  const layoutSource = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");

  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS["spaced-armor"], "#55d9e6");
  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS["no-penetration"], "#d874b7");
  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS.component, "#b8d96b");
  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS.engine, "#f3a15b");
  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS["ammo-rack"], "#e95f6d");
  assert.equal(VEHICLE_MODEL_CATEGORY_COLORS.collision, "#f3f5f2");
  assert.match(paletteSource, /Single source of truth for categorical colors/u);
  assert.doesNotMatch(cssSource, /#55d9e6|#d874b7|#b8d96b|#f3a15b|#e95f6d|#f3f5f2/u);
  assert.match(layoutSource, /style=\{VEHICLE_MODEL_CATEGORY_CSS_VARIABLES as CSSProperties\}/u);
  assert.match(rendererSource, /new Color\(VEHICLE_MODEL_CATEGORY_COLORS\["spaced-armor"\]\)/u);
  assert.match(rendererSource, /new Color\(VEHICLE_MODEL_CATEGORY_COLORS\.component\)/u);
  assert.match(cssSource, /--armor-legend-engine: var\(--model-engine\)/u);
  assert.match(cssSource, /--armor-legend-ammo-rack: var\(--model-ammo-rack\)/u);
  assert.match(cssSource, /--hit-marker-engine-fill: #3d2515/u);
  assert.match(cssSource, /--hit-marker-ammo-rack-fill: #3a1b22/u);
  assert.match(cssSource, /--hit-marker-engine-material:/u);
  assert.match(cssSource, /--hit-marker-ammo-rack-material:/u);
  assert.match(
    cssSource,
    /\.viewer-shot-outcome-summary__targets > li\s*\{[^}]*--outcome-accent:\s*var\(--model-component\);/u,
  );
  assert.match(
    cssSource,
    /li\[data-damage-pool="track"\],[\s\S]*?--outcome-accent:\s*var\(--model-component\);/u,
  );
  assert.match(
    cssSource,
    /li\[data-damage-pool="engine"\]\s*\{[^}]*--outcome-accent:\s*var\(--model-engine\);/u,
  );
  assert.match(
    cssSource,
    /li\[data-damage-pool="ammo-rack"\]\s*\{[^}]*--outcome-accent:\s*var\(--model-ammo-rack\);/u,
  );
  assert.match(rendererSource, /bool isEngineMaterial = vPatternCode > 5\.5/u);
  assert.match(rendererSource, /bool isAmmoRackMaterial = vPatternCode > 6\.5/u);
  assert.match(rendererSource, /vec2 surfacePatternUv\(/u);
  assert.match(rendererSource, /float proceduralGrid\(/u);
  assert.match(rendererSource, /engineUv\.x \+ engineUv\.y/u);
  assert.match(rendererSource, /surfacePatternUv\(vLocalPosition, vLocalNormal\) \* 10\.0/u);
  assert.match(
    cssSource,
    /\.viewer-causal-spine__marker\s*\{[\s\S]*?width:\s*20px;/u,
  );
  assert.match(
    cssSource,
    /\.viewer-causal-spine__marker\s*\{[\s\S]*?border:\s*2px var\(--spine-marker-border-style\) var\(--spine-accent\);/u,
  );
  assert.match(viewerSource, /context\.arc\(48, 48, 40, 0, Math\.PI \* 2\)/u);
  assert.match(viewerSource, /context\.shadowBlur = 20/u);
  assert.match(viewerSource, /context\.strokeText\(String\(number\), 48, 49\)/u);
  assert.match(viewerSource, /label\.scale\.set\(0\.17, 0\.17, 1\)/u);
  assert.match(viewerSource, /new THREE\.SphereGeometry\(0\.064, 16, 12\)/u);
});

test("attached-armor outline keeps its slow dashed cycle and adds a broad luminous halo", () => {
  const rendererSource = fs.readFileSync(
    path.join(root, "lib/hit-scene-three-renderer.ts"),
    "utf8",
  );
  assert.match(rendererSource, /uniform float spacedArmorDashOffset;/u);
  assert.match(rendererSource, /gl_FragCoord\.y \* 0\.43 \+ spacedArmorDashOffset/u);
  assert.match(rendererSource, /vec3 haloBand =/u);
  assert.match(rendererSource, /edgeWidth \* 6\.4/u);
  assert.match(rendererSource, /float haloStrength = mix\(0\.1, 0\.2, hoveredSurface\)/u);
  assert.match(rendererSource, /float coreStrength = mix\(0\.78, 1\.0, hoveredSurface\)/u);
  assert.match(rendererSource, /SPACED_ARMOR_DASH_CYCLE_SECONDS = 8/u);
});
