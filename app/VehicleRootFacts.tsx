"use client";

import { useEffect, useState } from "react";
import { loadWikiVehicleRootObservation } from "../lib/wiki-source";
import type { RootFact, VehicleRootObservation, VehicleRootSeat, VehicleRootSelection } from "../lib/vehicle-root-observation";

const shown = <T,>(fact: RootFact<T>, format: (value: T) => string = String) => fact.state === "unknown" ? "未知" : format(fact.value);
const percent = (value: number) => `${value * 100}%`;
const yesNo = (value: boolean) => value ? "是" : "否";
const className = (value: string | null) => value === null ? "未记录独立座位类" : value.split(".").at(-1)!;

function SeatFacts({ seat, label }: { seat: VehicleRootSeat; label: string }) {
  return <li>
    <strong>{label}</strong>：{shown(seat.seatPawnClassPath, className)}
    <span> · 席位耐久 {shown(seat.seatHealth)} · 维修上限 {shown(seat.repairToolLimit, percent)} · 暴露座位 {shown(seat.exposedSeat, yesNo)}</span>
  </li>;
}

export function VehicleRootFactsView({ observation }: { observation: VehicleRootObservation }) {
  const additional = observation.additional;
  return <section className="data-subsection vehicle-root-facts" aria-label="当前根配置资料">
    <div className="subsection-heading"><h4>当前根配置资料</h4></div>
    <p>来源：{observation.sourceBuildId} · 已审核的 SDK 选定配置读取{observation.state === "partial" ? "（部分字段未知）" : ""}</p>
    <dl className="vehicle-root-facts__summary">
      <div><dt>载具耐久</dt><dd>{shown(observation.maxHealth, value => `${value} HP`)}</dd></div>
      <div><dt>工具箱维修上限</dt><dd>{shown(observation.repairToolLimit, percent)}</dd></div>
      <div><dt>承受范围伤害</dt><dd>{shown(observation.damagedByRadialExplosions, yesNo)}</dd></div>
      <div><dt>附加座位配置</dt><dd>{additional.state === "observed" ? `${additional.value.length} 项` : "未知"}</dd></div>
    </dl>
    <details><summary>查看驾驶与附加座位配置</summary>
      <p>以下按源配置顺序列出，不对应游戏 F 席位编号，也不推断武器站归属。席位耐久为 0 时按读取值展示。</p>
      <ul><SeatFacts seat={observation.driver} label="驾驶配置" />
        {additional.state === "observed" ? additional.value.map(seat => <SeatFacts key={seat.sourceIndex} seat={seat} label={`附加配置 ${seat.sourceIndex! + 1}`} />) : <li>附加配置未知</li>}
      </ul>
    </details>
    <details><summary>查看配置承伤类型</summary>
      {observation.damageModifiers.state === "unknown" ? <p>未知</p> : <ul>{observation.damageModifiers.value.map(row => <li key={row.sourceIndex}>
        {shown(row.damageTypeClassPath, value => value?.split(".").at(-1) ?? "未记录类型引用")} · 基础倍率 {shown(row.modifier)}
      </li>)}</ul>}
    </details>
    <p className="resistance-chart__note">仅展示本次选定根配置；数值保留读取表示，未验证游戏运行行为。武器站关系、视角、运动、模型和装甲仍按各自已有资料处理，未由此续期；伤害计算不使用本区数据。</p>
  </section>;
}

export function VehicleRootFacts({ selection }: { selection: VehicleRootSelection | null }) {
  const key = selection ? JSON.stringify(selection) : "";
  const [result, setResult] = useState<{ key: string; observation: VehicleRootObservation | null; error?: string } | null>(null);
  const cardId = selection?.cardId, rawName = selection?.rawName, runtimeVehicleRef = selection?.runtimeVehicleRef;
  useEffect(() => {
    if (!cardId || !rawName || !runtimeVehicleRef) return;
    let cancelled = false;
    void loadWikiVehicleRootObservation({ cardId, rawName, runtimeVehicleRef }).then(observation => {
      if (!cancelled) setResult({ key, observation });
    }).catch((error: unknown) => {
      if (!cancelled) setResult({ key, observation: null, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [cardId, rawName, runtimeVehicleRef, key]);
  if (!selection) return <p className="vehicle-root-facts">当前车型缺少精确身份，当前根配置资料不可用。</p>;
  if (result?.key !== key) return <p className="vehicle-root-facts" role="status">正在读取当前根配置资料…</p>;
  if (result.error) return <p className="vehicle-root-facts" role="alert">当前根配置资料读取失败：{result.error}</p>;
  if (!result.observation) return <p className="vehicle-root-facts">当前车型尚无已审核的根配置资料。</p>;
  return <VehicleRootFactsView observation={result.observation} />;
}
