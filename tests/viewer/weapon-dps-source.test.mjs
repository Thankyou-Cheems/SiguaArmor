import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveWeaponDpsWeaponForRuntimeAssignment,
  weaponDpsWeaponsFromWikiDocument,
} from "../../lib/weapon-dps-source.ts";

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
  assert.equal(
    resolveWeaponDpsWeaponForRuntimeAssignment(result.weapons, {
      weaponAssignmentId: "assignment-exact:variant-thermal",
      sourceCardId: "afu--bmp-2--ifv",
      sourceRawName: "BP_BMP2_AFU",
      weaponId: "variant-thermal",
    })?.assignmentId,
    "assignment-exact",
  );
  assert.equal(
    resolveWeaponDpsWeaponForRuntimeAssignment(result.weapons, {
      weaponAssignmentId: "assignment-exact:wrong-variant",
      sourceCardId: "afu--bmp-2--ifv",
      sourceRawName: "BP_BMP2_AFU",
      weaponId: "wrong-variant",
    }),
    null,
  );
  assert.equal(
    resolveWeaponDpsWeaponForRuntimeAssignment(result.weapons, {
      weaponAssignmentId: null,
      sourceCardId: "afu--bmp-2--ifv",
      sourceRawName: "9M113 Konkurs Guided Missile",
      weaponId: "variant-thermal",
    })?.assignmentId,
    "assignment-exact",
  );
  assert.equal(
    resolveWeaponDpsWeaponForRuntimeAssignment(
      [...result.weapons, { ...result.weapons[0], assignmentId: "assignment-duplicate" }],
      {
        weaponAssignmentId: null,
        sourceCardId: "afu--bmp-2--ifv",
        sourceRawName: "display-only",
        weaponId: "variant-thermal",
      },
    ),
    null,
  );
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

test("DPS analysis stays inside the clicked-hit damage card", async () => {
  const viewer = await readFile(new URL("../../app/RuntimeVehicleViewer.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  const timeline = await readFile(new URL("../../app/WeaponRhythmTimeline.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(viewer, /weaponDpsHref|viewer-weapon-dps-link|\/weapon-dps\?/u);
  assert.match(viewer, /function HitDpsTimingCard/u);
  assert.match(viewer, /optimization\.recommended/u);
  assert.match(viewer, /<WeaponRhythmTimeline/u);
  const outcomeDetails = viewer.slice(
    viewer.indexOf('<div className="viewer-shot-outcome-summary__details">'),
    viewer.indexOf('<ul className="viewer-shot-outcome-summary__targets">'),
  );
  assert.doesNotMatch(outcomeDetails, /HitDpsTimingCard/u);
  assert.doesNotMatch(viewer, /viewer-hit-dps-dock/u);
  assert.match(viewer, /className="viewer-hit-dps-fold"/u);
  assert.ok(
    viewer.lastIndexOf("<HitDpsTimingCard") >
      viewer.indexOf('<ol className="viewer-causal-spine">'),
    "the folded DPS explanation must be the final section in the right result rail",
  );
  assert.match(viewer, /primarySimulation\.thermalState === "unavailable"/u);
  assert.match(
    viewer,
    /data-thermal-state="unavailable"[\s\S]*?<WeaponRhythmTimeline/u,
  );
  assert.match(viewer, /单发摧毁/u);
  assert.doesNotMatch(viewer, /function hitDpsTimingReason/u);
  assert.match(viewer, /function hitDpsTimingFacts/u);
  assert.match(viewer, /className="viewer-hit-dps-timing__facts"/u);
  assert.match(viewer, /label: "首发"/u);
  assert.match(viewer, /label: "装填 \/ 再发"/u);
  assert.match(viewer, /label: "计时", value: "同时"/u);
  assert.match(viewer, /secondaryLabel=\{secondarySummary \|\| null\}/u);
  assert.match(
    styles,
    /\.viewer-hit-dps-fold\s*\{[\s\S]*?margin-top:/u,
  );
  assert.match(timeline, /<linearGradient/u);
  assert.match(timeline, /overheat-cooling-pattern/u);
  assert.match(timeline, /过热冷却/u);
  assert.match(timeline, /function stepPathFor/u);
  assert.match(timeline, /reload-pattern/u);
  assert.match(timeline, /换弹伤害真空/u);
  assert.match(timeline, /data-has-heat=\{showHeat\}/u);
  assert.doesNotMatch(timeline, /<circle|shot-point|hoveredShot|useState/u);
  await assert.rejects(
    access(new URL("../../app/weapon-dps/page.tsx", import.meta.url)),
    { code: "ENOENT" },
  );
  await assert.rejects(
    access(new URL("../../app/china/weapon-dps/page.tsx", import.meta.url)),
    { code: "ENOENT" },
  );
});
