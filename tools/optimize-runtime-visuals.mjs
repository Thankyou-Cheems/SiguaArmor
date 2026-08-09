import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Format,
  Logger,
  NodeIO,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  meshopt,
  prune,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const OPTIMIZER_TOOL_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(OPTIMIZER_TOOL_PATH), "..");
const DEFAULT_SOURCE_INDEX = path.join(ROOT, "app", "runtime-probe-visual-index.json");
const DEFAULT_SELECTION_POLICY = path.join(
  ROOT,
  "app",
  "runtime-probe-visual-selection-policy.json",
);
const DEFAULT_PUBLIC_ROOT = path.resolve(
  process.env.SIGUA_RUNTIME_VISUAL_SOURCE_ROOT?.trim() ||
    path.join(ROOT, "public"),
);
const DEFAULT_CACHE_ROOT = path.join(
  process.env.SIGUA_PUBLIC_RELEASE_CACHE_ROOT?.trim() ||
    path.join(ROOT, "outputs", "public-release-cache"),
  "visuals",
);
const DEFAULT_RELEASE_INDEX = path.join(ROOT, "app", "runtime-probe-visual-release-index.json");
const DEFAULT_RELEASE_MANIFEST = path.join(ROOT, "generated", "runtime-visual-release-manifest.json");
const DEFAULT_OPTIMIZATION_RECIPE = path.join(
  ROOT,
  "config",
  "runtime-visual-optimization-recipe.json",
);
const RECIPE_DEPENDENCY_PATHS = {
  gltfTransformCore: path.join(ROOT, "node_modules", "@gltf-transform", "core", "package.json"),
  gltfTransformExtensions: path.join(ROOT, "node_modules", "@gltf-transform", "extensions", "package.json"),
  gltfTransformFunctions: path.join(ROOT, "node_modules", "@gltf-transform", "functions", "package.json"),
  meshoptimizer: path.join(ROOT, "node_modules", "meshoptimizer", "package.json"),
  sharp: path.join(ROOT, "node_modules", "sharp", "package.json"),
};
const MODEL_URL_PREFIX = "/assets/runtime-probe/models/";
const BLOB_URL_PREFIX = "/assets/runtime-probe/blob/";
const MODEL_RESOURCE_URI_PREFIX = "../blob/";
const CHECKPOINT_SCHEMA_VERSION = "runtime-visual-optimization-checkpoint/v3";
const SOURCE_SIGNATURE_ALGORITHM = "sha256-content-closure/v1";
const LEGACY_ABSOLUTE_URI_TOOL_SHA256 =
  "74f683ca25756315954e81527fde5d531e7362c8844dc55edfe63a0384ff938c";
const PROVISIONAL_RELATIVE_URI_TOOL_SHA256 =
  "3c7aa197422fe1f7ba2924fd02ddaa955110b4304b26cdff1235bb58cd163ab6";
const SOURCE_INDEX_REBIND_PREVIOUS_TOOL_SHA256S = new Set([
  "d4ad7061d1676acd5203b121e92388c2c8ed4be9d89371ef2a643658a7d7c8db",
  "6ea72b22f911a0721192f6e1337fe770d98fb2f3585220ccb95920bc2f05dcf4",
]);
const PRE_RELATIVE_URI_RECIPE_SHA256 =
  "6a17a82408c323084391f21c3e125ba1d6261973ece9720e3e495d5c8234ec6f";
const UNSIGNED_SUPPRESSED_SOURCE_REBUILD_URL =
  "/assets/runtime-probe/visuals/63d1ed203da1b8e996201ed3fe87630d46f429f469d56241a25ff6758e0a29ee/asset-5231e99ffa0d44045b2382df/source.gltf";
const RELATIVE_URI_MIGRATION_GENERATIONS = new Map([
  [
    LEGACY_ABSOLUTE_URI_TOOL_SHA256,
    Object.freeze({ kind: "legacy-absolute", uriMode: "absolute" }),
  ],
  [
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    Object.freeze({ kind: "provisional-relative", uriMode: "relative" }),
  ],
]);
const OPTIMIZATION_RECIPE = Object.freeze({
  schemaVersion: "runtime-visual-optimization-recipe/v1",
  revision: "meshopt-webp-production-v2",
  dependencies: {
    gltfTransformCore: "4.4.1",
    gltfTransformExtensions: "4.4.1",
    gltfTransformFunctions: "4.4.1",
    meshoptimizer: "1.2.0",
    sharp: "0.34.5",
  },
  transforms: [
    { name: "dedup" },
    { name: "prune" },
    {
      name: "textureCompress",
      scope: "normal-occlusion-metallicRoughness",
      targetFormat: "webp",
      sourceFormats: ["png", "jpeg"],
      resize: [2048, 2048],
      quality: 95,
      effort: 72,
      nearLossless: true,
    },
    {
      name: "textureCompress",
      scope: "color-and-other",
      targetFormat: "webp",
      sourceFormats: ["png", "jpeg"],
      resize: [2048, 2048],
      quality: 84,
      effort: 72,
      nearLossless: false,
    },
    { name: "meshopt", level: "high" },
  ],
  serialization: {
    format: "gltf",
    stableJson: true,
    contentAddressed: true,
    externalResourceUris: "relative-parent-blob/v1",
  },
});
const DEFAULT_RELEASE_CLOSURE = Object.freeze({
  descriptors: 604,
  rawSourceAssets: 2558,
  selectedSourceAssets: 2475,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function runtimeVisualSourceIndexTransition(
  previousSourceIndexSha256,
  sourceIndexSha256,
) {
  invariant(
    /^[a-f0-9]{64}$/u.test(previousSourceIndexSha256) &&
      /^[a-f0-9]{64}$/u.test(sourceIndexSha256),
    "runtime visual source index transition has an invalid SHA-256",
  );
  if (previousSourceIndexSha256 === sourceIndexSha256) return null;
  return {
    previousSourceIndexSha256,
    sourceIndexSha256,
    verification:
      "current-source-signatures-and-content-addressed-output-artifacts",
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) result[key] = true;
    else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextBytes(bytes) {
  return Buffer.from(
    bytes.toString("utf8").replace(/\r\n?/gu, "\n"),
    "utf8",
  );
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, stable(value[key])]),
  );
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
}

function modelResourceUri(resource) {
  return `${MODEL_RESOURCE_URI_PREFIX}${resource.sha256}.${resource.extension}`;
}

function modelExternalResourceUris(json) {
  return [
    ...(json.buffers ?? []).map((buffer) => buffer.uri).filter(Boolean),
    ...(json.images ?? []).map((image) => image.uri).filter(Boolean),
  ];
}

function assertModelResourceClosure(json, resources, label) {
  const expected = new Set(resources.map(modelResourceUri));
  const actual = new Set(modelExternalResourceUris(json));
  invariant(actual.size === expected.size, `${label}: external resource count mismatch`);
  for (const uri of actual) {
    invariant(
      expected.has(uri),
      `${label}: model resource URI must be relative to the model: ${uri}`,
    );
  }
  for (const uri of expected) {
    invariant(actual.has(uri), `${label}: declared resource is not referenced: ${uri}`);
  }
}

function assertExactModelResourceUriSet(json, expectedUris, label, generationKind) {
  const expected = new Set(expectedUris);
  const actual = new Set(modelExternalResourceUris(json));
  invariant(
    expected.size === expectedUris.length,
    `${label}: ${generationKind} resource records contain duplicate URLs`,
  );
  invariant(
    actual.size === expected.size,
    `${label}: ${generationKind} external resource count mismatch`,
  );
  for (const uri of actual) {
    invariant(
      expected.has(uri),
      `${label}: unexpected ${generationKind} model resource URI: ${uri}`,
    );
  }
  for (const uri of expected) {
    invariant(
      actual.has(uri),
      `${label}: ${generationKind} declared resource is not referenced: ${uri}`,
    );
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonOr(filePath, fallback) {
  return (await exists(filePath)) ? readJson(filePath) : fallback;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonBytes(value));
}

async function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, jsonBytes(value), { flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writeImmutable(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, bytes, { flag: "wx" });
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const current = await readFile(filePath);
    const expectedSha256 = sha256(bytes);
    invariant(
      current.byteLength === bytes.byteLength,
      `content-addressed file byte-length mismatch: ${filePath}`,
    );
    invariant(
      sha256(current) === expectedSha256,
      `content-addressed file SHA-256 mismatch: ${filePath}`,
    );
    invariant(
      current.equals(bytes),
      `content-addressed file byte mismatch: ${filePath}`,
    );
    return "verified";
  }
}

function resolvePublicUrl(publicRoot, url) {
  invariant(
    url.startsWith("/assets/runtime-probe/visuals/") && url.endsWith("/source.gltf"),
    `unsupported runtime visual URL: ${url}`,
  );
  const resolved = path.resolve(publicRoot, ...url.slice(1).split("/"));
  const relative = path.relative(path.resolve(publicRoot), resolved);
  invariant(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `visual URL escaped public root: ${url}`);
  return resolved;
}

async function closureSignature(sourcePath) {
  const directory = path.dirname(sourcePath);
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  invariant(entries.some((entry) => entry.name === "source.gltf"), `source.gltf is missing: ${directory}`);
  const signatureRows = [];
  for (const entry of entries) {
    const bytes = await readFile(path.join(directory, entry.name));
    signatureRows.push({
      name: entry.name,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  return sha256(jsonBytes({
    algorithm: SOURCE_SIGNATURE_ALGORITHM,
    files: signatureRows,
  }));
}

function sourceClosureSha256(rows) {
  return sha256(jsonBytes({
    algorithm: SOURCE_SIGNATURE_ALGORITHM,
    entries: [...rows]
      .map(({ sourceUrl, signature }) => ({
        sourceUrl,
        sourceSignature: signature,
      }))
      .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl, "en")),
  }));
}

async function mapConcurrent(values, concurrency, transform) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await transform(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function descriptorIdentity(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

function validateStringArray(value, label, { allowEmpty = false } = {}) {
  invariant(Array.isArray(value), `${label} must be an array`);
  invariant(allowEmpty || value.length > 0, `${label} must not be empty`);
  invariant(
    value.every((item) => typeof item === "string" && item.length > 0),
    `${label} must contain non-empty strings`,
  );
}

function validateSelectionPolicy(policy) {
  invariant(
    policy?.schemaVersion === "runtime-visual-selection-policy/v1",
    "unsupported runtime visual selection policy",
  );
  invariant(
    Array.isArray(policy.globalSuppressions),
    "visual selection policy globalSuppressions must be an array",
  );
  invariant(
    Array.isArray(policy.rules),
    "visual selection policy rules must be an array",
  );
  invariant(
    policy.synchronizedWeaponPolicy?.schemaVersion ===
      "runtime-visual-weapon-synchronization/v1" &&
      Array.isArray(policy.synchronizedWeaponPolicy.groups),
    "visual synchronized weapon policy is invalid",
  );
  const suppressionIds = new Set();
  for (const suppression of policy.globalSuppressions) {
    invariant(
      typeof suppression.id === "string" && suppression.id.length > 0,
      "global visual suppression id is required",
    );
    invariant(
      !suppressionIds.has(suppression.id),
      `duplicate global visual suppression id: ${suppression.id}`,
    );
    suppressionIds.add(suppression.id);
    validateStringArray(
      suppression.componentNames,
      `global visual suppression ${suppression.id} componentNames`,
    );
    if (suppression.sourceMeshPaths !== undefined) {
      validateStringArray(
        suppression.sourceMeshPaths,
        `global visual suppression ${suppression.id} sourceMeshPaths`,
      );
    }
    if (suppression.actorIncludes !== undefined) {
      validateStringArray(
        suppression.actorIncludes,
        `global visual suppression ${suppression.id} actorIncludes`,
      );
    }
  }

  const ruleIdentities = new Set();
  for (const rule of policy.rules) {
    invariant(
      typeof rule.cardId === "string" && rule.cardId.length > 0,
      "visual selection rule cardId is required",
    );
    invariant(
      typeof rule.rawName === "string" && rule.rawName.length > 0,
      "visual selection rule rawName is required",
    );
    const identity = descriptorIdentity(rule.cardId, rule.rawName);
    invariant(
      !ruleIdentities.has(identity),
      `duplicate visual selection rule: ${rule.cardId} / ${rule.rawName}`,
    );
    ruleIdentities.add(identity);
    invariant(
      typeof rule.target?.componentName === "string"
        && rule.target.componentName.length > 0,
      `visual selection rule target component is required: ${rule.cardId} / ${rule.rawName}`,
    );
    validateStringArray(
      rule.target.actorIncludes,
      `visual selection rule target actorIncludes: ${rule.cardId} / ${rule.rawName}`,
    );
    validateStringArray(
      rule.suppressComponentNames,
      `visual selection rule suppressComponentNames: ${rule.cardId} / ${rule.rawName}`,
    );
    if (rule.suppressActorIncludes !== undefined) {
      validateStringArray(
        rule.suppressActorIncludes,
        `visual selection rule suppressActorIncludes: ${rule.cardId} / ${rule.rawName}`,
      );
    }
  }
  const synchronizedGroupIds = new Set();
  for (const group of policy.synchronizedWeaponPolicy.groups) {
    invariant(
      typeof group.groupId === "string" && group.groupId.length > 0,
      "synchronized weapon group id is required",
    );
    invariant(
      !synchronizedGroupIds.has(group.groupId),
      `duplicate synchronized weapon group: ${group.groupId}`,
    );
    synchronizedGroupIds.add(group.groupId);
    invariant(
      Array.isArray(group.bindings) &&
        group.bindings.length > 0 &&
        group.bindings.every(
          (binding) =>
            typeof binding.cardId === "string" &&
            binding.cardId.length > 0 &&
            typeof binding.rawName === "string" &&
            binding.rawName.length > 0,
        ),
      `${group.groupId}: synchronized weapon bindings are invalid`,
    );
    invariant(
      typeof group.sourceMeshPath === "string" &&
        group.sourceMeshPath.length > 0 &&
        typeof group.activeActor === "string" &&
        group.activeActor.length > 0,
      `${group.groupId}: synchronized weapon target is invalid`,
    );
    validateStringArray(
      group.suppressedActors,
      `${group.groupId}: synchronized weapon suppressedActors`,
    );
    invariant(
      !group.suppressedActors.includes(group.activeActor),
      `${group.groupId}: active weapon actor is also suppressed`,
    );
  }
}

function placementMatchesSuppression(placement, suppression) {
  return suppression.componentNames.includes(placement.name)
    && (
      !suppression.sourceMeshPaths
      || suppression.sourceMeshPaths.includes(placement.sourceMeshPath)
    )
    && (
      !suppression.actorIncludes
      || suppression.actorIncludes.some((needle) => placement.actor.includes(needle))
    );
}

function applyVisualSelection(
  descriptor,
  rule,
  globalSuppressions,
  globalMatchCounts,
  synchronizedWeaponGroups,
) {
  const globallySuppressedPaths = new Set();
  for (const placement of descriptor.placements) {
    for (const suppression of globalSuppressions) {
      if (!placementMatchesSuppression(placement, suppression)) continue;
      globallySuppressedPaths.add(placement.stableOccurrenceId);
      globalMatchCounts.set(
        suppression.id,
        (globalMatchCounts.get(suppression.id) ?? 0) + 1,
      );
    }
  }
  const globallyFilteredPlacements = descriptor.placements.filter(
    (placement) => !globallySuppressedPaths.has(placement.stableOccurrenceId),
  );
  let synchronizedFilteredPlacements = globallyFilteredPlacements;
  let synchronizedWeaponFilteredOccurrences = 0;
  for (const group of synchronizedWeaponGroups) {
    const candidates = synchronizedFilteredPlacements.filter(
      (placement) =>
        placement.name === "WeaponMesh3P" &&
        placement.sourceMeshPath === group.sourceMeshPath &&
        (placement.actor === group.activeActor ||
          group.suppressedActors.includes(placement.actor)),
    );
    if (candidates.length === 0) continue;
    const suppressedPaths = new Set(
      candidates
        .filter((placement) => group.suppressedActors.includes(placement.actor))
        .map((placement) => placement.stableOccurrenceId),
    );
    if (suppressedPaths.size === 0) continue;
    invariant(
      candidates.filter((placement) => placement.actor === group.activeActor).length === 1,
      `synchronized weapon selection matched no unique active occurrence for ${descriptor.cardId} / ${descriptor.rawName} / ${group.groupId}`,
    );
    synchronizedWeaponFilteredOccurrences += suppressedPaths.size;
    synchronizedFilteredPlacements = synchronizedFilteredPlacements.filter(
      (placement) => !suppressedPaths.has(placement.stableOccurrenceId),
    );
  }
  if (!rule) {
    return {
      placements: synchronizedFilteredPlacements,
      globalSuppressedOccurrences: (
        descriptor.placements.length - globallyFilteredPlacements.length
      ),
      synchronizedWeaponFilteredOccurrences,
      ruleFilteredOccurrences: 0,
    };
  }

  const managedComponentNames = new Set(rule.suppressComponentNames);
  const targetPlacements = synchronizedFilteredPlacements.filter(
    (placement) =>
      placement.name === rule.target.componentName
      && rule.target.actorIncludes.some((needle) => placement.actor.includes(needle)),
  );
  const managedPlacements = synchronizedFilteredPlacements.filter(
    (placement) =>
      managedComponentNames.has(placement.name)
      && (
        !rule.suppressActorIncludes
        || rule.suppressActorIncludes.some((needle) => placement.actor.includes(needle))
      ),
  );
  invariant(
    targetPlacements.length > 0
      && (rule.suppressActorIncludes || managedPlacements.length > 0),
    `visual selection matched no ${rule.target.componentName} occurrence for ${descriptor.cardId} / ${descriptor.rawName}`,
  );

  const selectedTargetPlacements = targetPlacements.slice(0, 1);
  const selectedPaths = new Set(
    selectedTargetPlacements.map((placement) => placement.stableOccurrenceId),
  );
  const managedPaths = new Set(
    managedPlacements.map((placement) => placement.stableOccurrenceId),
  );
  const placements = synchronizedFilteredPlacements.filter(
    (placement) =>
      !managedPaths.has(placement.stableOccurrenceId)
      || selectedPaths.has(placement.stableOccurrenceId),
  );
  return {
    placements,
    globalSuppressedOccurrences: (
      descriptor.placements.length - globallyFilteredPlacements.length
    ),
    synchronizedWeaponFilteredOccurrences,
    ruleFilteredOccurrences: (
      synchronizedFilteredPlacements.length - placements.length
    ),
  };
}

function projectSelectionInventory(descriptor, placements) {
  const skeletalPlacements = placements.filter(
    (placement) => placement.componentClassPath.includes("SkeletalMeshComponent"),
  );
  return {
    ...descriptor,
    requiredOccurrences: placements.length,
    runtimeBonePoseOccurrenceCount: skeletalPlacements.length,
    runtimeBonePoseJointCount: skeletalPlacements.reduce(
      (total, placement) => total + (placement.runtimeBonePoseJointCount ?? 0),
      0,
    ),
    runtimeBonePoseReferenceEquivalentOccurrenceCount: skeletalPlacements.filter(
      (placement) => placement.runtimeBonePoseReferenceEquivalent === true,
    ).length,
    placements,
  };
}

function buildRuntimeSelectionProjection(sourceIndex, policy) {
  validateSelectionPolicy(policy);
  const rulesByIdentity = new Map(
    policy.rules.map((rule) => [
      descriptorIdentity(rule.cardId, rule.rawName),
      rule,
    ]),
  );
  const synchronizedWeaponGroupsByIdentity = new Map();
  for (const group of policy.synchronizedWeaponPolicy.groups) {
    for (const binding of group.bindings) {
      const identity = descriptorIdentity(binding.cardId, binding.rawName);
      const groups = synchronizedWeaponGroupsByIdentity.get(identity) ?? [];
      groups.push(group);
      synchronizedWeaponGroupsByIdentity.set(identity, groups);
    }
  }
  const ruleMatchCounts = new Map(
    policy.rules.map((rule) => [
      descriptorIdentity(rule.cardId, rule.rawName),
      0,
    ]),
  );
  const globalMatchCounts = new Map(
    policy.globalSuppressions.map((suppression) => [suppression.id, 0]),
  );
  const globalSourceEvidenceCounts = new Map(
    policy.globalSuppressions.map((suppression) => [suppression.id, 0]),
  );
  const descriptorIdentities = new Set();
  let rawPlacementCount = 0;
  let globalSuppressedOccurrenceCount = 0;
  let synchronizedWeaponFilteredOccurrenceCount = 0;
  let ruleFilteredOccurrenceCount = 0;

  const descriptors = sourceIndex.descriptors.map((descriptor) => {
    invariant(
      Array.isArray(descriptor.placements) && descriptor.placements.length > 0,
      `runtime visual descriptor has no placements: ${descriptor.cardId} / ${descriptor.rawName}`,
    );
    invariant(
      descriptor.requiredOccurrences === descriptor.placements.length,
      `runtime visual descriptor occurrence count mismatch: ${descriptor.cardId} / ${descriptor.rawName}`,
    );
    const identity = descriptorIdentity(descriptor.cardId, descriptor.rawName);
    invariant(
      !descriptorIdentities.has(identity),
      `duplicate runtime visual descriptor: ${descriptor.cardId} / ${descriptor.rawName}`,
    );
    descriptorIdentities.add(identity);
    invariant(
      descriptor.componentSuppressedOccurrences === undefined
        || Array.isArray(descriptor.componentSuppressedOccurrences),
      `runtime visual component suppression evidence is invalid: ${descriptor.cardId} / ${descriptor.rawName}`,
    );
    for (const evidence of descriptor.componentSuppressedOccurrences ?? []) {
      const suppression = policy.globalSuppressions.find(
        (candidate) => candidate.id === evidence.policyId,
      );
      if (!suppression) continue;
      invariant(
        typeof evidence.componentName === "string"
          && typeof evidence.sourceMeshPath === "string"
          && typeof evidence.actor === "string",
        `runtime visual source suppression evidence is incomplete: ${descriptor.cardId} / ${descriptor.rawName} / ${suppression.id}`,
      );
      invariant(
        suppression.componentNames.includes(evidence.componentName)
          && (
            !suppression.sourceMeshPaths
            || suppression.sourceMeshPaths.includes(evidence.sourceMeshPath)
          )
          && (
            !suppression.actorIncludes
            || suppression.actorIncludes.some(
              (needle) => evidence.actor.includes(needle),
            )
          ),
        `runtime visual source suppression evidence does not match policy: ${descriptor.cardId} / ${descriptor.rawName} / ${suppression.id}`,
      );
      globalSourceEvidenceCounts.set(
        suppression.id,
        (globalSourceEvidenceCounts.get(suppression.id) ?? 0) + 1,
      );
    }
    const occurrenceIds = new Set();
    for (const placement of descriptor.placements) {
      invariant(
        typeof placement.stableOccurrenceId === "string"
          && placement.stableOccurrenceId.length > 0,
        `runtime visual placement has no stableOccurrenceId: ${descriptor.cardId} / ${descriptor.rawName}`,
      );
      invariant(
        !occurrenceIds.has(placement.stableOccurrenceId),
        `duplicate runtime visual stableOccurrenceId: ${descriptor.cardId} / ${descriptor.rawName} / ${placement.stableOccurrenceId}`,
      );
      occurrenceIds.add(placement.stableOccurrenceId);
      invariant(
        typeof placement.assetUrl === "string" && placement.assetUrl.length > 0,
        `runtime visual placement has no assetUrl: ${descriptor.cardId} / ${descriptor.rawName}`,
      );
      invariant(
        typeof placement.actor === "string",
        `runtime visual placement has no actor: ${descriptor.cardId} / ${descriptor.rawName}`,
      );
      invariant(
        typeof placement.componentClassPath === "string",
        `runtime visual placement has no componentClassPath: ${descriptor.cardId} / ${descriptor.rawName}`,
      );
    }

    const rule = rulesByIdentity.get(identity);
    if (rule) ruleMatchCounts.set(identity, (ruleMatchCounts.get(identity) ?? 0) + 1);
    const selection = applyVisualSelection(
      descriptor,
      rule,
      policy.globalSuppressions,
      globalMatchCounts,
      synchronizedWeaponGroupsByIdentity.get(identity) ?? [],
    );
    invariant(
      selection.placements.length > 0,
      `runtime visual selection removed every placement: ${descriptor.cardId} / ${descriptor.rawName}`,
    );
    rawPlacementCount += descriptor.placements.length;
    globalSuppressedOccurrenceCount += selection.globalSuppressedOccurrences;
    synchronizedWeaponFilteredOccurrenceCount +=
      selection.synchronizedWeaponFilteredOccurrences;
    ruleFilteredOccurrenceCount += selection.ruleFilteredOccurrences;
    return projectSelectionInventory(descriptor, selection.placements);
  });

  for (const rule of policy.rules) {
    const identity = descriptorIdentity(rule.cardId, rule.rawName);
    invariant(
      ruleMatchCounts.get(identity) === 1,
      `visual selection rule did not match exactly one descriptor: ${rule.cardId} / ${rule.rawName}`,
    );
  }
  for (const suppression of policy.globalSuppressions) {
    invariant(
      (globalMatchCounts.get(suppression.id) ?? 0)
        + (globalSourceEvidenceCounts.get(suppression.id) ?? 0) > 0,
      `global visual suppression has neither runtime match nor source evidence: ${suppression.id}`,
    );
  }

  const rawSourceUrls = new Set(
    sourceIndex.descriptors.flatMap((descriptor) =>
      descriptor.placements.map((placement) => placement.assetUrl),
    ),
  );
  const selectedSourceUrls = new Set(
    descriptors.flatMap((descriptor) =>
      descriptor.placements.map((placement) => placement.assetUrl),
    ),
  );
  const selectedPlacementCount = descriptors.reduce(
    (total, descriptor) => total + descriptor.placements.length,
    0,
  );
  invariant(
    rawPlacementCount - selectedPlacementCount
      ===
        globalSuppressedOccurrenceCount +
          synchronizedWeaponFilteredOccurrenceCount +
          ruleFilteredOccurrenceCount,
    "runtime visual selection suppression accounting mismatch",
  );
  return {
    descriptors,
    summary: {
      descriptorCount: descriptors.length,
      rawPlacementCount,
      selectedPlacementCount,
      suppressedPlacementCount: rawPlacementCount - selectedPlacementCount,
      globalSuppressedOccurrenceCount,
      synchronizedWeaponFilteredOccurrenceCount,
      ruleFilteredOccurrenceCount,
      rawSourceAssetCount: rawSourceUrls.size,
      selectedSourceAssetCount: selectedSourceUrls.size,
      selectionRuleCount: policy.rules.length,
      synchronizedWeaponGroupCount:
        policy.synchronizedWeaponPolicy.groups.length,
      globalSuppressionRuleCount: policy.globalSuppressions.length,
      globalSuppressionMatches: Object.fromEntries(globalMatchCounts),
      globalSuppressionSourceEvidence: Object.fromEntries(
        globalSourceEvidenceCounts,
      ),
    },
  };
}

function assertDefaultReleaseClosure(summary, sourceIndexPath, selectionPolicyPath) {
  if (
    sourceIndexPath !== path.resolve(DEFAULT_SOURCE_INDEX)
    || selectionPolicyPath !== path.resolve(DEFAULT_SELECTION_POLICY)
  ) {
    return;
  }
  invariant(
    summary.descriptorCount === DEFAULT_RELEASE_CLOSURE.descriptors,
    `default runtime visual descriptor closure changed: ${summary.descriptorCount}`,
  );
  invariant(
    summary.rawSourceAssetCount === DEFAULT_RELEASE_CLOSURE.rawSourceAssets,
    `default raw runtime visual asset closure changed: ${summary.rawSourceAssetCount}`,
  );
  invariant(
    summary.selectedSourceAssetCount === DEFAULT_RELEASE_CLOSURE.selectedSourceAssets,
    `default selected runtime visual asset closure changed: ${summary.selectedSourceAssetCount}`,
  );
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function acquireExclusiveLock(cacheRoot, details) {
  const lockPath = path.join(cacheRoot, ".optimizer-lock");
  const resolvedCacheRoot = path.resolve(cacheRoot);
  const lockRelative = path.relative(resolvedCacheRoot, path.resolve(lockPath));
  invariant(
    lockRelative && !lockRelative.startsWith("..") && !path.isAbsolute(lockRelative),
    `optimizer lock escaped cache root: ${lockPath}`,
  );
  await mkdir(resolvedCacheRoot, { recursive: true });

  async function createLock() {
    const candidatePath = `${lockPath}.candidate-${process.pid}-${randomUUID()}`;
    await mkdir(candidatePath);
    try {
      await writeJson(path.join(candidatePath, "owner.json"), {
        schemaVersion: "runtime-visual-optimizer-lock/v1",
        pid: process.pid,
        hostname: hostname(),
        acquiredAt: new Date().toISOString(),
        ...details,
      });
      await rename(candidatePath, lockPath);
    } finally {
      await rm(candidatePath, { recursive: true, force: true });
    }
  }

  try {
    await createLock();
  } catch (error) {
    if (error?.code !== "EEXIST" && !(await exists(lockPath))) throw error;
    let owner;
    try {
      owner = await readJson(path.join(lockPath, "owner.json"));
    } catch {
      throw new Error(
        `runtime visual optimizer lock exists and cannot be verified: ${lockPath}`,
      );
    }
    const ownerPid = Number(owner?.pid);
    const stale = owner?.hostname === hostname()
      && Number.isInteger(ownerPid)
      && ownerPid > 0
      && !isProcessRunning(ownerPid);
    invariant(
      stale,
      `runtime visual optimizer is already locked by pid=${owner?.pid ?? "unknown"} host=${owner?.hostname ?? "unknown"}`,
    );
    await rm(lockPath, { recursive: true, force: true });
    try {
      await createLock();
    } catch (retryError) {
      if (retryError?.code === "EEXIST" || await exists(lockPath)) {
        throw new Error(`runtime visual optimizer lock was acquired concurrently: ${lockPath}`);
      }
      throw retryError;
    }
  }

  let releasePromise = null;
  return {
    lockPath,
    release() {
      if (!releasePromise) {
        releasePromise = rm(lockPath, { recursive: true, force: true });
      }
      return releasePromise;
    },
  };
}

function resourceExtension(json, resourceUri) {
  const image = json.images?.find((candidate) => candidate.uri === resourceUri);
  if (image) {
    if (image.mimeType === "image/webp") return "webp";
    if (image.mimeType === "image/png") return "png";
    if (image.mimeType === "image/jpeg") return "jpg";
  }
  const extension = path.extname(resourceUri).slice(1).toLowerCase();
  return extension || "bin";
}

function rootStats(document) {
  const root = document.getRoot();
  return {
    scenes: root.listScenes().length,
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    skins: root.listSkins().length,
    animations: root.listAnimations().length,
    textures: root.listTextures().length,
  };
}

function assertRoundTrip(before, after, sourceUrl) {
  invariant(after.scenes === before.scenes, `${sourceUrl}: scene count changed`);
  invariant(after.meshes > 0 && after.meshes <= before.meshes, `${sourceUrl}: invalid mesh count after optimization`);
  invariant(after.skins === before.skins, `${sourceUrl}: skin count changed`);
  invariant(after.animations === before.animations, `${sourceUrl}: animation count changed`);
  invariant(after.textures <= before.textures, `${sourceUrl}: texture count increased`);
}

function createIO() {
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.SILENT))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
}

async function optimizeAsset({
  sourceUrl,
  sourcePath,
  modelRoot,
  blobRoot,
}) {
  const io = createIO();
  const document = await io.read(sourcePath);
  const before = rootStats(document);
  invariant(before.scenes > 0 && before.meshes > 0, `${sourceUrl}: source glTF has no renderable scene`);

  await document.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      formats: /^image\/(png|jpeg)$/,
      slots: /^(normalTexture|occlusionTexture|metallicRoughnessTexture)$/,
      resize: [2048, 2048],
      quality: 95,
      effort: 72,
      nearLossless: true,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      formats: /^image\/(png|jpeg)$/,
      slots: /^(?!normalTexture$|occlusionTexture$|metallicRoughnessTexture$).*$/,
      resize: [2048, 2048],
      quality: 84,
      effort: 72,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  const { json, resources } = await io.writeJSON(document, {
    format: Format.GLTF,
    basename: "source.gltf",
  });
  const resourceRecords = [];
  const roundTripResources = {};
  for (const resourceUri of Object.keys(resources).sort((left, right) => left.localeCompare(right, "en"))) {
    const bytes = Buffer.from(resources[resourceUri]);
    const digest = sha256(bytes);
    const extension = resourceExtension(json, resourceUri);
    const outputName = `${digest}.${extension}`;
    const publicUrl = `${BLOB_URL_PREFIX}${outputName}`;
    const outputPath = path.join(blobRoot, outputName);
    await writeImmutable(outputPath, bytes);
    resourceRecords.push({
      sourceUri: resourceUri,
      url: publicUrl,
      sha256: digest,
      bytes: bytes.byteLength,
      extension,
    });
    roundTripResources[modelResourceUri(resourceRecords.at(-1))] = bytes;
  }

  const replacements = new Map(
    resourceRecords.map((record) => [record.sourceUri, modelResourceUri(record)]),
  );
  for (const buffer of json.buffers ?? []) {
    if (buffer.uri) buffer.uri = replacements.get(buffer.uri) ?? buffer.uri;
  }
  for (const image of json.images ?? []) {
    if (image.uri) image.uri = replacements.get(image.uri) ?? image.uri;
  }
  assertModelResourceClosure(json, resourceRecords, sourceUrl);

  const modelBytes = jsonBytes(json);
  const modelSha256 = sha256(modelBytes);
  const modelName = `${modelSha256}.gltf`;
  const modelPath = path.join(modelRoot, modelName);
  const modelUrl = `${MODEL_URL_PREFIX}${modelName}`;
  await writeImmutable(modelPath, modelBytes);

  const roundTrip = await createIO().readJSON({
    json,
    resources: roundTripResources,
  });
  const after = rootStats(roundTrip);
  assertRoundTrip(before, after, sourceUrl);

  const uniqueResourceBytes = new Map(
    resourceRecords.map((record) => [record.sha256, record.bytes]),
  );
  return {
    sourceUrl,
    modelUrl,
    modelSha256,
    modelBytes: modelBytes.byteLength,
    resourceBytes: [...uniqueResourceBytes.values()].reduce((total, bytes) => total + bytes, 0),
    resources: resourceRecords,
    sourceStats: before,
    optimizedStats: after,
  };
}

async function verifyContentAddressedFile(
  filePath,
  expectedSha256,
  expectedBytes,
  verificationCache,
) {
  const cacheKey = `${filePath}\u0000${expectedSha256}\u0000${expectedBytes}`;
  if (!verificationCache.has(cacheKey)) {
    verificationCache.set(cacheKey, (async () => {
      let bytes;
      try {
        bytes = await readFile(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
      invariant(
        bytes.byteLength === expectedBytes,
        `cached content-addressed file byte-length mismatch: ${filePath}`,
      );
      invariant(
        sha256(bytes) === expectedSha256,
        `cached content-addressed file SHA-256 mismatch: ${filePath}`,
      );
      return true;
    })());
  }
  return verificationCache.get(cacheKey);
}

function validateMigrationResource(resource, sourceUrl) {
  invariant(
    resource
      && typeof resource.sha256 === "string"
      && /^[0-9a-f]{64}$/.test(resource.sha256),
    `relative-resource migration blob SHA-256 is invalid: ${sourceUrl}`,
  );
  invariant(
    typeof resource.extension === "string"
      && /^[a-z0-9]+$/.test(resource.extension),
    `relative-resource migration blob extension is invalid: ${sourceUrl}`,
  );
  invariant(
    resource.url === `${BLOB_URL_PREFIX}${resource.sha256}.${resource.extension}`,
    `relative-resource migration blob URL is invalid: ${sourceUrl}`,
  );
  invariant(
    Number.isInteger(resource.bytes) && resource.bytes > 0,
    `relative-resource migration blob byte length is invalid: ${sourceUrl}`,
  );
}

async function migrateCachedRecordResourceUris({
  cached,
  checkpointSourceUrl,
  sourceGeneration,
  destinationOptimizerToolSha256,
  destinationOptimizationRecipeSha256,
  modelRoot,
  blobRoot,
  verificationCache,
}) {
  invariant(
    cached
      && cached.sourceUrl === checkpointSourceUrl
      && cached.optimizerToolSha256 === sourceGeneration.toolSha256
      && cached.optimizationRecipeSha256 === PRE_RELATIVE_URI_RECIPE_SHA256
      && typeof cached.modelSha256 === "string"
      && /^[0-9a-f]{64}$/.test(cached.modelSha256)
      && cached.modelUrl === `${MODEL_URL_PREFIX}${cached.modelSha256}.gltf`
      && Number.isInteger(cached.modelBytes)
      && cached.modelBytes > 0
      && Array.isArray(cached.resources),
    `relative-resource migration record identity is invalid: ${checkpointSourceUrl}`,
  );
  const resourceUrls = new Set();
  for (const resource of cached.resources) {
    validateMigrationResource(resource, checkpointSourceUrl);
    invariant(
      !resourceUrls.has(resource.url),
      `relative-resource migration has duplicate blob URL: ${checkpointSourceUrl}`,
    );
    resourceUrls.add(resource.url);
  }
  invariant(
    cached.resources.length > 0,
    `relative-resource migration has no blobs: ${checkpointSourceUrl}`,
  );
  const oldModelPath = path.join(modelRoot, `${cached.modelSha256}.gltf`);
  invariant(
    await verifyContentAddressedFile(
      oldModelPath,
      cached.modelSha256,
      cached.modelBytes,
      verificationCache,
    ),
    `relative-resource migration model is missing: ${checkpointSourceUrl}`,
  );
  const resourceChecks = await Promise.all(
    cached.resources.map((resource) =>
      verifyContentAddressedFile(
        path.join(blobRoot, `${resource.sha256}.${resource.extension}`),
        resource.sha256,
        resource.bytes,
        verificationCache,
      )),
  );
  invariant(
    resourceChecks.every(Boolean),
    `relative-resource migration blob is missing: ${checkpointSourceUrl}`,
  );

  const oldModelBytes = await readFile(oldModelPath);
  const json = JSON.parse(oldModelBytes.toString("utf8"));
  const expectedSourceUris = sourceGeneration.uriMode === "absolute"
    ? cached.resources.map((resource) => resource.url)
    : cached.resources.map(modelResourceUri);
  assertExactModelResourceUriSet(
    json,
    expectedSourceUris,
    checkpointSourceUrl,
    sourceGeneration.kind,
  );

  let modelBytes = oldModelBytes;
  if (sourceGeneration.uriMode === "absolute") {
    const replacements = new Map(
      cached.resources.map((resource) => [resource.url, modelResourceUri(resource)]),
    );
    for (const buffer of json.buffers ?? []) {
      if (buffer.uri) buffer.uri = replacements.get(buffer.uri) ?? buffer.uri;
    }
    for (const image of json.images ?? []) {
      if (image.uri) image.uri = replacements.get(image.uri) ?? image.uri;
    }
    assertModelResourceClosure(json, cached.resources, checkpointSourceUrl);
    modelBytes = jsonBytes(json);
  }
  const modelSha256 = sha256(modelBytes);
  const migratedModelPath = path.join(modelRoot, `${modelSha256}.gltf`);
  await writeImmutable(migratedModelPath, modelBytes);
  invariant(
    await verifyContentAddressedFile(
      migratedModelPath,
      modelSha256,
      modelBytes.byteLength,
      verificationCache,
    ),
    `relative-resource migration output model is missing: ${checkpointSourceUrl}`,
  );
  if (sourceGeneration.uriMode === "relative") {
    invariant(
      modelSha256 === cached.modelSha256
        && modelBytes.byteLength === cached.modelBytes,
      `provisional relative-resource migration changed model bytes: ${checkpointSourceUrl}`,
    );
  }
  return {
    ...cached,
    optimizationRecipeSha256: destinationOptimizationRecipeSha256,
    optimizerToolSha256: destinationOptimizerToolSha256,
    modelUrl: `${MODEL_URL_PREFIX}${modelSha256}.gltf`,
    modelSha256,
    modelBytes: modelBytes.byteLength,
  };
}

export async function migrateRelativeResourceUriCheckpoint({
  loadedCheckpoint,
  rawSourceUrls,
  destinationOptimizerToolSha256,
  destinationOptimizationRecipeSha256,
  modelRoot,
  blobRoot,
  checkpointPath,
  resolveCurrentSourceSignature,
  rebuildFinalRecord,
  sourceVerificationJobs = 1,
  expectedEntryCount = DEFAULT_RELEASE_CLOSURE.rawSourceAssets,
}) {
  invariant(
    loadedCheckpoint?.schemaVersion === CHECKPOINT_SCHEMA_VERSION,
    "relative-resource migration requires a v3 visual checkpoint",
  );
  invariant(
    loadedCheckpoint.sourceSignatureAlgorithm === SOURCE_SIGNATURE_ALGORITHM,
    "relative-resource migration source signature algorithm is invalid",
  );
  invariant(
    loadedCheckpoint.optimizationRecipeSha256 === PRE_RELATIVE_URI_RECIPE_SHA256,
    "relative-resource migration only accepts the exact pre-relative-URI recipe",
  );
  const sourceGenerationDefinition = RELATIVE_URI_MIGRATION_GENERATIONS.get(
    loadedCheckpoint.optimizerToolSha256,
  );
  invariant(
    sourceGenerationDefinition,
    "relative-resource migration only accepts the sealed legacy or provisional optimizer generation",
  );
  const sourceGeneration = {
    ...sourceGenerationDefinition,
    toolSha256: loadedCheckpoint.optimizerToolSha256,
  };
  invariant(
    typeof destinationOptimizerToolSha256 === "string"
      && /^[0-9a-f]{64}$/.test(destinationOptimizerToolSha256)
      && !RELATIVE_URI_MIGRATION_GENERATIONS.has(destinationOptimizerToolSha256),
    "relative-resource migration destination optimizer identity is invalid",
  );
  invariant(
    typeof destinationOptimizationRecipeSha256 === "string"
      && /^[0-9a-f]{64}$/.test(destinationOptimizationRecipeSha256)
      && destinationOptimizationRecipeSha256 !== PRE_RELATIVE_URI_RECIPE_SHA256,
    "relative-resource migration destination recipe identity is invalid",
  );
  invariant(
    typeof resolveCurrentSourceSignature === "function",
    "relative-resource migration requires a current source signature resolver",
  );
  invariant(
    Number.isInteger(sourceVerificationJobs)
      && sourceVerificationJobs >= 1
      && sourceVerificationJobs <= 8,
    "relative-resource migration source verification jobs must be between 1 and 8",
  );
  invariant(
    Array.isArray(rawSourceUrls)
      && rawSourceUrls.length === expectedEntryCount
      && new Set(rawSourceUrls).size === rawSourceUrls.length,
    `relative-resource migration raw source closure must contain exactly ${expectedEntryCount} unique entries`,
  );
  invariant(
    loadedCheckpoint.entries
      && typeof loadedCheckpoint.entries === "object"
      && !Array.isArray(loadedCheckpoint.entries),
    "relative-resource migration checkpoint entries must be an object",
  );
  const checkpointSourceUrls = Object.keys(loadedCheckpoint.entries);
  invariant(
    checkpointSourceUrls.length === expectedEntryCount,
    `relative-resource migration checkpoint must contain exactly ${expectedEntryCount} entries`,
  );
  const expectedSourceUrlSet = new Set(rawSourceUrls);
  for (const sourceUrl of checkpointSourceUrls) {
    invariant(
      expectedSourceUrlSet.has(sourceUrl),
      `relative-resource migration checkpoint has an unexpected source key: ${sourceUrl}`,
    );
  }
  for (const sourceUrl of rawSourceUrls) {
    invariant(
      Object.hasOwn(loadedCheckpoint.entries, sourceUrl),
      `relative-resource migration checkpoint is missing source key: ${sourceUrl}`,
    );
  }

  async function collectCurrentSourceSignatures(phase) {
    const checks = await mapConcurrent(
      [...rawSourceUrls].sort((left, right) => left.localeCompare(right, "en")),
      sourceVerificationJobs,
      async (sourceUrl) => {
        try {
          const signature = await resolveCurrentSourceSignature(sourceUrl);
          return { sourceUrl, signature };
        } catch (error) {
          return { sourceUrl, error };
        }
      },
    );
    const failure = checks.find((check) => check.error);
    if (failure) {
      throw new Error(
        `relative-resource migration ${phase} source verification failed: ${failure.sourceUrl}`,
        { cause: failure.error },
      );
    }
    const signatures = new Map();
    for (const { sourceUrl, signature } of checks) {
      invariant(
        typeof signature === "string" && /^[0-9a-f]{64}$/.test(signature),
        `relative-resource migration ${phase} source signature is invalid: ${sourceUrl}`,
      );
      signatures.set(sourceUrl, signature);
    }
    return signatures;
  }

  const initialSourceSignatures = await collectCurrentSourceSignatures("initial");
  const verificationCache = new Map();
  const migratedEntries = {};
  for (const sourceUrl of [...rawSourceUrls].sort((left, right) =>
    left.localeCompare(right, "en"))) {
    const cached = loadedCheckpoint.entries[sourceUrl];
    const currentSourceSignature = initialSourceSignatures.get(sourceUrl);
    const requiresExactRebuild = (
      sourceUrl === UNSIGNED_SUPPRESSED_SOURCE_REBUILD_URL
      && cached?.sourceSignature === undefined
    );
    if (!requiresExactRebuild) {
      invariant(
        cached?.sourceSignature === currentSourceSignature,
        `relative-resource migration source signature mismatch: ${sourceUrl}`,
      );
    }
    const migratedRecord = await migrateCachedRecordResourceUris({
      cached,
      checkpointSourceUrl: sourceUrl,
      sourceGeneration,
      destinationOptimizerToolSha256,
      destinationOptimizationRecipeSha256,
      modelRoot,
      blobRoot,
      verificationCache,
    });
    if (requiresExactRebuild) {
      invariant(
        typeof rebuildFinalRecord === "function",
        `relative-resource migration requires an exact rebuild for ${sourceUrl}`,
      );
      const rebuiltRecord = await rebuildFinalRecord({
        sourceUrl,
        sourceSignature: currentSourceSignature,
      });
      invariant(
        await cachedRecordIsValid(
          rebuiltRecord,
          sourceUrl,
          currentSourceSignature,
          destinationOptimizationRecipeSha256,
          destinationOptimizerToolSha256,
          modelRoot,
          blobRoot,
          verificationCache,
        ),
        `relative-resource migration exact rebuilt record is invalid: ${sourceUrl}`,
      );
      migratedEntries[sourceUrl] = rebuiltRecord;
    } else {
      migratedEntries[sourceUrl] = migratedRecord;
    }
  }
  const finalSourceSignatures = await collectCurrentSourceSignatures("final");
  for (const sourceUrl of rawSourceUrls) {
    invariant(
      finalSourceSignatures.get(sourceUrl) ===
        initialSourceSignatures.get(sourceUrl),
      `relative-resource migration source changed during migration: ${sourceUrl}`,
    );
    invariant(
      migratedEntries[sourceUrl].sourceSignature ===
        finalSourceSignatures.get(sourceUrl),
      `relative-resource migration result source signature mismatch: ${sourceUrl}`,
    );
  }
  const checkpoint = {
    ...loadedCheckpoint,
    optimizationRecipeSha256: destinationOptimizationRecipeSha256,
    optimizerToolSha256: destinationOptimizerToolSha256,
    entries: migratedEntries,
  };
  await writeJsonAtomic(checkpointPath, checkpoint);
  return {
    checkpoint,
    sourceGenerationKind: sourceGeneration.kind,
    migratedEntryCount: Object.keys(migratedEntries).length,
  };
}

async function cachedRecordIsValid(
  cached,
  sourceUrl,
  sourceSignature,
  optimizationRecipeSha256,
  optimizerToolSha256,
  modelRoot,
  blobRoot,
  verificationCache,
) {
  if (
    cached?.sourceUrl !== sourceUrl
    || cached.sourceSignature !== sourceSignature
    || cached.optimizationRecipeSha256 !== optimizationRecipeSha256
    || cached.optimizerToolSha256 !== optimizerToolSha256
    || typeof cached.modelSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(cached.modelSha256)
    || cached.modelUrl !== `${MODEL_URL_PREFIX}${cached.modelSha256}.gltf`
    || !Number.isInteger(cached.modelBytes)
    || cached.modelBytes <= 0
    || !Array.isArray(cached.resources)
  ) {
    return false;
  }
  const modelValid = await verifyContentAddressedFile(
    path.join(modelRoot, `${cached.modelSha256}.gltf`),
    cached.modelSha256,
    cached.modelBytes,
    verificationCache,
  );
  if (!modelValid) return false;
  const modelJson = JSON.parse(
    await readFile(path.join(modelRoot, `${cached.modelSha256}.gltf`), "utf8"),
  );
  assertModelResourceClosure(modelJson, cached.resources, sourceUrl);
  const resourceChecks = cached.resources.map((resource) => {
    invariant(
      typeof resource.sha256 === "string" && /^[0-9a-f]{64}$/.test(resource.sha256),
      `cached resource SHA-256 is invalid for ${sourceUrl}`,
    );
    invariant(
      typeof resource.extension === "string" && /^[a-z0-9]+$/.test(resource.extension),
      `cached resource extension is invalid for ${sourceUrl}`,
    );
    invariant(
      resource.url
        === `${BLOB_URL_PREFIX}${resource.sha256}.${resource.extension}`,
      `cached resource URL is invalid for ${sourceUrl}`,
    );
    invariant(
      Number.isInteger(resource.bytes) && resource.bytes >= 0,
      `cached resource byte length is invalid for ${sourceUrl}`,
    );
    return verifyContentAddressedFile(
      path.join(blobRoot, `${resource.sha256}.${resource.extension}`),
      resource.sha256,
      resource.bytes,
      verificationCache,
    );
  });
  return (await Promise.all(resourceChecks)).every(Boolean);
}

function projectPlacement(placement, assetUrl) {
  return {
    stableOccurrenceId: placement.stableOccurrenceId,
    name: placement.name,
    actor: placement.actor,
    assetUrl,
    matrix: placement.matrix,
    sourceMeshPath: placement.sourceMeshPath,
    componentClassPath: placement.componentClassPath,
    materialState: placement.materialState,
    runtimeBonePoseStatus: placement.runtimeBonePoseStatus,
    ...(placement.runtimeBonePoseSha256
      ? { runtimeBonePoseSha256: placement.runtimeBonePoseSha256 }
      : {}),
    ...(Number.isInteger(placement.runtimeBonePoseJointCount)
      ? { runtimeBonePoseJointCount: placement.runtimeBonePoseJointCount }
      : {}),
    ...(Number.isInteger(placement.runtimeBonePoseNormalTimeSampleCount)
      ? { runtimeBonePoseNormalTimeSampleCount: placement.runtimeBonePoseNormalTimeSampleCount }
      : {}),
    ...(typeof placement.runtimeBonePoseReferenceEquivalent === "boolean"
      ? { runtimeBonePoseReferenceEquivalent: placement.runtimeBonePoseReferenceEquivalent }
      : {}),
  };
}

function projectDescriptor(descriptor, optimizedByUrl) {
  const uniqueModels = new Map();
  const uniqueBlobs = new Map();
  const placements = descriptor.placements.map((placement) => {
    const optimized = optimizedByUrl.get(placement.assetUrl);
    invariant(optimized, `missing optimized visual mapping for ${placement.assetUrl}`);
    const currentModel = uniqueModels.get(optimized.modelUrl);
    if (currentModel) {
      invariant(
        currentModel.sha256 === optimized.modelSha256
          && currentModel.bytes === optimized.modelBytes,
        `optimized model URL identity conflict: ${optimized.modelUrl}`,
      );
    } else {
      uniqueModels.set(optimized.modelUrl, {
        sha256: optimized.modelSha256,
        bytes: optimized.modelBytes,
      });
    }
    for (const resource of optimized.resources) {
      const currentBlob = uniqueBlobs.get(resource.url);
      if (currentBlob) {
        invariant(
          currentBlob.sha256 === resource.sha256
            && currentBlob.bytes === resource.bytes,
          `optimized blob URL identity conflict: ${resource.url}`,
        );
      } else {
        uniqueBlobs.set(resource.url, {
          sha256: resource.sha256,
          bytes: resource.bytes,
        });
      }
    }
    return projectPlacement(placement, optimized.modelUrl);
  });
  const totalBytes = [...uniqueModels.values(), ...uniqueBlobs.values()]
    .reduce((total, asset) => total + asset.bytes, 0);
  return {
    schemaVersion: "runtime-visual-preview/v1",
    status: descriptor.status,
    visualAcceptanceStatus: descriptor.visualAcceptanceStatus,
    webUsable: descriptor.webUsable,
    cardId: descriptor.cardId,
    factionId: descriptor.factionId,
    targetKey: descriptor.targetKey,
    rawName: descriptor.rawName,
    variant: descriptor.variant,
    generatedClass: descriptor.generatedClass,
    vehicleId: descriptor.vehicleId,
    identitySha256: descriptor.identitySha256,
    packageSha256: descriptor.packageSha256,
    requiredOccurrences: descriptor.requiredOccurrences,
    sourceAssets: uniqueModels.size,
    totalBytes,
    runtimeBonePoseStatus: descriptor.runtimeBonePoseStatus,
    runtimeBonePoseOccurrenceCount: descriptor.runtimeBonePoseOccurrenceCount,
    runtimeBonePoseJointCount: descriptor.runtimeBonePoseJointCount,
    runtimeBonePoseReferenceEquivalentOccurrenceCount:
      descriptor.runtimeBonePoseReferenceEquivalentOccurrenceCount,
    placements,
    reason: descriptor.reason,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const sourceIndexPath = path.resolve(args["source-index"] ?? DEFAULT_SOURCE_INDEX);
  const selectionPolicyPath = path.resolve(
    args["selection-policy"] ?? DEFAULT_SELECTION_POLICY,
  );
  const publicRoot = path.resolve(args["public-root"] ?? DEFAULT_PUBLIC_ROOT);
  const cacheRoot = path.resolve(args["cache-root"] ?? DEFAULT_CACHE_ROOT);
  const modelRoot = path.resolve(args["model-root"] ?? path.join(cacheRoot, "models"));
  const blobRoot = path.resolve(args["blob-root"] ?? path.join(cacheRoot, "blobs"));
  const checkpointPath = path.resolve(args.checkpoint ?? path.join(cacheRoot, "checkpoint.json"));
  const releaseIndexPath = path.resolve(args["release-index"] ?? DEFAULT_RELEASE_INDEX);
  const releaseManifestPath = path.resolve(args.manifest ?? DEFAULT_RELEASE_MANIFEST);
  const optimizationRecipePath = path.resolve(
    args["optimization-recipe"] ?? DEFAULT_OPTIMIZATION_RECIPE,
  );
  const planOnly = Boolean(args["plan-only"]);
  const migrateRelativeResourceUris = Boolean(
    args["migrate-relative-resource-uris"],
  );
  const limit = args.limit ? Number(args.limit) : null;
  const jobs = Number(args.jobs ?? 2);
  invariant(limit === null || (Number.isInteger(limit) && limit > 0), "--limit must be a positive integer");
  invariant(Number.isInteger(jobs) && jobs >= 1 && jobs <= 8, "--jobs must be between 1 and 8");

  const [
    sourceIndexBytes,
    selectionPolicyBytes,
    optimizationRecipeBytes,
    optimizerToolBytes,
  ] = await Promise.all([
    readFile(sourceIndexPath),
    readFile(selectionPolicyPath),
    readFile(optimizationRecipePath),
    readFile(OPTIMIZER_TOOL_PATH),
  ]);
  const sourceIndex = JSON.parse(sourceIndexBytes.toString("utf8"));
  const selectionPolicy = JSON.parse(selectionPolicyBytes.toString("utf8"));
  const optimizationRecipe = JSON.parse(optimizationRecipeBytes.toString("utf8"));
  invariant(
    JSON.stringify(stable(optimizationRecipe)) ===
      JSON.stringify(stable(OPTIMIZATION_RECIPE)),
    "runtime visual optimization recipe does not match the implemented transform",
  );
  const installedDependencies = Object.fromEntries(
    await Promise.all(
      Object.entries(RECIPE_DEPENDENCY_PATHS).map(async ([name, packagePath]) => {
        const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
        return [name, packageDocument.version];
      }),
    ),
  );
  invariant(
    JSON.stringify(stable(installedDependencies)) ===
      JSON.stringify(stable(optimizationRecipe.dependencies)),
    "installed runtime visual optimizer dependencies do not match the recipe",
  );
  invariant(sourceIndex.schemaVersion === "runtime-visual-descriptor-index/v1", "unsupported visual source index");
  invariant(sourceIndex.descriptorCount === sourceIndex.descriptors.length, "visual source descriptor count mismatch");
  const selectionProjection = buildRuntimeSelectionProjection(
    sourceIndex,
    selectionPolicy,
  );
  assertDefaultReleaseClosure(
    selectionProjection.summary,
    sourceIndexPath,
    selectionPolicyPath,
  );
  const rawSourceUrls = [...new Set(
    sourceIndex.descriptors.flatMap((descriptor) =>
      descriptor.placements.map((placement) => placement.assetUrl),
    ),
  )].sort((left, right) => left.localeCompare(right, "en"));
  invariant(
    rawSourceUrls.length === selectionProjection.summary.rawSourceAssetCount,
    "runtime visual raw source closure count mismatch",
  );
  const sourceUrls = [...new Set(
    selectionProjection.descriptors.flatMap((descriptor) =>
      descriptor.placements.map((placement) => placement.assetUrl),
    ),
  )].sort((left, right) => left.localeCompare(right, "en"));
  invariant(sourceUrls.length > 0, "visual source index has no asset URLs");
  invariant(
    sourceUrls.length === selectionProjection.summary.selectedSourceAssetCount,
    "runtime visual selected source closure count mismatch",
  );
  const selectedUrls = limit === null ? sourceUrls : sourceUrls.slice(0, limit);
  const sourceIndexSha256 = sha256(
    canonicalTextBytes(sourceIndexBytes),
  );
  const selectionPolicySha256 = sha256(selectionPolicyBytes);
  const optimizationRecipeSha256 = sha256(jsonBytes(optimizationRecipe));
  const optimizerToolSha256 = sha256(optimizerToolBytes);

  if (planOnly) {
    process.stdout.write(`${JSON.stringify({
      event: "runtime-visual-optimization-plan",
      sourceIndexPath,
      sourceIndexSha256,
      selectionPolicyPath,
      selectionPolicySha256,
      optimizationRecipePath,
      optimizationRecipeSha256,
      optimizerToolSha256,
      selectedForOptimization: selectedUrls.length,
      expectedSourceAssetCount: sourceUrls.length,
      complete: selectedUrls.length === sourceUrls.length,
      ...selectionProjection.summary,
    })}\n`);
    return;
  }

  const lock = await acquireExclusiveLock(cacheRoot, {
    sourceIndexPath,
    sourceIndexSha256,
    selectionPolicyPath,
    selectionPolicySha256,
    optimizationRecipePath,
    optimizationRecipeSha256,
    optimizerToolSha256,
    checkpointPath,
  });
  const signalHandlers = new Map();
  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      process.stderr.write(
        `runtime visual optimizer interrupted by ${signal}; leaving the PID lock for stale recovery\n`,
      );
      process.exit(exitCode);
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  try {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    await mkdir(modelRoot, { recursive: true });
    await mkdir(blobRoot, { recursive: true });

    const loadedCheckpoint = await readJsonOr(checkpointPath, {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      sourceIndexSha256,
      sourceSignatureAlgorithm: SOURCE_SIGNATURE_ALGORITHM,
      optimizationRecipeSha256,
      optimizerToolSha256,
      entries: {},
    });
    const sourceIndexTransition = runtimeVisualSourceIndexTransition(
      loadedCheckpoint.sourceIndexSha256,
      sourceIndexSha256,
    );
    invariant(
      loadedCheckpoint.schemaVersion === CHECKPOINT_SCHEMA_VERSION,
      "unsupported visual optimization checkpoint; unsealed legacy checkpoint adoption is forbidden",
    );
    invariant(
      loadedCheckpoint.sourceSignatureAlgorithm
        === SOURCE_SIGNATURE_ALGORITHM,
      "unsupported visual optimization source signature algorithm",
    );
    let checkpoint;
    if (
      loadedCheckpoint.optimizationRecipeSha256 === optimizationRecipeSha256
      && loadedCheckpoint.optimizerToolSha256 === optimizerToolSha256
    ) {
      invariant(
        !migrateRelativeResourceUris,
        "relative-resource migration is already sealed; a second migration is forbidden",
      );
      checkpoint = loadedCheckpoint;
    } else if (
      loadedCheckpoint.optimizationRecipeSha256 ===
        optimizationRecipeSha256 &&
      SOURCE_INDEX_REBIND_PREVIOUS_TOOL_SHA256S.has(
        loadedCheckpoint.optimizerToolSha256,
      )
    ) {
      invariant(
        !migrateRelativeResourceUris,
        "source-index checkpoint rebinding cannot run with relative-resource migration",
      );
      checkpoint = structuredClone(loadedCheckpoint);
      const previousOptimizerToolSha256 =
        loadedCheckpoint.optimizerToolSha256;
      for (const [sourceUrl, record] of Object.entries(
        checkpoint.entries,
      )) {
        invariant(
          record.sourceUrl === sourceUrl &&
            record.optimizerToolSha256 ===
              previousOptimizerToolSha256,
          `source-index checkpoint rebinding found an unexpected record generation: ${sourceUrl}`,
        );
        record.optimizerToolSha256 = optimizerToolSha256;
      }
      checkpoint.optimizerToolSha256 = optimizerToolSha256;
      checkpoint.optimizerToolTransition = {
        previousOptimizerToolSha256,
        optimizerToolSha256,
        scope: "checkpoint-source-index-rebinding-only/v1",
        verification:
          "current-source-signatures-and-content-addressed-output-artifacts",
      };
    } else {
      invariant(
        migrateRelativeResourceUris,
        "runtime visual optimizer or recipe changed; use a new cache root, or pass --migrate-relative-resource-uris only for the sealed one-time relative-URI migration",
      );
      const migration = await migrateRelativeResourceUriCheckpoint({
        loadedCheckpoint,
        rawSourceUrls,
        destinationOptimizerToolSha256: optimizerToolSha256,
        destinationOptimizationRecipeSha256: optimizationRecipeSha256,
        modelRoot,
        blobRoot,
        checkpointPath,
        resolveCurrentSourceSignature: (sourceUrl) =>
          closureSignature(resolvePublicUrl(publicRoot, sourceUrl)),
        rebuildFinalRecord: async ({ sourceUrl, sourceSignature }) => ({
          ...(await optimizeAsset({
            sourceUrl,
            sourcePath: resolvePublicUrl(publicRoot, sourceUrl),
            modelRoot,
            blobRoot,
          })),
          sourceSignature,
          optimizationRecipeSha256,
          optimizerToolSha256,
        }),
        sourceVerificationJobs: jobs,
      });
      checkpoint = migration.checkpoint;
      process.stdout.write(`${JSON.stringify({
        event: "runtime-visual-relative-resource-uri-migration",
        migrationKind: migration.sourceGenerationKind,
        migratedEntryCount: migration.migratedEntryCount,
        previousOptimizationRecipeSha256:
          loadedCheckpoint.optimizationRecipeSha256,
        optimizationRecipeSha256,
        previousOptimizerToolSha256: loadedCheckpoint.optimizerToolSha256,
        optimizerToolSha256,
      })}\n`);
    }
    invariant(
      checkpoint.entries
        && typeof checkpoint.entries === "object"
        && !Array.isArray(checkpoint.entries),
      "visual optimization checkpoint entries must be an object",
    );

    const optimizedByUrl = new Map();
    const pending = [];
    const verificationCache = new Map();
    const sourceChecks = await mapConcurrent(selectedUrls, jobs, async (sourceUrl) => {
      const sourcePath = resolvePublicUrl(publicRoot, sourceUrl);
      const signature = await closureSignature(sourcePath);
      const cached = checkpoint.entries[sourceUrl];
      const cacheValid = await cachedRecordIsValid(
        cached,
        sourceUrl,
        signature,
        optimizationRecipeSha256,
        optimizerToolSha256,
        modelRoot,
        blobRoot,
        verificationCache,
      );
      return { sourceUrl, sourcePath, signature, cached, cacheValid };
    });
    const initialSourceSignatures = new Map(
      sourceChecks.map(({ sourceUrl, signature }) => [sourceUrl, signature]),
    );
    const initialSourceClosureSha256 = sourceClosureSha256(sourceChecks);
    for (const {
      sourceUrl,
      sourcePath,
      signature,
      cached,
      cacheValid,
    } of sourceChecks) {
      if (cacheValid) {
        optimizedByUrl.set(sourceUrl, cached);
        continue;
      }
      pending.push({ sourceUrl, sourcePath, sourceSignature: signature });
    }

    const startedAt = Date.now();
    let cursor = 0;
    const resumedFromCache = selectedUrls.length - pending.length;
    let completed = resumedFromCache;
    let processedThisRun = 0;
    let checkpointWriteChain = Promise.resolve();
    async function persistCheckpoint() {
      checkpointWriteChain = checkpointWriteChain.then(() =>
        writeJsonAtomic(checkpointPath, checkpoint));
      await checkpointWriteChain;
    }
    async function worker(workerId) {
      while (true) {
        const itemIndex = cursor;
        cursor += 1;
        if (itemIndex >= pending.length) return;
        const item = pending[itemIndex];
        const optimized = await optimizeAsset({
          sourceUrl: item.sourceUrl,
          sourcePath: item.sourcePath,
          modelRoot,
          blobRoot,
        });
        const record = {
          ...optimized,
          sourceSignature: item.sourceSignature,
          optimizationRecipeSha256,
          optimizerToolSha256,
        };
        checkpoint.entries[item.sourceUrl] = record;
        optimizedByUrl.set(item.sourceUrl, record);
        completed += 1;
        processedThisRun += 1;
        if (completed % 10 === 0 || completed === selectedUrls.length) {
          await persistCheckpoint();
          const elapsedSeconds = (Date.now() - startedAt) / 1000;
          process.stdout.write(`${JSON.stringify({
            event: "runtime-visual-optimization-progress",
            workerId,
            completed,
            total: selectedUrls.length,
            resumedFromCache,
            processedThisRun,
            elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
            modelsPerMinute: elapsedSeconds > 0
              ? Number(((processedThisRun * 60) / elapsedSeconds).toFixed(2))
              : null,
          })}\n`);
        }
      }
    }
    const workerResults = await Promise.allSettled(
      Array.from(
        { length: Math.min(jobs, Math.max(1, pending.length)) },
        (_, index) => worker(index + 1),
      ),
    );
    await persistCheckpoint();
    const failedWorker = workerResults.find((result) => result.status === "rejected");
    if (failedWorker) throw failedWorker.reason;

    const finalSourceChecks = await mapConcurrent(
      selectedUrls,
      jobs,
      async (sourceUrl) => ({
        sourceUrl,
        signature: await closureSignature(resolvePublicUrl(publicRoot, sourceUrl)),
      }),
    );
    for (const { sourceUrl, signature } of finalSourceChecks) {
      invariant(
        initialSourceSignatures.get(sourceUrl) === signature,
        `runtime visual source changed during optimization: ${sourceUrl}`,
      );
    }
    const finalSourceClosureSha256 = sourceClosureSha256(finalSourceChecks);
    invariant(
      finalSourceClosureSha256 === initialSourceClosureSha256,
      "runtime visual source closure changed during optimization",
    );
    if (sourceIndexTransition) {
      checkpoint.sourceIndexSha256 = sourceIndexSha256;
      checkpoint.sourceIndexTransition = sourceIndexTransition;
      await persistCheckpoint();
      process.stdout.write(`${JSON.stringify({
        event: "runtime-visual-source-index-rebound",
        ...sourceIndexTransition,
        sourceAssetCount: selectedUrls.length,
        sourceClosureSha256: finalSourceClosureSha256,
      })}\n`);
    }

    const selectedRecords = selectedUrls.map((url) => optimizedByUrl.get(url));
    invariant(selectedRecords.every(Boolean), "optimized visual mapping is incomplete");
    const uniqueModels = new Map();
    const uniqueResources = new Map();
    for (const record of selectedRecords) {
      const currentModel = uniqueModels.get(record.modelUrl);
      if (currentModel) {
        invariant(
          currentModel.modelSha256 === record.modelSha256
            && currentModel.modelBytes === record.modelBytes,
          `model URL identity conflict: ${record.modelUrl}`,
        );
      } else {
        uniqueModels.set(record.modelUrl, record);
      }
      for (const resource of record.resources) {
        const currentResource = uniqueResources.get(resource.url);
        if (currentResource) {
          invariant(
            currentResource.sha256 === resource.sha256
              && currentResource.bytes === resource.bytes,
            `resource URL identity conflict: ${resource.url}`,
          );
        } else {
          uniqueResources.set(resource.url, resource);
        }
      }
    }
    let releaseIndexBytes = null;
    if (selectedUrls.length === sourceUrls.length) {
      const descriptors = selectionProjection.descriptors.map((descriptor) =>
        projectDescriptor(descriptor, optimizedByUrl),
      );
      releaseIndexBytes = jsonBytes({
        schemaVersion: "runtime-visual-descriptor-index/v1",
        descriptorCount: descriptors.length,
        descriptors,
      });
      await writeJsonAtomic(
        releaseIndexPath,
        JSON.parse(releaseIndexBytes.toString("utf8")),
      );
    }

    const manifest = {
      schemaVersion: "runtime-visual-release-manifest/v1",
      sourceIndexSha256,
      selectionPolicySha256,
      optimizationRecipeSha256,
      optimizerToolSha256,
      ...(releaseIndexBytes
        ? {
            releaseIndexSha256: sha256(releaseIndexBytes),
            releaseIndexBytes: releaseIndexBytes.byteLength,
          }
        : {}),
      sourceSignatureAlgorithm: SOURCE_SIGNATURE_ALGORITHM,
      sourceClosureSha256: finalSourceClosureSha256,
      selection: selectionProjection.summary,
      complete: selectedUrls.length === sourceUrls.length,
      sourceAssetCount: selectedUrls.length,
      expectedSourceAssetCount: sourceUrls.length,
      rawSourceAssetCount: selectionProjection.summary.rawSourceAssetCount,
      uniqueModelCount: uniqueModels.size,
      uniqueBlobCount: uniqueResources.size,
      modelBytes: [...uniqueModels.values()].reduce(
        (total, record) => total + record.modelBytes,
        0,
      ),
      blobBytes: [...uniqueResources.values()].reduce(
        (total, resource) => total + resource.bytes,
        0,
      ),
      entries: Object.fromEntries(
        selectedRecords
          .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl, "en"))
          .map((record) => [
            record.sourceUrl,
            {
              modelUrl: record.modelUrl,
              sourceSignature: record.sourceSignature,
              modelSha256: record.modelSha256,
              modelBytes: record.modelBytes,
              resourceBytes: record.resourceBytes,
              resources: record.resources.map(({ url, sha256: digest, bytes, extension }) => ({
                url,
                sha256: digest,
                bytes,
                extension,
              })),
            },
          ]),
      ),
    };
    // The manifest is the commit marker for a complete optimizer generation.
    // Write the release index first and bind its exact bytes into this marker so
    // a crash between the two writes cannot publish mixed generations.
    await writeJsonAtomic(releaseManifestPath, manifest);

    process.stdout.write(`${JSON.stringify({
      event: "runtime-visual-optimization-complete",
      releaseManifestPath,
      releaseIndexPath: manifest.complete ? releaseIndexPath : null,
      complete: manifest.complete,
      sourceAssetCount: manifest.sourceAssetCount,
      expectedSourceAssetCount: manifest.expectedSourceAssetCount,
      rawSourceAssetCount: manifest.rawSourceAssetCount,
      uniqueModelCount: manifest.uniqueModelCount,
      uniqueBlobCount: manifest.uniqueBlobCount,
      sourceClosureSha256: manifest.sourceClosureSha256,
      bytes: manifest.modelBytes + manifest.blobBytes,
    })}\n`);
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    await lock.release();
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(OPTIMIZER_TOOL_PATH)
) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
