import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactRevision,
  canonicalJsonBytes,
  readJsonArtifact,
  sha256,
  stableJsonValue,
  writeOrCheckArtifact,
} from "./lib/generated-json-artifact.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CATALOG_RELATIVE_PATH =
  "generated/internal/weapon-catalog.json";
const CONFIG_RELATIVE_PATH =
  "config/emplaced-weapon-catalog-projection.json";
const RUNTIME_OUTPUT_RELATIVE_PATH =
  "app/runtime-weapon-catalog.json";
const WIKI_OUTPUT_RELATIVE_PATH =
  "app/wiki-weapon-catalog.json";
const CATALOG_PATH = path.join(
  ROOT,
  ...CATALOG_RELATIVE_PATH.split("/"),
);
const CONFIG_PATH = path.join(
  ROOT,
  ...CONFIG_RELATIVE_PATH.split("/"),
);
const RUNTIME_OUTPUT_PATH = path.join(
  ROOT,
  ...RUNTIME_OUTPUT_RELATIVE_PATH.split("/"),
);
const WIKI_OUTPUT_PATH = path.join(
  ROOT,
  ...WIKI_OUTPUT_RELATIVE_PATH.split("/"),
);
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(
    `Weapon client projections: unsupported arguments ${unknownArguments.join(", ")}`,
  );
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Weapon client projections: ${message}`);
  }
}

function uniqueStrings(values, label) {
  invariant(
    Array.isArray(values) &&
      values.every(
        (value) => typeof value === "string" && value.length > 0,
      ),
    `${label} must contain non-empty strings`,
  );
  const unique = [...new Set(values)];
  invariant(
    unique.length === values.length,
    `${label} contains duplicates`,
  );
  return unique;
}

function exactSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  invariant(
    actual.size === expected.size &&
      [...expected].every((value) => actual.has(value)),
    `${label} is not an exact closure`,
  );
}

function withoutField(value, field) {
  const output = { ...value };
  delete output[field];
  return output;
}

function squadSdkVersion(sourceBuildId) {
  return /^squad-sdk-(v[0-9]+\.[0-9]+\.[0-9]+)-/u.exec(
    sourceBuildId,
  )?.[1] ?? null;
}

function sourceVariantForAlias(catalog, alias) {
  const matches = catalog.selector.variants.filter(
    (variant) =>
      variant.selectorVisibility === "shipping" &&
      variant.familyLabel ===
        alias.sourceVariant.familyLabel &&
      (alias.sourceVariant.qualifier === undefined ||
        variant.qualifier === alias.sourceVariant.qualifier),
  );
  invariant(
    matches.length === 1,
    `${alias.id} source selector resolved ${matches.length} variants`,
  );
  return matches[0];
}

function evidenceReferenceId(target) {
  return (
    "emplaced-evidence-ref-" +
    sha256(
      Buffer.from(
        `${target.package}\u0000${target.sourceAssetSha256}`,
        "utf8",
      ),
    ).slice(0, 20)
  );
}

function buildEmplacedProjection(catalog, config, evidence) {
  invariant(
    config.schemaVersion ===
      "sigua-emplaced-weapon-catalog-projection/v1" &&
      config.evidencePath ===
        "generated/internal/emplaced-weapon-cdo-evidence.json" &&
      Array.isArray(config.aliases) &&
      config.aliases.length > 0,
    "emplaced projection configuration is invalid",
  );
  invariant(
    evidence.schemaVersion ===
      "sigua-emplaced-weapon-cdo-snapshot/v1" &&
      squadSdkVersion(evidence.sourceBuildId) !== null &&
      squadSdkVersion(evidence.sourceBuildId) ===
        squadSdkVersion(catalog.sourceBuildId) &&
      evidence.targetCount === evidence.targets.length &&
      evidence.snapshotRevision ===
        artifactRevision(
          withoutField(evidence, "snapshotRevision"),
        ),
    "emplaced Editor evidence snapshot is stale or invalid",
  );
  const targetByPackage = new Map();
  for (const target of evidence.targets) {
    invariant(
      typeof target?.package === "string" &&
        target.package.length > 0 &&
        !targetByPackage.has(target.package) &&
        typeof target.generatedClassPath === "string" &&
        /^[a-f0-9]{64}$/u.test(target.sourceAssetSha256) &&
        typeof target.projectileClassPath === "string" &&
        target.projectileClassPath.length > 0,
      `emplaced evidence target ${target?.package ?? "missing"} is invalid`,
    );
    targetByPackage.set(target.package, target);
  }

  const sourceRefById = new Map(
    catalog.sources.refs.map((sourceRef) => [
      sourceRef.id,
      sourceRef,
    ]),
  );
  invariant(
    sourceRefById.size === catalog.sources.refs.length,
    "canonical source reference ids are not unique",
  );
  const canonicalTargetPackages = new Set();
  for (const variant of catalog.selector.variants) {
    if (
      variant.selectorVisibility !== "shipping" ||
      variant.platformKind !== "emplaced"
    ) {
      continue;
    }
    for (const sourceRefId of variant.sourceRefIds) {
      const sourceRef = sourceRefById.get(sourceRefId);
      invariant(
        sourceRef,
        `${variant.id} references missing source ${sourceRefId}`,
      );
      if (targetByPackage.has(sourceRef.weaponAssetPath)) {
        canonicalTargetPackages.add(sourceRef.weaponAssetPath);
      }
    }
  }

  const aliasIds = new Set();
  const aliasTargetPackages = new Set();
  const evidenceRefs = [];
  const aliases = config.aliases.map((alias) => {
    invariant(
      typeof alias?.id === "string" &&
        alias.id.startsWith("runtime-emplaced-") &&
        !aliasIds.has(alias.id) &&
        !catalog.selector.variants.some(
          (variant) => variant.id === alias.id,
        ) &&
        typeof alias.familyLabel === "string" &&
        typeof alias.label === "string" &&
        typeof alias.qualifier === "string",
      `alias ${alias?.id ?? "missing"} is invalid or duplicated`,
    );
    aliasIds.add(alias.id);
    const targetPackages = uniqueStrings(
      alias.targetPackages,
      `${alias.id} target packages`,
    );
    const targets = targetPackages.map((targetPackage) => {
      invariant(
        !canonicalTargetPackages.has(targetPackage) &&
          !aliasTargetPackages.has(targetPackage),
        `${targetPackage} is covered more than once`,
      );
      const target = targetByPackage.get(targetPackage);
      invariant(
        target,
        `${alias.id} target ${targetPackage} has no Editor evidence`,
      );
      aliasTargetPackages.add(targetPackage);
      return target;
    });
    const source = sourceVariantForAlias(catalog, alias);
    const projectedRefIds = targets.map((target) => {
      const id = evidenceReferenceId(target);
      evidenceRefs.push({
        id,
        scope: "editor-emplaced-cdo",
        sourceBuildId: evidence.sourceBuildId,
        sourceRawName: path.posix.basename(target.package),
        weaponClass: path.posix.basename(target.package),
        weaponAssetPath: target.package,
        generatedClassPath: target.generatedClassPath,
        projectileClassPath: target.projectileClassPath,
        sourceAssetSha256: target.sourceAssetSha256,
        evidenceSnapshotRevision: evidence.snapshotRevision,
        evidenceSourceSha256: evidence.sourceEvidence.sha256,
      });
      return id;
    });
    const sourceRefIds = [
      ...new Set([
        ...source.sourceRefIds,
        ...projectedRefIds,
      ]),
    ];
    return {
      ...source,
      id: alias.id,
      familyId: `${alias.id}-family`,
      familyLabel: alias.familyLabel,
      label: alias.label,
      qualifier: alias.qualifier,
      displayLabel: `${alias.familyLabel} · ${alias.qualifier}`,
      platformKind: "emplaced",
      type: "架设式武器",
      sourceIdentity: {
        ...source.sourceIdentity,
        kind: "editor-emplaced-cdo-projection",
        sourceRefIds,
      },
      sourceRefIds,
      identitySourceRefIds: projectedRefIds,
      sourceCounts: {
        ...source.sourceCounts,
        deliverySources:
          (source.sourceCounts?.deliverySources ?? 0) +
          targets.length,
      },
      sourceLabels: [
        ...new Set([
          ...(source.sourceLabels ?? []),
          "架设式武器",
          "Editor CDO",
        ]),
      ],
      familyCardIds: [],
      exactCardIds: [],
      factionIds: [],
      factionByScope: {},
      factionClaimIds: [],
      factionResolution: {
        kind: "shared-emplaced-ballistics",
        factionIds: [],
        byScope: {},
      },
      editorVerification: {
        targetId: alias.id,
        qualifier: alias.qualifier,
        exactAssetPaths: targetPackages,
        evidenceSnapshotRevision: evidence.snapshotRevision,
        evidenceSourceSha256: evidence.sourceEvidence.sha256,
        evidenceBoundary: {
          proven: evidence.evidenceBoundary.proven,
          pie: evidence.evidenceBoundary.pie,
          dedicatedServer:
            evidence.evidenceBoundary.dedicatedServer,
        },
      },
      searchText: [
        source.searchText,
        alias.familyLabel,
        alias.label,
        alias.qualifier,
        ...(alias.searchAliases ?? []),
        ...targetPackages,
        ...targets.map(
          ({ generatedClassPath }) => generatedClassPath,
        ),
      ].join(" "),
    };
  });

  exactSet(
    [
      ...canonicalTargetPackages,
      ...aliasTargetPackages,
    ],
    targetByPackage.keys(),
    "emplaced Editor evidence target coverage",
  );
  invariant(
    new Set(evidenceRefs.map(({ id }) => id)).size ===
      evidenceRefs.length,
    "emplaced evidence reference ids collided",
  );
  return {
    aliases,
    evidenceRefs,
    evidence: {
      schemaVersion: evidence.schemaVersion,
      snapshotRevision: evidence.snapshotRevision,
      targetCount: evidence.targetCount,
      canonicalTargetCount: canonicalTargetPackages.size,
      projectedTargetCount: aliasTargetPackages.size,
      aliasCount: aliases.length,
    },
  };
}

function projectionEnvelope({
  kind,
  catalog,
  catalogBytes,
  data,
  counts,
  evidence,
}) {
  const core = {
    schemaVersion: "sigua-weapon-client-projection/v1",
    projectionKind: kind,
    catalog: {
      schemaVersion: catalog.schemaVersion,
      catalogRevision: catalog.catalogRevision,
      dataRevision: catalog.dataRevision,
      sourceBuildId: catalog.sourceBuildId,
      bytes: catalogBytes.length,
      sha256: sha256(catalogBytes),
    },
    counts,
    evidence,
    data,
  };
  return {
    ...core,
    projectionRevision: artifactRevision(core),
  };
}

const [
  { bytes: catalogBytes, value: catalog },
  { value: config },
] = await Promise.all([
  readJsonArtifact(CATALOG_PATH, CATALOG_RELATIVE_PATH),
  readJsonArtifact(CONFIG_PATH, CONFIG_RELATIVE_PATH),
]);
invariant(
  catalog.schemaVersion === "sigua-weapon-catalog/v2" &&
    catalog.audit?.referenceClosure === true &&
    catalog.audit?.exactVehicleOwnership === true &&
    catalog.audit?.vehicleEquipmentReferenceClosure === true &&
    catalog.audit?.vehicleEquipmentSelectorRelationClosure === true &&
    catalog.audit?.vehicleEquipmentSelectorResolutionUnambiguous === true,
  "canonical catalog is not validated and closed",
);
const evidenceRelativePath = config.evidencePath;
invariant(
  typeof evidenceRelativePath === "string" &&
    evidenceRelativePath.length > 0,
  "evidence path is missing",
);
const { value: evidence } = await readJsonArtifact(
  path.join(ROOT, ...evidenceRelativePath.split("/")),
  evidenceRelativePath,
);
const emplaced = buildEmplacedProjection(
  catalog,
  config,
  evidence,
);

const runtimeVariants = [
  ...catalog.selector.variants,
  ...emplaced.aliases,
];
const runtimeSourceRefs = [
  ...catalog.sources.refs,
  ...emplaced.evidenceRefs,
];
const runtimeProjection = projectionEnvelope({
  kind: "runtime-selector",
  catalog,
  catalogBytes,
  counts: {
    wikiConfigurations: catalog.wiki.configurations.length,
    selectorFamilies: catalog.selector.families.length,
    selectorVariants: runtimeVariants.length,
    shippingVariants: runtimeVariants.filter(
      ({ selectorVisibility }) =>
        selectorVisibility === "shipping",
    ).length,
    directDamageModels:
      catalog.mechanics.directDamageModels.length,
    radialDamageModels:
      catalog.mechanics.radialDamageModels.length,
    radialAssets: catalog.mechanics.radialAssets.length,
    ballisticProfiles:
      catalog.mechanics.ballisticProfiles.length,
    curves: catalog.mechanics.curves.length,
    sourceRefs: runtimeSourceRefs.length,
    emplacedAliases: emplaced.aliases.length,
  },
  evidence: {
    emplacedCdo: emplaced.evidence,
  },
  data: {
    wikiConfigurations: catalog.wiki.configurations,
    selectorFamilies: catalog.selector.families,
    selectorVariants: runtimeVariants,
    directDamageModels:
      catalog.mechanics.directDamageModels,
    radialDamageModels:
      catalog.mechanics.radialDamageModels,
    radialAssets: catalog.mechanics.radialAssets,
    ballisticProfiles:
      catalog.mechanics.ballisticProfiles,
    curves: catalog.mechanics.curves,
    sourceRefs: runtimeSourceRefs,
  },
});
const wikiProjection = projectionEnvelope({
  kind: "wiki",
  catalog,
  catalogBytes,
  counts: {
    wikiFamilies: catalog.wiki.families.length,
    wikiConfigurations: catalog.wiki.configurations.length,
    wikiTemplates: catalog.wiki.templates.length,
    selectorFamilies: catalog.selector.families.length,
    selectorVariants: catalog.selector.variants.length,
    directDamageModels:
      catalog.mechanics.directDamageModels.length,
    radialDamageModels:
      catalog.mechanics.radialDamageModels.length,
    radialAssets: catalog.mechanics.radialAssets.length,
    curves: catalog.mechanics.curves.length,
  },
  evidence: null,
  data: {
    wikiFamilies: catalog.wiki.families,
    wikiConfigurations: catalog.wiki.configurations,
    wikiTemplates: catalog.wiki.templates,
    selectorFamilies: catalog.selector.families,
    selectorVariants: catalog.selector.variants,
    directDamageModels:
      catalog.mechanics.directDamageModels,
    radialDamageModels:
      catalog.mechanics.radialDamageModels,
    radialAssets: catalog.mechanics.radialAssets,
    curves: catalog.mechanics.curves,
  },
});
const runtimeBytes = canonicalJsonBytes(
  stableJsonValue(runtimeProjection),
);
const wikiBytes = canonicalJsonBytes(
  stableJsonValue(wikiProjection),
);
const [runtimeResult, wikiResult] = await Promise.all([
  writeOrCheckArtifact({
    filePath: RUNTIME_OUTPUT_PATH,
    bytes: runtimeBytes,
    checkOnly,
    label: RUNTIME_OUTPUT_RELATIVE_PATH,
  }),
  writeOrCheckArtifact({
    filePath: WIKI_OUTPUT_PATH,
    bytes: wikiBytes,
    checkOnly,
    label: WIKI_OUTPUT_RELATIVE_PATH,
  }),
]);

process.stdout.write(
  `${JSON.stringify({
    status: checkOnly ? "checked" : "built",
    catalogRevision: catalog.catalogRevision,
    runtime: {
      path: RUNTIME_OUTPUT_RELATIVE_PATH,
      status: runtimeResult.status,
      bytes: runtimeBytes.length,
      sha256: sha256(runtimeBytes),
      projectionRevision:
        runtimeProjection.projectionRevision,
      counts: runtimeProjection.counts,
    },
    wiki: {
      path: WIKI_OUTPUT_RELATIVE_PATH,
      status: wikiResult.status,
      bytes: wikiBytes.length,
      sha256: sha256(wikiBytes),
      projectionRevision: wikiProjection.projectionRevision,
      counts: wikiProjection.counts,
    },
  })}\n`,
);
