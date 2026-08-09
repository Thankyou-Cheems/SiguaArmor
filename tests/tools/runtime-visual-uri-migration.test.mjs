import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  migrateRelativeResourceUriCheckpoint,
  runtimeVisualSourceIndexTransition,
} from "../../tools/optimize-runtime-visuals.mjs";

const LEGACY_ABSOLUTE_URI_TOOL_SHA256 =
  "74f683ca25756315954e81527fde5d531e7362c8844dc55edfe63a0384ff938c";
const PROVISIONAL_RELATIVE_URI_TOOL_SHA256 =
  "3c7aa197422fe1f7ba2924fd02ddaa955110b4304b26cdff1235bb58cd163ab6";
const PRE_RELATIVE_URI_RECIPE_SHA256 =
  "6a17a82408c323084391f21c3e125ba1d6261973ece9720e3e495d5c8234ec6f";
const DESTINATION_TOOL_SHA256 = "d".repeat(64);
const DESTINATION_RECIPE_SHA256 = "e".repeat(64);
const UNSIGNED_SUPPRESSED_SOURCE_REBUILD_URL =
  "/assets/runtime-probe/visuals/63d1ed203da1b8e996201ed3fe87630d46f429f469d56241a25ff6758e0a29ee/asset-5231e99ffa0d44045b2382df/source.gltf";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createFixture(
  toolSha256,
  uriMode,
  sourceUrl = "/assets/runtime-probe/visuals/fixture/source.gltf",
) {
  const root = await mkdtemp(path.join(tmpdir(), "runtime-visual-uri-migration-"));
  const modelRoot = path.join(root, "models");
  const blobRoot = path.join(root, "blobs");
  const checkpointPath = path.join(root, "checkpoint.json");
  await Promise.all([
    mkdir(modelRoot, { recursive: true }),
    mkdir(blobRoot, { recursive: true }),
  ]);

  const blobBytes = Buffer.from("sealed-visual-blob", "utf8");
  const blobSha256 = sha256(blobBytes);
  const resource = {
    sourceUri: "source.bin",
    url: `/assets/runtime-probe/blob/${blobSha256}.bin`,
    sha256: blobSha256,
    bytes: blobBytes.byteLength,
    extension: "bin",
  };
  const modelUri = uriMode === "absolute"
    ? resource.url
    : `../blob/${blobSha256}.bin`;
  const modelBytes = Buffer.from(`${JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: blobBytes.byteLength, uri: modelUri }],
  })}\n`, "utf8");
  const modelSha256 = sha256(modelBytes);
  await Promise.all([
    writeFile(path.join(blobRoot, `${blobSha256}.bin`), blobBytes),
    writeFile(path.join(modelRoot, `${modelSha256}.gltf`), modelBytes),
  ]);

  const record = {
    sourceUrl,
    sourceSignature: "a".repeat(64),
    optimizationRecipeSha256: PRE_RELATIVE_URI_RECIPE_SHA256,
    optimizerToolSha256: toolSha256,
    modelUrl: `/assets/runtime-probe/models/${modelSha256}.gltf`,
    modelSha256,
    modelBytes: modelBytes.byteLength,
    resourceBytes: blobBytes.byteLength,
    resources: [resource],
  };
  const checkpoint = {
    schemaVersion: "runtime-visual-optimization-checkpoint/v3",
    sourceIndexSha256: "b".repeat(64),
    sourceSignatureAlgorithm: "sha256-content-closure/v1",
    optimizationRecipeSha256: PRE_RELATIVE_URI_RECIPE_SHA256,
    optimizerToolSha256: toolSha256,
    entries: { [sourceUrl]: record },
  };
  const checkpointBytes = Buffer.from(`${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await writeFile(checkpointPath, checkpointBytes);
  return {
    root,
    modelRoot,
    blobRoot,
    checkpointPath,
    checkpoint,
    checkpointBytes,
    sourceUrl,
    resource,
  };
}

async function runMigration(fixture, overrides = {}) {
  return migrateRelativeResourceUriCheckpoint({
    loadedCheckpoint: fixture.checkpoint,
    rawSourceUrls: [fixture.sourceUrl],
    destinationOptimizerToolSha256: DESTINATION_TOOL_SHA256,
    destinationOptimizationRecipeSha256: DESTINATION_RECIPE_SHA256,
    modelRoot: fixture.modelRoot,
    blobRoot: fixture.blobRoot,
    checkpointPath: fixture.checkpointPath,
    resolveCurrentSourceSignature: async () => "a".repeat(64),
    expectedEntryCount: 1,
    ...overrides,
  });
}

test("verified provisional generation is re-sealed without changing model bytes", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = await runMigration(fixture);
  assert.equal(result.sourceGenerationKind, "provisional-relative");
  assert.equal(result.migratedEntryCount, 1);
  assert.equal(
    result.checkpoint.optimizerToolSha256,
    DESTINATION_TOOL_SHA256,
  );
  assert.equal(
    result.checkpoint.optimizationRecipeSha256,
    DESTINATION_RECIPE_SHA256,
  );
  const migrated = result.checkpoint.entries[fixture.sourceUrl];
  assert.equal(
    migrated.modelSha256,
    fixture.checkpoint.entries[fixture.sourceUrl].modelSha256,
  );
  assert.equal(migrated.optimizerToolSha256, DESTINATION_TOOL_SHA256);
  assert.equal(
    migrated.optimizationRecipeSha256,
    DESTINATION_RECIPE_SHA256,
  );
  assert.deepEqual(
    JSON.parse(await readFile(fixture.checkpointPath, "utf8")),
    result.checkpoint,
  );
});

test("sealed legacy generation is rewritten to the relative blob URI ABI", async (t) => {
  const fixture = await createFixture(
    LEGACY_ABSOLUTE_URI_TOOL_SHA256,
    "absolute",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = await runMigration(fixture);
  assert.equal(result.sourceGenerationKind, "legacy-absolute");
  const migrated = result.checkpoint.entries[fixture.sourceUrl];
  assert.notEqual(
    migrated.modelSha256,
    fixture.checkpoint.entries[fixture.sourceUrl].modelSha256,
  );
  const model = JSON.parse(
    await readFile(
      path.join(fixture.modelRoot, `${migrated.modelSha256}.gltf`),
      "utf8",
    ),
  );
  assert.equal(
    model.buffers[0].uri,
    `../blob/${fixture.resource.sha256}.bin`,
  );
});

test("the one exact unsigned suppressed source is rebuilt into the final generation", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
    UNSIGNED_SUPPRESSED_SOURCE_REBUILD_URL,
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  delete fixture.checkpoint.entries[fixture.sourceUrl].sourceSignature;
  let rebuildCalls = 0;

  const result = await runMigration(fixture, {
    rebuildFinalRecord: async ({ sourceUrl, sourceSignature }) => {
      rebuildCalls += 1;
      return {
        ...fixture.checkpoint.entries[sourceUrl],
        sourceSignature,
        optimizationRecipeSha256: DESTINATION_RECIPE_SHA256,
        optimizerToolSha256: DESTINATION_TOOL_SHA256,
      };
    },
  });
  assert.equal(rebuildCalls, 1);
  assert.equal(
    result.checkpoint.entries[fixture.sourceUrl].sourceSignature,
    "a".repeat(64),
  );
});

test("unknown generations and per-record identity drift fail without checkpoint mutation", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  fixture.checkpoint.optimizerToolSha256 = "f".repeat(64);
  await assert.rejects(
    runMigration(fixture),
    /only accepts the sealed legacy or provisional optimizer generation/,
  );
  assert.deepEqual(
    await readFile(fixture.checkpointPath),
    fixture.checkpointBytes,
  );

  fixture.checkpoint.optimizerToolSha256 =
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256;
  fixture.checkpoint.entries[fixture.sourceUrl].sourceUrl = "/wrong/source.gltf";
  await assert.rejects(
    runMigration(fixture),
    /record identity is invalid/,
  );
  assert.deepEqual(
    await readFile(fixture.checkpointPath),
    fixture.checkpointBytes,
  );
});

test("tampered blobs fail closed without checkpoint mutation", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  await writeFile(
    path.join(
      fixture.blobRoot,
      `${fixture.resource.sha256}.${fixture.resource.extension}`,
    ),
    Buffer.from("tampered-visual-blob", "utf8"),
  );
  await assert.rejects(
    runMigration(fixture),
    /byte-length mismatch|SHA-256 mismatch/,
  );
  assert.deepEqual(
    await readFile(fixture.checkpointPath),
    fixture.checkpointBytes,
  );
});

test("non-relative provisional model URIs fail closed without checkpoint mutation", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const record = fixture.checkpoint.entries[fixture.sourceUrl];
  const model = {
    asset: { version: "2.0" },
    buffers: [{
      byteLength: fixture.resource.bytes,
      uri: fixture.resource.url,
    }],
  };
  const modelBytes = Buffer.from(`${JSON.stringify(model)}\n`, "utf8");
  const modelSha256 = sha256(modelBytes);
  await writeFile(
    path.join(fixture.modelRoot, `${modelSha256}.gltf`),
    modelBytes,
  );
  record.modelUrl = `/assets/runtime-probe/models/${modelSha256}.gltf`;
  record.modelSha256 = modelSha256;
  record.modelBytes = modelBytes.byteLength;
  const checkpointBytes = Buffer.from(
    `${JSON.stringify(fixture.checkpoint, null, 2)}\n`,
    "utf8",
  );
  await writeFile(fixture.checkpointPath, checkpointBytes);

  await assert.rejects(
    runMigration(fixture),
    /unexpected provisional-relative model resource URI/,
  );
  assert.deepEqual(await readFile(fixture.checkpointPath), checkpointBytes);
});

test("source closure changes between migration passes fail atomically", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  let signaturePass = 0;

  await assert.rejects(
    runMigration(fixture, {
      resolveCurrentSourceSignature: async () => {
        signaturePass += 1;
        return signaturePass === 1 ? "a".repeat(64) : "c".repeat(64);
      },
    }),
    /source changed during migration/,
  );
  assert.deepEqual(
    await readFile(fixture.checkpointPath),
    fixture.checkpointBytes,
  );
});

test("a sealed destination checkpoint rejects a second migration", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const first = await runMigration(fixture);
  const sealedBytes = await readFile(fixture.checkpointPath);
  fixture.checkpoint = first.checkpoint;

  await assert.rejects(
    runMigration(fixture),
    /only accepts the exact pre-relative-URI recipe/,
  );
  assert.deepEqual(await readFile(fixture.checkpointPath), sealedBytes);
});

test("migration requires the complete declared raw source closure", async (t) => {
  const fixture = await createFixture(
    PROVISIONAL_RELATIVE_URI_TOOL_SHA256,
    "relative",
  );
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  await assert.rejects(
    runMigration(fixture, { expectedEntryCount: 2 }),
    /must contain exactly 2 unique entries/,
  );
  assert.deepEqual(
    await readFile(fixture.checkpointPath),
    fixture.checkpointBytes,
  );
});

test("source index transitions retain their per-source verification contract", () => {
  const previousSourceIndexSha256 = "a".repeat(64);
  const sourceIndexSha256 = "b".repeat(64);
  assert.deepEqual(
    runtimeVisualSourceIndexTransition(
      previousSourceIndexSha256,
      sourceIndexSha256,
    ),
    {
      previousSourceIndexSha256,
      sourceIndexSha256,
      verification:
        "current-source-signatures-and-content-addressed-output-artifacts",
    },
  );
  assert.equal(
    runtimeVisualSourceIndexTransition(
      sourceIndexSha256,
      sourceIndexSha256,
    ),
    null,
  );
});
