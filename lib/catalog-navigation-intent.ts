export interface CatalogNavigationIntent {
  isCurrent: () => boolean;
  cancel: () => void;
}

// One gate owns both data publication and history/UI commits. Shared requests may
// finish and populate caches, but a late result must not undo a newer choice.
export function createCatalogNavigationGate() {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    begin(): CatalogNavigationIntent {
      const currentGeneration = ++generation;
      let cancelled = false;
      return {
        isCurrent: () => !cancelled && generation === currentGeneration,
        cancel: () => { cancelled = true; },
      };
    },
  };
}

export type CatalogNavigationGate = ReturnType<typeof createCatalogNavigationGate>;
