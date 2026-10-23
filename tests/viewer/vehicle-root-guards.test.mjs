import {mkdtemp,mkdir,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import test from "node:test";
import {build} from "esbuild";
const root=fileURLToPath(new URL("../../",import.meta.url));
test("real encyclopedia mounts current root loader despite absent legacy data or failed equipment chunk",async()=>{
 await mkdir(path.join(root,".local"),{recursive:true});
 const output=await mkdtemp(path.join(root,".local","vehicle-root-guards-dom-"));
 try{
  await build({entryPoints:[path.join(root,"tests/fixtures/vehicle-root-guards-dom.jsx")],bundle:true,
   platform:"node",format:"esm",packages:"external",splitting:true,outdir:output,logLevel:"silent",
   plugins:[{name:"legacy-equipment-failure",setup(builder){
    builder.onResolve({filter:/^next\/link$/},()=>({path:"next-link",namespace:"root-guard-fixture"}));
    builder.onResolve({filter:/^\.\/runtime-vehicle-equipment$/},args=>args.importer.replaceAll('\\','/').endsWith('app/CatalogApp.tsx')?{path:"equipment-failure",namespace:"root-guard-fixture"}:undefined);
    builder.onLoad({filter:/.*/,namespace:"root-guard-fixture"},args=>({contents:args.path==='next-link'?'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}':'throw new Error("controlled equipment chunk unavailable");',loader:"js",resolveDir:root}));
   }}]});
  await import(pathToFileURL(path.join(output,"vehicle-root-guards-dom.js")).href);
 }finally{await rm(output,{recursive:true,force:true});}
});
