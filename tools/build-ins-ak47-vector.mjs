import { writeFile } from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://upload.wikimedia.org/wikipedia/commons/1/19/AK47.svg";
const outputPath = path.resolve("public/icons/Faction Icons/ins_flag_display.svg");
const response = await fetch(sourceUrl, {
  headers: { "User-Agent": "SiguaArmor-international-foundation/1.0 asset fetcher" },
});

if (!response.ok) {
  throw new Error(`AK47 SVG download failed: ${response.status} ${response.statusText}`);
}

const source = await response.text();
const pathMatch = source.match(/<path\b[^>]*\bd="([\s\S]*?)"[\s\S]*?\/>/);
if (!pathMatch) {
  throw new Error("No AK47 path found in the downloaded SVG");
}

const ak47Path = pathMatch[1].replace(/\s+/g, " ").trim();
const output = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 384" role="img" aria-labelledby="title desc">
  <title id="title">INS flag</title>
  <desc id="desc">Red and black diagonal flag with a gold division and a white AK-47 silhouette.</desc>
  <!-- AK47 geometry adapted from Wikimedia Commons File:AK47.svg by Meul, CC BY-SA 3.0. -->
  <rect width="768" height="384" fill="#b51d29"/>
  <path d="M124 384 768-12v396H124Z" fill="#05080b"/>
  <path d="M124 384 768-12" fill="none" stroke="#f2c529" stroke-width="12"/>
  <path d="${ak47Path}" fill="#fff" fill-rule="evenodd" transform="translate(38 24) scale(1.28 .92)"/>
</svg>
`;

await writeFile(outputPath, output, "utf8");
console.log(`INS flag rebuilt from ${sourceUrl}`);
