import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { weaponDpsWeaponsFromWikiDocument } from "../../lib/weapon-dps-source.ts";

const sampleCatalog = {
  schemaVersion: "sigua-weapon-catalog/v2",
  sourceBuildId: "sdk-test",
  selector: {
    variants: [{
      id: "variant-thermal",
      overheat: {
        state: "observed",
        heatPerShot: 3.4,
        temperatureMin: 60,
        temperatureMax: 120,
        coolingRatePerSecond: 15,
        triggerStep: 6,
        shutdownTemperature: 105,
        triggerAt: 108,
        unlockTemperature: 102,
      },
    }],
  },
  relations: {
    vehicleEquipmentBindings: [{
      id: "assignment-exact",
      cardId: "afu--bmp-2--ifv",
      rawName: "BP_BMP2_AFU",
      weaponVariantIds: ["variant-thermal"],
      equipment: {
        displayName: "2A42 AP",
        gunName: "BP_BMP2_2A42_AP",
        maxDamageToApply: 300,
        magSize: 100,
        tacticalReloadDurationSeconds: 4,
        dryReloadDurationSeconds: 4,
        roundsPerMinute: null,
        mechanics: { timeBetweenShotsSeconds: 0.092 },
        projectile: { impactDamage: 300 },
      },
    }],
  },
};

test("Wiki adapter keeps exact assignment identity and carries the thermal profile", () => {
  const result = weaponDpsWeaponsFromWikiDocument(sampleCatalog);
  assert.equal(result.sourceRevision, "sdk-test");
  assert.equal(result.overheatProfileCount, 1);
  assert.equal(result.weapons.length, 1);
  assert.equal(result.weapons[0].assignmentId, "assignment-exact");
  assert.equal(result.weapons[0].sourceRawName, "BP_BMP2_AFU");
  assert.equal(result.weapons[0].overheat?.triggerAt, 108);
});

test("conflicting delivery profiles fail closed instead of selecting the first variant", () => {
  const document = structuredClone(sampleCatalog);
  document.selector.variants.push({
    id: "variant-conflict",
    overheat: {
      state: "observed",
      heatPerShot: 4.5,
      temperatureMin: 60,
      temperatureMax: 120,
      coolingRatePerSecond: 15,
      triggerStep: 6,
      shutdownTemperature: 105,
      triggerAt: 108,
      unlockTemperature: 102,
    },
  });
  document.relations.vehicleEquipmentBindings[0].weaponVariantIds.push("variant-conflict");
  const result = weaponDpsWeaponsFromWikiDocument(document);
  assert.equal(result.overheatProfileCount, 0);
  assert.equal(result.weapons[0].overheat, null);
});

test("Wiki infantry configurations remain selectable as separate assignments", () => {
  const document = structuredClone(sampleCatalog);
  document.selector.variants.push({
    id: "variant-infantry",
    selectorVisibility: "shipping",
    configurationKeys: ["BP_TEST_RIFLE"],
  });
  document.wiki = {
    configurations: [{
      weaponKey: "BP_TEST_RIFLE",
      displayName: "Test rifle",
      factions: ["TEST"],
      weaponInfo: {
        timeBetweenShots: 0.1,
        magSize: 30,
        maxDamageToApply: 60,
        tacticalReloadDuration: 2,
        dryReloadDuration: 3,
        projectileInfo: { impactDamage: -1 },
      },
    }],
  };
  const result = weaponDpsWeaponsFromWikiDocument(document);
  const rifle = result.weapons.find(({ assignmentId }) => assignmentId === "wiki-config:BP_TEST_RIFLE");
  assert.ok(rifle);
  assert.equal(rifle.timeBetweenShotsSeconds, 0.1);
  assert.equal(rifle.damagePerShot, 60);
  assert.equal(rifle.sourceRawName, "BP_TEST_RIFLE");
});

test("selector links preserve exact DPS query coordinates", async () => {
  const viewer = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
  assert.match(viewer, /\/weapon-dps\?cardId=\$\{encodeURIComponent\(dpsWeapon\.sourceCardId\)\}/u);
  assert.match(viewer, /rawName=\$\{encodeURIComponent\(dpsWeapon\.sourceRawName\)\}/u);
  assert.match(viewer, /weaponAssignmentId=\$\{encodeURIComponent\(dpsWeapon\.weaponAssignmentId\)\}/u);
});
