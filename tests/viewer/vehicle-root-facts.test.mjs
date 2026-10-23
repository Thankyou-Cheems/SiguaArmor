import {mkdtemp,mkdir,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import test from "node:test";
import {build} from "esbuild";
const root=fileURLToPath(new URL("../../",import.meta.url));
test("real root-facts component shows unknown/zero/false and clears old facts on identity failure",async()=>{
 await mkdir(path.join(root,".local"),{recursive:true});
 const output=await mkdtemp(path.join(root,".local","vehicle-root-facts-dom-"));
 try{
  await build({entryPoints:[path.join(root,"tests/fixtures/vehicle-root-facts-dom.jsx")],bundle:true,
   platform:"node",format:"esm",packages:"external",outfile:path.join(output,"fixture.mjs"),logLevel:"silent"});
  await import(pathToFileURL(path.join(output,"fixture.mjs")).href);
 }finally{await rm(output,{recursive:true,force:true});}
});
