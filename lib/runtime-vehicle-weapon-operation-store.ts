import type { VehicleWeaponOperationState } from "./vehicle-weapon-operation-state";

export interface RuntimeVehicleWeaponOperationSnapshot {
  revision: number;
  states: ReadonlyMap<string, VehicleWeaponOperationState>;
}

export interface RuntimeVehicleWeaponOperationStore {
  getSnapshot(): RuntimeVehicleWeaponOperationSnapshot;
  publish(equipmentRef: string, state: VehicleWeaponOperationState): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createRuntimeVehicleWeaponOperationStore(): RuntimeVehicleWeaponOperationStore {
  let snapshot: RuntimeVehicleWeaponOperationSnapshot = {
    revision: 0,
    states: new Map(),
  };
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    publish(equipmentRef, state) {
      const states = new Map(snapshot.states);
      states.set(equipmentRef, state);
      snapshot = { revision: snapshot.revision + 1, states };
      emit();
    },
    clear() {
      if (snapshot.states.size === 0) return;
      snapshot = { revision: snapshot.revision + 1, states: new Map() };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
