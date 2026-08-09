import { createHash } from "node:crypto";

export const VEHICLE_CATALOG_SCHEMA_VERSION =
  "sigua-vehicle-catalog/v3.1";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid vehicle catalog: ${message}`);
  }
}

function uniqueIds(records, label) {
  invariant(Array.isArray(records), `${label} must be an array`);
  const ids = records.map((record) => record?.id);
  invariant(
    ids.every((id) => typeof id === "string" && id.length > 0),
    `${label} ids must be non-empty`,
  );
  invariant(new Set(ids).size === ids.length, `${label} ids are not unique`);
  return new Set(ids);
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

function revision(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function validateProfilePool(records, prefix, label) {
  const ids = uniqueIds(records, label);
  for (const record of records) {
    invariant(
      Object.hasOwn(record, "value"),
      `${record.id} has no profile value`,
    );
    const expectedRevision = revision(record.value);
    invariant(
      record.revision === expectedRevision,
      `${record.id} content revision drifted`,
    );
    invariant(
      record.id ===
        `${prefix}-${expectedRevision.slice(0, 24)}`,
      `${record.id} content-addressed id drifted`,
    );
  }
  return ids;
}

function exactIdSet(actual, expected, label) {
  invariant(
    actual.size === expected.size &&
      [...expected].every((id) => actual.has(id)),
    `${label} does not exactly match the profile pool`,
  );
}

function exactStringRefs(actualValues, expectedValues, label) {
  invariant(Array.isArray(actualValues), `${label} must be an array`);
  invariant(
    actualValues.every(
      (value) => typeof value === "string" && value.length > 0,
    ),
    `${label} contains an invalid reference`,
  );
  const actual = new Set(actualValues);
  invariant(
    actual.size === actualValues.length,
    `${label} contains duplicate references`,
  );
  const expected = new Set(expectedValues);
  invariant(
    actual.size === expected.size &&
      [...expected].every((value) => actual.has(value)),
    `${label} does not exactly match the binding graph`,
  );
  return actual;
}

export function validateVehicleCatalog(document) {
  invariant(
    document?.schemaVersion === VEHICLE_CATALOG_SCHEMA_VERSION,
    `schema is ${document?.schemaVersion ?? "missing"}`,
  );
  invariant(
    typeof document.catalogRevision === "string" &&
      /^[a-f0-9]{64}$/u.test(document.catalogRevision),
    "catalogRevision is invalid",
  );
  invariant(
    document.dataRevision &&
      typeof document.dataRevision === "object" &&
      !Array.isArray(document.dataRevision) &&
      Object.keys(document.dataRevision).join("\n") ===
        "weaponCatalog" &&
      typeof document.dataRevision.weaponCatalog === "string" &&
      /^[a-f0-9]{64}$/u.test(
        document.dataRevision.weaponCatalog,
      ),
    "dataRevision must contain only the consumed weapon catalog revision",
  );
  const documentWithoutRevision = { ...document };
  Reflect.deleteProperty(
    documentWithoutRevision,
    "catalogRevision",
  );
  invariant(
    document.catalogRevision ===
      revision(documentWithoutRevision),
    "catalogRevision content digest drifted",
  );
  invariant(
    typeof document.sourceBuildId === "string" &&
      document.sourceBuildId.length > 0,
    "sourceBuildId is missing",
  );
  invariant(
    document.identities &&
      document.profiles &&
      document.runtime &&
      document.extensions &&
      document.indexes &&
      document.audit,
    "top-level graph partitions are incomplete",
  );
  invariant(
    Array.isArray(document.evidenceSources) &&
      document.evidenceSources.length > 0,
    "evidence sources are missing",
  );
  const evidencePaths = new Set();
  for (const source of document.evidenceSources) {
    invariant(
      typeof source?.path === "string" &&
        source.path.length > 0 &&
        !evidencePaths.has(source.path) &&
        source.byteEncoding === "utf8-lf" &&
        Number.isInteger(source.bytes) &&
        source.bytes > 0 &&
        /^[a-f0-9]{64}$/u.test(source.sha256),
      "evidence source lock is invalid",
    );
    evidencePaths.add(source.path);
  }

  const vehicleIds = uniqueIds(
    document.identities.vehicles,
    "vehicle identities",
  );
  const bindingIds = uniqueIds(
    document.identities.catalogBindings,
    "catalog bindings",
  );
  const generalProfileIds = validateProfilePool(
    document.profiles.general,
    "vehicle-general",
    "general profiles",
  );
  const seatProfileIds = validateProfilePool(
    document.profiles.seats,
    "vehicle-seat",
    "seat profiles",
  );
  const damageProfileIds = validateProfilePool(
    document.profiles.damageResistances,
    "vehicle-damage-resistance",
    "damage profiles",
  );
  const componentProfileIds = validateProfilePool(
    document.profiles.components,
    "vehicle-component",
    "component profiles",
  );
  const runtimeVehicleIds = uniqueIds(
    document.runtime.vehicles,
    "runtime vehicles",
  );
  const artifactIds = uniqueIds(
    document.runtime.hitArtifacts,
    "hit artifacts",
  );
  const visualArtifactIds = uniqueIds(
    document.runtime.visualArtifacts,
    "visual artifacts",
  );
  const supportBindingIds = uniqueIds(
    document.extensions.supportAir.bindings,
    "support-air bindings",
  );

  invariant(
    document.counts.sourceVehicles === vehicleIds.size,
    "source vehicle count drifted",
  );
  invariant(
    document.counts.coreCatalogBindings === bindingIds.size,
    "core binding count drifted",
  );
  invariant(
    document.counts.runtimeVehicles === runtimeVehicleIds.size,
    "runtime vehicle count drifted",
  );
  invariant(
    document.counts.generalProfiles === generalProfileIds.size,
    "general profile count drifted",
  );
  invariant(
    document.counts.seatProfiles === seatProfileIds.size,
    "seat profile count drifted",
  );
  invariant(
    document.counts.damageResistanceProfiles ===
      damageProfileIds.size,
    "damage profile count drifted",
  );
  invariant(
    document.counts.componentProfiles ===
      componentProfileIds.size,
    "component profile count drifted",
  );
  invariant(
    document.counts.hitArtifacts === artifactIds.size,
    "hit artifact count drifted",
  );
  invariant(
    document.counts.visualArtifacts === visualArtifactIds.size,
    "visual artifact count drifted",
  );
  invariant(
    document.counts.supportAirBindings === supportBindingIds.size,
    "support-air binding count drifted",
  );
  invariant(
    document.counts.totalPublicBindings ===
      bindingIds.size + supportBindingIds.size,
    "total public binding count drifted",
  );

  const vehicleById = new Map(
    document.identities.vehicles.map((vehicle) => [
      vehicle.id,
      vehicle,
    ]),
  );
  const bindingById = new Map(
    document.identities.catalogBindings.map((binding) => [
      binding.id,
      binding,
    ]),
  );
  const runtimeById = new Map(
    document.runtime.vehicles.map((vehicle) => [
      vehicle.id,
      vehicle,
    ]),
  );
  const artifactById = new Map(
    document.runtime.hitArtifacts.map((artifact) => [
      artifact.id,
      artifact,
    ]),
  );
  const visualArtifactById = new Map(
    document.runtime.visualArtifacts.map((artifact) => [
      artifact.id,
      artifact,
    ]),
  );
  const usedVisualArtifactIds = new Set();
  for (const artifact of document.runtime.visualArtifacts) {
    invariant(
      /^visual-artifact-[a-f0-9]{64}$/u.test(artifact.id) &&
        (artifact.edition === "international" ||
          artifact.edition === "china") &&
        artifact.bindingKey ===
          `${artifact.cardId}\u0000${artifact.rawName}` &&
        /^vehicle-[a-f0-9]{64}$/u.test(
          artifact.runtimeVehicleRef,
        ) &&
        artifact.runtimeVehicleRef ===
          `vehicle-${artifact.identitySha256}` &&
        /^[a-f0-9]{64}$/u.test(artifact.packageSha256) &&
        typeof artifact.generatedClass === "string" &&
        artifact.generatedClass.length > 0 &&
        typeof artifact.status === "string" &&
        artifact.status.length > 0 &&
        typeof artifact.visualAcceptanceStatus === "string" &&
        artifact.visualAcceptanceStatus.length > 0 &&
        Number.isInteger(artifact.sourceAssets) &&
        artifact.sourceAssets > 0 &&
        Number.isInteger(artifact.totalBytes) &&
        artifact.totalBytes > 0 &&
        Number.isInteger(artifact.placementCount) &&
        artifact.placementCount > 0 &&
        evidencePaths.has(artifact.indexPath),
      `${artifact.id} visual artifact record is invalid`,
    );
  }
  const expectedRuntimeRefsByVehicle = new Map(
    [...vehicleIds].map((id) => [id, new Set()]),
  );
  const expectedBindingRefsByRuntime = new Map(
    [...runtimeVehicleIds].map((id) => [id, new Set()]),
  );
  const expectedBindingRefsByCard = new Map();
  const bindingKeys = new Set();
  const usedGeneralProfileIds = new Set();
  const usedSeatProfileIds = new Set();
  const usedDamageProfileIds = new Set();
  const usedComponentProfileIds = new Set();

  for (const binding of document.identities.catalogBindings) {
    invariant(
      vehicleById.has(binding.vehicleRef),
      `${binding.id} has no source vehicle`,
    );
    invariant(
      runtimeById.has(binding.runtimeVehicleRef),
      `${binding.id} has no runtime vehicle`,
    );
    invariant(
      binding.bindingKey === `${binding.cardId}\u0000${binding.rawName}`,
      `${binding.id} bindingKey drifted`,
    );
    invariant(
      binding.visualArtifactRefs &&
        typeof binding.visualArtifactRefs === "object" &&
        !Array.isArray(binding.visualArtifactRefs) &&
        typeof binding.visualArtifactRefs.international === "string",
      `${binding.id} visual artifact refs are missing`,
    );
    for (const [edition, visualArtifactRef] of Object.entries(
      binding.visualArtifactRefs,
    )) {
      invariant(
        edition === "international" || edition === "china",
        `${binding.id} has unsupported visual edition ${edition}`,
      );
      const visualArtifact = visualArtifactById.get(visualArtifactRef);
      invariant(
        visualArtifact &&
          visualArtifact.edition === edition &&
          visualArtifact.bindingKey === binding.bindingKey &&
          visualArtifact.runtimeVehicleRef ===
            binding.runtimeVehicleRef &&
          visualArtifact.generatedClass ===
            runtimeById.get(binding.runtimeVehicleRef)?.generatedClass,
        `${binding.id} has an invalid ${edition} visual artifact`,
      );
      usedVisualArtifactIds.add(visualArtifactRef);
    }
    invariant(
      !bindingKeys.has(binding.bindingKey),
      `${binding.id} bindingKey is duplicated`,
    );
    bindingKeys.add(binding.bindingKey);
    expectedRuntimeRefsByVehicle
      .get(binding.vehicleRef)
      .add(binding.runtimeVehicleRef);
    expectedBindingRefsByRuntime
      .get(binding.runtimeVehicleRef)
      .add(binding.id);
    const cardRefs =
      expectedBindingRefsByCard.get(binding.cardId) ?? new Set();
    cardRefs.add(binding.id);
    expectedBindingRefsByCard.set(binding.cardId, cardRefs);
  }

  for (const vehicle of document.identities.vehicles) {
    invariant(
      generalProfileIds.has(vehicle.generalProfileRef),
      `${vehicle.id} has no general profile`,
    );
    usedGeneralProfileIds.add(vehicle.generalProfileRef);
    invariant(
      Array.isArray(vehicle.seatProfileRefs) &&
        vehicle.seatProfileRefs.every((id) =>
          seatProfileIds.has(id),
        ),
      `${vehicle.id} has a missing seat profile`,
    );
    for (const id of vehicle.seatProfileRefs) {
      usedSeatProfileIds.add(id);
    }
    invariant(
      Array.isArray(vehicle.hullDamageProfileRefs) &&
        vehicle.hullDamageProfileRefs.every((id) =>
          damageProfileIds.has(id),
        ),
      `${vehicle.id} has a missing hull damage profile`,
    );
    for (const id of vehicle.hullDamageProfileRefs) {
      usedDamageProfileIds.add(id);
    }
    invariant(
      Array.isArray(vehicle.componentProfileRefs) &&
        vehicle.componentProfileRefs.every((id) =>
          componentProfileIds.has(id),
        ),
      `${vehicle.id} has a missing component profile`,
    );
    for (const id of vehicle.componentProfileRefs) {
      usedComponentProfileIds.add(id);
    }
    exactStringRefs(
      vehicle.runtimeVehicleRefs,
      expectedRuntimeRefsByVehicle.get(vehicle.id),
      `${vehicle.id} runtime vehicle refs`,
    );
  }

  for (const component of document.profiles.components) {
    invariant(
      Array.isArray(component.value?.damageProfileRefs) &&
        component.value.damageProfileRefs.every((id) =>
          damageProfileIds.has(id),
        ),
      `${component.id} has a missing damage profile`,
    );
    for (const id of component.value.damageProfileRefs) {
      usedDamageProfileIds.add(id);
    }
  }
  exactIdSet(
    usedGeneralProfileIds,
    generalProfileIds,
    "general profile references",
  );
  exactIdSet(
    usedSeatProfileIds,
    seatProfileIds,
    "seat profile references",
  );
  exactIdSet(
    usedDamageProfileIds,
    damageProfileIds,
    "damage profile references",
  );
  exactIdSet(
    usedComponentProfileIds,
    componentProfileIds,
    "component profile references",
  );

  for (const runtimeVehicle of document.runtime.vehicles) {
    invariant(
      artifactById.has(runtimeVehicle.hitArtifactRef),
      `${runtimeVehicle.id} has no hit artifact`,
    );
    exactStringRefs(
      runtimeVehicle.catalogBindingRefs,
      expectedBindingRefsByRuntime.get(runtimeVehicle.id),
      `${runtimeVehicle.id} catalog binding refs`,
    );
  }

  for (const binding of document.extensions.supportAir.bindings) {
    invariant(
      binding.visualArtifactRefs &&
        typeof binding.visualArtifactRefs === "object" &&
        !Array.isArray(binding.visualArtifactRefs) &&
        Object.keys(binding.visualArtifactRefs).length === 1 &&
        typeof binding.visualArtifactRefs.international === "string",
      `${binding.id} support visual artifact ref is missing`,
    );
    const visualArtifact = visualArtifactById.get(
      binding.visualArtifactRefs.international,
    );
    invariant(
      visualArtifact &&
        visualArtifact.edition === "international" &&
        visualArtifact.bindingKey === binding.bindingKey &&
        visualArtifact.generatedClass === binding.generatedClass,
      `${binding.id} has an invalid support visual artifact`,
    );
    usedVisualArtifactIds.add(
      binding.visualArtifactRefs.international,
    );
  }
  exactIdSet(
    usedVisualArtifactIds,
    visualArtifactIds,
    "visual artifact references",
  );

  invariant(
    Object.keys(document.indexes.rawNameVehicleRefs).length ===
      vehicleIds.size,
    "raw-name index count drifted",
  );
  for (const [rawName, vehicleRef] of Object.entries(
    document.indexes.rawNameVehicleRefs,
  )) {
    invariant(
      vehicleById.get(vehicleRef)?.rawName === rawName,
      `raw-name index is invalid for ${rawName}`,
    );
  }
  invariant(
    document.indexes?.bindingKeyCatalogRefs &&
      typeof document.indexes.bindingKeyCatalogRefs === "object" &&
      !Array.isArray(document.indexes.bindingKeyCatalogRefs),
    "binding-key index is missing",
  );
  const bindingKeyEntries = Object.entries(
    document.indexes.bindingKeyCatalogRefs,
  );
  invariant(
    bindingKeyEntries.length === bindingIds.size,
    "binding-key index count drifted",
  );
  exactStringRefs(
    bindingKeyEntries.map(([, bindingRef]) => bindingRef),
    bindingIds,
    "binding-key index refs",
  );
  for (const [bindingKey, bindingRef] of bindingKeyEntries) {
    invariant(
      bindingById.get(bindingRef)?.bindingKey === bindingKey,
      `binding-key index is invalid for ${bindingKey}`,
    );
  }
  for (const binding of document.identities.catalogBindings) {
    invariant(
      document.indexes.bindingKeyCatalogRefs[binding.bindingKey] ===
        binding.id,
      `binding-key index is missing ${binding.id}`,
    );
  }

  invariant(
    document.indexes?.cardCatalogRefs &&
      typeof document.indexes.cardCatalogRefs === "object" &&
      !Array.isArray(document.indexes.cardCatalogRefs),
    "card index is missing",
  );
  const cardEntries = Object.entries(
    document.indexes.cardCatalogRefs,
  );
  invariant(
    cardEntries.length === expectedBindingRefsByCard.size,
    "card index count drifted",
  );
  const indexedCardRefs = [];
  for (const [cardId, bindingRefs] of cardEntries) {
    invariant(
      expectedBindingRefsByCard.has(cardId),
      `card index has unexpected card ${cardId}`,
    );
    exactStringRefs(
      bindingRefs,
      expectedBindingRefsByCard.get(cardId),
      `card index ${cardId}`,
    );
    for (const bindingRef of bindingRefs) {
      invariant(
        bindingById.get(bindingRef)?.cardId === cardId,
        `card index ${cardId} owns the wrong binding ${bindingRef}`,
      );
    }
    indexedCardRefs.push(...bindingRefs);
  }
  exactStringRefs(
    indexedCardRefs,
    bindingIds,
    "card index refs",
  );
  for (const cardId of expectedBindingRefsByCard.keys()) {
    invariant(
      Object.hasOwn(document.indexes.cardCatalogRefs, cardId),
      `card index is missing ${cardId}`,
    );
  }

  invariant(document.audit.referenceClosure === true, "reference closure is false");
  invariant(
    document.audit.exactCatalogOwnership === true,
    "exact catalog ownership is false",
  );
  invariant(
    document.audit.runtimeBindingClosure === true,
    "runtime binding closure is false",
  );
  invariant(
    document.audit.profileContentAddressing === true,
    "profile content addressing is false",
  );
  invariant(
    document.audit.noEmbeddedHitTopology === true,
    "hit topology was embedded in the canonical catalog",
  );
  invariant(
    document.audit.visualArtifactClosure === true,
    "visual artifact closure is false",
  );

  return document;
}

function valueMap(records) {
  return new Map(records.map((record) => [record.id, record.value]));
}

export function createVehicleCatalogResolver(document) {
  validateVehicleCatalog(document);
  const vehicleById = new Map(
    document.identities.vehicles.map((vehicle) => [
      vehicle.id,
      vehicle,
    ]),
  );
  const bindingById = new Map(
    document.identities.catalogBindings.map((binding) => [
      binding.id,
      binding,
    ]),
  );
  const generalById = valueMap(document.profiles.general);
  const seatById = valueMap(document.profiles.seats);
  const damageById = valueMap(document.profiles.damageResistances);
  const componentById = valueMap(document.profiles.components);

  function binding(cardId, rawName) {
    const bindingRef =
      document.indexes.bindingKeyCatalogRefs[
        `${cardId}\u0000${rawName}`
      ];
    return bindingRef ? bindingById.get(bindingRef) ?? null : null;
  }

  function sourceVehicle(rawName) {
    const vehicleRef =
      document.indexes.rawNameVehicleRefs[rawName];
    return vehicleRef ? vehicleById.get(vehicleRef) ?? null : null;
  }

  function referenceData(cardId, rawName) {
    const vehicle = sourceVehicle(rawName);
    const exactBinding = binding(cardId, rawName);
    invariant(vehicle, `source vehicle is missing for ${rawName}`);
    invariant(
      exactBinding && exactBinding.vehicleRef === vehicle.id,
      `catalog binding is missing for ${cardId}/${rawName}`,
    );
    const general = generalById.get(vehicle.generalProfileRef);
    invariant(general, `${vehicle.id} general profile is missing`);
    return {
      general: {
        rawName,
        ...general,
      },
      weaponBindingIds: [...exactBinding.weaponBindingIds],
      seats: vehicle.seatProfileRefs.map((id) => {
        const value = seatById.get(id);
        invariant(value, `${vehicle.id} seat profile ${id} is missing`);
        return value;
      }),
      damageResistances: vehicle.hullDamageProfileRefs.map((id) => {
        const value = damageById.get(id);
        invariant(value, `${vehicle.id} damage profile ${id} is missing`);
        return value;
      }),
      components: vehicle.componentProfileRefs.map((id) => {
        const value = componentById.get(id);
        invariant(value, `${vehicle.id} component profile ${id} is missing`);
        return {
          displayName: value.displayName,
          componentHealth: value.componentHealth,
          repairToolLimit: value.repairToolLimit,
          canBeRepairedAfterDestroy:
            value.canBeRepairedAfterDestroy,
          damageResistances: value.damageProfileRefs.map(
            (damageProfileRef) => {
              const damage = damageById.get(damageProfileRef);
              invariant(
                damage,
                `${id} damage profile ${damageProfileRef} is missing`,
              );
              return damage;
            },
          ),
        };
      }),
    };
  }

  return {
    binding,
    referenceData,
    sourceVehicle,
  };
}
