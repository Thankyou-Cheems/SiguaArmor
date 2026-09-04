import assert from "node:assert/strict";
import test from "node:test";
import { operationViewEquipmentRefs, operationViewKeyAction } from "../../lib/operation-view-control.ts";

// v10.5.3 BP_M1A1_USMC_Turret.SQVehicleInventory.Weapons, captured in
// Research vehicle-firing-presentation/firing-slot-m1a1-r3. Graph IDs are
// deliberately not in Inventory order: their order is not an input binding.
const ap = "vehicle-equipment-59d91dba8ed03af7b0d2";
const heat = "vehicle-equipment-af1e39980e2fd1f9e290";
const coax = "vehicle-equipment-15d5e9fdff1bc103ba8e";
const smoke = "vehicle-equipment-46548f1e8d412e06502d";
const inventorySlots = [ap, heat, coax, smoke].map((equipmentRef, index) => ({ equipmentRef, slotNumber: index + 1 }));

test("M1A1 keyboard 1 selects source Inventory sabot, not first graph equipment", () => {
  const equipmentRefs = operationViewEquipmentRefs({
    stationEquipmentRefs: [coax, smoke, ap, heat],
    sightEquipmentRefs: [ap, heat, coax, smoke],
    playableEquipmentRefs: [coax, ap, heat, smoke],
    inventorySlots,
  });
  assert.deepEqual(equipmentRefs, [ap, heat, coax, smoke]);
  assert.deepEqual(operationViewKeyAction({
    code: "Digit1", driverView: false, repeat: false, zoomIndex: 0,
    zoomCount: 3, equipmentRefs, inventorySlots,
  }), { kind: "weapon", equipmentRef: ap, slotNumber: 1 });
});

test("a missing playable slot never renumbers later native hotkeys", () => {
  const action = (code) => operationViewKeyAction({
    code, driverView: false, repeat: false, zoomIndex: 0, zoomCount: 1,
    equipmentRefs: [ap, coax], inventorySlots: [inventorySlots[0], inventorySlots[2]],
  });
  assert.equal(action("Digit2"), null);
  assert.deepEqual(action("Digit3"), { kind: "weapon", equipmentRef: coax, slotNumber: 3 });
});

test("source inventory is complete before the optional sight and playback documents finish loading", () => {
  assert.deepEqual(operationViewEquipmentRefs({
    stationEquipmentRefs: [smoke, coax, ap, heat],
    sightEquipmentRefs: [smoke],
    playableEquipmentRefs: [],
    inventorySlots,
  }), [ap, heat, coax, smoke]);
});

test("an item present in several source groups keeps its first numeric slot for display order", () => {
  assert.deepEqual(operationViewEquipmentRefs({
    stationEquipmentRefs: [coax, ap], sightEquipmentRefs: [], playableEquipmentRefs: [],
    inventorySlots: [{ equipmentRef: ap, slotNumber: 1 }, { equipmentRef: coax, slotNumber: 2 }, { equipmentRef: ap, slotNumber: 5 }],
  }), [ap, coax]);
});
