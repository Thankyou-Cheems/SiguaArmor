import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createWikiHybridViteConfig } from "./wiki-hybrid-vite-config.mjs";

const [wikiRoot, manifestPath] = process.argv.slice(2);
assert(wikiRoot && manifestPath,"Usage: serve-wiki-preview <Wiki worktree> <aircraft manifest.json>");
const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
assert.equal(manifest.schemaVersion,"sigua-command-aircraft-publication/v1");
const config=createWikiHybridViteConfig({wikiRoot:path.resolve(wikiRoot),localAssetOrigin:"https://wiki.siguad.icu",
  localAssetPaths:[...manifest.files.map(f=>f.url),...manifest.entries.flatMap(e=>e.visuals.map(v=>`/assets/runtime-probe/visuals/${v.descriptor.id}.json`))]});
const server=await createServer({...config,configFile:false,appType:"mpa",server:{...config.server,host:"127.0.0.1",port:4840,strictPort:true}});
await server.listen(); console.log("Wiki candidate: http://127.0.0.1:4840");
