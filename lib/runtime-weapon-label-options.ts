export type RuntimeWeaponLabelMatchBasis =
  | "exact-runtime-asset-to-encyclopedia-gun"
  | "exact-editor-ballistic-fingerprint"
  | "exact-encyclopedia-weapon-ballistics"
  | "exact-editor-projectile-cdo"
  | "exact-editor-explosive-catalog";

export interface RuntimeWeaponLabel {
  displayNameZh: string;
  displayNameEnglish: string;
  gunName: string;
  projectileName: string | null;
  matchBasis: RuntimeWeaponLabelMatchBasis;
}

export interface RuntimeWeaponLabelOption {
  weaponIndex: number;
  label: RuntimeWeaponLabel;
}

function labelIdentity(label: RuntimeWeaponLabel) {
  return [
    label.gunName,
    label.projectileName ?? "",
    label.displayNameEnglish,
    label.displayNameZh,
  ].join("\u0000");
}

/**
 * Construction-world exports can retain a base weapon beside an equivalent
 * livery-specific child. Keep one selector row per encyclopedia weapon and,
 * when both forms are present, prefer the exact asset-name match.
 */
export function distinctRuntimeWeaponLabelOptions(
  options: RuntimeWeaponLabelOption[],
): RuntimeWeaponLabelOption[] {
  const byIdentity = new Map<string, RuntimeWeaponLabelOption>();
  for (const option of options) {
    const identity = labelIdentity(option.label);
    const current = byIdentity.get(identity);
    if (
      !current ||
      (current.label.matchBasis === "exact-editor-ballistic-fingerprint" &&
        option.label.matchBasis === "exact-runtime-asset-to-encyclopedia-gun")
    ) {
      byIdentity.set(identity, option);
    }
  }
  return [...byIdentity.values()];
}
