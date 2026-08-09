// Fail-closed server-side applicator for a sealed unified-public delta.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELEASE_SCHEMA = "sigua-unified-public-release/v1";
const DELTA_SCHEMA = "sigua-unified-public-delta/v1";
const SELF_PATH = fileURLToPath(import.meta.url);

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

function normalizedEntryPath(value, label = "release entry") {
  invariant(typeof value === "string" && value.length > 0, `${label} path is missing`);
  invariant(!value.includes("\\"), `${label} path uses a backslash: ${value}`);
  invariant(!path.posix.isAbsolute(value), `${label} path is absolute: ${value}`);
  const normalized = path.posix.normalize(value);
  invariant(
    normalized === value && normalized !== "." && !normalized.startsWith("../"),
    `${label} path escapes its root: ${value}`,
  );
  invariant(!normalized.toLowerCase().endsWith(".hsp"), `HSP is forbidden: ${value}`);
  return normalized;
}

function filePathForEntry(root, entryPath) {
  return path.join(root, ...normalizedEntryPath(entryPath).split("/"));
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJsonBytes(filePath, label) {
  const bytes = await readFile(filePath);
  try {
    return {
      bytes,
      sha256: sha256(bytes),
      document: JSON.parse(bytes.toString("utf8")),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function validateReleaseManifest(manifest, label) {
  invariant(manifest?.schemaVersion === RELEASE_SCHEMA, `${label} schema is invalid`);
  invariant(Array.isArray(manifest.entries), `${label} entries are missing`);
  invariant(manifest.entryCount === manifest.entries.length, `${label} entryCount is invalid`);
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    const entryPath = normalizedEntryPath(entry?.path, label);
    invariant(!seen.has(entryPath), `${label} has duplicate path: ${entryPath}`);
    seen.add(entryPath);
    invariant(
      Number.isSafeInteger(entry.bytes) && entry.bytes >= 0,
      `${label} has invalid bytes: ${entryPath}`,
    );
    invariant(
      typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256),
      `${label} has invalid SHA-256: ${entryPath}`,
    );
    totalBytes += entry.bytes;
  }
  invariant(totalBytes === manifest.totalBytes, `${label} totalBytes is invalid`);
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.isFile()) files.push(filePath);
      else throw new Error(`unsupported release filesystem entry: ${filePath}`);
    }
  }
  await visit(root);
  return files;
}

async function verifyExactRelease(root, manifest, label) {
  const declared = new Set(manifest.entries.map(({ path: entryPath }) => entryPath));
  for (const entry of manifest.entries) {
    const filePath = filePathForEntry(root, entry.path);
    const metadata = await stat(filePath);
    invariant(metadata.isFile(), `${label} entry is not a file: ${entry.path}`);
    invariant(metadata.size === entry.bytes, `${label} bytes mismatch: ${entry.path}`);
    invariant(await sha256File(filePath) === entry.sha256, `${label} SHA-256 mismatch: ${entry.path}`);
  }
  const actual = (await walkFiles(root))
    .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"))
    .filter((entryPath) => entryPath !== "release-manifest.json");
  invariant(actual.length === declared.size, `${label} filesystem closure size mismatch`);
  for (const entryPath of actual) {
    invariant(declared.has(entryPath), `${label} has an undeclared file: ${entryPath}`);
  }
}

async function linkOrCopy(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await link(source, destination);
    return "hardlink";
  } catch (error) {
    if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
    await copyFile(source, destination);
    return "copy";
  }
}

function contentKey(entry) {
  return `${entry.sha256}:${entry.bytes}`;
}

export async function applyUnifiedPublicDelta({
  currentRoot,
  deltaRoot,
  candidateRoot,
  receiptPath = `${path.resolve(candidateRoot)}.receipt.json`,
}) {
  invariant(currentRoot && deltaRoot && candidateRoot, "currentRoot, deltaRoot, and candidateRoot are required");
  const current = path.resolve(currentRoot);
  const delta = path.resolve(deltaRoot);
  const candidate = path.resolve(candidateRoot);
  invariant(current !== delta && current !== candidate && delta !== candidate, "release roots must be distinct");
  invariant(
    !candidate.startsWith(`${current}${path.sep}`) && !candidate.startsWith(`${delta}${path.sep}`),
    "candidate root must not be nested inside an input root",
  );
  invariant(!(await exists(candidate)), `candidate root already exists: ${candidate}`);

  const [deltaRecord, baseRecord, targetRecord, selfBytes] = await Promise.all([
    readJsonBytes(path.join(delta, "delta-manifest.json"), "delta manifest"),
    readJsonBytes(path.join(current, "release-manifest.json"), "current release manifest"),
    readJsonBytes(path.join(delta, "release-manifest.json"), "target release manifest"),
    readFile(SELF_PATH),
  ]);
  const deltaManifest = deltaRecord.document;
  const baseManifest = baseRecord.document;
  const targetManifest = targetRecord.document;
  invariant(deltaManifest?.schemaVersion === DELTA_SCHEMA, "delta manifest schema is invalid");
  validateReleaseManifest(baseManifest, "current release manifest");
  validateReleaseManifest(targetManifest, "target release manifest");
  invariant(baseRecord.sha256 === deltaManifest.base?.manifestSha256, "current release manifest does not match delta base");
  invariant(targetRecord.sha256 === deltaManifest.target?.manifestSha256, "target release manifest does not match delta target");
  invariant(
    selfBytes.byteLength === deltaManifest.applicator?.bytes &&
      sha256(selfBytes) === deltaManifest.applicator?.sha256,
    "delta applicator does not match the sealed tool",
  );
  await verifyExactRelease(current, baseManifest, "current release");

  const baseByContent = new Map();
  for (const entry of baseManifest.entries) {
    const candidates = baseByContent.get(contentKey(entry)) ?? [];
    candidates.push(entry.path);
    candidates.sort((left, right) => left.localeCompare(right, "en"));
    baseByContent.set(contentKey(entry), candidates);
  }
  const targetPaths = new Set(targetManifest.entries.map(({ path: entryPath }) => entryPath));
  const removedPaths = baseManifest.entries
    .map(({ path: entryPath }) => entryPath)
    .filter((entryPath) => !targetPaths.has(entryPath))
    .sort((left, right) => left.localeCompare(right, "en"));
  invariant(
    sha256(Buffer.from(JSON.stringify(removedPaths), "utf8")) ===
      deltaManifest.removedPathsSha256,
    "delta removed-path closure is invalid",
  );
  const targetPlan = targetManifest.entries.map((entry) => {
    const basePath = baseByContent.get(contentKey(entry))?.[0];
    return basePath
      ? { ...entry, source: "base", basePath }
      : { ...entry, source: "delta", deltaPath: `files/${entry.path}` };
  });
  const uploadEntries = targetPlan.filter(({ source }) => source === "delta");
  const reusedEntries = targetPlan.filter(({ source }) => source === "base");
  const uploadBytes = uploadEntries.reduce((total, entry) => total + entry.bytes, 0);
  const reusedBytes = reusedEntries.reduce((total, entry) => total + entry.bytes, 0);
  invariant(deltaManifest.transfer?.uploadCount === uploadEntries.length, "delta uploadCount is invalid");
  invariant(deltaManifest.transfer?.uploadBytes === uploadBytes, "delta uploadBytes is invalid");
  invariant(deltaManifest.transfer?.reusedCount === reusedEntries.length, "delta reusedCount is invalid");
  invariant(deltaManifest.transfer?.reusedBytes === reusedBytes, "delta reusedBytes is invalid");
  invariant(deltaManifest.transfer?.removedCount === removedPaths.length, "delta removedCount is invalid");
  invariant(
    deltaManifest.transfer?.savedBytes === targetManifest.totalBytes - uploadBytes,
    "delta savedBytes is invalid",
  );

  let hardlinkCount = 0;
  let copyCount = 0;
  await mkdir(candidate, { recursive: false });
  try {
    for (const entry of targetPlan) {
      let source;
      if (entry.source === "base") {
        source = filePathForEntry(current, entry.basePath);
      } else {
        invariant(entry.source === "delta", `unknown delta source for ${entry.path}`);
        invariant(
          entry.deltaPath === `files/${entry.path}`,
          `delta path is not canonical for ${entry.path}`,
        );
        source = filePathForEntry(delta, entry.deltaPath);
      }
      const metadata = await stat(source);
      invariant(metadata.size === entry.bytes, `source bytes mismatch: ${entry.path}`);
      invariant(await sha256File(source) === entry.sha256, `source SHA-256 mismatch: ${entry.path}`);
      const strategy = await linkOrCopy(source, filePathForEntry(candidate, entry.path));
      if (strategy === "hardlink") hardlinkCount += 1;
      else copyCount += 1;
    }
    await copyFile(
      path.join(delta, "release-manifest.json"),
      path.join(candidate, "release-manifest.json"),
    );
    await verifyExactRelease(candidate, targetManifest, "candidate release");
  } catch (error) {
    await rm(candidate, { recursive: true, force: true });
    throw error;
  }

  const receipt = {
    schemaVersion: "sigua-unified-public-delta-apply/v1",
    baseManifestSha256: baseRecord.sha256,
    targetManifestSha256: targetRecord.sha256,
    entryCount: targetManifest.entryCount,
    totalBytes: targetManifest.totalBytes,
    hardlinkCount,
    copyCount,
    candidateRoot: candidate,
    activationPerformed: false,
  };
  await mkdir(path.dirname(path.resolve(receiptPath)), { recursive: true });
  await writeFile(path.resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `unexpected argument: ${token}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `${token} requires a value`);
    args[token.slice(2)] = value;
    index += 1;
  }
  for (const key of ["current-root", "delta-root", "candidate-root"]) {
    invariant(args[key], `--${key} is required`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = await applyUnifiedPublicDelta({
    currentRoot: args["current-root"],
    deltaRoot: args["delta-root"],
    candidateRoot: args["candidate-root"],
    receiptPath: args.receipt,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const isCli =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
