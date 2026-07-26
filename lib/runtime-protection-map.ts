import {
  isEditorNativeVehicleDamageEvent,
  type EditorNativeShotResult,
} from "./editor-native-hit-model.ts";

export const RUNTIME_PROTECTION_MAP_BATCH_RAYS = 128;
export const RUNTIME_PROTECTION_MAP_BLOCK_SIZE = 8 as const;
export const RUNTIME_PROTECTION_MAP_MIN_PRECISION = 1 as const;
export const RUNTIME_PROTECTION_MAP_STANDARD_MAX_PRECISION = 5 as const;
export const RUNTIME_PROTECTION_MAP_SUPER_PRECISION = 6 as const;
export const RUNTIME_PROTECTION_MAP_MAX_PRECISION =
  RUNTIME_PROTECTION_MAP_SUPER_PRECISION;
export const RUNTIME_PROTECTION_MAP_SUPER_SCALE = 2 as const;

export type RuntimeProtectionMapStandardPrecision = 1 | 2 | 3 | 4 | 5;
export type RuntimeProtectionMapPrecision =
  | RuntimeProtectionMapStandardPrecision
  | typeof RUNTIME_PROTECTION_MAP_SUPER_PRECISION;
export type RuntimeProtectionMapCell = 0 | 1 | 2 | 3 | 4;

export const RUNTIME_PROTECTION_MAP_CELL = {
  none: 0,
  damage: 1,
  engine: 2,
  ammo: 3,
  engineAndAmmo: 4,
} as const satisfies Record<string, RuntimeProtectionMapCell>;

type SampleOffset = readonly [number, number];

function progressiveSampleRank(column: number, row: number) {
  const shiftedColumn =
    (column + RUNTIME_PROTECTION_MAP_BLOCK_SIZE - 3) % RUNTIME_PROTECTION_MAP_BLOCK_SIZE;
  const shiftedRow =
    (row + RUNTIME_PROTECTION_MAP_BLOCK_SIZE - 3) % RUNTIME_PROTECTION_MAP_BLOCK_SIZE;
  let rank = 0;
  for (let bit = 0; bit < 3; bit += 1) {
    const columnBit = (shiftedColumn >> bit) & 1;
    const rowBit = (shiftedRow >> bit) & 1;
    const quadrant = ((columnBit ^ rowBit) << 1) | rowBit;
    rank |= quadrant << (bit * 2);
  }
  return rank;
}

const PROGRESSIVE_OFFSETS: SampleOffset[] = Array.from(
  { length: RUNTIME_PROTECTION_MAP_BLOCK_SIZE ** 2 },
  (_, index) => [
    index % RUNTIME_PROTECTION_MAP_BLOCK_SIZE,
    Math.floor(index / RUNTIME_PROTECTION_MAP_BLOCK_SIZE),
  ] as const,
).sort(
  ([leftColumn, leftRow], [rightColumn, rightRow]) =>
    progressiveSampleRank(leftColumn, leftRow) - progressiveSampleRank(rightColumn, rightRow),
);

const LEVEL_OFFSETS: Record<
  RuntimeProtectionMapStandardPrecision,
  readonly SampleOffset[]
> = {
  1: PROGRESSIVE_OFFSETS.slice(0, 1),
  2: PROGRESSIVE_OFFSETS.slice(1, 17),
  3: PROGRESSIVE_OFFSETS.slice(17, 33),
  4: PROGRESSIVE_OFFSETS.slice(33, 49),
  5: PROGRESSIVE_OFFSETS.slice(49),
};

function alignedDimension(value: number, limit: number) {
  return Math.min(
    limit,
    Math.max(
      RUNTIME_PROTECTION_MAP_BLOCK_SIZE,
      Math.round(value / RUNTIME_PROTECTION_MAP_BLOCK_SIZE) * RUNTIME_PROTECTION_MAP_BLOCK_SIZE,
    ),
  );
}

export function runtimeProtectionMapGridSize(viewportWidth: number, viewportHeight: number) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return { width: 1, height: 1 };
  const scale = Math.min(384 / viewportWidth, 256 / viewportHeight, 1);
  return {
    width: alignedDimension(viewportWidth * scale, 384),
    height: alignedDimension(viewportHeight * scale, 256),
  };
}

export function runtimeProtectionMapSuperGridSize(
  viewportWidth: number,
  viewportHeight: number,
) {
  const standard = runtimeProtectionMapGridSize(viewportWidth, viewportHeight);
  return {
    width: standard.width * RUNTIME_PROTECTION_MAP_SUPER_SCALE,
    height: standard.height * RUNTIME_PROTECTION_MAP_SUPER_SCALE,
  };
}

export function runtimeProtectionMapLevelOffsets(
  level: RuntimeProtectionMapStandardPrecision,
) {
  return LEVEL_OFFSETS[level];
}

export function runtimeProtectionMapLevelSampleCount(
  gridWidth: number,
  gridHeight: number,
  level: RuntimeProtectionMapStandardPrecision,
) {
  let total = 0;
  for (const [columnOffset, rowOffset] of LEVEL_OFFSETS[level]) {
    if (columnOffset >= gridWidth || rowOffset >= gridHeight) continue;
    total +=
      Math.ceil((gridWidth - columnOffset) / RUNTIME_PROTECTION_MAP_BLOCK_SIZE) *
      Math.ceil((gridHeight - rowOffset) / RUNTIME_PROTECTION_MAP_BLOCK_SIZE);
  }
  return total;
}

export function runtimeProtectionMapCumulativeSampleCount(
  gridWidth: number,
  gridHeight: number,
  level: RuntimeProtectionMapStandardPrecision,
) {
  let total = 0;
  for (let candidate = RUNTIME_PROTECTION_MAP_MIN_PRECISION; candidate <= level; candidate += 1) {
    total += runtimeProtectionMapLevelSampleCount(
      gridWidth,
      gridHeight,
      candidate as RuntimeProtectionMapStandardPrecision,
    );
  }
  return total;
}

export function clampRuntimeProtectionMapPrecision(value: number): RuntimeProtectionMapPrecision {
  return Math.min(
    RUNTIME_PROTECTION_MAP_MAX_PRECISION,
    Math.max(RUNTIME_PROTECTION_MAP_MIN_PRECISION, Math.round(value)),
  ) as RuntimeProtectionMapPrecision;
}

export function runtimeProtectionMapSuperSampleCount(
  viewportWidth: number,
  viewportHeight: number,
) {
  const grid = runtimeProtectionMapSuperGridSize(viewportWidth, viewportHeight);
  return grid.width * grid.height;
}

export function classifyRuntimeProtectionShot(
  result: Pick<EditorNativeShotResult, "resolution" | "damage">,
): RuntimeProtectionMapCell {
  if (result.resolution === "native-unknown") return RUNTIME_PROTECTION_MAP_CELL.none;
  const positiveDamage = result.damage.filter(isEditorNativeVehicleDamageEvent);
  if (positiveDamage.length === 0) return RUNTIME_PROTECTION_MAP_CELL.none;
  const engine = positiveDamage.some((candidate) => candidate.poolKind === "engine");
  const ammo = positiveDamage.some((candidate) => candidate.poolKind === "ammo-rack");
  if (engine && ammo) return RUNTIME_PROTECTION_MAP_CELL.engineAndAmmo;
  if (ammo) return RUNTIME_PROTECTION_MAP_CELL.ammo;
  if (engine) return RUNTIME_PROTECTION_MAP_CELL.engine;
  return RUNTIME_PROTECTION_MAP_CELL.damage;
}

export function reconstructRuntimeProtectionMapBlock(
  sampleValues: Uint8Array,
  sampledMask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  blockColumn: number,
  blockRow: number,
  reconstructed: Uint8Array,
) {
  const blockHeight = Math.min(RUNTIME_PROTECTION_MAP_BLOCK_SIZE, gridHeight - blockRow);
  const blockWidth = Math.min(RUNTIME_PROTECTION_MAP_BLOCK_SIZE, gridWidth - blockColumn);
  const samples: Array<{ column: number; row: number; value: RuntimeProtectionMapCell }> = [];

  for (let row = 0; row < blockHeight; row += 1) {
    for (let column = 0; column < blockWidth; column += 1) {
      const index = (blockRow + row) * gridWidth + blockColumn + column;
      if (sampledMask[index] === 0) continue;
      samples.push({
        column,
        row,
        value: sampleValues[index] as RuntimeProtectionMapCell,
      });
    }
  }

  for (let row = 0; row < blockHeight; row += 1) {
    for (let column = 0; column < blockWidth; column += 1) {
      const index = (blockRow + row) * gridWidth + blockColumn + column;
      if (sampledMask[index] !== 0) {
        reconstructed[index] = sampleValues[index];
        continue;
      }
      if (samples.length === 0) {
        reconstructed[index] = RUNTIME_PROTECTION_MAP_CELL.none;
        continue;
      }
      let nearest = samples[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const sample of samples) {
        const distance = (sample.column - column) ** 2 + (sample.row - row) ** 2;
        if (distance < nearestDistance) {
          nearest = sample;
          nearestDistance = distance;
        }
      }
      reconstructed[index] = nearest.value;
    }
  }
}
