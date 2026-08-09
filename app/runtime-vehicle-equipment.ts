import type {
  WeaponCatalogVehicleEquipment,
} from "../lib/weapon-catalog.ts";
import {
  weaponCatalogVehicleEquipmentBindingForId,
} from "../lib/weapon-catalog.ts";

export interface RuntimeVehicleEquipmentBinding {
  id: string;
  cardId: string;
  rawName: string;
  weaponClass: string;
  turretName: string | null;
  sourceIndex: number;
  equipment: WeaponCatalogVehicleEquipment;
}

export function runtimeVehicleEquipmentBindingForId(
  bindingId: string,
) {
  return weaponCatalogVehicleEquipmentBindingForId(bindingId);
}
