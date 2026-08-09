import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  completeVehicleExplosionDamageClasses,
  VEHICLE_EXPLOSION_DAMAGE_CLASSES,
  visibleDamageResistanceOverrides,
} from "../../lib/encyclopedia-damage-resistances.ts";
import {
  inflatePublicFactionCatalog,
} from "../../lib/public-faction-catalog.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function factionVehicle(factionId, rawName) {
  const document = inflatePublicFactionCatalog(
    readJson(`public/catalog-data/factions/${factionId}.json`),
  );
  const data = document.records.flatMap((record) => [
    ...(record.data ? [record.data] : []),
    ...(record.variants ?? []).flatMap((variant) =>
      variant.data ? [variant.data] : []
    ),
  ]);
  return data.find((vehicle) => vehicle.general.rawName === rawName);
}

test("explosion damage classes complete a non-empty native allowlist", () => {
  const completed = completeVehicleExplosionDamageClasses([
    {
      damageClass: "BP_Kinetic_DamageType_C",
      modifier: 0.1,
    },
    {
      damageClass: "BP_Explosives_Damagetype_C",
      modifier: 1,
    },
  ]);
  assert.deepEqual(
    completed
      .filter(({ damageClass }) =>
        VEHICLE_EXPLOSION_DAMAGE_CLASSES.includes(damageClass)
      )
      .map(({ damageClass, modifier }) => [damageClass, modifier]),
    [
      ["BP_Explosives_Damagetype_C", 1],
      ["BP_Fragmentation_DamageType_C", 0],
      ["BP_BasicHeatDamageType_C", 0],
      ["BP_HAT_DamageType_C", 0],
      ["SQDamageType_Thermite", 0],
    ],
  );
  assert.deepEqual(completeVehicleExplosionDamageClasses([]), []);
});

test("visible resistance overrides omit only 100 percent and ammo-box rows", () => {
  const visible = visibleDamageResistanceOverrides([
    { damageClass: "BP_Kinetic_DamageType_C", modifier: 0.1 },
    { damageClass: "BP_Explosives_Damagetype_C", modifier: 1 },
    { damageClass: "BP_Fragmentation_DamageType_C", modifier: 1.5 },
    { damageClass: "BP_BasicHeatDamageType_C", modifier: 1.0005 },
    { damageClass: "BP_HAT_DamageType_C", modifier: null },
    { damageClass: "SQDamageType_Thermite", modifier: 10 },
    { damageClass: "BP_AmmoBox_Damage_C", modifier: 0 },
  ]);
  assert.deepEqual(
    visible.map(({ damageClass, modifier }) => [damageClass, modifier]),
    [
      ["BP_Kinetic_DamageType_C", 0.1],
      ["BP_Fragmentation_DamageType_C", 1.5],
      ["SQDamageType_Thermite", 10],
    ],
  );
});

test("M1A2 hull and components expose non-100-percent explosion classes", () => {
  const m1a2 = factionVehicle("usa", "BP_M1A2");
  assert.ok(m1a2);

  const hull = new Map(
    visibleDamageResistanceOverrides(m1a2.damageResistances)
      .map(({ damageClass, modifier }) => [damageClass, modifier]),
  );
  assert.equal(hull.get("BP_BasicHeatDamageType_C"), 0.38749998807907104);
  assert.equal(hull.get("SQDamageType_Thermite"), 0);
  assert.equal(hull.has("BP_Explosives_Damagetype_C"), false);

  const tracks = m1a2.components.find(
    ({ displayName }) => displayName === "FV4034_Track_Col_Left",
  );
  assert.ok(tracks);
  const trackDamage = new Map(
    visibleDamageResistanceOverrides(tracks.damageResistances)
      .map(({ damageClass, modifier }) => [damageClass, modifier]),
  );
  assert.equal(trackDamage.get("BP_Explosives_Damagetype_C"), 1.25);
  assert.equal(trackDamage.get("BP_Fragmentation_DamageType_C"), 0);
  assert.equal(trackDamage.get("SQDamageType_Thermite"), 0);
  assert.equal(trackDamage.has("BP_BasicHeatDamageType_C"), false);
});

test("vehicle hull vulnerability above 100 percent remains visible", () => {
  const uh60 = factionVehicle("usa", "BP_UH60");
  const t72 = factionVehicle("imf", "BP_T72A_IMF");
  assert.ok(uh60);
  assert.ok(t72);

  assert.equal(
    visibleDamageResistanceOverrides(uh60.damageResistances)
      .find(({ damageClass }) =>
        damageClass === "BP_Explosives_Damagetype_C"
      )?.modifier,
    1.5,
  );
  assert.equal(
    visibleDamageResistanceOverrides(t72.damageResistances)
      .find(({ damageClass }) => damageClass === "BP_HAT_DamageType_C")
      ?.modifier,
    1.100000023841858,
  );
});

test("every public vehicle keeps exact 100 percent rows omitted", () => {
  const factionDirectory = path.join(ROOT, "public", "catalog-data", "factions");
  const documents = readdirSync(factionDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      inflatePublicFactionCatalog(
        readJson(`public/catalog-data/factions/${name}`),
      )
    );
  const vehicles = documents.flatMap(({ records }) =>
    records.flatMap((record) => [
      ...(record.data ? [record.data] : []),
      ...(record.variants ?? []).flatMap((variant) =>
        variant.data ? [variant.data] : []
      ),
    ])
  );

  let visibleVulnerabilityRows = 0;
  let completedExplosionRows = 0;
  for (const vehicle of vehicles) {
    const resistanceLists = [
      vehicle.damageResistances,
      ...vehicle.components.map((component) => component.damageResistances),
    ];
    for (const source of resistanceLists) {
      const visible = visibleDamageResistanceOverrides(source);
      assert.ok(
        visible.every(({ damageClass, modifier }) =>
          damageClass !== "BP_AmmoBox_Damage_C" &&
          modifier !== null &&
          Math.abs(modifier - 1) > 0.001
        ),
        `${vehicle.general.rawName} exposed a 100-percent resistance row`,
      );
      visibleVulnerabilityRows += visible.filter(
        ({ modifier }) => modifier > 1,
      ).length;
      completedExplosionRows += visible.filter(
        ({ damageClass }) =>
          VEHICLE_EXPLOSION_DAMAGE_CLASSES.includes(damageClass),
      ).length;
    }
  }

  assert.ok(vehicles.length >= 604);
  assert.ok(visibleVulnerabilityRows > 0);
  assert.ok(completedExplosionRows > 0);
});

test("catalog wording no longer claims every unlisted class is 100 percent", () => {
  const source = readFileSync(path.join(ROOT, "app", "CatalogApp.tsx"), "utf8");
  assert.doesNotMatch(
    source,
    /未列出的伤害类型均承受完整伤害|其余类型承伤 100%/u,
  );
  assert.match(source, /已配置且承伤为 100% 的伤害类型已省略/u);
  assert.match(source, /visibleDamageResistanceOverrides/u);
});
