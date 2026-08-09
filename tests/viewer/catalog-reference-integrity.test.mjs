import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compactPublicFactionCatalog,
} from "../../lib/public-faction-catalog.mjs";
import {
  PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
} from "../../lib/public-faction-reference-graph.mjs";
import {
  parseFactionCatalog,
} from "../../app/parse-faction-catalog.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const sourceDocument = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      "public",
      "catalog-data",
      "factions",
      "usa.json",
    ),
    "utf8",
  ),
);
const sourceIndex = JSON.parse(
  await readFile(
    path.join(ROOT, "generated", "catalog-index.json"),
    "utf8",
  ),
);
const chinaSourceIndex = JSON.parse(
  await readFile(
    path.join(ROOT, "generated", "china-catalog-index.json"),
    "utf8",
  ),
);
const vehicleCatalogSpecification = await readFile(
  path.join(ROOT, "docs", "specs", "vehicle-catalog-v3.md"),
  "utf8",
);

function parse(document) {
  return parseFactionCatalog(
    document,
    sourceIndex,
    sourceDocument.group.id,
  );
}

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

test("browser and generator agree on the current graph preimage", async () => {
  const group = {
    id: "test",
    name: "Test",
    order: 0,
    recordCount: 1,
  };
  const official = {
    groupId: "test",
    groupNameZh: "Test",
    nameZh: "Test vehicle",
    typeZh: "Test",
  };
  const compact = compactPublicFactionCatalog({
    schemaVersion: "1.0.0",
    catalogId: "catalog-test",
    dataRevision: "catalog-test-revision",
    vehicleCatalogRevision: "0".repeat(64),
    group,
    records: [
      {
        promoEntryId: "test-card",
        promotionOrder: 1,
        official,
        mapping: {
          selectedRawName: "BP_Test",
        },
        data: null,
        variants: [
          {
            sourceRawName: "BP_Test",
            catalogBindingRef: null,
            vehicleRef: null,
            runtimeVehicleRef: null,
            visualArtifactRef: null,
            alias: "",
            data: {
              general: {
                rawName: "BP_Test",
                displayName: "Test vehicle",
              },
              weaponBindingIds: [],
              seats: [],
              damageResistances: [],
              components: [],
            },
          },
        ],
      },
    ],
  });
  const index = {
    schemaVersion: "1.0.0",
    catalogId: compact.catalogId,
    dataRevision: compact.dataRevision,
    vehicleCatalogRevision: compact.vehicleCatalogRevision,
    groups: [group],
    records: [
      {
        promoEntryId: "test-card",
        promotionOrder: 1,
        official,
        selectedRawName: "BP_Test",
        variants: [
          {
            sourceRawName: "BP_Test",
            catalogBindingRef: null,
            vehicleRef: null,
            runtimeVehicleRef: null,
            visualArtifactRef: null,
          },
        ],
      },
    ],
  };
  const hydrated = await parseFactionCatalog(
    compact,
    index,
    group.id,
  );
  assert.equal(
    hydrated.records[0].variants[0].data.general.rawName,
    "BP_Test",
  );
});

test("browser accepts a generator-produced local vehicle reference graph", async () => {
  const hydrated = await parse(structuredClone(sourceDocument));
  assert.equal(hydrated.group.id, "usa");
  assert.equal(
    hydrated.records.length,
    sourceDocument.group.recordCount,
  );
  assert.ok(
    hydrated.records.every((record) =>
      record.variants.every(
        (variant) =>
          variant.data.general.rawName === variant.sourceRawName,
      ),
    ),
  );
});

test("browser accepts every published international and China faction graph", async () => {
  let factionDocumentCount = 0;
  for (const [edition, index, relativeDirectory] of [
    ["international", sourceIndex, ["catalog-data", "factions"]],
    [
      "China",
      chinaSourceIndex,
      ["catalog-data", "china", "factions"],
    ],
  ]) {
    for (const group of index.groups) {
      const document = JSON.parse(
        await readFile(
          path.join(
            ROOT,
            "public",
            ...relativeDirectory,
            `${group.id}.json`,
          ),
          "utf8",
        ),
      );
      factionDocumentCount += 1;
      assert.equal(
        document.vehicleReferenceSchemaVersion,
        PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
        `${edition}/${group.id}`,
      );
      const hydrated = await parseFactionCatalog(
        document,
        index,
        group.id,
      );
      assert.equal(
        hydrated.records.length,
        group.recordCount,
        `${edition}/${group.id}`,
      );
    }
  }
  assert.equal(factionDocumentCount, 22);
});

test("the catalog specification declares the published projection schema", () => {
  const declaration = vehicleCatalogSpecification.match(
    /^- 公开资料投影：`([^`]+)`$/mu,
  );
  assert.ok(declaration);
  assert.equal(
    declaration[1],
    PUBLIC_VEHICLE_REFERENCE_SCHEMA_VERSION,
  );
});

test("browser rejects same-rawName reference with mutated weapon bindings", async () => {
  const document = structuredClone(sourceDocument);
  const reference = document.vehicleReferences.values.find(
    ({ weaponBindingIds }) => weaponBindingIds.length > 0,
  );
  assert.ok(reference);
  const rawName = reference.rawName;
  reference.weaponBindingIds.push(
    "weapon-binding-tampered-reference",
  );
  assert.equal(reference.rawName, rawName);

  await assert.rejects(
    () => parse(document),
    /vehicle reference graph digest drifted/u,
  );
});

test("browser rejects mutated, missing, and unused vehicle profiles", async (t) => {
  await t.test("mutated profile content", async () => {
    const document = structuredClone(sourceDocument);
    document.vehicleProfiles.general.values[0].details =
      "tampered profile";
    await assert.rejects(
      () => parse(document),
      /general profile pool is invalid/u,
    );
  });

  await t.test("re-signed profile content", async () => {
    const document = structuredClone(sourceDocument);
    document.vehicleProfiles.general.values[0].details =
      "tampered and re-signed profile";
    document.vehicleProfiles.general.id = createHash("sha256")
      .update(
        JSON.stringify(
          stable(document.vehicleProfiles.general.values),
        ),
      )
      .digest("base64url");
    await assert.rejects(
      () => parse(document),
      /vehicle reference graph digest drifted/u,
    );
  });

  await t.test("missing profile reference", async () => {
    const document = structuredClone(sourceDocument);
    document.vehicleReferences.values[0].generalProfileRef = -1;
    await assert.rejects(
      () => parse(document),
      /vehicle reference identity is invalid/u,
    );
  });

  await t.test("unused profile", async () => {
    const document = structuredClone(sourceDocument);
    const useCounts = new Map();
    for (const reference of document.vehicleReferences.values) {
      useCounts.set(
        reference.generalProfileRef,
        (useCounts.get(reference.generalProfileRef) ?? 0) + 1,
      );
    }
    const target = document.vehicleReferences.values.find(
      (reference) =>
        useCounts.get(reference.generalProfileRef) === 1,
    );
    const replacement = document.vehicleReferences.values.find(
      (reference) =>
        reference.generalProfileRef !== target?.generalProfileRef,
    );
    assert.ok(target);
    assert.ok(replacement);
    target.generalProfileRef = replacement.generalProfileRef;
    await assert.rejects(
      () => parse(document),
      /general profile pool contains unused entries/u,
    );
  });

  await t.test("reordered profile pool", async () => {
    const document = structuredClone(sourceDocument);
    const [first, second] =
      document.vehicleProfiles.general.values;
    assert.ok(first);
    assert.ok(second);
    document.vehicleProfiles.general.values[0] = second;
    document.vehicleProfiles.general.values[1] = first;
    await assert.rejects(
      () => parse(document),
      /general profile pool is invalid/u,
    );
  });

  await t.test("inline reference value bypass", async () => {
    const document = structuredClone(sourceDocument);
    document.vehicleReferences.values[0].value = {
      general: {
        rawName: document.vehicleReferences.values[0].rawName,
      },
    };
    await assert.rejects(
      () => parse(document),
      /vehicle reference identity is invalid/u,
    );
  });
});

test("browser rejects reordered reference values and valid integer cross-wiring", async (t) => {
  await t.test("reordered reference values", async () => {
    const document = structuredClone(sourceDocument);
    const [first, second] = document.vehicleReferences.values;
    assert.ok(first);
    assert.ok(second);
    document.vehicleReferences.values[0] = second;
    document.vehicleReferences.values[1] = first;
    await assert.rejects(
      () => parse(document),
      /vehicle reference graph digest drifted/u,
    );
  });

  await t.test("valid integer refs swapped between variants", async () => {
    const document = structuredClone(sourceDocument);
    const variants = document.records.flatMap(
      (record) => record.variants,
    );
    const firstIndex = variants.findIndex(
      (variant) => Number.isSafeInteger(variant.vehicleReferenceRef),
    );
    const secondIndex = variants.findIndex(
      (variant, index) =>
        index > firstIndex &&
        Number.isSafeInteger(variant.vehicleReferenceRef) &&
        variant.vehicleReferenceRef !==
          variants[firstIndex]?.vehicleReferenceRef,
    );
    assert.ok(firstIndex >= 0);
    assert.ok(secondIndex > firstIndex);
    const firstRef = variants[firstIndex].vehicleReferenceRef;
    variants[firstIndex].vehicleReferenceRef =
      variants[secondIndex].vehicleReferenceRef;
    variants[secondIndex].vehicleReferenceRef = firstRef;
    await assert.rejects(
      () => parse(document),
      /vehicle reference graph digest drifted/u,
    );
  });
});

test("browser rejects a valid-looking canonical ref swapped between variants", async () => {
  const document = structuredClone(sourceDocument);
  const variants = document.records.flatMap((record) => record.variants);
  const canonical = variants.filter(
    (variant) => variant.catalogBindingRef !== null,
  );
  assert.ok(canonical.length > 1);
  canonical[0].catalogBindingRef = canonical[1].catalogBindingRef;

  await assert.rejects(
    () => parse(document),
    /阵营载具资料引用不匹配/u,
  );
});

test("browser rejects inline record data outside the compact reference table", async () => {
  const document = structuredClone(sourceDocument);
  document.records[0].data = {};

  await assert.rejects(
    () => parse(document),
    /compact record must use variant references only/u,
  );
});
