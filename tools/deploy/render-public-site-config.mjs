import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMOR_ORIGIN,
  ICP_RECORD,
  LANDING_ORIGIN,
  NAVIGATOR_URL,
  armorUrl,
  originHostname,
} from "../../lib/public-site-topology.mjs";
import { PUBLIC_DOCUMENT_CACHE } from "./public-document-policy.mjs";
import { ARMOR_SELECTOR_ASSETS } from "./armor-selector-assets.mjs";
import { SITE_PORTAL_BRAND } from "./site-portal-brand.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_ROOT = path.join(ROOT, "deploy", "public-site");
const TOKEN_PATTERN = /\{\{([A-Z0-9_]+)\}\}/gu;

const VALUES = Object.freeze({
  LANDING_ORIGIN,
  NAVIGATOR_URL,
  LANDING_HOST: originHostname(LANDING_ORIGIN),
  ARMOR_ORIGIN,
  ARMOR_HOST: originHostname(ARMOR_ORIGIN),
  ARMOR_INTERNATIONAL_URL: armorUrl("international"),
  ARMOR_CHINA_URL: armorUrl("china"),
  ICP_RECORD_NUMBER: ICP_RECORD.number,
  ICP_RECORD_URL: ICP_RECORD.url,
  LANDING_HTML_CACHE_CONTROL: PUBLIC_DOCUMENT_CACHE.landing,
  ARMOR_HTML_CACHE_CONTROL: PUBLIC_DOCUMENT_CACHE.armorHtml,
  PRIVATE_CACHE_CONTROL: PUBLIC_DOCUMENT_CACHE.private,
  SITE_PORTAL_NAME: SITE_PORTAL_BRAND.displayName,
  SITE_PORTAL_ENGLISH_NAME: SITE_PORTAL_BRAND.englishName,
  SITE_PORTAL_FONT_URL: SITE_PORTAL_BRAND.fontAsset.portalPath,
  SITE_PORTAL_SCENE_URL: SITE_PORTAL_BRAND.sceneAsset.portalPath,
  SITE_PORTAL_ARMOR_CHINA_FIGURE_URL:
    SITE_PORTAL_BRAND.armorFigures.china.portalPath,
  SITE_PORTAL_ARMOR_GLOBAL_FIGURE_URL:
    SITE_PORTAL_BRAND.armorFigures.global.portalPath,
  SITE_PORTAL_SCENE_ABSOLUTE_URL: new URL(
    SITE_PORTAL_BRAND.sceneAsset.portalPath,
    LANDING_ORIGIN,
  ).href,
});

export function renderPublicSiteTemplate(source, templateName = "template") {
  const unknown = new Set();
  const rendered = source.replace(TOKEN_PATTERN, (_, name) => {
    if (!(name in VALUES)) {
      unknown.add(name);
      return `{{${name}}}`;
    }
    return VALUES[name];
  });
  if (unknown.size > 0) {
    throw new Error(`${templateName} contains unknown tokens: ${[...unknown].join(", ")}`);
  }
  const unresolved = [...rendered.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
  if (unresolved.length > 0) {
    throw new Error(`${templateName} contains unresolved tokens: ${unresolved.join(", ")}`);
  }
  return rendered.replace(/\r\n?/gu, "\n");
}

export async function renderPublicSiteConfig(outputRoot) {
  const resolvedOutput = path.resolve(outputRoot);
  const allowedRoot = path.join(ROOT, "outputs");
  const relative = path.relative(allowedRoot, resolvedOutput);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`public-site output must stay inside outputs/: ${resolvedOutput}`);
  }
  const templates = [
    ["armor-selector.template.html", "index.html"],
    ["landing.template.html", "navigator/index.html"],
    ["Caddyfile.template", "Caddyfile"],
    ["docker-compose.template.yml", "docker-compose.yml"],
  ];
  await mkdir(resolvedOutput, { recursive: true });
  for (const [templateName, outputName] of templates) {
    const source = await readFile(path.join(TEMPLATE_ROOT, templateName), "utf8");
    const outputPath = path.join(resolvedOutput, outputName);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      renderPublicSiteTemplate(source, templateName),
      "utf8",
    );
  }
  await cp(
    path.join(TEMPLATE_ROOT, "assets"),
    path.join(resolvedOutput, "portal-assets"),
    { recursive: true, force: true },
  );
  await Promise.all(
    ARMOR_SELECTOR_ASSETS.map(({ fileName, sourceFileName }) =>
      copyFile(
        path.join(TEMPLATE_ROOT, "assets", sourceFileName),
        path.join(resolvedOutput, "portal-assets", fileName),
      ),
    ),
  );
  return resolvedOutput;
}

function parseOutputRoot(args) {
  if (args.length !== 2 || args[0] !== "--output-root") {
    throw new Error("usage: node tools/deploy/render-public-site-config.mjs --output-root outputs/<id>");
  }
  return args[1];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const outputRoot = parseOutputRoot(process.argv.slice(2));
  console.log(await renderPublicSiteConfig(outputRoot));
}
