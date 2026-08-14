import type { CatalogVariant } from "./catalog-types";

interface GroupableVehicleCardEntry {
  cardId: string;
  alias: string | null;
  variant: Pick<CatalogVariant, "presentation"> | null;
}

export interface VehicleCardEntryGroup<T> {
  groupId: string;
  entries: T[];
}

function presentationConfigurationKey(entry: GroupableVehicleCardEntry) {
  if (!entry.variant) return entry.alias?.trim() ?? "";
  if (!entry.variant.presentation) return entry.alias?.trim() ?? "";
  const vehicleName = entry.variant.presentation.vehicleNameZh?.trim() ?? "";
  const configuration = entry.variant.presentation.configurationZh?.trim() ?? "";
  return `${vehicleName}\u0000${configuration}`;
}

export function groupVehicleCardEntries<T extends GroupableVehicleCardEntry>(
  entries: readonly T[],
): VehicleCardEntryGroup<T>[] {
  const configurationBuckets = new Map<string, T[]>();

  for (const entry of entries) {
    const key = presentationConfigurationKey(entry);
    const bucket = configurationBuckets.get(key) ?? [];
    bucket.push(entry);
    configurationBuckets.set(key, bucket);
  }

  const groups: VehicleCardEntryGroup<T>[] = [];
  for (const bucket of configurationBuckets.values()) {
    const liveries = bucket.map(
      (entry) => entry.variant?.presentation?.liveryZh ?? null,
    );
    const canCollapseAsLiveries =
      bucket.length > 1 &&
      liveries.every((livery): livery is string => Boolean(livery)) &&
      new Set(liveries).size === bucket.length;

    if (canCollapseAsLiveries) {
      groups.push({
        groupId: `${bucket[0].cardId}--liveries`,
        entries: bucket,
      });
      continue;
    }

    for (const entry of bucket) {
      groups.push({ groupId: entry.cardId, entries: [entry] });
    }
  }

  return groups;
}
