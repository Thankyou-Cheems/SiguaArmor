import { createHash } from "node:crypto";

import {
  assertPreparedPublicFactionDigests,
  preparePublicFactionCatalogInflation,
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
  stablePublicFactionValue as stable,
  VEHICLE_REFERENCE_GRAPH_DIGEST_DOMAIN,
} from "./public-faction-reference-graph.mjs";

export { PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION };

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid public faction catalog: ${message}`);
  }
}

function referenceId(value) {
  const digest = createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
  return `vehicle-reference-${digest}`;
}

function profilePoolId(values) {
  return createHash("sha256")
    .update(JSON.stringify(stable(values)))
    .digest("base64url");
}

function referenceGraphId(
  vehicleProfiles,
  referenceValues,
  bindingTriples,
) {
  return createHash("sha256")
    .update(VEHICLE_REFERENCE_GRAPH_DIGEST_DOMAIN)
    .update(
      JSON.stringify(
        stable({
          profilePoolIds: {
            general: vehicleProfiles.general.id,
            seats: vehicleProfiles.seats.id,
            damageResistances:
              vehicleProfiles.damageResistances.id,
            components: vehicleProfiles.components.id,
          },
          referenceValues,
          bindingTriples,
        }),
      ),
    )
    .digest("base64url");
}

function createProfilePool() {
  const records = new Map();
  function add(value) {
    const canonical = JSON.stringify(stable(value));
    const existing = records.get(canonical);
    if (existing) return existing.index;
    const index = records.size;
    records.set(canonical, { index, value });
    return index;
  }
  function pool() {
    const values = [...records.values()].map(
      ({ value }) => value,
    );
    return {
      id: profilePoolId(values),
      values,
    };
  }
  return { add, pool };
}

function compactReferenceData(data, profiles) {
  invariant(
    data?.general &&
      typeof data.general === "object" &&
      typeof data.general.rawName === "string" &&
      data.general.rawName.length > 0 &&
      Array.isArray(data.weaponBindingIds) &&
      Array.isArray(data.seats) &&
      Array.isArray(data.damageResistances) &&
      Array.isArray(data.components),
    "reference data is incomplete",
  );
  const {
    rawName,
    ...generalValue
  } = data.general;
  return {
    rawName,
    weaponBindingIds: [...data.weaponBindingIds],
    generalProfileRef: profiles.general.add(generalValue),
    seatProfileRefs: data.seats.map((seat) =>
      profiles.seats.add(seat),
    ),
    hullDamageProfileRefs: data.damageResistances.map((item) =>
      profiles.damageResistances.add(item),
    ),
    componentProfileRefs: data.components.map((component) => {
      invariant(
        component &&
          typeof component === "object" &&
          Array.isArray(component.damageResistances),
        `${rawName} component profile is invalid`,
      );
      const {
        damageResistances,
        ...componentValue
      } = component;
      return profiles.components.add({
        ...componentValue,
        damageProfileRefs: damageResistances.map((item) =>
          profiles.damageResistances.add(item),
        ),
      });
    }),
  };
}

function compactEntry(entry, references, profiles) {
  if (!entry?.data) return entry;
  invariant(
    !Object.hasOwn(entry, "vehicleReferenceId") &&
      !Object.hasOwn(entry, "vehicleReferenceRef"),
    "expanded variant contains a compact reference",
  );
  const id = referenceId(entry.data);
  const projection = compactReferenceData(entry.data, profiles);
  const existing = references.get(id);
  invariant(
    !existing ||
      JSON.stringify(stable(existing)) ===
        JSON.stringify(stable(projection)),
    `${id} content collision`,
  );
  references.set(id, projection);
  const withoutData = { ...entry };
  delete withoutData.data;
  return {
    ...withoutData,
    vehicleReferenceId: id,
  };
}

export function compactPublicFactionCatalog(document) {
  invariant(
    document &&
      typeof document === "object" &&
      Array.isArray(document.records),
    "document records are missing",
  );
  invariant(
    document.vehicleReferenceSchemaVersion === undefined &&
      document.vehicleReferences === undefined &&
      document.vehicleProfiles === undefined,
    "document is already compact",
  );
  const references = new Map();
  const profiles = {
    general: createProfilePool(),
    seats: createProfilePool(),
    damageResistances: createProfilePool(),
    components: createProfilePool(),
  };
  const compactRecords = document.records.map((record) => {
    const { data, ...withoutData } = record;
    invariant(
      data === null || data === undefined,
      `${record?.promoEntryId ?? "record"} must store data on exact variants`,
    );
    void data;
    return {
      ...withoutData,
      data: null,
      variants: (record.variants ?? []).map((variant) =>
        compactEntry(variant, references, profiles),
      ),
    };
  });
  const vehicleProfiles = {
    general: profiles.general.pool(),
    seats: profiles.seats.pool(),
    damageResistances: profiles.damageResistances.pool(),
    components: profiles.components.pool(),
  };
  const sortedReferences = [...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"));
  const referenceIndexById = new Map(
    sortedReferences.map(([id], index) => [id, index]),
  );
  const referenceValues = sortedReferences.map(
    ([, projection]) => projection,
  );
  const bindingTriples = [];
  const records = compactRecords.map((record) => {
    invariant(
      typeof record?.promoEntryId === "string" &&
        record.promoEntryId.length > 0 &&
        Array.isArray(record.variants),
      "compact record identity is invalid",
    );
    return {
      ...record,
      variants: record.variants.map((variant) => {
        const referenceIndex = referenceIndexById.get(
          variant.vehicleReferenceId,
        );
        invariant(
          Number.isSafeInteger(referenceIndex) &&
            typeof variant.sourceRawName === "string" &&
            variant.sourceRawName.length > 0,
          `${record.promoEntryId} variant reference is invalid`,
        );
        const {
          vehicleReferenceId: _vehicleReferenceId,
          ...withoutReference
        } = variant;
        void _vehicleReferenceId;
        bindingTriples.push([
          record.promoEntryId,
          variant.sourceRawName,
          referenceIndex,
        ]);
        return {
          ...withoutReference,
          vehicleReferenceRef: referenceIndex,
        };
      }),
    };
  });
  return {
    ...document,
    vehicleReferenceSchemaVersion:
      PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
    vehicleProfiles,
    vehicleReferences: {
      id: referenceGraphId(
        vehicleProfiles,
        referenceValues,
        bindingTriples,
      ),
      values: referenceValues,
    },
    records,
  };
}

function publicFactionDigest(domain, value) {
  return createHash("sha256")
    .update(domain)
    .update(JSON.stringify(stable(value)))
    .digest("base64url");
}

export function inflatePublicFactionCatalog(document) {
  return assertPreparedPublicFactionDigests(
    preparePublicFactionCatalogInflation(document),
    publicFactionDigest,
  );
}
export function publicFactionReferenceDataNodes(document) {
  const hydrated = inflatePublicFactionCatalog(document);
  return (hydrated.records ?? []).flatMap((record) => [
    ...(record.data ? [record.data] : []),
    ...(record.variants ?? []).flatMap((variant) =>
      variant.data ? [variant.data] : [],
    ),
  ]);
}

export function recompactPublicFactionCatalog(document) {
  const hydrated = inflatePublicFactionCatalog(document);
  const {
    vehicleReferenceSchemaVersion: _schemaVersion,
    vehicleProfiles: _profiles,
    vehicleReferences: _references,
    ...withoutReferences
  } = hydrated;
  void _schemaVersion;
  void _profiles;
  void _references;
  return compactPublicFactionCatalog(withoutReferences);
}
