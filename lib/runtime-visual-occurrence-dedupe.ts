export interface RuntimeVisualRenderPlacement {
  stableOccurrenceId: string;
  assetUrl: string;
  matrix: readonly number[];
}

export interface RuntimeVisualOccurrenceDedupeResult<
  T extends RuntimeVisualRenderPlacement,
> {
  placements: T[];
  suppressed: T[];
}

function renderPayloadKey(placement: RuntimeVisualRenderPlacement) {
  if (placement.matrix.length !== 16 || placement.matrix.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid runtime visual matrix for ${placement.stableOccurrenceId}`);
  }
  return `${placement.assetUrl}\u0000${placement.matrix.join(",")}`;
}

/**
 * Removes only byte-identical render payloads placed at the exact same matrix.
 *
 * Runtime visual recipes may expose several weapon actors for ammo modes or
 * smoke launchers even though the browser receives the same baked glTF for
 * each actor. Rendering those identical payloads repeatedly creates ghost
 * turrets and changes transparent opacity. Actor names are deliberately not
 * used here: different assets or different matrices remain distinct.
 */
export function dedupeIdenticalVisualPlacements<
  T extends RuntimeVisualRenderPlacement,
>(placements: readonly T[]): RuntimeVisualOccurrenceDedupeResult<T> {
  const seenPayloads = new Set<string>();
  const seenOccurrences = new Set<string>();
  const retained: T[] = [];
  const suppressed: T[] = [];

  for (const placement of placements) {
    if (seenOccurrences.has(placement.stableOccurrenceId)) {
      throw new Error(`Duplicate runtime visual occurrence ID: ${placement.stableOccurrenceId}`);
    }
    seenOccurrences.add(placement.stableOccurrenceId);

    const key = renderPayloadKey(placement);
    if (seenPayloads.has(key)) {
      suppressed.push(placement);
      continue;
    }
    seenPayloads.add(key);
    retained.push(placement);
  }

  return { placements: retained, suppressed };
}
