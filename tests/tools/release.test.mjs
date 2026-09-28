import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../../tools/deploy/release.mjs";
import { buildAnalyticsExecutable, copyServiceSources } from "../../tools/deploy/package-deployment.mjs";

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

test("analytics packaging stays identical across unrelated product commits", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "armor-analytics-package-"));
  try {
    const sourceRoot = path.join(output, "source");
    const service = path.join(sourceRoot, "services", "analytics");
    const candidate = path.join(output, "candidate");
    await mkdir(service, { recursive: true });
    await mkdir(path.join(candidate, "services", "analytics"), { recursive: true });
    await writeFile(path.join(service, "go.mod"), "module example.invalid/analytics\n\ngo 1.25\n");
    await writeFile(path.join(service, "main.go"), 'package main\nimport "fmt"\nfunc main() { fmt.Println("analytics") }\n');
    const git = (...args) => execFileSync("git", args, { cwd: sourceRoot, stdio: "pipe" });
    const commit = () => git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
    git("init", "--quiet");
    git("add", ".");
    commit();
    buildAnalyticsExecutable(sourceRoot, candidate);
    const executable = path.join(candidate, "services", "analytics", "analytics-server");
    const binary = await readFile(executable);
    assert.equal(binary.subarray(0, 4).toString("hex"), "7f454c46");
    assert.equal(binary.readUInt16LE(18), 62);
    await writeFile(path.join(sourceRoot, "README.md"), "Unrelated product documentation\n");
    git("add", ".");
    commit();
    buildAnalyticsExecutable(sourceRoot, candidate);
    assert.ok((await readFile(executable)).equals(binary), "unrelated Git identity must not recreate analytics");
    await writeFile(path.join(service, "main.go"), 'package main\nimport "fmt"\nfunc main() { fmt.Println("changed analytics") }\n');
    buildAnalyticsExecutable(sourceRoot, candidate);
    assert.ok(!(await readFile(executable)).equals(binary), "service changes must still produce a new component");
  } finally {
    await rm(output, { recursive: true, force: true });
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
