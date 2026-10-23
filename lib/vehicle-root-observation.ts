export interface VehicleRootSelection {
  cardId: string;
  rawName: string;
  runtimeVehicleRef: string;
}

export type RootFact<T> = { state: "observed"; value: T } | { state: "unknown"; value: null };
export interface VehicleRootSeat {
  sourceProperty: "DriverSeatConfig" | "AdditionalSeatsConfig";
  sourceIndex: number | null;
  seatPawnClassPath: RootFact<string | null>;
  seatHealth: RootFact<number>;
  repairToolLimit: RootFact<number>;
  exposedSeat: RootFact<boolean>;
}
export interface VehicleRootObservation {
  sourceVehicleRef: string;
  generatedClass: string;
  sourceBuildId: string;
  state: "partial" | "selected-root-properties-observed";
  maxHealth: RootFact<number>;
  repairToolLimit: RootFact<number>;
  damagedByRadialExplosions: RootFact<boolean>;
  damageModifiers: RootFact<{ sourceIndex: number; damageTypeClassPath: RootFact<string | null>; modifier: RootFact<number> }[]>;
  driver: VehicleRootSeat;
  additional: RootFact<VehicleRootSeat[]>;
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const invalid = (): never => { throw new Error("当前根配置资料的格式或资格无效"); };
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const boolean = (value: unknown): value is boolean => typeof value === "boolean";
const reference = (value: unknown): value is string | null => value === null || typeof value === "string" && value.startsWith("/");
function fact<T>(raw: unknown, accepts: (value: unknown) => value is T): RootFact<T> {
  if (!object(raw)) return invalid();
  if (raw.state === "unknown" && raw.value === null) return { state: "unknown", value: null };
  if (raw.state !== "observed" || !accepts(raw.value)) return invalid();
  return { state: "observed", value: raw.value };
}
function seat(raw: unknown, sourceProperty: VehicleRootSeat["sourceProperty"], sourceIndex: number | null): VehicleRootSeat {
  if (!object(raw) || raw.sourceProperty !== sourceProperty || raw.sourceIndex !== sourceIndex) return invalid();
  if (raw.state === "unknown") return { sourceProperty, sourceIndex,
    seatPawnClassPath: { state: "unknown", value: null }, seatHealth: { state: "unknown", value: null },
    repairToolLimit: { state: "unknown", value: null }, exposedSeat: { state: "unknown", value: null } };
  if (raw.state !== "observed-selected-fields") return invalid();
  return { sourceProperty, sourceIndex, seatPawnClassPath: fact(raw.seatPawnClassPath, reference),
    seatHealth: fact(raw.seatHealth, number), repairToolLimit: fact(raw.repairToolLimit, number),
    exposedSeat: fact(raw.exposedSeat, boolean) };
}

// This display-only projection cannot supply ReferenceData, a StationGraph, or
// calculation defaults. Root source indexes never become F-seat identities.
export function selectVehicleRootObservation(value: unknown, sourceVehicleRef: string, generatedClass: string, expectedSourceBuildId: string): VehicleRootObservation {
  if (!object(value) || value.schemaVersion !== "sigua-vehicle-seat-observation-record/v1") return invalid();
  const row = value.observation;
  if (!object(row) || row.sourceVehicleRef !== sourceVehicleRef || row.generatedClass !== generatedClass
    || row.sourceBuildId !== expectedSourceBuildId || typeof row.sourceBuildId !== "string" || !row.sourceBuildId.startsWith("squad-sdk-")
    || row.evidenceMode !== "accepted-clean-native-properties" || row.authority !== "sdk-loaded-selected-native-fproperty"
    || row.numericPrecision !== "native-serializer-observation-not-roundtrip-qualified"
    || !["partial", "selected-root-properties-observed"].includes(String(row.state))
    || !object(row.qualification) || row.qualification.rootSeatConfiguration !== "selected-properties-only"
    || ["stationGraph", "camera", "motion", "model", "weaponEquipment", "armorGeometry"].some(key => (row.qualification as Record<string, unknown>)[key] !== "not-renewed")
    || row.qualification.runtime !== "not-verified" || !object(row.root) || !object(row.seats)) return invalid();
  const additional = fact(row.seats.additional, (v): v is unknown[] => Array.isArray(v));
  const damage = fact(row.root.damageModifiers, (v): v is unknown[] => Array.isArray(v));
  return { sourceVehicleRef, generatedClass, sourceBuildId: row.sourceBuildId,
    state: row.state as VehicleRootObservation["state"],
    maxHealth: fact(row.root.maxHealth, number), repairToolLimit: fact(row.root.repairToolLimit, number),
    damagedByRadialExplosions: fact(row.root.damagedByRadialExplosions, boolean),
    driver: seat(row.seats.driver, "DriverSeatConfig", null),
    additional: additional.state === "unknown" ? additional : { state: "observed", value: additional.value.map((v, i) => seat(v, "AdditionalSeatsConfig", i)) },
    damageModifiers: damage.state === "unknown" ? damage : { state: "observed", value: damage.value.map((v, i) => {
      if (!object(v) || v.sourceIndex !== i) return invalid();
      return { sourceIndex: i, damageTypeClassPath: fact(v.damageTypeClassPath, reference), modifier: fact(v.modifier, number) };
    }) } };
}
