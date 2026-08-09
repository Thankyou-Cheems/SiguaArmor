import type {
  CatalogRecord,
  CatalogSearchRecord,
  CatalogSearchVariant,
  CatalogVariant,
} from "./catalog-types";
import { vehicleConfigurationNameZh } from "../lib/vehicle-configuration-name.ts";
import {
  vehicleDisplayNameZh,
  vehicleTypeNameZh,
} from "../lib/vehicle-display-name.ts";
import { weaponDisplayNameZh } from "../lib/weapon-display-name.ts";
import { runtimeVehicleEquipmentBindingForId } from "./runtime-vehicle-equipment.ts";

interface VehicleSearchAliases {
  labels: readonly string[];
  pinyin: readonly string[];
  initials: readonly string[];
  variantLabels?: Readonly<Record<string, readonly string[]>>;
}

interface VehicleSearchTokenGroups {
  primary: string[];
  aliases: string[];
  context: string[];
}

export interface VehicleSearchResult {
  record: CatalogRecord;
  variants: CatalogVariant[];
  rank: number;
}

export interface CatalogIndexSearchResult {
  record: CatalogSearchRecord;
  variants: CatalogSearchVariant[];
  rank: number;
}

export interface VehicleSearchCandidate {
  promoEntryId: string;
  primary: readonly string[];
  aliases?: readonly string[];
  rawName?: string;
  groupId?: string;
  context?: readonly string[];
}

export interface VerifiedVehicleSearchCandidate {
  primary: readonly string[];
  aliases?: readonly string[];
  context?: readonly string[];
}

const EMPTY_ALIASES: VehicleSearchAliases = { labels: [], pinyin: [], initials: [] };

// These are search aids for common CN-community callouts, not authoritative asset identifiers.
// Community nicknames stay explicit. Source-backed Chinese labels receive their
// compact full-pinyin/initial keys during catalog generation, so the client still
// does not ship a full Chinese dictionary.
const VEHICLE_SEARCH_ALIASES: Record<string, VehicleSearchAliases> = {
  "shenzhou-zvt-9a": {
    labels: ["ZTZ99A", "99A", "99式", "99大改"],
    pinyin: [],
    initials: [],
  },
  "shenzhou-zlb-08": {
    labels: ["ZBL08", "08轮", "08式", "八轮", "八轮车", "轮突", "0808"],
    pinyin: ["lingbalun", "balun"],
    initials: ["zbl", "bl"],
  },
  "shenzhou-zvb-4a": {
    labels: ["ZBD04A", "04A", "04式", "04步战", "0404"],
    pinyin: ["lingsia", "lingsi"],
    initials: ["zbda"],
  },
  "shenzhou-cks-02": {
    labels: ["CSK131", "CKS131", "131", "猛士", "猛士三代", "猛士三"],
    pinyin: ["mengshi", "mengshisandai", "mengshisan"],
    initials: ["csk", "ms", "mssd"],
    variantLabels: {
      "BP_CSK131_QJY88": ["ZCC"],
      "BP_CSK131_QJZ89": ["ZCC"],
      "BP_CSK131_RWS": ["ZCC"],
      "BP_CSK131_QLZ87": ["ZCC"],
      "BP_CSK131_HJ-8ATGM": ["TOWCHE"],
    },
  },
  "shenzhou-sd-8h": {
    labels: ["Z-8G", "Z8G", "Z-8", "Z8", "直-8", "直八"],
    pinyin: ["zhiba", "zhibag"],
    initials: ["zb", "zbg"],
  },
  "arctic-t-72b3": {
    labels: ["T-72B3", "T72B3", "T-72", "T72", "72B3", "72", "七二", "三改"],
    pinyin: ["qier", "qierbisan"],
    initials: ["qe", "qebs"],
  },
  "arctic-btr-82a": {
    labels: ["BTR-82A", "BTR82A", "BTR82", "BTR", "82A", "82", "八二", "八二轮", "3030"],
    pinyin: ["baer", "baerlun"],
    initials: ["btr", "be", "bel"],
  },
  "arctic-bmp-2": {
    labels: ["BMP-2", "BMP2", "BMP"],
    pinyin: [],
    initials: ["bmp"],
  },
  "arctic-tigr-m": {
    labels: ["Tigr-M", "TIGR", "Tigr", "虎-M", "虎式"],
    pinyin: ["hum", "hushi"],
    initials: ["tigr", "hs"],
    variantLabels: {
      "BP_Tigr": ["ZCC"],
      "BP_Tigr_AGS17": ["ZCC"],
      "BP_Tigr_RWS": ["ZCC"],
    },
  },
  "arctic-mi-8": {
    labels: ["Mi-8", "MI8", "米-8", "米8", "米八"],
    pinyin: ["miba"],
    initials: ["mb"],
  },
  "agesi-m1a2": {
    labels: ["M1A2", "M1A2 Abrams", "艾布拉姆斯", "阿布拉姆斯", "艾布", "阿布", "Abrams"],
    pinyin: ["aibulamusi", "abulamusi", "aibu", "abu"],
    initials: ["ablms", "ab"],
  },
  "agesi-m2a3": {
    labels: [
      "M2A3",
      "M2A3 Bradley",
      "布雷德利",
      "布莱德利",
      "Bradley",
      "Brad",
      "布雷",
      "bldl",
    ],
    pinyin: ["buleideli", "bulaideli", "bulei", "bulai"],
    initials: ["bldl", "bld"],
  },
  "agesi-m1126": {
    labels: ["M1126", "M-1126", "M1126 ICV", "斯崔克", "斯特赖克", "Stryker", "斯崔克八轮"],
    pinyin: ["sicuike", "sitelaike", "sicuikebalun"],
    initials: ["sck", "stlk"],
  },
  "agesi-m-atv": {
    labels: ["M-ATV", "MATV", "防雷车", "马特夫", "MATV防雷车"],
    pinyin: ["fangleiche", "matefu"],
    initials: ["matv", "flc", "mtf"],
    variantLabels: {
      "BP_MATV": ["ZCC"],
      "BP_MATV_M240": ["ZCC"],
      "BP_MATV_Mk19": ["ZCC"],
      "BP_MATV_CROWS": ["ZCC"],
      "BP_MATV_TOW": ["TOWCHE"],
      "BP_MATV_CROWS_M240": ["ZCC"],
    },
  },
  "agesi-uh-60": {
    labels: ["UH-60", "UH60", "UH-60M", "黑鹰", "黑鹰直升机", "Black Hawk", "Blackhawk"],
    pinyin: ["heiying", "heiyingzhishengji"],
    initials: ["hy", "hyzsj"],
  },
  "ekeqie-m60t": {
    labels: ["M60T", "M-60T", "M60", "巴顿", "M60巴顿", "Patton"],
    pinyin: ["badun"],
    initials: ["bd"],
  },
  "ekeqie-acv-15": {
    labels: ["ACV-15", "ACV15", "ACV", "ACV-15 25mm", "15式步战", "土耳其步战"],
    pinyin: ["shiwushibuzhan", "tuerqibuzhan"],
    initials: ["acv", "swbz", "tqbz"],
  },
  "ekeqie-pars-iii": {
    labels: ["PARS III", "PARS3", "PARS", "帕尔斯", "帕尔斯III", "帕三"],
    pinyin: ["paersi", "paersisan"],
    initials: ["pars", "pes", "ps"],
  },
  "ekeqie-cobra-ii": {
    labels: ["Cobra II", "Cobra2", "COBRA", "眼镜蛇"],
    pinyin: ["yanjingshe"],
    initials: ["cobra", "yjs"],
  },
  "ekeqie-uh-1h": {
    labels: ["UH-1H", "UH1H", "UH-1", "休伊", "休伊直升机", "Huey"],
    pinyin: ["xiuyi", "xiuyizhishengji"],
    initials: ["xy", "xyzsj"],
  },
  "kaweier-t-72s": {
    labels: ["T-72S", "T72S", "T-72", "T72", "72S", "72", "七二S", "七二"],
    pinyin: ["qier", "qiers"],
    initials: ["qe", "qes"],
  },
  "kaweier-bmp-2": {
    labels: ["BMP-2", "BMP2", "BMP"],
    pinyin: [],
    initials: ["bmp"],
  },
  "kaweier-mt-lb": {
    labels: ["MT-LB", "MTLB", "MT-LBM", "MTLB VMK", "MTLB 6MA"],
    pinyin: [],
    initials: ["mtlb"],
  },
  "kaweier-simir": {
    labels: ["Simir", "SIMIR", "Safir", "萨菲尔", "西米尔"],
    pinyin: ["ximier", "safeier"],
    initials: ["simir", "sfe", "xme"],
    variantLabels: {
      "BP_Safir": ["ZCC"],
      "BP_Safir_Kord": ["ZCC"],
      "BP_Safir_MG3": ["ZCC"],
      "BP_Safir_AGS-17": ["ZCC"],
      "BP_Safir_Kornet": ["TOWCHE"],
    },
  },
  "kaweier-mi-17": {
    labels: ["Mi-17", "MI17", "米-17", "米17", "米十七", "米17直升机"],
    pinyin: ["mishiqi", "mishiqizhishengji"],
    initials: ["mi", "msq", "msqzsj"],
  },
};

const GROUP_PINYIN: Record<string, readonly string[]> = {
  shenzhou: ["shenzhou", "shenzhoufangyugongtongti"],
  "arctic-union": ["beiji", "beijiguojialianheti"],
  agesi: ["agexi", "agexilianbang"],
  ekeqie: ["aikeqie", "aikeqiegongguo"],
  kaweier: ["kaweier", "kaweiermengyueguo"],
};

const TYPE_PINYIN: Record<string, readonly string[]> = {
  主战坦克: ["zhuzhantanke"],
  步兵战车: ["bubingzhanche"],
  高机动车辆: ["gaojidongcheliang"],
  运输直升机: ["yunshuzhishengji"],
  高机动装甲车: ["gaojidongzhuangjiache"],
  装甲运兵车: ["zhuangjiayunbingche"],
  全地形防雷车: ["quandixingfangleiche"],
  直升机: ["zhishengji"],
  军用越野车: ["junyongyueyeche"],
};

export function normalizeVehicleSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s‐‑‒–—―_./-]+/g, "");
}

export function rankVehicleCandidateSearch(candidate: VehicleSearchCandidate, query: string) {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return null;
  const familyPromoEntryId = candidate.promoEntryId.split("--", 1)[0];
  const aliases = VEHICLE_SEARCH_ALIASES[familyPromoEntryId] ?? EMPTY_ALIASES;

  return rankSearchTokens(needle, {
    primary: candidate.primary.map(normalizeVehicleSearch),
    aliases: [
      ...aliases.labels,
      ...aliases.pinyin,
      ...aliases.initials,
      ...(candidate.aliases ?? []),
      ...(candidate.rawName ? aliases.variantLabels?.[candidate.rawName] ?? [] : []),
    ].map(normalizeVehicleSearch),
    context: [
      ...(candidate.context ?? []),
      candidate.groupId ?? "",
      ...(candidate.groupId ? GROUP_PINYIN[candidate.groupId] ?? [] : []),
    ].map(normalizeVehicleSearch),
  });
}

// Runtime selectors must only search source-backed labels supplied by their
// caller. Unlike rankVehicleCandidateSearch, this path intentionally does not
// consult the legacy community alias table or derived faction pinyin aliases.
export function rankVerifiedVehicleCandidateSearch(
  candidate: VerifiedVehicleSearchCandidate,
  query: string,
) {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return null;
  return rankSearchTokens(needle, {
    primary: candidate.primary.map(normalizeVehicleSearch),
    aliases: [...candidate.primary, ...(candidate.aliases ?? [])].map(normalizeVehicleSearch),
    context: (candidate.context ?? []).map(normalizeVehicleSearch),
  });
}

export function getVehicleCommonNames(record: CatalogRecord) {
  return VEHICLE_SEARCH_ALIASES[record.promoEntryId]?.labels ?? EMPTY_ALIASES.labels;
}

function vehicleSearchTokens(record: CatalogRecord): VehicleSearchTokenGroups {
  const aliases = VEHICLE_SEARCH_ALIASES[record.promoEntryId] ?? EMPTY_ALIASES;
  return {
    primary: [
      record.official.nameZh,
      vehicleDisplayNameZh(record.official.nameZh),
      record.data?.general.displayName ?? "",
      record.mapping.selectedRawName ?? "",
    ].map(normalizeVehicleSearch),
    aliases: [
      ...aliases.labels,
      ...aliases.pinyin,
      ...aliases.initials,
      ...(record.searchAliases ?? []),
    ].map(normalizeVehicleSearch),
    context: [
      record.official.typeZh,
      vehicleTypeNameZh(record.official.typeZh) ?? "",
      record.official.groupNameZh,
      record.official.groupId,
      ...(record.searchTerms ?? []),
      ...(GROUP_PINYIN[record.official.groupId] ?? []),
      ...(TYPE_PINYIN[record.official.typeZh] ?? []),
    ].map(normalizeVehicleSearch),
  };
}

function vehicleVariantSearchTokens(
  record: CatalogRecord,
  variant: CatalogVariant,
): VehicleSearchTokenGroups {
  const aliases = VEHICLE_SEARCH_ALIASES[record.promoEntryId] ?? EMPTY_ALIASES;
  const displayName =
    variant.data?.general.displayName ?? record.official.nameZh;
  const weapons = (variant.data?.weaponBindingIds ?? []).map((bindingId) => {
    const binding =
      runtimeVehicleEquipmentBindingForId(bindingId);
    if (!binding) {
      throw new Error(
        `Vehicle search points to missing weapon binding ${bindingId}`,
      );
    }
    return binding.equipment;
  });
  return {
    primary: [
      variant.alias,
      vehicleConfigurationNameZh(variant.alias),
      displayName,
      vehicleDisplayNameZh(displayName),
      variant.sourceRawName,
      variant.data?.general.rawName ?? variant.sourceRawName,
    ].map(normalizeVehicleSearch),
    aliases: [
      ...(aliases.variantLabels?.[variant.sourceRawName] ?? []),
      ...(variant.searchAliases ?? []),
    ].map(normalizeVehicleSearch),
    context: [
      ...(variant.searchTerms ?? []),
      ...weapons
        .flatMap((weapon) => [
          weapon.displayName,
          weaponDisplayNameZh(weapon),
          weapon.gunName,
          weapon.projectileName ?? "",
        ]),
    ]
      .map(normalizeVehicleSearch),
  };
}

function isOrderedSubsequence(needle: string, token: string) {
  if (needle.length < 3 || needle.length >= token.length) return false;
  if (!/^[a-z]+$/.test(needle) || !/^[a-z]+$/.test(token)) return false;

  let tokenIndex = 0;
  for (const character of needle) {
    tokenIndex = token.indexOf(character, tokenIndex);
    if (tokenIndex === -1) return false;
    tokenIndex += 1;
  }
  return true;
}

function boundedEditDistance(left: string, right: string, limit: number) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function isFuzzyPinyinMatch(needle: string, token: string) {
  if (
    needle.length < 5 ||
    token.length < 5 ||
    !/^[a-z]+$/.test(needle) ||
    !/^[a-z]+$/.test(token)
  ) return false;
  const limit = needle.length >= 8 ? 2 : 1;
  const minimumWindowLength = Math.max(1, needle.length - limit);
  const maximumWindowLength = Math.min(token.length, needle.length + limit);
  for (let start = 0; start < token.length; start += 1) {
    for (let length = minimumWindowLength; length <= maximumWindowLength; length += 1) {
      if (start + length > token.length) break;
      if (boundedEditDistance(needle, token.slice(start, start + length), limit) <= limit) {
        return true;
      }
    }
  }
  return false;
}

export function rankVehicleSearch(record: CatalogRecord, query: string) {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return null;
  const tokens = vehicleSearchTokens(record);

  return rankSearchTokens(needle, tokens);
}

export function rankVehicleVariantSearch(
  record: CatalogRecord,
  variant: CatalogVariant,
  query: string,
) {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return null;

  const familyRank = rankVehicleSearch(record, needle);
  const variantRank = rankSearchTokens(needle, vehicleVariantSearchTokens(record, variant));
  if (familyRank === null) return variantRank;
  if (variantRank === null) return familyRank;
  return Math.min(familyRank, variantRank);
}

function rankSearchTokens(needle: string, tokens: VehicleSearchTokenGroups) {
  if (tokens.primary.some((token) => token === needle)) return 0;
  if (tokens.aliases.some((token) => token === needle)) return 1;
  if (tokens.primary.some((token) => token.startsWith(needle))) return 2;
  if (tokens.aliases.some((token) => token.startsWith(needle))) return 3;
  if (tokens.primary.some((token) => token.includes(needle))) return 4;
  if (tokens.aliases.some((token) => token.includes(needle))) return 5;
  if (tokens.aliases.some((token) => isFuzzyPinyinMatch(needle, token))) return 6;
  if (tokens.aliases.some((token) => isOrderedSubsequence(needle, token))) return 7;
  if (tokens.context.some((token) => token.includes(needle))) return 8;
  return null;
}

export function searchVehicleRecords(
  records: CatalogRecord[],
  query: string,
  limit = 8,
): VehicleSearchResult[] {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return [];

  return records
    .map((record) => {
      const familyRank = rankVehicleSearch(record, needle);
      const variantRanks = record.variants.map((variant) => ({
        variant,
        rank: rankVehicleVariantSearch(record, variant, needle),
      }));
      const variants =
        familyRank !== null
          ? record.variants
          : variantRanks
              .filter((result): result is { variant: CatalogVariant; rank: number } => result.rank !== null)
              .map((result) => result.variant);
      if (familyRank === null && variants.length === 0) return null;

      const rank = Math.min(
        familyRank ?? Number.POSITIVE_INFINITY,
        ...variants.map((variant) => rankVehicleVariantSearch(record, variant, needle) ?? Number.POSITIVE_INFINITY),
      );
      return { record, variants, rank };
    })
    .filter((result): result is VehicleSearchResult => result !== null)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.record.promotionOrder - right.record.promotionOrder,
    )
    .slice(0, limit);
}

function rankCatalogIndexRecord(record: CatalogSearchRecord, query: string) {
  return rankVehicleCandidateSearch(
    {
      promoEntryId: record.promoEntryId,
      primary: [
        record.official.nameZh,
        vehicleDisplayNameZh(record.official.nameZh),
        record.selectedDisplayName ?? "",
        vehicleDisplayNameZh(record.selectedDisplayName ?? ""),
        record.selectedRawName ?? "",
      ],
      aliases: record.searchAliases ?? [],
      rawName: record.selectedRawName ?? undefined,
      groupId: record.official.groupId,
      context: [
        record.official.groupNameZh,
        record.official.typeZh,
        vehicleTypeNameZh(record.official.typeZh) ?? "",
        ...(record.searchTerms ?? []),
      ],
    },
    query,
  );
}

function rankCatalogIndexVariant(
  record: CatalogSearchRecord,
  variant: CatalogSearchVariant,
  query: string,
) {
  return rankVehicleCandidateSearch(
    {
      promoEntryId: variant.cardId,
      primary: [
        variant.alias,
        vehicleConfigurationNameZh(variant.alias),
        variant.displayName,
        vehicleDisplayNameZh(variant.displayName),
        variant.sourceRawName,
      ],
      aliases: variant.searchAliases ?? [],
      rawName: variant.sourceRawName,
      groupId: record.official.groupId,
      context: [
        record.official.groupNameZh,
        record.official.typeZh,
        ...(variant.searchTerms ?? []),
      ],
    },
    query,
  );
}

export function searchCatalogIndexRecords(
  records: CatalogSearchRecord[],
  query: string,
  limit = 8,
): CatalogIndexSearchResult[] {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return [];

  return records
    .map((record) => {
      const familyRank = rankCatalogIndexRecord(record, needle);
      const variantRanks = record.variants.map((variant) => ({
        variant,
        rank: rankCatalogIndexVariant(record, variant, needle),
      }));
      const variants = familyRank !== null
        ? record.variants
        : variantRanks
            .filter(
              (result): result is { variant: CatalogSearchVariant; rank: number } =>
                result.rank !== null,
            )
            .map((result) => result.variant);
      if (familyRank === null && variants.length === 0) return null;
      return {
        record,
        variants,
        rank: Math.min(
          familyRank ?? Number.POSITIVE_INFINITY,
          ...variants.map(
            (variant) => rankCatalogIndexVariant(record, variant, needle) ?? Number.POSITIVE_INFINITY,
          ),
        ),
      };
    })
    .filter((result): result is CatalogIndexSearchResult => result !== null)
    .sort(
      (left, right) =>
        left.rank - right.rank || left.record.promotionOrder - right.record.promotionOrder,
    )
    .slice(0, limit);
}
