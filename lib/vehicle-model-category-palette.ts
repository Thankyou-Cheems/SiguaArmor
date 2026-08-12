export type VehicleModelCategoryKind =
  | "spaced-armor"
  | "no-penetration"
  | "component"
  | "engine"
  | "ammo-rack"
  | "collision";

/**
 * Single source of truth for categorical colors shared by the 3D model,
 * legend, hit-path markers, and component outcome cards.
 */
export const VEHICLE_MODEL_CATEGORY_COLORS = Object.freeze({
  "spaced-armor": "#55d9e6",
  "no-penetration": "#d874b7",
  component: "#b8d96b",
  engine: "#f3a15b",
  "ammo-rack": "#e95f6d",
  collision: "#f3f5f2",
} as const satisfies Record<VehicleModelCategoryKind, `#${string}`>);

export const VEHICLE_MODEL_CATEGORY_CSS_VARIABLES = Object.freeze({
  "--model-spaced-armor": VEHICLE_MODEL_CATEGORY_COLORS["spaced-armor"],
  "--model-no-penetration": VEHICLE_MODEL_CATEGORY_COLORS["no-penetration"],
  "--model-component": VEHICLE_MODEL_CATEGORY_COLORS.component,
  "--model-engine": VEHICLE_MODEL_CATEGORY_COLORS.engine,
  "--model-ammo-rack": VEHICLE_MODEL_CATEGORY_COLORS["ammo-rack"],
  "--model-collision": VEHICLE_MODEL_CATEGORY_COLORS.collision,
} as const);

export function vehicleModelCategoryColorRgb(
  kind: VehicleModelCategoryKind,
): readonly [number, number, number] {
  const hex = VEHICLE_MODEL_CATEGORY_COLORS[kind];
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
