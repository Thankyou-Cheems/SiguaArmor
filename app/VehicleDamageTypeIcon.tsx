import type { ReactNode, SVGProps } from "react";

import type { VehicleDamageTypeIconKind } from "../lib/vehicle-damage-type-icons";

interface VehicleDamageTypeIconProps
  extends Omit<SVGProps<SVGSVGElement>, "height" | "width"> {
  kind: VehicleDamageTypeIconKind;
  size?: number;
}

export const LAT_ROLE_ICON_FRAME_PATH =
  "M12 .5 19.5 8 12 15.5 4.5 8 12 .5ZM12 1.875 5.875 8 12 14.125 18.125 8 12 1.875Z";
export const LAT_ROLE_ICON_LAUNCHER_PATH =
  "M8.125 6.625h2.25l.875.75h2.625v1.25H11.25l-.875.875h-2.25L9 8.625c.375-.375.375-.875 0-1.25l-.875-.75Zm6.25.75h1.5l1 .625-1 .625h-1.5v-1.25Z";

function KineticIconPaths() {
  return (
    <>
      <path d="M1 5.5h3M0.5 8h3M1 10.5h3" stroke="currentColor" strokeLinecap="round" opacity="0.52" />
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
      <path d="M6.4 7.3h10.5L22.5 8l-5.6.7H6.4V7.3Z" fill="currentColor" />
      <path d="m20.1 5.8 2-1.15M20.8 8h2.4m-3.1 2.2 2 1.15" stroke="currentColor" strokeLinecap="round" opacity="0.7" />
    </>
  );
}

function HeatIconPaths() {
  return (
    <g data-icon-motif="lat-role-official">
      <path
        d={LAT_ROLE_ICON_FRAME_PATH}
        fill="currentColor"
        fillRule="evenodd"
      />
      <path d={LAT_ROLE_ICON_LAUNCHER_PATH} fill="currentColor" />
    </g>
  );
}

function HatIconPaths() {
  return (
    <g data-icon-motif="hat-role-official">
      <path
        d="M9.95 2.36A6 6 0 0 1 16.6 11.86M15 13.2A6 6 0 0 1 6.61 5.37"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.08"
      />
      <g fill="currentColor" transform="rotate(45 12 8)">
        <path d="M3.25 8 3.7 7.62h.55l.2-.72.52.14.23-1.52 1.85 1.68h1.72l.68-1.72h1.72l-.67 1.72h.35l.62-1.05h.55l-.33 1.05h6.12v1.6h-6.12l.33 1.05h-.55l-.62-1.05h-.35l.67 1.72H9.45L8.77 8.8H7.05L5.2 10.48l-.23-1.52-.52.14-.2-.72H3.7L3.25 8Z" />
        <path d="M18.18 7.2h1.18c.73 0 1.34.36 1.34.8s-.61.8-1.34.8h-1.18V7.2Z" />
      </g>
    </g>
  );
}

function FragmentationIconPaths() {
  return (
    <>
      <path
        d="m6.8 3.15.95 2.25 2.25-.95-.95 2.25 2.25.95-2.25.95.95 2.25-2.25-.95-.95 2.25-.95-2.25-2.25.95.95-2.25-2.25-.95 2.25-.95-.95-2.25 2.25.95.95-2.25Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <circle cx="6.8" cy="7.65" r="1.55" fill="currentColor" />
      <path d="m12.2 2.6 2.4-1.2.95 1.75-2.7.75-.65-1.3Zm3.25 4.25 3.05-1 .6 2-3.2.35-.45-1.35Zm-2.7 4.4 2.75.65-.55 2-2.55-1.25.35-1.4Zm7.2-8.4 2.15-.6.55 1.65-2.35.15-.35-1.2Zm.1 8.15 2.35.25-.3 1.7-2.2-.75.15-1.2Z" fill="currentColor" />
      <path d="m11.2 5.15 2.3-1.05m-1.65 3.35 2.75-.45m-3.2 2.95 2.5 1" stroke="currentColor" strokeLinecap="round" opacity="0.58" />
    </>
  );
}

function ExplosivesIconPaths() {
  return (
    <g data-icon-motif="bomb">
      <circle
        cx="9.35"
        cy="9.65"
        r="5.15"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="m12.65 5.8 2.1-2.3 1.85 1.65-2.15 2.25-1.8-1.6Z"
        fill="currentColor"
        fillOpacity="0.72"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M15.55 4c.65-1.55 1.95-2.25 3.45-1.65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.25"
      />
      <path
        d="m19.55.8.25 1.35m2.35-.8-1.15 1m1.65 1.35-1.4-.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.15"
      />
      <path
        d="M6.15 8.25c.45-1.35 1.55-2.2 2.95-2.45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
        opacity="0.72"
      />
    </g>
  );
}

function ThermiteIconPaths() {
  return (
    <>
      <path
        d="M9.7 1.2c1.9 2.15 3.4 3.85 2.7 6.15-.35 1.2-1.35 2.2-2.7 2.2-1.75 0-3-1.2-3-2.85 0-1.45.9-2.45 2-3.5-.05 1.2.45 1.85 1.05 2.25.5-1.2.4-2.6-.05-4.25Z"
        fill="currentColor"
        fillOpacity="0.28"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M1.5 9.65h14.7M1.5 11.55h14.7" stroke="currentColor" strokeLinecap="round" />
      <path d="M8.65 11.7c0 1.25-.55 1.65-.55 2.75m3.15-2.75c0 1.1.7 1.5.7 2.55m3.45-11.7-.7 1.6m3.4-.1-1.35 1.25m4.15 1.4-1.75.45" stroke="currentColor" strokeLinecap="round" opacity="0.72" />
      <path d="M17.1 10.65c2-1.05 3.45-2.25 4.75-3.7" stroke="currentColor" strokeLinecap="round" strokeDasharray="1.1 1.4" opacity="0.48" />
    </>
  );
}

export function VehicleDamageTypeIcon({
  kind,
  size = 18,
  className,
  ...svgProps
}: VehicleDamageTypeIconProps) {
  const paths = {
    kinetic: <KineticIconPaths />,
    "small-arms": <KineticIconPaths />,
    generic: <ExplosivesIconPaths />,
    fragmentation: <FragmentationIconPaths />,
    heat: <HeatIconPaths />,
    hat: <HatIconPaths />,
    explosives: <ExplosivesIconPaths />,
    thermite: <ThermiteIconPaths />,
  } satisfies Record<VehicleDamageTypeIconKind, ReactNode>;

  return (
    <svg
      {...svgProps}
      className={["vehicle-damage-type-icon", className].filter(Boolean).join(" ")}
      data-damage-type-kind={kind}
      width={size}
      height={Math.round(size * 0.68)}
      viewBox="0 0 24 16"
      fill="none"
      focusable="false"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}
