import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeTurretPoseStore,
} from "../../lib/runtime-turret-pose-store.ts";

test("transient turret poses notify operation controls before input settles", () => {
  const store = createRuntimeTurretPoseStore();
  const observed = [];
  const unsubscribe = store.subscribe(() => {
    observed.push(store.getSnapshot());
  });

  store.publish({
    "2:BP_M1A2_Turret_C": {
      yawDegrees: 8.708,
      pitchDegrees: 4.469,
    },
  });

  assert.deepEqual(observed, [{
    "2:BP_M1A2_Turret_C": {
      yawDegrees: 8.708,
      pitchDegrees: 4.469,
    },
  }]);
  unsubscribe();
});
