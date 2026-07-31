import {
  inflatePublicFactionCatalogInBrowser,
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
  samePublicFactionValue,
} from "../lib/public-faction-reference-graph-browser.ts";
import type {
  ProfiledPublicFactionCatalog,
  PublicCatalogIndex,
  PublicFactionCatalog,
} from "./catalog-types";

export async function parseFactionCatalog(
  value: unknown,
  expectedIndex: PublicCatalogIndex,
  expectedGroupId: string,
): Promise<PublicFactionCatalog> {
  if (!value || typeof value !== "object") {
    throw new Error("阵营资料格式无效");
  }
  const compactDocument =
    value as Partial<ProfiledPublicFactionCatalog>;
  if (
    compactDocument.vehicleReferenceSchemaVersion !==
    PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION
  ) {
    throw new Error("阵营资料身份或记录闭集不匹配");
  }
  const document =
    await inflatePublicFactionCatalogInBrowser<PublicFactionCatalog>(
      value,
    );
  const expectedGroups = expectedIndex.groups.filter(
    (group) => group.id === expectedGroupId,
  );
  const expectedRecords = expectedIndex.records.filter(
    (record) => record.official.groupId === expectedGroupId,
  );
  const expectedRecordById = new Map(
    expectedRecords.map((record) => [
      record.promoEntryId,
      record,
    ]),
  );
  if (
    expectedGroups.length !== 1 ||
    expectedRecordById.size !== expectedRecords.length ||
    document.schemaVersion !== "1.0.0" ||
    document.catalogId !== expectedIndex.catalogId ||
    document.dataRevision !== expectedIndex.dataRevision ||
    document.vehicleCatalogRevision !==
      expectedIndex.vehicleCatalogRevision ||
    document.group?.id !== expectedGroupId ||
    !samePublicFactionValue(document.group, expectedGroups[0]) ||
    !Array.isArray(document.records) ||
    document.records.length !== expectedRecords.length ||
    document.records.length !== document.group.recordCount
  ) {
    throw new Error("阵营资料身份或记录闭集不匹配");
  }

  const seenRecordIds = new Set<string>();
  const records = document.records.map((record) => {
    const expectedRecord = expectedRecordById.get(
      record.promoEntryId,
    );
    const expectedVariantByRawName = new Map(
      (expectedRecord?.variants ?? []).map((variant) => [
        variant.sourceRawName,
        variant,
      ]),
    );
    if (
      !expectedRecord ||
      seenRecordIds.has(record.promoEntryId) ||
      record.data !== null ||
      record.promotionOrder !== expectedRecord.promotionOrder ||
      !samePublicFactionValue(
        record.searchTerms ?? [],
        expectedRecord.searchTerms ?? [],
      ) ||
      !samePublicFactionValue(
        record.searchAliases ?? [],
        expectedRecord.searchAliases ?? [],
      ) ||
      !samePublicFactionValue(
        record.official,
        expectedRecord.official,
      ) ||
      record.mapping?.selectedRawName !==
        expectedRecord.selectedRawName ||
      !Array.isArray(record.variants) ||
      record.variants.length !== expectedVariantByRawName.size
    ) {
      throw new Error(
        "阵营载具记录闭集不匹配：" +
          (record.promoEntryId ?? "missing"),
      );
    }
    seenRecordIds.add(record.promoEntryId);
    const seenRawNames = new Set<string>();
    return {
      ...record,
      variants: record.variants.map((variant) => {
        const expectedVariant =
          expectedVariantByRawName.get(
            variant.sourceRawName,
          );
        if (
          !expectedVariant ||
          seenRawNames.has(variant.sourceRawName) ||
          !variant.data ||
          variant.data.general?.rawName !==
            variant.sourceRawName ||
          variant.catalogBindingRef !==
            expectedVariant.catalogBindingRef ||
          variant.vehicleRef !== expectedVariant.vehicleRef ||
          variant.runtimeVehicleRef !==
            expectedVariant.runtimeVehicleRef ||
          variant.visualArtifactRef !==
            expectedVariant.visualArtifactRef ||
          !samePublicFactionValue(
            variant.searchTerms ?? [],
            expectedVariant.searchTerms ?? [],
          ) ||
          !samePublicFactionValue(
            variant.searchAliases ?? [],
            expectedVariant.searchAliases ?? [],
          ) ||
          !samePublicFactionValue(
            variant.presentation ?? null,
            expectedVariant.presentation ?? null,
          )
        ) {
          throw new Error(
            "阵营载具资料引用不匹配：" +
              variant.sourceRawName,
          );
        }
        seenRawNames.add(variant.sourceRawName);
        return variant;
      }),
    };
  });
  if (seenRecordIds.size !== expectedRecordById.size) {
    throw new Error("阵营载具资料引用存在未使用记录");
  }
  return {
    schemaVersion: document.schemaVersion,
    catalogId: document.catalogId,
    dataRevision: document.dataRevision,
    vehicleCatalogRevision:
      document.vehicleCatalogRevision,
    group: document.group,
    records,
  };
}
