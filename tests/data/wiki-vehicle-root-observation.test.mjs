import assert from "node:assert/strict";
import test from "node:test";
import { rootFixture, pinRootRecord } from "../fixtures/vehicle-root-observation.mjs";
const observed = value => ({state:"observed",value});
const unknown = () => ({state:"unknown",value:null});
let revision=0;
const fresh=()=>import(`../../lib/wiki-source.ts?root-fixture=${++revision}`);
const json=value=>new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json"}});
async function withSource(f,run){
 const original=globalThis.fetch,urls=[];
 try{globalThis.fetch=async url=>{urls.push(String(url));return json(String(url).includes("/runtime/")?f.runtime:String(url).includes("/records/")?f.document:f.index);};await run(await fresh(),urls);}
 finally{globalThis.fetch=original;}
}

test("actual loader binds runtime identity before displaying selected facts without changing old data",async()=>{
 const f=rootFixture(),before=structuredClone(f);
 await withSource(f,async(source,urls)=>{
  const result=await source.loadWikiVehicleRootObservation(f.selection);
  assert.equal(result.maxHealth.state,"unknown");assert.equal(result.maxHealth.value,null);
  assert.deepEqual(result.damagedByRadialExplosions,observed(false));
  assert.deepEqual(result.driver.seatHealth,observed(0));assert.deepEqual(result.driver.seatPawnClassPath,observed(null));
  assert.equal(result.additional.value[0].sourceIndex,0);
  assert.equal("general" in result,false);assert.equal("stationGraph" in result,false);assert.equal("index" in result.driver,false);
  assert.equal(urls.length,3);assert.match(urls[1],/\/data\/vehicles\/seat-observations\/v1\/catalog.json$/u);
  assert.match(urls[2],/\/records\/[a-f0-9]{64}\.json$/u);
  await source.loadWikiVehicleRootObservation(f.selection);assert.equal(urls.length,3,"repeat shares immutable record transport");
 });
 assert.deepEqual(f,before);
});

test("unavailable and unknown seat facts stay explicit without class/seat/order fallback",async()=>{
 const f=rootFixture();f.index.entries=[];
 await withSource(f,async source=>assert.equal(await source.loadWikiVehicleRootObservation(f.selection),null));
 const g=rootFixture();g.row.seats.driver={sourceProperty:"DriverSeatConfig",sourceIndex:null,state:"unknown"};g.row.seats.additional=unknown();
 pinRootRecord(g);
 await withSource(g,async source=>{const result=await source.loadWikiVehicleRootObservation(g.selection);assert.equal(result.driver.seatHealth.state,"unknown");assert.equal(result.additional.state,"unknown");});
});

test("wrong identity, duplicate binding, promoted scope and fixture evidence reject, failed transport can retry",async()=>{
 for(const mutate of [f=>f.runtime.variants[0].runtimeVehicleRef="wrong",f=>f.runtime.variants.push(structuredClone(f.runtime.variants[0])),
  f=>f.row.generatedClass="/Game/Other.Other_C",f=>f.index.entries.push(structuredClone(f.index.entries[0])),
  f=>f.row.sourceBuildId="squad-sdk-other",f=>f.index.entries[0].generatedClass="/Game/Other.Other_C",
  f=>f.row.qualification.stationGraph="renewed",f=>f.row.evidenceMode="controlled-fixture",f=>f.row.seats.additional.value[0].sourceIndex=1]){
  const f=rootFixture();mutate(f);pinRootRecord(f);await withSource(f,async source=>assert.rejects(source.loadWikiVehicleRootObservation(f.selection)));
 }
 const original=globalThis.fetch,f=rootFixture();let failed=false;
 try{
  globalThis.fetch=async url=>String(url).includes("/runtime/")?json(f.runtime):String(url).includes("/records/")?json(f.document):!failed?(failed=true,new Response("unavailable",{status:503})):json(f.index);
  const source=await fresh();await assert.rejects(source.loadWikiVehicleRootObservation(f.selection),/503/u);
  assert.equal((await source.loadWikiVehicleRootObservation(f.selection)).sourceVehicleRef,f.row.sourceVehicleRef);
 }finally{globalThis.fetch=original;}
});

test("content-addressed records reject altered bytes and unsafe references",async()=>{
 const altered=rootFixture();altered.row.root.maxHealth=observed(999);
 await withSource(altered,async source=>assert.rejects(source.loadWikiVehicleRootObservation(altered.selection),/integrity/u));
 for(const mutate of [f=>f.index.entries[0].observation.bytes++,f=>f.index.entries[0].observation.url="https://other.test/record.json",
  f=>f.index.entries[0].observation.bytes=3*1024*1024]){
  const f=rootFixture();mutate(f);await withSource(f,async source=>assert.rejects(source.loadWikiVehicleRootObservation(f.selection)));
 }
});

test("directory TTL keeps one snapshot and a new content hash selects only the new exact record",async()=>{
 const f=rootFixture(),originalNow=Date.now;let now=1000;
 try{
  Date.now=()=>now;
  await withSource(f,async(source,urls)=>{
   assert.equal((await source.loadWikiVehicleRootObservation(f.selection)).maxHealth.state,"unknown");
   f.row.root.maxHealth=observed(1250);pinRootRecord(f);
   assert.equal((await source.loadWikiVehicleRootObservation(f.selection)).maxHealth.state,"unknown");
   assert.equal(urls.length,3,"the same directory snapshot still binds the old immutable record");
   now+=60001;
   assert.equal((await source.loadWikiVehicleRootObservation(f.selection)).maxHealth.value,1250);
   assert.equal(urls.length,5,"only the directory and one new content-addressed record are read");
  });
 }finally{Date.now=originalNow;}
});
