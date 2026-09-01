import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeVehicleWeaponOperationStore,
} from "../../lib/runtime-vehicle-weapon-operation-store.ts";

test("weapon operation updates notify leaf subscribers without replacing the store", () => {
  const store = createRuntimeVehicleWeaponOperationStore();
  const revisions = [];
  const unsubscribe = store.subscribe(() => {
    revisions.push(store.getSnapshot().revision);
  });
  const operationState = {
    roundsRemaining: 49,
    reserveMagazines: 4,
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
