import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceVehicleWeaponOperation,
  createVehicleWeaponOperation,
  fireVehicleWeaponOperation,
  presentVehicleWeaponOperation,
  reloadVehicleWeaponOperation,
} from "../../lib/vehicle-weapon-operation-state.ts";

const t72Round = {
  numberOfMags: 12,
  magazineSize: 1,
  tacticalReloadSeconds: 8,
  dryReloadSeconds: 8,
  roundsPerMinute: 7.5,
  timeBetweenShotsSeconds: 0,
};

test("a single-round cannon drives empty, reload progress and ready state", () => {
  const initial = createVehicleWeaponOperation(t72Round, 1_000);
  assert.deepEqual(presentVehicleWeaponOperation(initial, t72Round, 1_000), {
    roundsRemaining: 1,
    magazineCapacity: 1,
    magazinesRemaining: 11,
    reloadProgress: 0,
    weaponReady: true,
    weaponReloading: false,
  });

  const shot = fireVehicleWeaponOperation(initial, t72Round, 1_000);
  assert.equal(shot.fired, true);
  assert.deepEqual(presentVehicleWeaponOperation(shot.state, t72Round, 5_000), {
    roundsRemaining: 0,
    magazineCapacity: 1,
    magazinesRemaining: 11,
    reloadProgress: 0.5,
    weaponReady: false,
    weaponReloading: true,
  });

  const reloaded = advanceVehicleWeaponOperation(shot.state, t72Round, 9_000);
  assert.deepEqual(presentVehicleWeaponOperation(reloaded, t72Round, 9_000), {
    roundsRemaining: 1,
    magazineCapacity: 1,
    magazinesRemaining: 10,
    reloadProgress: 0,
    weaponReady: true,
    weaponReloading: false,
  });
});

test("automatic weapons enforce Wiki cadence without inventing a reload", () => {
  const spec = {
    numberOfMags: 2,
    magazineSize: 100,
    tacticalReloadSeconds: 5,
    dryReloadSeconds: 6,
    roundsPerMinute: 600,
    timeBetweenShotsSeconds: 0.1,
  };
  const initial = createVehicleWeaponOperation(spec, 0);
  const first = fireVehicleWeaponOperation(initial, spec, 0);
  assert.equal(first.fired, true);
  assert.equal(first.state.roundsRemaining, 99);
  assert.equal(fireVehicleWeaponOperation(first.state, spec, 50).fired, false);
  assert.equal(fireVehicleWeaponOperation(first.state, spec, 100).fired, true);
});

test("manual reload uses the Wiki tactical duration and dry reload keeps the dry duration", () => {
  const spec = {
    numberOfMags: 3,
    magazineSize: 10,
    tacticalReloadSeconds: 4,
    dryReloadSeconds: 6,
    roundsPerMinute: 600,
    timeBetweenShotsSeconds: 0.1,
  };
  const initial = createVehicleWeaponOperation(spec, 0);
  const fired = fireVehicleWeaponOperation(initial, spec, 0);
  const tactical = reloadVehicleWeaponOperation(fired.state, spec, 100);
  assert.equal(tactical.started, true);
  assert.equal(tactical.state.reloadEndsAtMs, 4_100);
  assert.equal(
    presentVehicleWeaponOperation(tactical.state, spec, 2_100).reloadProgress,
    0.5,
  );

  let dry = initial;
  for (let shot = 0; shot < spec.magazineSize; shot += 1) {
    dry = fireVehicleWeaponOperation(dry, spec, shot * 100).state;
  }
  assert.equal(dry.reloadEndsAtMs, 6_900);
  assert.equal(
    reloadVehicleWeaponOperation(dry, spec, 1_000).reason,
    "weapon-reloading",
  );
});
