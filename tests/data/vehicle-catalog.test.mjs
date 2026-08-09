import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createVehicleCatalogResolver,
  validateVehicleCatalog,
} from "../../lib/vehicle-catalog.mjs";
import {
  inflatePublicFactionCatalog,
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
} from "../../lib/public-faction-catalog.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CATALOG_PATH = path.join(
  ROOT,
  "generated",
  "internal",
  "vehicle-catalog.json",
);
const catalogBytes = await readFile(CATALOG_PATH);
const catalog = validateVehicleCatalog(
  JSON.parse(catalogBytes.toString("utf8")),
);
const resolver = createVehicleCatalogResolver(catalog);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function revision(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function updateCatalogRevision(document) {
  const {
    catalogRevision: _catalogRevision,
    ...withoutRevision
  } = document;
  void _catalogRevision;
  document.catalogRevision = revision(withoutRevision);
}

test("vehicle v3.1 is a deterministic closed 470/604/471 identity graph", () => {
  assert.equal(catalog.schemaVersion, "sigua-vehicle-catalog/v3.1");
  assert.equal(catalog.counts.sourceVehicles, 470);
  assert.equal(catalog.counts.coreCatalogBindings, 604);
  assert.equal(catalog.counts.runtimeVehicles, 471);
  assert.equal(catalog.counts.hitArtifacts, 471);
  assert.equal(catalog.counts.visualArtifacts, 861);
  assert.equal(catalog.counts.supportAirCards, 36);
  assert.equal(catalog.counts.supportAirBindings, 44);
  assert.equal(catalog.counts.totalPublicBindings, 648);
  assert.equal(catalog.counts.weaponBindingReferences, 1374);
  assert.deepEqual(Object.keys(catalog.dataRevision), [
    "weaponCatalog",
  ]);
  assert.match(
    catalog.dataRevision.weaponCatalog,
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(
    catalog.catalogRevision,
    revision(
      Object.fromEntries(
        Object.entries(catalog).filter(
          ([key]) => key !== "catalogRevision",
        ),
      ),
    ),
  );
  assert.equal(catalog.audit.referenceClosure, true);
  assert.equal(catalog.audit.runtimeBindingClosure, true);
  assert.equal(catalog.audit.noEmbeddedHitTopology, true);
  assert.equal(catalog.audit.visualArtifactClosure, true);
});

test("vehicle validator owns the catalog revision trust boundary", () => {
  const document = structuredClone(catalog);
  document.counts.weaponBindingReferences += 1;
  assert.throws(
    () => validateVehicleCatalog(document),
    /catalogRevision content digest drifted/u,
  );

  const legacyPartition = structuredClone(catalog);
  legacyPartition.dataRevision.physical =
    "0".repeat(64);
  updateCatalogRevision(legacyPartition);
  assert.throws(
    () => validateVehicleCatalog(legacyPartition),
    /dataRevision must contain only/u,
  );
});

test("470 readable source files own the exact Blueprint reference data", () => {
  const sourceLocks = catalog.evidenceSources.filter(
    ({ role }) =>
      role === "exact-blueprint-vehicle-authoring-source",
  );
  assert.equal(sourceLocks.length, 470);
  assert.ok(
    sourceLocks.some(
      ({ path: sourcePath }) =>
        sourcePath ===
        "data/vehicles/M1128_MGS/BP_M1128.json",
    ),
  );
  assert.ok(
    sourceLocks.some(
      ({ path: sourcePath }) =>
        sourcePath ===
        "data/vehicles/M1128_MGS/BP_M1128_Woodland.json",
    ),
  );
});

test("runtime identity remains binding-scoped where one raw name has two records", () => {
  const multiRuntimeVehicles =
    catalog.identities.vehicles.filter(
      ({ runtimeVehicleRefs }) => runtimeVehicleRefs.length > 1,
    );
  assert.deepEqual(
    multiRuntimeVehicles.map(({ rawName }) => rawName),
    ["BP_CSK131_HJ-8ATGM_Naval"],
  );
  assert.equal(
    multiRuntimeVehicles[0].runtimeVehicleRefs.length,
    2,
  );
});

test("edition-specific visual artifacts close every public binding", () => {
  const artifactById = new Map(
    catalog.runtime.visualArtifacts.map((artifact) => [
      artifact.id,
      artifact,
    ]),
  );
  let chinaBindings = 0;
  for (const binding of catalog.identities.catalogBindings) {
    const international = artifactById.get(
      binding.visualArtifactRefs.international,
    );
    assert.equal(international.edition, "international");
    assert.equal(international.bindingKey, binding.bindingKey);
    assert.equal(
      international.runtimeVehicleRef,
      binding.runtimeVehicleRef,
    );
    if (binding.visualArtifactRefs.china) {
      chinaBindings += 1;
      const china = artifactById.get(
        binding.visualArtifactRefs.china,
      );
      assert.equal(china.edition, "china");
      assert.equal(china.bindingKey, binding.bindingKey);
      assert.equal(
        china.runtimeVehicleRef,
        binding.runtimeVehicleRef,
      );
    }
  }
  assert.equal(chinaBindings, 213);
  for (const binding of catalog.extensions.supportAir.bindings) {
    const artifact = artifactById.get(
      binding.visualArtifactRefs.international,
    );
    assert.equal(artifact.edition, "international");
    assert.equal(artifact.bindingKey, binding.bindingKey);
    assert.equal(artifact.generatedClass, binding.generatedClass);
  }
});

test("vehicle, runtime, and catalog indexes reject non-closed graph mutations", async (t) => {
  const binding = catalog.identities.catalogBindings[0];
  const vehicle = catalog.identities.vehicles.find(
    ({ id }) => id === binding.vehicleRef,
  );
  const runtimeVehicle = catalog.runtime.vehicles.find(
    ({ id }) => id === binding.runtimeVehicleRef,
  );
  const otherBinding = catalog.identities.catalogBindings.find(
    (candidate) =>
      candidate.vehicleRef !== binding.vehicleRef &&
      candidate.runtimeVehicleRef !== binding.runtimeVehicleRef &&
      candidate.cardId !== binding.cardId,
  );
  assert.ok(vehicle);
  assert.ok(runtimeVehicle);
  assert.ok(otherBinding);

  const mutations = [
    [
      "binding vehicleRef must agree with vehicle.runtimeVehicleRefs",
      (document) => {
        document.identities.catalogBindings[0].vehicleRef =
          otherBinding.vehicleRef;
      },
    ],
    [
      "binding runtimeVehicleRef must agree with both reverse edges",
      (document) => {
        document.identities.catalogBindings[0].runtimeVehicleRef =
          otherBinding.runtimeVehicleRef;
      },
    ],
    [
      "binding visual artifact ref cannot point at another exact vehicle",
      (document) => {
        document.identities.catalogBindings[0]
          .visualArtifactRefs.international =
          otherBinding.visualArtifactRefs.international;
      },
    ],
    [
      "vehicle runtime refs cannot omit an expected edge",
      (document) => {
        const target = document.identities.vehicles.find(
          ({ id }) => id === binding.vehicleRef,
        );
        target.runtimeVehicleRefs = target.runtimeVehicleRefs.filter(
          (id) => id !== binding.runtimeVehicleRef,
        );
      },
    ],
    [
      "vehicle runtime refs cannot contain duplicate edges",
      (document) => {
        const target = document.identities.vehicles.find(
          ({ id }) => id === binding.vehicleRef,
        );
        target.runtimeVehicleRefs.push(binding.runtimeVehicleRef);
      },
    ],
    [
      "vehicle runtime refs cannot contain an unrelated valid edge",
      (document) => {
        const target = document.identities.vehicles.find(
          ({ id }) => id === binding.vehicleRef,
        );
        target.runtimeVehicleRefs.push(
          otherBinding.runtimeVehicleRef,
        );
      },
    ],
    [
      "runtime binding refs cannot omit an expected edge",
      (document) => {
        const target = document.runtime.vehicles.find(
          ({ id }) => id === binding.runtimeVehicleRef,
        );
        target.catalogBindingRefs =
          target.catalogBindingRefs.filter(
            (id) => id !== binding.id,
          );
      },
    ],
    [
      "runtime binding refs cannot contain duplicate edges",
      (document) => {
        const target = document.runtime.vehicles.find(
          ({ id }) => id === binding.runtimeVehicleRef,
        );
        target.catalogBindingRefs.push(binding.id);
      },
    ],
    [
      "runtime binding refs cannot contain an unrelated valid edge",
      (document) => {
        const target = document.runtime.vehicles.find(
          ({ id }) => id === binding.runtimeVehicleRef,
        );
        target.catalogBindingRefs.push(otherBinding.id);
      },
    ],
    [
      "binding-key index cannot omit a binding",
      (document) => {
        delete document.indexes.bindingKeyCatalogRefs[
          binding.bindingKey
        ];
      },
    ],
    [
      "binding-key index cannot add an extra key",
      (document) => {
        document.indexes.bindingKeyCatalogRefs.unexpected =
          binding.id;
      },
    ],
    [
      "binding-key index cannot duplicate a binding ref",
      (document) => {
        document.indexes.bindingKeyCatalogRefs[
          otherBinding.bindingKey
        ] = binding.id;
      },
    ],
    [
      "binding-key index cannot swap otherwise valid refs",
      (document) => {
        document.indexes.bindingKeyCatalogRefs[
          binding.bindingKey
        ] = otherBinding.id;
        document.indexes.bindingKeyCatalogRefs[
          otherBinding.bindingKey
        ] = binding.id;
      },
    ],
    [
      "card index cannot omit a binding",
      (document) => {
        document.indexes.cardCatalogRefs[binding.cardId] =
          document.indexes.cardCatalogRefs[
            binding.cardId
          ].filter((id) => id !== binding.id);
      },
    ],
    [
      "card index cannot contain duplicate bindings",
      (document) => {
        document.indexes.cardCatalogRefs[binding.cardId].push(
          binding.id,
        );
      },
    ],
    [
      "card index cannot swap otherwise valid bindings",
      (document) => {
        const bindingIndex =
          document.indexes.cardCatalogRefs[
            binding.cardId
          ].indexOf(binding.id);
        const otherBindingIndex =
          document.indexes.cardCatalogRefs[
            otherBinding.cardId
          ].indexOf(otherBinding.id);
        document.indexes.cardCatalogRefs[binding.cardId][
          bindingIndex
        ] = otherBinding.id;
        document.indexes.cardCatalogRefs[otherBinding.cardId][
          otherBindingIndex
        ] = binding.id;
      },
    ],
    [
      "card index cannot add an extra card",
      (document) => {
        document.indexes.cardCatalogRefs.unexpected = [];
      },
    ],
  ];

  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const document = structuredClone(catalog);
      mutate(document);
      updateCatalogRevision(document);
      assert.throws(
        () => validateVehicleCatalog(document),
        /Invalid vehicle catalog:/u,
      );
    });
  }
});

test("profile pools reject re-signed malformed canonical graphs", () => {
  const pools = [
    {
      key: "general",
      countKey: "generalProfiles",
      prefix: "vehicle-general",
    },
    {
      key: "seats",
      countKey: "seatProfiles",
      prefix: "vehicle-seat",
    },
    {
      key: "damageResistances",
      countKey: "damageResistanceProfiles",
      prefix: "vehicle-damage-resistance",
    },
    {
      key: "components",
      countKey: "componentProfiles",
      prefix: "vehicle-component",
    },
  ];

  for (const { key, countKey, prefix } of pools) {
    const staleRevision = structuredClone(catalog);
    staleRevision.profiles[key][0].value.__testMutation = key;
    updateCatalogRevision(staleRevision);
    assert.throws(
      () => validateVehicleCatalog(staleRevision),
      /content revision drifted/u,
      `${key} accepted a stale content revision`,
    );

    const staleId = structuredClone(catalog);
    staleId.profiles[key][0].id =
      `${prefix}-000000000000000000000000`;
    updateCatalogRevision(staleId);
    assert.throws(
      () => validateVehicleCatalog(staleId),
      /content-addressed id drifted/u,
      `${key} accepted a stale content-addressed id`,
    );

    const countDrift = structuredClone(catalog);
    countDrift.counts[countKey] += 1;
    updateCatalogRevision(countDrift);
    assert.throws(
      () => validateVehicleCatalog(countDrift),
      /profile count drifted/u,
      `${key} accepted a drifted profile count`,
    );

    const orphan = structuredClone(catalog);
    const orphanValue = structuredClone(
      orphan.profiles[key][0].value,
    );
    orphanValue.__testOrphan = key;
    const orphanRevision = revision(orphanValue);
    orphan.profiles[key].push({
      id: `${prefix}-${orphanRevision.slice(0, 24)}`,
      revision: orphanRevision,
      value: orphanValue,
    });
    orphan.counts[countKey] += 1;
    updateCatalogRevision(orphan);
    assert.throws(
      () => validateVehicleCatalog(orphan),
      /profile references does not exactly match the profile pool/u,
      `${key} accepted an orphan profile`,
    );
  }
});

test("all compact public core variants resolve byte-deep-equivalent v3 reference data", async () => {
  const factionRoot = path.join(
    ROOT,
    "public",
    "catalog-data",
    "factions",
  );
  const files = (await readdir(factionRoot))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "en"));
  let coreBindings = 0;
  let supportBindings = 0;
  for (const fileName of files) {
    const wire = JSON.parse(
      await readFile(path.join(factionRoot, fileName), "utf8"),
    );
    assert.equal(
      wire.vehicleReferenceSchemaVersion,
      PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
    );
    assert.equal(
      wire.vehicleCatalogRevision,
      catalog.catalogRevision,
    );
    assert.ok(
      wire.records.every((record) =>
        record.variants.every(
          (variant) =>
            !Object.hasOwn(variant, "data") &&
            Number.isSafeInteger(variant.vehicleReferenceRef) &&
            variant.vehicleReferenceRef >= 0 &&
            typeof variant.visualArtifactRef === "string",
        ),
      ),
    );
    const hydrated = inflatePublicFactionCatalog(wire);
    for (const record of hydrated.records) {
      for (const variant of record.variants) {
        const binding = resolver.binding(
          record.promoEntryId,
          variant.sourceRawName,
        );
        if (!binding) {
          supportBindings += 1;
          assert.equal(variant.catalogBindingRef, null);
          assert.equal(variant.vehicleRef, null);
          assert.equal(variant.runtimeVehicleRef, null);
          assert.equal(
            variant.visualArtifactRef,
            catalog.extensions.supportAir.bindings.find(
              (candidate) =>
                candidate.bindingKey ===
                `${record.promoEntryId}\u0000${variant.sourceRawName}`,
            ).visualArtifactRefs.international,
          );
          continue;
        }
        coreBindings += 1;
        assert.equal(variant.catalogBindingRef, binding.id);
        assert.equal(variant.vehicleRef, binding.vehicleRef);
        assert.equal(
          variant.runtimeVehicleRef,
          binding.runtimeVehicleRef,
        );
        assert.equal(
          variant.visualArtifactRef,
          binding.visualArtifactRefs.international,
        );
        assert.deepEqual(
          variant.data,
          resolver.referenceData(
            record.promoEntryId,
            variant.sourceRawName,
          ),
          `${record.promoEntryId}/${variant.sourceRawName}`,
        );
      }
    }
  }
  assert.equal(files.length, 17);
  assert.equal(coreBindings, 604);
  assert.equal(supportBindings, 44);
});

test("content-addressed profiles reduce repeated reference objects without semantic merging", () => {
  assert.ok(catalog.counts.generalProfiles < 470);
  assert.ok(catalog.counts.seatProfiles < 4239);
  assert.ok(catalog.counts.damageResistanceProfiles < 3255);
  assert.ok(catalog.counts.componentProfiles < 2222);
  for (const [prefix, records] of [
    ["vehicle-general", catalog.profiles.general],
    ["vehicle-seat", catalog.profiles.seats],
    [
      "vehicle-damage-resistance",
      catalog.profiles.damageResistances,
    ],
    ["vehicle-component", catalog.profiles.components],
  ]) {
    for (const record of records) {
      assert.equal(record.revision, revision(record.value));
      assert.equal(
        record.id,
        `${prefix}-${record.revision.slice(0, 24)}`,
      );
    }
  }
});
