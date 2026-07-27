"use client";

import {
  useEffect,
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
  onYawChange?: (yawDegrees: number) => void;
  onInteractionEnd?: () => void;
}

export interface TurretPreviewStation {
  id: string;
  label: string;
  equipmentLabel: string;
  turret: ReferenceTurret;
  yawAvailable: boolean;
  pitchAvailable: boolean;
}

interface TurretPreviewControlsProps {
  stations: TurretPreviewStation[];
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
const COMPASS_SAMPLE_ANGLES = Array.from(
  { length: 360 / COMPASS_SAMPLE_STEP },
  (_, index) => -180 + index * COMPASS_SAMPLE_STEP,
);

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
  const outerStart = polarPoint(startDegrees, outerRadius);
  const outerEnd = polarPoint(endDegrees, outerRadius);
  const innerEnd = polarPoint(endDegrees, innerRadius);
  const innerStart = polarPoint(startDegrees, innerRadius);
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
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
  return COMPASS_SAMPLE_ANGLES.flatMap((yawDegrees) => {
    const window = turretPitchWindowAtYaw(turret, yawDegrees);
    return window ? [{ yawDegrees, ...window }] : [];
  });
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
  onYawChange,
  onInteractionEnd,
}: TurretLimitCompassProps) {
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
  const availableDetents = useMemo(
    () => TURRET_YAW_DETENTS.filter((detent) => (
      Math.abs(
        normalizeTurretYaw(clampTurretYaw(turret, detent) - detent),
      ) < 0.001
    )),
    [turret],
  );
  const accessibleLabel = current
    ? `炮塔当前朝向 ${angleLabel(yawDegrees)}，可俯至 ${angleLabel(current.minPitchDegrees)}，可仰至 ${angleLabel(current.maxPitchDegrees)}`
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
      <circle className="turret-limit-compass__backdrop" cx="50" cy="50" r="46" />
      <circle className="turret-limit-compass__guide" cx="50" cy="50" r="40" />
      <circle className="turret-limit-compass__guide" cx="50" cy="50" r="29" />
      {samples.map((sample) => (
        <g key={sample.yawDegrees} aria-hidden="true">
          <path
            d={annularSectorPath(
              sample.yawDegrees - COMPASS_SAMPLE_STEP / 2,
              sample.yawDegrees + COMPASS_SAMPLE_STEP / 2,
              34,
              43,
            )}
            fill={depressionColor(sample.minPitchDegrees)}
          >
            <title>
              {`${angleLabel(sample.yawDegrees)}：俯角 ${angleLabel(sample.minPitchDegrees)}`}
            </title>
          </path>
          <path
            d={annularSectorPath(
              sample.yawDegrees - COMPASS_SAMPLE_STEP / 2,
              sample.yawDegrees + COMPASS_SAMPLE_STEP / 2,
              25,
              32,
            )}
            fill={elevationColor(sample.maxPitchDegrees)}
          >
            <title>
              {`${angleLabel(sample.yawDegrees)}：仰角 ${angleLabel(sample.maxPitchDegrees)}`}
            </title>
          </path>
        </g>
      ))}
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
      <g className="turret-limit-compass__pointer" aria-hidden="true">
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
      aria-label={`${stationLabel}全向炮塔限界`}
    >
      <header className="turret-envelope-card__heading">
        <span>
          <strong>全向射界</strong>
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
        <span><i data-kind="depression" />外环 · 俯角（越绿越深）</span>
        <span><i data-kind="elevation" />内环 · 仰角（越亮越高）</span>
      </div>
      <p className="turret-envelope-card__source" role="note">
        {authorityNote(turret)}
      </p>
    </section>
  );
}

export function TurretPreviewControls({
  stations,
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
                onYawChange={onYawChange}
                onInteractionEnd={onInteractionEnd}
              />
              <small>拖动圆盘 · 四向档位轻吸附</small>
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
