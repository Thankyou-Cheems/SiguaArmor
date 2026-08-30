import assert from "node:assert/strict";
import test from "node:test";

import { ueVectorCmToThreeMeters } from "../../app/runtime-crew-physics-geometry.ts";

test("maps Unreal crew component coordinates onto the viewer basis", () => {
  assert.deepEqual(
    ueVectorCmToThreeMeters({ x: 125, y: -30, z: 210 }).toArray(),
    [1.25, 2.1, -0.3],
  );
});
