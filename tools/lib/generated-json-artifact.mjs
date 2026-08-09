import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

export function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, stableJsonValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(
    `${JSON.stringify(stableJsonValue(value), null, 2)}\n`,
    "utf8",
  );
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function artifactRevision(value) {
  return sha256(
    Buffer.from(JSON.stringify(stableJsonValue(value)), "utf8"),
  );
}

const TRANSIENT_WRITE_CODES = new Set([
  "UNKNOWN",
  "EPERM",
  "EBUSY",
  "EACCES",
]);

export async function writeFileWithRetry(
  filePath,
  data,
  options,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(filePath, data, options);
      return;
    } catch (error) {
      if (
        attempt >= 5 ||
        !TRANSIENT_WRITE_CODES.has(error?.code)
      ) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 25 * (2 ** attempt));
      });
    }
  }
}

export async function readJsonArtifact(filePath, label = filePath) {
  const bytes = await readFile(filePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  return { bytes, value };
}

async function readCurrentBytes(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeOrCheckArtifact({
  filePath,
  bytes,
  checkOnly,
  label = filePath,
}) {
  const current = await readCurrentBytes(filePath);
  if (checkOnly) {
    if (!current) {
      throw new Error(`${label} is missing`);
    }
    if (!current.equals(bytes)) {
      throw new Error(`${label} is stale`);
    }
    return { status: "checked", changed: false };
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  if (current?.equals(bytes)) {
    return { status: "current", changed: false };
  }
  await writeFileWithRetry(filePath, bytes);
  return { status: "written", changed: true };
}

function exactFileName(fileName, suffix) {
  return (
    typeof fileName === "string" &&
    fileName.length > suffix.length &&
    fileName.endsWith(suffix) &&
    path.basename(fileName) === fileName &&
    !fileName.includes("/") &&
    !fileName.includes("\\")
  );
}

export async function reconcileExactArtifactDirectory({
  directory,
  expectedFiles,
  suffix,
  checkOnly,
  label = directory,
}) {
  if (!(expectedFiles instanceof Map)) {
    throw new Error(`${label} expected files must be a Map`);
  }
  for (const [fileName, bytes] of expectedFiles) {
    if (!exactFileName(fileName, suffix)) {
      throw new Error(`${label} has unsafe generated file ${fileName}`);
    }
    if (!Buffer.isBuffer(bytes)) {
      throw new Error(`${label}/${fileName} bytes are invalid`);
    }
  }

  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (checkOnly) {
      throw new Error(`${label} is missing`);
    }
  }
  const actualFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort(compareText);
  const expectedNames = [...expectedFiles.keys()].sort(compareText);
  const orphans = actualFiles.filter(
    (fileName) => !expectedFiles.has(fileName),
  );
  const missing = expectedNames.filter(
    (fileName) => !actualFiles.includes(fileName),
  );

  if (checkOnly && (orphans.length > 0 || missing.length > 0)) {
    throw new Error(
      `${label} closure drifted: ${missing.length} missing, ` +
        `${orphans.length} orphaned`,
    );
  }

  if (!checkOnly) {
    await mkdir(directory, { recursive: true });
  }
  let changed = 0;
  for (const fileName of expectedNames) {
    const result = await writeOrCheckArtifact({
      filePath: path.join(directory, fileName),
      bytes: expectedFiles.get(fileName),
      checkOnly,
      label: `${label}/${fileName}`,
    });
    if (result.changed) changed += 1;
  }
  if (!checkOnly) {
    for (const fileName of orphans) {
      await unlink(path.join(directory, fileName));
      changed += 1;
    }
  }
  return {
    status: checkOnly ? "checked" : changed > 0 ? "reconciled" : "current",
    expected: expectedNames.length,
    missing: missing.length,
    orphaned: orphans.length,
    changed,
  };
}
