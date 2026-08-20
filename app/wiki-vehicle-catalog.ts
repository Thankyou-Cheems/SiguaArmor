import type {
  CatalogTopologyIndex,
  CatalogVariant,
  PublicCatalogIndex,
  PublicFactionCatalog,
  ReferenceComponent,
  ReferenceDamageResistance,
  ReferenceData,
  ReferenceGeneralProfile,
  ReferenceSeat,
  ReferenceVehicleBurning,
} from "./catalog-types";
import { wikiVehicleFactionId } from "../lib/wiki-vehicle-identity.ts";

interface WikiProfile<T> {
  id: string;
  value: T;
}

interface WikiVehicleIdentity {
  id: string;
  rawName: string;
  generalProfileRef: string;
  burningProfileRef: string | null;
  seatProfileRefs: string[];
  hullDamageProfileRefs: string[];
  componentProfileRefs: string[];
}

interface WikiCatalogBinding {
  id: string;
  cardId: string;
  rawName: string;
  vehicleRef: string;
  runtimeVehicleRef: string | null;
  visualArtifactRefs: Partial<Record<"international" | "china", string>>;
  weaponBindingIds: string[];
}

interface WikiVehicleMechanics {
  schemaVersion:
    | "sigua-vehicle-catalog/v3.1"
    | "sigua-vehicle-faction-mechanics/v1";
  identities: {
    vehicles: WikiVehicleIdentity[];
    catalogBindings: WikiCatalogBinding[];
  };
  profiles: {
    general: Array<WikiProfile<ReferenceGeneralProfile>>;
    burning: Array<WikiProfile<ReferenceVehicleBurning>>;
    seats: Array<WikiProfile<ReferenceSeat>>;
    damageResistances: Array<WikiProfile<ReferenceDamageResistance>>;
    components: Array<
      WikiProfile<
        Omit<ReferenceComponent, "damageResistances"> & {
          damageProfileRefs: string[];
        }
      >
    >;
  };
  runtime: {
    visualArtifacts: WikiVisualArtifact[];
  };
  editorAvailability?: {
    schemaVersion: "sigua-vehicle-editor-availability/v1";
    sourceBuildId: string;
    evidenceRevision: string;
    bindingAvailability: WikiBindingAvailability[];
  };
  extensions?: {
    supportAir?: {
      bindings?: WikiSupportAirBinding[];
    };
  };
}

interface WikiBindingAvailability {
  bindingId: string;
  cardId: string;
  rawName: string;
  mechanicsSignatureId: string;
  state: "observed" | "livery-alias" | "absent-current-editor";
  mechanicalBindingId?: string;
  mechanicalRawName?: string;
  setupIds: string[];
  configurationIds: string[];
  vehicleSettingsPaths: string[];
}

interface WikiVehicleCatalog extends WikiVehicleMechanics {
  schemaVersion: "sigua-vehicle-catalog/v3.1";
  presentation: {
    editions: Record<"international" | "china", {
      records: WikiPresentationRecord[];
    }>;
  };
}

interface WikiVehicleFactionMechanics extends WikiVehicleMechanics {
  schemaVersion: "sigua-vehicle-faction-mechanics/v1";
  factionId: string;
}

interface WikiVehiclePresentationCatalog {
  schemaVersion:
    | "sigua-vehicle-presentation/v1"
    | "sigua-vehicle-faction-presentation/v1";
  factionId?: string;
  presentation: WikiVehicleCatalog["presentation"];
}

interface WikiThumbnail {
  path: string;
  width: number;
  height: number;
}

interface WikiVisualArtifact {
  id: string;
  edition: "international" | "china";
  cardId: string;
  rawName: string;
  thumbnail: WikiThumbnail;
}

interface WikiPresentationVariant {
  rawName: string;
  nameZh: string;
  vehicleNameZh: string | null;
  configurationZh: string | null;
  liveryZh: string | null;
  searchTerms: string[];
  searchAliases: string[];
}

interface WikiPresentationRecord {
  cardId: string;
  nameZh: string;
  type: string;
  typeNameZh: string;
  configurationZh: string | null;
  searchTerms: string[];
  searchAliases: string[];
  variants: WikiPresentationVariant[];
}

interface WikiFactionCatalog {
  schemaVersion: "sigua-faction-catalog/v1";
  factions: Array<{
    code: string;
    labels: { zhHans: string };
  }>;
  catalogGroups: {
    china: Array<{ id: string; nameZh: string }>;
  };
}

interface WikiVehicleCommunityAliases {
  schemaVersion: "sigua-vehicle-community-aliases/v1";
  groups: Array<{
    terms: string[];
    targets: Array<{
      edition: "international" | "china";
      cardId: string;
      rawNames?: string[];
    }>;
  }>;
}

interface WikiSupportAirBinding {
  bindingKey: string;
  cardId: string;
  rawName: string;
  visualArtifactRefs: Partial<Record<"international" | "china", string>>;
}

function indexById<T extends { id: string }>(records: readonly T[]) {
  return new Map(records.map((record) => [record.id, record]));
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`SiguaWiki 缺少 ${label}`);
  return value;
}

function validateVehicleMechanics(value: unknown): WikiVehicleMechanics {
  const document = value as WikiVehicleMechanics;
  if (
    (
      document?.schemaVersion !== "sigua-vehicle-catalog/v3.1" &&
      document?.schemaVersion !== "sigua-vehicle-faction-mechanics/v1"
    ) ||
    !Array.isArray(document.identities?.vehicles) ||
    !Array.isArray(document.identities?.catalogBindings) ||
    !Array.isArray(document.profiles?.general) ||
    !Array.isArray(document.profiles?.burning) ||
    !Array.isArray(document.profiles?.seats) ||
    !Array.isArray(document.profiles?.damageResistances) ||
    !Array.isArray(document.profiles?.components) ||
    !Array.isArray(document.runtime?.visualArtifacts)
  ) {
    throw new Error("SiguaWiki 载具机械数据格式不受支持");
  }
  if (
    document.schemaVersion === "sigua-vehicle-faction-mechanics/v1" &&
    (
      document.editorAvailability?.schemaVersion !== "sigua-vehicle-editor-availability/v1" ||
      !Array.isArray(document.editorAvailability.bindingAvailability)
    )
  ) {
    throw new Error("SiguaWiki 阵营配置关系格式不受支持");
  }
  return document;
}

function mergeVehicleMechanicsRecords<T>(
  documents: readonly WikiVehicleMechanics[],
  select: (document: WikiVehicleMechanics) => readonly T[],
  keyOf: (record: T) => string,
  label: string,
) {
  const records = new Map<string, { record: T; encoded: string }>();
  for (const document of documents) {
    for (const record of select(document)) {
      const key = keyOf(record);
      const encoded = JSON.stringify(record);
      const existing = records.get(key);
      if (existing && existing.encoded !== encoded) {
        throw new Error(`SiguaWiki ${label} ${key} 在阵营切片间不一致`);
      }
      if (!existing) records.set(key, { record, encoded });
    }
  }
  return [...records.values()].map(({ record }) => record);
}

export function mergeWikiVehicleFactionMechanics(
  values: readonly unknown[],
): WikiVehicleFactionMechanics {
  if (values.length === 0) {
    throw new Error("当前目录没有可加载的 SiguaWiki 阵营机械数据");
  }
  const documents = values.map(validateVehicleMechanics);
  const factionIds = documents.map((document) =>
    document.schemaVersion === "sigua-vehicle-faction-mechanics/v1"
      ? (document as WikiVehicleFactionMechanics).factionId
      : "catalog"
  );
  return {
    schemaVersion: "sigua-vehicle-faction-mechanics/v1",
    factionId: factionIds.join("+"),
    identities: {
      vehicles: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.identities.vehicles,
        (record) => record.id,
        "载具身份",
      ),
      catalogBindings: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.identities.catalogBindings,
        (record) => record.id,
        "目录绑定",
      ),
    },
    profiles: {
      general: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.profiles.general,
        (record) => record.id,
        "通用资料",
      ),
      burning: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.profiles.burning,
        (record) => record.id,
        "自燃资料",
      ),
      seats: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.profiles.seats,
        (record) => record.id,
        "乘员席",
      ),
      damageResistances: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.profiles.damageResistances,
        (record) => record.id,
        "伤害抗性",
      ),
      components: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.profiles.components,
        (record) => record.id,
        "组件资料",
      ),
    },
    runtime: {
      visualArtifacts: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.runtime.visualArtifacts,
        (record) => record.id,
        "视觉资源",
      ),
    },
    editorAvailability: {
      schemaVersion: "sigua-vehicle-editor-availability/v1",
      sourceBuildId: required(
        documents.find((document) => document.editorAvailability)?.editorAvailability?.sourceBuildId,
        "Editor 阵营配置版本",
      ),
      evidenceRevision: required(
        documents.find((document) => document.editorAvailability)?.editorAvailability?.evidenceRevision,
        "Editor 阵营配置证据",
      ),
      bindingAvailability: mergeVehicleMechanicsRecords(
        documents,
        (document) => document.editorAvailability?.bindingAvailability ?? [],
        (record) => record.bindingId,
        "Editor 目录可用性",
      ),
    },
    extensions: {
      supportAir: {
        bindings: mergeVehicleMechanicsRecords(
          documents,
          (document) => document.extensions?.supportAir?.bindings ?? [],
          (record) => record.bindingKey,
          "共享空中单位",
        ),
      },
    },
  };
}

export function wikiVehicleFactionIdsForGroup(
  expectedIndex: PublicCatalogIndex,
  groupId: string,
) {
  const factionIds = new Set<string>();
  for (const record of expectedIndex.records) {
    if (record.official.groupId !== groupId) continue;
    const factionId = wikiVehicleFactionId(
      record.wikiSourceCardId ?? record.promoEntryId,
    );
    factionIds.add(factionId);
  }
  if (factionIds.size === 0) {
    throw new Error(`当前目录不存在阵营 ${groupId} 的载具`);
  }
  return [...factionIds].sort();
}

function communityAliasMaps(
  value: unknown,
  edition: "international" | "china",
) {
  const document = value as WikiVehicleCommunityAliases | undefined;
  const records = new Map<string, Set<string>>();
  const variants = new Map<string, Set<string>>();
  if (!document) return { records, variants };
  if (document.schemaVersion !== "sigua-vehicle-community-aliases/v1") {
    throw new Error("SiguaWiki 载具俗称格式不受支持");
  }
  for (const group of document.groups) {
    for (const target of group.targets) {
      if (target.edition !== edition) continue;
      if (!target.rawNames) {
        const terms = records.get(target.cardId) ?? new Set<string>();
        group.terms.forEach((term) => terms.add(term));
        records.set(target.cardId, terms);
        continue;
      }
      for (const rawName of target.rawNames) {
        const key = `${target.cardId}\u0000${rawName}`;
        const terms = variants.get(key) ?? new Set<string>();
        group.terms.forEach((term) => terms.add(term));
        variants.set(key, terms);
      }
    }
  }
  return { records, variants };
}

export function buildCatalogIndexFromWiki(
  vehicleValue: unknown,
  factionValue: unknown,
  topology: CatalogTopologyIndex,
  edition: "international" | "china",
  communityAliasesValue?: unknown,
): PublicCatalogIndex {
  const catalog = vehicleValue as
    | WikiVehicleCatalog
    | WikiVehiclePresentationCatalog;
  const factions = factionValue as WikiFactionCatalog;
  if (
    (
      catalog.schemaVersion !== "sigua-vehicle-catalog/v3.1" &&
      catalog.schemaVersion !== "sigua-vehicle-presentation/v1" &&
      catalog.schemaVersion !== "sigua-vehicle-faction-presentation/v1"
    ) ||
    factions.schemaVersion !== "sigua-faction-catalog/v1"
  ) {
    throw new Error("SiguaWiki 呈现数据格式不受支持");
  }
  const factionNames = new Map(
    factions.factions.map((faction) => [faction.code.toLocaleLowerCase("en-US"), faction.labels.zhHans]),
  );
  const chinaGroupNames = new Map(
    factions.catalogGroups.china.map((group) => [group.id, group.nameZh]),
  );
  const groups = topology.groups.map((group) => ({
    ...group,
    name: edition === "international"
      ? required(factionNames.get(group.id), `阵营译名 ${group.id}`)
      : required(chinaGroupNames.get(group.id), `国服阵营译名 ${group.id}`),
  }));
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const presentation = new Map(
    catalog.presentation.editions[edition].records.map((record) => [record.cardId, record]),
  );
  const communityAliases = communityAliasMaps(communityAliasesValue, edition);
  const records = topology.records.flatMap((record) => {
    const wikiSourceCardId = record.wikiSourceCardId ?? record.promoEntryId;
    const display = presentation.get(wikiSourceCardId);
    if (!display) return [];
    const variants = new Map(display.variants.map((variant) => [variant.rawName, variant]));
    const projectedVariants = record.variants.flatMap((variant) => {
      const variantDisplay = variants.get(variant.sourceRawName);
      if (!variantDisplay) return [];
      return [{
        ...variant,
        alias: variantDisplay.configurationZh ?? "",
        displayName: variantDisplay.nameZh,
        searchTerms: variantDisplay.searchTerms,
        searchAliases: [
          ...variantDisplay.searchAliases,
          ...(communityAliases.variants.get(`${record.promoEntryId}\u0000${variant.sourceRawName}`) ?? []),
        ],
        presentation: {
          vehicleNameZh: variantDisplay.vehicleNameZh,
          configurationZh: variantDisplay.configurationZh,
          liveryZh: variantDisplay.liveryZh,
        },
      }];
    });
    if (projectedVariants.length === 0) return [];
    const selectedVariant = projectedVariants.find(
      ({ sourceRawName }) => sourceRawName === record.selectedRawName,
    ) ?? projectedVariants[0];
    return [{
      promoEntryId: record.promoEntryId,
      wikiSourceCardId: record.wikiSourceCardId,
      promotionOrder: record.promotionOrder,
      searchTerms: display.searchTerms,
      searchAliases: [
        ...display.searchAliases,
        ...(communityAliases.records.get(record.promoEntryId) ?? []),
      ],
      official: {
        groupId: record.official.groupId,
        groupNameZh: required(groupNames.get(record.official.groupId), `阵营 ${record.official.groupId}`),
        nameZh: display.nameZh,
        typeZh: display.type,
        typeNameZh: display.typeNameZh,
        presentation: {
          vehicleNameZh: display.nameZh,
          configurationZh: display.configurationZh,
        },
      },
      selectedRawName: selectedVariant.sourceRawName,
      selectedDisplayName: display.nameZh,
      defaultCardId: selectedVariant.cardId,
      routeSlug: record.routeSlug,
      variants: projectedVariants,
    }];
  });
  if (records.length !== topology.records.length) {
    throw new Error(`${edition} 的 Wiki 呈现记录数量不匹配`);
  }
  return {
    schemaVersion: "1.0.0",
    catalogId: topology.catalogId,
    groups: groups.map((group) => ({
      ...group,
      recordCount: records.filter(({ official }) => official.groupId === group.id).length,
    })),
    records,
  };
}

export function buildCatalogSummaryFromWiki(
  factionValue: unknown,
  topology: CatalogTopologyIndex,
  edition: "international" | "china",
): PublicCatalogIndex {
  const factions = factionValue as WikiFactionCatalog;
  if (factions.schemaVersion !== "sigua-faction-catalog/v1") {
    throw new Error("SiguaWiki 阵营数据格式不受支持");
  }
  const factionNames = new Map(
    factions.factions.map((faction) => [
      faction.code.toLocaleLowerCase("en-US"),
      faction.labels.zhHans,
    ]),
  );
  const chinaGroupNames = new Map(
    factions.catalogGroups.china.map((group) => [group.id, group.nameZh]),
  );
  return {
    schemaVersion: "1.0.0",
    catalogId: topology.catalogId,
    groups: topology.groups.map((group) => ({
      ...group,
      name: edition === "international"
        ? required(factionNames.get(group.id), `阵营译名 ${group.id}`)
        : required(chinaGroupNames.get(group.id), `国服阵营译名 ${group.id}`),
    })),
    records: [],
  };
}

export function mergeWikiVehicleFactionPresentation(values: readonly unknown[]) {
  const documents = values as WikiVehiclePresentationCatalog[];
  if (
    documents.length === 0 ||
    documents.some(
      (document) =>
        document.schemaVersion !== "sigua-vehicle-faction-presentation/v1" ||
        !Array.isArray(document.presentation?.editions?.international?.records) ||
        !Array.isArray(document.presentation?.editions?.china?.records),
    )
  ) {
    throw new Error("SiguaWiki 阵营呈现数据格式不受支持");
  }
  return {
    schemaVersion: "sigua-vehicle-presentation/v1" as const,
    presentation: {
      editions: {
        international: {
          records: documents.flatMap(
            (document) => document.presentation.editions.international.records,
          ),
        },
        china: {
          records: documents.flatMap(
            (document) => document.presentation.editions.china.records,
          ),
        },
      },
    },
  };
}

function createReferenceDataResolver(catalog: WikiVehicleMechanics) {
  const vehicles = indexById(catalog.identities.vehicles);
  const generalProfiles = indexById(catalog.profiles.general);
  const burningProfiles = indexById(catalog.profiles.burning);
  const seatProfiles = indexById(catalog.profiles.seats);
  const damageProfiles = indexById(catalog.profiles.damageResistances);
  const componentProfiles = indexById(catalog.profiles.components);
  return (binding: WikiCatalogBinding): ReferenceData => {
    const vehicle = required(
      vehicles.get(binding.vehicleRef),
      `载具 ${binding.vehicleRef}`,
    );
    if (vehicle.rawName !== binding.rawName) {
      throw new Error(`SiguaWiki 载具身份不匹配：${binding.rawName}`);
    }
    const general = required(
      generalProfiles.get(vehicle.generalProfileRef),
      `通用资料 ${vehicle.generalProfileRef}`,
    ).value;
    const hullDamageProfiles = vehicle.hullDamageProfileRefs.map((id) =>
      required(damageProfiles.get(id), `伤害抗性 ${id}`).value,
    );
    const components = vehicle.componentProfileRefs.map((id) => {
      const component = required(componentProfiles.get(id), `组件 ${id}`).value;
      return {
        displayName: component.displayName,
        componentHealth: component.componentHealth,
        repairToolLimit: component.repairToolLimit,
        canBeRepairedAfterDestroy: component.canBeRepairedAfterDestroy,
        damageResistances: component.damageProfileRefs.map((damageId) =>
          required(damageProfiles.get(damageId), `组件伤害抗性 ${damageId}`).value,
        ),
      };
    });
    return {
      general: { rawName: binding.rawName, ...general },
      burning: vehicle.burningProfileRef === null
        ? null
        : required(
            burningProfiles.get(vehicle.burningProfileRef),
            `自燃资料 ${vehicle.burningProfileRef}`,
          ).value,
      weaponBindingIds: binding.weaponBindingIds,
      seats: vehicle.seatProfileRefs.map((id) =>
        required(seatProfiles.get(id), `乘员席 ${id}`).value,
      ),
      damageResistances: hullDamageProfiles,
      components,
    };
  };
}

export function referenceDataForWikiVehicleBinding(
  value: unknown,
  cardId: string,
  rawName: string,
) {
  const catalog = validateVehicleMechanics(value);
  const matches = catalog.identities.catalogBindings.filter(
    (binding) => binding.cardId === cardId && binding.rawName === rawName,
  );
  if (matches.length !== 1) {
    throw new Error(`SiguaWiki 载具绑定不唯一：${cardId} / ${rawName}`);
  }
  return createReferenceDataResolver(catalog)(matches[0]);
}

export function buildFactionCatalogFromWiki(
  value: unknown,
  expectedIndex: PublicCatalogIndex,
  groupId: string,
  edition: "international" | "china",
): PublicFactionCatalog {
  const catalog = validateVehicleMechanics(value);

  const group = expectedIndex.groups.find(({ id }) => id === groupId);
  if (!group) throw new Error(`当前目录不存在阵营 ${groupId}`);

  const bindings = indexById(catalog.identities.catalogBindings);
  const referenceData = createReferenceDataResolver(catalog);
  const visualArtifacts = indexById(catalog.runtime.visualArtifacts);
  const bindingAvailability = new Map(
    (catalog.editorAvailability?.bindingAvailability ?? []).map((entry) => [entry.bindingId, entry]),
  );
  const supportAirBindings = new Map(
    (catalog.extensions?.supportAir?.bindings ?? []).map((binding) => [
      binding.bindingKey,
      binding,
    ]),
  );

  const records = expectedIndex.records
    .filter((record) => record.official.groupId === groupId)
    .map((record) => {
      const wikiSourceCardId = record.wikiSourceCardId ?? record.promoEntryId;
      const variants = record.variants.flatMap<CatalogVariant>((variant): CatalogVariant[] => {
        if (!variant.catalogBindingRef) {
          const bindingKey = `${wikiSourceCardId}\u0000${variant.sourceRawName}`;
          const supportAirBinding = required(
            supportAirBindings.get(bindingKey),
            `共享空中单位 ${variant.sourceRawName}`,
          );
          const visualArtifactRef =
            supportAirBinding.visualArtifactRefs?.[edition] ?? null;
          const thumbnail = visualArtifactRef
            ? required(visualArtifacts.get(visualArtifactRef), `卡片缩略图 ${visualArtifactRef}`).thumbnail
            : null;
          if (
            supportAirBinding.cardId !== wikiSourceCardId ||
            supportAirBinding.rawName !== variant.sourceRawName ||
            variant.vehicleRef !== null ||
            variant.runtimeVehicleRef !== null ||
            visualArtifactRef !== variant.visualArtifactRef
          ) {
            throw new Error(`SiguaWiki 空中单位绑定不匹配：${variant.sourceRawName}`);
          }
          return [{
            sourceRawName: variant.sourceRawName,
            catalogBindingRef: null,
            vehicleRef: null,
            runtimeVehicleRef: null,
            visualArtifactRef: variant.visualArtifactRef,
            alias: variant.alias,
            searchTerms: variant.searchTerms,
            searchAliases: variant.searchAliases,
            presentation: variant.presentation,
            thumbnail,
            data: null,
          }];
        }
        const binding = required(
          bindings.get(variant.catalogBindingRef),
          `目录绑定 ${variant.catalogBindingRef}`,
        );
        const visualArtifactRef = binding.visualArtifactRefs?.[edition] ?? null;
        const thumbnail = visualArtifactRef
          ? required(visualArtifacts.get(visualArtifactRef), `卡片缩略图 ${visualArtifactRef}`).thumbnail
          : null;
        if (
          binding.cardId !== record.promoEntryId ||
          binding.rawName !== variant.sourceRawName ||
          binding.vehicleRef !== variant.vehicleRef ||
          binding.runtimeVehicleRef !== variant.runtimeVehicleRef ||
          visualArtifactRef !== variant.visualArtifactRef
        ) {
          throw new Error(`SiguaWiki 目录绑定不匹配：${variant.sourceRawName}`);
        }
        const availability = required(
          bindingAvailability.get(binding.id),
          `Editor 目录可用性 ${binding.id}`,
        );
        const currentAvailability = {
          ...availability,
          state: availability.state,
          mechanicalBindingId: availability.state === "absent-current-editor"
            ? binding.id
            : required(
              availability.mechanicalBindingId,
              `Editor 机械绑定 ${binding.id}`,
            ),
          mechanicalRawName: availability.state === "absent-current-editor"
            ? binding.rawName
            : required(
              availability.mechanicalRawName,
              `Editor 机械配置 ${binding.id}`,
            ),
        };
        return [{
          sourceRawName: variant.sourceRawName,
          catalogBindingRef: variant.catalogBindingRef,
          vehicleRef: variant.vehicleRef,
          runtimeVehicleRef: variant.runtimeVehicleRef,
          visualArtifactRef: variant.visualArtifactRef,
          alias: variant.alias,
          searchTerms: variant.searchTerms,
          searchAliases: variant.searchAliases,
          presentation: variant.presentation,
          editorAvailability: currentAvailability,
          thumbnail,
          data: referenceData(binding),
        }];
      });
      if (variants.length === 0) return null;
      const selectedRawName = variants.some(({ sourceRawName }) => sourceRawName === record.selectedRawName)
        ? record.selectedRawName
        : variants[0].sourceRawName;
      return {
        promoEntryId: record.promoEntryId,
        wikiSourceCardId: record.wikiSourceCardId,
        promotionOrder: record.promotionOrder,
        searchTerms: record.searchTerms,
        searchAliases: record.searchAliases,
        official: record.official,
        mapping: { selectedRawName },
        data: null,
        variants,
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null);
  return {
    schemaVersion: "1.0.0",
    catalogId: expectedIndex.catalogId,
    group: { ...group, recordCount: records.length },
    records,
  };
}
