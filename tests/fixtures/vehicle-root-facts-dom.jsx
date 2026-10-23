import assert from "node:assert/strict";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {VehicleRootFacts} from "../../app/VehicleRootFacts";
import {rootFixture} from "./vehicle-root-observation.mjs";
const fixture=rootFixture(),before=structuredClone(fixture),originalFetch=globalThis.fetch;
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:"https://armor.test",pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
let resolveSlow;
globalThis.fetch=async url=>{
 if(String(url).includes("/runtime/"))return new Response(JSON.stringify(fixture.runtime));
 if(!String(url).includes("/records/"))return new Response(JSON.stringify(fixture.index));
 return new Promise(resolve=>{resolveSlow=()=>resolve(new Response(JSON.stringify(fixture.document)));});
};
const root=createRoot(document.getElementById("root"));
try{
 await act(async()=>{root.render(<VehicleRootFacts selection={fixture.selection}/>);});
 assert.match(document.body.textContent,/正在读取当前根配置资料/u);
 await act(async()=>{resolveSlow();});
 // Wait for the actual WebCrypto-backed selection, without assuming its
 // completion time under a parallel full-suite run.
 for(let turn=0;turn<100&&!document.querySelector('.vehicle-root-facts__summary');turn++){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 }
 assert.match(document.body.textContent,/载具耐久未知/u);
 assert.match(document.body.textContent,/席位耐久 0/u);
 assert.match(document.body.textContent,/承受范围伤害否/u);
 assert.match(document.body.textContent,/附加配置 1/u);
 assert.match(document.body.textContent,/伤害计算不使用本区数据/u);
 assert.doesNotMatch(document.body.textContent,/F1|F2/u);
 await act(async()=>{root.render(<VehicleRootFacts selection={{...fixture.selection,runtimeVehicleRef:"wrong"}}/>);});
 assert.match(document.body.textContent,/当前根配置资料读取失败/u);
 assert.doesNotMatch(document.body.textContent,/席位耐久 0/u,"old selected facts must not remain under a different binding");
 await act(async()=>{root.render(<VehicleRootFacts selection={null}/>);});
 assert.match(document.body.textContent,/缺少精确身份/u);
 assert.deepEqual(fixture,before);
}finally{
 await act(async()=>{root.unmount();});dom.window.close();globalThis.fetch=originalFetch;
}
