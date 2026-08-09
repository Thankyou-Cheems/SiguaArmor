import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactRevision,
  canonicalJsonBytes,
  readJsonArtifact,
  reconcileExactArtifactDirectory,
  sha256,
  writeOrCheckArtifact,
} from "./lib/generated-json-artifact.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const VISUAL_ROOT = path.join(
  ROOT,
  "app",
  "runtime-probe-visuals",
);
const DELIVERY_ROOT = path.join(
  ROOT,
  "app",
  "runtime-probe-visual-delivery",
);
const OUTPUT_RELATIVE_PATH =
  "app/runtime-probe-visual-delivery-index.json";
const OUTPUT_PATH = path.join(
  ROOT,
  ...OUTPUT_RELATIVE_PATH.split("/"),
);
const INPUTS = {
  coreIndex: "app/runtime-probe-visual-index.json",
  supportIndex: "app/support-air-visual-index.json",
  coreRelease:
    "app/runtime-probe-visual-release-index.json",
  supportRelease:
    "app/support-air-visual-release-index.json",
  chinaRelease:
    "app/china-runtime-probe-visual-release-index.json",
  reviewIndex:
    "app/runtime-probe-visual-review-index.json",
};
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(
    `Runtime visual delivery index: unsupported arguments ${unknownArguments.join(", ")}`,
  );
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(
      `Runtime visual delivery index: ${message}`,
    );
  }
}

function identityKey(cardId, rawName) {
  return `${cardId}\u0000${rawName}`;
}

function validateIdentity(value, label) {
  invariant(
    typeof value?.cardId === "string" &&
      value.cardId.length > 0 &&
      typeof value.rawName === "string" &&
      value.rawName.length > 0,
    `${label} has no exact card/raw-name identity`,
  );
  return identityKey(value.cardId, value.rawName);
}

async function loadSourceFiles() {
  const { readdir, readFile } = await import(
    "node:fs/promises"
  );
  const filesByIdentity = new Map();
  const filesByPath = new Map();
  const entries = await readdir(VISUAL_ROOT, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".visual.json")) {
      continue;
    }
    const filePath = path.join(VISUAL_ROOT, entry.name);
    const bytes = await readFile(filePath);
    const canonicalSourceBytes = Buffer.from(
      bytes
        .toString("utf8")
        .replaceAll("\r\n", "\n")
        .replaceAll("\r", "\n"),
      "utf8",
    );
    let descriptor;
    try {
      descriptor = JSON.parse(
        canonicalSourceBytes.toString("utf8"),
      );
    } catch (error) {
      throw new Error(
        `Runtime visual delivery index: ${entry.name} is invalid JSON`,
        { cause: error },
      );
    }
    const key = validateIdentity(
      descriptor,
      `source ${entry.name}`,
    );
    invariant(
      descriptor.schemaVersion ===
        "runtime-visual-preview/v1" &&
        Array.isArray(descriptor.placements) &&
        descriptor.placements.length > 0 &&
        !filesByIdentity.has(key),
      `source ${entry.name} is malformed or duplicates ${key}`,
    );
    const source = {
      file: `./runtime-probe-visuals/${entry.name}`,
      descriptor,
      sha256: sha256(canonicalSourceBytes),
    };
    filesByIdentity.set(key, source);
    filesByPath.set(source.file, source);
  }
  invariant(
    filesByIdentity.size > 0 &&
      filesByPath.size === filesByIdentity.size,
    "visual source directory is empty or ambiguous",
  );
  return { filesByIdentity, filesByPath };
}

function sourceEntries(index, label) {
  invariant(
    index?.schemaVersion ===
      "runtime-visual-descriptor-index/v1" &&
      Number.isInteger(index.descriptorCount) &&
      index.descriptorCount > 0 &&
      Array.isArray(index.sources) &&
      index.sources.length === index.descriptorCount,
    `${label} source index is invalid`,
  );
  const entries = [];
  const reuseKeys = new Set();
  const sourcePaths = new Set();
  for (const source of index.sources) {
    invariant(
      typeof source?.path === "string" &&
        source.path.startsWith(
          "app/runtime-probe-visuals/",
        ) &&
        /^[a-f0-9]{64}$/u.test(source.sha256),
      `${label} contains an invalid source entry`,
    );
    const [file, reuse, ...rest] = source.path.split(
      "#reuse=",
    );
    invariant(
      rest.length === 0 &&
        file.endsWith(".visual.json"),
      `${label} source path is invalid: ${source.path}`,
    );
    const reuseParts = reuse?.split("/", 2);
    const reuseKey =
      reuseParts?.length === 2
        ? identityKey(reuseParts[0], reuseParts[1])
        : null;
    invariant(
      !reuseKey || !reuseKeys.has(reuseKey),
      `${label} duplicates reuse identity ${reuseKey}`,
    );
    if (reuseKey) reuseKeys.add(reuseKey);
    const normalizedFile =
      `./${file
        .replace(/^app[\\/]/u, "")
        .replaceAll("\\", "/")}`;
    sourcePaths.add(normalizedFile);
    entries.push({
      file: normalizedFile,
      declaredSha256: source.sha256,
      reuseKey,
    });
  }
  invariant(
    sourcePaths.size > 0,
    `${label} contains no physical source files`,
  );
  return entries;
}

function validateReleaseIndex(index, label) {
  invariant(
    Number.isInteger(index?.descriptorCount) &&
      index.descriptorCount > 0 &&
      Array.isArray(index.descriptors) &&
      index.descriptors.length === index.descriptorCount,
    `${label} release index is invalid`,
  );
  const identities = new Set();
  for (const descriptor of index.descriptors) {
    const key = validateIdentity(
      descriptor,
      `${label} descriptor`,
    );
    invariant(
      descriptor.schemaVersion ===
        "runtime-visual-preview/v1" &&
        Array.isArray(descriptor.placements) &&
        descriptor.placements.length > 0 &&
        !identities.has(key),
      `${label} descriptor ${key} is malformed or duplicated`,
    );
    identities.add(key);
  }
}

function buildEditionEntries({
  releaseIndex,
  sourceIndex,
  sourceFiles,
  label,
}) {
  validateReleaseIndex(releaseIndex, label);
  const sources = sourceEntries(sourceIndex, label);
  const sourceByIdentity = new Map();
  for (const source of sources) {
    const rawSource = sourceFiles.filesByPath.get(source.file);
    invariant(
      rawSource,
      `${label} source file is missing: ${source.file}`,
    );
    const sourceIdentity =
      source.reuseKey ??
      identityKey(
        rawSource.descriptor.cardId,
        rawSource.descriptor.rawName,
      );
    invariant(
      !sourceByIdentity.has(sourceIdentity),
      `${label} source identity is duplicated: ${sourceIdentity}`,
    );
    sourceByIdentity.set(sourceIdentity, source);
  }

  const entries = [];
  const shards = new Map();
  for (const descriptor of releaseIndex.descriptors) {
    const key = identityKey(
      descriptor.cardId,
      descriptor.rawName,
    );
    const source = sourceByIdentity.get(key);
    invariant(
      source,
      `${label} source file is missing for ${key}`,
    );
    const sourceFile = source.file.startsWith("./")
      ? source.file
      : `./${source.file.replaceAll("\\", "/")}`;
    const rawSource =
      sourceFiles.filesByPath.get(sourceFile);
    invariant(
      rawSource,
      `${label} raw source is missing for ${key}: ${sourceFile}`,
    );
    const sourceIndexSha256 = source.declaredSha256;
    invariant(
      /^[a-f0-9]{64}$/u.test(sourceIndexSha256),
      `${label} source index hash is missing for ${key}`,
    );
    const fileName =
      `${sha256(Buffer.from(key, "utf8"))}.visual.json`;
    const deliveryFile =
      `./runtime-probe-visual-delivery/${fileName}`;
    const deliveryBytes = canonicalJsonBytes(descriptor);
    invariant(
      !shards.has(fileName),
      `${label} delivery file identity collided: ${fileName}`,
    );
    shards.set(fileName, deliveryBytes);
    const compact = Object.fromEntries(
      Object.entries(descriptor).filter(
        ([field]) => field !== "placements",
      ),
    );
    entries.push({
      ...compact,
      file: deliveryFile,
      sourceFile,
      sourceIndexSha256,
      sourceSha256: rawSource.sha256,
      deliverySha256: sha256(deliveryBytes),
    });
  }
  return { entries, shards };
}

const inputEntries = await Promise.all(
  Object.entries(INPUTS).map(
    async ([key, relativePath]) => {
      const result = await readJsonArtifact(
        path.join(ROOT, ...relativePath.split("/")),
        relativePath,
      );
      return [key, { ...result, relativePath }];
    },
  ),
);
const inputs = Object.fromEntries(inputEntries);
const sourceFiles = await loadSourceFiles();
const core = buildEditionEntries({
  releaseIndex: inputs.coreRelease.value,
  sourceIndex: inputs.coreIndex.value,
  sourceFiles,
  label: "core",
});
const support = buildEditionEntries({
  releaseIndex: inputs.supportRelease.value,
  sourceIndex: inputs.supportIndex.value,
  sourceFiles,
  label: "support-air",
});
validateReleaseIndex(
  inputs.chinaRelease.value,
  "China",
);

const entries = [
  ...core.entries.map((entry) => ({
    ...entry,
    siteEdition: "international",
  })),
  ...support.entries.map((entry) => ({
    ...entry,
    siteEdition: "international",
  })),
].sort((left, right) =>
  identityKey(left.cardId, left.rawName).localeCompare(
    identityKey(right.cardId, right.rawName),
    "en",
  ),
);
const identities = entries.map((entry) =>
  identityKey(entry.cardId, entry.rawName),
);
invariant(
  new Set(identities).size === identities.length,
  "international delivery identities overlap",
);
invariant(
  inputs.reviewIndex.value.schemaVersion ===
    "runtime-visual-descriptor-index/v1" &&
    inputs.reviewIndex.value.descriptorCount ===
      entries.length &&
    inputs.reviewIndex.value.sources.length === entries.length,
  "review index does not close over international delivery",
);

const expectedShards = new Map([
  ...core.shards,
  ...support.shards,
]);
invariant(
  expectedShards.size === entries.length,
  "delivery shard names are not one-to-one with entries",
);
const shardResult =
  await reconcileExactArtifactDirectory({
    directory: DELIVERY_ROOT,
    expectedFiles: expectedShards,
    suffix: ".visual.json",
    checkOnly,
    label: "app/runtime-probe-visual-delivery",
  });

const sourceIndexes = Object.fromEntries(
  Object.entries(inputs).map(([key, input]) => [
    key,
    {
      path: input.relativePath,
      bytes: input.bytes.length,
      sha256: sha256(input.bytes),
    },
  ]),
);
const outputCore = {
  schemaVersion: "runtime-visual-delivery-index/v2",
  descriptorCount: entries.length,
  editionCounts: {
    china: inputs.chinaRelease.value.descriptorCount,
    international: entries.length,
  },
  reviewDescriptorCount:
    inputs.reviewIndex.value.descriptorCount,
  sourceIndexes,
  entries,
};
const output = {
  ...outputCore,
  indexRevision: artifactRevision(outputCore),
};
const outputBytes = canonicalJsonBytes(output);
const indexResult = await writeOrCheckArtifact({
  filePath: OUTPUT_PATH,
  bytes: outputBytes,
  checkOnly,
  label: OUTPUT_RELATIVE_PATH,
});

process.stdout.write(
  `${JSON.stringify({
    status: checkOnly ? "checked" : "built",
    outputPath: OUTPUT_RELATIVE_PATH,
    indexStatus: indexResult.status,
    shardStatus: shardResult.status,
    descriptorCount: entries.length,
    indexRevision: output.indexRevision,
    bytes: outputBytes.length,
    sha256: sha256(outputBytes),
    shardClosure: shardResult,
  })}\n`,
);
