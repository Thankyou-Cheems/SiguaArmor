import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validatePublicManifest } from "./prepare.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCK_PATH = path.join(ROOT, "public-assets.json");
const CACHE_ROOT = path.join(ROOT, ".local", "public-assets");
const PUBLIC_ROOT = path.join(ROOT, "public");
const PREPARED_MANIFEST = path.join(PUBLIC_ROOT, "release-manifest.json");
const TARGET_ROOTS = [
  path.join(PUBLIC_ROOT, "assets"),
  path.join(PUBLIC_ROOT, "images"),
];

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

function parseArguments(args) {
  const options = { archive: null, check: false, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--check") options.check = true;
    else if (value === "--force") options.force = true;
    else if (value === "--archive") {
      const archive = args[index + 1];
      invariant(archive && !archive.startsWith("--"), "--archive requires a path");
      options.archive = path.resolve(archive);
      index += 1;
    } else {
      throw new Error(`unsupported public asset argument: ${value}`);
    }
  }
  invariant(!(options.check && options.force), "--check and --force cannot be combined");
  return options;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFile(filePath, expected, label) {
  const metadata = await stat(filePath);
  invariant(metadata.isFile(), `${label} is not a file: ${filePath}`);
  invariant(metadata.size === expected.bytes, `${label} byte count differs: ${filePath}`);
  const digest = await sha256File(filePath);
  invariant(digest === expected.sha256, `${label} SHA-256 differs: ${filePath}`);
  return { bytes: metadata.size, sha256: digest };
}

function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    if (capture) {
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(capture ? Buffer.concat(stdout).toString("utf8") : "");
        return;
      }
      reject(new Error(
        `${command} failed with ${signal ? `signal ${signal}` : `exit ${code}`}` +
          (capture && stderr.length > 0
            ? `: ${Buffer.concat(stderr).toString("utf8").trim()}`
            : ""),
      ));
    });
  });
}

function validArchiveRecord(record, label) {
  invariant(
    typeof record?.name === "string" &&
      record.name.length > 0 &&
      path.basename(record.name) === record.name,
    `${label} name is invalid`,
  );
  invariant(/^[0-9a-f]{64}$/u.test(record.sha256 ?? ""), `${label} SHA-256 is invalid`);
  invariant(
    Number.isSafeInteger(record.bytes) && record.bytes > 0,
    `${label} byte count is invalid`,
  );
  invariant(
    /^[0-9a-f]{64}$/u.test(record.resultManifest?.sha256 ?? ""),
    `${label} result manifest SHA-256 is invalid`,
  );
  invariant(
    Number.isSafeInteger(record.resultManifest?.bytes) &&
      record.resultManifest.bytes > 0,
    `${label} result manifest byte count is invalid`,
  );
  let url;
  try {
    url = new URL(record.url);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }
  invariant(url.protocol === "https:", `${label} URL must use HTTPS`);
  return url;
}

function isGitHubHost(hostname) {
  return (
    hostname === "github.com" ||
    hostname.endsWith(".github.com") ||
    hostname === "githubusercontent.com" ||
    hostname.endsWith(".githubusercontent.com")
  );
}

export function validatePublicAssetLock(lock) {
  invariant(lock.schemaVersion === "sigua-armor-public-assets/v1", "unsupported public asset lock");
  invariant(
    lock.distribution?.purpose === "developer-and-ci-bootstrap" &&
      lock.distribution?.productionHotlinking === false,
    "public asset lock must remain a non-production bootstrap",
  );
  const bootstrapUrl = validArchiveRecord(lock.archive, "bootstrap archive");
  invariant(isGitHubHost(bootstrapUrl.hostname), "bootstrap archive must be a GitHub Release asset");
  invariant(Array.isArray(lock.incrementalArchives), "incremental archive list is missing");
  const seenNames = new Set([lock.archive.name]);
  for (const [index, archive] of lock.incrementalArchives.entries()) {
    const label = `incremental archive ${index + 1}`;
    const archiveUrl = validArchiveRecord(archive, label);
    invariant(
      !isGitHubHost(archiveUrl.hostname),
      `${label} must use the project-owned origin/CDN instead of GitHub`,
    );
    invariant(!seenNames.has(archive.name), `${label} name is duplicated`);
    seenNames.add(archive.name);
  }
  invariant(/^[0-9a-f]{64}$/u.test(lock.preparedManifest?.sha256 ?? ""), "invalid prepared manifest SHA-256");
  invariant(
    Number.isSafeInteger(lock.preparedManifest?.bytes) && lock.preparedManifest.bytes > 0,
    "invalid prepared manifest bytes",
  );
  const finalArchive = lock.incrementalArchives.at(-1) ?? lock.archive;
  invariant(
    finalArchive.resultManifest.bytes === lock.preparedManifest.bytes &&
      finalArchive.resultManifest.sha256 === lock.preparedManifest.sha256,
    "final archive result manifest differs from the prepared manifest lock",
  );
  return lock;
}

async function readLock() {
  return validatePublicAssetLock(JSON.parse(await readFile(LOCK_PATH, "utf8")));
}

async function verifyExtracted(lock) {
  for (const target of TARGET_ROOTS) {
    const entries = await readdir(target);
    invariant(entries.length > 0, `public asset directory is empty: ${target}`);
  }
  const preparedManifest = await verifyFile(
    PREPARED_MANIFEST,
    lock.preparedManifest,
    "prepared public manifest",
  );
  const manifest = JSON.parse(await readFile(PREPARED_MANIFEST, "utf8"));
  const entries = validatePublicManifest(manifest);
  for (const entry of entries) {
    const target = path.join(PUBLIC_ROOT, ...entry.path.split("/"));
    const metadata = await stat(target);
    invariant(metadata.isFile(), `public asset is not a file: ${entry.path}`);
    invariant(metadata.size === entry.bytes, `public asset byte count differs: ${entry.path}`);
  }
  return {
    preparedManifest,
    entryCount: entries.length,
    roots: TARGET_ROOTS.map((target) => path.relative(ROOT, target)),
  };
}

async function downloadArchive(archive) {
  await mkdir(CACHE_ROOT, { recursive: true });
  const destination = path.join(CACHE_ROOT, archive.name);
  if (await exists(destination)) {
    await verifyFile(destination, archive, "cached public asset archive");
    return destination;
  }
  const temporary = `${destination}.part-${process.pid}`;
  await rm(temporary, { force: true });
  const response = await fetch(archive.url, { redirect: "follow" });
  invariant(response.ok && response.body, `public asset download failed: HTTP ${response.status}`);
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(temporary, { flags: "wx" }),
    );
    await verifyFile(temporary, archive, "downloaded public asset archive");
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

async function currentManifestIdentity() {
  if (!(await exists(PREPARED_MANIFEST))) return null;
  const metadata = await stat(PREPARED_MANIFEST);
  if (!metadata.isFile()) return null;
  return { bytes: metadata.size, sha256: await sha256File(PREPARED_MANIFEST) };
}

function sameManifest(left, right) {
  return left?.bytes === right?.bytes && left?.sha256 === right?.sha256;
}

async function verifyArchivePaths(archivePath) {
  const listing = await run("tar", ["-tzf", archivePath], true);
  const entries = listing.split(/\r?\n/u).filter(Boolean);
  invariant(entries.length > 2, "public asset archive is empty");
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    const allowed =
      normalized === "public/release-manifest.json" ||
      normalized === "public/assets" ||
      normalized.startsWith("public/assets/") ||
      normalized === "public/images" ||
      normalized.startsWith("public/images/");
    invariant(allowed && !normalized.includes("../"), `unsafe public asset archive path: ${entry}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const lock = await readLock();
  const archives = [lock.archive, ...lock.incrementalArchives];
  if (options.check) {
    const result = await verifyExtracted(lock);
    process.stdout.write(`${JSON.stringify({ event: "public-assets-verified", ...result })}\n`);
    return;
  }

  let verificationFailure = null;
  try {
    const result = await verifyExtracted(lock);
    process.stdout.write(`${JSON.stringify({ event: "public-assets-reused", ...result })}\n`);
    return;
  } catch (error) {
    verificationFailure = error;
  }

  let startIndex = 0;
  if (options.force) {
    for (const target of TARGET_ROOTS) await rm(target, { recursive: true, force: true });
    await rm(PREPARED_MANIFEST, { force: true });
  } else {
    const current = await currentManifestIdentity();
    if (current) {
      const completedIndex = archives.findIndex((archive) =>
        sameManifest(current, archive.resultManifest)
      );
      invariant(
        completedIndex >= 0,
        "public assets do not match a known archive layer; inspect them or rerun with --force",
      );
      startIndex = completedIndex + 1;
      if (startIndex === archives.length) {
        throw new Error(
          "public assets have the final manifest but the closure is incomplete; rerun with --force",
          { cause: verificationFailure },
        );
      }
    } else if ((await Promise.all(TARGET_ROOTS.map(exists))).some(Boolean)) {
      throw new Error(
        "public asset directories exist without a known manifest; inspect them or rerun with --force",
        { cause: verificationFailure },
      );
    }
  }

  const appliedArchives = [];
  for (let index = startIndex; index < archives.length; index += 1) {
    const archive = archives[index];
    const archivePath = index === 0 && options.archive
      ? options.archive
      : await downloadArchive(archive);
    await verifyFile(archivePath, archive, "public asset archive");
    await verifyArchivePaths(archivePath);
    await run("tar", ["-xzf", archivePath, "-C", ROOT]);
    await verifyFile(
      PREPARED_MANIFEST,
      archive.resultManifest,
      `result manifest for ${archive.name}`,
    );
    appliedArchives.push(path.relative(ROOT, archivePath));
  }
  const result = await verifyExtracted(lock);
  process.stdout.write(`${JSON.stringify({
    event: "public-assets-restored",
    archives: appliedArchives,
    ...result,
  })}\n`);
}

const isMain = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
