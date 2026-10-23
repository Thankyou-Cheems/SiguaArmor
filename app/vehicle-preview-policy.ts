export type ExteriorCapability =
  | { state: "pending" }
  | { state: "available" }
  | { state: "unavailable"; message: string };

// Exact identity is validated by the existing preview/Graph reader. Metadata
// allows a load attempt; only the exterior loader can report success.
export function vehicleExteriorCapability(
  hasExactBinding: boolean,
  load: ExteriorCapability = { state: "pending" },
): ExteriorCapability {
  return hasExactBinding ? load
    : { state: "unavailable", message: "当前选择缺少精确外观绑定。" };
}

export function previewSelectionKey(binding: {
  edition: string | null | undefined;
  cardId: string;
  rawName: string;
  runtimeVehicleRef: string | null;
  visualArtifactRef: string | null;
}) {
  return JSON.stringify([
    binding.edition, binding.cardId, binding.rawName,
    binding.runtimeVehicleRef, binding.visualArtifactRef,
  ]);
}
