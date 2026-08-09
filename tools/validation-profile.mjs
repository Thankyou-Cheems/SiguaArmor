const PROFILE_ENV = "SIGUA_VALIDATION_MODE";
const PROFILE_ALIASES = new Map([
  ["dev", "dev"],
  ["development", "dev"],
  ["fast", "dev"],
  ["strict", "strict"],
  ["release", "release"],
]);

export function resolveValidationProfile(value = process.env[PROFILE_ENV]) {
  const normalized = String(value ?? "dev").trim().toLowerCase();
  const profile = PROFILE_ALIASES.get(normalized);
  if (!profile) {
    throw new Error(
      `${PROFILE_ENV} must be dev, strict, or release; received ${JSON.stringify(value)}`,
    );
  }
  return profile;
}

export function isStrictValidation(profile = resolveValidationProfile()) {
  return profile === "strict" || profile === "release";
}

export function validationProfileSummary(profile = resolveValidationProfile()) {
  return {
    profile,
    strictInventory: isStrictValidation(profile),
    description: isStrictValidation(profile)
      ? "fixed inventory, byte identity, and full-fleet gates enabled"
      : "semantic and representative development gates enabled",
  };
}

export function assertInventorySnapshot(
  assert,
  actual,
  expected,
  label,
  profile = resolveValidationProfile(),
) {
  assert.ok(
    Number.isSafeInteger(actual) && actual >= 0,
    `${label} must be a non-negative integer`,
  );
  if (isStrictValidation(profile)) {
    assert.equal(actual, expected, `${label} strict inventory snapshot`);
  }
}

export function assertPinnedValue(
  assert,
  actual,
  expected,
  label,
  profile = resolveValidationProfile(),
) {
  assert.ok(actual !== undefined && actual !== null && actual !== "", `${label} is required`);
  if (isStrictValidation(profile)) {
    assert.deepEqual(actual, expected, `${label} strict pinned value`);
  }
}
