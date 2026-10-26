import { loadWikiRuntimeVisual, loadWikiVehicleFactionMechanics } from "../lib/wiki-source";
import { wikiVehicleFactionId } from "../lib/wiki-vehicle-identity";
import type { RuntimeVehiclePreview, RuntimeVisualPlacement } from "./runtime-probe-preview-data";
import type { SiteEdition } from "./site-edition";

interface PortableBinding {
  type: string;
  cardId: string;
  rawName: string;
  generatedClass: string;
  runtimeVehicleRef?: string;
  hitRuntimeStatus: string;
  visualArtifactRefs: Partial<Record<SiteEdition, string>>;
}

interface VisualArtifact {
  id: string;
  edition: SiteEdition;
  cardId: string;
  rawName: string;
  generatedClass: string;
  runtimeVehicleRef: string;
  placementCount: number;
}

const previews = new Map<string, Promise<RuntimeVehiclePreview>>();

// This reads the existing portable visual contract. The descriptor's vehicle-
// shaped ID identifies a historical visual capture; it does not create a vehicle
// runtime target, command-aircraft, Station Graph or native hit authority.
export function portableDronePreviewForCatalogBinding(input: {
  cardId: string;
  rawName: string;
  visualArtifactRef: string;
  edition: SiteEdition;
}): Promise<RuntimeVehiclePreview> {
  const key = JSON.stringify([input.cardId, input.rawName, input.visualArtifactRef, input.edition]);
  const cached = previews.get(key);
  if (cached) return cached;
  const request = loadPortablePreview(input);
  previews.set(key, request);
  void request.catch(() => { if (previews.get(key) === request) previews.delete(key); });
  return request;
}

async function loadPortablePreview(input: {
  cardId: string;
  rawName: string;
  visualArtifactRef: string;
  edition: SiteEdition;
}): Promise<RuntimeVehiclePreview> {
  const { cardId, rawName, visualArtifactRef, edition } = input;
  const [sourceValue, descriptorValue] = await Promise.all([
    loadWikiVehicleFactionMechanics(wikiVehicleFactionId(cardId)),
    loadWikiRuntimeVisual(visualArtifactRef),
  ]);
  const source = sourceValue as {
    extensions?: { supportAir?: { bindings?: PortableBinding[] } };
    runtime?: { visualArtifacts?: VisualArtifact[] };
  };
  const bindings = (source.extensions?.supportAir?.bindings ?? []).filter(
    (binding) => binding.cardId === cardId && binding.rawName === rawName,
  );
  const artifacts = (source.runtime?.visualArtifacts ?? []).filter(
    (artifact) => artifact.id === visualArtifactRef,
  );
  const binding = bindings[0];
  const artifact = artifacts[0];
  if (bindings.length !== 1 || artifacts.length !== 1 ||
      binding.type !== "DRONE" || binding.runtimeVehicleRef != null ||
      binding.hitRuntimeStatus !== "native-unknown" ||
      binding.visualArtifactRefs?.[edition] !== visualArtifactRef ||
      artifact.edition !== edition || artifact.cardId !== cardId || artifact.rawName !== rawName ||
      artifact.generatedClass !== binding.generatedClass) {
    throw new Error(`Portable visual binding differs for ${cardId} / ${rawName}`);
  }
  const descriptor = descriptorValue as {
    schemaVersion: string; id: string; edition: SiteEdition; runtimeVehicleRef: string;
    generatedClass: string; status: string; visualAcceptanceStatus: string;
    webUsable: boolean; reason: string; totalBytes: number; placements: RuntimeVisualPlacement[];
  };
  if (descriptor.schemaVersion !== "sigua-runtime-visual/v1" || descriptor.id !== visualArtifactRef ||
      descriptor.edition !== edition || descriptor.generatedClass !== binding.generatedClass ||
      !/^vehicle-[a-f0-9]{64}$/u.test(descriptor.runtimeVehicleRef) ||
      descriptor.runtimeVehicleRef !== artifact.runtimeVehicleRef ||
      descriptor.status !== "complete" || descriptor.visualAcceptanceStatus !== "web-usable" ||
      descriptor.webUsable !== true || !Array.isArray(descriptor.placements) ||
      descriptor.placements.length === 0 || descriptor.placements.length !== artifact.placementCount ||
      new Set(descriptor.placements.map((placement) => placement.stableOccurrenceId)).size !== descriptor.placements.length ||
      descriptor.placements.some((placement) =>
        (!/^occurrence-[a-f0-9]{64}$/u.test(placement.stableOccurrenceId) &&
          !(placement.stableOccurrenceId === `watermark-${visualArtifactRef.slice("visual-artifact-".length)}` &&
            placement.sourceMeshPath === "/SiguaWiki/Derived/VehicleWatermark" &&
            placement.name === "SiguaD Watermark")) ||
        !/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(placement.assetUrl) ||
        placement.componentClassPath !== "/Script/Engine.StaticMeshComponent" ||
        placement.runtimeBonePoseStatus !== "not-applicable" ||
        !Array.isArray(placement.matrix) || placement.matrix.length !== 16 ||
        placement.matrix.some((value) => !Number.isFinite(value)))) {
    throw new Error(`Portable visual descriptor differs for ${cardId} / ${rawName}`);
  }
  return {
    cardId, variantRawName: rawName, generatedClass: descriptor.generatedClass,
    visualVehicleId: descriptor.runtimeVehicleRef, exteriorOnly: true,
    status: "visual-ready", statusLabel: "SIGUAWIKI / EXTERIOR",
    note: descriptor.reason,
    chassisPose: null, groundedPose: null, suspension: { records: [], coverage: null },
    runtime: { actors: null, components: null, stableTargets: null, residualActors: null },
    visual: {
      artifactRef: visualArtifactRef, requiredOccurrences: descriptor.placements.length,
      sourceAssets: new Set(descriptor.placements.map((placement) => placement.assetUrl)).size,
      totalBytes: descriptor.totalBytes, runtimeBonePoseStatus: "not-applicable",
      runtimeBonePoseOccurrenceCount: 0, runtimeBonePoseJointCount: 0,
      runtimeBonePoseReferenceEquivalentOccurrenceCount: 0,
      placements: descriptor.placements, selection: null,
    },
    hit: null, hitAvailability: { status: "native-unknown", reasonCode: "native-unknown",
      reason: "仅支持外观浏览；命中、武器和驾驶模拟暂不可用。" },
    radialQuery: null, visualAttachment: null, crewSeat: null,
    stationGraph: null, gunnerSight: null, driverView: null,
  };
}
