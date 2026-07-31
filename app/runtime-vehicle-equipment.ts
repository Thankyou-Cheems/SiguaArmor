import equipmentIndexJson from "./runtime-vehicle-equipment-index.json" with { type: "json" };
import type {
  WeaponCatalogVehicleEquipment,
} from "../lib/weapon-catalog";

export interface RuntimeVehicleEquipmentBinding {
  id: string;
  cardId: string;
  rawName: string;
  weaponClass: string;
  turretName: string | null;
  sourceIndex: number;
  equipment: WeaponCatalogVehicleEquipment;
}

interface RuntimeVehicleEquipmentIndex {
  schemaVersion:
    "sigua-runtime-vehicle-equipment-index/v2";
  projectionRevision: string;
  catalog: {
    schemaVersion: "sigua-weapon-catalog/v2";
    catalogRevision: string;
    bytes: number;
    sha256: string;
  };
  counts: {
    bindings: number;
  };
  bindings: RuntimeVehicleEquipmentBinding[];
}

const equipmentIndex =
  equipmentIndexJson as RuntimeVehicleEquipmentIndex;
if (
  equipmentIndex.schemaVersion !==
    "sigua-runtime-vehicle-equipment-index/v2" ||
  equipmentIndex.catalog.schemaVersion !==
    "sigua-weapon-catalog/v2" ||
  !/^[a-f0-9]{64}$/u.test(
    equipmentIndex.catalog.catalogRevision,
  ) ||
  !/^[a-f0-9]{64}$/u.test(equipmentIndex.catalog.sha256) ||
  !/^[a-f0-9]{64}$/u.test(
    equipmentIndex.projectionRevision,
  ) ||
  equipmentIndex.counts.bindings !==
    equipmentIndex.bindings.length
) {
  throw new Error("Invalid runtime vehicle equipment index");
}

const bindingById = new Map<
  string,
  RuntimeVehicleEquipmentBinding
>();
for (const binding of equipmentIndex.bindings) {
  if (
    !binding.id ||
    bindingById.has(binding.id) ||
    !binding.cardId ||
    !binding.rawName ||
    !binding.weaponClass ||
    !Number.isInteger(binding.sourceIndex) ||
    binding.sourceIndex < 0 ||
    !binding.equipment ||
    typeof binding.equipment.gunName !== "string" ||
    typeof binding.equipment.displayName !== "string"
  ) {
    throw new Error(
      `Invalid runtime vehicle equipment binding: ${binding.id || "missing"}`,
    );
  }
  bindingById.set(binding.id, binding);
}

export const runtimeVehicleEquipmentSummary = Object.freeze({
  catalogRevision: equipmentIndex.catalog.catalogRevision,
  projectionRevision: equipmentIndex.projectionRevision,
  bindingCount: equipmentIndex.counts.bindings,
});

export function runtimeVehicleEquipmentBindingForId(
  bindingId: string,
) {
  return bindingById.get(bindingId) ?? null;
}
