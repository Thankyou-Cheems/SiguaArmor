import test from "node:test";
import assert from "node:assert/strict";
import { vehicleExteriorCapability, previewSelectionKey } from "../../app/vehicle-preview-policy.ts";

test("metadata allows an exterior attempt without claiming loaded assets", () => {
  assert.equal(vehicleExteriorCapability(true).state, "pending");
  assert.equal(vehicleExteriorCapability(false, { state: "available" }).state, "unavailable");
  const failure = { state: "unavailable", message: "controlled texture failure" };
  assert.equal(vehicleExteriorCapability(true, failure), failure);
});

test("every exact selection field isolates capability and error boundaries", () => {
  const selected = { edition: "international", cardId: "card", rawName: "BP_CPV_M134_Blue", runtimeVehicleRef: "runtime", visualArtifactRef: "visual" };
  const keys = [previewSelectionKey(selected), ...Object.keys(selected).map(key =>
    previewSelectionKey({ ...selected, [key]: selected[key] + "-other" }))];
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(previewSelectionKey({ ...selected, cardId: "a:b", rawName: "c" }),
    previewSelectionKey({ ...selected, cardId: "a", rawName: "b:c" }));
});
