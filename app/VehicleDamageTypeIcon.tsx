import type { ReactNode, SVGProps } from "react";

import {
  vehicleDamageTypeIconColor,
  type VehicleDamageTypeIconKind,
} from "../lib/vehicle-damage-type-icons";

interface VehicleDamageTypeIconProps
  extends Omit<SVGProps<SVGSVGElement>, "height" | "width"> {
  kind: VehicleDamageTypeIconKind;
  size?: number;
}

export const LAT_ROLE_ICON_FRAME_PATH =
  "M12 .5 19.5 8 12 15.5 4.5 8 12 .5ZM12 1.875 5.875 8 12 14.125 18.125 8 12 1.875Z";
export const LAT_ROLE_ICON_LAUNCHER_PATH =
  "M8.125 6.625h2.25l.875.75h2.625v1.25H11.25l-.875.875h-2.25L9 8.625c.375-.375.375-.875 0-1.25l-.875-.75Zm6.25.75h1.5l1 .625-1 .625h-1.5v-1.25Z";

export const KINETIC_ICON_MOTION_PATH = "M1 5.5h3M0.5 8h3M1 10.5h3";
export const KINETIC_ICON_BODY_PATH =
  "M4 8 8.2 4.7l3 1.45 3.3 1.1v1.5l-3.3 1.1-3 1.45L4 8Z";
export const KINETIC_ICON_FINS_PATH =
  "M15.8 1.25h3.1v4.5l-3.1 1.45V1.25ZM15.8 8.8l3.1 1.45v4.5h-3.1V8.8Z";
export const KINETIC_ICON_SHAFT_PATH = "M6.4 7.3h10.5L22.5 8l-5.6.7H6.4V7.3Z";
export const KINETIC_ICON_SPARKS_PATH =
  "m20.1 5.8 2-1.15M20.8 8h2.4m-3.1 2.2 2 1.15";
export const HAT_ICON_ARC_PATH =
  "M9.95 2.36A6 6 0 0 1 16.6 11.86M15 13.2A6 6 0 0 1 6.61 5.37";
export const HAT_ICON_PROJECTILE_PATH =
  "M3.25 8 3.7 7.62h.55l.2-.72.52.14.23-1.52 1.85 1.68h1.72l.68-1.72h1.72l-.67 1.72h.35l.62-1.05h.55l-.33 1.05h6.12v1.6h-6.12l.33 1.05h-.55l-.62-1.05h-.35l.67 1.72H9.45L8.77 8.8H7.05L5.2 10.48l-.23-1.52-.52.14-.2-.72H3.7L3.25 8Z";
export const HAT_ICON_TIP_PATH =
  "M18.18 7.2h1.18c.73 0 1.34.36 1.34.8s-.61.8-1.34.8h-1.18V7.2Z";
export const FRAGMENTATION_ICON_BURST_PATH =
  "m6.8 3.15.95 2.25 2.25-.95-.95 2.25 2.25.95-2.25.95.95 2.25-2.25-.95-.95 2.25-.95-2.25-2.25.95.95-2.25-2.25-.95 2.25-.95-.95-2.25 2.25.95.95-2.25Z";
export const FRAGMENTATION_ICON_PARTICLES_PATH =
  "m12.2 2.6 2.4-1.2.95 1.75-2.7.75-.65-1.3Zm3.25 4.25 3.05-1 .6 2-3.2.35-.45-1.35Zm-2.7 4.4 2.75.65-.55 2-2.55-1.25.35-1.4Zm7.2-8.4 2.15-.6.55 1.65-2.35.15-.35-1.2Zm.1 8.15 2.35.25-.3 1.7-2.2-.75.15-1.2Z";
export const FRAGMENTATION_ICON_STREAKS_PATH =
  "m11.2 5.15 2.3-1.05m-1.65 3.35 2.75-.45m-3.2 2.95 2.5 1";
export const EXPLOSIVES_ICON_BURST_PATH =
  "m12 3.15 1.05 2.65 2.55-1.25-1.25 2.55L17 8.15 14.35 9.2l1.25 2.55-2.55-1.25L12 13.15l-1.05-2.65-2.55 1.25L9.65 9.2 7 8.15 9.65 7.1 8.4 4.55l2.55 1.25L12 3.15Z";
export const EXPLOSIVES_ICON_WAVES_PATH =
  "M5.25 4.15A7.15 7.15 0 0 0 5.2 12M18.75 4.15A7.15 7.15 0 0 1 18.8 12M2.75 2.4A10.4 10.4 0 0 0 2.7 13.6M21.25 2.4a10.4 10.4 0 0 1 .05 11.2";
export const THERMITE_ICON_FLAME_PATH =
  "M9.7 1.2c1.9 2.15 3.4 3.85 2.7 6.15-.35 1.2-1.35 2.2-2.7 2.2-1.75 0-3-1.2-3-2.85 0-1.45.9-2.45 2-3.5-.05 1.2.45 1.85 1.05 2.25.5-1.2.4-2.6-.05-4.25Z";
export const THERMITE_ICON_PLATE_PATH = "M1.5 9.65h14.7M1.5 11.55h14.7";
export const THERMITE_ICON_HEAT_PATH =
  "M8.65 11.7c0 1.25-.55 1.65-.55 2.75m3.15-2.75c0 1.1.7 1.5.7 2.55m3.45-11.7-.7 1.6m3.4-.1-1.35 1.25m4.15 1.4-1.75.45";
export const THERMITE_ICON_TRAIL_PATH =
  "M17.1 10.65c2-1.05 3.45-2.25 4.75-3.7";

function KineticIconPaths() {
  return (
    <>
      <path d={KINETIC_ICON_MOTION_PATH} stroke="currentColor" strokeLinecap="round" opacity="0.52" />
      <path
        d={KINETIC_ICON_BODY_PATH}
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d={KINETIC_ICON_FINS_PATH}
        fill="currentColor"
        fillOpacity="0.24"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d={KINETIC_ICON_SHAFT_PATH} fill="currentColor" />
      <path d={KINETIC_ICON_SPARKS_PATH} stroke="currentColor" strokeLinecap="round" opacity="0.7" />
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
        d={HAT_ICON_ARC_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.08"
      />
      <g fill="currentColor" transform="rotate(45 12 8)">
        <path d={HAT_ICON_PROJECTILE_PATH} />
        <path d={HAT_ICON_TIP_PATH} />
      </g>
    </g>
  );
}

function FragmentationIconPaths() {
  return (
    <>
      <path
        d={FRAGMENTATION_ICON_BURST_PATH}
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <circle cx="6.8" cy="7.65" r="1.55" fill="currentColor" />
      <path d={FRAGMENTATION_ICON_PARTICLES_PATH} fill="currentColor" />
      <path d={FRAGMENTATION_ICON_STREAKS_PATH} stroke="currentColor" strokeLinecap="round" opacity="0.58" />
    </>
  );
}

function ExplosivesIconPaths() {
  return (
    <g data-icon-motif="shockwave">
      <path
        d={EXPLOSIVES_ICON_BURST_PATH}
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d={EXPLOSIVES_ICON_WAVES_PATH}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.15"
        opacity="0.78"
      />
      <circle cx="12" cy="8.15" r="1.45" fill="currentColor" />
    </g>
  );
}

function ThermiteIconPaths() {
  return (
    <>
      <path
        d={THERMITE_ICON_FLAME_PATH}
        fill="currentColor"
        fillOpacity="0.28"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d={THERMITE_ICON_PLATE_PATH} stroke="currentColor" strokeLinecap="round" />
      <path d={THERMITE_ICON_HEAT_PATH} stroke="currentColor" strokeLinecap="round" opacity="0.72" />
      <path d={THERMITE_ICON_TRAIL_PATH} stroke="currentColor" strokeLinecap="round" strokeDasharray="1.1 1.4" opacity="0.48" />
    </>
  );
}

function paintCanvasPath(
  context: CanvasRenderingContext2D,
  pathData: string,
  {
    fillOpacity = null,
    fillRule = "nonzero",
    strokeOpacity = null,
    strokeWidth = 1,
    lineCap = "butt",
    lineJoin = "miter",
    lineDash = [],
  }: {
    fillOpacity?: number | null;
    fillRule?: CanvasFillRule;
    strokeOpacity?: number | null;
    strokeWidth?: number;
    lineCap?: CanvasLineCap;
    lineJoin?: CanvasLineJoin;
    lineDash?: number[];
  },
) {
  const path = new Path2D(pathData);
  if (fillOpacity !== null) {
    context.save();
    context.globalAlpha = fillOpacity;
    context.fill(path, fillRule);
    context.restore();
  }
  if (strokeOpacity !== null) {
    context.save();
    context.globalAlpha = strokeOpacity;
    context.lineWidth = strokeWidth;
    context.lineCap = lineCap;
    context.lineJoin = lineJoin;
    context.setLineDash(lineDash);
    context.stroke(path);
    context.restore();
  }
}

export function paintVehicleDamageTypeIconCanvas(
  context: CanvasRenderingContext2D,
  kind: VehicleDamageTypeIconKind,
  color: string = vehicleDamageTypeIconColor(kind),
) {
  context.save();
  context.fillStyle = color;
  context.strokeStyle = color;

  if (kind === "kinetic" || kind === "small-arms") {
    paintCanvasPath(context, KINETIC_ICON_MOTION_PATH, {
      strokeOpacity: 0.52,
      lineCap: "round",
    });
    paintCanvasPath(context, KINETIC_ICON_BODY_PATH, {
      fillOpacity: 0.16,
      strokeOpacity: 1,
      lineJoin: "round",
    });
    paintCanvasPath(context, KINETIC_ICON_FINS_PATH, {
      fillOpacity: 0.24,
      strokeOpacity: 1,
      lineJoin: "round",
    });
    paintCanvasPath(context, KINETIC_ICON_SHAFT_PATH, { fillOpacity: 1 });
    paintCanvasPath(context, KINETIC_ICON_SPARKS_PATH, {
      strokeOpacity: 0.7,
      lineCap: "round",
    });
  } else if (kind === "heat") {
    paintCanvasPath(context, LAT_ROLE_ICON_FRAME_PATH, {
      fillOpacity: 1,
      fillRule: "evenodd",
    });
    paintCanvasPath(context, LAT_ROLE_ICON_LAUNCHER_PATH, {
      fillOpacity: 1,
    });
  } else if (kind === "hat") {
    paintCanvasPath(context, HAT_ICON_ARC_PATH, {
      strokeOpacity: 1,
      strokeWidth: 1.08,
    });
    context.save();
    context.translate(12, 8);
    context.rotate(Math.PI / 4);
    context.translate(-12, -8);
    paintCanvasPath(context, HAT_ICON_PROJECTILE_PATH, { fillOpacity: 1 });
    paintCanvasPath(context, HAT_ICON_TIP_PATH, { fillOpacity: 1 });
    context.restore();
  } else if (kind === "fragmentation") {
    paintCanvasPath(context, FRAGMENTATION_ICON_BURST_PATH, {
      fillOpacity: 0.22,
      strokeOpacity: 1,
      lineJoin: "round",
    });
    context.beginPath();
    context.arc(6.8, 7.65, 1.55, 0, Math.PI * 2);
    context.fill();
    paintCanvasPath(context, FRAGMENTATION_ICON_PARTICLES_PATH, {
      fillOpacity: 1,
    });
    paintCanvasPath(context, FRAGMENTATION_ICON_STREAKS_PATH, {
      strokeOpacity: 0.58,
      lineCap: "round",
    });
  } else if (kind === "thermite") {
    paintCanvasPath(context, THERMITE_ICON_FLAME_PATH, {
      fillOpacity: 0.28,
      strokeOpacity: 1,
      lineJoin: "round",
    });
    paintCanvasPath(context, THERMITE_ICON_PLATE_PATH, {
      strokeOpacity: 1,
      lineCap: "round",
    });
    paintCanvasPath(context, THERMITE_ICON_HEAT_PATH, {
      strokeOpacity: 0.72,
      lineCap: "round",
    });
    paintCanvasPath(context, THERMITE_ICON_TRAIL_PATH, {
      strokeOpacity: 0.48,
      lineCap: "round",
      lineDash: [1.1, 1.4],
    });
  } else {
    paintCanvasPath(context, EXPLOSIVES_ICON_BURST_PATH, {
      fillOpacity: 0.3,
      strokeOpacity: 1,
      lineJoin: "round",
      strokeWidth: 1.05,
    });
    paintCanvasPath(context, EXPLOSIVES_ICON_WAVES_PATH, {
      strokeOpacity: 0.78,
      strokeWidth: 1.15,
      lineCap: "round",
    });
    context.beginPath();
    context.arc(12, 8.15, 1.45, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

export function VehicleDamageTypeIcon({
  kind,
  size = 18,
  className,
  style,
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
      style={{ color: vehicleDamageTypeIconColor(kind), ...style }}
      focusable="false"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}
