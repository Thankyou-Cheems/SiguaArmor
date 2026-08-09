import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  explosiveDamageTypeIconKinds,
  vehicleDamageTypeEffectLabel,
  vehicleDamageTypeIconColor,
  vehicleDamageTypeIconColorNumber,
  vehicleDamageTypeIconKindForPath,
  vehicleDamageTypeIconShortLabel,
} from "../../lib/vehicle-damage-type-icons.ts";

test("the five explosion damage classes have stable dedicated icon kinds", () => {
  assert.deepEqual(
    [
      "BP_Fragmentation_DamageType_C",
      "/Game/Gameplay/DamageTypes/BP_BasicHeatDamageType.BP_BasicHeatDamageType_C",
      "Class'/Game/Gameplay/DamageTypes/BP_HAT_DamageType.BP_HAT_DamageType_C'",
      "BP_Explosives_Damagetype_C",
      "SQDamageType_Thermite",
    ].map(vehicleDamageTypeIconKindForPath),
    ["fragmentation", "heat", "hat", "explosives", "thermite"],
  );
  assert.equal(
    vehicleDamageTypeIconKindForPath("BP_Kinetic_DamageType_C"),
    "kinetic",
  );
  assert.equal(vehicleDamageTypeIconKindForPath("SQDamageType"), null);
  assert.equal(vehicleDamageTypeIconShortLabel("explosives"), "爆炸");
  assert.equal(vehicleDamageTypeIconShortLabel("thermite"), "热辐射");
  assert.equal(
    vehicleDamageTypeEffectLabel("fragmentation"),
    "破片径向伤害",
  );
  assert.deepEqual(
    Object.fromEntries(
      ["fragmentation", "heat", "hat", "explosives", "thermite"].map(
        (kind) => [kind, vehicleDamageTypeIconColor(kind)],
      ),
    ),
    {
      fragmentation: "#efb865",
      heat: "#61d4e5",
      hat: "#4fa4ed",
      explosives: "#ef735a",
      thermite: "#f29d4b",
    },
  );
  assert.equal(vehicleDamageTypeIconColorNumber("heat"), 0x61d4e5);
});

test("explosion icon classification is gated by the native explosive flag", () => {
  const paths = [
    "SQDamageType_Thermite",
    "BP_Fragmentation_DamageType_C",
    "BP_BasicHeatDamageType_C",
    "BP_HAT_DamageType_C",
    "BP_Explosives_Damagetype_C",
    "BP_Fragmentation_DamageType_C",
  ];
  assert.deepEqual(explosiveDamageTypeIconKinds(false, paths), []);
  assert.deepEqual(explosiveDamageTypeIconKinds(null, paths), []);
  assert.deepEqual(explosiveDamageTypeIconKinds(true, paths), [
    "fragmentation",
    "heat",
    "hat",
    "explosives",
    "thermite",
  ]);
  assert.deepEqual(
    explosiveDamageTypeIconKinds(true, "SQDamageType"),
    ["generic"],
  );
});

test("every currently exposed explosive weapon resolves to a known icon kind", async () => {
  const catalog = JSON.parse(await readFile(
    new URL(
      "../../generated/internal/weapon-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ));
  let explosiveWeapons = 0;
  const unknownExplosiveDamageTypes = new Map();
  const radialModelById = new Map(
    catalog.mechanics.radialDamageModels.map((model) => [
      model.id,
      model,
    ]),
  );
  const shippingRadialAssetIds = new Set(
    catalog.selector.variants
      .filter(
        ({ selectorVisibility, radialAssetId }) =>
          selectorVisibility === "shipping" && radialAssetId,
      )
      .map(({ radialAssetId }) => radialAssetId),
  );
  for (const asset of catalog.mechanics.radialAssets.filter(({ id }) =>
    shippingRadialAssetIds.has(id)
  )) {
    const model = radialModelById.get(asset.radialDamageModelId);
    assert.ok(model, asset.id);
    for (const layer of model.layers) {
      const path =
        layer.damageTypeClassPath ?? layer.damageType;
      const kinds = explosiveDamageTypeIconKinds(true, path);
      if (kinds.length === 0) {
        const names = unknownExplosiveDamageTypes.get(path) ?? [];
        names.push({
          name: asset.label,
          explosive: { baseDamage: layer.baseDamage },
        });
        unknownExplosiveDamageTypes.set(path, names);
      }
      explosiveWeapons += 1;
    }
  }
  assert.ok(explosiveWeapons > 0);
  assert.deepEqual(
    [...unknownExplosiveDamageTypes]
      .map(([damageTypePath, names]) => ({
        damageTypePath,
        names,
      }))
      .sort((left, right) =>
        String(left.damageTypePath).localeCompare(String(right.damageTypePath))
      ),
    [],
  );
});

test("catalog and selector share the same damage type icon component", async () => {
  const [catalogSource, viewerSource, iconSource] = await Promise.all([
    readFile(new URL("../../app/CatalogApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../app/VehicleDamageTypeIcon.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(catalogSource, /function DamageTypeMark/u);
  assert.match(catalogSource, /<DamageTypeMark[\s\S]*weapon\.projectile\.damageType/u);
  assert.match(catalogSource, /<DamageTypeMark[\s\S]*item\.damageClass/u);
  assert.match(viewerSource, /data-term="explosion-types"/u);
  assert.match(viewerSource, /explosiveDamageTypeIconKinds\(/u);
  assert.match(viewerSource, /vehicleDamageTypeIconShortLabel/u);
  assert.match(viewerSource, /viewer-damage-target__damage-type-icon/u);
  assert.match(iconSource, /data-icon-motif="lat-role-official"/u);
  assert.match(iconSource, /data-icon-motif="hat-role-official"/u);
  assert.match(iconSource, /data-icon-motif="shockwave"/u);
  assert.match(viewerSource, /paintVehicleDamageTypeIconCanvas/u);
  assert.match(viewerSource, /vehicleDamageTypeIconColorNumber/u);
  assert.match(viewerSource, /vehicleDamageTypeIconColor\(kind\)/u);
  assert.match(iconSource, /LAT_ROLE_ICON_FRAME_PATH/u);
  assert.match(iconSource, /LAT_ROLE_ICON_LAUNCHER_PATH/u);
  assert.match(
    iconSource,
    /paintVehicleDamageTypeIconCanvas[\s\S]*KINETIC_ICON_BODY_PATH[\s\S]*HAT_ICON_PROJECTILE_PATH[\s\S]*FRAGMENTATION_ICON_BURST_PATH[\s\S]*THERMITE_ICON_FLAME_PATH/u,
  );
  assert.match(
    iconSource,
    /paintVehicleDamageTypeIconCanvas[\s\S]*EXPLOSIVES_ICON_BURST_PATH[\s\S]*EXPLOSIVES_ICON_WAVES_PATH/u,
  );
  assert.doesNotMatch(viewerSource, /vehicleDamageTypeEffectLabel/u);
  assert.doesNotMatch(
    viewerSource,
    /`爆炸 · \$\{damage\.radialLayerLabel\}`/u,
  );
  for (const kind of [
    "fragmentation",
    "heat",
    "hat",
    "explosives",
    "thermite",
  ]) {
    assert.match(iconSource, new RegExp(`${kind}: <`, "u"));
  }
});

test("penetration icons distinguish an APFSDS dart from a shaped-charge jet", async () => {
  const iconSource = await readFile(
    new URL("../../app/WeaponPenetrationIcon.tsx", import.meta.url),
    "utf8",
  );
  assert.match(iconSource, /data-icon-motif="apfsds-separated-sabots"/u);
  assert.match(iconSource, /data-icon-motif="shaped-charge-jet"/u);
  assert.match(iconSource, /viewBox="0 0 30 18"/u);
});

test("weapon selector reuses the vehicle encyclopedia kinetic icon and lists every damage type", async () => {
  const viewerSource = await readFile(
    new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url),
    "utf8",
  );
  const selectorEffect = viewerSource.slice(
    viewerSource.indexOf("function RuntimeWeaponEffectLegend"),
    viewerSource.indexOf("function RuntimeWeaponSelectorLegend"),
  );
  assert.match(
    selectorEffect,
    /effect\.penetrationKind === "shaped-charge"[\s\S]*?<VehicleDamageTypeIcon[\s\S]*?kind="kinetic"/u,
  );
  assert.match(viewerSource, /const RUNTIME_WEAPON_DAMAGE_LEGEND_KINDS = \[/u);
  for (const kind of [
    "kinetic",
    "small-arms",
    "fragmentation",
    "heat",
    "hat",
    "explosives",
    "thermite",
    "generic",
  ]) {
    assert.match(
      viewerSource,
      new RegExp(`RUNTIME_WEAPON_DAMAGE_LEGEND_KINDS[\\s\\S]*?"${kind}"`, "u"),
    );
  }
  assert.match(viewerSource, /vehicleDamageTypeIconShortLabel\(kind\)/u);
  assert.match(viewerSource, />\s*动能/u);
  assert.match(viewerSource, />\s*射流/u);
});
