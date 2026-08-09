import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMOR_ORIGIN,
  LANDING_ORIGIN,
  originHostname,
} from "../../lib/public-site-topology.mjs";

const LANDING_HOST = originHostname(LANDING_ORIGIN);
const ARMOR_HOST = originHostname(ARMOR_ORIGIN);

function replaceExactlyOnce(source, current, replacement) {
  const occurrences = source.split(current).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected exactly one outer Caddy site label ${JSON.stringify(current)}, found ${occurrences}`,
    );
  }
  return source.replace(current, replacement);
}

export function patchPublicOriginCaddy(source) {
  let patched = source.replace(/\r\n?/gu, "\n");
  for (const scheme of ["http", "https"]) {
    const current = `${scheme}://${LANDING_HOST} {`;
    const replacement = `${scheme}://${LANDING_HOST}, ${scheme}://${ARMOR_HOST} {`;
    if (patched.includes(replacement)) continue;
    patched = replaceExactlyOnce(patched, current, replacement);
  }
  return patched;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!value || !["--input", "--output"].includes(name)) {
      throw new Error(
        "usage: node tools/deploy/patch-public-origin-caddy.mjs --input <path> --output <path>",
      );
    }
    options[name.slice(2)] = value;
  }
  if (!options.input || !options.output) {
    throw new Error("both --input and --output are required");
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const source = await readFile(options.input, "utf8");
  await writeFile(options.output, patchPublicOriginCaddy(source), "utf8");
  console.log(path.resolve(options.output));
}
