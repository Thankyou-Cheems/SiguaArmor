"use client";

import { useMemo, useState } from "react";

import type {
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
  compact = false,
}: {
  simulation: WeaponDpsSimulation;
  targetHealth?: number | null;
  compact?: boolean;
}) {
  const [hoveredShot, setHoveredShot] = useState<number | null>(null);
  const points = simulation.heatCurve;
  const durationSeconds = Math.max(
    simulation.elapsedSeconds,
    points.at(-1)?.timeSeconds ?? 0,
    1,
  );
  const width = 1000;
  const height = compact ? 222 : 330;
  const left = 74;
  const right = 24;
  const innerWidth = width - left - right;
  const stateTop = compact ? 12 : 18;
  const stateHeight = compact ? 20 : 24;
  const heatTop = compact ? 52 : 64;
  const heatHeight = compact ? 62 : 104;
  const damageTop = heatTop + heatHeight + (compact ? 26 : 34);
  const damageHeight = compact ? 42 : 72;
  const axisY = height - 18;
  const range = simulation.heatRange;
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
  const damagePath = pathFor(damagePoints);
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
  const ticks = Array.from(
    { length: Math.floor(durationSeconds / tickStep(durationSeconds)) + 1 },
    (_, index) => index * tickStep(durationSeconds),
  );
  if (ticks.at(-1) !== durationSeconds) ticks.push(durationSeconds);
  const hoveredPoint = hoveredShot === null
    ? null
    : points.find(({ shotNumber }) => shotNumber === hoveredShot) ?? null;
  const hoveredX = hoveredPoint ? xFor(hoveredPoint.timeSeconds) : null;
  const targetY = targetHealth && targetHealth > 0
    ? damageYFor(targetHealth)
    : null;
  const killX = simulation.killTimeSeconds === null
    ? null
    : xFor(simulation.killTimeSeconds);

  return (
    <div className="rhythm-timeline" data-compact={compact}>
      <svg
        className="rhythm-timeline__chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`武器节奏时间轴，横轴 ${durationSeconds.toFixed(1)} 秒，共 ${points.length} 发`}
        onMouseLeave={() => setHoveredShot(null)}
      >
        <text x="8" y={stateTop + 17} className="rhythm-timeline__lane-label">状态</text>
        <text x="8" y={heatTop + 15} className="rhythm-timeline__lane-label">热量</text>
        <text x="8" y={damageTop + 15} className="rhythm-timeline__lane-label">伤害</text>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={xFor(tick)} x2={xFor(tick)} y1={stateTop} y2={axisY - 8} className="rhythm-timeline__grid" />
            <text x={xFor(tick)} y={axisY} textAnchor={tick === 0 ? "start" : tick === durationSeconds ? "end" : "middle"} className="rhythm-timeline__tick">{tick.toFixed(tick % 1 === 0 ? 0 : 1)}s</text>
          </g>
        ))}

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

        <rect x={left} y={heatTop} width={innerWidth} height={heatHeight} className="rhythm-timeline__heat-safe" />
        {range?.warningAt !== null && range?.warningAt !== undefined ? (
          <rect x={left} y={heatTop} width={innerWidth} height={Math.max(0, heatYFor(range.warningAt) - heatTop)} className="rhythm-timeline__heat-warning" />
        ) : null}
        {range?.dangerAt !== null && range?.dangerAt !== undefined ? (
          <rect x={left} y={heatTop} width={innerWidth} height={Math.max(0, heatYFor(range.dangerAt) - heatTop)} className="rhythm-timeline__heat-danger" />
        ) : null}
        {range?.triggerAt !== null && range?.triggerAt !== undefined ? (
          <>
            <line x1={left} x2={width - right} y1={heatYFor(range.triggerAt)} y2={heatYFor(range.triggerAt)} className="rhythm-timeline__heat-trigger" />
            <text x={width - right - 4} y={heatYFor(range.triggerAt) - 5} textAnchor="end" className="rhythm-timeline__threshold-label">过热锁定 {range.triggerAt}</text>
          </>
        ) : null}
        {heatAreaPath ? <path d={heatAreaPath} className="rhythm-timeline__heat-area" /> : null}
        {heatPath ? <path d={heatPath} className="rhythm-timeline__heat-line" /> : null}

        <rect x={left} y={damageTop} width={innerWidth} height={damageHeight} className="rhythm-timeline__damage-base" />
        {damageAreaPath ? <path d={damageAreaPath} className="rhythm-timeline__damage-area" /> : null}
        {damagePath ? <path d={damagePath} className="rhythm-timeline__damage-line" /> : null}
        {targetY === null ? null : (
          <>
            <line x1={left} x2={width - right} y1={targetY} y2={targetY} className="rhythm-timeline__target-line" />
            <text x={width - right - 4} y={targetY - 5} textAnchor="end" className="rhythm-timeline__target-label">目标 {targetHealth}</text>
          </>
        )}
        {killX === null ? null : (
          <>
            <line x1={killX} x2={killX} y1={stateTop} y2={damageTop + damageHeight} className="rhythm-timeline__kill-line" />
            <text x={killX + 5} y={damageTop + 13} className="rhythm-timeline__kill-label">击毁 {simulation.killTimeSeconds?.toFixed(2)}s</text>
          </>
        )}

        {points.map((point) => {
          if (point.temperature === null) return null;
          return (
            <circle
              key={point.shotNumber}
              cx={xFor(point.timeSeconds)}
              cy={heatYFor(point.temperature)}
              r={hoveredShot === point.shotNumber ? 5 : 2.1}
              className="rhythm-timeline__shot-point"
              onMouseEnter={() => setHoveredShot(point.shotNumber)}
            >
              <title>{`第 ${point.shotNumber} 发 · ${point.timeSeconds.toFixed(2)} 秒 · 热量 ${point.temperature.toFixed(1)} · 累计伤害 ${point.cumulativeDamage.toFixed(0)}`}</title>
            </circle>
          );
        })}

        {hoveredX === null || hoveredPoint === null ? null : (
          <>
            <line x1={hoveredX} x2={hoveredX} y1={stateTop} y2={damageTop + damageHeight} className="rhythm-timeline__cursor" />
            <g transform={`translate(${Math.min(width - 220, Math.max(left, hoveredX + 8))} ${heatTop + 8})`}>
              <rect width="208" height="55" rx="4" className="rhythm-timeline__tooltip-bg" />
              <text x="10" y="18" className="rhythm-timeline__tooltip-title">第 {hoveredPoint.shotNumber} 发 · {hoveredPoint.timeSeconds.toFixed(2)}s</text>
              <text x="10" y="37" className="rhythm-timeline__tooltip-copy">热量 {hoveredPoint.temperature?.toFixed(1) ?? "—"} · 伤害 {hoveredPoint.cumulativeDamage.toFixed(0)}</text>
            </g>
          </>
        )}
      </svg>
      {compact ? null : <div className="rhythm-timeline__legend" aria-label="时间轴图例">
        <span data-kind="firing">开火</span>
        <span data-kind="cooling">冷却/短停</span>
        <span data-kind="overheated">过热锁定</span>
        <span data-kind="reloading">换弹</span>
        <span data-kind="heat">热量</span>
        <span data-kind="damage">累计伤害</span>
      </div>}
    </div>
  );
}
