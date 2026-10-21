import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyCoordinateBasis,discoverCoordinateSource} from '../../tools/sync-coordinate-basis.mjs';
const schemaVersion='sigua-shared-coordinate-basis-source/v1';
const sourcePath='algorithms/coordinates/basis.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('normal validation checks the reviewed local receipt and any discovered owner',async()=>{
 const root=new URL('../..',import.meta.url);
 const receipt=JSON.parse(await readFile(new URL('../../lib/shared/coordinate-basis-source.json',import.meta.url),'utf8'));
 const bytes=await readFile(new URL('../../lib/shared/coordinate-basis.js',import.meta.url));
 assert.equal(receipt.owner,'SiguaWiki');
 assert.equal(receipt.sourcePath,sourcePath);
 assert.equal(hash(bytes),receipt.sha256);
 const packageJson=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(packageJson.scripts.pretest,'npm run check:coordinate-basis');
 assert.equal(packageJson.scripts.prebuild,'npm run check:coordinate-basis');
 const result=await verifyCoordinateBasis(fileURLToPath(root));
 assert.equal(result.sha256,receipt.sha256);
});

test('upstream drift fails normal validation even when local copy and receipt agree',async t=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'sigua-coordinate-source-'));
 t.after(()=>rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'SiguaArmor/.local/worktrees/paired');
 const wiki=path.join(temp,'SiguaWiki/.local/worktrees/paired');
 await mkdir(path.join(root,'lib/shared'),{recursive:true});
 await mkdir(path.join(wiki,'algorithms/coordinates'),{recursive:true});
 await writeFile(path.join(root,'lib/shared/coordinate-basis.js'),'old-source');
 await writeFile(path.join(root,'lib/shared/coordinate-basis-source.json'),JSON.stringify({schemaVersion,owner:'SiguaWiki',sourcePath,sha256:hash('old-source')}));
 await writeFile(path.join(wiki,sourcePath),'new-source');
 assert.equal(await discoverCoordinateSource(root,undefined,{}),wiki);
 await assert.rejects(verifyCoordinateBasis(root,{env:{}}),/differs from Wiki/);
 // Explicit reviewed source update repairs drift; normal discovery then passes.
 await verifyCoordinateBasis(root,{source:wiki,write:true,env:{}});
 assert.equal((await verifyCoordinateBasis(root,{env:{}})).mode,'source-checked');
 await writeFile(path.join(root,'lib/shared/coordinate-basis.js'),'corrupted-copy');
 await assert.rejects(verifyCoordinateBasis(root,{env:{}}),/differs from its receipt/);
});

test('missing requested owner never falls back to a local receipt',async()=>{
 await assert.rejects(discoverCoordinateSource('unused','nonexistent-wiki-source',{}));
});
