import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('bundled coordinate algorithm matches the reviewed Wiki source receipt',async()=>{
 const receipt=JSON.parse(await readFile(new URL('../../lib/shared/coordinate-basis-source.json',import.meta.url),'utf8'));
 const bytes=await readFile(new URL('../../lib/shared/coordinate-basis.js',import.meta.url));
 assert.equal(receipt.owner,'SiguaWiki');
 assert.equal(receipt.sourcePath,'algorithms/coordinates/basis.js');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
});
