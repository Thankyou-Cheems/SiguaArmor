import impressionManifestJson from "../generated/runtime-probe-card-impressions.json";
import chinaImpressionManifestJson from "../generated/china-runtime-probe-card-impressions.json";
import { isCpvVehicleRawName } from "./vehicle-preview-policy";

export interface RuntimeCardImpression {
  cardId: string;
  rawName: string;
  variant: string;
  displayName: string;
  type: string;
  factionId: string;
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  alphaCoverage: number;
  sourcePackageSha256: string;
  sourceIdentitySha256: string;
  sourceDescriptorSha256: string | null;
  sourceAssetCount: number;
  sourceOccurrenceCount: number;
  selection: {
    mode: string;
    label: string;
    selectedOccurrences: number;
    filteredOccurrences: number;
  } | null;
}

interface RuntimeCardImpressionManifest {
  schemaVersion: "runtime-probe-card-impressions/v1";
  complete: boolean;
  cards: Array<{
    cardId: string;
    displayName: string;
    type: string;
    factionId: string;
    defaultVariantRawName: string;
    impressionPath: string;
    impressionSha256: string;
  }>;
  variants: RuntimeCardImpression[];
  summary: {
    cards: number;
    variants: number;
    bytes: number;
    maxBytes: number;
  };
}

function identityKey(cardId: string, rawName: string) {
  return `${cardId}\u0000${rawName}`;
}

type RuntimeCardImpressionEdition = "international" | "china";

function validateManifest(
  value: unknown,
  edition: RuntimeCardImpressionEdition,
) {
  const candidate = value as RuntimeCardImpressionManifest;
  if (candidate.schemaVersion !== "runtime-probe-card-impressions/v1") {
    throw new Error(`Unsupported ${edition} runtime card impression manifest schema`);
  }
  if (
    candidate.complete !== true ||
    candidate.summary.cards !== candidate.cards.length ||
    candidate.summary.variants !== candidate.variants.length
  ) {
    throw new Error(`${edition} runtime card impression manifest is incomplete`);
  }
  return candidate;
}

function indexManifest(candidate: RuntimeCardImpressionManifest) {
  const byIdentity = new Map(
    candidate.variants.map((entry) => [identityKey(entry.cardId, entry.rawName), entry] as const),
  );
  const byCardId = new Map<string, RuntimeCardImpression>();
  for (const card of candidate.cards) {
    const defaultEntry = byIdentity.get(identityKey(card.cardId, card.defaultVariantRawName));
    if (!defaultEntry) throw new Error(`Missing default card impression: ${card.cardId}`);
    byCardId.set(card.cardId, defaultEntry);
  }
  return { byIdentity, byCardId };
}

const manifest = validateManifest(impressionManifestJson, "international");
const chinaManifest = validateManifest(chinaImpressionManifestJson, "china");
const indexes = {
  international: indexManifest(manifest),
  china: indexManifest(chinaManifest),
} satisfies Record<RuntimeCardImpressionEdition, ReturnType<typeof indexManifest>>;

export const runtimeCardImpressionManifest = manifest;
export const chinaRuntimeCardImpressionManifest = chinaManifest;
export const runtimeCardImpressionCount = manifest.variants.length;
export const chinaRuntimeCardImpressionCount = chinaManifest.variants.length;

export function runtimeCardImpressionForVariant(
  cardId: string,
  rawName: string,
  edition: RuntimeCardImpressionEdition = "international",
) {
  if (isCpvVehicleRawName(rawName)) return null;
  return indexes[edition].byIdentity.get(identityKey(cardId, rawName)) ?? null;
}

export function runtimeCardImpressionForCard(
  cardId: string,
  edition: RuntimeCardImpressionEdition = "international",
) {
  const impression = indexes[edition].byCardId.get(cardId) ?? null;
  return impression && !isCpvVehicleRawName(impression.rawName) ? impression : null;
}
