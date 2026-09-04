import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceVehicleWeaponOperation,
  createVehicleWeaponOperation,
  fireVehicleWeaponOperation,
  nextVehicleWeaponFireAtMs,
  presentVehicleWeaponOperation,
  releaseVehicleWeaponTrigger,
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
  assert.equal(nextVehicleWeaponFireAtMs(first.state, spec, 0), 100);
  assert.equal(fireVehicleWeaponOperation(first.state, spec, 50).fired, false);
  assert.equal(fireVehicleWeaponOperation(first.state, spec, 100).fired, true);
});

test("held-fire scheduling waits for dry reload and stops without reserve", () => {
  const oneReserve = { ...t72Round, numberOfMags: 2 };
  const initial = createVehicleWeaponOperation(oneReserve, 0);
  const first = fireVehicleWeaponOperation(initial, oneReserve, 0);
  assert.equal(nextVehicleWeaponFireAtMs(first.state, oneReserve, 0), 8_000);

  const lastRound = createVehicleWeaponOperation(
    { ...oneReserve, numberOfMags: 1 },
    0,
  );
  const exhausted = fireVehicleWeaponOperation(
    lastRound,
    { ...oneReserve, numberOfMags: 1 },
    0,
  );
  assert.equal(
    nextVehicleWeaponFireAtMs(
      exhausted.state,
      { ...oneReserve, numberOfMags: 1 },
      0,
    ),
    null,
  );
});

test("holding a single-fire trigger never schedules another round after reload", () => {
  const single = {
    ...t72Round,
    fireControl: {
      defaultModeIndex: 0,
      modes: [{ sourceValue: 1, kind: "single", roundsPerTrigger: 1 }],
      resetBurstOnTriggerRelease: false,
    },
  };
  const initial = createVehicleWeaponOperation(single, 0);
  const first = fireVehicleWeaponOperation(initial, single, 0);
  assert.equal(first.fired, true);
  assert.equal(nextVehicleWeaponFireAtMs(first.state, single, 0), null);
  const released = releaseVehicleWeaponTrigger(first.state, single, 100);
  const second = fireVehicleWeaponOperation(released, single, 8_000);
  assert.equal(second.fired, true);
});

test("a fixed burst stops at the authored round count until trigger release", () => {
  const burst = {
    numberOfMags: 2,
    magazineSize: 10,
    tacticalReloadSeconds: 4,
    dryReloadSeconds: 5,
    roundsPerMinute: 600,
    timeBetweenShotsSeconds: 0.1,
    fireControl: {
      defaultModeIndex: 0,
      modes: [{ sourceValue: 4, kind: "burst", roundsPerTrigger: 4 }],
      resetBurstOnTriggerRelease: false,
    },
  };
  let state = createVehicleWeaponOperation(burst, 0);
  for (let shotIndex = 0; shotIndex < 4; shotIndex += 1) {
    const shot = fireVehicleWeaponOperation(state, burst, shotIndex * 100);
    assert.equal(shot.fired, true);
    state = shot.state;
  }
  assert.equal(nextVehicleWeaponFireAtMs(state, burst, 300), null);
  assert.equal(
    fireVehicleWeaponOperation(state, burst, 400).reason,
    "trigger-cycle-complete",
  );
  const released = releaseVehicleWeaponTrigger(state, burst, 400);
  assert.equal(fireVehicleWeaponOperation(released, burst, 400).fired, true);
});

test("held fire fails closed when neither Wiki cadence field is available", () => {
  const unknownCadence = {
    numberOfMags: 2,
    magazineSize: 10,
    tacticalReloadSeconds: 4,
    dryReloadSeconds: 5,
    roundsPerMinute: 0,
    timeBetweenShotsSeconds: 0,
  };
  const initial = createVehicleWeaponOperation(unknownCadence, 0);
  const first = fireVehicleWeaponOperation(initial, unknownCadence, 0);
  assert.equal(first.fired, true);
  assert.equal(nextVehicleWeaponFireAtMs(first.state, unknownCadence, 0), null);
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

test("native magazine changes retain partial magazines and select the fullest one", () => {
  const spec = { ...t72Round, numberOfMags: 3, magazineSize: 10 };
  const initial = createVehicleWeaponOperation(spec, 0);
  const partial = { ...initial, roundsRemaining: 7 };
  const loading = reloadVehicleWeaponOperation(partial, spec, 0);
  const ready = advanceVehicleWeaponOperation(loading.state, spec, 8_000);
  assert.equal(ready.roundsRemaining, 10);
  assert.equal(ready.reserveMagazines, 2);
  assert.deepEqual(ready.reserveMagazineRounds, [10, 7]);
  assert.equal(ready.roundsRemaining + ready.reserveMagazineRounds.reduce((a, b) => a + b, 0), 27);
});

test("native chambered round transfers into the newly loaded magazine without creating ammunition", () => {
  const spec = { ...t72Round, numberOfMags: 3, magazineSize: 10, allowRoundInChamber: true };
  const initial = createVehicleWeaponOperation(spec, 0);
  const partial = { ...initial, roundsRemaining: 7 };
  const ready = advanceVehicleWeaponOperation(reloadVehicleWeaponOperation(partial, spec, 0).state, spec, 8_000);
  assert.equal(ready.roundsRemaining, 11);
  assert.deepEqual(ready.reserveMagazineRounds, [10, 6]);
  const full = reloadVehicleWeaponOperation(ready, spec, 8_001);
  assert.equal(full.reason, "magazine-full");
  assert.equal(reloadVehicleWeaponOperation(createVehicleWeaponOperation({ ...spec, magazineSize: 1 }, 0), { ...spec, magazineSize: 1 }, 0).reason, "magazine-full");
});

test("single-load feed fills the current magazine from spares without discarding partial ammunition", () => {
  const spec = { ...t72Round, numberOfMags: 3, magazineSize: 10, allowSingleLoad: true };
  const initial = createVehicleWeaponOperation(spec, 0);
  const partial = { ...initial, roundsRemaining: 7, reserveMagazineRounds: [2, 1] };
  const ready = advanceVehicleWeaponOperation(reloadVehicleWeaponOperation(partial, spec, 0).state, spec, 8_000);
  assert.equal(ready.roundsRemaining, 10);
  assert.equal(ready.reserveMagazines, 0);
  assert.deepEqual(ready.reserveMagazineRounds, []);
});
