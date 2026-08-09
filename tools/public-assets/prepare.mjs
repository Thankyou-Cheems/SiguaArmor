import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SOURCE_PUBLIC = path.join(ROOT, "public");
const SOURCE_MANIFEST = path.join(SOURCE_PUBLIC, "release-manifest.json");
const RELEASE_ROOT = path.join(ROOT, ".release");
const DEFAULT_RELEASE_PUBLIC = path.join(RELEASE_ROOT, "public");
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COPY_CONCURRENCY = 16;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function normalizedRelativePath(value) {
  invariant(typeof value === "string" && value.length > 0, "public asset path is missing");
  invariant(!value.includes("\\"), `public asset path must use forward slashes: ${value}`);
  invariant(!path.posix.isAbsolute(value), `public asset path is absolute: ${value}`);
  invariant(path.posix.normalize(value) === value, `public asset path is not normalized: ${value}`);
  invariant(
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    `public asset path is unsafe: ${value}`,
  );
  invariant(value !== "release-manifest.json", "release manifest cannot list itself");
  return value;
}

export function validatePublicManifest(manifest) {
  invariant(manifest?.schemaVersion === "sigua-public-release/v1", "unsupported public release manifest");
  invariant(Array.isArray(manifest.entries), "public release entries are missing");
  invariant(
    Number.isSafeInteger(manifest.entryCount) && manifest.entryCount === manifest.entries.length,
    "public release entry count differs",
  );
  invariant(
    Number.isSafeInteger(manifest.totalBytes) && manifest.totalBytes >= 0,
    "public release total byte count is invalid",
  );

  const seen = new Set();
  let totalBytes = 0;
  const entries = manifest.entries.map((entry) => {
    const relativePath = normalizedRelativePath(entry?.path);
    invariant(!seen.has(relativePath), `duplicate public asset path: ${relativePath}`);
    seen.add(relativePath);
    invariant(
      Number.isSafeInteger(entry?.bytes) && entry.bytes >= 0,
      `public asset byte count is invalid: ${relativePath}`,
    );
    invariant(
      SHA256_PATTERN.test(entry?.sha256 ?? ""),
      `public asset SHA-256 is invalid: ${relativePath}`,
    );
    totalBytes += entry.bytes;
    invariant(Number.isSafeInteger(totalBytes), "public release total byte count exceeds the safe range");
    return {
      path: relativePath,
      bytes: entry.bytes,
      sha256: entry.sha256,
    };
  });
  invariant(totalBytes === manifest.totalBytes, "public release total byte count differs");
  return entries;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyDeclaredFile(filePath, entry) {
  const metadata = await stat(filePath);
  invariant(metadata.isFile(), `public asset is not a file: ${entry.path}`);
  invariant(metadata.size === entry.bytes, `public asset byte count differs: ${entry.path}`);
  invariant(
    (await sha256File(filePath)) === entry.sha256,
    `public asset SHA-256 differs: ${entry.path}`,
  );
}

async function materializeFile(sourcePublic, stagingPublic, entry) {
  const source = path.join(sourcePublic, ...entry.path.split("/"));
  const destination = path.join(stagingPublic, ...entry.path.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await link(source, destination);
  } catch (error) {
    if (!["EACCES", "EPERM", "EXDEV", "ENOSYS"].includes(error?.code)) throw error;
    await copyFile(source, destination);
  }
  await verifyDeclaredFile(destination, entry);
}

async function mapWithConcurrency(items, concurrency, operation) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(items[index]);
    }
  }
  const results = await Promise.allSettled(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      () => worker(),
    ),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

export async function preparePublishedAssets({
  sourcePublic,
  releasePublic,
  sourceManifest = path.join(sourcePublic, "release-manifest.json"),
}) {
  const resolvedSource = path.resolve(sourcePublic);
  const resolvedRelease = path.resolve(releasePublic);
  invariant(resolvedSource !== resolvedRelease, "source and release public roots must differ");

  const manifestBytes = await readFile(sourceManifest);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const entries = validatePublicManifest(manifest);
  const preparedManifestBytes = Buffer.from(
    `${JSON.stringify({
      schemaVersion: manifest.schemaVersion,
      entryCount: manifest.entryCount,
      totalBytes: manifest.totalBytes,
      entries,
    }, null, 2)}\n`,
    "utf8",
  );
  const runId = `${process.pid}-${randomUUID()}`;
  const stagingPublic = path.join(
    path.dirname(resolvedRelease),
    `.${path.basename(resolvedRelease)}-staging-${runId}`,
  );
  const backupPublic = path.join(
    path.dirname(resolvedRelease),
    `.${path.basename(resolvedRelease)}-backup-${runId}`,
  );

  await mkdir(path.dirname(resolvedRelease), { recursive: true });
  await mkdir(stagingPublic);
  let backedUp = false;
  let committed = false;
  try {
    await mapWithConcurrency(entries, COPY_CONCURRENCY, (entry) =>
      materializeFile(resolvedSource, stagingPublic, entry)
    );
    await writeFile(
      path.join(stagingPublic, "release-manifest.json"),
      preparedManifestBytes,
    );
    if (await exists(resolvedRelease)) {
      await rename(resolvedRelease, backupPublic);
      backedUp = true;
    }
    await rename(stagingPublic, resolvedRelease);
    committed = true;
    if (backedUp) await rm(backupPublic, { recursive: true, force: true });
  } catch (error) {
    if (!committed) await rm(stagingPublic, { recursive: true, force: true });
    if (backedUp && !(await exists(resolvedRelease)) && (await exists(backupPublic))) {
      await rename(backupPublic, resolvedRelease);
    }
    throw error;
  }

  return {
    releasePublic: resolvedRelease,
    entryCount: manifest.entryCount,
    totalBytes: manifest.totalBytes,
  };
}

async function main() {
  const releasePublic = path.resolve(
    process.env.SIGUA_RELEASE_PUBLIC_DIR?.trim() || DEFAULT_RELEASE_PUBLIC,
  );
  const relativeRelease = path.relative(RELEASE_ROOT, releasePublic);
  invariant(
    relativeRelease !== "" &&
      !relativeRelease.startsWith(`..${path.sep}`) &&
      relativeRelease !== ".." &&
      path.basename(releasePublic) === "public",
    "release public root must be a .release subdirectory ending in /public",
  );
  const result = await preparePublishedAssets({
    sourcePublic: SOURCE_PUBLIC,
    releasePublic,
    sourceManifest: SOURCE_MANIFEST,
  });
  process.stdout.write(`${JSON.stringify({ event: "public-assets-prepared", ...result })}\n`);
}

const isMain = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
