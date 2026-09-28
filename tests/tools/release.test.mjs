import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../../tools/deploy/release.mjs";
import { copyServiceSources } from "../../tools/deploy/package-deployment.mjs";

test("service packaging excludes local dependencies, credentials and caches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "armor-package-"));
  try {
    await mkdir(path.join(root, "services/demo/node_modules"), { recursive: true });
    await writeFile(path.join(root, "services/demo/server.mjs"), "export {};");
    await writeFile(path.join(root, "services/demo/.env"), "LOCAL_ONLY=example");
    await writeFile(path.join(root, "services/demo/node_modules/.package-lock.json"), "{}");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["add", "services/demo/server.mjs"], { cwd: root });
    await copyServiceSources(root, path.join(root, "candidate"));
    assert.deepEqual(await readdir(path.join(root, "candidate/services/demo")), ["server.mjs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release options accept explicit SSH configuration and reject ambiguous paths", () => {
  assert.deepEqual(parseArgs(["deploy", "--host", "production", "--wiki-ref", "abc"], {}), {
    action: "deploy", host: "production", root: "/opt/stacks/sigua-armor-public", wikiRef: "abc",
  });
  assert.equal(parseArgs(["rollback"], { SIGUA_DEPLOY_SSH_HOST: "backup" }).host, "backup");
  assert.throws(() => parseArgs(["deploy", "--root", "/opt/../etc"], {}));
  assert.throws(() => parseArgs(["deploy", "--host", "-oProxyCommand=bad"], {}));
  assert.throws(() => parseArgs(["deploy", "--skip-checks"], {}));
});

test("release switch, failure recovery, rollback and retention", () => {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", [
    "-B", "tests/tools/test_release.py", "-v",
  ], { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
