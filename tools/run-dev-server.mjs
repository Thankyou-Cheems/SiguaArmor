import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VINEXT = path.join(ROOT, "node_modules", "vinext", "dist", "cli.js");
const DEVELOPMENT_PUBLIC = path.join(ROOT, "public");

process.stdout.write(
  `${JSON.stringify({
    event: "development-public-source",
    source: "working-tree-public",
    path: DEVELOPMENT_PUBLIC,
    policy: "serve mutable worktree assets directly; sealing is release-only",
  })}\n`,
);

const child = spawn(process.execPath, [VINEXT, "dev", ...process.argv.slice(2)], {
  cwd: ROOT,
  env: {
    ...process.env,
    SIGUA_DEVELOPMENT_PUBLIC_DIR: DEVELOPMENT_PUBLIC,
    SIGUA_VALIDATION_MODE: process.env.SIGUA_VALIDATION_MODE || "dev",
  },
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

let forwardingSignal = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (forwardingSignal) return;
    forwardingSignal = true;
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        child.kill();
      }
    }
  });
}

child.once("error", (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`development server stopped by signal ${signal}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
