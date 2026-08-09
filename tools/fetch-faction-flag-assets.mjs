import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputRoot = path.resolve("public/icons/Faction Icons");
const userAgent = "SiguaArmor-international-foundation/1.0 asset fetcher";

async function fetchWithRetry(url, options) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, options);
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }
  throw new Error(`Request retry loop unexpectedly exhausted for ${url}`);
}

const sources = [
  { id: "adf", commonsFile: "Flag of Australia.svg", output: "adf_flag_display.svg", format: "svg" },
  { id: "afu", commonsFile: "Flag of Ukraine.svg", output: "afu_flag_display.svg", format: "svg" },
  { id: "baf", commonsFile: "Flag of the United Kingdom.svg", output: "baf_flag_display.svg", format: "svg" },
  { id: "caf", commonsFile: "Flag of Canada.svg", output: "caf_flag_display.svg", format: "svg" },
  { id: "crf", fandomFile: "Flag of CRF.png", output: "crf_flag_display.webp", format: "webp" },
  {
    id: "gfi",
    commonsFile: "Flag of Iran.svg",
    output: "gfi_flag_display.svg",
    format: "svg",
  },
  { id: "pla", commonsFile: "Flag of the People's Liberation Army.svg", output: "pla_flag_display.svg", format: "svg" },
  { id: "plaagf", fandomFile: "Flag of PLAAGF.png", output: "plaagf_flag_display.webp", format: "webp" },
  { id: "planmc", commonsFile: "Naval Ensign of China.svg", output: "planmc_flag_display.svg", format: "svg" },
  { id: "rgf", commonsFile: "Flag of Russia.svg", output: "rgf_flag_display.svg", format: "svg" },
  { id: "tlf", commonsFile: "Flag of Turkey.svg", output: "tlf_flag_display.svg", format: "svg" },
  { id: "usa", commonsFile: "Flag of the United States.svg", output: "usa_flag_display.svg", format: "svg" },
  {
    id: "usmc",
    commonsFile: "Flag of the United States Marine Corps.svg",
    output: "usmc_flag_display.svg",
    format: "svg",
  },
  {
    id: "vdv",
    commonsFile: "Flag of the Russian Airborne Troops.svg",
    output: "vdv_flag_display.svg",
    format: "svg",
  },
  { id: "wpmc", fandomFile: "Flag of WPMC.png", output: "wpmc_flag_display.webp", format: "webp" },
];

function apiUrl(file, endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", `File:${file}`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  return url;
}

function commonsFileUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(" ", "_"))}`;
}

async function fetchSourceUrl(file, endpoint) {
  const response = await fetchWithRetry(apiUrl(file, endpoint), {
    headers: { "User-Agent": userAgent },
  });
  if (!response.ok) {
    throw new Error(`MediaWiki API failed for ${endpoint} / ${file}: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages ?? {})[0];
  const sourceUrl = page?.imageinfo?.[0]?.url;
  if (typeof sourceUrl !== "string" || sourceUrl.length === 0) {
    throw new Error(`No image URL returned for ${endpoint} / ${file}`);
  }
  return sourceUrl;
}

for (const source of sources) {
  const endpoint = source.commonsFile ? "https://commons.wikimedia.org/w/api.php" : "https://squad.fandom.com/api.php";
  const sourceFile = source.commonsFile ?? source.fandomFile;
  const sourceUrl = source.commonsFile
    ? commonsFileUrl(source.commonsFile)
    : await fetchSourceUrl(source.fandomFile, endpoint);
  const response = await fetchWithRetry(sourceUrl, {
    headers: { "User-Agent": userAgent },
  });
  if (!response.ok) {
    throw new Error(`Image download failed for ${sourceFile}: ${response.status} ${response.statusText}`);
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(outputRoot, source.output);
  if (source.format === "svg") {
    await writeFile(outputPath, sourceBuffer);
  } else {
    await sharp(sourceBuffer)
      .rotate()
      .resize({ width: 768, kernel: "lanczos3" })
      .sharpen({ sigma: 0.6, m1: 1, m2: 2 })
      .webp({ quality: 92, effort: 6 })
      .toFile(outputPath);
  }
  console.log(`${source.id}: ${sourceFile} -> ${source.output}`);
  await new Promise((resolve) => setTimeout(resolve, 600));
}
