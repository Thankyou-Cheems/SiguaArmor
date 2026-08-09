import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";
import {
  createVehicleCatalogResolver,
  validateVehicleCatalog,
} from "../lib/vehicle-catalog.mjs";
import {
  compactPublicFactionCatalog,
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
} from "../lib/public-faction-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "generated", "international-catalog.json");
const indexPath = path.join(root, "generated", "catalog-index.json");
const weaponCatalogPath = path.join(
  root,
  "generated",
  "internal",
  "weapon-catalog.json",
);
const factionDirectory = path.join(root, "public", "catalog-data", "factions");
const chinaProfilePath = path.join(root, "config", "china-site-profile.json");
const vehicleCatalogPath = path.join(
  root,
  "generated",
  "internal",
  "vehicle-catalog.json",
);
const supportAirConfigPath = path.join(
  root,
  "config",
  "support-air-assets.json",
);
const chinaIndexPath = path.join(root, "generated", "china-catalog-index.json");
const chinaFactionDirectory = path.join(
  root,
  "public",
  "catalog-data",
  "china",
  "factions",
);
function invariant(condition, message) {
  if (!condition) throw new Error(`Encyclopedia data generation stopped: ${message}`);
}

function uniqueSearchTerms(values) {
  return [...new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function pinyinSearchAliases(values) {
  const aliases = new Set();
  for (const value of uniqueSearchTerms(values)) {
    for (const match of value.matchAll(/\p{Script=Han}+/gu)) {
      const syllables = pinyin(match[0], {
        toneType: "none",
        type: "array",
        nonZh: "removed",
      }).filter(Boolean);
      if (syllables.length === 0) continue;
      aliases.add(syllables.join(""));
      if (syllables.length > 1) aliases.add(syllables.map((syllable) => syllable[0]).join(""));
    }
  }
  return [...aliases];
}

function searchMetadata(values) {
  const searchTerms = uniqueSearchTerms(values).filter((value) =>
    /\p{Script=Han}/u.test(value)
  );
  if (searchTerms.length === 0) return {};
  return {
    searchTerms,
    searchAliases: pinyinSearchAliases(searchTerms),
  };
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const weaponCatalog = JSON.parse(
  await readFile(weaponCatalogPath, "utf8"),
);
const chinaProfileBytes = await readFile(chinaProfilePath);
const chinaProfile = JSON.parse(chinaProfileBytes.toString("utf8"));
const vehicleCatalogBytes = await readFile(vehicleCatalogPath);
const vehicleCatalog = validateVehicleCatalog(
  JSON.parse(vehicleCatalogBytes.toString("utf8")),
);
const supportAirConfigBytes = await readFile(supportAirConfigPath);
const supportAirConfig = JSON.parse(supportAirConfigBytes.toString("utf8"));
const vehicleCatalogResolver =
  createVehicleCatalogResolver(vehicleCatalog);
const supportBindingByKey = new Map(
  vehicleCatalog.extensions.supportAir.bindings.map((binding) => [
    binding.bindingKey,
    binding,
  ]),
);
const publicProjectionRevision = createHash("sha256")
  .update(PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION)
  .digest("hex")
  .slice(0, 12);
const ENCYCLOPEDIA_DATA_REVISION =
  `vehicle-v3.1-${vehicleCatalog.catalogRevision.slice(0, 20)}` +
  `-projection-${publicProjectionRevision}`;

if (source.schemaVersion !== "1.0.0" || !Array.isArray(source.factions)) {
  throw new Error("Unsupported international catalog schema");
}
invariant(
  weaponCatalog.schemaVersion === "sigua-weapon-catalog/v2" &&
    weaponCatalog.audit?.vehicleEquipmentReferenceClosure === true &&
    weaponCatalog.audit?.vehicleEquipmentSelectorRelationClosure === true &&
    weaponCatalog.audit?.vehicleEquipmentSelectorResolutionUnambiguous === true &&
    Array.isArray(
      weaponCatalog.relations?.vehicleEquipmentBindings,
    ),
  "canonical weapon catalog is not closed",
);
invariant(
  supportAirConfig?.schemaVersion === "sigua-support-air-assets/v1" &&
    Array.isArray(supportAirConfig.captureTargets) &&
    Array.isArray(supportAirConfig.cards),
  "unsupported support-air catalog configuration",
);
invariant(
  chinaProfile?.schemaVersion === "sigua-china-site-profile/v1" &&
    typeof chinaProfile.catalogId === "string" &&
    Array.isArray(chinaProfile.groups) &&
    Array.isArray(chinaProfile.vehicleNameRules),
  "unsupported China site profile",
);
const expectedVariantCount = source.factions.reduce(
  (total, faction) =>
    total + faction.cards.reduce((cardTotal, card) => cardTotal + card.variants.length, 0),
  0,
);
const weaponBindingById = new Map(
  weaponCatalog.relations.vehicleEquipmentBindings.map(
    (binding) => [binding.id, binding],
  ),
);

function variantCardId(cardId, rawName) {
  return `${cardId}--${rawName
    .replace(/^BP_/, "")
    .toLocaleLowerCase("en")
    .replaceAll("_", "-")}`;
}

const MULTIWORD_VEHICLE_FAMILIES = ["KamAZ 5350", "PARS III", "Cobra II", "LAV III"];
const NON_VEHICLE_PREFIXES = new Set(["Light", "LAV"]);
const VARIANT_PLATFORM_CARD_ROLES = new Map([
  ["Light Transport", "Transport"],
  ["Light FSV", null],
]);
const EXACT_CARD_PRESENTATIONS = new Map([
  ["FV520 CTAS40", { vehicleNameZh: "FV520", configurationZh: "CTAS40" }],
  ["M1064A3 M121", { vehicleNameZh: "M1064A3", configurationZh: "M121" }],
  ["M1128 MGS", { vehicleNameZh: "M1128", configurationZh: "MGS" }],
  ["M1151 TOW", { vehicleNameZh: "M1151", configurationZh: "TOW" }],
  [
    "M1151 Technical DSHK",
    { vehicleNameZh: "M1151", configurationZh: "Technical DSHK" },
  ],
  [
    "MATV CROWS M2",
    { vehicleNameZh: "MATV", configurationZh: "CROWS M2" },
  ],
  ["Modern Technical UB-32", {
    vehicleNameZh: "Modern Technical",
    configurationZh: "UB-32",
  }],
  ["MT-LBM 6MB", { vehicleNameZh: "MT-LBM", configurationZh: "6MB" }],
  ["Technical Kornet", {
    vehicleNameZh: "Technical",
    configurationZh: "Kornet",
  }],
  ["Tigr-M Kord", { vehicleNameZh: "Tigr-M", configurationZh: "Kord" }],
  ["UH-1H MG3", { vehicleNameZh: "UH-1H", configurationZh: "MG3" }],
  ["UH60 PKM", { vehicleNameZh: "UH60", configurationZh: "PKM" }],
  ["ZSD89II IFV", { vehicleNameZh: "ZSD89II", configurationZh: "IFV" }],
  ["ZSL92 IFV", { vehicleNameZh: "ZSL92", configurationZh: "IFV" }],
]);
const SUPPORT_TARGET_PRESENTATIONS = new Map([
  ["mq9", { vehicleNameZh: "MQ-9", configurationZh: "Reaper“死神”无人机" }],
  ["tb2", { vehicleNameZh: "Bayraktar TB2", configurationZh: "“旗手”无人机" }],
  ["pchela", { vehicleNameZh: "Pchela-1T", configurationZh: "“蜜蜂-1T”侦察无人机" }],
  ["ch4a", { vehicleNameZh: "CH-4A", configurationZh: "“彩虹-4A”无人机" }],
  ["a10-strafe", { vehicleNameZh: "A-10A", configurationZh: "30 mm 机炮扫射" }],
  ["fa18-strafe", { vehicleNameZh: "F/A-18F", configurationZh: "30 mm 机炮扫射" }],
  ["fa18-rockets", { vehicleNameZh: "F/A-18F", configurationZh: "火箭弹空袭" }],
  ["cf18-bomb", { vehicleNameZh: "CF-18", configurationZh: "精确制导炸弹空袭" }],
  ["cf18-rockets", { vehicleNameZh: "CF-18", configurationZh: "火箭弹空袭" }],
  ["su25-bomb", { vehicleNameZh: "Su-25", configurationZh: "精确制导炸弹空袭" }],
  ["su25-rockets", { vehicleNameZh: "Su-25", configurationZh: "S-8 火箭弹空袭" }],
  ["su25-gfi-rockets", { vehicleNameZh: "Su-25", configurationZh: "S-8 火箭弹空袭" }],
  ["jh7a-rockets", { vehicleNameZh: "JH-7A", configurationZh: "火箭弹空袭" }],
  ["f16-rockets", { vehicleNameZh: "F-16C", configurationZh: "火箭弹空袭" }],
  ["portable-standard", { vehicleNameZh: "侦察无人机", configurationZh: "便携式" }],
  ["portable-recoverable", { vehicleNameZh: "侦察无人机", configurationZh: "可回收式" }],
  ["portable-wpmc", { vehicleNameZh: "侦察无人机", configurationZh: "便携式" }],
]);
const cardPresentationRevision = createHash("sha256")
  .update(JSON.stringify([
    ...EXACT_CARD_PRESENTATIONS,
    ...SUPPORT_TARGET_PRESENTATIONS,
  ]))
  .digest("hex")
  .slice(0, 12);

function operationalRoleName(value) {
  return value.toLocaleLowerCase("en") === "logistics" ? "Logistics" : "Transport";
}

function operationalRolePresentation(displayName) {
  if (VARIANT_PLATFORM_CARD_ROLES.has(displayName)) return null;

  const suffixRole = displayName.match(/^(.+?)\s+(Logistics|Transport)$/i);
  if (suffixRole) {
    return {
      vehicleNameZh: suffixRole[1].trim(),
      configurationZh: operationalRoleName(suffixRole[2]),
    };
  }

  const prefixRole = displayName.match(/^(Logistics|Transport)\s+(.+)$/i);
  if (prefixRole) {
    return {
      vehicleNameZh: prefixRole[2].trim(),
      configurationZh: operationalRoleName(prefixRole[1]),
    };
  }

  return null;
}

function vehicleFamilySeed(displayName) {
  if (/^(?:Logistics|Transport) Modern Pickup$/i.test(displayName)) return "Modern Pickup";
  const multiwordFamily = MULTIWORD_VEHICLE_FAMILIES.find(
    (family) => displayName === family || displayName.startsWith(`${family} `),
  );
  if (multiwordFamily) return multiwordFamily;
  const [firstToken] = displayName.trim().split(/\s+/);
  return firstToken && !NON_VEHICLE_PREFIXES.has(firstToken) ? firstToken : null;
}

const catalogFamilyMembers = new Map();
for (const faction of source.factions) {
  for (const card of faction.cards) {
    const family = vehicleFamilySeed(card.displayName);
    if (!family) continue;
    const names = catalogFamilyMembers.get(family) ?? new Set();
    names.add(card.displayName);
    catalogFamilyMembers.set(family, names);
  }
}

function buildCardPresentations(faction) {
  return new Map(
    faction.cards.map((card) => {
      const exactPresentation = EXACT_CARD_PRESENTATIONS.get(card.displayName);
      if (exactPresentation) return [card.cardId, exactPresentation];

      if (VARIANT_PLATFORM_CARD_ROLES.has(card.displayName)) {
        return [
          card.cardId,
          { vehicleNameZh: card.displayName, configurationZh: null },
        ];
      }

      const rolePresentation = operationalRolePresentation(card.displayName);
      if (rolePresentation) return [card.cardId, rolePresentation];

      const family = vehicleFamilySeed(card.displayName);
      if (!family || (catalogFamilyMembers.get(family)?.size ?? 0) < 2) {
        return [
          card.cardId,
          { vehicleNameZh: card.displayName, configurationZh: null },
        ];
      }

      const configurationZh = card.displayName === family
        ? null
        : card.displayName.slice(family.length).trim() || null;
      return [card.cardId, { vehicleNameZh: family, configurationZh }];
    }),
  );
}

const LIVERY_PATTERNS = [
  [/(?:^|[_-])Wood\s*Land(?:[_-]|$)/i, "林地"],
  [/(?:^|[_-])(?:Desert|Arid)(?:[_-]|$)/i, "沙漠"],
  [/(?:^|[_-])Naval(?:[_-]|$)/i, "海军迷彩"],
  [/(?:^|[_-])Black(?:[_-]|$)/i, "黑色涂装"],
  [/(?:^|[_-])Blue(?:[_-]|$)/i, "蓝色涂装"],
  [/(?:^|[_-])Gr[ae]y(?:[_-]|$)/i, "灰色涂装"],
  [/(?:^|[_-])Tan(?:[_-]|$)/i, "沙色涂装"],
  [/(?:^|[_-])Green(?:[_-]|$)/i, "绿色涂装"],
  [/(?:^|[_-])Red(?:[_-]|$)/i, "红色涂装"],
  [/(?:^|[_-])White(?:[_-]|$)/i, "白色涂装"],
];

function explicitLivery(rawName) {
  if (/^BP_Minsk$/i.test(rawName)) return "红色涂装";
  return LIVERY_PATTERNS.find(([pattern]) => pattern.test(rawName))?.[1] ?? null;
}

function rawPlatform(rawName) {
  if (/Technical\d*Seater/i.test(rawName)) return "技术皮卡";
  if (/(?:^|_)LUVW(?:_|$)/i.test(rawName)) return "LUVW";
  if (/(?:^|_)CPV(?:_|$)/i.test(rawName)) return "CPV";
  if (/(?:^|_)M1151(?:_|$)/i.test(rawName)) return "M1151";
  return null;
}

function rawPlatformVehicleName(platform) {
  return platform === "技术皮卡" ? "Technical" : platform;
}

function rawSeatConfiguration(rawName) {
  if (/Technical2Seater/i.test(rawName)) return "双座型";
  if (/Technical4Seater/i.test(rawName)) return "四座型";
  return null;
}

function rawWeaponConfiguration(rawName) {
  if (/(?:^|_)DSHK(?:_|$)/i.test(rawName)) return "DShK";
  if (/(?:^|_)M2(?:_|$)/i.test(rawName)) return "M2";
  return null;
}

function hasVariantContrast(card, pattern) {
  const matches = card.variants.map((variant) => pattern.test(variant.rawName));
  return matches.some(Boolean) && matches.some((match) => !match);
}

function buildVariantPresentation(card, variant) {
  const explicitLiveries = card.variants.map((candidate) => explicitLivery(candidate.rawName));
  const currentLivery = explicitLivery(variant.rawName);
  const hasWoodland = explicitLiveries.includes("林地");
  const hasDesert = explicitLiveries.includes("沙漠");
  const hasNamedLivery = explicitLiveries.some(Boolean);
  const liveryZh = currentLivery
    ?? (hasWoodland && !hasDesert
      ? "沙漠"
      : hasDesert && !hasWoodland
        ? "林地"
        : hasNamedLivery
          ? "标准涂装"
          : null);

  const configurations = [];
  const platforms = new Set(card.variants.map((candidate) => rawPlatform(candidate.rawName)).filter(Boolean));
  const seats = new Set(
    card.variants.map((candidate) => rawSeatConfiguration(candidate.rawName)).filter(Boolean),
  );
  const weapons = new Set(
    card.variants.map((candidate) => rawWeaponConfiguration(candidate.rawName)).filter(Boolean),
  );
  const platform = rawPlatform(variant.rawName);
  const seat = rawSeatConfiguration(variant.rawName);
  const weapon = rawWeaponConfiguration(variant.rawName);
  const titleTokens = new Set(
    (card.displayName.match(/[a-z0-9-]+/gi) ?? []).map((token) => token.toLowerCase()),
  );
  const platformAlreadyNamedByCard = platform
    ? titleTokens.has(rawPlatformVehicleName(platform).toLowerCase())
    : false;
  const usesVariantVehicleName = VARIANT_PLATFORM_CARD_ROLES.has(card.displayName);
  const vehicleNameZh = usesVariantVehicleName && platform
    ? rawPlatformVehicleName(platform)
    : null;

  if (usesVariantVehicleName) {
    invariant(vehicleNameZh, `${card.cardId} variant ${variant.rawName} has no recognized platform`);
  }

  if (
    !usesVariantVehicleName &&
    platforms.size > 1 &&
    platform &&
    !platformAlreadyNamedByCard
  ) {
    configurations.push(platform);
  }
  const sharedRole = usesVariantVehicleName
    ? VARIANT_PLATFORM_CARD_ROLES.get(card.displayName)
    : null;
  if (sharedRole) configurations.push(sharedRole);
  if (seats.size > 1 && seat) configurations.push(seat);
  if ((usesVariantVehicleName || weapons.size > 1) && weapon) configurations.push(weapon);
  if (hasVariantContrast(card, /Armou?red/i) && /Armou?red/i.test(variant.rawName)) {
    configurations.push("装甲型");
  }
  if (hasVariantContrast(card, /(?:^|_)Light(?:_|$)/i) && /(?:^|_)Light(?:_|$)/i.test(variant.rawName)) {
    configurations.push("轻型");
  }
  if (hasVariantContrast(card, /(?:^|_)w?Cage(?:_|$)/i) && /(?:^|_)w?Cage(?:_|$)/i.test(variant.rawName)) {
    configurations.push("笼式装甲");
  }
  if (hasVariantContrast(card, /Mag58x3/i) && /Mag58x3/i.test(variant.rawName)) {
    configurations.push("三联装");
  }

  return {
    ...(vehicleNameZh ? { vehicleNameZh } : {}),
    liveryZh,
    configurationZh: configurations.length > 0 ? configurations.join(" · ") : null,
  };
}

function combinedConfiguration(cardPresentation, variantPresentation) {
  return [cardPresentation.configurationZh, variantPresentation.configurationZh]
    .filter(Boolean)
    .join(" · ");
}

function variantDisplayName(cardPresentation, variantPresentation) {
  const configuration = combinedConfiguration(cardPresentation, variantPresentation);
  const vehicleName = variantPresentation.vehicleNameZh ?? cardPresentation.vehicleNameZh;
  const configuredName = configuration
    ? `${vehicleName} ${configuration}`
    : vehicleName;
  return variantPresentation.liveryZh
    ? `${configuredName}（${variantPresentation.liveryZh}）`
    : configuredName;
}

function referenceData(cardId, variant) {
  return vehicleCatalogResolver.referenceData(
    cardId,
    variant.rawName,
  );
}

const groups = [...source.factions]
  .sort((left, right) => left.order - right.order)
  .map((faction, index) => ({
    id: faction.id.toLocaleLowerCase("en"),
    name: faction.name,
    order: index,
    recordCount: faction.cards.length,
  }));

const factionDocuments = [];
const searchRecords = [];
const seenCardIds = new Set();
const seenVariantCardIds = new Set();
const projectedRawNames = new Set();

for (const [groupIndex, faction] of [...source.factions]
  .sort((left, right) => left.order - right.order)
  .entries()) {
  const group = groups[groupIndex];
  const cardPresentations = buildCardPresentations(faction);
  const records = faction.cards.map((card) => {
    if (seenCardIds.has(card.cardId)) throw new Error(`Duplicate card id: ${card.cardId}`);
    seenCardIds.add(card.cardId);
    if (!Array.isArray(card.variants) || card.variants.length === 0) {
      throw new Error(`Card has no variants: ${card.cardId}`);
    }

    const cardPresentation = cardPresentations.get(card.cardId);
    if (!cardPresentation) throw new Error(`Missing card presentation: ${card.cardId}`);
    const variants = card.variants.map((variant) => {
      const cardId = variantCardId(card.cardId, variant.rawName);
      if (seenVariantCardIds.has(cardId)) throw new Error(`Duplicate variant card id: ${cardId}`);
      seenVariantCardIds.add(cardId);
      projectedRawNames.add(variant.rawName);
      const presentation = buildVariantPresentation(card, variant);
      const exactBinding = vehicleCatalogResolver.binding(
        card.cardId,
        variant.rawName,
      );
      invariant(
        exactBinding,
        `missing exact vehicle binding ${card.cardId}/${variant.rawName}`,
      );
      const data = referenceData(card.cardId, variant);
      const weaponBindings = data.weaponBindingIds.map(
        (bindingId) => {
          const binding = weaponBindingById.get(bindingId);
          invariant(
            binding,
            `${card.cardId}/${variant.rawName} references missing weapon binding ${bindingId}`,
          );
          return binding;
        },
      );
      const variantSearch = searchMetadata([
        variant.rawName,
        presentation.vehicleNameZh,
        presentation.liveryZh,
        presentation.configurationZh,
        data.general.displayName,
        data.general.rawName,
        ...weaponBindings.flatMap(({ equipment }) => [
          equipment.displayName,
          equipment.gunName,
          equipment.projectileName,
        ]),
      ]);
      return {
        sourceRawName: variant.rawName,
        catalogBindingRef: exactBinding.id,
        vehicleRef: exactBinding.vehicleRef,
        runtimeVehicleRef: exactBinding.runtimeVehicleRef,
        visualArtifactRef:
          exactBinding.visualArtifactRefs.international,
        alias: presentation.configurationZh ?? "",
        ...variantSearch,
        presentation,
        data,
      };
    });
    const firstVariant = card.variants[0];
    const recordSearch = searchMetadata([
      card.displayName,
      cardPresentation.vehicleNameZh,
      cardPresentation.configurationZh,
    ]);

    const record = {
      promoEntryId: card.cardId,
      promotionOrder: searchRecords.length + 1,
      ...recordSearch,
      official: {
        groupId: group.id,
        groupNameZh: faction.name,
        nameZh: card.displayName,
        typeZh: card.type,
        presentation: cardPresentation,
      },
      mapping: {
        selectedRawName: firstVariant.rawName,
      },
      data: null,
      variants,
    };

    const searchVariants = card.variants.map((variant, variantIndex) => {
      const cardId = variantCardId(card.cardId, variant.rawName);
      const presentation = buildVariantPresentation(card, variant);
      const projectedVariant = variants[variantIndex];
      return {
        sourceRawName: variant.rawName,
        catalogBindingRef: projectedVariant.catalogBindingRef,
        vehicleRef: projectedVariant.vehicleRef,
        runtimeVehicleRef: projectedVariant.runtimeVehicleRef,
        visualArtifactRef: projectedVariant.visualArtifactRef,
        alias: combinedConfiguration(cardPresentation, presentation),
        displayName: variantDisplayName(cardPresentation, presentation),
        searchTerms: projectedVariant.searchTerms,
        searchAliases: projectedVariant.searchAliases,
        presentation,
        cardId,
        routeSlug: cardId,
      };
    });
    searchRecords.push({
      promoEntryId: card.cardId,
      promotionOrder: record.promotionOrder,
      ...recordSearch,
      official: {
        groupId: group.id,
        groupNameZh: faction.name,
        nameZh: card.displayName,
        typeZh: card.type,
        presentation: cardPresentation,
      },
      selectedRawName: firstVariant.rawName,
      selectedDisplayName: variantDisplayName(
        cardPresentation,
        buildVariantPresentation(card, firstVariant),
      ),
      defaultCardId: searchVariants[0].cardId,
      routeSlug: card.cardId,
      variants: searchVariants,
    });
    return record;
  });

  factionDocuments.push({
    schemaVersion: "1.0.0",
    catalogId: source.catalogId,
    dataRevision: ENCYCLOPEDIA_DATA_REVISION,
    vehicleCatalogRevision: vehicleCatalog.catalogRevision,
    group,
    records,
  });
}

const index = {
  schemaVersion: "1.0.0",
  catalogId: source.catalogId,
  dataRevision: ENCYCLOPEDIA_DATA_REVISION,
  vehicleCatalogRevision: vehicleCatalog.catalogRevision,
  groups,
  records: searchRecords,
};

function chinaVehicleName(sourceGroupId, value) {
  if (typeof value !== "string" || value.length === 0) return value;
  let result = value;
  for (const [ruleIndex, rule] of chinaProfile.vehicleNameRules.entries()) {
    invariant(
      typeof rule.sourceGroupId === "string" &&
        typeof rule.match === "string" &&
        typeof rule.replace === "string",
      `China vehicle-name rule ${ruleIndex} is invalid`,
    );
    if (rule.sourceGroupId !== sourceGroupId) continue;
    result = result.replace(new RegExp(rule.match, "u"), rule.replace);
  }
  return result;
}

function clone(value) {
  return structuredClone(value);
}

const internationalDocumentByGroupId = new Map(
  factionDocuments.map((document) => [document.group.id, document]),
);
const internationalSearchByGroupId = new Map(
  groups.map((group) => [
    group.id,
    searchRecords.filter((record) => record.official.groupId === group.id),
  ]),
);
const sourceFactionIds = new Set(source.factions.map((faction) => faction.id));
const chinaGroupIds = new Set();
const chinaSourceGroupIds = new Set();
const chinaGroups = [];
const chinaFactionDocuments = [];
const chinaSearchRecords = [];
let chinaPromotionOrder = 0;

for (const [groupIndex, profileGroup] of [...chinaProfile.groups]
  .sort((left, right) => left.order - right.order)
  .entries()) {
  invariant(
    typeof profileGroup.sourceId === "string" &&
      sourceFactionIds.has(profileGroup.sourceId) &&
      typeof profileGroup.id === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(profileGroup.id) &&
      typeof profileGroup.name === "string" &&
      profileGroup.name.length > 0 &&
      profileGroup.order === groupIndex,
    `China group ${groupIndex} is invalid`,
  );
  invariant(!chinaGroupIds.has(profileGroup.id), `duplicate China group ID ${profileGroup.id}`);
  invariant(
    !chinaSourceGroupIds.has(profileGroup.sourceId),
    `duplicate China source group ${profileGroup.sourceId}`,
  );
  chinaGroupIds.add(profileGroup.id);
  chinaSourceGroupIds.add(profileGroup.sourceId);

  const sourceGroupId = profileGroup.sourceId.toLocaleLowerCase("en");
  const sourceDocument = internationalDocumentByGroupId.get(sourceGroupId);
  const sourceSearchRecords = internationalSearchByGroupId.get(sourceGroupId);
  invariant(sourceDocument && sourceSearchRecords, `missing source group ${profileGroup.sourceId}`);

  const group = {
    id: profileGroup.id,
    name: profileGroup.name,
    order: groupIndex,
    recordCount: sourceDocument.records.length,
  };
  chinaGroups.push(group);

  const records = sourceDocument.records.map((sourceRecord) => {
    const record = clone(sourceRecord);
    record.promotionOrder = ++chinaPromotionOrder;
    record.official.groupId = group.id;
    record.official.groupNameZh = group.name;
    record.official.nameZh = chinaVehicleName(
      profileGroup.sourceId,
      record.official.nameZh,
    );
    if (record.official.presentation) {
      record.official.presentation.vehicleNameZh = chinaVehicleName(
        profileGroup.sourceId,
        record.official.presentation.vehicleNameZh,
      );
    }
    for (const variant of record.variants) {
      const exactBinding = vehicleCatalogResolver.binding(
        record.promoEntryId,
        variant.sourceRawName,
      );
      invariant(
        exactBinding?.visualArtifactRefs?.china,
        `missing China visual artifact for ${record.promoEntryId}/${variant.sourceRawName}`,
      );
      variant.visualArtifactRef =
        exactBinding.visualArtifactRefs.china;
      if (variant.presentation?.vehicleNameZh) {
        variant.presentation.vehicleNameZh = chinaVehicleName(
          profileGroup.sourceId,
          variant.presentation.vehicleNameZh,
        );
      }
      const displayName = variantDisplayName(
        record.official.presentation,
        variant.presentation,
      );
      const aliases = searchMetadata([
        record.official.nameZh,
        group.name,
        displayName,
        variant.presentation?.vehicleNameZh,
      ]);
      variant.searchTerms = uniqueSearchTerms([
        ...(variant.searchTerms ?? []),
        ...(aliases.searchTerms ?? []),
      ]);
      variant.searchAliases = uniqueSearchTerms([
        ...(variant.searchAliases ?? []),
        ...(aliases.searchAliases ?? []),
      ]);
    }
    const aliases = searchMetadata([record.official.nameZh, group.name]);
    record.searchTerms = uniqueSearchTerms([
      ...(record.searchTerms ?? []),
      ...(aliases.searchTerms ?? []),
    ]);
    record.searchAliases = uniqueSearchTerms([
      ...(record.searchAliases ?? []),
      ...(aliases.searchAliases ?? []),
    ]);
    return record;
  });
  const recordByPromoEntryId = new Map(
    records.map((record) => [record.promoEntryId, record]),
  );
  chinaFactionDocuments.push({
    schemaVersion: "1.0.0",
    catalogId: chinaProfile.catalogId,
    dataRevision: null,
    vehicleCatalogRevision: vehicleCatalog.catalogRevision,
    group,
    records,
  });

  for (const sourceRecord of sourceSearchRecords) {
    const authoritativeRecord = recordByPromoEntryId.get(
      sourceRecord.promoEntryId,
    );
    invariant(
      authoritativeRecord,
      `missing China faction record ${sourceRecord.promoEntryId}`,
    );
    const authoritativeVariantByRawName = new Map(
      authoritativeRecord.variants.map((variant) => [
        variant.sourceRawName,
        variant,
      ]),
    );
    const record = clone(sourceRecord);
    record.promotionOrder = authoritativeRecord.promotionOrder;
    record.searchTerms = clone(
      authoritativeRecord.searchTerms ?? [],
    );
    record.searchAliases = clone(
      authoritativeRecord.searchAliases ?? [],
    );
    record.official = clone(authoritativeRecord.official);
    const seenVariantRawNames = new Set();
    for (const variant of record.variants) {
      const authoritativeVariant =
        authoritativeVariantByRawName.get(
          variant.sourceRawName,
        );
      invariant(
        authoritativeVariant &&
          !seenVariantRawNames.has(
            variant.sourceRawName,
          ),
        `missing or duplicate China faction variant ${record.promoEntryId}/${variant.sourceRawName}`,
      );
      seenVariantRawNames.add(variant.sourceRawName);
      variant.catalogBindingRef =
        authoritativeVariant.catalogBindingRef;
      variant.vehicleRef = authoritativeVariant.vehicleRef;
      variant.runtimeVehicleRef =
        authoritativeVariant.runtimeVehicleRef;
      variant.visualArtifactRef =
        authoritativeVariant.visualArtifactRef;
      variant.presentation = clone(
        authoritativeVariant.presentation,
      );
      variant.displayName = variantDisplayName(
        authoritativeRecord.official.presentation,
        authoritativeVariant.presentation,
      );
      variant.searchTerms = clone(
        authoritativeVariant.searchTerms ?? [],
      );
      variant.searchAliases = clone(
        authoritativeVariant.searchAliases ?? [],
      );
    }
    const selectedVariant =
      authoritativeVariantByRawName.get(
        record.selectedRawName,
      );
    invariant(
      selectedVariant,
      `missing selected China faction variant ${record.promoEntryId}/${record.selectedRawName}`,
    );
    record.selectedDisplayName = variantDisplayName(
      authoritativeRecord.official.presentation,
      selectedVariant.presentation,
    );
    invariant(
      seenVariantRawNames.size ===
        authoritativeVariantByRawName.size,
      `China search variant closure drifted for ${record.promoEntryId}`,
    );
    chinaSearchRecords.push(record);
  }
}

const chinaProfileSha256 = createHash("sha256").update(chinaProfileBytes).digest("hex");
const chinaDataRevision =
  `${ENCYCLOPEDIA_DATA_REVISION}-cn-${chinaProfileSha256.slice(0, 12)}` +
  `-cards-${cardPresentationRevision}`;
for (const document of chinaFactionDocuments) {
  document.dataRevision = chinaDataRevision;
}
const chinaIndex = {
  schemaVersion: "1.0.0",
  catalogId: chinaProfile.catalogId,
  dataRevision: chinaDataRevision,
  vehicleCatalogRevision: vehicleCatalog.catalogRevision,
  groups: chinaGroups,
  records: chinaSearchRecords,
};

invariant(chinaGroups.length === 5, "China catalog must contain exactly five groups");
invariant(
  chinaSearchRecords.length === chinaGroups.reduce((sum, group) => sum + group.recordCount, 0),
  "China catalog group/search closure is incomplete",
);

invariant(
  seenVariantCardIds.size === expectedVariantCount,
  `projected ${seenVariantCardIds.size} of ${expectedVariantCount} catalog variants`,
);
invariant(
  projectedRawNames.size === vehicleCatalog.counts.sourceVehicles,
  `projected ${projectedRawNames.size} of ${vehicleCatalog.counts.sourceVehicles} canonical vehicle identities`,
);

const SUPPORT_TYPE_NAME_ZH = Object.freeze({
  UAV: "大型侦察无人机",
  CAS: "攻击机",
  DRONE: "便携侦察无人机",
});

function supportVariantConfiguration(card, target, targetPresentation) {
  if (targetPresentation.configurationZh !== undefined) {
    return targetPresentation.configurationZh;
  }
  if (card.variants.length === 1) return null;
  const label = String(target.label);
  const prefix = `${card.displayName} `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

function supportReferenceData(card, target, gameplayAuthorityPath) {
  return {
    general: {
      rawName: target.rawName,
      displayName: target.label,
      details:
        `真实 RuntimeProbeMap 视觉；游戏权限 ${gameplayAuthorityPath}。` +
        "该支援资产没有独立 split hit-runtime，命中与伤害状态为 native-unknown。",
      type: card.type,
      vehicleHealth: null,
      repairToolLimit: null,
      respawnTime: null,
      ticketValue: null,
      killerPointReward: null,
      crewSeatCount: null,
      totalSeatCount: null,
      amphibious: null,
      isDamagedByRadial: null,
      hasConstruction: null,
      totalResources: null,
      constructionResources: null,
      ammoResources: null,
      hasCommandZone: null,
      commandZoneRadius: null,
    },
    weaponBindingIds: [],
    seats: [],
    damageResistances: [],
    components: [],
  };
}

const supportTargetById = new Map();
for (const target of supportAirConfig.captureTargets) {
  const targetPresentation = SUPPORT_TARGET_PRESENTATIONS.get(target?.id);
  invariant(
    typeof target?.id === "string" &&
      target.id.length > 0 &&
      typeof target.rawName === "string" &&
      target.rawName.length > 0 &&
      typeof target.label === "string" &&
      target.label.length > 0 &&
      typeof targetPresentation?.vehicleNameZh === "string" &&
      targetPresentation.vehicleNameZh.length > 0 &&
      (targetPresentation.configurationZh === null ||
        (typeof targetPresentation.configurationZh === "string" &&
          targetPresentation.configurationZh.length > 0)) &&
      typeof target.generatedClass === "string" &&
      target.generatedClass.endsWith("_C"),
    "support-air capture target identity is incomplete",
  );
  invariant(
    !supportTargetById.has(target.id),
    `duplicate support-air capture target ${target.id}`,
  );
  supportTargetById.set(target.id, target);
}
invariant(
  supportTargetById.size === SUPPORT_TARGET_PRESENTATIONS.size,
  "support-air card presentation coverage is incomplete",
);

const supportCardIds = new Set();
const supportVariantIds = new Set();
for (const card of supportAirConfig.cards) {
  const groupId = String(card?.factionId ?? "").toLocaleLowerCase("en");
  const document = internationalDocumentByGroupId.get(groupId);
  const group = groups.find((candidate) => candidate.id === groupId);
  invariant(document && group, `unknown support-air faction ${card?.factionId}`);
  invariant(
    typeof card.cardId === "string" &&
      /^[a-z0-9]+(?:-+[a-z0-9]+)*$/u.test(card.cardId) &&
      !seenCardIds.has(card.cardId) &&
      !supportCardIds.has(card.cardId),
    `duplicate or invalid support-air card ${card?.cardId}`,
  );
  invariant(
    typeof card.displayName === "string" &&
      card.displayName.length > 0 &&
      Object.hasOwn(SUPPORT_TYPE_NAME_ZH, card.type) &&
      Array.isArray(card.variants) &&
      card.variants.length > 0,
    `support-air card is incomplete: ${card.cardId}`,
  );
  supportCardIds.add(card.cardId);

  const variants = card.variants.map((variant) => {
    const target = supportTargetById.get(variant?.captureTargetId);
    invariant(target, `${card.cardId} refers to an unknown support-air target`);
    const targetPresentation = SUPPORT_TARGET_PRESENTATIONS.get(target.id);
    invariant(
      targetPresentation,
      `${card.cardId} has no support-air card presentation`,
    );
    invariant(
      typeof variant.gameplayAuthorityPath === "string" &&
        variant.gameplayAuthorityPath.endsWith(".uasset"),
      `${card.cardId} has an invalid gameplay authority path`,
    );
    const cardId = variantCardId(card.cardId, target.rawName);
    invariant(
      !seenVariantCardIds.has(cardId) && !supportVariantIds.has(cardId),
      `duplicate support-air variant card id ${cardId}`,
    );
    supportVariantIds.add(cardId);
    const configurationZh = supportVariantConfiguration(
      card,
      target,
      targetPresentation,
    );
    const presentation = {
      vehicleNameZh: targetPresentation.vehicleNameZh,
      liveryZh: null,
      configurationZh,
    };
    const data = supportReferenceData(
      card,
      target,
      variant.gameplayAuthorityPath,
    );
    const bindingKey = `${card.cardId}\u0000${target.rawName}`;
    const supportBinding = supportBindingByKey.get(bindingKey);
    invariant(
      supportBinding?.visualArtifactRefs?.international,
      `missing support-air visual artifact for ${bindingKey}`,
    );
    const aliases = searchMetadata([
      card.displayName,
      target.label,
      targetPresentation.vehicleNameZh,
      targetPresentation.configurationZh,
      SUPPORT_TYPE_NAME_ZH[card.type],
    ]);
    return {
      sourceRawName: target.rawName,
      catalogBindingRef: null,
      vehicleRef: null,
      runtimeVehicleRef: null,
      visualArtifactRef:
        supportBinding.visualArtifactRefs.international,
      alias: configurationZh ?? "",
      ...aliases,
      presentation,
      data,
      supportAirEvidence: {
        sourceBuildId: supportAirConfig.sourceBuildId,
        sourceMap: supportAirConfig.sourceMap,
        captureTargetId: target.id,
        generatedClass: target.generatedClass,
        gameplayAuthorityPath: variant.gameplayAuthorityPath,
        visualEvidence: supportAirConfig.evidencePolicy.visual,
        hitRuntimeStatus: "native-unknown",
      },
    };
  });
  const firstVariant = variants[0];
  const firstPresentation = firstVariant.presentation;
  const recordSearch = searchMetadata([
    card.displayName,
    firstPresentation.vehicleNameZh,
    ...variants.map((variant) => variant.presentation.configurationZh),
    SUPPORT_TYPE_NAME_ZH[card.type],
  ]);
  const promotionOrder = searchRecords.length + 1;
  document.records.push({
    promoEntryId: card.cardId,
    promotionOrder,
    ...recordSearch,
    official: {
      groupId,
      groupNameZh: group.name,
      nameZh: card.displayName,
      typeZh: card.type,
      presentation: {
        vehicleNameZh: firstPresentation.vehicleNameZh,
        configurationZh: null,
      },
    },
    mapping: {
      selectedRawName: firstVariant.sourceRawName,
    },
    data: null,
    variants,
  });
  searchRecords.push({
    promoEntryId: card.cardId,
    promotionOrder,
    ...recordSearch,
    official: {
      groupId,
      groupNameZh: group.name,
      nameZh: card.displayName,
      typeZh: card.type,
      presentation: {
        vehicleNameZh: firstPresentation.vehicleNameZh,
        configurationZh: null,
      },
    },
    selectedRawName: firstVariant.sourceRawName,
    selectedDisplayName: card.displayName,
    defaultCardId: variantCardId(card.cardId, firstVariant.sourceRawName),
    routeSlug: card.cardId,
    variants: variants.map((variant) => {
      const configuration = variant.presentation.configurationZh;
      return {
        sourceRawName: variant.sourceRawName,
        catalogBindingRef: variant.catalogBindingRef,
        vehicleRef: variant.vehicleRef,
        runtimeVehicleRef: variant.runtimeVehicleRef,
        visualArtifactRef: variant.visualArtifactRef,
        alias: configuration ?? "",
        displayName: configuration
          ? `${variant.presentation.vehicleNameZh} ${configuration}`
          : variant.presentation.vehicleNameZh,
        searchTerms: variant.searchTerms,
        searchAliases: variant.searchAliases,
        presentation: variant.presentation,
        cardId: variantCardId(card.cardId, variant.sourceRawName),
        routeSlug: variantCardId(card.cardId, variant.sourceRawName),
      };
    }),
  });
  group.recordCount += 1;
}

const supportAirConfigSha256 = createHash("sha256")
  .update(supportAirConfigBytes)
  .digest("hex");
const internationalDataRevision =
  `${ENCYCLOPEDIA_DATA_REVISION}-support-air-${supportAirConfigSha256.slice(0, 12)}` +
  `-cards-${cardPresentationRevision}`;
index.dataRevision = internationalDataRevision;
for (const document of factionDocuments) {
  document.dataRevision = internationalDataRevision;
}
invariant(
  supportCardIds.size === supportAirConfig.cards.length &&
    supportVariantIds.size === supportAirConfig.cards.reduce(
      (total, card) => total + card.variants.length,
      0,
    ),
  "support-air catalog projection is incomplete",
);
invariant(
  index.records.length ===
    index.groups.reduce((total, group) => total + group.recordCount, 0),
  "international catalog group/search closure is incomplete after support-air projection",
);

await mkdir(path.dirname(indexPath), { recursive: true });
await mkdir(factionDirectory, { recursive: true });
await mkdir(chinaFactionDirectory, { recursive: true });
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
await writeFile(chinaIndexPath, `${JSON.stringify(chinaIndex, null, 2)}\n`, "utf8");
for (const document of factionDocuments) {
  const compactDocument =
    compactPublicFactionCatalog(document);
  await writeFile(
    path.join(factionDirectory, `${document.group.id}.json`),
    `${JSON.stringify(compactDocument)}\n`,
    "utf8",
  );
}
for (const document of chinaFactionDocuments) {
  const compactDocument =
    compactPublicFactionCatalog(document);
  await writeFile(
    path.join(chinaFactionDirectory, `${document.group.id}.json`),
    `${JSON.stringify(compactDocument)}\n`,
    "utf8",
  );
}

console.log(
  `Built ${groups.length} international factions / ${searchRecords.length} catalog families (${supportCardIds.size} support-air) and ${chinaGroups.length} China factions / ${chinaSearchRecords.length} vehicle families, with ${seenVariantCardIds.size} core vehicle variants plus ${supportVariantIds.size} support-air variants from ${projectedRawNames.size} canonical vehicles (${vehicleCatalog.catalogRevision.slice(0, 12)} / ${vehicleCatalog.sourceBuildId}).`,
);
