import type {
  PublicCatalogIndex,
  PublicFactionCatalog,
  ReferenceComponent,
  ReferenceDamageResistance,
  ReferenceData,
  ReferenceGeneralProfile,
  ReferenceSeat,
} from "./catalog-types";

interface WikiProfile<T> {
  id: string;
  value: T;
}

interface WikiVehicleIdentity {
  id: string;
  rawName: string;
  generalProfileRef: string;
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

interface WikiVehicleCatalog {
  schemaVersion: "sigua-vehicle-catalog/v3.1";
  identities: {
    vehicles: WikiVehicleIdentity[];
    catalogBindings: WikiCatalogBinding[];
  };
  profiles: {
    general: Array<WikiProfile<ReferenceGeneralProfile>>;
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
  extensions?: {
    supportAir?: {
      bindings?: WikiSupportAirBinding[];
    };
  };
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

export function buildFactionCatalogFromWiki(
  value: unknown,
  expectedIndex: PublicCatalogIndex,
  groupId: string,
  edition: "international" | "china",
): PublicFactionCatalog {
  const catalog = value as WikiVehicleCatalog;
  if (catalog.schemaVersion !== "sigua-vehicle-catalog/v3.1") {
    throw new Error("SiguaWiki 载具数据格式不受支持");
  }

  const group = expectedIndex.groups.find(({ id }) => id === groupId);
  if (!group) throw new Error(`当前目录不存在阵营 ${groupId}`);

  const bindings = indexById(catalog.identities.catalogBindings);
  const vehicles = indexById(catalog.identities.vehicles);
  const generalProfiles = indexById(catalog.profiles.general);
  const seatProfiles = indexById(catalog.profiles.seats);
  const damageProfiles = indexById(catalog.profiles.damageResistances);
  const componentProfiles = indexById(catalog.profiles.components);
  const supportAirBindings = new Map(
    (catalog.extensions?.supportAir?.bindings ?? []).map((binding) => [
      binding.bindingKey,
      binding,
    ]),
  );

  function referenceData(binding: WikiCatalogBinding): ReferenceData {
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
      weaponBindingIds: binding.weaponBindingIds,
      seats: vehicle.seatProfileRefs.map((id) =>
        required(seatProfiles.get(id), `乘员席 ${id}`).value,
      ),
      damageResistances: hullDamageProfiles,
      components,
    };
  }

  const records = expectedIndex.records
    .filter((record) => record.official.groupId === groupId)
    .map((record) => ({
      promoEntryId: record.promoEntryId,
      promotionOrder: record.promotionOrder,
      searchTerms: record.searchTerms,
      searchAliases: record.searchAliases,
      official: record.official,
      mapping: { selectedRawName: record.selectedRawName },
      data: null,
      variants: record.variants.map((variant) => {
        if (!variant.catalogBindingRef) {
          const bindingKey = `${record.promoEntryId}\u0000${variant.sourceRawName}`;
          const supportAirBinding = required(
            supportAirBindings.get(bindingKey),
            `共享空中单位 ${variant.sourceRawName}`,
          );
          const visualArtifactRef =
            supportAirBinding.visualArtifactRefs?.[edition] ?? null;
          if (
            supportAirBinding.cardId !== record.promoEntryId ||
            supportAirBinding.rawName !== variant.sourceRawName ||
            variant.vehicleRef !== null ||
            variant.runtimeVehicleRef !== null ||
            visualArtifactRef !== variant.visualArtifactRef
          ) {
            throw new Error(`SiguaWiki 空中单位绑定不匹配：${variant.sourceRawName}`);
          }
          return {
            sourceRawName: variant.sourceRawName,
            catalogBindingRef: null,
            vehicleRef: null,
            runtimeVehicleRef: null,
            visualArtifactRef: variant.visualArtifactRef,
            alias: variant.alias,
            searchTerms: variant.searchTerms,
            searchAliases: variant.searchAliases,
            presentation: variant.presentation,
            data: null,
          };
        }
        const binding = required(
          bindings.get(variant.catalogBindingRef),
          `目录绑定 ${variant.catalogBindingRef}`,
        );
        const visualArtifactRef = binding.visualArtifactRefs?.[edition] ?? null;
        if (
          binding.cardId !== record.promoEntryId ||
          binding.rawName !== variant.sourceRawName ||
          binding.vehicleRef !== variant.vehicleRef ||
          binding.runtimeVehicleRef !== variant.runtimeVehicleRef ||
          visualArtifactRef !== variant.visualArtifactRef
        ) {
          throw new Error(`SiguaWiki 目录绑定不匹配：${variant.sourceRawName}`);
        }
        return {
          sourceRawName: variant.sourceRawName,
          catalogBindingRef: variant.catalogBindingRef,
          vehicleRef: variant.vehicleRef,
          runtimeVehicleRef: variant.runtimeVehicleRef,
          visualArtifactRef: variant.visualArtifactRef,
          alias: variant.alias,
          searchTerms: variant.searchTerms,
          searchAliases: variant.searchAliases,
          presentation: variant.presentation,
          data: referenceData(binding),
        };
      }),
    }));
  if (records.length !== group.recordCount) {
    throw new Error(`阵营 ${groupId} 的卡片数量不匹配`);
  }
  return {
    schemaVersion: "1.0.0",
    catalogId: expectedIndex.catalogId,
    group,
    records,
  };
}
