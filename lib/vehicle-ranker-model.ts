export const VEHICLE_RANKER_UNRANKED_ID = "unranked";

export const VEHICLE_RANKER_TONES = [
  "red",
  "gold",
  "green",
  "blue",
  "slate",
  "violet",
  "orange",
  "teal",
] as const;

export type VehicleRankerTone = typeof VEHICLE_RANKER_TONES[number];

export interface VehicleRankerTier {
  id: string;
  label: string;
  tone: VehicleRankerTone;
  cardIds: string[];
}

export interface VehicleRankerBoard {
  version: 1;
  tiers: VehicleRankerTier[];
  unrankedCardIds: string[];
}

const DEFAULT_TIER_LABELS = ["夯", "顶级", "人上人", "NPC", "拉完了"];

export function createDefaultVehicleRankerBoard(): VehicleRankerBoard {
  return {
    version: 1,
    tiers: DEFAULT_TIER_LABELS.map((label, index) => ({
      id: `tier-${index + 1}`,
      label,
      tone: VEHICLE_RANKER_TONES[index],
      cardIds: [],
    })),
    unrankedCardIds: [],
  };
}

function uniqueCardIds(cardIds: readonly string[], allowed?: ReadonlySet<string>) {
  return [...new Set(cardIds.filter(
    (cardId) => typeof cardId === "string" && (!allowed || allowed.has(cardId)),
  ))];
}

export function normalizeVehicleRankerBoard(
  value: unknown,
  allowedCardIds?: ReadonlySet<string>,
): VehicleRankerBoard {
  const fallback = createDefaultVehicleRankerBoard();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<VehicleRankerBoard>;
  if (candidate.version !== 1 || !Array.isArray(candidate.tiers)) return fallback;

  const seenTierIds = new Set<string>();
  const seenCardIds = new Set<string>();
  const tiers = candidate.tiers.slice(0, 8).flatMap((tier, index) => {
    if (!tier || typeof tier !== "object") return [];
    const tierValue = tier as Partial<VehicleRankerTier>;
    const id = typeof tierValue.id === "string" && tierValue.id
      ? tierValue.id.slice(0, 80)
      : `tier-${index + 1}`;
    if (seenTierIds.has(id)) return [];
    seenTierIds.add(id);
    const label = typeof tierValue.label === "string" && tierValue.label.trim()
      ? tierValue.label.trim().slice(0, 12)
      : `等级 ${index + 1}`;
    const tone = VEHICLE_RANKER_TONES.includes(tierValue.tone as VehicleRankerTone)
      ? tierValue.tone as VehicleRankerTone
      : VEHICLE_RANKER_TONES[index % VEHICLE_RANKER_TONES.length];
    const cardIds = uniqueCardIds(
      Array.isArray(tierValue.cardIds) ? tierValue.cardIds : [],
      allowedCardIds,
    ).filter((cardId) => {
      if (seenCardIds.has(cardId)) return false;
      seenCardIds.add(cardId);
      return true;
    });
    return [{ id, label, tone, cardIds }];
  });
  if (tiers.length === 0) return fallback;
  const unrankedCardIds = uniqueCardIds(
    Array.isArray(candidate.unrankedCardIds) ? candidate.unrankedCardIds : [],
    allowedCardIds,
  ).filter((cardId) => {
    if (seenCardIds.has(cardId)) return false;
    seenCardIds.add(cardId);
    return true;
  });
  return { version: 1, tiers, unrankedCardIds };
}

function withoutCard(board: VehicleRankerBoard, cardId: string) {
  return {
    ...board,
    tiers: board.tiers.map((tier) => ({
      ...tier,
      cardIds: tier.cardIds.filter((id) => id !== cardId),
    })),
    unrankedCardIds: board.unrankedCardIds.filter((id) => id !== cardId),
  };
}

export function moveVehicleRankerCard(
  board: VehicleRankerBoard,
  cardId: string,
  destinationId: string,
  beforeCardId?: string | null,
): VehicleRankerBoard {
  const next = withoutCard(board, cardId);
  const insert = (cardIds: readonly string[]) => {
    const result = [...cardIds];
    const index = beforeCardId ? result.indexOf(beforeCardId) : -1;
    result.splice(index >= 0 ? index : result.length, 0, cardId);
    return result;
  };
  if (destinationId === VEHICLE_RANKER_UNRANKED_ID) {
    return { ...next, unrankedCardIds: insert(next.unrankedCardIds) };
  }
  if (!next.tiers.some((tier) => tier.id === destinationId)) return board;
  return {
    ...next,
    tiers: next.tiers.map((tier) =>
      tier.id === destinationId
        ? { ...tier, cardIds: insert(tier.cardIds) }
        : tier
    ),
  };
}

export function removeVehicleRankerCard(
  board: VehicleRankerBoard,
  cardId: string,
) {
  return withoutCard(board, cardId);
}

export function importVehicleRankerCards(
  board: VehicleRankerBoard,
  cardIds: readonly string[],
): VehicleRankerBoard {
  const existing = new Set([
    ...board.tiers.flatMap((tier) => tier.cardIds),
    ...board.unrankedCardIds,
  ]);
  return uniqueCardIds(cardIds)
    .filter((cardId) => !existing.has(cardId))
    .reduce(
      (next, cardId) => moveVehicleRankerCard(
        next,
        cardId,
        VEHICLE_RANKER_UNRANKED_ID,
      ),
      board,
    );
}

export function removeVehicleRankerTier(
  board: VehicleRankerBoard,
  tierId: string,
): VehicleRankerBoard {
  if (board.tiers.length <= 1) return board;
  const removed = board.tiers.find((tier) => tier.id === tierId);
  if (!removed) return board;
  return {
    ...board,
    tiers: board.tiers.filter((tier) => tier.id !== tierId),
    unrankedCardIds: uniqueCardIds([
      ...board.unrankedCardIds,
      ...removed.cardIds,
    ]),
  };
}

export function reorderVehicleRankerTier(
  board: VehicleRankerBoard,
  tierId: string,
  offset: -1 | 1,
): VehicleRankerBoard {
  const index = board.tiers.findIndex((tier) => tier.id === tierId);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= board.tiers.length) return board;
  const tiers = [...board.tiers];
  [tiers[index], tiers[destination]] = [tiers[destination], tiers[index]];
  return { ...board, tiers };
}
