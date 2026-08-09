import assert from "node:assert/strict";
import test from "node:test";

import {
  assertInventorySnapshot,
  assertPinnedValue,
  isStrictValidation,
  resolveValidationProfile,
  validationProfileSummary,
} from "../../tools/validation-profile.mjs";

test("development aliases select the development validation profile", () => {
  assert.equal(resolveValidationProfile("dev"), "dev");
  assert.equal(resolveValidationProfile("fast"), "dev");
  assert.equal(isStrictValidation("dev"), false);
  assert.deepEqual(validationProfileSummary("dev"), {
    profile: "dev",
    strictInventory: false,
    description: "semantic and representative development gates enabled",
  });
});

test("strict and release profiles retain exact inventory gates", () => {
  assert.equal(resolveValidationProfile("STRICT"), "strict");
  assert.equal(resolveValidationProfile("release"), "release");
  assert.equal(isStrictValidation("strict"), true);
  assert.equal(isStrictValidation("release"), true);
  assert.doesNotThrow(() =>
    assertInventorySnapshot(assert, 7, 7, "records", "strict"),
  );
  assert.throws(
    () => assertInventorySnapshot(assert, 8, 7, "records", "release"),
    /strict inventory snapshot/u,
  );
});

test("development validates shape without pinning a changing inventory", () => {
  assert.doesNotThrow(() =>
    assertInventorySnapshot(assert, 8, 7, "records", "dev"),
  );
  assert.throws(
    () => assertInventorySnapshot(assert, -1, 7, "records", "dev"),
    /non-negative integer/u,
  );
  assert.doesNotThrow(() =>
    assertPinnedValue(assert, "new-build", "old-build", "build", "dev"),
  );
  assert.throws(
    () => assertPinnedValue(assert, "", "old-build", "build", "dev"),
    /is required/u,
  );
  assert.throws(
    () => assertPinnedValue(assert, "new-build", "old-build", "build", "strict"),
    /strict pinned value/u,
  );
});

test("invalid validation profiles fail closed", () => {
  assert.throws(
    () => resolveValidationProfile("maybe"),
    /SIGUA_VALIDATION_MODE must be dev, strict, or release/u,
  );
});
