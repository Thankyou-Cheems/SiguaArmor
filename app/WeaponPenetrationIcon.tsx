import type { SVGProps } from "react";

import type { WeaponPenetrationKind } from "../lib/weapon-penetration-kind";

interface WeaponPenetrationIconProps
  extends Omit<SVGProps<SVGSVGElement>, "height" | "width"> {
  kind: WeaponPenetrationKind;
  size?: number;
}

function ArmorPenetrationIconPaths() {
  return (
    <g data-icon-motif="apfsds-separated-sabots">
      <path
        d="M2.2 7.25h18.15L26.2 8l-5.85.75H2.2v-1.5Z"
        fill="currentColor"
      />
      <path
        d="M2.2 8 5.8 5.45v1.8h2.1v1.5H5.8v1.8L2.2 8Z"
        fill="currentColor"
        fillOpacity="0.46"
      />
      <path
        d="m8.8 5.75 4.9-4.45 3.4-.65-4.35 4.7-3.95.4Z"
        fill="currentColor"
        fillOpacity="0.13"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="0.82"
      />
      <path
        d="m12.15 4.45 2.4-2.3m-4.65 2.7 1.7-1.65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.72"
        opacity="0.58"
      />
      <path
        d="m8.8 10.25 4.9 4.45 3.4.65-4.35-4.7-3.95-.4Z"
        fill="currentColor"
        fillOpacity="0.13"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="0.82"
      />
      <path
        d="m12.15 11.55 2.4 2.3m-4.65-2.7 1.7 1.65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.72"
        opacity="0.58"
      />
      <path
        d="M21.3 1.15h3.1v5.15L21.75 8l2.65 1.7v7.15h-3.1v-5.9L19.65 8l1.65-2.95v-3.9Z"
        fill="currentColor"
        fillOpacity="0.17"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <path
        d="m25.4 5.15 2.05-1.3M26.2 8h2.75m-3.55 2.85 2.05 1.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.05"
        opacity="0.72"
      />
    </g>
  );
}

function ShapedChargePenetrationIconPaths() {
  return (
    <g data-icon-motif="shaped-charge-jet">
      <path
        d="M1.5 2.2h8.8v11.6H1.5V2.2Z"
        fill="currentColor"
        fillOpacity="0.07"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="m3.1 3.8 6.7 4.2-6.7 4.2V3.8Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M10.2 8 20 6.75v2.5L10.2 8Z"
        fill="currentColor"
        fillOpacity="0.78"
      />
      <path
        d="M10.2 8h17.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.25"
      />
      <path
        d="M19.6 1.3h3.15v5.05L20.1 8l2.65 1.65v7.05H19.6v-5.75L17.9 8l1.7-2.95V1.3Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.15"
      />
      <path
        d="m24.1 5.15 2.15-1.35M25 8h3.35m-4.25 2.85 2.15 1.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.1"
        opacity="0.78"
      />
    </g>
  );
}

export function WeaponPenetrationIcon({
  kind,
  size = 18,
  className,
  ...svgProps
}: WeaponPenetrationIconProps) {
  return (
    <svg
      {...svgProps}
      className={["weapon-penetration-icon", className]
        .filter(Boolean)
        .join(" ")}
      data-penetration-kind={kind}
      width={size}
      height={Math.round(size * 0.6)}
      viewBox="0 0 30 18"
      fill="none"
      focusable="false"
      aria-hidden="true"
    >
      {kind === "shaped-charge" ? (
        <ShapedChargePenetrationIconPaths />
      ) : (
        <ArmorPenetrationIconPaths />
      )}
    </svg>
  );
}
