import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ARMOR_ORIGIN, LANDING_ORIGIN } from "../../lib/public-site-topology.mjs";
import { packageDeployment } from "./package-deployment.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const HELP = `Usage: npm run deploy [-- --host <SSH alias> --root <stack path> --wiki-ref <commit>]
       npm run deploy:rollback [-- --host <SSH alias> --root <stack path>]
       npm run deploy:status [-- --host <SSH alias> --root <stack path>]

deploy builds and checks a clean source checkout, uploads one complete candidate,
then updates only changed components. rollback restores the previous version.
Defaults: SIGUA_DEPLOY_SSH_HOST= TencentCloudPublic
          SIGUA_DEPLOY_ROOT= /opt/stacks/sigua-armor-public
Requires local Node/npm, tar, SSH/SCP; server Python 3 and Docker Compose v2.
See docs/deployment.md for directory ownership, browser checks and Wiki updates.`;

export function parseArgs(args, env = process.env) {
  const [action, ...rest] = args;
  if (!new Set(["deploy", "rollback", "status"]).has(action)) throw Error("Unknown release action");
  const options = {
    action,
    host: env.SIGUA_DEPLOY_SSH_HOST || "TencentCloudPublic",
    root: env.SIGUA_DEPLOY_ROOT || "/opt/stacks/sigua-armor-public",
  };
  for (let i = 0; i < rest.length; i += 2) {
    const key = { "--host": "host", "--root": "root", "--wiki-ref": "wikiRef" }[rest[i]];
    if (!key || !rest[i + 1]) throw Error(`Unknown or incomplete option: ${rest[i]}`);
    options[key] = rest[i + 1];
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/u.test(options.host)) throw Error("Use a plain SSH host/alias");
  if (!/^\/[a-zA-Z0-9_./-]+$/u.test(options.root) || options.root.split("/").includes("..")) {
    throw Error("Use an absolute server stack path without spaces or parent traversal");
  }
  return options;
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, shell: false, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    let output = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(Error(`${command} exited ${code}`)));
  });
}

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

async function publicCheck() {
  const cases = [
    [LANDING_ORIGIN + "/", 200], [LANDING_ORIGIN + "/navigator", 200],
    [ARMOR_ORIGIN + "/", 200], [ARMOR_ORIGIN + "/squad/", 200],
    [ARMOR_ORIGIN + "/sigua/", 200], [ARMOR_ORIGIN + "/__admin/content/session", 401],
  ];
  for (const [url, expected] of cases) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    await response.arrayBuffer();
    if (response.status !== expected) throw Error(`Public check ${url}: ${response.status}; use deploy:rollback if needed`);
  }
  console.log("Public routes passed. Finish the vehicle/school browser checks in docs/deployment.md.");
}

export async function main(args) {
  if (args.includes("--help")) { console.log(HELP); return; }
  const options = parseArgs(args);
  const output = path.join(ROOT, "outputs");
  await mkdir(output, { recursive: true });
  let archive;
  if (options.action === "deploy") {
    const dirty = await run("git", ["status", "--porcelain"], { capture: true });
    if (dirty) throw Error("Commit the intended source changes before deployment; preserve unrelated work separately");
    const npm = process.env.npm_execpath;
    if (!npm) throw Error("Run through npm run deploy");
    for (const script of ["check", "lint", "build"]) {
      await run(process.execPath, [npm, "run", script]);
    }
    if (await run("git", ["status", "--porcelain"], { capture: true })) {
      throw Error("Build changed tracked source; review and commit it before deployment");
    }
    const candidate = path.join(output, "deployment");
    await packageDeployment(candidate, { wikiRef: options.wikiRef });
    archive = path.join(output, "deployment.tar.gz");
    await run("tar", ["-czf", archive, "-C", candidate, "."]);
  }
  const remoteBase = `/tmp/sigua-armor-${randomUUID()}`;
  const remoteScript = remoteBase + ".py";
  const remoteArchive = remoteBase + ".tar.gz";
  const ssh = (args, extra) => run("ssh", ["-o", "BatchMode=yes", options.host, args.map(quote).join(" ")], extra);
  try {
    await run("scp", ["-q", "-o", "BatchMode=yes", path.join(import.meta.dirname, "remote-release.py"), `${options.host}:${remoteScript}`]);
    if (archive) await run("scp", ["-q", "-o", "BatchMode=yes", archive, `${options.host}:${remoteArchive}`]);
    const result = await ssh(["python3", remoteScript, options.action, "--root", options.root,
      ...(archive ? ["--archive", remoteArchive] : [])], { capture: true });
    console.log(result);
    if (options.action !== "status") {
      await writeFile(path.join(output, "deployment-result.json"), result + "\n", "utf8");
      await publicCheck();
    }
  } finally {
    // Only the two paths created by this invocation; release candidates remain on the host.
    await ssh(["rm", "-f", "--", remoteScript, remoteArchive]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
