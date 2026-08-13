import assert from "node:assert/strict";
import test from "node:test";

import { wikiVehicleFactionId } from "../../lib/wiki-vehicle-identity.ts";

test("Wiki vehicle identities expose one validated faction prefix", () => {
  assert.equal(wikiVehicleFactionId("adf--m1a1--mbt"), "adf");
  assert.equal(wikiVehicleFactionId("usa--m-atv"), "usa");
  assert.throws(() => wikiVehicleFactionId("--m1a1"), /无法解析 Wiki 阵营/u);
});
