/**
 * A vehicle-independent nominal-armor scale for the armor viewer.
 *
 * Thickness is the only continuous category. Special gameplay surfaces stay
 * categorical so a penetration blocker can never masquerade as thick armor.
 * RGB values are normalized sRGB and can be passed directly to Three.Color.
 */

export type ArmorRgb = readonly [red: number, green: number, blue: number];

export type ArmorVisualCategory =
  | "thickness"
  | "no-penetration"
  | "unknown"
  | "track-wheel";

export type ArmorSurfaceVisualInput =
  | { category: "thickness"; thicknessMm: number }
  | { category: Exclude<ArmorVisualCategory, "thickness"> };

export type ArmorSurfaceVisualStyle = {
  category: ArmorVisualCategory;
  rgb: ArmorRgb;
  opacity: number;
  depthWrite: boolean;
  pattern: "none" | "diagonal-hatch" | "cross-hatch";
  normalizedThickness: number | null;
  thicknessMm: number | null;
};

export const ARMOR_THICKNESS_MIN_MM = 0;
export const ARMOR_THICKNESS_MAX_MM = 890;

/**
 * The current fleet snapshot is strongly right-skewed: about 80% of
 * renderable armor profiles are at or below 20 mm, 88% at or below 40 mm,
 * 96% at or below 100 mm, and 99% at or below 300 mm. A log-like axis gives
 * those common thin surfaces readable color separation while retaining a
 * visible heavy-armor tail through 890 mm.
 */
const ARMOR_THICKNESS_AXIS_LOG_DENOMINATOR = Math.log1p(ARMOR_THICKNESS_MAX_MM);

function armorThicknessAxisPosition(thicknessMm: number): number {
  const clamped = Math.min(
    ARMOR_THICKNESS_MAX_MM,
    Math.max(ARMOR_THICKNESS_MIN_MM, thicknessMm),
  );
  return Math.log1p(clamped) / ARMOR_THICKNESS_AXIS_LOG_DENOMINATOR;
}

export const ARMOR_THICKNESS_STOPS: ReadonlyArray<{
  readonly thicknessMm: number;
  readonly normalizedPosition: number;
  readonly rgb: ArmorRgb;
}> = [
  { thicknessMm: 0, normalizedPosition: armorThicknessAxisPosition(0), rgb: [86 / 255, 180 / 255, 233 / 255] },
  { thicknessMm: 40, normalizedPosition: armorThicknessAxisPosition(40), rgb: [41 / 255, 171 / 255, 91 / 255] },
  { thicknessMm: 80, normalizedPosition: armorThicknessAxisPosition(80), rgb: [41 / 255, 171 / 255, 91 / 255] },
  { thicknessMm: 150, normalizedPosition: armorThicknessAxisPosition(150), rgb: [233 / 255, 204 / 255, 35 / 255] },
  { thicknessMm: 200, normalizedPosition: armorThicknessAxisPosition(200), rgb: [233 / 255, 204 / 255, 35 / 255] },
  { thicknessMm: 300, normalizedPosition: armorThicknessAxisPosition(300), rgb: [242 / 255, 111 / 255, 25 / 255] },
  { thicknessMm: 400, normalizedPosition: armorThicknessAxisPosition(400), rgb: [232 / 255, 91 / 255, 36 / 255] },
  { thicknessMm: 500, normalizedPosition: armorThicknessAxisPosition(500), rgb: [220 / 255, 38 / 255, 38 / 255] },
  { thicknessMm: 600, normalizedPosition: armorThicknessAxisPosition(600), rgb: [127 / 255, 20 / 255, 20 / 255] },
  { thicknessMm: 890, normalizedPosition: armorThicknessAxisPosition(890), rgb: [110 / 255, 74 / 255, 46 / 255] },
];

const RELATIVE_ARMOR_THICKNESS_RED_END_MM = 600;
const RELATIVE_ARMOR_THICKNESS_RED_END_POSITION =
  ARMOR_THICKNESS_STOPS.find(
    (stop) => stop.thicknessMm === RELATIVE_ARMOR_THICKNESS_RED_END_MM,
  )!.normalizedPosition;

/**
 * Relative mode deliberately stops at the absolute ramp's deep-red node.
 * Rescaling these positions to 0..1 keeps its legend and mesh colors aligned
 * without inheriting the absolute scale's 600–890 mm brown segment.
 */
export const RELATIVE_ARMOR_THICKNESS_STOPS = ARMOR_THICKNESS_STOPS
  .filter((stop) => stop.normalizedPosition <= RELATIVE_ARMOR_THICKNESS_RED_END_POSITION)
  .map((stop) => ({
    rgb: stop.rgb,
    normalizedPosition:
      stop.normalizedPosition / RELATIVE_ARMOR_THICKNESS_RED_END_POSITION,
  }));

const LEGEND_TICK_VALUES_MM = [0, 10, 20, 50, 100, 300, 890] as const;

function assertFiniteThickness(thicknessMm: number): void {
  if (!Number.isFinite(thicknessMm)) {
    throw new TypeError(
      "Armor thickness must be finite; use the explicit unknown category for missing data.",
    );
  }
}

function clampThickness(thicknessMm: number): number {
  return Math.min(
    ARMOR_THICKNESS_MAX_MM,
    Math.max(ARMOR_THICKNESS_MIN_MM, thicknessMm),
  );
}

export function normalizeArmorThickness(thicknessMm: number): number {
  assertFiniteThickness(thicknessMm);
  return armorThicknessAxisPosition(clampThickness(thicknessMm));
}

export function armorThicknessLegendPosition(thicknessMm: number): number {
  // Keep the legend aligned with the same fleet-calibrated color axis used by
  // armor surfaces. The high-thickness tail is intentionally compact there.
  return normalizeArmorThickness(thicknessMm);
}

function mixRgb(from: ArmorRgb, to: ArmorRgb, amount: number): ArmorRgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

export function armorThicknessRgbAtNormalizedPosition(
  normalizedPosition: number,
): ArmorRgb {
  if (!Number.isFinite(normalizedPosition)) {
    throw new TypeError("Normalized armor thickness position must be finite.");
  }
  const normalized = Math.min(1, Math.max(0, normalizedPosition));
  if (normalized <= ARMOR_THICKNESS_STOPS[0].normalizedPosition) {
    return ARMOR_THICKNESS_STOPS[0].rgb;
  }

  for (let index = 1; index < ARMOR_THICKNESS_STOPS.length; index += 1) {
    const upper = ARMOR_THICKNESS_STOPS[index];
    if (normalized === upper.normalizedPosition) return upper.rgb;
    if (normalized <= upper.normalizedPosition) {
      const lower = ARMOR_THICKNESS_STOPS[index - 1];
      return mixRgb(
        lower.rgb,
        upper.rgb,
        (normalized - lower.normalizedPosition) /
          (upper.normalizedPosition - lower.normalizedPosition),
      );
    }
  }

  return ARMOR_THICKNESS_STOPS.at(-1)!.rgb;
}

export function armorThicknessRgb(thicknessMm: number): ArmorRgb {
  assertFiniteThickness(thicknessMm);
  return armorThicknessRgbAtNormalizedPosition(
    normalizeArmorThickness(clampThickness(thicknessMm)),
  );
}

export function normalizeRelativeArmorThickness(
  thicknessMm: number,
  minimumThicknessMm: number,
  maximumThicknessMm: number,
): number {
  assertFiniteThickness(thicknessMm);
  assertFiniteThickness(minimumThicknessMm);
  assertFiniteThickness(maximumThicknessMm);
  if (maximumThicknessMm < minimumThicknessMm) {
    throw new RangeError("Relative armor thickness maximum must not be below its minimum.");
  }
  if (maximumThicknessMm === minimumThicknessMm) return 0.5;
  return Math.min(
    1,
    Math.max(
      0,
      (thicknessMm - minimumThicknessMm) /
        (maximumThicknessMm - minimumThicknessMm),
    ),
  );
}

export function relativeArmorThicknessRgb(
  thicknessMm: number,
  minimumThicknessMm: number,
  maximumThicknessMm: number,
): ArmorRgb {
  return armorThicknessRgbAtNormalizedPosition(
    normalizeRelativeArmorThickness(
      thicknessMm,
      minimumThicknessMm,
      maximumThicknessMm,
    ) * RELATIVE_ARMOR_THICKNESS_RED_END_POSITION,
  );
}

export function armorThicknessStyle(thicknessMm: number): ArmorSurfaceVisualStyle {
  assertFiniteThickness(thicknessMm);
  const clamped = clampThickness(thicknessMm);
  return {
    category: "thickness",
    rgb: armorThicknessRgb(clamped),
    opacity: 0.84,
    depthWrite: true,
    pattern: "none",
    normalizedThickness: normalizeArmorThickness(clamped),
    thicknessMm: clamped,
  };
}

const CATEGORICAL_STYLES: Readonly<
  Record<Exclude<ArmorVisualCategory, "thickness">, ArmorSurfaceVisualStyle>
> = {
  "no-penetration": {
    category: "no-penetration",
    rgb: [184 / 255, 72 / 255, 206 / 255],
    opacity: 0.9,
    depthWrite: true,
    pattern: "diagonal-hatch",
    normalizedThickness: null,
    thicknessMm: null,
  },
  unknown: {
    category: "unknown",
    rgb: [100 / 255, 116 / 255, 139 / 255],
    opacity: 0.46,
    depthWrite: false,
    pattern: "cross-hatch",
    normalizedThickness: null,
    thicknessMm: null,
  },
  "track-wheel": {
    category: "track-wheel",
    rgb: [71 / 255, 85 / 255, 105 / 255],
    opacity: 0.34,
    depthWrite: false,
    pattern: "none",
    normalizedThickness: null,
    thicknessMm: null,
  },
};

export function armorCategoricalStyle(
  category: Exclude<ArmorVisualCategory, "thickness">,
): ArmorSurfaceVisualStyle {
  return CATEGORICAL_STYLES[category];
}

export function armorSurfaceVisualStyle(
  surface: ArmorSurfaceVisualInput,
): ArmorSurfaceVisualStyle {
  return surface.category === "thickness"
    ? armorThicknessStyle(surface.thicknessMm)
    : armorCategoricalStyle(surface.category);
}

/**
 * Absolute mode uses the fleet-calibrated log-like presentation axis as the
 * armor surface colors, keeping the 400–890 mm tail compact. Relative mode is
 * available separately when players need the full color range for one vehicle.
 */
export const ARMOR_THICKNESS_LEGEND_STOPS = ARMOR_THICKNESS_STOPS.map(
  (stop) => ({
    thicknessMm: stop.thicknessMm,
    rgb: stop.rgb,
    normalizedPosition: armorThicknessLegendPosition(stop.thicknessMm),
  }),
);

export const ARMOR_THICKNESS_LEGEND_TICKS = LEGEND_TICK_VALUES_MM.map(
  (thicknessMm) => ({
    thicknessMm,
    label: `${thicknessMm} mm`,
    rgb: armorThicknessRgb(thicknessMm),
    normalizedPosition: armorThicknessLegendPosition(thicknessMm),
  }),
);
