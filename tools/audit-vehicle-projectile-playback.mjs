import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import {
  buildVehicleProjectileSimulationInput,
  compileVehicleProjectilePlaybackBinding,
  selectVehicleProjectileLaunchShot,
} from "../lib/vehicle-projectile-playback.ts";
import { compileVehicleStationGraph } from
  "../lib/vehicle-station-graph.ts";

const V1053_BASELINE = Object.freeze({
  ballisticsSourceBuildId: "squad-sdk-v10.5.3-d341d671c7d80407",
  stationGraphSourceBuildId: "squad-sdk-v10.5.3-17c100ea5182370e",
  vehicleSources: 285,
  assignments: 706,
  ready: 706,
  unsupported: 0,
  launchOriginCoverage: {
    weaponAssignments: 1610,
    bindings: 1610,
    profiles: 621,
    configuredMultipodBindings: 8,
    runtimeMultipodBindings: 6,
    nativeDisabledMultipodBindings: 2,
    componentOriginFallbackBindings: 165,
  },
  readyLaunchSequences: {
    "runtime-indexed-launch-pod:2": 5,
    "runtime-indexed-launch-pod:4": 1,
    "single-barrel-socket:1": 700,
  },
  guidedAssignments: 69,
  guidedRouteCount: 7,
  guidedSimulationStatuses: {
    lifespan: 55,
    "time-limit": 14,
  },
  readyPrecision: {
    "component-origin-fallback": 20,
    "socket-resolved": 686,
  },
  unsupportedReasons: {},
});

const { values } = parseArgs({
  options: {
    "wiki-root": { type: "string" },
    output: { type: "string" },
    "require-v1053-baseline": { type: "boolean", default: false },
  },
});

if (!values["wiki-root"]) {
  throw new Error(
    "Usage: npm run audit:vehicle-projectile-playback -- --wiki-root <SiguaWiki checkout> [--require-v1053-baseline] [--output <report.json>]",
  );
}

const wikiRoot = path.resolve(values["wiki-root"]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(wikiRoot, ...relativePath.split("/")), "utf8"),
  );
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")),
  );
}

function assertExact(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} drifted: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function selectRuntimeVariant(document, loadout) {
  const candidates = document.variants.filter(
    (variant) =>
      variant.rawName === loadout.rawName &&
      (!loadout.runtimeVehicleRef ||
        variant.runtimeVehicleRef === loadout.runtimeVehicleRef),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `${document.source.cardId} / ${loadout.rawName} has ${candidates.length} runtime variants`,
    );
  }
  return candidates[0];
}

function selectVisualArtifact(variant) {
  const entries = Object.entries(variant.visualArtifacts ?? {})
    .filter(([, value]) => value?.id)
    .sort(([left], [right]) => left.localeCompare(right, "en"));
  if (entries.length === 0) {
    throw new Error(`${variant.rawName} has no published visual artifact`);
  }
  const preferred = entries.find(([edition]) => edition === "international") ??
    entries[0];
  return { edition: preferred[0], artifact: preferred[1] };
}

function compactRow(row) {
  return {
    cardId: row.cardId,
    rawName: row.rawName,
    weaponAssignmentId: row.weaponAssignmentId,
    stationEquipmentId: row.stationEquipmentId,
    stationIds: row.stationIds,
    reason: row.reason,
  };
}

const index = await readJson("data/weapons/runtime/vehicles/index.json");
const catalog = await readJson("data/weapons/ballistics.json");
if (index.schemaVersion !== "sigua-weapon-runtime-index/v2") {
  throw new Error("Runtime vehicle weapon index schema drifted");
}
if (
  catalog.schemaVersion !== "sigua-weapon-ballistics/v1" ||
  catalog.status !== "completed"
) {
  throw new Error("Weapon ballistics catalog is not completed v1 data");
}
const projectileAlgorithm = await import(pathToFileURL(path.join(
  wikiRoot,
  catalog.algorithms.projectile.replace(/^\//u, ""),
)).href);

const rows = [];
const stationGraphBuildIds = new Set();
const stationGraphRevisions = new Set();
let declaredAssignments = 0;

for (const indexEntry of index.vehicleSources) {
  declaredAssignments += indexEntry.weaponAssignmentCount;
  const [weaponDocument, vehicleDocument] = await Promise.all([
    readJson(`data/weapons/runtime/vehicles/${indexEntry.cardId}.json`),
    readJson(`data/vehicles/runtime/${indexEntry.cardId}.json`),
  ]);
  if (
    weaponDocument.schemaVersion !== "sigua-weapon-runtime-source/v2" ||
    weaponDocument.source.cardId !== indexEntry.cardId ||
    vehicleDocument.schemaVersion !== "sigua-vehicle-runtime-source/v1" ||
    vehicleDocument.source.cardId !== indexEntry.cardId
  ) {
    throw new Error(`${indexEntry.cardId} runtime document identity drifted`);
  }

  const profileById = new Map(
    weaponDocument.weaponProfiles.map((profile) => [
      profile.weaponProfileId,
      profile,
    ]),
  );

  for (const loadout of weaponDocument.loadouts) {
    const variant = selectRuntimeVariant(vehicleDocument, loadout);
    if (!variant.stationGraph?.recordUrl) {
      throw new Error(`${indexEntry.cardId} / ${loadout.rawName} has no Station graph`);
    }
    const { edition, artifact } = selectVisualArtifact(variant);
    const [stationRecord, visualDescriptor] = await Promise.all([
      readJson(variant.stationGraph.recordUrl.replace(/^\//u, "")),
      readJson(`assets/runtime-probe/visuals/${artifact.id}.json`),
    ]);
    if (
      visualDescriptor.id !== artifact.id ||
      visualDescriptor.edition !== edition ||
      visualDescriptor.runtimeVehicleRef !== variant.runtimeVehicleRef ||
      visualDescriptor.generatedClass !== artifact.generatedClass ||
      visualDescriptor.placements.length !== artifact.placementCount
    ) {
      throw new Error(`${indexEntry.cardId} / ${loadout.rawName} visual identity drifted`);
    }
    stationGraphBuildIds.add(stationRecord.sourceBuildId);
    stationGraphRevisions.add(stationRecord.sourceDataRevision);
    const stationGraph = compileVehicleStationGraph(
      stationRecord,
      variant.stationGraph,
      {
        rawName: loadout.rawName,
        runtimeVehicleRef: variant.runtimeVehicleRef,
        generatedClass: variant.generatedClass,
        cardId: indexEntry.cardId,
        edition,
        visualArtifactRef: artifact.id,
      },
      visualDescriptor.placements,
    );
    if (!stationGraph) {
      throw new Error(`${indexEntry.cardId} / ${loadout.rawName} Station graph did not compile`);
    }

    for (const weapon of loadout.weapons) {
      const profile = profileById.get(weapon.weaponProfileId);
      if (!profile) {
        throw new Error(
          `${indexEntry.cardId} / ${weapon.weaponAssignmentId} has no weapon profile`,
        );
      }
      const stationIds = stationGraph.stations
        .filter((station) =>
          station.equipmentRefs.includes(weapon.stationEquipmentId))
        .map((station) => station.id)
        .sort((left, right) => left.localeCompare(right, "en"));
      const resolution = compileVehicleProjectilePlaybackBinding({
        catalog,
        stationGraph,
        stationId: stationIds.length === 1 ? stationIds[0] : null,
        visualPlacements: visualDescriptor.placements,
        weapon: {
          weaponAssignmentId: weapon.weaponAssignmentId,
          stationEquipmentId: weapon.stationEquipmentId,
          sourceCardId: indexEntry.cardId,
          sourceRawName: loadout.rawName,
          displayNameZh: profile.displayName,
          displayNameEnglish: profile.displayName,
        },
      });
      let guidedSimulationStatus = null;
      let guidanceRouteId = null;
      if (
        resolution.state === "ready" &&
        resolution.binding.guidanceInputPolicy !== "none"
      ) {
        const selectedLaunch = selectVehicleProjectileLaunchShot(
          resolution.binding,
          { shotsFiredInMagazine: 0 },
        );
        const simulationInput = buildVehicleProjectileSimulationInput(
          resolution.binding,
          {
            positionCm: selectedLaunch.shot.translationCm,
            direction: selectedLaunch.shot.direction,
          },
          selectedLaunch.shot.direction,
          {
            aimLocationCm: {
              x: selectedLaunch.shot.translationCm.x -
                selectedLaunch.shot.direction.x * 100,
              y: selectedLaunch.shot.translationCm.y -
                selectedLaunch.shot.direction.y * 100,
              z: selectedLaunch.shot.translationCm.z -
                selectedLaunch.shot.direction.z * 100,
            },
            aimDirection: selectedLaunch.shot.direction,
          },
        );
        const simulation = projectileAlgorithm.simulateGuidedProjectile(
          simulationInput,
        );
        if (
          simulation.status === "guidance-unavailable" ||
          simulation.samples.length < 2
        ) {
          throw new Error(
            `${indexEntry.cardId} / ${weapon.weaponAssignmentId} guided simulation failed: ${simulation.reason ?? simulation.status}`,
          );
        }
        guidedSimulationStatus = simulation.status;
        guidanceRouteId = createHash("sha256").update(JSON.stringify({
          projectileProfileRef: resolution.binding.projectileProfileRef,
          movementModes: resolution.binding.movementModes.map(
            ({ assetPath }) => assetPath,
          ),
          guidanceController: resolution.binding.guidanceController,
        })).digest("hex").slice(0, 24);
      }
      rows.push({
        cardId: indexEntry.cardId,
        rawName: loadout.rawName,
        runtimeVehicleRef: variant.runtimeVehicleRef,
        weaponAssignmentId: weapon.weaponAssignmentId,
        stationEquipmentId: weapon.stationEquipmentId,
        stationIds,
        state: resolution.state,
        reason: resolution.state === "unsupported" ? resolution.reason : null,
        detail: resolution.state === "unsupported" ? resolution.detail : null,
        launchPrecision:
          resolution.state === "ready"
            ? resolution.binding.launchPrecision
            : null,
        launchSelection:
          resolution.state === "ready"
            ? resolution.binding.launchSelection.kind
            : null,
        launchPodCount:
          resolution.state === "ready"
            ? resolution.binding.launchShots.length
            : null,
        guidanceInputPolicy:
          resolution.state === "ready"
            ? resolution.binding.guidanceInputPolicy
            : null,
        guidanceRouteId,
        guidedSimulationStatus,
        stationId:
          resolution.state === "ready" ? resolution.binding.stationId : null,
        anchorKind:
          resolution.state === "ready"
            ? resolution.binding.launchAnchor.kind
            : null,
        anchorOccurrenceId:
          resolution.state === "ready" &&
              ["visual-occurrence", "vehicle-attitude-occurrence"].includes(
                resolution.binding.launchAnchor.kind,
              )
            ? resolution.binding.launchAnchor.occurrenceId
            : null,
        anchorComponentName:
          resolution.state === "ready" &&
              resolution.binding.launchAnchor.kind ===
                "station-weapon-attachment"
            ? resolution.binding.launchAnchor.componentName
            : resolution.state === "ready" &&
                resolution.binding.launchAnchor.kind ===
                  "vehicle-attitude-occurrence"
              ? resolution.binding.launchAnchor.componentName
            : null,
        projectileProfileRef:
          resolution.state === "ready"
            ? resolution.binding.projectileProfileRef
            : null,
        launchOriginProfileRef:
          resolution.state === "ready"
            ? resolution.binding.launchOriginProfileRef
            : null,
      });
    }
  }
}

const readyRows = rows.filter(({ state }) => state === "ready");
const unsupportedRows = rows.filter(({ state }) => state === "unsupported");
const readyPrecision = {};
const readyLaunchSequences = {};
const guidedSimulationStatuses = {};
const unsupportedReasons = {};
for (const row of readyRows) increment(readyPrecision, row.launchPrecision);
for (const row of readyRows) {
  increment(
    readyLaunchSequences,
    `${row.launchSelection}:${row.launchPodCount}`,
  );
}
for (const row of readyRows) {
  if (row.guidedSimulationStatus) {
    increment(guidedSimulationStatuses, row.guidedSimulationStatus);
  }
}
for (const row of unsupportedRows) increment(unsupportedReasons, row.reason);

const examples = {};
for (const reason of Object.keys(unsupportedReasons).sort()) {
  examples[reason] = unsupportedRows
    .filter((row) => row.reason === reason)
    .slice(0, 5)
    .map(compactRow);
}

const summary = {
  schemaVersion: "sigua-vehicle-projectile-playback-audit/v1",
  evidenceClass: "local-source-derived-playback",
  ballisticsSourceBuildId: catalog.sourceBuildId,
  stationGraphSourceBuildIds: [...stationGraphBuildIds].sort(),
  stationGraphSourceDataRevisionCount: stationGraphRevisions.size,
  vehicleSources: index.vehicleSources.length,
  declaredAssignments,
  compiledAssignments: rows.length,
  ready: readyRows.length,
  unsupported: unsupportedRows.length,
  launchOriginCoverage: catalog.launchOriginEvidence.coverage,
  readyLaunchSequences: sortedObject(readyLaunchSequences),
  guidedAssignments: readyRows.filter(({ guidanceRouteId }) => guidanceRouteId)
    .length,
  guidedRouteCount: new Set(
    readyRows.map(({ guidanceRouteId }) => guidanceRouteId).filter(Boolean),
  ).size,
  guidedSimulationStatuses: sortedObject(guidedSimulationStatuses),
  readyPrecision: sortedObject(readyPrecision),
  unsupportedReasons: sortedObject(unsupportedReasons),
  examples,
};
summary.auditSha256 = createHash("sha256")
  .update(JSON.stringify({ summary, rows }))
  .digest("hex");

if (declaredAssignments !== rows.length) {
  throw new Error(
    `Runtime index declares ${declaredAssignments} assignments but ${rows.length} compiled`,
  );
}

if (values["require-v1053-baseline"]) {
  assertExact(
    "ballistics source build",
    catalog.sourceBuildId,
    V1053_BASELINE.ballisticsSourceBuildId,
  );
  assertExact(
    "Station graph source builds",
    summary.stationGraphSourceBuildIds,
    [V1053_BASELINE.stationGraphSourceBuildId],
  );
  assertExact("vehicle source count", summary.vehicleSources, V1053_BASELINE.vehicleSources);
  assertExact("assignment count", summary.compiledAssignments, V1053_BASELINE.assignments);
  assertExact("ready count", summary.ready, V1053_BASELINE.ready);
  assertExact("unsupported count", summary.unsupported, V1053_BASELINE.unsupported);
  assertExact(
    "launch-origin coverage",
    summary.launchOriginCoverage,
    V1053_BASELINE.launchOriginCoverage,
  );
  assertExact(
    "ready launch sequences",
    summary.readyLaunchSequences,
    V1053_BASELINE.readyLaunchSequences,
  );
  assertExact(
    "guided assignment count",
    summary.guidedAssignments,
    V1053_BASELINE.guidedAssignments,
  );
  assertExact(
    "guided route count",
    summary.guidedRouteCount,
    V1053_BASELINE.guidedRouteCount,
  );
  assertExact(
    "guided simulation statuses",
    summary.guidedSimulationStatuses,
    V1053_BASELINE.guidedSimulationStatuses,
  );
  assertExact("ready precision", summary.readyPrecision, V1053_BASELINE.readyPrecision);
  assertExact(
    "unsupported reasons",
    summary.unsupportedReasons,
    V1053_BASELINE.unsupportedReasons,
  );
}

if (values.output) {
  const outputPath = path.resolve(values.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ summary, rows }, null, 2)}\n`,
    "utf8",
  );
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
