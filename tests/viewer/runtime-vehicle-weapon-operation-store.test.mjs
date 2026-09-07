import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeVehicleWeaponOperationStore,
} from "../../lib/runtime-vehicle-weapon-operation-store.ts";
import {
  createVehicleWeaponOperation,
  fireVehicleWeaponOperation,
  reloadVehicleWeaponOperation,
} from "../../lib/vehicle-weapon-operation-state.ts";

test("weapon operation updates notify leaf subscribers without replacing the store", () => {
  const store = createRuntimeVehicleWeaponOperationStore();
  const revisions = [];
  const unsubscribe = store.subscribe(() => {
    revisions.push(store.getSnapshot().revision);
  });
  const operationState = {
    roundsRemaining: 49,
    reserveMagazines: 4,
    reserveMagazineRounds: [50, 50, 50, 50],
    nextShotAtMs: 100,
    reloadStartedAtMs: null,
    reloadEndsAtMs: null,
  };

  store.publish("weapon-a", operationState);
  assert.equal(store.getSnapshot().states.get("weapon-a"), operationState);
  assert.deepEqual(revisions, [1]);

  store.clear();
  assert.equal(store.getSnapshot().states.size, 0);
  assert.deepEqual(revisions, [1, 2]);
  unsubscribe();
});

test("clearing operation states replenishes every weapon from its own source loadout", () => {
  const store = createRuntimeVehicleWeaponOperationStore();
  const specs = new Map([
    ["main-gun", { magazineSize: 1, numberOfMags: 12 }],
    ["coax", { magazineSize: 100, numberOfMags: 5 }],
  ].map(([id, capacity]) => [id, {
    ...capacity, tacticalReloadSeconds: 4, dryReloadSeconds: 6,
    roundsPerMinute: 600, timeBetweenShotsSeconds: 0.1,
  }]));
  for (const [id, spec] of specs) {
    const fired = fireVehicleWeaponOperation(createVehicleWeaponOperation(spec, 0), spec, 0);
    assert.equal(fired.fired, true);
    store.publish(id, reloadVehicleWeaponOperation(fired.state, spec, 100).state);
  }
  const oldSnapshot = store.getSnapshot();
  assert.equal(oldSnapshot.states.size, 2);
  store.clear();
  for (const [id, spec] of specs) {
    // Same lazy initialization used by firing, the source HUD and instruments.
    const full = store.getSnapshot().states.get(id) ?? createVehicleWeaponOperation(spec, 1000);
    assert.equal(full.roundsRemaining, spec.magazineSize);
    assert.deepEqual(full.reserveMagazineRounds, Array(spec.numberOfMags - 1).fill(spec.magazineSize));
    assert.equal(full.reserveMagazines, spec.numberOfMags - 1);
    assert.equal(full.reloadEndsAtMs, null);
    assert.equal(full.triggerActive, false);
    assert.equal(full.roundsFiredThisTrigger, 0);
  }
  assert.equal(oldSnapshot.states.size, 2, "reset does not mutate an old subscriber snapshot");
});
