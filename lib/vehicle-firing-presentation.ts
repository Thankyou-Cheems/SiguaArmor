import type { StationGraphTransform } from "./vehicle-station-graph.ts";
import type { VehicleWeaponOperationSpec } from "./vehicle-weapon-operation-state.ts";

export interface VehicleFiringEquipmentBinding {
  weaponClassPath: string;
  inventorySlotNumbers: number[];
  magazineFeed?: Pick<VehicleWeaponOperationSpec, "allowRoundInChamber" | "allowSingleLoad">;
}

export interface VehicleSourceWeaponPresentation {
  selectionIcon: string | null;
  categoryIcon: string | null;
  magazineIconSet: string;
  showMagCount: boolean;
  showItemCount: boolean;
  showAmmoDataInHud?: boolean;
  projectileClass: string | null;
  tracerProjectileClass: string | null;
  roundsBetweenTracer: number;
  magazineFeed: { allowRoundInChamber: boolean; allowSingleLoad: boolean };
}

export interface SourceProjectileVisual {
  bodyRotation: { followsVelocity: boolean; remainsVertical: boolean };
  bodies: Array<{ name: string; model: string; componentToActor: StationGraphTransform }>;
  effects: Array<{ source: string; componentToActor: StationGraphTransform }>;
  nativeTracer: { effect: string | null; isTracer: boolean };
}

export interface SourceLinearColor { R: number; G: number; B: number; A: number }

export interface VehicleFiringPresentation {
  schemaVersion: "sigua-vehicle-firing-presentation/v1";
  gameVersion: string;
  weapons: Record<string, VehicleSourceWeaponPresentation>;
  projectiles: Record<string, SourceProjectileVisual>;
  textures: Record<string, { pathname: string; width: number; height: number }>;
  iconSets: Record<string, { base: string; depleted: string[] }>;
  hud: {
    inventory: { selectedAlpha: number; unselectedAlpha: number; fadeDelaySeconds: number; fadeDurationSeconds: number };
    showAmmoInMag: boolean;
    showFireSelector: boolean;
    fireModeLabels: Record<"continuous" | "single" | "burst", string>;
    magazineColors: Record<"Full" | "NearlyFull" | "Half" | "NearlyEmpty" | "Refillable", SourceLinearColor>;
    layout: {
      selectedItem: { X: number; Y: number };
      categoryIcon: { X: number; Y: number };
      magazineIcon: { X: number; Y: number };
      fonts: { weaponName: number; inventoryName: number; fireMode: number };
      chamberedRound: { texture: string; size: { X: number; Y: number }; angle: number; paddingRight: number };
    };
  };
}

export function sourceWeaponFireModeLabel(document: VehicleFiringPresentation, spec: VehicleWeaponOperationSpec) {
  const mode = spec.fireControl?.modes[spec.fireControl.defaultModeIndex];
  if (!document.hud.showFireSelector || !mode) return "";
  // The native widget prints other authored burst sizes as numbers (e.g. 2).
  if (mode.kind === "burst" && mode.sourceValue !== 3) return String(mode.sourceValue);
  return document.hud.fireModeLabels[mode.kind];
}

export function sourceMagazineColor(document: VehicleFiringPresentation, fraction: number): SourceLinearColor {
  const colors = document.hud.magazineColors;
  if (fraction >= 1) return colors.Full;
  if (fraction <= 0) return colors.Refillable;
  const toHsv = ({ R: r, G: g, B: b }: SourceLinearColor) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, max === 0 ? 0 : d / max, max];
  };
  const low = fraction < .5 ? colors.NearlyEmpty : colors.Half;
  const high = fraction < .5 ? colors.Half : colors.NearlyFull;
  const t = fraction < .5 ? fraction * 2 : (fraction - .5) * 2;
  const [ah, as, av] = toHsv(low), [bh, bs, bv] = toHsv(high);
  let dh = bh! - ah!;
  if (dh > .5) dh -= 1;
  if (dh < -.5) dh += 1;
  const h = ((ah! + dh * t) % 1 + 1) % 1, s = as! + (bs! - as!) * t, v = av! + (bv! - av!) * t;
  const component = (n: number) => v - v * s * Math.max(0, Math.min((n + h * 6) % 6, 4 - (n + h * 6) % 6, 1));
  return { R: component(5), G: component(3), B: component(1), A: low.A + (high.A - low.A) * t };
}

export function sourceHudCssColor(color: SourceLinearColor) {
  const srgb = (v: number) => Math.round(255 * Math.min(1, v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055));
  return `rgba(${srgb(color.R)}, ${srgb(color.G)}, ${srgb(color.B)}, ${color.A})`;
}

export function sourceMagazineDepletedTexture(
  icons: VehicleFiringPresentation["iconSets"][string], fraction: number,
) {
  // SQMagazineIconDataAsset::GetMagazineImageForPercent. The names of these
  // textures are misleading: they are foreground masks, not dark overlays.
  const fullness = Math.fround(fraction);
  if (fullness > 0 && fullness < 1) {
    const step = Math.fround(1 / icons.depleted.length);
    for (let i = 0; i < icons.depleted.length; i++) {
      if (Math.fround(1 - Math.fround((i + 1) * step)) < fullness) return icons.depleted[i]!;
    }
  }
  return icons.base;
}

export function sourceProjectileForShot(
  document: VehicleFiringPresentation, weapon: VehicleSourceWeaponPresentation, shotIndex: number,
) {
  // ASQWeapon::FireProjectile increments ShotsSinceLastTracer first, then
  // chooses a tracer iff the counter is greater than RoundsBetweenTracer.
  const tracer = weapon.tracerProjectileClass &&
    (shotIndex + 1) % Math.max(1, weapon.roundsBetweenTracer + 1) === 0;
  const classPath = tracer ? weapon.tracerProjectileClass : weapon.projectileClass;
  return classPath ? { classPath, visual: document.projectiles[classPath] ?? null } : null;
}
