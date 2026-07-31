import type { SVGProps } from "react";

import type { WeaponPenetrationKind } from "../lib/weapon-penetration-kind";

interface WeaponPenetrationIconProps
  extends Omit<SVGProps<SVGSVGElement>, "height" | "width"> {
  kind: WeaponPenetrationKind;
  size?: number;
}

function ArmorPenetrationIconPaths() {
  return (
    <>
      <path
        d="M1 5.5h3M0.5 8h3M1 10.5h3"
        stroke="currentColor"
        strokeLinecap="round"
        opacity="0.52"
      />
      <path
        d="M4 8 8.2 4.7l3 1.45 3.3 1.1v1.5l-3.3 1.1-3 1.45L4 8Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M15.8 1.25h3.1v4.5l-3.1 1.45V1.25ZM15.8 8.8l3.1 1.45v4.5h-3.1V8.8Z"
        fill="currentColor"
        fillOpacity="0.24"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M6.4 7.3h10.5L22.5 8l-5.6.7H6.4V7.3Z"
        fill="currentColor"
      />
      <path
        d="m20.1 5.8 2-1.15M20.8 8h2.4m-3.1 2.2 2 1.15"
        stroke="currentColor"
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  );
}

function ShapedChargePenetrationIconPaths() {
  return (
    <>
      <path
        d="M1.5 3.1h6.2v9.8H1.5V3.1Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="m2.8 4.4 4.9 3.6-4.9 3.6V4.4Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M7.7 8h9.15"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="m7.7 8 5.6-1.05v2.1L7.7 8Z"
        fill="currentColor"
        fillOpacity="0.76"
      />
      <path
        d="M16.2 1.25h3v4.55l-3 1.35v-5.9ZM16.2 8.85l3 1.35v4.55h-3v-5.9Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M16.8 7.35 22.6 8l-5.8.65v-1.3Z" fill="currentColor" />
      <path
        d="m20 5.7 2.15-1.2M20.7 8h2.55M20 10.3l2.15 1.2"
        stroke="currentColor"
        strokeLinecap="round"
        opacity="0.76"
      />
    </>
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
      height={Math.round(size * 0.68)}
      viewBox="0 0 24 16"
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
