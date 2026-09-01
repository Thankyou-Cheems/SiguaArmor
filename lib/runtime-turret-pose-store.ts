export interface RuntimeTurretPoseValue {
  yawDegrees: number;
  pitchDegrees: number;
}

export type RuntimeTurretPoseSnapshot = Readonly<
  Record<string, RuntimeTurretPoseValue>
>;

export interface RuntimeTurretPoseStore {
  getSnapshot: () => RuntimeTurretPoseSnapshot;
  publish: (snapshot: RuntimeTurretPoseSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRuntimeTurretPoseStore(
  initialSnapshot: RuntimeTurretPoseSnapshot = {},
): RuntimeTurretPoseStore {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    publish: (nextSnapshot) => {
      if (Object.is(snapshot, nextSnapshot)) return;
      snapshot = nextSnapshot;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
