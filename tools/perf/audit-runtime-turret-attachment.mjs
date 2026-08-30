import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  carryNestedRuntimeTurretAssemblies,
  resolveRuntimeTurretAssembly,
  runtimeTurretFallbackSpec,
} from "../../lib/turret-articulation.ts";

const [wikiRoot, outputPath] = process.argv.slice(2);
if (!wikiRoot) {
  throw new Error(
    "Usage: node tools/perf/audit-runtime-turret-attachment.mjs <wiki-root> [output.json]",
  );
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function selectPrimarySeat(seats) {
  return seats.find(
    (seat) => seat.role === "gunner" && seat.stationKind === "weapon-station",
  ) ?? seats.find((seat) => seat.role === "gunner") ?? seats[0];
}

function assemblyForStation({
  placements,
  generatedClass,
  seat,
  seats,
  primarySeat,
  stationWeaponNames,
}) {
  const turretNames = [...new Set(seats.map(({ turretName }) => turretName))];
  const fallback = runtimeTurretFallbackSpec(generatedClass, seat.turretName);
  const siblingFallbackYawAnchorComponentNames = turretNames
    .filter((turretName) => turretName !== seat.turretName)
    .map((turretName) =>
      runtimeTurretFallbackSpec(generatedClass, turretName)?.yawAnchorComponentName
    )
    .filter(Boolean);
  return resolveRuntimeTurretAssembly({
    placements,
    vehicleGeneratedClass: generatedClass,
    turretName: seat.turretName,
    stationWeaponNames,
    articulation: seat.turret.articulation,
    primary: seat === primarySeat,
    siblingTurretNames: turretNames,
    absorbsSiblingStations: seat === primarySeat && seat.role === "gunner",
    fallbackYawAnchorComponentName: fallback?.yawAnchorComponentName,
    fallbackYawAnchorActorName: fallback?.yawAnchorActorName,
    fallbackPitchUsesYawAnchor: fallback?.pitchUsesYawAnchor,
    siblingFallbackYawAnchorComponentNames,
  });
}

function difference(expected, actual) {
  const actualIds = new Set(actual ?? []);
  return (expected ?? []).filter((id) => !actualIds.has(id));
}

const catalog = await readJson(path.join(wikiRoot, "data", "vehicles", "catalog.json"));
const sourceById = new Map(
  catalog.identities.vehicles.map((source) => [source.id, source]),
);
const seatById = new Map(catalog.profiles.seats.map((profile) => [profile.id, profile.value]));
const runtimeById = new Map(
  catalog.runtime.vehicles.map((runtime) => [runtime.id, runtime]),
);
const weaponSourceCache = new Map();
const descriptorCache = new Map();

async function weaponSource(cardId) {
  if (weaponSourceCache.has(cardId)) return weaponSourceCache.get(cardId);
  const filename = path.join(
    wikiRoot,
    "data",
    "weapons",
    "runtime",
    "vehicles",
    `${cardId}.json`,
  );
  try {
    await access(filename);
    const source = await readJson(filename);
    weaponSourceCache.set(cardId, source);
    return source;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    weaponSourceCache.set(cardId, null);
    return null;
  }
}

async function descriptor(id) {
  if (descriptorCache.has(id)) return descriptorCache.get(id);
  const value = await readJson(path.join(
    wikiRoot,
    "assets",
    "runtime-probe",
    "visuals",
    `${id}.json`,
  ));
  descriptorCache.set(id, value);
  return value;
}

const gaps = [];
let auditedStations = 0;
let stationsWithExactWeaponPlacements = 0;
for (const binding of catalog.identities.catalogBindings) {
  const source = sourceById.get(binding.vehicleRef);
  const runtime = runtimeById.get(binding.runtimeVehicleRef);
  if (!source || !runtime) continue;
  const seats = source.seatProfileRefs
    .map((id) => seatById.get(id))
    .filter((seat) => seat?.turret && seat.turretName);
  if (seats.length === 0) continue;
  const primarySeat = selectPrimarySeat(seats);
  const weapon = await weaponSource(binding.cardId);
  const loadout = weapon?.loadouts?.find(({ rawName }) => rawName === binding.rawName);
  const stationEquipment = loadout?.stationEquipment ?? [];
  for (const [edition, artifactId] of Object.entries(binding.visualArtifactRefs ?? {})) {
    if (!artifactId) continue;
    const visual = await descriptor(artifactId);
    const withoutEquipment = seats.map((seat) =>
      assemblyForStation({
        placements: visual.placements,
        generatedClass: runtime.generatedClass,
        seat,
        seats,
        primarySeat,
        stationWeaponNames: [],
      })
    );
    const withExactEquipment = seats.map((seat) => {
      const names = stationEquipment
        .filter(({ turretName }) => turretName === seat.turretName)
        .map(({ gunName }) => gunName);
      return assemblyForStation({
        placements: visual.placements,
        generatedClass: runtime.generatedClass,
        seat,
        seats,
        primarySeat,
        stationWeaponNames: names,
      });
    });
    const currentAssemblies = carryNestedRuntimeTurretAssemblies(withoutEquipment);
    const exactAssemblies = carryNestedRuntimeTurretAssemblies(withExactEquipment);
    seats.forEach((seat, index) => {
      auditedStations += 1;
      const current = currentAssemblies[index];
      const exact = exactAssemblies[index];
      const missingYawPlacementIds = difference(
        exact?.yawPlacementIds,
        current?.yawPlacementIds,
      );
      const missingPitchPlacementIds = difference(
        exact?.pitchPlacementIds,
        current?.pitchPlacementIds,
      );
      if (missingYawPlacementIds.length > 0 || missingPitchPlacementIds.length > 0) {
        stationsWithExactWeaponPlacements += 1;
        const placementById = new Map(
          visual.placements.map((placement) => [placement.stableOccurrenceId, placement]),
        );
        gaps.push({
          cardId: binding.cardId,
          rawName: binding.rawName,
          edition,
          artifactId,
          seatIndex: seat.index,
          role: seat.role,
          stationKind: seat.stationKind,
          turretName: seat.turretName,
          missingYaw: missingYawPlacementIds.map((id) => placementById.get(id)),
          missingPitch: missingPitchPlacementIds.map((id) => placementById.get(id)),
        });
      }
    });
  }
}

const report = {
  schemaVersion: "sigua-runtime-turret-attachment-audit/v1",
  wikiRoot: path.resolve(wikiRoot),
  bindings: catalog.identities.catalogBindings.length,
  visualDescriptors: descriptorCache.size,
  auditedStations,
  stationsWithExactWeaponPlacements,
  gapCount: gaps.length,
  gaps,
};
if (outputPath) {
  const filename = path.resolve(outputPath);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    outputPath: filename,
    bindings: report.bindings,
    visualDescriptors: report.visualDescriptors,
    auditedStations: report.auditedStations,
    stationsWithExactWeaponPlacements: report.stationsWithExactWeaponPlacements,
    gapCount: report.gapCount,
  }));
} else {
  console.log(JSON.stringify(report, null, 2));
}
if (gaps.length > 0) process.exitCode = 1;
