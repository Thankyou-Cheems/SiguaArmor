import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const VINEXT = path.join(ROOT, "node_modules", "vinext", "dist", "cli.js");
const RELEASE_PUBLIC = path.resolve(
  process.env.SIGUA_RELEASE_PUBLIC_DIR?.trim() ||
    path.join(ROOT, ".release", "public"),
);
const PREPARED_RELEASE_MANIFEST = path.join(
  RELEASE_PUBLIC,
  "release-manifest.json",
);
const DIST_ROOT = path.join(ROOT, "dist");
const DIST_RELEASE_SUMMARY = path.join(
  ROOT,
  "generated",
  "dist-release-summary.json",
);
const QUICK_RELEASE_RECEIPT = path.join(
  ROOT,
  "outputs",
  "quick-release",
  "receipt.json",
);
const BUILD_LOCK = path.join(ROOT, ".release", ".public-release-build.lock");
const COMPILER_INPUT_ROOTS = [
  path.join(ROOT, "app"),
  path.join(ROOT, "lib"),
];
const COMPILER_INPUT_FILES = [
  path.join(ROOT, "config", "support-air-assets.json"),
  path.join(ROOT, "config", "vehicle-category-icons.json"),
  path.join(ROOT, "config", "runtime-visual-optimization-recipe.json"),
  path.join(ROOT, "config", "china-site-profile.json"),
  path.join(ROOT, "config", "china-runtime-texture-patches.json"),
  path.join(ROOT, "generated", "catalog-index.json"),
  path.join(ROOT, "generated", "china-catalog-index.json"),
  path.join(ROOT, "generated", "china-runtime-texture-patch-audit.json"),
  path.join(ROOT, "generated", "china-runtime-visual-release-manifest.json"),
  path.join(ROOT, "generated", "china-runtime-probe-card-impressions.json"),
  path.join(ROOT, "generated", "runtime-probe-card-impressions.json"),
  path.join(ROOT, "generated", "support-air-category-icons.json"),
  path.join(ROOT, "generated", "support-air-runtime-visual-release-manifest.json"),
  path.join(ROOT, "generated", "wiki-factions.json"),
  path.join(ROOT, "generated", "wiki-vehicles.json"),
  path.join(
    ROOT,
    "generated",
    "internal",
    "weapon-catalog.json",
  ),
  path.join(ROOT, "package.json"),
  path.join(ROOT, "package-lock.json"),
  path.join(ROOT, "tsconfig.json"),
  path.join(ROOT, "vite.config.ts"),
];
let activeBuildLock = null;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function publicReleaseBuildMode(args) {
  if (args.length === 0) return "full";
  if (args.length === 1 && args[0] === "--quick") return "quick";
  throw new Error(`unsupported public release build arguments: ${args.join(" ")}`);
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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function renameReplaceWithRetry(sourcePath, destinationPath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      const transient =
        process.platform === "win32" &&
        ["EACCES", "EBUSY", "EPERM"].includes(error?.code);
      if (!transient || attempt === 5) throw error;
      await new Promise((resolve) => {
        setTimeout(resolve, 25 * (2 ** attempt));
      });
    }
  }
}

async function acquireBuildLock() {
  const token = randomUUID();
  const ownerPath = path.join(BUILD_LOCK, "owner.json");
  const owner = {
    schemaVersion: "sigua-public-release-build-lock/v1",
    hostname: hostname(),
    pid: process.pid,
    token,
    activeChildPid: null,
  };
  await mkdir(path.dirname(BUILD_LOCK), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidatePath = `${BUILD_LOCK}.candidate-${process.pid}-${token}-${attempt}`;
    try {
      await mkdir(candidatePath);
      try {
        await writeFile(
          path.join(candidatePath, "owner.json"),
          jsonBytes(owner),
          { flag: "wx" },
        );
        await rename(candidatePath, BUILD_LOCK);
      } finally {
        await rm(candidatePath, { recursive: true, force: true });
      }
      async function persistOwner() {
        const temporaryPath = path.join(
          BUILD_LOCK,
          `.owner.json.tmp-${process.pid}-${randomUUID()}`,
        );
        try {
          await writeFile(temporaryPath, jsonBytes(owner), { flag: "wx" });
          await renameReplaceWithRetry(temporaryPath, ownerPath);
        } finally {
          await rm(temporaryPath, { force: true });
        }
      }
      return {
        async setActiveChild(pid) {
          const current = JSON.parse(await readFile(ownerPath, "utf8"));
          if (current.token !== token) {
            throw new Error("public release build lock ownership changed");
          }
          owner.activeChildPid = Number.isInteger(pid) && pid > 0 ? pid : null;
          await persistOwner();
        },
        async release() {
          try {
            const current = JSON.parse(await readFile(ownerPath, "utf8"));
            if (current.token === token) {
              await rm(BUILD_LOCK, { recursive: true, force: true });
            }
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST" && !(await exists(BUILD_LOCK))) throw error;
      let current;
      try {
        current = JSON.parse(await readFile(ownerPath, "utf8"));
      } catch (readError) {
        throw new Error(`public release build lock is unreadable: ${BUILD_LOCK}`, {
          cause: readError,
        });
      }
      const currentPid = Number(current.pid);
      const currentChildPid = Number(current.activeChildPid);
      const stale = current.hostname === hostname() &&
        Number.isInteger(currentPid) &&
        currentPid > 0 &&
        !processIsAlive(currentPid) &&
        (
          !Number.isInteger(currentChildPid) ||
          currentChildPid <= 0 ||
          !processIsAlive(currentChildPid)
        );
      if (!stale) {
        throw new Error(
          `public release build is already running in PID ${current.pid ?? "unknown"} on ${current.hostname ?? "unknown"}`,
        );
      }
      if (attempt === 0) {
        const stalePath = `${BUILD_LOCK}.stale-${token}`;
        try {
          await rename(BUILD_LOCK, stalePath);
          await rm(stalePath, { recursive: true, force: true });
        } catch (renameError) {
          if (renameError?.code !== "ENOENT") throw renameError;
        }
        continue;
      }
      throw new Error(`public release build lock could not be acquired: ${BUILD_LOCK}`);
    }
  }
  throw new Error(`public release build lock could not be acquired: ${BUILD_LOCK}`);
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.isFile()) files.push(filePath);
    }
  }
  await visit(root);
  return files;
}

async function compilerInputFiles() {
  return [...new Set([
    ...COMPILER_INPUT_FILES,
    ...(await Promise.all(COMPILER_INPUT_ROOTS.map((root) => walkFiles(root)))).flat(),
  ].map((filePath) => path.resolve(filePath)))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function snapshotCompilerInputs() {
  const uniqueFiles = await compilerInputFiles();
  const snapshot = new Map();
  for (const filePath of uniqueFiles) {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`compiler input is not a file: ${filePath}`);
    snapshot.set(filePath, sha256(await readFile(filePath)));
  }
  return snapshot;
}

async function assertCompilerInputsUnchanged(snapshot) {
  const currentFiles = await compilerInputFiles();
  if (
    currentFiles.length !== snapshot.size ||
    currentFiles.some((filePath) => !snapshot.has(filePath))
  ) {
    throw new Error("compiler input path closure changed during release build");
  }
  for (const [filePath, expectedSha256] of snapshot) {
    if (!(await exists(filePath))) {
      throw new Error(`compiler input disappeared during release build: ${filePath}`);
    }
    const actualSha256 = sha256(await readFile(filePath));
    if (actualSha256 !== expectedSha256) {
      throw new Error(`compiler input changed during release build: ${filePath}`);
    }
  }
}

async function snapshotPreparedPublicClosure() {
  const manifestBytes = await readFile(PREPARED_RELEASE_MANIFEST);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest?.schemaVersion !== "sigua-public-release/v1" ||
    !Array.isArray(manifest.entries) ||
    manifest.entryCount !== manifest.entries.length
  ) {
    throw new Error("prepared public release manifest is invalid");
  }
  const expected = new Map([
    [
      "release-manifest.json",
      {
        bytes: manifestBytes.byteLength,
        sha256: sha256(manifestBytes),
      },
    ],
  ]);
  for (const entry of manifest.entries) {
    if (
      typeof entry?.path !== "string" ||
      entry.path.length === 0 ||
      entry.path.includes("\\") ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      throw new Error("prepared public release entry is invalid");
    }
    if (expected.has(entry.path)) {
      throw new Error(`duplicate prepared public release entry: ${entry.path}`);
    }
    expected.set(entry.path, {
      bytes: entry.bytes,
      sha256: entry.sha256,
    });
  }
  const actualFiles = await walkFiles(RELEASE_PUBLIC);
  const actual = new Map();
  for (const filePath of actualFiles) {
    const relativePath = path
      .relative(RELEASE_PUBLIC, filePath)
      .split(path.sep)
      .join("/");
    const bytes = await readFile(filePath);
    actual.set(relativePath, {
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  if (
    actual.size !== expected.size ||
    [...expected.keys()].some((relativePath) => !actual.has(relativePath))
  ) {
    throw new Error("staged public directory does not match the prepared release closure");
  }
  for (const [relativePath, declaration] of expected) {
    const artifact = actual.get(relativePath);
    if (
      artifact.bytes !== declaration.bytes ||
      artifact.sha256 !== declaration.sha256
    ) {
      throw new Error(`staged public asset differs from its declaration: ${relativePath}`);
    }
  }
  return actual;
}

async function assertPreparedPublicClosureUnchanged(snapshot) {
  const current = await snapshotPreparedPublicClosure();
  if (
    current.size !== snapshot.size ||
    [...snapshot].some(([relativePath, declaration]) => {
      const artifact = current.get(relativePath);
      return (
        !artifact ||
        artifact.bytes !== declaration.bytes ||
        artifact.sha256 !== declaration.sha256
      );
    })
  ) {
    throw new Error("prepared public closure changed during release build");
  }
}

function snapshotSha256(snapshot, pathLabel) {
  const entries = [...snapshot]
    .map(([filePath, declaration]) => ({
      path: pathLabel(filePath),
      ...(typeof declaration === "string"
        ? { sha256: declaration }
        : declaration),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  return sha256(jsonBytes(entries));
}

async function writeQuickReleaseReceipt(
  preparedPublicClosure,
  compilerInputs,
) {
  const [preparedManifestBytes, clientManifestBytes, summaryBytes] =
    await Promise.all([
      readFile(PREPARED_RELEASE_MANIFEST),
      readFile(path.join(DIST_ROOT, "client", "release-manifest.json")),
      readFile(DIST_RELEASE_SUMMARY),
    ]);
  const summary = JSON.parse(summaryBytes.toString("utf8"));
  const receipt = {
    schemaVersion: "sigua-quick-release-receipt/v1",
    buildMode: "quick",
    createdAt: new Date().toISOString(),
    preparedManifestSha256: sha256(preparedManifestBytes),
    preparedEntryCount: preparedPublicClosure.size,
    preparedClosureSha256: snapshotSha256(
      preparedPublicClosure,
      (relativePath) => relativePath,
    ),
    compilerInputCount: compilerInputs.size,
    compilerInputClosureSha256: snapshotSha256(
      compilerInputs,
      (filePath) => path.relative(ROOT, filePath).split(path.sep).join("/"),
    ),
    clientManifestSha256: sha256(clientManifestBytes),
    clientEntryCount: summary.entryCount,
    clientTotalBytes: summary.totalBytes,
  };
  await mkdir(path.dirname(QUICK_RELEASE_RECEIPT), { recursive: true });
  await writeFile(QUICK_RELEASE_RECEIPT, jsonBytes(receipt));
  process.stdout.write(`${JSON.stringify({
    event: "quick-release-receipt",
    path: path.relative(ROOT, QUICK_RELEASE_RECEIPT).split(path.sep).join("/"),
    ...receipt,
  })}\n`);
}

async function run(label, command, args, extraEnvironment = {}) {
  process.stdout.write(`\n[release] ${label}\n`);
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...extraEnvironment,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
  try {
    await activeBuildLock?.setActiveChild(child.pid);
  } catch (error) {
    child.kill();
    throw error;
  }
  try {
    await completion;
  } finally {
    await activeBuildLock?.setActiveChild(null);
  }
}

async function main() {
  process.env.SIGUA_VALIDATION_MODE = "release";
  const buildMode = publicReleaseBuildMode(process.argv.slice(2));
  const releaseBuildLock = await acquireBuildLock();
  activeBuildLock = releaseBuildLock;
  const releaseEnvironment = {
    SIGUA_RELEASE_PUBLIC_DIR: RELEASE_PUBLIC,
    NODE_ENV: "production",
  };
  try {
    if (buildMode === "full") {
      await run("verify published browser assets", NODE, [
        path.join(ROOT, "tools", "public-assets", "restore.mjs"),
        "--check",
      ]);
      await run("prepare exact public closure", NODE, [
        path.join(ROOT, "tools", "public-assets", "prepare.mjs"),
      ]);
    } else {
      process.stdout.write(
        `${JSON.stringify({
          event: "public-release-build-mode",
          mode: "quick",
          policy:
            "reuse and verify the existing prepared public closure; rebuild application outputs only",
        })}\n`,
      );
    }
    const preparedPublicClosure = await snapshotPreparedPublicClosure();
    const compilerInputs = await snapshotCompilerInputs();
    await rm(DIST_ROOT, { recursive: true, force: true });
    await assertPreparedPublicClosureUnchanged(preparedPublicClosure);
    await run("build production application", NODE, [VINEXT, "build"], releaseEnvironment);
    await assertPreparedPublicClosureUnchanged(preparedPublicClosure);
    await assertCompilerInputsUnchanged(compilerInputs);
    await run("precompress and seal CDN release", NODE, [
      path.join(ROOT, "tools", "finalize-public-release.mjs"),
      "--prepared-manifest",
      PREPARED_RELEASE_MANIFEST,
    ]);
    await assertPreparedPublicClosureUnchanged(preparedPublicClosure);
    await assertCompilerInputsUnchanged(compilerInputs);
    if (buildMode === "quick") {
      await writeQuickReleaseReceipt(
        preparedPublicClosure,
        compilerInputs,
      );
    }
  } finally {
    activeBuildLock = null;
    await releaseBuildLock.release();
  }
}

const isCli =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
