export const PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION =
  "sigua-vehicle-reference-projection/v5-localized-search-closure";

export const VEHICLE_REFERENCE_GRAPH_DIGEST_DOMAIN =
  "sigua-vehicle-reference-graph/v1\u0000";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid public faction catalog: ${message}`);
  }
}

export function stablePublicFactionValue(value) {
  if (Array.isArray(value)) {
    return value.map(stablePublicFactionValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [
          key,
          stablePublicFactionValue(value[key]),
        ]),
    );
  }
  return value;
}

export function canonicalPublicFactionValue(value) {
  return JSON.stringify(stablePublicFactionValue(value));
}

export function samePublicFactionValue(left, right) {
  return (
    canonicalPublicFactionValue(left) ===
    canonicalPublicFactionValue(right)
  );
}

function readProfilePool(
  value,
  label,
  digestAssertions,
) {
  invariant(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 2 &&
      Object.hasOwn(value, "id") &&
      Object.hasOwn(value, "values") &&
      typeof value.id === "string" &&
      /^[A-Za-z0-9_-]{43}$/u.test(value.id) &&
      Array.isArray(value.values) &&
      value.values.every(
        (profileValue) =>
          profileValue &&
          typeof profileValue === "object" &&
          !Array.isArray(profileValue),
      ),
    `${label} profile pool is invalid`,
  );
  invariant(
    new Set(
      value.values.map(canonicalPublicFactionValue),
    ).size === value.values.length,
    `${label} profile pool contains duplicate entries`,
  );
  digestAssertions.push({
    expected: value.id,
    domain: "",
    value: value.values,
    message: `${label} profile pool is invalid`,
  });
  return value.values;
}

function resolveProfileRefs(
  refs,
  profiles,
  used,
  label,
) {
  invariant(
    Array.isArray(refs) &&
      refs.every(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < profiles.length,
      ),
    `${label} contains a missing profile`,
  );
  return refs.map((index) => {
    used.add(index);
    return structuredClone(profiles[index]);
  });
}

function exactProfileUse(used, profiles, label) {
  invariant(
    used.size === profiles.length &&
      profiles.every((_, index) => used.has(index)),
    `${label} profile pool contains unused entries`,
  );
}

export function preparePublicFactionCatalogInflation(document) {
  if (
    document?.vehicleReferenceSchemaVersion === undefined &&
    document?.vehicleReferences === undefined &&
    document?.vehicleProfiles === undefined
  ) {
    return {
      value: document,
      digestAssertions: [],
      compact: false,
    };
  }
  invariant(
    document.vehicleReferenceSchemaVersion ===
      PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
    `reference schema is ${document.vehicleReferenceSchemaVersion ?? "missing"}`,
  );
  invariant(
    document.vehicleReferences &&
      typeof document.vehicleReferences === "object" &&
      !Array.isArray(document.vehicleReferences) &&
      Object.keys(document.vehicleReferences)
        .sort((left, right) => left.localeCompare(right, "en"))
        .join("\n") === "id\nvalues" &&
      typeof document.vehicleReferences.id === "string" &&
      /^[A-Za-z0-9_-]{43}$/u.test(
        document.vehicleReferences.id,
      ) &&
      Array.isArray(document.vehicleReferences.values) &&
      document.vehicleProfiles &&
      typeof document.vehicleProfiles === "object" &&
      !Array.isArray(document.vehicleProfiles) &&
      Object.keys(document.vehicleProfiles)
        .sort((left, right) => left.localeCompare(right, "en"))
        .join("\n") ===
        [
          "components",
          "damageResistances",
          "general",
          "seats",
        ].join("\n") &&
      Array.isArray(document.records),
    "vehicle reference graph is incomplete",
  );
  const digestAssertions = [];
  const generalProfiles = readProfilePool(
    document.vehicleProfiles.general,
    "general",
    digestAssertions,
  );
  const seatProfiles = readProfilePool(
    document.vehicleProfiles.seats,
    "seat",
    digestAssertions,
  );
  const damageProfiles = readProfilePool(
    document.vehicleProfiles.damageResistances,
    "damage",
    digestAssertions,
  );
  const componentProfiles = readProfilePool(
    document.vehicleProfiles.components,
    "component",
    digestAssertions,
  );
  const usedGeneralProfiles = new Set();
  const usedSeatProfiles = new Set();
  const usedDamageProfiles = new Set();
  const usedComponentProfiles = new Set();
  const referenceValues = [];
  const canonicalReferenceValues = new Set();

  for (const [
    referenceIndex,
    reference,
  ] of document.vehicleReferences.values.entries()) {
    invariant(
      reference &&
        typeof reference === "object" &&
        !Array.isArray(reference) &&
        Object.keys(reference)
          .sort((left, right) => left.localeCompare(right, "en"))
          .join("\n") ===
          [
            "componentProfileRefs",
            "generalProfileRef",
            "hullDamageProfileRefs",
            "rawName",
            "seatProfileRefs",
            "weaponBindingIds",
          ].join("\n") &&
        typeof reference.rawName === "string" &&
        reference.rawName.length > 0 &&
        Array.isArray(reference.weaponBindingIds) &&
        reference.weaponBindingIds.every(
          (id) => typeof id === "string" && id.length > 0,
        ) &&
        Number.isInteger(reference.generalProfileRef) &&
        reference.generalProfileRef >= 0 &&
        reference.generalProfileRef < generalProfiles.length &&
        !Object.hasOwn(reference, "value") &&
        !Object.hasOwn(reference, "data"),
      "vehicle reference identity is invalid",
    );
    usedGeneralProfiles.add(reference.generalProfileRef);
    const general = structuredClone(
      generalProfiles[reference.generalProfileRef],
    );
    invariant(
      !Object.hasOwn(general, "rawName"),
      `${reference.generalProfileRef} embeds binding identity`,
    );
    const seats = resolveProfileRefs(
      reference.seatProfileRefs,
      seatProfiles,
      usedSeatProfiles,
      `${referenceIndex} seat refs`,
    );
    const damageResistances = resolveProfileRefs(
      reference.hullDamageProfileRefs,
      damageProfiles,
      usedDamageProfiles,
      `${referenceIndex} hull damage refs`,
    );
    const components = resolveProfileRefs(
      reference.componentProfileRefs,
      componentProfiles,
      usedComponentProfiles,
      `${referenceIndex} component refs`,
    ).map((component) => {
      invariant(
        Array.isArray(component.damageProfileRefs) &&
          !Object.hasOwn(component, "damageResistances"),
        `${referenceIndex} component profile is invalid`,
      );
      const componentDamageResistances = resolveProfileRefs(
        component.damageProfileRefs,
        damageProfiles,
        usedDamageProfiles,
        `${referenceIndex} component damage refs`,
      );
      const {
        damageProfileRefs,
        ...componentValue
      } = component;
      void damageProfileRefs;
      return {
        ...componentValue,
        damageResistances: componentDamageResistances,
      };
    });
    const value = {
      general: {
        rawName: reference.rawName,
        ...general,
      },
      weaponBindingIds: [...reference.weaponBindingIds],
      seats,
      damageResistances,
      components,
    };
    const canonical = canonicalPublicFactionValue(value);
    invariant(
      !canonicalReferenceValues.has(canonical),
      `${referenceIndex} duplicates another vehicle reference`,
    );
    canonicalReferenceValues.add(canonical);
    referenceValues.push(value);
  }

  exactProfileUse(
    usedGeneralProfiles,
    generalProfiles,
    "general",
  );
  exactProfileUse(usedSeatProfiles, seatProfiles, "seat");
  exactProfileUse(usedDamageProfiles, damageProfiles, "damage");
  exactProfileUse(
    usedComponentProfiles,
    componentProfiles,
    "component",
  );

  const used = new Set();
  const bindingTriples = [];
  function inflateEntry(entry, promoEntryId) {
    invariant(
      entry &&
        typeof entry === "object" &&
        !Object.hasOwn(entry, "data") &&
        !Object.hasOwn(entry, "vehicleReferenceId") &&
        typeof entry.sourceRawName === "string" &&
        entry.sourceRawName.length > 0,
      "compact variant must not contain inline data",
    );
    const referenceIndex = entry.vehicleReferenceRef;
    invariant(
      Number.isSafeInteger(referenceIndex) &&
        referenceIndex >= 0 &&
        referenceIndex < referenceValues.length,
      `entry points to missing reference ${referenceIndex ?? "missing"}`,
    );
    used.add(referenceIndex);
    bindingTriples.push([
      promoEntryId,
      entry.sourceRawName,
      referenceIndex,
    ]);
    const {
      vehicleReferenceRef: _vehicleReferenceRef,
      ...withoutReference
    } = entry;
    void _vehicleReferenceRef;
    return {
      ...withoutReference,
      data: referenceValues[referenceIndex],
    };
  }

  const records = document.records.map((record) => {
    invariant(
      record &&
        typeof record === "object" &&
        typeof record.promoEntryId === "string" &&
        record.promoEntryId.length > 0 &&
        record.data === null &&
        !Object.hasOwn(record, "vehicleReferenceId") &&
        !Object.hasOwn(record, "vehicleReferenceRef") &&
        Array.isArray(record.variants),
      "compact record must use variant references only",
    );
    return {
      ...record,
      variants: record.variants.map((entry) =>
        inflateEntry(entry, record.promoEntryId),
      ),
    };
  });
  digestAssertions.push({
    expected: document.vehicleReferences.id,
    domain: VEHICLE_REFERENCE_GRAPH_DIGEST_DOMAIN,
    value: {
      profilePoolIds: {
        general: document.vehicleProfiles.general.id,
        seats: document.vehicleProfiles.seats.id,
        damageResistances:
          document.vehicleProfiles.damageResistances.id,
        components: document.vehicleProfiles.components.id,
      },
      referenceValues: document.vehicleReferences.values,
      bindingTriples,
    },
    message: "vehicle reference graph digest drifted",
  });
  invariant(
    used.size === referenceValues.length &&
      referenceValues.every((_, index) => used.has(index)),
    `${referenceValues.length - used.size} vehicle references are unused`,
  );
  return {
    value: {
      ...document,
      records,
    },
    digestAssertions,
    compact: true,
  };
}

export function assertPreparedPublicFactionDigests(
  prepared,
  digest,
) {
  for (const assertion of prepared.digestAssertions) {
    invariant(
      digest(assertion.domain, assertion.value) ===
        assertion.expected,
      assertion.message,
    );
  }
  return prepared.value;
}
