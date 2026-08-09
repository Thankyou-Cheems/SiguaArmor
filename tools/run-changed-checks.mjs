import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveValidationProfile } from "./validation-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const TSC = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
const ESLINT = path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js");
const CONCISE_TEST_REPORTER = path.join(
  ROOT,
  "tools",
  "concise-test-reporter.mjs",
);

function parseArguments(args) {
  const result = {
    base: null,
    dryRun: false,
    files: [],
    strict: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--strict") result.strict = true;
    else if (argument === "--base") {
      const value = args[index + 1];
      if (!value) throw new Error("--base requires a Git revision");
      result.base = value;
      index += 1;
    } else if (argument === "--file") {
      const value = args[index + 1];
      if (!value) throw new Error("--file requires a repository-relative path");
      const normalized = normalizePath(value);
      if (
        path.isAbsolute(value) ||
        normalized === ".." ||
        normalized.startsWith("../")
      ) {
        throw new Error(`--file must stay inside the repository: ${value}`);
      }
      result.files.push(normalized);
      index += 1;
    } else {
      throw new Error(`unsupported changed-check argument: ${argument}`);
    }
  }
  return result;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function splitNullTerminated(value) {
  return value
    .split("\0")
    .map((entry) => normalizePath(entry.trim()))
    .filter(Boolean);
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
      else {
        reject(
          new Error(
            `${command} failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }`,
          ),
        );
      }
    });
  });
}

function runInherited(label, command, args, environment = {}) {
  process.stdout.write(`\n[changed-check] ${label}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        ...environment,
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${label} failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }`,
          ),
        );
      }
    });
  });
}

async function changedFiles(base) {
  const commands = [
    ["diff", "--name-only", "--diff-filter=ACMR", "-z"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  if (base) {
    commands.push([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      `${base}...HEAD`,
    ]);
  }
  const outputs = await Promise.all(
    commands.map((args) => runCapture("git", args)),
  );
  return [...new Set(outputs.flatMap(splitNullTerminated))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

async function existingFiles(files) {
  const result = [];
  for (const file of files) {
    try {
      await access(path.join(ROOT, file));
      result.push(file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return result;
}

async function discoverTests(files) {
  const listed = await existingFiles(
    splitNullTerminated(
      await runCapture("git", ["ls-files", "-z", "tests"]),
    ).filter((file) => /(?:\.test\.mjs|\.test\.js)$/u.test(file)),
  );
  const changedTests = files.filter((file) =>
    /(?:^|\/)tests\/.*(?:\.test\.mjs|\.test\.js)$/u.test(file),
  );
  const sourceFiles = files.filter((file) => !file.startsWith("tests/"));
  const needles = new Set();
  for (const sourceFile of sourceFiles) {
    needles.add(sourceFile);
    needles.add(path.posix.basename(sourceFile));
  }
  const selected = new Set(changedTests);
  for (const testFile of listed) {
    const source = await readFile(path.join(ROOT, testFile), "utf8");
    if ([...needles].some((needle) => needle.length >= 8 && source.includes(needle))) {
      selected.add(testFile);
    }
  }

  const releaseToolChanged = files.some((file) =>
    [
      "package.json",
      "tools/build-public-release.mjs",
      "tools/finalize-public-release.mjs",
      "tools/public-assets/prepare.mjs",
      "tools/run-dev-server.mjs",
      "tools/run-validation-command.mjs",
      "tools/worktree-runtime-paths.mjs",
    ].includes(file),
  );
  if (releaseToolChanged) {
    selected.add("tests/tools/quick-public-release.test.mjs");
    selected.add("tests/tools/public-assets.test.mjs");
  }
  return [...selected].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

async function runnableDevelopmentTests(tests, strict) {
  if (strict) return { runnable: tests, deferred: [] };
  const runnable = [];
  const deferred = [];
  for (const testFile of tests) {
    const source = await readFile(path.join(ROOT, testFile), "utf8");
    if (
      source.includes("hit-runtime") ||
      /(?:static-hit|support-air-hit|runtime-weapon-label)/u.test(testFile)
    ) {
      deferred.push(testFile);
    } else {
      runnable.push(testFile);
    }
  }
  return { runnable, deferred };
}

function validationPlan(files, tests, deferredTests, strict) {
  const lintable = files.filter(
    (file) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(file) &&
      !file.startsWith("generated/") &&
      !file.startsWith("public/"),
  );
  const syntaxCheck = files.filter(
    (file) => /\.(?:mjs|cjs|js)$/u.test(file) && file.startsWith("tools/"),
  );
  const typecheck =
    strict ||
    files.some(
      (file) =>
        /\.(?:ts|tsx|mts)$/u.test(file) &&
        (
          file.startsWith("app/") ||
          file.startsWith("lib/") ||
          file === "vite.config.ts"
        ),
    );
  const deferredAssets = files.filter((file) =>
    /^(?:assets|authoring-vault|public\/assets|public\/images)\//u.test(
      file,
    ) || /\.(?:glb|gltf|bin|bvh|webp|png|jpe?g|woff2)$/iu.test(file),
  );
  return {
    diffCheck: strict,
    typecheck,
    lintable,
    syntaxCheck,
    tests,
    deferredTests,
    deferredAssets,
  };
}

function summarizeChangedFiles(files) {
  const runtimeVisualDeliveryShards = files.filter((file) =>
    file.startsWith("app/runtime-probe-visual-delivery/"),
  );
  return {
    changedFiles: files.filter(
      (file) =>
        !file.startsWith("app/runtime-probe-visual-delivery/"),
    ),
    changedFileGroups:
      runtimeVisualDeliveryShards.length > 0
        ? {
            "app/runtime-probe-visual-delivery/*.visual.json":
              runtimeVisualDeliveryShards.length,
          }
        : {},
  };
}

async function assertTextWhitespace(files) {
  const textFiles = files.filter((file) =>
    /\.(?:[cm]?[jt]sx?|json|ps1|py|css|ya?ml|toml)$/iu.test(file),
  );
  const failures = [];
  for (const file of textFiles) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const lines = source.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (/[ \t]+$/u.test(line)) failures.push(`${file}:${index + 1}`);
    });
  }
  if (failures.length > 0) {
    throw new Error(`trailing whitespace: ${failures.join(", ")}`);
  }
}

const options = parseArguments(process.argv.slice(2));
const profile = resolveValidationProfile(
  options.strict ? "strict" : process.env.SIGUA_VALIDATION_MODE,
);
const files = await existingFiles(
  options.files.length > 0 ? options.files : await changedFiles(options.base),
);
const selectedTests = await discoverTests(files);
const testPartition = await runnableDevelopmentTests(
  selectedTests,
  profile !== "dev",
);
const plan = validationPlan(
  files,
  testPartition.runnable,
  testPartition.deferred,
  profile !== "dev",
);

process.stdout.write(
  `${JSON.stringify(
    {
      event: "changed-check-plan",
      profile,
      base: options.base,
      changedFileCount: files.length,
      ...summarizeChangedFiles(files),
      checks: {
        diffCheck: plan.diffCheck,
        typecheck: plan.typecheck,
        lintFileCount: plan.lintable.length,
        syntaxFileCount: plan.syntaxCheck.length,
        testFiles: plan.tests,
        deferredTestFiles: plan.deferredTests,
      },
      deferredAssetRebuilds: plan.deferredAssets,
      policy:
        "validate changed code and directly related tests; asset regeneration remains an explicit release task",
    },
    null,
    2,
  )}\n`,
);

if (!options.dryRun) {
  if (plan.diffCheck) {
    await runInherited("Git whitespace check", "git", ["diff", "--check"]);
    if (options.base) {
      await runInherited("base-range whitespace check", "git", [
        "diff",
        "--check",
        `${options.base}...HEAD`,
      ]);
    }
  }
  await assertTextWhitespace(files);
  for (const file of plan.syntaxCheck) {
    await runInherited(`syntax ${file}`, NODE, ["--check", file]);
  }
  if (plan.typecheck) {
    await runInherited("incremental TypeScript check", NODE, [TSC, "--noEmit"]);
  }
  const lintBatchSize = 50;
  for (let index = 0; index < plan.lintable.length; index += lintBatchSize) {
    const batch = plan.lintable.slice(index, index + lintBatchSize);
    await runInherited(
      `ESLint changed files ${index + 1}-${index + batch.length}`,
      NODE,
      [ESLINT, ...batch],
    );
  }
  if (plan.tests.length > 0) {
    await runInherited(
      `${plan.tests.length} directly related Node test file(s)`,
      NODE,
      [
        "--experimental-strip-types",
        "--test",
        `--test-reporter=${pathToFileURL(CONCISE_TEST_REPORTER).href}`,
        ...plan.tests,
      ],
      {
        SIGUA_VALIDATION_MODE: profile,
      },
    );
  }
}

process.stdout.write(
  `${JSON.stringify({
    event: "changed-check-complete",
    profile,
    dryRun: options.dryRun,
    changedFileCount: files.length,
    fullAssetBuildRan: false,
  })}\n`,
);
