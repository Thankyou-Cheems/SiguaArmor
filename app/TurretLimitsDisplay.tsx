"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  TURRET_YAW_DETENTS,
  clampTurretPitch,
  clampTurretYaw,
  normalizeTurretYaw,
  resolveTurretYawDetent,
  turretYawFromCompassVector,
  turretPitchWindowAtYaw,
  turretYawBounds,
} from "../lib/turret-articulation";
import type { ReferenceTurret } from "./catalog-types";

interface TurretLimitCompassProps {
  turret: ReferenceTurret;
  yawDegrees: number;
  size?: number;
  compact?: boolean;
  disabled?: boolean;
  activeIndicatorKind?: TurretPreviewIndicatorKind;
  orientationIndicators?: TurretOrientationIndicator[];
  onYawChange?: (yawDegrees: number) => void;
  onInteractionEnd?: () => void;
}

export type TurretPreviewIndicatorKind =
  | "main-turret"
  | "weapon-station"
  | "machine-gun";

export interface TurretOrientationIndicator {
  id: string;
  label: string;
  kind: TurretPreviewIndicatorKind;
  yawDegrees: number;
  active: boolean;
}

export interface TurretPreviewStation {
  id: string;
  label: string;
  equipmentLabel: string;
  turret: ReferenceTurret;
  indicatorKind: TurretPreviewIndicatorKind;
  yawAvailable: boolean;
  pitchAvailable: boolean;
}

interface TurretPreviewControlsProps {
  stations: TurretPreviewStation[];
  orientationIndicators: TurretOrientationIndicator[];
  activeStationId: string;
  yawDegrees: number;
  pitchDegrees: number;
  onStationChange: (stationId: string) => void;
  onYawChange: (yawDegrees: number) => void;
  onPitchChange: (pitchDegrees: number) => void;
  onReset: () => void;
  onInteractionEnd: () => void;
}

const COMPASS_SAMPLE_STEP = 5;
const COMPASS_MIN_DEGREES = -180;
const COMPASS_MAX_DEGREES = 180;
const DEPRESSION_INNER_RADIUS = 34;
const DEPRESSION_OUTER_RADIUS = 43;
const ELEVATION_INNER_RADIUS = 25;
const ELEVATION_OUTER_RADIUS = 32;

function rounded(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(value);
}

function angleLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${rounded(normalized)}°`;
}

function polarPoint(angleDegrees: number, radius: number) {
  const angle = angleDegrees * Math.PI / 180;
  return {
    x: 50 + Math.sin(angle) * radius,
    y: 50 - Math.cos(angle) * radius,
  };
}

function annularSectorPath(
  startDegrees: number,
  endDegrees: number,
  innerRadius: number,
  outerRadius: number,
) {
  const spanDegrees = Math.min(
    360,
    Math.max(0, endDegrees - startDegrees),
  );
  const largeArc = spanDegrees > 180 ? 1 : 0;
  const outerStart = polarPoint(startDegrees, outerRadius);
  const outerEnd = polarPoint(endDegrees, outerRadius);
  const innerEnd = polarPoint(endDegrees, innerRadius);
  const innerStart = polarPoint(startDegrees, innerRadius);
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function depressionColor(minPitchDegrees: number) {
  const depth = Math.min(Math.max(-minPitchDegrees / 12, 0), 1);
  const hue = 18 + depth * 104;
  const lightness = 42 + depth * 6;
  return `hsl(${hue.toFixed(0)} 68% ${lightness.toFixed(0)}%)`;
}

function elevationColor(maxPitchDegrees: number) {
  const height = Math.min(Math.max(maxPitchDegrees / 45, 0), 1);
  const hue = 194 + height * 18;
  const lightness = 42 + height * 13;
  return `hsl(${hue.toFixed(0)} 70% ${lightness.toFixed(0)}%)`;
}

function turretProfileSamples(turret: ReferenceTurret) {
  const bounds = turretYawBounds(turret);
  const startDegrees = bounds.continuous
    ? COMPASS_MIN_DEGREES
    : Math.max(COMPASS_MIN_DEGREES, bounds.minDegrees);
  const endDegrees = bounds.continuous
    ? COMPASS_MAX_DEGREES
    : Math.min(COMPASS_MAX_DEGREES, bounds.maxDegrees);
  const sampleCount = Math.ceil(
    Math.max(0, endDegrees - startDegrees) / COMPASS_SAMPLE_STEP,
  );
  return Array.from({ length: sampleCount }, (_, index) => {
    const segmentStartDegrees =
      startDegrees + index * COMPASS_SAMPLE_STEP;
    const segmentEndDegrees = Math.min(
      endDegrees,
      segmentStartDegrees + COMPASS_SAMPLE_STEP,
    );
    const yawDegrees =
      segmentStartDegrees + (segmentEndDegrees - segmentStartDegrees) / 2;
    const window = turretPitchWindowAtYaw(turret, yawDegrees);
    return window
      ? {
          startDegrees: segmentStartDegrees,
          endDegrees: segmentEndDegrees,
          yawDegrees,
          ...window,
        }
      : null;
  }).filter((sample): sample is NonNullable<typeof sample> => sample !== null);
}

function profileSummary(turret: ReferenceTurret) {
  const samples = turretProfileSamples(turret);
  if (samples.length === 0) return null;
  return {
    deepestDepression: Math.min(...samples.map((sample) => sample.minPitchDegrees)),
    shallowestDepression: Math.max(...samples.map((sample) => sample.minPitchDegrees)),
    highestElevation: Math.max(...samples.map((sample) => sample.maxPitchDegrees)),
    lowestElevation: Math.min(...samples.map((sample) => sample.maxPitchDegrees)),
    directional: samples.some(
      (sample) =>
        Math.abs(sample.minPitchDegrees - samples[0].minPitchDegrees) > 0.05 ||
        Math.abs(sample.maxPitchDegrees - samples[0].maxPitchDegrees) > 0.05,
    ),
  };
}

function authorityLabel(turret: ReferenceTurret) {
  return turret.limits?.authority === "editor" ? "编辑器实测" : "百科基线";
}

function authorityNote(turret: ReferenceTurret) {
  if (turret.limits?.authority === "editor") {
    return turret.limits.sourceBuildId
      ? `Squad Editor ${turret.limits.sourceBuildId} · 不同方位间线性插值`
      : "Squad Editor 反射数据 · 不同方位间线性插值";
  }
  return "旧百科只提供单一俯仰范围；环图暂按全向同值展示，水平限界与分方位变化仍待编辑器核验。";
}

export function TurretLimitCompass({
  turret,
  yawDegrees,
  size = 176,
  compact = false,
  disabled = false,
  activeIndicatorKind = "main-turret",
  orientationIndicators = [],
  onYawChange,
  onInteractionEnd,
}: TurretLimitCompassProps) {
  const patternIdPrefix = useId().replaceAll(":", "");
  const compassRef = useRef<SVGSVGElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeDetentRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const samples = useMemo(() => turretProfileSamples(turret), [turret]);
  const pointer = polarPoint(yawDegrees, 44);
  const current = turretPitchWindowAtYaw(turret, yawDegrees);
  const interactive = typeof onYawChange === "function";
  const enabled = interactive && !disabled;
  const bounds = turretYawBounds(turret);
  const yawSpanDegrees = Math.min(
    360,
    Math.max(0, bounds.maxDegrees - bounds.minDegrees),
  );
  const yawLimited = !bounds.continuous;
  const hasLockedArc = yawLimited && yawSpanDegrees < 359.95;
  const minimumYawInner = polarPoint(bounds.minDegrees, 23);
  const minimumYawOuter = polarPoint(bounds.minDegrees, 45);
  const minimumYawLabel = polarPoint(bounds.minDegrees, 47.5);
  const maximumYawInner = polarPoint(bounds.maxDegrees, 23);
  const maximumYawOuter = polarPoint(bounds.maxDegrees, 45);
  const maximumYawLabel = polarPoint(bounds.maxDegrees, 47.5);
  const availableDetents = useMemo(
    () => TURRET_YAW_DETENTS.filter((detent) => (
      Math.abs(
        normalizeTurretYaw(clampTurretYaw(turret, detent) - detent),
      ) < 0.001
    )),
    [turret],
  );
  const accessibleLabel = current
    ? `炮塔当前朝向 ${angleLabel(yawDegrees)}，可俯至 ${angleLabel(current.minPitchDegrees)}，可仰至 ${angleLabel(current.maxPitchDegrees)}${
        yawLimited
          ? `，水平可转 ${angleLabel(bounds.minDegrees)} 至 ${angleLabel(bounds.maxDegrees)}`
          : ""
      }`
    : "炮塔俯仰限界未知";
  const activeCardinal = [
    { label: "后", degrees: -180 },
    { label: "左", degrees: -90 },
    { label: "前", degrees: 0 },
    { label: "右", degrees: 90 },
  ].find(
    ({ degrees }) => Math.abs(normalizeTurretYaw(yawDegrees - degrees)) < 0.05,
  )?.label;

  const updateFromPointer = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (!enabled || activePointerIdRef.current !== event.pointerId) return;
    const boundsRect = compassRef.current?.getBoundingClientRect();
    if (!boundsRect) return;
    const horizontalOffset =
      event.clientX - (boundsRect.left + boundsRect.width / 2);
    const verticalOffset =
      event.clientY - (boundsRect.top + boundsRect.height / 2);
    if (Math.hypot(horizontalOffset, verticalOffset) < boundsRect.width * 0.08) {
      return;
    }
    const detent = resolveTurretYawDetent(
      turretYawFromCompassVector(horizontalOffset, verticalOffset),
      activeDetentRef.current,
      availableDetents,
    );
    activeDetentRef.current = detent.detentDegrees;
    onYawChange(clampTurretYaw(turret, detent.yawDegrees));
  };

  const finishPointerInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    activeDetentRef.current = null;
    setDragging(false);
    onInteractionEnd?.();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!enabled) return;
    let nextYawDegrees: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextYawDegrees = yawDegrees + 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextYawDegrees = yawDegrees - 1;
        break;
      case "PageUp":
        nextYawDegrees = yawDegrees + 15;
        break;
      case "PageDown":
        nextYawDegrees = yawDegrees - 15;
        break;
      case "Home":
        nextYawDegrees = bounds.minDegrees;
        break;
      case "End":
        nextYawDegrees = bounds.maxDegrees;
        break;
      default:
        return;
    }
    event.preventDefault();
    onYawChange(clampTurretYaw(turret, nextYawDegrees));
  };

  return (
    <svg
      ref={compassRef}
      className="turret-limit-compass"
      data-compact={compact}
      data-interactive={interactive || undefined}
      data-dragging={dragging || undefined}
      data-yaw-limited={yawLimited || undefined}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={interactive ? "slider" : "img"}
      aria-label={interactive ? "炮塔方位，拖动圆盘调整" : accessibleLabel}
      aria-valuemin={interactive ? bounds.minDegrees : undefined}
      aria-valuemax={interactive ? bounds.maxDegrees : undefined}
      aria-valuenow={interactive ? yawDegrees : undefined}
      aria-valuetext={
        interactive
          ? `${activeCardinal ? `${activeCardinal}，` : ""}${angleLabel(yawDegrees)}`
          : undefined
      }
      aria-disabled={interactive ? disabled : undefined}
      tabIndex={enabled ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onKeyUp={onInteractionEnd}
      onBlur={onInteractionEnd}
      onPointerDown={(event) => {
        if (!enabled || activePointerIdRef.current !== null) return;
        activePointerIdRef.current = event.pointerId;
        activeDetentRef.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        updateFromPointer(event);
      }}
      onPointerMove={updateFromPointer}
      onPointerUp={(event) => {
        updateFromPointer(event);
        finishPointerInteraction(event);
      }}
      onPointerCancel={finishPointerInteraction}
    >
      <defs>
        <pattern
          id={`${patternIdPrefix}-yaw-locked`}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect
            className="turret-limit-compass__locked-fill"
            width="4"
            height="4"
          />
          <path
            className="turret-limit-compass__locked-stripe"
            d="M-1 1 1-1M0 4 4 0M3 5 5 3"
          />
        </pattern>
      </defs>
      <circle className="turret-limit-compass__backdrop" cx="50" cy="50" r="46" />
      <circle
        className="turret-limit-compass__range-track"
        data-kind="depression"
        cx="50"
        cy="50"
        r="38.5"
      />
      <circle
        className="turret-limit-compass__range-track"
        data-kind="elevation"
        cx="50"
        cy="50"
        r="28.5"
      />
      {hasLockedArc ? (
        <path
          className="turret-limit-compass__yaw-unavailable"
          d={annularSectorPath(
            bounds.maxDegrees,
            bounds.minDegrees + 360,
            24,
            44,
          )}
          fill={`url(#${patternIdPrefix}-yaw-locked)`}
          aria-hidden="true"
        />
      ) : null}
      {samples.map((sample) => (
        <g
          className="turret-limit-compass__pitch-zones"
          key={sample.startDegrees}
          aria-hidden="true"
        >
          <path
            className="turret-limit-compass__pitch-sector"
            data-kind="depression"
            d={annularSectorPath(
              sample.startDegrees,
              sample.endDegrees,
              DEPRESSION_INNER_RADIUS,
              DEPRESSION_OUTER_RADIUS,
            )}
            fill={depressionColor(sample.minPitchDegrees)}
          >
            <title>
              {`${angleLabel(sample.yawDegrees)}：俯角下限 ${angleLabel(sample.minPitchDegrees)}`}
            </title>
          </path>
          <path
            className="turret-limit-compass__pitch-sector"
            data-kind="elevation"
            d={annularSectorPath(
              sample.startDegrees,
              sample.endDegrees,
              ELEVATION_INNER_RADIUS,
              ELEVATION_OUTER_RADIUS,
            )}
            fill={elevationColor(sample.maxPitchDegrees)}
          >
            <title>
              {`${angleLabel(sample.yawDegrees)}：仰角上限 ${angleLabel(sample.maxPitchDegrees)}`}
            </title>
          </path>
        </g>
      ))}
      {yawLimited ? (
        <path
          className="turret-limit-compass__yaw-outline"
          d={annularSectorPath(
            bounds.minDegrees,
            bounds.maxDegrees,
            24,
            44,
          )}
          aria-hidden="true"
        />
      ) : null}
      <circle className="turret-limit-compass__guide" cx="50" cy="50" r="40" />
      <circle className="turret-limit-compass__guide" cx="50" cy="50" r="29" />
      {yawLimited ? (
        <g className="turret-limit-compass__yaw-limits" aria-hidden="true">
          <line
            x1={minimumYawInner.x}
            y1={minimumYawInner.y}
            x2={minimumYawOuter.x}
            y2={minimumYawOuter.y}
          />
          <line
            x1={maximumYawInner.x}
            y1={maximumYawInner.y}
            x2={maximumYawOuter.x}
            y2={maximumYawOuter.y}
          />
          <text
            x={minimumYawLabel.x}
            y={minimumYawLabel.y}
            textAnchor={minimumYawLabel.x < 48 ? "end" : minimumYawLabel.x > 52 ? "start" : "middle"}
          >
            {angleLabel(bounds.minDegrees)}
          </text>
          <text
            x={maximumYawLabel.x}
            y={maximumYawLabel.y}
            textAnchor={maximumYawLabel.x < 48 ? "end" : maximumYawLabel.x > 52 ? "start" : "middle"}
          >
            {angleLabel(bounds.maxDegrees)}
          </text>
          <text
            className="turret-limit-compass__yaw-span"
            x="50"
            y="79"
            textAnchor="middle"
          >
            可转 {rounded(yawSpanDegrees, 0)}°
          </text>
        </g>
      ) : null}
      <g className="turret-limit-compass__detents" aria-hidden="true">
        {availableDetents.map((detent) => {
          const inner = polarPoint(detent, 43);
          const outer = polarPoint(detent, 47);
          return (
            <line
              key={detent}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              data-active={
                Math.abs(normalizeTurretYaw(yawDegrees - detent)) < 0.05 ||
                undefined
              }
            />
          );
        })}
      </g>
      <g className="turret-limit-compass__vehicle" aria-hidden="true">
        <path d="M43 65V42l7-9 7 9v23l-7 4z" />
        <path d="M50 33V22" />
        <path d="m46 27 4-5 4 5" />
      </g>
      {interactive && orientationIndicators.length > 0 ? (
        <g className="turret-limit-compass__orientations" aria-hidden="true">
          {orientationIndicators.map((indicator) => {
            const position = polarPoint(indicator.yawDegrees, 26.5);
            return (
              <g
                key={indicator.id}
                className="turret-limit-compass__orientation"
                data-kind={indicator.kind}
                data-active={indicator.active || undefined}
                transform={`translate(${position.x.toFixed(3)} ${position.y.toFixed(3)}) rotate(${indicator.yawDegrees.toFixed(3)})`}
              >
                {indicator.kind === "main-turret" ? (
                  <>
                    <path d="M-3 2 0-4 3 2Z" />
                    <path d="M0-4V-8" />
                  </>
                ) : indicator.kind === "weapon-station" ? (
                  <>
                    <path d="M0-4 4 0 0 4-4 0Z" />
                    <path d="M-2 0H2M0-2V2" />
                  </>
                ) : (
                  <>
                    <circle cx="0" cy="-1" r="1.1" />
                    <path d="M-3 2 0-2 3 2M-3 5 0 1 3 5" />
                  </>
                )}
              </g>
            );
          })}
        </g>
      ) : null}
      <g
        className="turret-limit-compass__pointer"
        data-kind={activeIndicatorKind}
        aria-hidden="true"
      >
        <line x1="50" y1="50" x2={pointer.x} y2={pointer.y} />
        <circle cx={pointer.x} cy={pointer.y} r="1.8" />
        {interactive ? (
          <circle
            className="turret-limit-compass__handle"
            cx={pointer.x}
            cy={pointer.y}
            r="3.4"
          />
        ) : null}
      </g>
      <g className="turret-limit-compass__labels" aria-hidden="true">
        <text x="50" y="7">前</text>
        <text x="94" y="52">右</text>
        <text x="50" y="97">后</text>
        <text x="6" y="52">左</text>
      </g>
      {interactive ? (
        <circle
          className="turret-limit-compass__interaction-surface"
          cx="50"
          cy="50"
          r="48"
          aria-hidden="true"
        />
      ) : null}
    </svg>
  );
}

function pitchRangeLabel(minimum: number, maximum: number) {
  return Math.abs(maximum - minimum) < 0.05
    ? angleLabel(minimum)
    : `${angleLabel(minimum)}～${angleLabel(maximum)}`;
}

export function TurretStationIndicator({
  turret,
  stationLabel,
}: {
  turret: ReferenceTurret;
  stationLabel: string;
}) {
  const bounds = turretYawBounds(turret);
  const yawDegrees = clampTurretYaw(turret, 0);
  const current = turretPitchWindowAtYaw(turret, yawDegrees);
  const summary = profileSummary(turret);
  if (!current || !summary) return null;

  return (
    <figure
      className="turret-station-indicator"
      data-authority={turret.limits?.authority ?? "reference"}
      data-yaw-limited={!bounds.continuous || undefined}
      aria-label={`${stationLabel}武器站射界指示器`}
    >
      <TurretLimitCompass
        turret={turret}
        yawDegrees={yawDegrees}
        size={108}
        compact
      />
      <figcaption>
        <span className="turret-station-indicator__heading">
          <strong>{bounds.continuous ? "360° 全向" : "受限射界"}</strong>
        </span>
        <dl>
          <div>
            <dt>水平</dt>
            <dd>
              {bounds.continuous
                ? "全向"
                : `${angleLabel(bounds.minDegrees)}～${angleLabel(bounds.maxDegrees)}`}
            </dd>
          </div>
          <div>
            <dt>俯角</dt>
            <dd>
              {pitchRangeLabel(
                summary.deepestDepression,
                summary.shallowestDepression,
              )}
            </dd>
          </div>
          <div>
            <dt>仰角</dt>
            <dd>
              {pitchRangeLabel(
                summary.lowestElevation,
                summary.highestElevation,
              )}
            </dd>
          </div>
        </dl>
        <span className="turret-station-indicator__legend" aria-label="射界色块说明">
          <i data-kind="depression" />外圈俯角
          <i data-kind="elevation" />内圈仰角
        </span>
      </figcaption>
    </figure>
  );
}

export function TurretEnvelopeCard({
  turret,
  stationLabel,
}: {
  turret: ReferenceTurret;
  stationLabel: string;
}) {
  const bounds = turretYawBounds(turret);
  const [yawDegrees, setYawDegrees] = useState(0);
  const current = turretPitchWindowAtYaw(turret, yawDegrees);
  const summary = useMemo(() => profileSummary(turret), [turret]);

  useEffect(() => {
    setYawDegrees((value) => clampTurretYaw(turret, value));
  }, [turret]);

  if (!current || !summary) return null;

  return (
    <section
      className="turret-envelope-card"
      data-authority={turret.limits?.authority ?? "reference"}
      data-directional={summary.directional}
      aria-label={`${stationLabel}${bounds.continuous ? "全向" : "受限"}炮塔限界`}
    >
      <header className="turret-envelope-card__heading">
        <span>
          <strong>{bounds.continuous ? "全向射界" : "受限射界"}</strong>
          <small>{stationLabel}</small>
        </span>
        <em>{authorityLabel(turret)}</em>
      </header>
      <div className="turret-envelope-card__body">
        <TurretLimitCompass turret={turret} yawDegrees={yawDegrees} />
        <div className="turret-envelope-card__readout">
          <div className="turret-envelope-card__current">
            <span>当前朝向</span>
            <strong>{angleLabel(yawDegrees)}</strong>
            <dl>
              <div><dt>可俯至</dt><dd>{angleLabel(current.minPitchDegrees)}</dd></div>
              <div><dt>可仰至</dt><dd>{angleLabel(current.maxPitchDegrees)}</dd></div>
            </dl>
          </div>
          <label className="turret-envelope-card__yaw">
            <span>
              炮塔方位
              <small>{bounds.verified ? "编辑器限界" : "预览范围"}</small>
            </span>
            <input
              type="range"
              min={bounds.minDegrees}
              max={bounds.maxDegrees}
              step="1"
              value={yawDegrees}
              onChange={(event) => {
                setYawDegrees(clampTurretYaw(turret, Number(event.currentTarget.value)));
              }}
              aria-label={`${stationLabel}炮塔方位`}
            />
            <span className="turret-envelope-card__cardinals" aria-hidden="true">
              <i>左</i><i>前</i><i>右 / 后</i>
            </span>
          </label>
          <dl className="turret-envelope-card__summary">
            <div>
              <dt>最深俯角</dt>
              <dd>{angleLabel(summary.deepestDepression)}</dd>
            </div>
            <div>
              <dt>最受限俯角</dt>
              <dd>{angleLabel(summary.shallowestDepression)}</dd>
            </div>
            <div>
              <dt>最高仰角</dt>
              <dd>{angleLabel(summary.highestElevation)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="turret-envelope-card__legend" aria-label="射界图图例">
        <span><i data-kind="depression" />外圈色块 · 俯角下限</span>
        <span><i data-kind="elevation" />内圈色块 · 仰角上限</span>
        {!bounds.continuous ? (
          <span><i data-kind="yaw-range" />亮区 · 可旋转范围</span>
        ) : null}
      </div>
      <p className="turret-envelope-card__source" role="note">
        {authorityNote(turret)}
      </p>
    </section>
  );
}

export function TurretPreviewControls({
  stations,
  orientationIndicators,
  activeStationId,
  yawDegrees,
  pitchDegrees,
  onStationChange,
  onYawChange,
  onPitchChange,
  onReset,
  onInteractionEnd,
}: TurretPreviewControlsProps) {
  const pitchPointerIdRef = useRef<number | null>(null);
  const activeStation = stations.find((station) => station.id === activeStationId) ?? stations[0];
  if (!activeStation) return null;
  const { turret } = activeStation;
  const pitchWindow = turretPitchWindowAtYaw(turret, yawDegrees);
  if (!pitchWindow) return null;
  const pitchSpan =
    pitchWindow.maxPitchDegrees - pitchWindow.minPitchDegrees;
  const pitchProgress = pitchSpan > 0
    ? Math.min(
        100,
        Math.max(
          0,
          ((pitchDegrees - pitchWindow.minPitchDegrees) / pitchSpan) * 100,
        ),
      )
    : 0;

  const updatePitchFromPointer = (
    event: ReactPointerEvent<HTMLInputElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.height <= 0) return;
    const progress = Math.min(
      1,
      Math.max(0, (bounds.bottom - event.clientY) / bounds.height),
    );
    const rawPitch =
      pitchWindow.minPitchDegrees +
      progress *
        (pitchWindow.maxPitchDegrees - pitchWindow.minPitchDegrees);
    onPitchChange(
      clampTurretPitch(
        turret,
        yawDegrees,
        Math.round(rawPitch * 10) / 10,
      ),
    );
  };

  const finishPitchPointer = (
    event: ReactPointerEvent<HTMLInputElement>,
  ) => {
    if (pitchPointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pitchPointerIdRef.current = null;
    onInteractionEnd();
  };

  const handlePitchKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    let nextPitch: number | null = null;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nextPitch = pitchDegrees + 0.1;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nextPitch = pitchDegrees - 0.1;
        break;
      case "PageUp":
        nextPitch = pitchDegrees + 1;
        break;
      case "PageDown":
        nextPitch = pitchDegrees - 1;
        break;
      case "Home":
        nextPitch = pitchWindow.minPitchDegrees;
        break;
      case "End":
        nextPitch = pitchWindow.maxPitchDegrees;
        break;
      default:
        return;
    }
    event.preventDefault();
    onPitchChange(clampTurretPitch(turret, yawDegrees, nextPitch));
  };

  const sourceStyle = {
    "--turret-source-tone":
      turret.limits?.authority === "editor" ? "var(--brand)" : "rgba(241, 239, 226, 0.62)",
  } as CSSProperties;

  return (
    <aside
      className="turret-preview-controls"
      data-authority={turret.limits?.authority ?? "reference"}
      data-yaw-available={activeStation.yawAvailable}
      data-pitch-available={activeStation.pitchAvailable}
      style={sourceStyle}
      aria-label="炮塔姿态预览"
    >
      <details>
        <summary>
          <span>
            <i aria-hidden="true" />
            炮塔姿态
          </span>
          <strong>{angleLabel(yawDegrees)} / {angleLabel(pitchDegrees)}</strong>
        </summary>
        <div className="turret-preview-controls__body">
          {stations.length > 1 ? (
            <label className="turret-preview-controls__station">
              <span>武器站</span>
              <select
                value={activeStation.id}
                onChange={(event) => onStationChange(event.currentTarget.value)}
                aria-label="选择要预览的炮塔"
              >
                {stations.map((station) => (
                  <option value={station.id} key={station.id}>
                    {station.label} · {station.equipmentLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="turret-preview-controls__main">
            <div className="turret-preview-controls__yaw">
              <span className="turret-preview-controls__readout">
                <span>方位</span>
                <output>{angleLabel(yawDegrees)}</output>
              </span>
              <TurretLimitCompass
                turret={turret}
                yawDegrees={yawDegrees}
                size={148}
                compact
                disabled={!activeStation.yawAvailable}
                activeIndicatorKind={activeStation.indicatorKind}
                orientationIndicators={orientationIndicators}
                onYawChange={onYawChange}
                onInteractionEnd={onInteractionEnd}
              />
              <small>外圈调相对方位 · 内圈显示世界朝向</small>
            </div>
            <label className="turret-preview-controls__pitch">
              <span className="turret-preview-controls__readout">
                <span>俯仰</span>
                <output>{angleLabel(pitchDegrees)}</output>
              </span>
              <span className="turret-preview-controls__pitch-scale">
                <span>
                  <b>仰</b>
                  <i>{angleLabel(pitchWindow.maxPitchDegrees)}</i>
                </span>
                <input
                  className="turret-preview-controls__pitch-range"
                  type="range"
                  min={pitchWindow.minPitchDegrees}
                  max={pitchWindow.maxPitchDegrees}
                  step="0.1"
                  value={pitchDegrees}
                  disabled={!activeStation.pitchAvailable}
                  aria-label="炮塔俯仰"
                  aria-orientation="vertical"
                  style={{
                    "--pitch-progress": `${pitchProgress}%`,
                  } as CSSProperties}
                  onPointerDown={(event) => {
                    if (!activeStation.pitchAvailable) return;
                    event.preventDefault();
                    event.currentTarget.focus();
                    pitchPointerIdRef.current = event.pointerId;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    updatePitchFromPointer(event);
                  }}
                  onPointerMove={(event) => {
                    if (pitchPointerIdRef.current !== event.pointerId) return;
                    event.preventDefault();
                    updatePitchFromPointer(event);
                  }}
                  onPointerUp={finishPitchPointer}
                  onPointerCancel={finishPitchPointer}
                  onLostPointerCapture={(event) => {
                    if (pitchPointerIdRef.current === event.pointerId) {
                      pitchPointerIdRef.current = null;
                      onInteractionEnd();
                    }
                  }}
                  onKeyDown={handlePitchKeyDown}
                  onKeyUp={onInteractionEnd}
                  onBlur={onInteractionEnd}
                  onChange={(event) => onPitchChange(
                    clampTurretPitch(
                      turret,
                      yawDegrees,
                      Number(event.currentTarget.value),
                    ),
                  )}
                />
                <span>
                  <b>俯</b>
                  <i>{angleLabel(pitchWindow.minPitchDegrees)}</i>
                </span>
              </span>
            </label>
            <button
              className="turret-preview-controls__reset"
              type="button"
              onClick={onReset}
            >
              回正炮塔
            </button>
          </div>
          <ul
            className="turret-preview-controls__orientation-legend"
            aria-label="炮塔与武器站世界朝向"
          >
            {orientationIndicators.map((indicator) => (
              <li
                key={indicator.id}
                data-kind={indicator.kind}
                data-active={indicator.active || undefined}
              >
                <i aria-hidden="true" />
                <span>{indicator.label}</span>
                <output>{angleLabel(indicator.yawDegrees)}</output>
              </li>
            ))}
          </ul>
          {!activeStation.yawAvailable ? (
            <p role="note">当前运行时视觉包没有可验证的炮塔 actor，暂不旋转模型。</p>
          ) : !activeStation.pitchAvailable ? (
            <p role="note">炮塔可水平旋转；枪管俯仰部件仍待精确映射。</p>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
