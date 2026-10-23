import assert from "node:assert/strict";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {ReferenceDataView} from "../../app/CatalogApp";
import {rootFixture} from "./vehicle-root-observation.mjs";
const fixture=rootFixture(),originalFetch=globalThis.fetch;
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:"https://armor.test",pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
const requests=[];
globalThis.fetch=async url=>{
 requests.push(String(url));
 return new Response(JSON.stringify(String(url).includes('/runtime/')?fixture.runtime:String(url).includes('/records/')?fixture.document:fixture.index));
};
const root=createRoot(document.getElementById("root"));
try{
 await act(async()=>{root.render(<ReferenceDataView data={null} rootSelection={fixture.selection}/>);});
 for(let turn=0;turn<100&&!document.querySelector('.vehicle-root-facts__summary');turn++){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 }
 assert.match(document.body.textContent,/详细参数暂未整理/u);
 assert.match(document.body.textContent,/载具耐久未知/u,"valid current observations remain visible without legacy mechanics");
 assert.equal(requests.length,3,"the real root loader requests runtime, index and the exact content-addressed record");
 await act(async()=>{root.render(<ReferenceDataView data={{weaponBindingIds:['controlled-equipment-failure']}} rootSelection={fixture.selection}/>);});
 for(let turn=0;turn<100&&!document.body.textContent.includes('武器资料载入失败');turn++){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 }
 assert.match(document.body.textContent,/武器资料载入失败/u);
 assert.match(document.body.textContent,/controlled equipment chunk unavailable/u);
 assert.match(document.body.textContent,/载具耐久未知/u,"legacy chunk failure cannot unmount current root facts");
 assert.equal(requests.length,3);
}finally{await act(async()=>{root.unmount();});dom.window.close();globalThis.fetch=originalFetch;}
