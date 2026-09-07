import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parseArgs } from "../../tools/deploy/release.mjs";

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
