// Local-only fixture. Serve existing canonical payload bytes to the real Armor
// renderer and Calc decoders. This does not bypass or test production CORS.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url)),config=JSON.parse(await fs.readFile(process.argv[2])),hash=b=>createHash('sha256').update(b).digest('hex');
const stage=config.outputRoot,entryPath='views/'+config.scope.id+'.json',entryBytes=await fs.readFile(path.join(stage,entryPath)),entry=JSON.parse(entryBytes),viewBytes=await fs.readFile(path.join(stage,entry.view.path)),view=JSON.parse(viewBytes);
if(hash(viewBytes)!==entry.view.sha256||viewBytes.length!==entry.view.bytes)throw Error('Fixture view identity differs');
const resources=new Map(view.resources.map(r=>[r.transport.path,r])),cache=new Map();
const {restoreResourceBytes}=await import(pathToFileURL(path.join(config.calcRoot,'web/src/map-runtime-wire/resource-representation.mjs')).href);
const read=async r=>{
  if(cache.has(r.resourceId))return cache.get(r.resourceId);
  let canonical;
  for(const directory of [config.displayRoot,...config.objectRoots])try{
    const packed=await fs.readFile(path.join(directory,r.transport.path));if(packed.length!==r.transport.bytes||hash(packed)!==r.transport.sha256)throw Error('Fixture transport mismatch');
    const raw=r.transport.contentEncoding==='br'?brotliDecompressSync(packed):packed;
    canonical=Buffer.from(restoreResourceBytes(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),r.transport.representation));break;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  canonical??=await fs.readFile(path.join(config.cacheRoot,r.decoded.sha256));
  if(canonical.length!==r.decoded.bytes||hash(canonical)!==r.decoded.sha256)throw Error('Fixture canonical mismatch');cache.set(r.resourceId,canonical);return canonical;
};
const output=path.join(root,'outputs/school-resource-view'),profile=path.join(root,'.local/school-resource-view','edge-'+Date.now());await fs.mkdir(output,{recursive:true});await fs.mkdir(profile,{recursive:true});
const server=await createServer({root,configFile:false,appType:'mpa',cacheDir:path.join(root,'.local/school-resource-view/vite-cache'),resolve:{alias:{'@calc':path.join(config.calcRoot,'web/src'),'@wiki':path.join(config.wikiRoot,'algorithms/maps')},dedupe:['three']},define:{__SIGUA_WIKI_BASE__:JSON.stringify('https://wiki.siguad.icu'),'process.env.NEXT_PUBLIC_SIGUA_WIKI_ORIGIN':'undefined','process.env.NEXT_PUBLIC_SIGUA_MAP_ORIGIN':'undefined'},server:{host:'127.0.0.1',port:0,fs:{allow:[root,config.calcRoot,config.wikiRoot]},watch:{ignored:['**/.local/**','**/outputs/**']}},plugins:[{name:'bounded-school-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url==='/qa-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({scope:config.scope,viewSha256:entry.view.sha256}));return;}
  if(!req.url?.startsWith('/qa-map/'))return next();
  try{const relative=req.url.slice('/qa-map/'.length);let body;if(relative===entryPath)body=entryBytes;else if(relative===entry.view.path)body=viewBytes;else if(resources.has(relative))body=await read(resources.get(relative));else{res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',relative.endsWith('.json')?'application/json':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(body);
  }catch(error){res.statusCode=500;res.end(String(error));}
});}}]});
await server.listen();const url='http://127.0.0.1:'+server.httpServer.address().port+'/tools/qa/school-resource-view.html';
if(process.argv.includes('--serve')){console.log(url);await new Promise(()=>{});}
else try {
  const browser=process.env.CHROMIUM_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'chromium');
  const {stdout,stderr}=await promisify(execFile)(browser,['--headless','--disable-extensions','--no-first-run','--disable-background-networking','--no-default-browser-check','--user-data-dir='+profile,'--dump-dom','--window-size=1140,1000','--virtual-time-budget=30000','--screenshot='+path.join(output,'school.png'),url],{encoding:'utf8',maxBuffer:8*1048576,timeout:60000,windowsHide:true});
  await fs.writeFile(path.join(output,'browser-stderr.log'),stderr);await fs.writeFile(path.join(output,'browser.html'),stdout);
  const match=stdout.match(/<pre id="results">([^<]+)<\/pre>/u);if(!match)throw Error('Browser did not produce a report');
  const report=JSON.parse(match[1].replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&'));
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');if(report.state!=='passed')throw Error(JSON.stringify(report));console.log(JSON.stringify(report,null,2));
}finally{await server.close();}
