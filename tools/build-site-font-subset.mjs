import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontDirectory = join(root, "public", "fonts");
const sourceName = "sigua-unbounded-site-4542d8a1ac6ce837.woff2";
const sourcePath = join(fontDirectory, sourceName);
const temporaryPath = join(fontDirectory, ".sigua-unbounded-display.tmp.woff2");
const expectedSourceSha256 =
  "4542d8a1ac6ce8376ec0edf3fea4adfa5ebfe12ff537fd663fee8e0cfe3c1a63";
const fontToolsVersion = "4.59.1";
const unicodeRanges = [
  "U+0020-024F",
  "U+0300-052F",
  "U+1E00-1EFF",
  "U+2000-206F",
  "U+20A0-20CF",
  "U+2100-214F",
  "U+2190-22FF",
  "U+2460-27BF",
  "U+FFFD",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error(
    `Unexpected source font hash: ${sourceSha256} (expected ${expectedSourceSha256})`,
  );
}

if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
const executable = process.platform === "win32" ? "uvx.exe" : "uvx";
const result = spawnSync(
  executable,
  [
    "--from",
    `fonttools[woff]==${fontToolsVersion}`,
    "pyftsubset",
    sourcePath,
    `--output-file=${temporaryPath}`,
    "--flavor=woff2",
    `--unicodes=${unicodeRanges.join(",")}`,
    "--layout-features=*",
    "--glyph-names",
    "--symbol-cmap",
    "--legacy-cmap",
    "--notdef-glyph",
    "--notdef-outline",
    "--recommended-glyphs",
    "--name-IDs=*",
    "--name-legacy",
    "--name-languages=*",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw new Error(`pyftsubset failed with status ${result.status ?? "unknown"}`);
}

const subsetBytes = readFileSync(temporaryPath);
const subsetSha256 = sha256(subsetBytes);
const outputName = `sigua-unbounded-display-${subsetSha256.slice(0, 16)}.woff2`;
const outputPath = join(fontDirectory, outputName);
if (existsSync(outputPath)) {
  const currentBytes = readFileSync(outputPath);
  if (!currentBytes.equals(subsetBytes)) {
    unlinkSync(temporaryPath);
    throw new Error(`Existing font does not match generated output: ${outputName}`);
  }
  unlinkSync(temporaryPath);
} else {
  renameSync(temporaryPath, outputPath);
}

const manifest = {
  schemaVersion: 3,
  family: "标小智无界黑 / LogoSC Unbounded Sans",
  sourceRelease: "https://github.com/maoken-fonts/unbounded-sans/releases/tag/v1.100",
  sourceFile: `/fonts/${sourceName}`,
  sourceSha256,
  buildRecipe: "pyftsubset-display-ranges/v1",
  tool: `uvx --from fonttools[woff]==${fontToolsVersion} pyftsubset`,
  license: "SIL Open Font License 1.1",
  licensePath: "/fonts/LogoSCUnboundedSans-OFL.txt",
  coverage: {
    strategy: "latin-greek-cyrillic-display-ranges/v1",
    unicodeRanges,
    cjkFallback:
      "Noto Sans SC, Microsoft YaHei UI, Microsoft YaHei, system-ui, sans-serif",
  },
  subset: {
    path: `/fonts/${outputName}`,
    format: "woff2",
    bytes: subsetBytes.length,
    sha256: subsetSha256,
  },
};
writeFileSync(
  join(fontDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${outputPath}\n${subsetBytes.length} bytes\n`);
