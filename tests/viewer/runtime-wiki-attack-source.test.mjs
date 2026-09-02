import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRuntimeAttackSourceLibrary,
  createRuntimeStationEquipmentResolver,
  resolveRuntimeAttackSourceIndexEntry,
} from "../../app/runtime-wiki-attack-source.ts";

const wikiSourceText = await readFile(
  new URL("../../lib/wiki-source.ts", import.meta.url),
  "utf8",
);

const selectorVariant = {
  id: "weapon-variant-test",
  familyId: "weapon-family-test",
  familyLabel: "120mm Cannon",
  label: "KEW-A2 APFSDS",
  qualifier: "KEW-A2",
  displayLabel: "KEW-A2 120 mm APFSDS",
  kind: "wiki-family",
  platformKind: "tank",
  type: "APFSDS",
  selectorVisibility: "shipping",
  directDamageModelId: "direct-test",
  radialAssetId: null,
  penetrationKind: "kinetic",
  damageType: "kinetic",
  sourceIdentity: { kind: "test", configurationKeys: [], sourceRefIds: [] },
  sourceRefIds: [],
  ballisticsSourceRefs: [],
  factionClaimIds: [],
  factionResolution: { kind: "test", factionIds: ["adf"], byScope: {} },
  sourceCounts: { wikiConfigurations: 1, vehicleWeaponSources: 1, deliverySources: 0 },
  sourceLabels: ["M1A1"],
  familyCardIds: ["adf--m1a1--mbt"],
  searchText: "kew-a2 m1a1",
  editorVerification: null,
  configurationKeys: [],
  ballisticsIds: ["ballistics-test"],
  ballisticProfileIds: [],
  exactCardIds: ["adf--m1a1--mbt"],
  factionIds: ["adf"],
  factionByScope: {},
};

const ballisticsModel = {
  healthPools: [],
  components: [],
  surfaceProfiles: [],
  weapons: [{
    weaponId: "weapon-variant-test",
    role: "wiki-runtime-direct-hit",
    projectileIndex: 0,
    armorPenetrationDepthMm: 800,
    armorPenetrationCurveIndex: { value: null, state: "absent" },
    damageFalloffCurveIndex: { value: null, state: "absent" },
    maxDamage: 8000,
    minDamage: 8000,
    traceDistanceAfterPenetrationMeters: 50,
  }],
  projectiles: [{
    projectileId: "weapon-variant-test:projectile",
    role: "wiki-runtime-projectile",
    damageTypePath: "kinetic",
    armorPenetrationDepthMm: 800,
    impactDamage: 8000,
    isExplosive: false,
    traceDistanceAfterPenetrationMeters: 50,
  }],
  curves: [],
};

const document = {
  schemaVersion: "sigua-weapon-runtime-source/v2",
  source: {
    kind: "vehicle",
    cardId: "adf--m1a1--mbt",
    rawNames: ["BP_AUS_M1A1"],
    factionIds: ["adf"],
    displayNames: ["M1A1"],
    types: ["MBT"],
  },
  weaponProfiles: [{
    weaponProfileId: "profile-test",
    weaponId: "weapon-variant-test",
    runtimeAssetPath: null,
    gunName: "120mm Cannon",
    displayName: "KEW-A2 APFSDS",
    projectileName: null,
    matchBasis: "exact-wiki-runtime-projection",
    ballisticsId: "ballistics-test",
    ballisticsWeaponIndex: 0,
    ballisticsModel,
    directFireRoute: true,
    explosiveCategory: null,
    explosiveCategoryLabel: null,
    explosiveLayerOrderEvidence: null,
    explosiveLayerCount: null,
    selectorVariant,
  }],
  loadouts: [{
    loadoutId: "loadout-test",
    rawName: "BP_AUS_M1A1",
    factionId: "adf",
    runtimeVehicleRef: "vehicle-test",
    stationEquipment: [{
      id: "equipment-test",
      rawName: "BP_AUS_M1A1",
      sourceIndex: 0,
      gunName: "M256",
      displayName: "炮塔/武器站",
      turretName: "Turret",
      operation: {
        numberOfMags: 12,
        magazineSize: 1,
        tacticalReloadSeconds: 8,
        dryReloadSeconds: 8,
        roundsPerMinute: 7.5,
        timeBetweenShotsSeconds: 0,
      },
    }],
    weapons: [{
      weaponAssignmentId: "equipment-test:weapon-variant-test",
      stationEquipmentId: "equipment-test",
      sourceIndex: 0,
      turretName: "Turret",
      weaponProfileId: "profile-test",
      selectorVariantId: "weapon-variant-test",
    }],
  }],
};

test("one Wiki vehicle source is a complete default hit-analysis library", () => {
  const library = createRuntimeAttackSourceLibrary(document, {
    cardId: "adf--m1a1--mbt",
    displayName: "M1A1 主战坦克",
    groupId: "adf",
    groupName: "澳大利亚国防军",
    groupOrder: 0,
    type: "MBT",
    canonicalRawName: "BP_AUS_M1A1",
  });
  assert.equal(library.runtimeAttackSources.length, 1);
  const source = library.runtimeAttackSourceForId("adf-ausm1a1");
  assert.equal(source?.weapons.length, 1);
  assert.equal(source?.weapons[0].weaponId, "weapon-variant-test");
  assert.equal(source?.weapons[0].weaponAssignmentId, "equipment-test:weapon-variant-test");
  assert.equal(library.weaponDpsWeapons?.length, 1);
  assert.equal(library.weaponDpsWeapons?.[0].assignmentId, "equipment-test");
  assert.equal(library.weaponDpsWeapons?.[0].damagePerShot, 8000);
  assert.equal(library.weaponDpsWeapons?.[0].timeBetweenShotsSeconds, 8);
  assert.equal(
    library.runtimeAttackWeaponSupportsHitAnalysis(source.weapons[0]),
    true,
  );
});

test("the visible vehicle variant wins when it has an exact runtime loadout", () => {
  const variantDocument = structuredClone(document);
  variantDocument.source.rawNames.push("BP_AUS_M1A1_Woodland");
  variantDocument.loadouts.push({
    ...structuredClone(document.loadouts[0]),
    loadoutId: "loadout-woodland",
    rawName: "BP_AUS_M1A1_Woodland",
    runtimeVehicleRef: "vehicle-woodland",
    stationEquipment: [{
      ...structuredClone(document.loadouts[0].stationEquipment[0]),
      id: "equipment-woodland",
      rawName: "BP_AUS_M1A1_Woodland",
    }],
    weapons: [{
      ...structuredClone(document.loadouts[0].weapons[0]),
      weaponAssignmentId: "equipment-woodland:weapon-variant-test",
      stationEquipmentId: "equipment-woodland",
    }],
  });

  const library = createRuntimeAttackSourceLibrary(variantDocument, {
    cardId: "adf--m1a1--mbt",
    displayName: "M1A1 主战坦克",
    groupId: "adf",
    groupName: "澳大利亚国防军",
    groupOrder: 0,
    type: "MBT",
    canonicalRawName: "BP_AUS_M1A1",
  }, {
    variantRawName: "BP_AUS_M1A1_Woodland",
  });

  const source = library.runtimeAttackSourceForId("adf--m1a1--mbt");
  assert.equal(source?.canonicalRawName, "BP_AUS_M1A1_Woodland");
  assert.equal(source?.weapons[0].stationEquipmentId, "equipment-woodland");
});

test("the same source resolves turret labels without the full catalog", () => {
  const resolveEquipment = createRuntimeStationEquipmentResolver(document);
  assert.deepEqual(resolveEquipment("equipment-test"), {
    equipment: {
      gunName: "M256",
      displayName: "炮塔/武器站",
      turretName: "Turret",
    },
    operation: {
      numberOfMags: 12,
      magazineSize: 1,
      tacticalReloadSeconds: 8,
      dryReloadSeconds: 8,
      roundsPerMinute: 7.5,
      timeBetweenShotsSeconds: 0,
    },
  });
  assert.equal(resolveEquipment("missing"), null);
});

test("a shared vehicle attacker resolves through the small source index", () => {
  const index = {
    schemaVersion: "sigua-weapon-runtime-index/v2",
    vehicleSources: [{
      cardId: "adf--m1a1--mbt",
      rawNames: ["BP_AUS_M1A1"],
      factionIds: ["adf"],
      displayNames: ["M1A1"],
      types: ["MBT"],
      loadoutCount: 1,
      weaponProfileCount: 4,
      weaponAssignmentCount: 4,
      pathname: "/data/weapons/runtime/vehicles/adf--m1a1--mbt.json",
    }],
  };
  assert.deepEqual(
    resolveRuntimeAttackSourceIndexEntry(index, "adf-ausm1a1"),
    {
      entry: index.vehicleSources[0],
      presentation: {
        cardId: "adf--m1a1--mbt",
        displayName: "M1A1",
        groupId: "adf",
        groupName: "adf",
        groupOrder: Number.MAX_SAFE_INTEGER,
        type: "MBT",
        canonicalRawName: "BP_AUS_M1A1",
      },
    },
  );
  assert.equal(resolveRuntimeAttackSourceIndexEntry(index, "inf-weapons"), null);
});

test("a missing exact raw loadout fails closed instead of choosing the first vehicle", () => {
  assert.throws(
    () => createRuntimeAttackSourceLibrary(document, {
      cardId: "adf--m1a1--mbt",
      displayName: "M1A1",
      groupId: "adf",
      groupName: "ADF",
      groupOrder: 0,
      type: "MBT",
      canonicalRawName: "BP_WRONG",
    }),
    /缺少精确配置/u,
  );
});

test("weapon runtime requests bypass pre-refresh browser cache entries", () => {
  assert.match(
    wikiSourceText,
    /const WIKI_WEAPON_CATALOG_QUERY = "\?mechanics=overheat-v1"/u,
  );
  assert.match(
    wikiSourceText,
    /`\/data\/weapons\/catalog\.json\$\{WIKI_WEAPON_CATALOG_QUERY\}`/u,
  );
  assert.match(
    wikiSourceText,
    /const WIKI_WEAPON_RUNTIME_QUERY = "\?projection=exact-assignment-radial-v4"/u,
  );
  assert.match(
    wikiSourceText,
    /`\/data\/weapons\/runtime\/vehicles\/\$\{cardId\}\.json\$\{WIKI_WEAPON_RUNTIME_QUERY\}`/u,
  );
  assert.match(
    wikiSourceText,
    /`\/data\/weapons\/runtime\/vehicles\/index\.json\$\{WIKI_WEAPON_RUNTIME_QUERY\}`/u,
  );
  assert.match(wikiSourceText, /"sigua-weapon-runtime-source\/v2"/u);
  assert.match(wikiSourceText, /"sigua-weapon-runtime-index\/v2"/u);
});
