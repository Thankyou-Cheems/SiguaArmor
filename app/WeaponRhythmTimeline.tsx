"use client";

import { useId, useMemo } from "react";

import type {
  WeaponDpsEvent,
  WeaponDpsSimulation,
  WeaponDpsTimelineSample,
  WeaponDpsTimelineState,
} from "../lib/weapon-dps-model";

const STATE_LABELS: Record<WeaponDpsTimelineState, string> = {
  firing: "开火",
  "short-pause": "短停冷却",
  cooling: "冷却",
  overheated: "过热锁定",
  reloading: "换弹",
};

interface StateSegment {
  state: WeaponDpsTimelineState;
  startSeconds: number;
  endSeconds: number;
}

interface OverheatCoolingSegment {
  startSeconds: number;
  endSeconds: number;
}

interface ReloadSegment {
  startSeconds: number;
  endSeconds: number;
}

function overheatCoolingSegments(
  events: readonly WeaponDpsEvent[],
  durationSeconds: number,
) {
  const segments: OverheatCoolingSegment[] = [];
  let startSeconds: number | null = null;
  for (const event of [...events].sort((left, right) => left.timeSeconds - right.timeSeconds)) {
    if (event.kind === "overheat" && startSeconds === null) {
      startSeconds = event.timeSeconds;
      continue;
    }
    if (event.kind === "unlock" && startSeconds !== null) {
      segments.push({
        startSeconds,
        endSeconds: Math.min(durationSeconds, event.timeSeconds),
      });
      startSeconds = null;
    }
  }
  if (startSeconds !== null && durationSeconds > startSeconds) {
    segments.push({ startSeconds, endSeconds: durationSeconds });
  }
  return segments.filter(({ startSeconds, endSeconds }) => endSeconds > startSeconds);
}

function reloadSegments(
  events: readonly WeaponDpsEvent[],
  durationSeconds: number,
) {
  return events.flatMap((event): ReloadSegment[] => {
    if (event.kind !== "reload") return [];
    const endSeconds = Math.min(durationSeconds, event.timeSeconds);
    const startSeconds = Math.max(
      0,
      Math.min(endSeconds, event.startTimeSeconds ?? event.timeSeconds - 1),
    );
    return endSeconds > startSeconds ? [{ startSeconds, endSeconds }] : [];
  });
}

function stateSegments(
  samples: readonly WeaponDpsTimelineSample[],
  durationSeconds: number,
) {
  const segments: StateSegment[] = [];
  for (const sample of samples) {
    const endSeconds = Math.min(durationSeconds, sample.timeSeconds + 1);
    if (endSeconds <= sample.timeSeconds) continue;
    const previous = segments.at(-1);
    if (previous?.state === sample.state) {
      previous.endSeconds = endSeconds;
      continue;
    }
    segments.push({
      state: sample.state,
      startSeconds: sample.timeSeconds,
      endSeconds,
    });
  }
  return segments;
}

function pathFor(points: readonly { x: number; y: number }[]) {
  return points.length === 0
    ? ""
    : points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

function stepPathFor(points: readonly { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return points.slice(1).reduce(
    (path, point) => `${path} H${point.x.toFixed(2)} V${point.y.toFixed(2)}`,
    `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`,
  );
}

function tickStep(durationSeconds: number) {
  if (durationSeconds <= 10) return 1;
  if (durationSeconds <= 30) return 5;
  if (durationSeconds <= 60) return 10;
  if (durationSeconds <= 120) return 20;
  return 30;
}

export function WeaponRhythmTimeline({
  simulation,
  targetHealth,
  targetLabel,
  compact = false,
}: {
  simulation: WeaponDpsSimulation;
  targetHealth?: number | null;
  targetLabel?: string | null;
  compact?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  const heatGradientId = `heat-gradient-${id}`;
  const overheatCoolingPatternId = `overheat-cooling-pattern-${id}`;
  const reloadPatternId = `reload-pattern-${id}`;
  const points = simulation.heatCurve;
  const range = simulation.heatRange;
  const showHeat = Boolean(
    range && points.some((point) => point.temperature !== null),
  );
  const showState = !compact;
  const durationSeconds = Math.max(
    simulation.elapsedSeconds,
    points.at(-1)?.timeSeconds ?? 0,
    1,
  );
  const width = compact ? 600 : 1000;
  const left = compact ? 48 : 74;
  const right = compact ? 16 : 24;
  const innerWidth = width - left - right;
  const stateTop = compact ? 12 : 18;
  const stateHeight = compact ? 20 : 24;
  const heatTop = showState ? (compact ? 52 : 64) : (compact ? 12 : 18);
  const heatHeight = compact ? 62 : 104;
  const damageTop = showHeat
    ? heatTop + heatHeight + (compact ? 26 : 34)
    : showState
      ? stateTop + stateHeight + (compact ? 26 : 34)
      : compact ? 12 : 18;
  const damageHeight = compact ? 42 : 72;
  const axisY = damageTop + damageHeight + (compact ? 28 : 34);
  const height = axisY + 18;
  const plotTop = showState ? stateTop : showHeat ? heatTop : damageTop;
  const heatMin = range?.min ?? 0;
  const heatMax = Math.max(range?.max ?? 1, heatMin + 1);
  const damageMax = Math.max(
    targetHealth ?? 0,
    simulation.totalDamage,
    points.at(-1)?.cumulativeDamage ?? 0,
    1,
  );
  const xFor = (seconds: number) => left + (seconds / durationSeconds) * innerWidth;
  const heatYFor = (temperature: number) =>
    heatTop + (1 - (temperature - heatMin) / (heatMax - heatMin)) * heatHeight;
  const damageYFor = (damage: number) =>
    damageTop + (1 - damage / damageMax) * damageHeight;
  const heatPoints = points
    .filter((point) => point.temperature !== null)
    .map((point) => ({
      x: xFor(point.timeSeconds),
      y: heatYFor(point.temperature as number),
      point,
    }));
  const damagePoints = [
    { x: left, y: damageTop + damageHeight },
    ...points.map((point) => ({
      x: xFor(point.timeSeconds),
      y: damageYFor(point.cumulativeDamage),
    })),
  ];
  const heatPath = pathFor(heatPoints);
  const damagePath = stepPathFor(damagePoints);
  const heatAreaPath = heatPoints.length === 0
    ? ""
    : `${heatPath} L${heatPoints.at(-1)!.x.toFixed(2)} ${(heatTop + heatHeight).toFixed(2)} L${heatPoints[0].x.toFixed(2)} ${(heatTop + heatHeight).toFixed(2)} Z`;
  const damageAreaPath = damagePoints.length === 0
    ? ""
    : `${damagePath} L${damagePoints.at(-1)!.x.toFixed(2)} ${(damageTop + damageHeight).toFixed(2)} L${left} ${(damageTop + damageHeight).toFixed(2)} Z`;
  const segments = useMemo(
    () => stateSegments(simulation.timeline, durationSeconds),
    [durationSeconds, simulation.timeline],
  );
  const coolingSegments = useMemo(
    () => overheatCoolingSegments(simulation.events, durationSeconds),
    [durationSeconds, simulation.events],
  );
  const reloads = useMemo(
    () => reloadSegments(simulation.events, durationSeconds),
    [durationSeconds, simulation.events],
  );
  const ticks = Array.from(
    { length: Math.floor(durationSeconds / tickStep(durationSeconds)) + 1 },
    (_, index) => index * tickStep(durationSeconds),
  );
  if (ticks.at(-1) !== durationSeconds) ticks.push(durationSeconds);
  const targetY = targetHealth && targetHealth > 0
    ? damageYFor(targetHealth)
    : null;
  const killX = simulation.killTimeSeconds === null
    ? null
    : xFor(simulation.killTimeSeconds);
  const killLabelAtEnd = killX !== null && killX > width - right - 96;

  return (
    <div className="rhythm-timeline" data-compact={compact} data-has-heat={showHeat}>
      <div className="rhythm-timeline__heading">
        <span>{showHeat ? "累计伤害 / 热量" : "累计伤害"}</span>
        <strong>{targetLabel ?? "当前目标"}</strong>
      </div>
      <svg
        className="rhythm-timeline__chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${targetLabel ?? "当前目标"}武器节奏时间轴，横轴 ${durationSeconds.toFixed(1)} 秒，共 ${points.length} 发`}
      >
        <defs>
          <linearGradient id={heatGradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#2f9d68" stopOpacity="0.42" />
            <stop offset="48%" stopColor="#c3a53f" stopOpacity="0.36" />
            <stop offset="72%" stopColor="#df7a42" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#e34848" stopOpacity="0.52" />
          </linearGradient>
          <pattern id={overheatCoolingPatternId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="10" height="10" fill="rgba(112, 18, 20, 0.22)" />
            <rect width="4" height="10" fill="rgba(255, 91, 77, 0.5)" />
          </pattern>
          <pattern id={reloadPatternId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="12" height="12" fill="rgba(80, 86, 84, 0.3)" />
            <rect width="4" height="12" fill="rgba(190, 197, 194, 0.2)" />
          </pattern>
        </defs>
        {showState ? <text x="8" y={stateTop + 17} className="rhythm-timeline__lane-label">状态</text> : null}
        {showHeat ? <text x="8" y={heatTop + 15} className="rhythm-timeline__lane-label">热量</text> : null}
        <text x="8" y={damageTop + 15} className="rhythm-timeline__lane-label">伤害</text>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={xFor(tick)} x2={xFor(tick)} y1={plotTop} y2={axisY - 8} className="rhythm-timeline__grid" />
            <text x={xFor(tick)} y={axisY} textAnchor={tick === 0 ? "start" : tick === durationSeconds ? "end" : "middle"} className="rhythm-timeline__tick">{tick.toFixed(tick % 1 === 0 ? 0 : 1)}s</text>
          </g>
        ))}

        {showState ? (
          <>
            <rect x={left} y={stateTop} width={innerWidth} height={stateHeight} className="rhythm-timeline__state-base" />
            {segments.map((segment, index) => {
              const x = xFor(segment.startSeconds);
              const segmentWidth = Math.max(1, xFor(segment.endSeconds) - x);
              return (
                <g key={`${segment.state}-${index}`}>
                  <rect x={x} y={stateTop} width={segmentWidth} height={stateHeight} className={`rhythm-timeline__state rhythm-timeline__state--${segment.state}`}>
                    <title>{`${segment.startSeconds.toFixed(1)}–${segment.endSeconds.toFixed(1)} 秒 · ${STATE_LABELS[segment.state]}`}</title>
                  </rect>
                  {segmentWidth > 64 ? <text x={x + segmentWidth / 2} y={stateTop + 16} textAnchor="middle" className="rhythm-timeline__state-label">{STATE_LABELS[segment.state]}</text> : null}
                </g>
              );
            })}
          </>
        ) : null}

        {showHeat ? (
          <>
            <rect
              x={left}
              y={heatTop}
              width={innerWidth}
              height={heatHeight}
              fill={`url(#${heatGradientId})`}
              className="rhythm-timeline__heat-gradient"
            />
            {range?.triggerAt !== null && range?.triggerAt !== undefined ? (
              <>
                <line x1={left} x2={width - right} y1={heatYFor(range.triggerAt)} y2={heatYFor(range.triggerAt)} className="rhythm-timeline__heat-trigger" />
                <text x={width - right - 4} y={heatYFor(range.triggerAt) - 5} textAnchor="end" className="rhythm-timeline__threshold-label">过热锁定 {range.triggerAt}</text>
              </>
            ) : null}
            {showState && coolingSegments.length > 0 ? (
              <g className="rhythm-timeline__overheat-cooling-key">
                <rect
                  x={left + 4}
                  y={heatTop - 13}
                  width="16"
                  height="7"
                  fill={`url(#${overheatCoolingPatternId})`}
                />
                <text x={left + 25} y={heatTop - 6}>红色斜纹 = 过热冷却段</text>
              </g>
            ) : null}
            {coolingSegments.map((segment, index) => {
              const x = xFor(segment.startSeconds);
              const segmentWidth = Math.max(4, xFor(segment.endSeconds) - x);
              return (
                <g key={`overheat-cooling-${index}`} className="rhythm-timeline__overheat-cooling">
                  <rect
                    x={x}
                    y={heatTop}
                    width={segmentWidth}
                    height={heatHeight}
                    fill={`url(#${overheatCoolingPatternId})`}
                    className="rhythm-timeline__overheat-cooling-band"
                  >
                    <title>{`过热冷却 ${segment.startSeconds.toFixed(2)}–${segment.endSeconds.toFixed(2)} 秒`}</title>
                  </rect>
                  <rect x={x} y={heatTop} width={segmentWidth} height="5" className="rhythm-timeline__overheat-cooling-cap" />
                  <path d={`M${x} ${heatTop - 7} l7 7 h-14 Z`} className="rhythm-timeline__overheat-cooling-marker" />
                  {segmentWidth > 72 ? (
                    <text x={x + segmentWidth / 2} y={heatTop + 15} textAnchor="middle" className="rhythm-timeline__overheat-cooling-label">
                      过热冷却
                    </text>
                  ) : null}
                </g>
              );
            })}
            {heatAreaPath ? <path d={heatAreaPath} className="rhythm-timeline__heat-area" /> : null}
            {heatPath ? <path d={heatPath} className="rhythm-timeline__heat-line" /> : null}
          </>
        ) : null}

        <rect x={left} y={damageTop} width={innerWidth} height={damageHeight} className="rhythm-timeline__damage-base" />
        {reloads.map((segment, index) => {
          const x = xFor(segment.startSeconds);
          const segmentWidth = Math.max(2, xFor(segment.endSeconds) - x);
          return (
            <g key={`reload-vacuum-${index}`} className="rhythm-timeline__reload-vacuum">
              <rect
                x={x}
                y={damageTop}
                width={segmentWidth}
                height={damageHeight}
                fill={`url(#${reloadPatternId})`}
                className="rhythm-timeline__reload-vacuum-band"
              >
                <title>{`换弹伤害真空 ${segment.startSeconds.toFixed(2)}–${segment.endSeconds.toFixed(2)} 秒`}</title>
              </rect>
              <rect x={x} y={damageTop} width={segmentWidth} height="4" className="rhythm-timeline__reload-vacuum-cap" />
            </g>
          );
        })}
        {damageAreaPath ? <path d={damageAreaPath} className="rhythm-timeline__damage-area" /> : null}
        {damagePath ? <path d={damagePath} className="rhythm-timeline__damage-line" /> : null}
        {reloads.map((segment, index) => {
          const x = xFor(segment.startSeconds);
          const segmentWidth = Math.max(2, xFor(segment.endSeconds) - x);
          return segmentWidth > 90 ? (
            <text
              key={`reload-vacuum-label-${index}`}
              x={x + segmentWidth / 2}
              y={damageTop + damageHeight / 2 + 4}
              textAnchor="middle"
              className="rhythm-timeline__reload-vacuum-label"
            >
              换弹 · {`${(segment.endSeconds - segment.startSeconds).toFixed(1)}s`} 无伤害
            </text>
          ) : null;
        })}
        {targetY === null ? null : (
          <>
            <line x1={left} x2={width - right} y1={targetY} y2={targetY} className="rhythm-timeline__target-line" />
            <text x={width - right - 4} y={targetY - 5} textAnchor="end" className="rhythm-timeline__target-label">目标 {targetHealth}</text>
          </>
        )}
        {killX === null ? null : (
          <>
            <line x1={killX} x2={killX} y1={plotTop} y2={damageTop + damageHeight} className="rhythm-timeline__kill-line" />
            <text
              x={killLabelAtEnd ? killX - 5 : killX + 5}
              y={damageTop + 13}
              textAnchor={killLabelAtEnd ? "end" : "start"}
              className="rhythm-timeline__kill-label"
            >
              击毁 {simulation.killTimeSeconds?.toFixed(2)}s
            </text>
          </>
        )}

      </svg>
      {compact ? null : <div className="rhythm-timeline__legend" aria-label="时间轴图例">
        <span data-kind="firing">开火</span>
        <span data-kind="cooling">冷却/短停</span>
        <span data-kind="overheated">过热锁定</span>
        <span data-kind="reloading">换弹</span>
        {showHeat ? <span data-kind="heat">热量</span> : null}
        <span data-kind="damage">累计伤害</span>
      </div>}
    </div>
  );
}
