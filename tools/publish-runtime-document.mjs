#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ARMOR_ORIGIN } from "../lib/public-site-topology.mjs";
import { SUPPORTERS_MAX_BYTES } from "../lib/supporters-document.mjs";
import { UPDATES_MAX_BYTES } from "../lib/updates-document.mjs";
import { assertSupportersDocument } from "./supporters-schema.mjs";
import { assertUpdatesDocument } from "./updates-schema.mjs";

const DEFAULT_SSH_HOST = process.env.SIGUA_DEPLOY_SSH_HOST || "TencentCloudPublic";
const DEFAULT_ZONE_ID = process.env.SIGUA_EDGEONE_ZONE_ID || "zone-3tidkc66muky";
const DEFAULT_PUBLIC_ORIGIN = process.env.SIGUA_PUBLIC_ORIGIN || ARMOR_ORIGIN;
const REMOTE_CONTENT_DIRECTORY = "/opt/stacks/sigua-armor-public/data/content";
const SITE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DOCUMENT_CONFIG = {
  supporters: {
    fileName: "supporters.json",
    maxBytes: SUPPORTERS_MAX_BYTES,
    assertDocument: assertSupportersDocument,
  },
  updates: {
    fileName: "updates.json",
    maxBytes: UPDATES_MAX_BYTES,
    assertDocument: assertUpdatesDocument,
    targets: [
      { remoteRelativePath: "updates.json", publicPath: "/updates.json" },
      { remoteRelativePath: "squad/updates.json", publicPath: "/squad/updates.json" },
    ],
  },
};

export function formatTccliParamFile(filePath) {
  return `file://${filePath.replaceAll("\\", "/")}`;
}

function configFor(documentName) {
  const config = DOCUMENT_CONFIG[documentName];
  if (!config) throw new Error(`unknown runtime document: ${documentName}`);
  return config;
}

function normalizeRemoteRelativePath(value) {
  const normalized = typeof value === "string" ? value.replaceAll("\\", "/") : "";
  if (
    !/^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.json$/iu.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("invalid runtime-document target path: " + value);
  }
  return normalized;
}

export function runtimeDocumentTargets(documentName, publicOrigin = DEFAULT_PUBLIC_ORIGIN) {
  const config = configFor(documentName);
  const targets = config.targets || [
    { remoteRelativePath: config.fileName, publicPath: `/${config.fileName}` },
  ];
  return targets.map(({ remoteRelativePath, publicPath }) => ({
    remoteRelativePath: normalizeRemoteRelativePath(remoteRelativePath),
    publicUrl: new URL(publicPath, publicOrigin).href,
  }));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function siteDateInShanghai(date) {
  const parts = Object.fromEntries(
    SITE_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseArguments(argv) {
  const documentName = argv[0];
  const config = configFor(documentName);
  const options = {
    documentName,
    dryRun: false,
    purge: true,
    source: path.resolve(process.cwd(), "public", config.fileName),
    help: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--no-purge") {
      options.purge = false;
    } else if (argument === "--source") {
      index += 1;
      if (!argv[index]) throw new Error("--source requires a file path");
      options.source = path.resolve(argv[index]);
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error("unknown argument: " + argument);
    }
  }
  return options;
}

function printUsage(documentName) {
  process.stdout.write(`Usage: node tools/publish-runtime-document.mjs ${documentName} [options]\n\n`);
  process.stdout.write("  --dry-run        Validate and preview without changing local or remote files\n");
  process.stdout.write("  --no-purge       Upload atomically but wait for the 60-second CDN TTL\n");
  process.stdout.write("  --source <file>  Publish a different JSON document\n");
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {
      // Spawn/exit errors are reported by the child process handlers below.
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      });
    });
    child.stdin.end(options.input);
  });
}

export async function prepareRuntimeDocument(documentName, sourcePath, now = new Date()) {
  const config = configFor(documentName);
  let source;
  try {
    source = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    throw new Error(
      "unable to read runtime document " +
        sourcePath +
        ": " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  const candidate = {
    ...source,
    updatedAt: now.toISOString(),
  };
  if (documentName === "updates") candidate.siteUpdatedOn = siteDateInShanghai(now);
  const document = await config.assertDocument(candidate);
  const serialized = JSON.stringify(document, null, 2) + "\n";
  const bytes = Buffer.byteLength(serialized);
  if (bytes > config.maxBytes) {
    throw new Error(
      `${documentName} document is ${bytes} bytes; maximum is ${config.maxBytes}`,
    );
  }
  return {
    document,
    serialized,
    bytes,
    sha256: sha256(serialized),
  };
}

async function uploadAtomically(serialized, expectedSha256, sshHost, relativeFilePaths) {
  const encodedDocument = Buffer.from(serialized, "utf8").toString("base64");
  const receipts = [];
  for (const relativeFilePath of relativeFilePaths) {
    const normalizedPath = normalizeRemoteRelativePath(relativeFilePath);
    const remoteDocument = `${REMOTE_CONTENT_DIRECTORY}/${normalizedPath}`;
    const remoteDirectory = path.posix.dirname(remoteDocument);
    const fileName = path.posix.basename(remoteDocument);
    const remoteScript = [
      "set -eu",
      "target_dir='" + remoteDirectory + "'",
      "target='" + remoteDocument + "'",
      'install -d -m 0755 "$target_dir"',
      `temp=$(mktemp "$target_dir/.${fileName}.XXXXXX")`,
      'trap \'rm -f "$temp"\' EXIT HUP INT TERM',
      "printf '%s' '" + encodedDocument + "' | base64 -d > \"$temp\"",
      'chmod 0644 "$temp"',
      'mv -f "$temp" "$target"',
      "trap - EXIT HUP INT TERM",
      'sha256sum "$target" | cut -d\' \' -f1',
      "",
    ].join("\n");
    const result = await runProcess("ssh", [sshHost, "bash", "-s"], { input: remoteScript });
    if (result.code !== 0) {
      throw new Error(
        "remote runtime-document update failed for " +
          normalizedPath +
          ": " +
          (result.stderr || "exit " + result.code),
      );
    }
    const remoteSha256 = result.stdout.trim();
    if (remoteSha256 !== expectedSha256) {
      throw new Error(
        "remote runtime-document digest mismatch for " +
          normalizedPath +
          ": expected " +
          expectedSha256 +
          ", got " +
          remoteSha256,
      );
    }
    receipts.push({ remoteRelativePath: normalizedPath, sha256: remoteSha256 });
  }
  return receipts;
}

async function purgeEdgeOne(documentUrls, zoneId) {
  const requestPath = path.join(
    os.tmpdir(),
    "sigua-runtime-document-purge-" + randomUUID() + ".json",
  );
  const payload = {
    ZoneId: zoneId,
    Type: "purge_url",
    Targets: documentUrls,
    EncodeUrl: true,
  };
  await writeFile(requestPath, JSON.stringify(payload), "utf8");
  try {
    const result = await runProcess("tccli", [
      "--version",
      "2022-09-01",
      "teo",
      "CreatePurgeTask",
      "--cli-input-json",
      formatTccliParamFile(requestPath),
    ]);
    if (result.code !== 0) {
      return { purged: false, warning: result.stderr || "tccli exited with " + result.code };
    }
    const response = JSON.parse(result.stdout);
    return { purged: true, jobId: response.JobId, requestId: response.RequestId };
  } catch (error) {
    return {
      purged: false,
      warning:
        "EdgeOne purge unavailable; the update will appear after the 60-second TTL (" +
        (error instanceof Error ? error.message : String(error)) +
        ")",
    };
  } finally {
    await rm(requestPath, { force: true });
  }
}

async function waitForPublicDocument(documentUrl, expectedSha256, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(documentUrl, {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });
      lastStatus = response.status;
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (sha256(bytes) === expectedSha256) {
          return {
            verified: true,
            status: response.status,
            edgeCache: response.headers.get("eo-cache-status"),
          };
        }
      }
    } catch {
      lastStatus = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return { verified: false, status: lastStatus, edgeCache: null };
}

async function writeSourceAtomically(sourcePath, serialized) {
  const temporaryPath = sourcePath + "." + process.pid + ".tmp";
  await writeFile(temporaryPath, serialized, "utf8");
  await rename(temporaryPath, sourcePath);
}

export async function runRuntimeDocumentPublisher(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    printUsage(options.documentName);
    return;
  }

  const prepared = await prepareRuntimeDocument(
    options.documentName,
    options.source,
  );
  if (options.dryRun) {
    process.stdout.write(
      JSON.stringify(
        {
          valid: true,
          document: options.documentName,
          source: options.source,
          entries: prepared.document.entries.length,
          bytes: prepared.bytes,
          sha256: prepared.sha256,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const targets = runtimeDocumentTargets(options.documentName);
  const remoteReceipts = await uploadAtomically(
    prepared.serialized,
    prepared.sha256,
    DEFAULT_SSH_HOST,
    targets.map(({ remoteRelativePath }) => remoteRelativePath),
  );
  await writeSourceAtomically(options.source, prepared.serialized);
  const purge = options.purge
    ? await purgeEdgeOne(
        targets.map(({ publicUrl }) => publicUrl),
        DEFAULT_ZONE_ID,
      )
    : {
        purged: false,
        warning: "EdgeOne purge skipped; the update will appear after the 60-second TTL",
      };
  const verifications = await Promise.all(
    targets.map(async ({ publicUrl }) => ({
      publicUrl,
      ...(await waitForPublicDocument(
        publicUrl,
        prepared.sha256,
        purge.purged ? 30_000 : 75_000,
      )),
    })),
  );
  const failedVerification = verifications.find(({ verified }) => !verified);
  if (failedVerification) {
    throw new Error(
      "runtime document reached the origin but public verification timed out for " +
        failedVerification.publicUrl +
        " (last HTTP status: " +
        (failedVerification.status ?? "unavailable") +
        ")",
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        updated: true,
        document: options.documentName,
        entries: prepared.document.entries.length,
        bytes: prepared.bytes,
        sha256: prepared.sha256,
        remoteReceipts,
        purge,
        verification: verifications.length === 1 ? verifications[0] : verifications,
      },
      null,
      2,
    ) + "\n",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runRuntimeDocumentPublisher().catch((error) => {
    process.stderr.write((error instanceof Error ? error.stack : String(error)) + "\n");
    process.exitCode = 1;
  });
}
