import type {
  CatalogRecord,
  CatalogSearchRecord,
  CatalogSearchVariant,
  CatalogVariant,
} from "./catalog-types";
import { weaponDisplayNameZh } from "../lib/weapon-display-name.ts";
import { runtimeVehicleEquipmentBindingForId } from "./runtime-vehicle-equipment.ts";

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

export function normalizeVehicleSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s‐‑‒–—―_./-]+/g, "");
}

export function rankVehicleCandidateSearch(candidate: VehicleSearchCandidate, query: string) {
  const needle = normalizeVehicleSearch(query);
  if (!needle) return null;
  return rankSearchTokens(needle, {
    primary: candidate.primary.map(normalizeVehicleSearch),
    aliases: (candidate.aliases ?? []).map(normalizeVehicleSearch),
    context: [
      ...(candidate.context ?? []),
      candidate.groupId ?? "",
    ].map(normalizeVehicleSearch),
  });
}

// Runtime selectors only search labels supplied by their caller. Catalog search
// receives its maintained aliases from SiguaWiki through the catalog adapter.
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

function vehicleSearchTokens(record: CatalogRecord): VehicleSearchTokenGroups {
  return {
    primary: [
      record.official.nameZh,
      record.data?.general.displayName ?? "",
      record.mapping.selectedRawName ?? "",
    ].map(normalizeVehicleSearch),
    aliases: (record.searchAliases ?? []).map(normalizeVehicleSearch),
    context: [
      record.official.typeZh,
      record.official.typeNameZh,
      record.official.groupNameZh,
      record.official.groupId,
      ...(record.searchTerms ?? []),
    ].map(normalizeVehicleSearch),
  };
}

function vehicleVariantSearchTokens(
  record: CatalogRecord,
  variant: CatalogVariant,
): VehicleSearchTokenGroups {
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
      variant.presentation?.configurationZh ?? "",
      displayName,
      variant.presentation?.vehicleNameZh ?? "",
      variant.sourceRawName,
      variant.data?.general.rawName ?? variant.sourceRawName,
    ].map(normalizeVehicleSearch),
    aliases: (variant.searchAliases ?? []).map(normalizeVehicleSearch),
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
        record.selectedDisplayName ?? "",
        record.selectedRawName ?? "",
      ],
      aliases: record.searchAliases ?? [],
      rawName: record.selectedRawName ?? undefined,
      groupId: record.official.groupId,
      context: [
        record.official.groupNameZh,
        record.official.typeZh,
        record.official.typeNameZh,
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
        variant.displayName,
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
