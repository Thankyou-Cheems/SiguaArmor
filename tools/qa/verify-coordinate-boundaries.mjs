// Uses the repository's existing installed-Chromium headless QA path.
// No user browser profile, foreground window, software installation or registry edit.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'outputs/coordinate-browser');
const profile=path.join(root,'.local/coordinate-browser','edge-'+Date.now());
await mkdir(output,{recursive:true});await mkdir(profile,{recursive:true});
const browser=process.env.CHROMIUM_PATH||(process.platform==='win32'?'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe':'chromium');
const server=await createServer({root,configFile:false,appType:'mpa',cacheDir:path.join(root,'.local/coordinate-browser/vite-cache'),define:{'process.env.NEXT_PUBLIC_SIGUA_WIKI_ORIGIN':'undefined','process.env.NEXT_PUBLIC_SIGUA_MAP_ORIGIN':'undefined'},server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/.local/**','**/outputs/**']}}});
try {
 await server.listen();const port=server.httpServer.address().port;
 const url='http://127.0.0.1:'+port+'/tools/qa/coordinate-boundary.html';
 const args=['--headless','--disable-extensions','--no-first-run','--disable-background-networking','--no-default-browser-check','--user-data-dir='+profile,'--dump-dom','--window-size=1024,900','--virtual-time-budget=8000','--screenshot='+path.join(output,'fixture.png'),url];
 const {stdout,stderr}=await promisify(execFile)(browser,args,{encoding:'utf8',maxBuffer:5*1024*1024,timeout:45000,windowsHide:true});
 await writeFile(path.join(output,'browser-stderr.log'),stderr);
 const match=stdout.match(/<pre id="results">([^<]+)<\/pre>/u);
 assert(match,'Headless browser must finish the coordinate fixture');
 const result=JSON.parse(match[1].replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&'));
 result.sourceReceipt=JSON.parse(await readFile(path.join(root,'lib/shared/coordinate-basis-source.json'),'utf8'));
 await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
 assert.equal(result.state,'passed',JSON.stringify(result.errors));assert.equal(result.numeric.length,5);assert.equal(result.framebuffers.length,5);
 console.log('PASS: 5 browser consumer snapshots and 5 WebGL framebuffer comparisons; no fixture runtime errors. Full product asset pixel QA remains separate.');
}finally{await server.close();}
