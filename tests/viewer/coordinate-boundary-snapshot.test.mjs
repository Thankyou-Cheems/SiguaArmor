import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureCoordinateBoundaries} from '../fixtures/coordinate-boundary-capture.mjs';
const snapshot=JSON.parse(await readFile(new URL('../fixtures/coordinate-boundary-before-refactor.json',import.meta.url),'utf8'));
for(const row of snapshot.cases)test('pre-refactor crew/turret/projectile/scene snapshot: '+row.input.id,()=>{
  assert.equal(JSON.stringify(captureCoordinateBoundaries(row.input)),JSON.stringify(row.expected));
});
