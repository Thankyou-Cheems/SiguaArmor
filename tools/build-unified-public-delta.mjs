// Build a content-addressed unified-public delta from a verified live manifest.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ARMOR_ORIGIN,
  originHostname,
} from "../lib/public-site-topology.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY_HELPERS_ROOT = path.join(REPO_ROOT, "tools", "deploy");
const CLIENT_ROOT = path.join(REPO_ROOT, "dist", "client");
const SERVER_ROOT = path.join(REPO_ROOT, "dist", "server");
const CLIENT_MANIFEST_PATH = path.join(CLIENT_ROOT, "release-manifest.json");
const APPLICATOR_SOURCE = path.join(
  DEPLOY_HELPERS_ROOT,
  "apply-unified-public-delta.mjs",
);
const VERIFY_SOURCE = path.join(
  DEPLOY_HELPERS_ROOT,
  "verify-candidate-receipt.mjs",
);
const PROBE_SOURCE = path.join(
  DEPLOY_HELPERS_ROOT,
  "preflight-public-probe.sh",
);
const ACTIVATE_TEMPLATE = path.join(
  DEPLOY_HELPERS_ROOT,
  "activate-unified-public-template.sh",
);

export function parseUnifiedPublicDeltaOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid unified-public delta argument near ${name ?? "<end>"}`);
    }
    if (values.has(name)) throw new Error(`duplicate unified-public delta argument: ${name}`);
    values.set(name, value);
  }
  const allowed = new Set([
    "--base-manifest",
    "--release-id",
    "--source-commit",
    "--output-root",
    "--overlay-manifest",
  ]);
  for (const name of values.keys()) {
    if (!allowed.has(name)) throw new Error(`unsupported unified-public delta argument: ${name}`);
  }
  for (const required of [
    "--base-manifest",
    "--release-id",
    "--source-commit",
  ]) {
    if (!values.has(required)) throw new Error(`missing unified-public delta argument: ${required}`);
  }
  const releaseId = values.get("--release-id");
  const sourceCommit = values.get("--source-commit");
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{5,79}$/u.test(releaseId)) {
    throw new Error(`invalid release ID: ${releaseId}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error(`invalid source commit: ${sourceCommit}`);
  }
  return {
    baseManifestPath: path.resolve(REPO_ROOT, values.get("--base-manifest")),
    releaseId,
    sourceCommit,
    outputRoot: path.resolve(
      REPO_ROOT,
      values.get("--output-root") ?? `outputs/deployment-${releaseId}`,
    ),
    overlayManifestPath: values.has("--overlay-manifest")
      ? path.resolve(REPO_ROOT, values.get("--overlay-manifest"))
      : null,
  };
}

let OUTPUT_ROOT;
let DELTA_ROOT;
let DELTA_FILES_ROOT;
let CURRENT_MANIFEST_PATH;
let SOURCE_COMMIT;
let RELEASE_ID;
let TARGET_SHORT;
let ARCHIVE_NAME;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalLfBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

async function readJsonRecord(filePath) {
  const bytes = await readFile(filePath);
  return {
    bytes,
    sha256: sha256(bytes),
    document: JSON.parse(bytes.toString("utf8")),
  };
}

function normalizedEntryPath(value) {
  invariant(typeof value === "string" && value.length > 0, "entry path is missing");
  invariant(!value.includes("\\"), `entry path uses a backslash: ${value}`);
  invariant(!path.posix.isAbsolute(value), `entry path is absolute: ${value}`);
  const normalized = path.posix.normalize(value);
  invariant(
    normalized === value && normalized !== "." && !normalized.startsWith("../"),
    `entry path escapes its root: ${value}`,
  );
  return normalized;
}

function contentKey(entry) {
  return `${entry.sha256}:${entry.bytes}`;
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        files.push(filePath);
      } else {
        throw new Error(`unsupported filesystem entry: ${filePath}`);
      }
    }
  }
  await visit(root);
  return files;
}

function relativePosix(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export async function readReleaseOverlayEntries(overlayManifestPath) {
  const manifestRecord = await readJsonRecord(overlayManifestPath);
  const manifest = manifestRecord.document;
  invariant(
    manifest.schemaVersion === "sigua-unified-public-overlay/v1",
    "release overlay manifest schema is invalid",
  );
  const manifestEntries = manifest.entries ?? [];
  const manifestRemovePaths = manifest.removePaths ?? [];
  invariant(Array.isArray(manifestEntries), "release overlay entries must be an array");
  invariant(
    Array.isArray(manifestRemovePaths),
    "release overlay removePaths must be an array",
  );
  invariant(
    manifestEntries.length > 0 || manifestRemovePaths.length > 0,
    "release overlay manifest contains no changes",
  );

  const seen = new Set();
  const entries = [];
  for (const item of manifestEntries) {
    const entryPath = normalizedEntryPath(item?.path);
    invariant(
      item?.create === undefined || typeof item.create === "boolean",
      `release overlay create flag must be boolean: ${entryPath}`,
    );
    invariant(
      entryPath !== "release-manifest.json" &&
        !entryPath.startsWith("squad/") &&
        !entryPath.startsWith("international-runtime/"),
      `release overlay cannot replace an authoritative generated path: ${entryPath}`,
    );
    invariant(!seen.has(entryPath), `duplicate release overlay path: ${entryPath}`);
    invariant(
      typeof item.source === "string" && item.source.length > 0,
      `release overlay source is missing: ${entryPath}`,
    );
    const sourcePath = path.resolve(path.dirname(overlayManifestPath), item.source);
    const metadata = await stat(sourcePath);
    invariant(metadata.isFile(), `release overlay source is not a file: ${entryPath}`);
    entries.push({
      entry: {
        path: entryPath,
        bytes: metadata.size,
        sha256: await sha256File(sourcePath),
      },
      sourcePath,
      create: item.create === true,
    });
    seen.add(entryPath);
  }
  const removePaths = [];
  for (const value of manifestRemovePaths) {
    const entryPath = normalizedEntryPath(value);
    invariant(
      entryPath !== "release-manifest.json" &&
        !entryPath.startsWith("squad/") &&
        !entryPath.startsWith("international-runtime/"),
      `release overlay cannot remove an authoritative generated path: ${entryPath}`,
    );
    invariant(!seen.has(entryPath), `duplicate release overlay path: ${entryPath}`);
    seen.add(entryPath);
    removePaths.push(entryPath);
  }
  return { manifestRecord, entries, removePaths };
}

async function runNative(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}`,
          ),
        );
      }
    });
  });
}

function addEntry(entries, sources, entry, sourcePath) {
  const entryPath = normalizedEntryPath(entry.path);
  invariant(!entries.has(entryPath), `duplicate target path: ${entryPath}`);
  invariant(
    Number.isSafeInteger(entry.bytes) && entry.bytes >= 0,
    `invalid bytes for ${entryPath}`,
  );
  invariant(
    typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256),
    `invalid SHA-256 for ${entryPath}`,
  );
  entries.set(entryPath, {
    path: entryPath,
    bytes: entry.bytes,
    sha256: entry.sha256,
  });
  if (sourcePath) {
    sources.set(entryPath, sourcePath);
  }
}

function replaceAssignment(source, name, value) {
  const pattern = new RegExp(`^${name}=.*$`, "mu");
  invariant(pattern.test(source), `activation template is missing ${name}`);
  return source.replace(pattern, `${name}=${value}`);
}

function replaceRequiredToken(source, token, value) {
  invariant(source.includes(token), `template is missing ${token}`);
  return source.replaceAll(token, value);
}

const main = async (options) => {
  OUTPUT_ROOT = options.outputRoot;
  DELTA_ROOT = path.join(OUTPUT_ROOT, "delta");
  DELTA_FILES_ROOT = path.join(DELTA_ROOT, "files");
  CURRENT_MANIFEST_PATH = options.baseManifestPath;
  SOURCE_COMMIT = options.sourceCommit;
  RELEASE_ID = options.releaseId;
  TARGET_SHORT = SOURCE_COMMIT.slice(0, 7);
  ARCHIVE_NAME = `unified-public-delta-${TARGET_SHORT}.tar.gz`;

  const allowedOutputRoot = path.join(REPO_ROOT, "outputs");
  const outputRelative = path.relative(allowedOutputRoot, OUTPUT_ROOT);
  invariant(
    outputRelative &&
      !outputRelative.startsWith("..") &&
      !path.isAbsolute(outputRelative),
    `deployment output must stay inside outputs/: ${OUTPUT_ROOT}`,
  );
  invariant(!(await exists(OUTPUT_ROOT)), `deployment output already exists: ${OUTPUT_ROOT}`);

  const [currentRecord, clientRecord] = await Promise.all([
    readJsonRecord(CURRENT_MANIFEST_PATH),
    readJsonRecord(CLIENT_MANIFEST_PATH),
  ]);
  const currentManifest = currentRecord.document;
  const clientManifest = clientRecord.document;
  invariant(
    currentManifest.schemaVersion === "sigua-unified-public-release/v1",
    "current combined manifest schema is invalid",
  );
  invariant(
    clientManifest.schemaVersion === "sigua-cdn-release/v1",
    "client release manifest schema is invalid",
  );
  invariant(
    currentManifest.entryCount === currentManifest.entries.length,
    "current combined entryCount is invalid",
  );
  invariant(
    clientManifest.entryCount === clientManifest.entries.length,
    "client entryCount is invalid",
  );

  const targetEntries = new Map();
  const targetSources = new Map();

  for (const entry of currentManifest.entries) {
    const entryPath = normalizedEntryPath(entry.path);
    if (entryPath.startsWith("squad/")) continue;
    if (entryPath.startsWith("international-runtime/dist/server/")) continue;
    addEntry(targetEntries, targetSources, entry);
  }

  let releaseOverlay = null;
  if (options.overlayManifestPath) {
    releaseOverlay = await readReleaseOverlayEntries(options.overlayManifestPath);
    for (const entryPath of releaseOverlay.removePaths) {
      invariant(
        targetEntries.has(entryPath),
        `release overlay removal is absent from the live manifest: ${entryPath}`,
      );
      targetEntries.delete(entryPath);
      targetSources.delete(entryPath);
    }
    for (const overlay of releaseOverlay.entries) {
      if (overlay.create) {
        invariant(
          !targetEntries.has(overlay.entry.path),
          `release overlay create target already exists in the live manifest: ${overlay.entry.path}`,
        );
      } else {
        invariant(
          targetEntries.has(overlay.entry.path),
          `release overlay replacement target is absent from the live manifest: ${overlay.entry.path}`,
        );
        targetEntries.delete(overlay.entry.path);
        targetSources.delete(overlay.entry.path);
      }
      addEntry(
        targetEntries,
        targetSources,
        overlay.entry,
        overlay.sourcePath,
      );
    }
  }

  for (const entry of clientManifest.entries) {
    const sourcePath = path.join(CLIENT_ROOT, ...entry.path.split("/"));
    addEntry(
      targetEntries,
      targetSources,
      {
        path: `squad/${entry.path}`,
        bytes: entry.bytes,
        sha256: entry.sha256,
      },
      sourcePath,
    );
    for (const [encoding, suffix] of [
      ["br", ".br"],
      ["gzip", ".gz"],
    ]) {
      const encoded = entry.encodings?.[encoding];
      if (!encoded) continue;
      addEntry(
        targetEntries,
        targetSources,
        {
          path: `squad/${entry.path}${suffix}`,
          bytes: encoded.bytes,
          sha256: encoded.sha256,
        },
        `${sourcePath}${suffix}`,
      );
    }
  }
  addEntry(
    targetEntries,
    targetSources,
    {
      path: "squad/release-manifest.json",
      bytes: clientRecord.bytes.byteLength,
      sha256: clientRecord.sha256,
    },
    CLIENT_MANIFEST_PATH,
  );

  const declaredClientPaths = new Set(
    [...targetEntries.keys()]
      .filter((entryPath) => entryPath.startsWith("squad/"))
      .map((entryPath) => entryPath.slice("squad/".length)),
  );
  const actualClientPaths = new Set(
    (await walkFiles(CLIENT_ROOT)).map((filePath) =>
      relativePosix(CLIENT_ROOT, filePath),
    ),
  );
  invariant(
    declaredClientPaths.size === actualClientPaths.size,
    `client closure count mismatch: declared ${declaredClientPaths.size}, actual ${actualClientPaths.size}`,
  );
  for (const entryPath of actualClientPaths) {
    invariant(declaredClientPaths.has(entryPath), `undeclared client file: ${entryPath}`);
  }

  for (const filePath of await walkFiles(SERVER_ROOT)) {
    const relativePath = relativePosix(SERVER_ROOT, filePath);
    const metadata = await stat(filePath);
    addEntry(
      targetEntries,
      targetSources,
      {
        path: `international-runtime/dist/server/${relativePath}`,
        bytes: metadata.size,
        sha256: await sha256File(filePath),
      },
      filePath,
    );
  }

  const entries = [...targetEntries.values()].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  const targetManifest = structuredClone(currentManifest);
  targetManifest.sources.monorepo.commit = SOURCE_COMMIT;
  targetManifest.sources.china.commit = SOURCE_COMMIT;
  targetManifest.sources.china.runtimeCommit = SOURCE_COMMIT;
  targetManifest.sources.international.commit = SOURCE_COMMIT;
  targetManifest.sources.international.sourceManifestSha256 = clientRecord.sha256;
  targetManifest.sources.international.entryCount = clientManifest.entryCount + 1;
  targetManifest.entryCount = entries.length;
  targetManifest.totalBytes = totalBytes;
  targetManifest.entries = entries;

  await mkdir(DELTA_FILES_ROOT, { recursive: true });
  const targetManifestPath = path.join(DELTA_ROOT, "release-manifest.json");
  await writeFile(
    targetManifestPath,
    `${JSON.stringify(targetManifest, null, 2)}\n`,
    "utf8",
  );
  const targetRecord = await readJsonRecord(targetManifestPath);

  const baseByContent = new Map();
  for (const entry of currentManifest.entries) {
    const candidates = baseByContent.get(contentKey(entry)) ?? [];
    candidates.push(entry.path);
    baseByContent.set(contentKey(entry), candidates);
  }
  const targetPaths = new Set(entries.map((entry) => entry.path));
  const removedPaths = currentManifest.entries
    .map((entry) => entry.path)
    .filter((entryPath) => !targetPaths.has(entryPath))
    .sort((left, right) => left.localeCompare(right, "en"));
  const uploadEntries = entries.filter(
    (entry) => !baseByContent.has(contentKey(entry)),
  );
  const reusedEntries = entries.filter((entry) =>
    baseByContent.has(contentKey(entry)),
  );

  for (const entry of uploadEntries) {
    const sourcePath = targetSources.get(entry.path);
    invariant(sourcePath, `upload entry has no local source: ${entry.path}`);
    const metadata = await stat(sourcePath);
    invariant(metadata.size === entry.bytes, `source bytes mismatch: ${entry.path}`);
    invariant(
      (await sha256File(sourcePath)) === entry.sha256,
      `source SHA-256 mismatch: ${entry.path}`,
    );
    const destination = path.join(
      DELTA_FILES_ROOT,
      ...entry.path.split("/"),
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  }

  const applicatorPath = path.join(
    DELTA_ROOT,
    "apply-unified-public-delta.mjs",
  );
  await copyFile(APPLICATOR_SOURCE, applicatorPath);
  const applicatorBytes = await readFile(applicatorPath);
  const uploadBytes = uploadEntries.reduce(
    (total, entry) => total + entry.bytes,
    0,
  );
  const reusedBytes = reusedEntries.reduce(
    (total, entry) => total + entry.bytes,
    0,
  );
  const deltaManifest = {
    schemaVersion: "sigua-unified-public-delta/v1",
    base: {
      manifestSha256: currentRecord.sha256,
      manifestBytes: currentRecord.bytes.byteLength,
      entryCount: currentManifest.entryCount,
      totalBytes: currentManifest.totalBytes,
    },
    target: {
      manifestSha256: targetRecord.sha256,
      manifestBytes: targetRecord.bytes.byteLength,
      entryCount: targetManifest.entryCount,
      totalBytes: targetManifest.totalBytes,
    },
    transfer: {
      uploadCount: uploadEntries.length,
      uploadBytes,
      reusedCount: reusedEntries.length,
      reusedBytes,
      removedCount: removedPaths.length,
      savedBytes: targetManifest.totalBytes - uploadBytes,
    },
    removedPathsSha256: sha256(
      Buffer.from(JSON.stringify(removedPaths), "utf8"),
    ),
    applicator: {
      path: "apply-unified-public-delta.mjs",
      bytes: applicatorBytes.byteLength,
      sha256: sha256(applicatorBytes),
    },
  };
  await writeFile(
    path.join(DELTA_ROOT, "delta-manifest.json"),
    `${JSON.stringify(deltaManifest, null, 2)}\n`,
    "utf8",
  );

  const [verifyBytes, probeBytes] = await Promise.all([
    readFile(VERIFY_SOURCE),
    readFile(PROBE_SOURCE),
  ]);
  const canonicalProbeBytes = canonicalLfBytes(
    Buffer.from(
      replaceRequiredToken(
        probeBytes.toString("utf8"),
        "__SIGUA_ARMOR_HOST__",
        originHostname(ARMOR_ORIGIN),
      ),
      "utf8",
    ),
  );
  invariant(
    !canonicalProbeBytes.includes(0x0d),
    "preflight probe must be packaged with LF line endings",
  );
  await Promise.all([
    writeFile(
      path.join(OUTPUT_ROOT, "verify-candidate-receipt.mjs"),
      verifyBytes,
    ),
    writeFile(
      path.join(OUTPUT_ROOT, "preflight-public-probe.sh"),
      canonicalProbeBytes,
    ),
  ]);

  const archivePath = path.join(OUTPUT_ROOT, ARCHIVE_NAME);
  await runNative("tar", ["-czf", archivePath, "-C", DELTA_ROOT, "."]);
  const archiveMetadata = await stat(archivePath);
  const archiveSha256 = await sha256File(archivePath);

  let activation = (await readFile(ACTIVATE_TEMPLATE, "utf8")).replace(/\r\n/gu, "\n");
  activation = replaceRequiredToken(
    activation,
    "__SIGUA_ARMOR_ORIGIN__",
    ARMOR_ORIGIN,
  );
  activation = replaceRequiredToken(
    activation,
    "__SIGUA_ARMOR_HOST__",
    originHostname(ARMOR_ORIGIN),
  );
  activation = replaceAssignment(activation, "RELEASE_ID", RELEASE_ID);
  activation = replaceAssignment(
    activation,
    "ARCHIVE",
    `"$INCOMING/${ARCHIVE_NAME}"`,
  );
  activation = replaceAssignment(activation, "EXPECTED_ARCHIVE", archiveSha256);
  activation = replaceAssignment(
    activation,
    "EXPECTED_BASE",
    currentRecord.sha256,
  );
  activation = replaceAssignment(
    activation,
    "EXPECTED_TARGET",
    targetRecord.sha256,
  );
  activation = replaceAssignment(
    activation,
    "EXPECTED_ENTRIES",
    String(targetManifest.entryCount),
  );
  activation = replaceAssignment(
    activation,
    "EXPECTED_TOTAL_BYTES",
    String(targetManifest.totalBytes),
  );
  activation = replaceAssignment(activation, "EXPECTED_COMMIT", SOURCE_COMMIT);
  activation = replaceAssignment(
    activation,
    "PREFLIGHT_RUNTIME",
    `sigua-international-candidate-${TARGET_SHORT}`,
  );
  activation = replaceAssignment(
    activation,
    "PREFLIGHT_ADMIN",
    `sigua-content-admin-candidate-${TARGET_SHORT}`,
  );
  activation = replaceAssignment(
    activation,
    "PREFLIGHT_PUBLIC",
    `sigua-public-candidate-${TARGET_SHORT}`,
  );
  await writeFile(path.join(OUTPUT_ROOT, "activate.sh"), activation, "utf8");

  const metadata = {
    schemaVersion: "sigua-unified-public-deployment/v2",
    releaseId: RELEASE_ID,
    sourceCommit: SOURCE_COMMIT,
    baseManifestSha256: currentRecord.sha256,
    targetManifestSha256: targetRecord.sha256,
    entryCount: targetManifest.entryCount,
    totalBytes: targetManifest.totalBytes,
    clientManifestSha256: clientRecord.sha256,
    archive: {
      name: ARCHIVE_NAME,
      bytes: archiveMetadata.size,
      sha256: archiveSha256,
    },
    transfer: deltaManifest.transfer,
    removedPathsSha256: deltaManifest.removedPathsSha256,
    releaseOverlay: releaseOverlay
      ? {
          manifestSha256: releaseOverlay.manifestRecord.sha256,
          entryCount: releaseOverlay.entries.length,
          removedCount: releaseOverlay.removePaths.length,
          pathsSha256: sha256(
            Buffer.from(
              JSON.stringify(
                [
                  ...releaseOverlay.entries.map(({ entry }) => entry.path),
                  ...releaseOverlay.removePaths.map((entryPath) => `-${entryPath}`),
                ],
              ),
              "utf8",
            ),
          ),
        }
      : null,
  };
  await writeFile(
    path.join(OUTPUT_ROOT, "deployment-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
};

const isCli =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main(parseUnifiedPublicDeltaOptions(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
