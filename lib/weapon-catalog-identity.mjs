function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid weapon catalog identity graph: ${message}`);
  }
}

function sortedUnique(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== "",
      ),
    ),
  ].sort((left, right) =>
    String(left).localeCompare(String(right), "en"),
  );
}

function addUniqueVariant(index, key, variant) {
  const variants = index.get(key) ?? [];
  if (!variants.some(({ id }) => id === variant.id)) {
    variants.push(variant);
  }
  index.set(key, variants);
}

function setExactVariant(index, key, variant, label) {
  const existing = index.get(key);
  invariant(
    !existing || existing.id === variant.id,
    `${label} ${key} resolves to both ${existing?.id} and ${variant.id}`,
  );
  index.set(key, variant);
}

export function createWeaponCatalogIdentityResolver(catalog) {
  invariant(
    Array.isArray(catalog?.selector?.variants) &&
      Array.isArray(catalog?.sources?.refs),
    "selector variants or source references are missing",
  );
  const sourceRefById = new Map();
  for (const sourceRef of catalog.sources.refs) {
    invariant(
      typeof sourceRef?.id === "string" &&
        sourceRef.id.length > 0 &&
        !sourceRefById.has(sourceRef.id),
      `source reference ${sourceRef?.id ?? "missing"} is duplicated`,
    );
    sourceRefById.set(sourceRef.id, sourceRef);
  }

  const variantById = new Map();
  const variantsByExactVehicle = new Map();
  const variantByExactVehicleBallistics = new Map();
  const variantsByRawVehicle = new Map();
  const variantByCardBallistics = new Map();
  const variantByWikiBallistics = new Map();
  const variantsByWikiConfiguration = new Map();

  for (const variant of catalog.selector.variants) {
    invariant(
      typeof variant?.id === "string" &&
        variant.id.length > 0 &&
        !variantById.has(variant.id),
      `variant ${variant?.id ?? "missing"} is duplicated`,
    );
    variantById.set(variant.id, variant);
    for (const configurationKey of variant.configurationKeys ?? []) {
      addUniqueVariant(
        variantsByWikiConfiguration,
        configurationKey,
        variant,
      );
    }
    for (const binding of variant.ballisticsSourceRefs ?? []) {
      if (binding.configurationKey) {
        setExactVariant(
          variantByWikiBallistics,
          `${binding.configurationKey}\u0000${binding.ballisticsId}`,
          variant,
          "wiki ballistics identity",
        );
      }
    }
    const identitySourceRefIds =
      variant.identitySourceRefIds ?? variant.sourceRefIds ?? [];
    invariant(
      identitySourceRefIds.every((sourceRefId) =>
        (variant.sourceRefIds ?? []).includes(sourceRefId),
      ),
      `${variant.id} identity sources are not a subset of its provenance sources`,
    );
    for (const sourceRefId of identitySourceRefIds) {
      const sourceRef = sourceRefById.get(sourceRefId);
      invariant(
        sourceRef,
        `${variant.id} references missing source ${sourceRefId}`,
      );
      const exactCardIds = sortedUnique([
        sourceRef.exactCardId,
        ...(sourceRef.exactCardIds ?? []),
      ]);
      const rawNames = sortedUnique([
        sourceRef.sourceRawName,
        sourceRef.weaponClass,
      ]);
      const ballisticsIds = sortedUnique([
        sourceRef.ballisticsId,
        ...(variant.ballisticsSourceRefs ?? [])
          .filter((entry) => entry.sourceRefId === sourceRef.id)
          .map(({ ballisticsId }) => ballisticsId),
      ]);

      for (const cardId of exactCardIds) {
        for (const rawName of rawNames) {
          const identity = `${cardId}\u0000${rawName}`;
          addUniqueVariant(
            variantsByExactVehicle,
            identity,
            variant,
          );
          addUniqueVariant(
            variantsByRawVehicle,
            identity,
            variant,
          );
          for (const ballisticsId of ballisticsIds) {
            setExactVariant(
              variantByExactVehicleBallistics,
              `${identity}\u0000${ballisticsId}`,
              variant,
              "exact vehicle ballistics identity",
            );
          }
        }
        addUniqueVariant(
          variantsByExactVehicle,
          `${cardId}\u0000`,
          variant,
        );
        for (const ballisticsId of ballisticsIds) {
          setExactVariant(
            variantByCardBallistics,
            `${cardId}\u0000${ballisticsId}`,
            variant,
            "card ballistics identity",
          );
        }
      }
    }
  }

  function variantsForExactVehicle(cardId, rawName) {
    return (
      variantsByExactVehicle.get(`${cardId}\u0000${rawName}`) ??
      variantsByExactVehicle.get(`${cardId}\u0000`) ??
      []
    );
  }

  function variantForVehicle(cardId, rawName, ballisticsId) {
    return (
      variantByExactVehicleBallistics.get(
        `${cardId}\u0000${rawName}\u0000${ballisticsId}`,
      ) ??
      variantsForExactVehicle(cardId, rawName).find((variant) =>
        (variant.ballisticsIds ?? []).includes(ballisticsId),
      ) ??
      variantByCardBallistics.get(
        `${cardId}\u0000${ballisticsId}`,
      ) ??
      null
    );
  }

  function variantForRuntimeWeapon(weapon) {
    for (const rawName of sortedUnique([
      weapon.sourceRawName,
      weapon.gunName,
    ])) {
      const identity = `${weapon.sourceCardId}\u0000${rawName}`;
      const exact = variantByExactVehicleBallistics.get(
        `${identity}\u0000${weapon.ballisticsId}`,
      );
      if (exact) return exact;
      const candidates = variantsByRawVehicle.get(identity);
      if (candidates?.length === 1) return candidates[0];
      const matching = candidates?.filter((variant) =>
        (variant.ballisticsIds ?? []).includes(weapon.ballisticsId),
      );
      invariant(
        !matching || matching.length <= 1,
        `runtime weapon ${identity}/${weapon.ballisticsId} is ambiguous`,
      );
      if (matching?.length === 1) return matching[0];
    }
    return (
      variantByCardBallistics.get(
        `${weapon.sourceCardId}\u0000${weapon.ballisticsId}`,
      ) ?? null
    );
  }

  function variantsForWikiConfigurations(configurationKeys) {
    const matches = new Map();
    for (const configurationKey of configurationKeys) {
      for (
        const variant of
          variantsByWikiConfiguration.get(configurationKey) ?? []
      ) {
        matches.set(variant.id, variant);
      }
    }
    return [...matches.values()];
  }

  return Object.freeze({
    sourceRefForId(id) {
      return sourceRefById.get(id) ?? null;
    },
    variantForId(id) {
      return variantById.get(id) ?? null;
    },
    variantForRuntimeWeapon,
    variantForVehicle,
    variantsForExactVehicle,
    variantsForWikiConfigurations,
    variantForWiki(configurationKey, ballisticsId) {
      return (
        variantByWikiBallistics.get(
          `${configurationKey}\u0000${ballisticsId}`,
        ) ??
        variantsByWikiConfiguration
          .get(configurationKey)
          ?.find((variant) =>
            (variant.ballisticsIds ?? []).includes(ballisticsId),
          ) ??
        null
      );
    },
  });
}
