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
/** Keep the ramp visually balanced while giving common thin armor blue and green room. */

export const ARMOR_THICKNESS_STOPS: ReadonlyArray<{
  readonly thicknessMm: number;
  readonly normalizedPosition: number;
  readonly rgb: ArmorRgb;
}> = [
  { thicknessMm: 0, normalizedPosition: 0, rgb: [86 / 255, 180 / 255, 233 / 255] },
  { thicknessMm: 40, normalizedPosition: 0.16, rgb: [41 / 255, 171 / 255, 91 / 255] },
  { thicknessMm: 80, normalizedPosition: 0.23, rgb: [41 / 255, 171 / 255, 91 / 255] },
  { thicknessMm: 150, normalizedPosition: 0.32, rgb: [233 / 255, 204 / 255, 35 / 255] },
  { thicknessMm: 200, normalizedPosition: 0.45, rgb: [233 / 255, 204 / 255, 35 / 255] },
  { thicknessMm: 300, normalizedPosition: 0.56, rgb: [242 / 255, 111 / 255, 25 / 255] },
  { thicknessMm: 400, normalizedPosition: 0.64, rgb: [232 / 255, 91 / 255, 36 / 255] },
  { thicknessMm: 500, normalizedPosition: 0.72, rgb: [220 / 255, 38 / 255, 38 / 255] },
  { thicknessMm: 600, normalizedPosition: 0.8, rgb: [127 / 255, 20 / 255, 20 / 255] },
  { thicknessMm: 890, normalizedPosition: 1, rgb: [110 / 255, 74 / 255, 46 / 255] },
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

const LEGEND_TICK_VALUES_MM = [0, 200, 400, 600, 800, 890] as const;

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
  const clamped = clampThickness(thicknessMm);
  if (clamped <= ARMOR_THICKNESS_STOPS[0].thicknessMm) {
    return ARMOR_THICKNESS_STOPS[0].normalizedPosition;
  }

  for (let index = 1; index < ARMOR_THICKNESS_STOPS.length; index += 1) {
    const upper = ARMOR_THICKNESS_STOPS[index];
    if (clamped <= upper.thicknessMm) {
      const lower = ARMOR_THICKNESS_STOPS[index - 1];
      const amount =
        (clamped - lower.thicknessMm) / (upper.thicknessMm - lower.thicknessMm);
      return (
        lower.normalizedPosition +
        (upper.normalizedPosition - lower.normalizedPosition) * amount
      );
    }
  }

  return ARMOR_THICKNESS_STOPS.at(-1)!.normalizedPosition;
}

export function armorThicknessLegendPosition(thicknessMm: number): number {
  assertFiniteThickness(thicknessMm);
  const clamped = clampThickness(thicknessMm);
  return (
    (clamped - ARMOR_THICKNESS_MIN_MM) /
    (ARMOR_THICKNESS_MAX_MM - ARMOR_THICKNESS_MIN_MM)
  );
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
 * Absolute mode uses a linear 0–890 mm presentation axis. Relative mode is
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
