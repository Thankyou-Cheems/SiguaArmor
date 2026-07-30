export type VehicleDamageTypeIconKind =
  | "kinetic"
  | "small-arms"
  | "generic"
  | "fragmentation"
  | "heat"
  | "hat"
  | "explosives"
  | "thermite";

export type VehicleExplosionDamageTypeIconKind = VehicleDamageTypeIconKind;

export const VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS = Object.freeze([
  "fragmentation",
  "heat",
  "hat",
  "explosives",
  "thermite",
] as const satisfies readonly VehicleExplosionDamageTypeIconKind[]);

export const VEHICLE_DAMAGE_TYPE_ICON_COLORS = Object.freeze({
  kinetic: "#e1c89b",
  "small-arms": "#a9c987",
  generic: "#aeb6b2",
  fragmentation: "#efb865",
  heat: "#61d4e5",
  hat: "#4fa4ed",
  explosives: "#ef735a",
  thermite: "#f29d4b",
} as const satisfies Record<VehicleDamageTypeIconKind, `#${string}`>);

const VEHICLE_EXPLOSIVE_ROUTE_DAMAGE_TYPE_ICON_KINDS = Object.freeze([
  "kinetic",
  "small-arms",
  "generic",
  ...VEHICLE_EXPLOSION_DAMAGE_TYPE_ICON_KINDS,
] as const satisfies readonly VehicleExplosionDamageTypeIconKind[]);

const DAMAGE_TYPE_ICON_KIND_BY_CLASS = new Map<string, VehicleDamageTypeIconKind>([
  ["bp_kinetic_damagetype", "kinetic"],
  ["bp_kinetic_damagetype_c", "kinetic"],
  ["bp_smallarms_damagetype", "small-arms"],
  ["bp_smallarms_damagetype_c", "small-arms"],
  ["bp_fragmentation_damagetype", "fragmentation"],
  ["bp_fragmentation_damagetype_c", "fragmentation"],
  ["bp_basicheatdamagetype", "heat"],
  ["bp_basicheatdamagetype_c", "heat"],
  ["bp_hat_damagetype", "hat"],
  ["bp_hat_damagetype_c", "hat"],
  ["bp_explosives_damagetype", "explosives"],
  ["bp_explosives_damagetype_c", "explosives"],
  ["sqdamagetype_thermite", "thermite"],
  ["sqdamagetype_thermite_c", "thermite"],
]);

const DAMAGE_TYPE_ICON_LABELS: Record<VehicleDamageTypeIconKind, string> = {
  kinetic: "动能弹",
  "small-arms": "轻武器伤害",
  generic: "基础伤害类型（未分类）",
  fragmentation: "破片伤害",
  heat: "破甲弹（HEAT）",
  hat: "重型反坦克武器（HAT）",
  explosives: "爆炸伤害",
  thermite: "热辐射",
};

const DAMAGE_TYPE_ICON_SHORT_LABELS: Record<
  VehicleDamageTypeIconKind,
  string
> = {
  kinetic: "动能",
  "small-arms": "轻武器",
  generic: "未分类",
  fragmentation: "破片",
  heat: "HEAT",
  hat: "HAT",
  explosives: "爆炸",
  thermite: "热辐射",
};

const DAMAGE_TYPE_ICON_EFFECT_LABELS: Record<
  VehicleDamageTypeIconKind,
  string
> = {
  kinetic: "动能点伤害",
  "small-arms": "轻武器点伤害",
  generic: "原生类别尚未细分",
  fragmentation: "破片径向伤害",
  heat: "HEAT 径向伤害",
  hat: "HAT 径向伤害",
  explosives: "通用爆炸径向伤害",
  thermite: "热辐射径向伤害",
};

function damageTypeClassName(damageTypePath: string) {
  return damageTypePath
    .trim()
    .replace(/^Class'/u, "")
    .replace(/'$/u, "")
    .split(/[/.]/u)
    .at(-1)
    ?.toLocaleLowerCase("en-US") ?? "";
}

export function vehicleDamageTypeIconKindForPath(
  damageTypePath: string | null,
): VehicleDamageTypeIconKind | null {
  if (!damageTypePath) return null;
  return DAMAGE_TYPE_ICON_KIND_BY_CLASS.get(
    damageTypeClassName(damageTypePath),
  ) ?? null;
}

export function isVehicleExplosionDamageTypeIconKind(
  kind: VehicleDamageTypeIconKind | null,
): kind is VehicleExplosionDamageTypeIconKind {
  return kind !== null;
}

export function vehicleDamageTypeIconLabel(
  kind: VehicleDamageTypeIconKind,
) {
  return DAMAGE_TYPE_ICON_LABELS[kind];
}

export function vehicleDamageTypeIconColor(
  kind: VehicleDamageTypeIconKind,
) {
  return VEHICLE_DAMAGE_TYPE_ICON_COLORS[kind];
}

export function vehicleDamageTypeIconColorNumber(
  kind: VehicleDamageTypeIconKind,
) {
  return Number.parseInt(vehicleDamageTypeIconColor(kind).slice(1), 16);
}

export function vehicleDamageTypeIconShortLabel(
  kind: VehicleDamageTypeIconKind,
) {
  return DAMAGE_TYPE_ICON_SHORT_LABELS[kind];
}

export function vehicleDamageTypeEffectLabel(
  kind: VehicleDamageTypeIconKind,
) {
  return DAMAGE_TYPE_ICON_EFFECT_LABELS[kind];
}

export function explosiveDamageTypeIconKinds(
  isExplosive: boolean | null,
  damageTypePaths: string | null | readonly (string | null)[],
): VehicleExplosionDamageTypeIconKind[] {
  if (isExplosive !== true) return [];
  const paths = Array.isArray(damageTypePaths)
    ? damageTypePaths
    : [damageTypePaths];
  const kinds = new Set<VehicleExplosionDamageTypeIconKind>();
  for (const damageTypePath of paths) {
    const kind = vehicleDamageTypeIconKindForPath(damageTypePath);
    if (isVehicleExplosionDamageTypeIconKind(kind)) {
      kinds.add(kind);
    } else if (
      damageTypePath &&
      damageTypeClassName(damageTypePath) === "sqdamagetype"
    ) {
      kinds.add("generic");
    }
  }
  return VEHICLE_EXPLOSIVE_ROUTE_DAMAGE_TYPE_ICON_KINDS.filter((kind) =>
    kinds.has(kind)
  );
}
