import {createHash} from "node:crypto";
const observed = value => ({state:"observed",value});
const unknown = () => ({state:"unknown",value:null});
export function rootFixture() {
  const selection={cardId:"test--vehicle--ifv",rawName:"BP_Controlled",runtimeVehicleRef:"vehicle-runtime-controlled"};
  const sourceVehicleRef="vehicle-abcdef",generatedClass="/Game/Controlled/BP_Controlled.BP_Controlled_C";
  const seat=(sourceProperty,sourceIndex)=>({sourceProperty,sourceIndex,state:"observed-selected-fields",
    seatPawnClassPath:observed(null),seatHealth:observed(0),repairToolLimit:observed(0),exposedSeat:observed(false)});
  const row={sourceVehicleRef,generatedClass,sourceBuildId:"squad-sdk-controlled-contract-fixture",evidenceMode:"accepted-clean-native-properties",
    authority:"sdk-loaded-selected-native-fproperty",numericPrecision:"native-serializer-observation-not-roundtrip-qualified",state:"partial",
    qualification:{rootSeatConfiguration:"selected-properties-only",stationGraph:"not-renewed",camera:"not-renewed",motion:"not-renewed",model:"not-renewed",weaponEquipment:"not-renewed",armorGeometry:"not-renewed",runtime:"not-verified"},
    root:{maxHealth:unknown(),repairToolLimit:observed(0.25),damagedByRadialExplosions:observed(false),damageModifiers:observed([])},
    seats:{driver:seat("DriverSeatConfig",null),additional:observed([seat("AdditionalSeatsConfig",0)])}};
  const f={selection,row,runtime:{schemaVersion:"sigua-vehicle-runtime-source/v1",source:{cardId:selection.cardId},variants:[{...selection,generatedClass,stationGraph:{sourceVehicleRef}}]},
    document:{schemaVersion:"sigua-vehicle-seat-observation-record/v1",observation:row},
    index:{schemaVersion:"sigua-vehicle-seat-observation-index/v1",entries:[{sourceVehicleRef,generatedClass,sourceBuildId:row.sourceBuildId,observation:{}}]}};
  pinRootRecord(f);return f;
}
export function pinRootRecord(f){
 const bytes=Buffer.from(JSON.stringify(f.document)),sha256=createHash("sha256").update(bytes).digest("hex");
 for(const entry of f.index.entries)entry.observation={url:`/data/vehicles/seat-observations/v1/records/${sha256}.json`,sha256,bytes:bytes.length};
}
