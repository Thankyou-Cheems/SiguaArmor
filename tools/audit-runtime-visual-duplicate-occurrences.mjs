import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_VISUAL_INDEX = path.join(ROOT, "app", "runtime-probe-visual-index.json");
const OCCURRENCE_IDENTITY_FIELDS = new Set(["actor", "name", "stableOccurrenceId"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right), "en"),
  );
}

function matrixKey(matrix) {
  invariant(Array.isArray(matrix) && matrix.length === 16, "visual placement matrix must have 16 entries");
  invariant(matrix.every((value) => Number.isFinite(Number(value))), "visual placement matrix must be finite");
  return JSON.stringify(matrix.map(Number));
}

function renderPayload(placement) {
  return Object.fromEntries(
    Object.entries(placement).filter(([key]) => !OCCURRENCE_IDENTITY_FIELDS.has(key)),
  );
}

function renderPayloadSha256(placement) {
  return sha256(stableJson(renderPayload(placement)));
}

function groupPlacements(placements, keyForPlacement) {
  const groups = new Map();
  for (const placement of placements) {
    const key = keyForPlacement(placement);
    const group = groups.get(key) ?? [];
    group.push(placement);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function groupRecord(descriptor, cardIds, placements) {
  const payloadHashes = sortedUnique(placements.map(renderPayloadSha256));
  return {
    rawName: descriptor.rawName,
    cardIds,
    occurrenceCount: placements.length,
    redundantOccurrenceCount: placements.length - 1,
    actors: sortedUnique(placements.map((placement) => placement.actor)),
    componentNames: sortedUnique(placements.map((placement) => placement.name)),
    assetUrls: sortedUnique(placements.map((placement) => placement.assetUrl)),
    sourceMeshPaths: sortedUnique(placements.map((placement) => placement.sourceMeshPath)),
    matrix: placements[0].matrix.map(Number),
    renderPayloadSha256: payloadHashes,
    runtimeBonePoseSha256: sortedUnique(
      placements
        .map((placement) => placement.runtimeBonePoseSha256)
        .filter((value) => typeof value === "string" && value.length > 0),
    ),
  };
}

function descriptorPlacementSha256(descriptor) {
  return sha256(stableJson(descriptor.placements));
}

export function auditRuntimeVisualDuplicateOccurrences(index) {
  invariant(index?.schemaVersion === "runtime-visual-descriptor-index/v1", "unsupported visual index schema");
  invariant(Array.isArray(index.descriptors), "visual index descriptors must be an array");
  invariant(index.descriptorCount === index.descriptors.length, "visual descriptor count mismatch");

  const descriptorsByRawName = new Map();
  for (const descriptor of index.descriptors) {
    invariant(typeof descriptor.rawName === "string" && descriptor.rawName.length > 0, "descriptor rawName is required");
    invariant(typeof descriptor.cardId === "string" && descriptor.cardId.length > 0, `${descriptor.rawName}: cardId is required`);
    invariant(Array.isArray(descriptor.placements), `${descriptor.rawName}: placements must be an array`);
    const descriptors = descriptorsByRawName.get(descriptor.rawName) ?? [];
    descriptors.push(descriptor);
    descriptorsByRawName.set(descriptor.rawName, descriptors);
  }

  const bindingDrift = [];
  const exactRenderDuplicateGroups = [];
  const exactRenderPayloadMismatchGroups = [];
  const sameSourceCrossActorGroups = [];
  const sameSourceDifferentPayloadReviewGroups = [];

  for (const rawName of [...descriptorsByRawName.keys()].sort((left, right) => left.localeCompare(right, "en"))) {
    const descriptors = descriptorsByRawName
      .get(rawName)
      .sort((left, right) => left.cardId.localeCompare(right.cardId, "en"));
    const cardIds = sortedUnique(descriptors.map((descriptor) => descriptor.cardId));
    const placementHashes = sortedUnique(descriptors.map(descriptorPlacementSha256));
    if (placementHashes.length !== 1) {
      bindingDrift.push({ rawName, cardIds, placementSha256: placementHashes });
    }
    const descriptor = descriptors[0];

    const exactGroups = groupPlacements(
      descriptor.placements,
      (placement) => `${placement.assetUrl}\u0000${matrixKey(placement.matrix)}`,
    );
    for (const placements of exactGroups) {
      if (placements.length < 2 || sortedUnique(placements.map((placement) => placement.actor)).length < 2) continue;
      const record = groupRecord(descriptor, cardIds, placements);
      exactRenderDuplicateGroups.push(record);
      if (record.renderPayloadSha256.length !== 1) exactRenderPayloadMismatchGroups.push(record);
    }

    const sameSourceGroups = groupPlacements(
      descriptor.placements,
      (placement) => `${placement.sourceMeshPath}\u0000${matrixKey(placement.matrix)}`,
    );
    for (const placements of sameSourceGroups) {
      if (placements.length < 2 || sortedUnique(placements.map((placement) => placement.actor)).length < 2) continue;
      const record = groupRecord(descriptor, cardIds, placements);
      sameSourceCrossActorGroups.push(record);
      if (record.renderPayloadSha256.length > 1) sameSourceDifferentPayloadReviewGroups.push(record);
    }
  }

  const byIdentity = (left, right) =>
    `${left.rawName}\u0000${left.assetUrls.join("\u0000")}`.localeCompare(
      `${right.rawName}\u0000${right.assetUrls.join("\u0000")}`,
      "en",
    );
  exactRenderDuplicateGroups.sort(byIdentity);
  exactRenderPayloadMismatchGroups.sort(byIdentity);
  sameSourceCrossActorGroups.sort(byIdentity);
  sameSourceDifferentPayloadReviewGroups.sort(byIdentity);

  return {
    schemaVersion: "runtime-visual-duplicate-occurrence-audit/v1",
    visualDescriptorCount: index.descriptors.length,
    uniqueSourceVehicleCount: descriptorsByRawName.size,
    bindingDriftCount: bindingDrift.length,
    exactRenderDuplicateVehicleCount: new Set(
      exactRenderDuplicateGroups.map((group) => group.rawName),
    ).size,
    exactRenderDuplicateGroupCount: exactRenderDuplicateGroups.length,
    exactRenderDuplicateOccurrenceCount: exactRenderDuplicateGroups.reduce(
      (total, group) => total + group.occurrenceCount,
      0,
    ),
    exactRenderRedundantOccurrenceCount: exactRenderDuplicateGroups.reduce(
      (total, group) => total + group.redundantOccurrenceCount,
      0,
    ),
    exactRenderPayloadMismatchGroupCount: exactRenderPayloadMismatchGroups.length,
    sameSourceCrossActorVehicleCount: new Set(
      sameSourceCrossActorGroups.map((group) => group.rawName),
    ).size,
    sameSourceCrossActorGroupCount: sameSourceCrossActorGroups.length,
    sameSourceDifferentPayloadReviewVehicleCount: new Set(
      sameSourceDifferentPayloadReviewGroups.map((group) => group.rawName),
    ).size,
    sameSourceDifferentPayloadReviewGroupCount: sameSourceDifferentPayloadReviewGroups.length,
    bindingDrift,
    exactRenderDuplicateGroups,
    exactRenderPayloadMismatchGroups,
    sameSourceCrossActorGroups,
    sameSourceDifferentPayloadReviewGroups,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const visualIndexPath = path.resolve(String(args["visual-index"] ?? DEFAULT_VISUAL_INDEX));
  const index = JSON.parse(await readFile(visualIndexPath, "utf8"));
  const audit = auditRuntimeVisualDuplicateOccurrences(index);
  if (args.check) {
    invariant(
      audit.exactRenderPayloadMismatchGroupCount === 0,
      "same assetUrl + matrix group has divergent render payload metadata",
    );
  }
  const output = args.summary
    ? {
        schemaVersion: audit.schemaVersion,
        visualDescriptorCount: audit.visualDescriptorCount,
        uniqueSourceVehicleCount: audit.uniqueSourceVehicleCount,
        bindingDriftCount: audit.bindingDriftCount,
        exactRenderDuplicateVehicleCount: audit.exactRenderDuplicateVehicleCount,
        exactRenderDuplicateGroupCount: audit.exactRenderDuplicateGroupCount,
        exactRenderDuplicateOccurrenceCount: audit.exactRenderDuplicateOccurrenceCount,
        exactRenderRedundantOccurrenceCount: audit.exactRenderRedundantOccurrenceCount,
        exactRenderPayloadMismatchGroupCount: audit.exactRenderPayloadMismatchGroupCount,
        sameSourceCrossActorVehicleCount: audit.sameSourceCrossActorVehicleCount,
        sameSourceCrossActorGroupCount: audit.sameSourceCrossActorGroupCount,
        sameSourceDifferentPayloadReviewVehicleCount:
          audit.sameSourceDifferentPayloadReviewVehicleCount,
        sameSourceDifferentPayloadReviewGroupCount:
          audit.sameSourceDifferentPayloadReviewGroupCount,
      }
    : audit;
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (args.output) await writeFile(path.resolve(String(args.output)), serialized, "utf8");
  else process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
