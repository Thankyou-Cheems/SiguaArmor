import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "public", "icons", "Faction Icons");
const generatedDirectory = join(root, "generated");
const outputWidth = 96;
const outputHeight = 128;
const sources = {
  adf: "adf_flag_display.svg",
  afu: "afu_flag_display.svg",
  baf: "baf_flag_display.svg",
  caf: "caf_flag_display.svg",
  crf: "crf_flag_display.webp",
  gfi: "gfi_flag_display.svg",
  imf: "imf_flag_display.svg",
  mei: "ins_flag_display.svg",
  plaagf: "plaagf_flag_display.webp",
  pla: "pla_flag_display.svg",
  planmc: "planmc_flag_display.svg",
  rgf: "rgf_flag_display.svg",
  tlf: "tlf_flag_display.svg",
  usa: "usa_flag_display.svg",
  usmc: "usmc_flag_display.svg",
  vdv: "vdv_flag_display.svg",
  wpmc: "wpmc_flag_display.webp",
};

await mkdir(generatedDirectory, { recursive: true });
const assets = {};
for (const [id, sourceName] of Object.entries(sources)) {
  const sourcePath = join(sourceDirectory, sourceName);
  const output = await sharp(sourcePath, { density: 192 })
    .resize(outputWidth, outputHeight, { fit: "fill" })
    .webp({
      quality: 90,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();
  const digest = createHash("sha256").update(output).digest("hex");
  const outputName = `${id}_flag_display-${digest.slice(0, 16)}.webp`;
  const outputPath = join(sourceDirectory, outputName);
  try {
    const current = await readFile(outputPath);
    if (!current.equals(output)) {
      throw new Error(`Existing flag output does not match: ${outputName}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(outputPath, output);
  }
  assets[id] = `/icons/Faction Icons/${outputName}`;
}

await writeFile(
  join(generatedDirectory, "international-faction-flag-assets.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `${Object.keys(assets).length} flags at ${outputWidth}x${outputHeight}\n`,
);
