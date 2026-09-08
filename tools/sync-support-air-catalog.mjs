import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Product topology only; mechanics and payloads continue to load from Wiki.
assert(process.argv[2], "Usage: node tools/sync-support-air-catalog.mjs <Wiki vehicle catalog.json>");
const root=path.resolve(import.meta.dirname,"..");
const wiki=JSON.parse(await readFile(process.argv[2],"utf8"));
assert.equal(wiki.schemaVersion,"sigua-vehicle-catalog/v3.1");
const bindings=new Map(wiki.extensions.supportAir.bindings.map(b=>[b.bindingKey,b]));
let changed=0;
for(const [edition,filename] of [["international","catalog-index.json"],["china","china-catalog-index.json"]]) {
  const target=path.join(root,"generated",filename), original=await readFile(target,"utf8"), catalog=JSON.parse(original);
  for(const record of catalog.records) for(const variant of record.variants) {
    if(variant.catalogBindingRef) continue;
    const binding=bindings.get(`${record.wikiSourceCardId ?? record.promoEntryId}\u0000${variant.sourceRawName}`);
    if(!binding?.runtimeVehicleRef || !binding.visualArtifactRefs[edition]) continue;
    assert.equal(variant.vehicleRef,null);
    variant.runtimeVehicleRef=binding.runtimeVehicleRef;
    variant.visualArtifactRef=binding.visualArtifactRefs[edition];
    changed++;
  }
  const next=JSON.stringify(catalog,null,2)+"\n";
  if(next!==original) await writeFile(target,next);
}
assert.equal(changed,32,"Commander card coverage drifted");
console.log(`Updated ${changed} commander card bindings`);
