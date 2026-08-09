import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  infantryWeaponDisplayNameZh,
  weaponDisplayNameZh,
  weaponNameZh,
} from "../../lib/weapon-display-name.ts";
import { vehicleConfigurationNameZh } from "../../lib/vehicle-configuration-name.ts";
import { vehicleDisplayNameZh } from "../../lib/vehicle-display-name.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const factionDirectory = path.join(ROOT, "public/catalog-data/factions");
const factionFiles = (await readdir(factionDirectory))
  .filter((file) => file.endsWith(".json"))
  .sort();
const [
  wikiVehicles,
  wikiWeapons,
  emplacedProjection,
  catalogIndex,
  factionDocuments,
] = await Promise.all([
  readFile(path.join(ROOT, "generated/wiki-vehicles.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "app/wiki-weapon-catalog.json"), "utf8").then(JSON.parse),
  readFile(
    path.join(ROOT, "config/emplaced-weapon-catalog-projection.json"),
    "utf8",
  ).then(JSON.parse),
  readFile(path.join(ROOT, "generated/catalog-index.json"), "utf8").then(JSON.parse),
  Promise.all(
    factionFiles.map((file) =>
      readFile(path.join(factionDirectory, file), "utf8").then(JSON.parse)
    ),
  ),
]);

const catalogRecords = factionDocuments.flatMap((document) => document.records ?? []);
const catalogRecordById = new Map(
  catalogRecords.map((record) => [record.promoEntryId, record]),
);

test("military system names use conventional Chinese nomenclature", () => {
  assert.equal(
    weaponNameZh("Kornet“康纳特”架设式反坦克导弹"),
    "9M133 Kornet“短号”架设式反坦克导弹",
  );
  assert.equal(
    weaponNameZh("Kornet “康纳特” 架设式反坦克导弹"),
    "9M133 Kornet“短号” 架设式反坦克导弹",
  );
  assert.match(weaponNameZh("9M133 Kornet"), /Kornet“短号”/u);
  assert.match(weaponNameZh("9M117M1 Bastion"), /Bastion“堡垒”/u);
  assert.match(weaponNameZh("9M113 Konkurs"), /Konkurs“竞赛”/u);
  assert.match(weaponNameZh("9M119M Refleks"), /Refleks“反射”/u);
  assert.equal(
    weaponNameZh("Self-Loading Pistol Mk3"),
    "Self-Loading Pistol Mk3“勃朗宁大威力”",
  );
  assert.equal(weaponNameZh("Vz. 61 Škorpion"), "Vz.61“蝎”式冲锋手枪");
  assert.equal(
    weaponNameZh("QBZ-192 · 消音器 · 步枪"),
    "QBZ-192· 消声器· 步枪",
  );
  assert.equal(
    vehicleConfigurationNameZh("Kornet"),
    "9M133 Kornet“短号”反坦克导弹",
  );
  assert.equal(
    weaponDisplayNameZh({
      displayName: "9M133 Kornet",
      gunName: "9M133 Kornet",
      projectileName: "BP_Kornet_Proj2_C",
    }),
    "9M133 Kornet“短号” 反坦克导弹",
  );
});

test("vehicle names retain designations and translate roles, nicknames, and weapon fits", () => {
  assert.equal(vehicleDisplayNameZh("M1A2"), "M1A2“艾布拉姆斯”");
  assert.equal(vehicleDisplayNameZh("M2A3"), "M2A3“布莱德利”");
  assert.equal(vehicleDisplayNameZh("MRH-90"), "MRH-90“太攀蛇”");
  assert.equal(vehicleDisplayNameZh("SA330"), "SA330“美洲豹”");
  assert.equal(vehicleDisplayNameZh("FV4034"), "FV4034“挑战者2”");
  assert.equal(vehicleDisplayNameZh("FV510"), "FV510“武士”");
  assert.equal(vehicleDisplayNameZh("Leopard 2A6M CAN"), "“豹”2A6M CAN");
  assert.equal(vehicleDisplayNameZh("LAV 6"), "LAV 6");
  assert.equal(vehicleDisplayNameZh("Sprut-SDM1"), "“章鱼”SDM1");
  assert.equal(
    vehicleDisplayNameZh("Technical Kornet"),
    "武装皮卡 · 9M133 Kornet“短号”反坦克导弹",
  );
  assert.equal(
    vehicleDisplayNameZh("Tigr-M RWS Kord"),
    "“虎-M” · 遥控武器站 · Kord“科尔德”重机枪",
  );
  assert.equal(
    vehicleDisplayNameZh("M1126 CROWS M240"),
    "M1126“斯崔克” · CROWS 遥控武器站 · M240 通用机枪",
  );
  assert.equal(
    vehicleDisplayNameZh("M1128 MGS"),
    "M1128“斯崔克” · 机动火炮系统",
  );
  assert.equal(
    vehicleDisplayNameZh("Transport Modern Pickup"),
    "现代皮卡 · 运输型",
  );
});

test("infantry database labels translate equipment, ammunition, and attachments", () => {
  assert.equal(
    infantryWeaponDisplayNameZh({
      displayName: "AK-74 Bayonet",
      gunName: "AK-74 Bayonet",
      projectileName: null,
      type: "Rifle",
    }),
    "AK-74 刺刀 · 步枪",
  );
  assert.equal(
    infantryWeaponDisplayNameZh({
      displayName: "M18 Smoke Grenade",
      gunName: "M18 Smoke Grenade",
      projectileName: null,
      type: "Smokegrenade",
    }),
    "M18 烟雾弹",
  );
  assert.equal(
    infantryWeaponDisplayNameZh({
      displayName: "Ammo Bag",
      gunName: "Ammo Bag",
      projectileName: null,
      type: "Resupply",
    }),
    "弹药包",
  );
  assert.equal(
    infantryWeaponDisplayNameZh({
      displayName: "NLAW",
      gunName: "NLAW",
      projectileName: null,
      type: "Lat",
    }),
    "NLAW 反坦克导弹",
  );
});

test("every visible vehicle label translates high-risk military terms", () => {
  const expectedTerms = new Map([
    ["Technical", "武装"],
    ["Logistics", "补给"],
    ["Transport", "运输"],
    ["RWS", "遥控武器站"],
    ["Minigun", "转管机枪"],
    ["Kornet", "短号"],
    ["Kord", "科尔德"],
    ["Spandrel", "竞赛"],
    ["Grad", "冰雹"],
  ]);
  for (const vehicle of wikiVehicles.items) {
    const localized = vehicleDisplayNameZh(vehicle.displayName);
    assert.doesNotMatch(localized, /康纳特/u, vehicle.displayName);
    for (const [sourceTerm, translatedTerm] of expectedTerms) {
      if (!vehicle.displayName.includes(sourceTerm)) continue;
      assert.match(localized, new RegExp(translatedTerm, "u"), vehicle.displayName);
    }
  }
});

test("visible weapon labels eliminate stale and untranslated high-risk terms", () => {
  const legacyEnglish = [
    "High Explosive",
    "Fragmentation",
    "Smoke",
    "Bayonet",
    "Detonator",
    "Explosive",
    "Anti-Tank Mine",
    "Minigun",
  ];
  for (const family of wikiWeapons.data.wikiFamilies) {
    const localized = infantryWeaponDisplayNameZh({
      displayName: family.displayName,
      gunName: family.fullName,
      projectileName: null,
      type: family.type,
    });
    assert.doesNotMatch(localized, /康纳特/u, family.displayName);
    for (const sourceTerm of legacyEnglish) {
      if (!family.displayName.includes(sourceTerm)) continue;
      assert.ok(
        !localized.includes(sourceTerm),
        `${family.displayName} retained ${sourceTerm}: ${localized}`,
      );
    }
  }

  const kornetVariants = wikiWeapons.data.selectorVariants.filter((variant) =>
    /Kornet|康纳特/iu.test(variant.displayLabel),
  );
  assert.ok(kornetVariants.length > 0);
  for (const variant of kornetVariants) {
    const localized = weaponNameZh(variant.displayLabel);
    assert.match(localized, /短号/u, variant.displayLabel);
    assert.doesNotMatch(localized, /康纳特/u, variant.displayLabel);
  }
});

test("the emplaced weapon source stores the corrected Kornet name and alias", () => {
  const kornet = emplacedProjection.aliases.find(
    ({ id }) => id === "runtime-emplaced-kornet",
  );
  assert.ok(kornet);
  assert.equal(kornet.familyLabel, "9M133 Kornet“短号”");
  assert.equal(kornet.label, "9M133 Kornet“短号”架设式反坦克导弹");
  assert.ok(kornet.searchAliases.includes("短号"));
  assert.doesNotMatch(JSON.stringify(kornet), /康纳特/u);
});

test("vehicle cards keep semantic configurations on the localized second line", () => {
  const expectedPresentations = new Map([
    ["adf--m1151-tow--td", ["M1151", "TOW"]],
    ["afu--technical-kornet--td", ["Technical", "Kornet"]],
    ["baf--fv520-ctas40--ifv", ["FV520", "CTAS40"]],
    ["gfi--uh-1h-mg3--uh", ["UH-1H", "MG3"]],
    ["imf--mt-lbm-6mb--ifv", ["MT-LBM", "6MB"]],
    ["imf--tigr-m-kord--mrap", ["Tigr-M", "Kord"]],
    ["mei--m1151-technical-dshk--ltv", ["M1151", "Technical DSHK"]],
    ["pla--zsd89ii-ifv--ifv", ["ZSD89II", "IFV"]],
    ["tlf--uh60-pkm--uh", ["UH60", "PKM"]],
    ["usa--m1128-mgs--mgs", ["M1128", "MGS"]],
    ["usa--matv-crows-m2--mrap", ["MATV", "CROWS M2"]],
    ["usa--m1064a3-m121--spa", ["M1064A3", "M121"]],
  ]);

  for (const [cardId, [vehicleNameZh, configurationZh]] of expectedPresentations) {
    const record = catalogRecordById.get(cardId);
    assert.ok(record, cardId);
    assert.deepEqual(
      record.official.presentation,
      { vehicleNameZh, configurationZh },
      cardId,
    );
  }

  const inlineConfigurations = catalogRecords
    .filter((record) => !["UAV", "CAS", "DRONE"].includes(record.official?.typeZh))
    .filter((record) => record.official?.presentation?.configurationZh == null)
    .map((record) => ({
      cardId: record.promoEntryId,
      localized: vehicleDisplayNameZh(
        record.official?.presentation?.vehicleNameZh ?? record.official?.nameZh ?? "",
      ),
    }))
    .filter(({ localized }) => localized.includes(" · "));
  assert.deepEqual(inlineConfigurations, []);
});

test("support aircraft and drones use complete Chinese card presentations", () => {
  const expectedVariants = new Map([
    ["adf--mq9--uav", [["MQ-9", "Reaper“死神”无人机"]]],
    ["adf--fa18--cas", [
      ["F/A-18F", "30 mm 机炮扫射"],
      ["F/A-18F", "火箭弹空袭"],
    ]],
    ["afu--su25--cas", [
      ["Su-25", "精确制导炸弹空袭"],
      ["Su-25", "S-8 火箭弹空袭"],
    ]],
    ["gfi--pchela--uav", [["Pchela-1T", "“蜜蜂-1T”侦察无人机"]]],
    ["crf--portable-recon-drone--drone", [
      ["侦察无人机", "可回收式"],
      ["侦察无人机", "便携式"],
    ]],
  ]);

  for (const [cardId, presentations] of expectedVariants) {
    const record = catalogRecordById.get(cardId);
    assert.ok(record, cardId);
    assert.deepEqual(
      record.variants.map((variant) => [
        variant.presentation?.vehicleNameZh,
        variant.presentation?.configurationZh,
      ]),
      presentations,
      cardId,
    );
  }

  const untranslatedSupportLabels = catalogRecords
    .filter((record) => ["UAV", "CAS", "DRONE"].includes(record.official?.typeZh))
    .flatMap((record) => record.variants)
    .filter((variant) =>
      /\b(?:Strafe|Strike|Portable|Recoverable|Recon|Scout)\b/u.test(
        variant.presentation?.configurationZh ?? "",
      )
    );
  assert.deepEqual(untranslatedSupportLabels, []);
});

test("compact search records and faction shards share the exact card presentation", () => {
  const searchRecordById = new Map(
    catalogIndex.records.map((record) => [record.promoEntryId, record]),
  );

  for (const record of catalogRecords) {
    const searchRecord = searchRecordById.get(record.promoEntryId);
    assert.ok(searchRecord, record.promoEntryId);
    assert.deepEqual(
      searchRecord.official,
      record.official,
      record.promoEntryId,
    );
  }
});
