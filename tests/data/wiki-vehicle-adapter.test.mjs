import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalogIndexFromWiki,
  buildFactionCatalogFromWiki,
  mergeWikiVehicleFactionMechanics,
  wikiVehicleFactionIdsForGroup,
} from "../../app/wiki-vehicle-catalog.ts";

test("Armor joins its card mapping with one SiguaWiki vehicle record", () => {
  const index = {
    schemaVersion: "1.0.0",
    catalogId: "fixture",
    groups: [{ id: "test", name: "Test", order: 0, recordCount: 1 }],
    records: [{
      promoEntryId: "test--vehicle--ifv",
      promotionOrder: 1,
      official: {
        groupId: "test",
        groupNameZh: "Test",
        nameZh: "Vehicle",
        typeZh: "IFV",
      },
      selectedRawName: "BP_Test",
      defaultCardId: "test--vehicle--ifv--bp-test",
      routeSlug: "test--vehicle--ifv",
      variants: [{
        sourceRawName: "BP_Test",
        catalogBindingRef: "binding-test",
        vehicleRef: "vehicle-source-test",
        runtimeVehicleRef: "vehicle-runtime-test",
        visualArtifactRef: "visual-test",
        alias: "",
        displayName: "Vehicle",
        cardId: "test--vehicle--ifv--bp-test",
        routeSlug: "test--vehicle--ifv--bp-test",
      }, {
        sourceRawName: "BP_Test_Exclusive",
        catalogBindingRef: "binding-test-exclusive",
        vehicleRef: "vehicle-source-test-exclusive",
        runtimeVehicleRef: "vehicle-runtime-test-exclusive",
        visualArtifactRef: "visual-test-exclusive",
        alias: "",
        displayName: "Vehicle Exclusive",
        cardId: "test--vehicle--ifv--bp-test-exclusive",
        routeSlug: "test--vehicle--ifv--bp-test-exclusive",
      }],
    }],
  };
  const wiki = {
    schemaVersion: "sigua-vehicle-catalog/v3.1",
    identities: {
      catalogBindings: [{
        id: "binding-test",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test",
        vehicleRef: "vehicle-source-test",
        runtimeVehicleRef: "vehicle-runtime-test",
        visualArtifactRefs: { international: "visual-test" },
        weaponBindingIds: ["weapon-test"],
      }, {
        id: "binding-test-exclusive",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test_Exclusive",
        vehicleRef: "vehicle-source-test-exclusive",
        runtimeVehicleRef: "vehicle-runtime-test-exclusive",
        visualArtifactRefs: { international: "visual-test-exclusive" },
        weaponBindingIds: ["weapon-test-exclusive"],
      }],
      vehicles: [{
        id: "vehicle-source-test",
        rawName: "BP_Test",
        generalProfileRef: "general-test",
        burningProfileRef: "burning-test",
        seatProfileRefs: ["seat-test"],
        hullDamageProfileRefs: ["damage-test"],
        componentProfileRefs: ["component-test"],
      }, {
        id: "vehicle-source-test-exclusive",
        rawName: "BP_Test_Exclusive",
        generalProfileRef: "general-test",
        burningProfileRef: "burning-test",
        seatProfileRefs: ["seat-test"],
        hullDamageProfileRefs: ["damage-test"],
        componentProfileRefs: ["component-test"],
      }],
    },
    profiles: {
      general: [{
        id: "general-test",
        value: {
          displayName: "Vehicle",
          details: null,
          type: "IFV",
          vehicleHealth: 1000,
          repairToolLimit: 0.25,
          respawnTime: 10,
          ticketValue: 10,
          killerPointReward: 100,
          crewSeatCount: 1,
          totalSeatCount: 1,
          amphibious: false,
          isDamagedByRadial: true,
          hasConstruction: false,
          totalResources: 0,
          constructionResources: 0,
          ammoResources: 0,
          hasCommandZone: false,
          commandZoneRadius: 0,
        },
      }],
      burning: [{
        id: "burning-test",
        value: {
          state: "observed",
          sourceBuildId: "squad-sdk-test",
          startHealthFraction: 0.1,
          healthFractionPerSecond: 0.0033,
          tickIntervalSeconds: 1,
          startDelaySeconds: 1,
          damageClass: "SQBurningDamage",
        },
      }],
      seats: [{
        id: "seat-test",
        value: {
          index: 1,
          role: "driver",
          stationKind: null,
          kitRequirement: "Heavy Vehicle",
          seatHealth: 0,
          repairToolLimit: null,
          turretName: null,
          stabilized: null,
          zoomLevels: [],
          turret: null,
        },
      }],
      damageResistances: [{
        id: "damage-test",
        value: { damageClass: "SQBurningDamage", modifier: 0.5 },
      }],
      components: [{
        id: "component-test",
        value: {
          displayName: "Engine",
          componentHealth: 500,
          repairToolLimit: 1,
          canBeRepairedAfterDestroy: true,
          damageProfileRefs: ["damage-test"],
        },
      }],
    },
    runtime: {
      visualArtifacts: [{
        id: "visual-test",
        edition: "international",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test",
        thumbnail: {
          path: "/assets/vehicles/cards/international/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
          width: 640,
          height: 360,
        },
      }, {
        id: "visual-test-exclusive",
        edition: "international",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test_Exclusive",
        thumbnail: {
          path: "/assets/vehicles/cards/international/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.webp",
          width: 640,
          height: 360,
        },
      }],
    },
    editorAvailability: {
      schemaVersion: "sigua-vehicle-editor-availability/v1",
      sourceBuildId: "sdk-test",
      evidenceRevision: "evidence-test",
      bindingAvailability: [{
        bindingId: "binding-test",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test",
        mechanicsSignatureId: "vehicle-mechanics-test",
        mechanicalBindingId: "binding-test",
        mechanicalRawName: "BP_Test",
        state: "observed",
        setupIds: ["Test_Setup"],
        configurationIds: ["vehicle-configuration-test"],
        vehicleSettingsPaths: ["/Game/Settings/Vehicle/Test.Test"],
      }, {
        bindingId: "binding-test-exclusive",
        cardId: "test--vehicle--ifv",
        rawName: "BP_Test_Exclusive",
        mechanicsSignatureId: "vehicle-mechanics-test-exclusive",
        state: "absent-current-editor",
        setupIds: [],
        configurationIds: [],
        vehicleSettingsPaths: [],
      }],
    },
  };

  const result = buildFactionCatalogFromWiki(
    wiki,
    index,
    "test",
    "international",
  );
  const variant = result.records[0].variants[0];
  assert.equal(variant.data.general.rawName, "BP_Test");
  assert.equal(variant.data.general.vehicleHealth, 1000);
  assert.equal(variant.data.burning.startHealthFraction, 0.1);
  assert.equal(variant.data.burning.healthFractionPerSecond, 0.0033);
  assert.deepEqual(variant.data.weaponBindingIds, ["weapon-test"]);
  assert.equal(variant.data.components[0].damageResistances[0].modifier, 0.5);
  assert.equal(variant.thumbnail.width, 640);
  const exclusive = result.records[0].variants[1];
  assert.equal(result.records[0].variants.length, 2);
  assert.equal(exclusive.sourceRawName, "BP_Test_Exclusive");
  assert.equal(exclusive.editorAvailability.state, "absent-current-editor");
  assert.equal(exclusive.editorAvailability.mechanicalRawName, "BP_Test_Exclusive");
  assert.deepEqual(exclusive.data.weaponBindingIds, ["weapon-test-exclusive"]);

  const mechanics = {
    ...wiki,
    schemaVersion: "sigua-vehicle-faction-mechanics/v1",
    factionId: "test",
  };
  assert.deepEqual(
    buildFactionCatalogFromWiki(
      mergeWikiVehicleFactionMechanics([mechanics]),
      index,
      "test",
      "international",
    ),
    result,
  );
});

test("Armor derives every Wiki faction needed by a combined catalog group", () => {
  const index = {
    records: [
      { promoEntryId: "pla--ztz99a--mbt", official: { groupId: "pla" } },
      { promoEntryId: "plaagf--ztl11--mgs", official: { groupId: "pla" } },
      { promoEntryId: "planmc--zbd05--ifv", official: { groupId: "pla" } },
      { promoEntryId: "usa--m1a2--mbt", official: { groupId: "usa" } },
    ],
  };
  assert.deepEqual(
    wikiVehicleFactionIdsForGroup(index, "pla"),
    ["pla", "plaagf", "planmc"],
  );
});

test("Armor keeps product cards for Wiki-owned support-air visuals", () => {
  const index = {
    schemaVersion: "1.0.0",
    catalogId: "fixture",
    groups: [{ id: "test", name: "Test", order: 0, recordCount: 1 }],
    records: [{
      promoEntryId: "test--mq9--uav",
      wikiSourceCardId: "source--mq9--uav",
      promotionOrder: 1,
      official: {
        groupId: "test",
        groupNameZh: "Test",
        nameZh: "MQ-9",
        typeZh: "UAV",
      },
      selectedRawName: "BP_CommandActor_UAV_MQ9",
      defaultCardId: "test--mq9--uav--commandactor-uav-mq9",
      routeSlug: "test--mq9--uav",
      variants: [{
        sourceRawName: "BP_CommandActor_UAV_MQ9",
        catalogBindingRef: null,
        vehicleRef: null,
        runtimeVehicleRef: null,
        visualArtifactRef: "visual-mq9",
        alias: "Reaper",
        displayName: "MQ-9 Reaper",
        cardId: "test--mq9--uav--commandactor-uav-mq9",
        routeSlug: "test--mq9--uav--commandactor-uav-mq9",
      }],
    }],
  };
  const wiki = {
    schemaVersion: "sigua-vehicle-catalog/v3.1",
    identities: { catalogBindings: [], vehicles: [] },
    profiles: {
      general: [],
      burning: [],
      seats: [],
      damageResistances: [],
      components: [],
    },
    runtime: {
      visualArtifacts: [{
        id: "visual-mq9",
        edition: "international",
        cardId: "test--mq9--uav",
        rawName: "BP_CommandActor_UAV_MQ9",
        thumbnail: {
          path: "/assets/vehicles/cards/international/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp",
          width: 640,
          height: 360,
        },
      }],
    },
    extensions: {
      supportAir: {
        bindings: [{
          bindingKey: "source--mq9--uav\u0000BP_CommandActor_UAV_MQ9",
          cardId: "source--mq9--uav",
          rawName: "BP_CommandActor_UAV_MQ9",
          visualArtifactRefs: { international: "visual-mq9" },
        }],
      },
    },
  };

  const result = buildFactionCatalogFromWiki(
    wiki,
    index,
    "test",
    "international",
  );
  assert.equal(result.records[0].variants[0].data, null);
  assert.equal(
    result.records[0].variants[0].visualArtifactRef,
    "visual-mq9",
  );
});

test("Armor builds localized searchable cards from Wiki presentation data", () => {
  const topology = {
    schemaVersion: "1.0.0",
    catalogId: "fixture",
    groups: [{ id: "usa", order: 0, recordCount: 1 }],
    records: [{
      promoEntryId: "usa--m-atv-tow--td",
      promotionOrder: 1,
      official: { groupId: "usa" },
      selectedRawName: "BP_MATV_TOW",
      defaultCardId: "usa--m-atv-tow--td--matv-tow",
      routeSlug: "usa--m-atv-tow--td",
      variants: [{
        sourceRawName: "BP_MATV_TOW",
        catalogBindingRef: "binding-matv",
        vehicleRef: "vehicle-matv",
        runtimeVehicleRef: "runtime-matv",
        visualArtifactRef: "visual-matv",
        cardId: "usa--m-atv-tow--td--matv-tow",
        routeSlug: "usa--m-atv-tow--td--matv-tow",
      }],
    }],
  };
  const vehicles = {
    schemaVersion: "sigua-vehicle-catalog/v3.1",
    presentation: {
      editions: {
        international: {
          records: [{
            cardId: "usa--m-atv-tow--td",
            nameZh: "M-ATV“马特夫”",
            type: "TD",
            typeNameZh: "坦克歼击车",
            configurationZh: null,
            searchTerms: [],
            searchAliases: ["防雷车"],
            variants: [{
              rawName: "BP_MATV_TOW",
              nameZh: "M-ATV“马特夫” BGM-71 TOW“陶式”反坦克导弹",
              vehicleNameZh: null,
              configurationZh: "BGM-71 TOW“陶式”反坦克导弹",
              liveryZh: null,
              searchTerms: [],
              searchAliases: [],
            }],
          }],
        },
        china: { records: [] },
      },
    },
  };
  const factions = {
    schemaVersion: "sigua-faction-catalog/v1",
    factions: [{ code: "USA", labels: { zhHans: "美国陆军" } }],
    catalogGroups: { china: [{ id: "agesi", nameZh: "阿格西联邦" }] },
  };
  const aliases = {
    schemaVersion: "sigua-vehicle-community-aliases/v1",
    updatedAt: "2026-08-11T00:00:00.000Z",
    groups: [{
      id: "tow-recon",
      label: "反坦克侦察车",
      terms: ["TOWCHE", "ZCC TOW"],
      targets: [{
        edition: "international",
        cardId: "usa--m-atv-tow--td",
        rawNames: ["BP_MATV_TOW"],
      }],
    }],
  };
  const index = buildCatalogIndexFromWiki(
    vehicles,
    factions,
    topology,
    "international",
    aliases,
  );
  assert.equal(index.groups[0].name, "美国陆军");
  assert.equal(index.records[0].official.nameZh, "M-ATV“马特夫”");
  assert.deepEqual(index.records[0].variants[0].searchAliases, ["TOWCHE", "ZCC TOW"]);
});

test("Armor reads China catalog group names from Wiki instead of product topology", () => {
  const topology = {
    schemaVersion: "1.0.0",
    catalogId: "china-fixture",
    groups: [{ id: "agesi", order: 0, recordCount: 0 }],
    records: [],
  };
  const vehicles = {
    schemaVersion: "sigua-vehicle-catalog/v3.1",
    presentation: {
      editions: {
        international: { records: [] },
        china: { records: [] },
      },
    },
  };
  const factions = {
    schemaVersion: "sigua-faction-catalog/v1",
    factions: [],
    catalogGroups: { china: [{ id: "agesi", nameZh: "阿格西联邦" }] },
  };
  const index = buildCatalogIndexFromWiki(vehicles, factions, topology, "china");
  assert.equal(index.groups[0].name, "阿格西联邦");
});
