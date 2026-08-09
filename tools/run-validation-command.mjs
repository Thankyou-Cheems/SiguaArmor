import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveValidationProfile } from "./validation-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [requestedMode, commandKind, ...commandArguments] = process.argv.slice(2);
const mode = resolveValidationProfile(requestedMode);

if (!commandKind) {
  throw new Error(
    "usage: node tools/run-validation-command.mjs <dev|strict|release> <node|npm-sequence> ...",
  );
}

const environment = {
  ...process.env,
  SIGUA_VALIDATION_MODE: mode,
};
process.stdout.write(
  `${JSON.stringify({
    event: "validation-command",
    mode,
    commandKind,
  })}\n`,
);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: environment,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    const forwardSignal = (signal) => {
      if (!child.killed) {
        try {
          child.kill(signal);
        } catch {
          child.kill();
        }
      }
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    const cleanup = () => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `validation command failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }`,
          ),
        );
      }
    });
  });
}

if (commandKind === "node") {
  if (commandArguments.length === 0) {
    throw new Error("node validation command requires a script path");
  }
  await run(process.execPath, commandArguments);
} else if (commandKind === "npm-sequence") {
  if (commandArguments.length === 0) {
    throw new Error("npm-sequence requires at least one package script");
  }
  const npmCli =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(npmCli)) {
    throw new Error("npm_execpath is unavailable; run this command through npm");
  }
  for (const scriptName of commandArguments) {
    process.stdout.write(`\n[${mode}] npm run ${scriptName}\n`);
    await run(process.execPath, [npmCli, "run", scriptName]);
  }
} else {
  throw new Error(`unsupported validation command kind: ${commandKind}`);
}
