import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyVehicleWeaponKind,
  deriveSeatSemantics,
  isAncillaryVehicleWeapon,
} from "../../lib/encyclopedia-seat-semantics.mjs";
import {
  inflatePublicFactionCatalog,
} from "../../lib/public-faction-catalog.mjs";
import { assertInventorySnapshot } from "../../tools/validation-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const factionRoot = path.join(root, "public", "catalog-data", "factions");
const weaponCatalog = JSON.parse(
  await readFile(
    path.join(root, "generated", "internal", "weapon-catalog.json"),
    "utf8",
  ),
);
const weaponBindingById = new Map(
  weaponCatalog.relations.vehicleEquipmentBindings.map(
    (binding) => [binding.id, binding],
  ),
);

async function loadVariants() {
  const files = (await readdir(factionRoot))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const variants = [];
  for (const fileName of files) {
    const faction = inflatePublicFactionCatalog(
      JSON.parse(
        await readFile(path.join(factionRoot, fileName), "utf8"),
      ),
    );
    for (const record of faction.records) {
      for (const data of [record.data, ...(record.variants ?? []).map((variant) => variant.data)]) {
        if (data) {
          variants.push({
            ...data,
            weapons: data.weaponBindingIds.map((bindingId) => {
              const binding = weaponBindingById.get(bindingId);
              assert.ok(binding, `missing weapon binding ${bindingId}`);
              return binding.equipment;
            }),
          });
        }
      }
    }
  }
  return { files, variants };
}

const fixture = await loadVariants();
const byRawName = new Map(
  fixture.variants.map((data) => [data.general.rawName, data]),
);

function seat(rawName, index) {
  const vehicle = byRawName.get(rawName);
  assert.ok(vehicle, `missing vehicle ${rawName}`);
  const result = vehicle.seats.find((candidate) => candidate.index === index);
  assert.ok(result, `missing ${rawName} F${index}`);
  return result;
}

test("all current encyclopedias expose closed seat and station semantics", () => {
  assertInventorySnapshot(assert, fixture.files.length, 17, "faction files");
  assertInventorySnapshot(assert, fixture.variants.length, 648, "encyclopedia variants");

  const allSeats = fixture.variants.flatMap((vehicle) => vehicle.seats);
  assertInventorySnapshot(assert, allSeats.length, 5362, "vehicle seats");
  assert.equal(
    allSeats.some((item) => item.role === "remote-weapon-station"),
    false,
  );

  for (const vehicle of fixture.variants) {
    const seatTurretNames = new Set(
      vehicle.seats
        .map((item) => item.turretName)
        .filter((turretName) => turretName !== null),
    );
    for (const item of vehicle.seats) {
      const expected = deriveSeatSemantics(item, item.index, vehicle);
      assert.notEqual(expected.role, null, `${vehicle.general.rawName} F${item.index}`);
      assert.equal(item.role, expected.role, `${vehicle.general.rawName} F${item.index} role`);
      assert.equal(
        item.stationKind,
        expected.stationKind,
        `${vehicle.general.rawName} F${item.index} station kind`,
      );
    }
    for (const weapon of vehicle.weapons.filter(
      (item) => !isAncillaryVehicleWeapon(item) && item.turretName !== null,
    )) {
      assert.equal(
        seatTurretNames.has(weapon.turretName),
        true,
        `${vehicle.general.rawName} has unbound ${weapon.gunName}`,
      );
    }
  }
});

test("Coyote F3 is commander and F4 is machine gunner in every encyclopedia", () => {
  for (const rawName of [
    "BP_LAV2_Coyote",
    "BP_LAV2_Coyote_Woodland",
    "BP_LAV2_Coyote_CRF",
  ]) {
    assert.deepEqual(
      { role: seat(rawName, 3).role, stationKind: seat(rawName, 3).stationKind },
      { role: "commander", stationKind: "observation-station" },
    );
    assert.deepEqual(
      { role: seat(rawName, 4).role, stationKind: seat(rawName, 4).stationKind },
      { role: "machine-gunner", stationKind: "weapon-station" },
    );
  }
});

test("mixed weapon stations stay generic gunner roles", () => {
  for (const [rawName, index] of [
    ["BP_BMP1_AFU", 2],
    ["BP_AAVP7A1", 2],
    ["BP_M1117", 2],
    ["BP_MTLBM_6MA_GFI", 2],
  ]) {
    assert.equal(seat(rawName, index).role, "gunner", `${rawName} F${index}`);
  }
});

test("weapon class and station hardware are represented independently", () => {
  for (const rawName of ["BP_PARS3_MK19", "BP_PARS3_MK19_Desert"]) {
    assert.deepEqual(
      { role: seat(rawName, 2).role, stationKind: seat(rawName, 2).stationKind },
      { role: "grenadier", stationKind: "remote-weapon-station" },
    );
  }

  const hj8Vehicles = fixture.variants.filter((vehicle) =>
    vehicle.weapons.some((weapon) => weapon.gunName === "BP_HJ8ATGM_CSK131"),
  );
  assertInventorySnapshot(assert, hj8Vehicles.length, 6, "HJ-8 vehicles");
  for (const vehicle of hj8Vehicles) {
    const weapon = vehicle.weapons.find(
      (item) => item.gunName === "BP_HJ8ATGM_CSK131",
    );
    assert.equal(classifyVehicleWeaponKind(weapon), "missile");
    const operator = vehicle.seats.find(
      (item) => item.turretName === weapon.turretName,
    );
    assert.equal(operator?.role, "missile-operator");
  }
});
