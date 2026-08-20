"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flame,
  Gauge,
  ShieldAlert,
  Swords,
  TimerReset,
} from "lucide-react";

import { WeaponRhythmTimeline } from "../../WeaponRhythmTimeline";

import {
  DUEL_VEHICLES,
  duelSimulationUntil,
  resolveVehicleDuel,
  vehicleById,
  type DuelLethalPath,
  type DuelSide,
  type DuelTargetZone,
  type DuelVehicle,
  type DuelWeapon,
  type VehicleDuelResolution,
} from "./model";

// PROTOTYPE: Three structurally different vehicle-duel layouts, switchable via ?variant=.

type VariantKey = "A" | "B" | "C";

interface DuelSelection {
  leftVehicle: DuelVehicle;
  rightVehicle: DuelVehicle;
  leftWeapon: DuelWeapon;
  rightWeapon: DuelWeapon;
  leftIncomingZone: DuelTargetZone;
  rightIncomingZone: DuelTargetZone;
  setLeftVehicle: (id: string) => void;
  setRightVehicle: (id: string) => void;
  setLeftWeapon: (id: string) => void;
  setRightWeapon: (id: string) => void;
  setLeftIncomingZone: (id: string) => void;
  setRightIncomingZone: (id: string) => void;
}
const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: "A", name: "镜像竞技场" },
  { key: "B", name: "伤害赛道" },
  { key: "C", name: "裁判直播台" },
];

function normalizedVariant(value: string | null): VariantKey {
  return value === "B" || value === "C" ? value : "A";
}

function timeLabel(path: DuelLethalPath | null) {
  return path ? `${path.timeSeconds.toFixed(2)} s` : ">180 s";
}

function lossLabel(path: DuelLethalPath | null) {
  if (!path) return "无法击毁";
  return path.poolKind === "ammo-rack" ? "弹药架归零" : "车体归零";
}

function winnerSide(resolution: VehicleDuelResolution): DuelSide | null {
  return resolution.winner === "left" || resolution.winner === "right"
    ? resolution.winner
    : null;
}

function VehicleSelect({
  side,
  vehicle,
  weapon,
  onVehicle,
  onWeapon,
}: {
  side: "A" | "B";
  vehicle: DuelVehicle;
  weapon: DuelWeapon;
  onVehicle: (id: string) => void;
  onWeapon: (id: string) => void;
}) {
  return (
    <div className="duel-prototype__selectors">
      <label>
        <span>{side} 方载具</span>
        <select value={vehicle.id} onChange={(event) => onVehicle(event.target.value)}>
          {DUEL_VEHICLES.map((option) => (
            <option key={option.id} value={option.id}>{option.faction} · {option.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>武器 / 弹种</span>
        <select value={weapon.id} onChange={(event) => onWeapon(event.target.value)}>
          {vehicle.weapons.map((option) => (
            <option key={option.id} value={option.id}>{option.shortLabel} · {option.ammoLabel}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function VehicleIdentity({ side, vehicle }: { side: "A" | "B"; vehicle: DuelVehicle }) {
  return (
    <header className="duel-prototype__vehicle-identity" style={{ "--duel-accent": vehicle.accent } as React.CSSProperties}>
      <span>{side} SIDE</span>
      <strong>{vehicle.name}</strong>
      <small>{vehicle.faction} · {vehicle.role}</small>
    </header>
  );
}

function TargetMap({
  vehicle,
  selectedZone,
  attackerLabel,
  onSelect,
  compact = false,
}: {
  vehicle: DuelVehicle;
  selectedZone: DuelTargetZone;
  attackerLabel: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <section
      className="duel-prototype__target-map"
      data-compact={compact}
      style={{ "--duel-accent": vehicle.accent } as React.CSSProperties}
      aria-label={`${attackerLabel}选择攻击${vehicle.name}的位置`}
    >
      <div className="duel-prototype__target-map-heading">
        <span><Crosshair size={14} /> {attackerLabel}瞄准点</span>
        <strong>{selectedZone.label}</strong>
      </div>
      <div className="duel-prototype__vehicle-silhouette">
        <i className="duel-prototype__vehicle-track duel-prototype__vehicle-track--top" />
        <i className="duel-prototype__vehicle-track duel-prototype__vehicle-track--bottom" />
        <i className="duel-prototype__vehicle-hull" />
        <i className="duel-prototype__vehicle-turret" />
        <i className="duel-prototype__vehicle-gun" />
        {vehicle.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className="duel-prototype__hotspot"
            data-active={zone.id === selectedZone.id}
            style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
            title={`${zone.label}：${zone.note}`}
            aria-label={`选择${zone.label}，${zone.note}`}
            onClick={() => onSelect(zone.id)}
          >
            <span>{zone.label}</span>
          </button>
        ))}
      </div>
      <p>{selectedZone.note}</p>
    </section>
  );
}

function AttackSummary({
  side,
  weapon,
  targetVehicle,
  targetZone,
  path,
  shotsBeforeCutoff,
}: {
  side: DuelSide;
  weapon: DuelWeapon;
  targetVehicle: DuelVehicle;
  targetZone: DuelTargetZone;
  path: DuelLethalPath | null;
  shotsBeforeCutoff: number;
}) {
  return (
    <div className="duel-prototype__attack-summary" data-side={side}>
      <span>{side === "left" ? "A → B" : "B → A"}</span>
      <strong>{weapon.shortLabel}</strong>
      <small>{weapon.ammoLabel}</small>
      <dl>
        <div><dt>目标</dt><dd>{targetVehicle.name} · {targetZone.label}</dd></div>
        <div><dt>致命方式</dt><dd>{lossLabel(path)}</dd></div>
        <div><dt>不受干扰</dt><dd>{timeLabel(path)}</dd></div>
        <div><dt>截止前射击</dt><dd>{shotsBeforeCutoff} 发</dd></div>
      </dl>
    </div>
  );
}

function CombatCurve({
  side,
  path,
  cutoffSeconds,
}: {
  side: DuelSide;
  path: DuelLethalPath | null;
  cutoffSeconds: number | null;
}) {
  const simulation = duelSimulationUntil(path, cutoffSeconds);
  if (!simulation || !path) {
    return <div className="duel-prototype__combat-curve duel-prototype__combat-curve--empty">当前命中点没有可绘制的致命伤害曲线</div>;
  }
  const cutoff = cutoffSeconds ?? simulation.elapsedSeconds;
  return (
    <section className="duel-prototype__combat-curve" data-side={side}>
      <header>
        <span>{side === "left" ? "A 方" : "B 方"}实际输出</span>
        <strong>{cutoff.toFixed(2)} s 截止 · {simulation.shots} 发</strong>
      </header>
      <WeaponRhythmTimeline
        simulation={simulation}
        targetHealth={path.targetHealth}
        targetLabel={path.poolLabel}
        compact
      />
    </section>
  );
}

function Verdict({ resolution }: { resolution: VehicleDuelResolution }) {
  const winner = winnerSide(resolution);
  return (
    <section className="duel-prototype__verdict" data-winner={resolution.winner}>
      <span><Swords size={16} /> 同时开火裁定</span>
      <strong>
        {winner === "left" ? "A 方胜出" : winner === "right" ? "B 方胜出" : resolution.winner === "draw" ? "同归于尽" : "未决"}
      </strong>
      <b>{resolution.decisiveTimeSeconds === null ? ">180 s" : `${resolution.decisiveTimeSeconds.toFixed(2)} s`}</b>
      <p>{resolution.verdict}</p>
    </section>
  );
}

function RaceTimeline({
  resolution,
  integratedVerdict = false,
}: {
  resolution: VehicleDuelResolution;
  integratedVerdict?: boolean;
}) {
  const leftTime = resolution.rightLosesAt?.timeSeconds ?? 180;
  const rightTime = resolution.leftLosesAt?.timeSeconds ?? 180;
  const maximum = Math.max(leftTime, rightTime, 1);
  const row = (
    side: "left" | "right",
    label: string,
    path: DuelLethalPath | null,
  ) => {
    const time = path?.timeSeconds ?? 180;
    return (
      <div className="duel-prototype__race-row" data-side={side}>
        <span>{label}</span>
        <i><b style={{ width: `${Math.min(100, time / maximum * 100)}%` }} /></i>
        <strong>{timeLabel(path)}</strong>
        <small>{lossLabel(path)}</small>
      </div>
    );
  };
  return (
    <section className="duel-prototype__race">
      <header>
        <TimerReset size={15} />
        <span>致命时间赛道</span>
        {integratedVerdict ? <b>{resolution.verdict}</b> : null}
        <small>0 秒同时开火</small>
      </header>
      {row("left", "A 方火力 → B 方", resolution.rightLosesAt)}
      {row("right", "B 方火力 → A 方", resolution.leftLosesAt)}
    </section>
  );
}

function ArenaJudge({ resolution }: { resolution: VehicleDuelResolution }) {
  const winner = winnerSide(resolution);
  return (
    <div className="duel-prototype__arena-judge" data-winner={resolution.winner}>
      <Swords size={32} />
      <span>交叉射击</span>
      <strong>{winner === "left" ? "A 胜" : winner === "right" ? "B 胜" : resolution.winner === "draw" ? "平局" : "未决"}</strong>
      <b>{resolution.decisiveTimeSeconds === null ? ">180s" : `${resolution.decisiveTimeSeconds.toFixed(2)}s`}</b>
    </div>
  );
}

function StateLedger({ selection, resolution }: { selection: DuelSelection; resolution: VehicleDuelResolution }) {
  return (
    <section className="duel-prototype__state-ledger" aria-label="原型当前完整状态">
      <span>PROTOTYPE STATE</span>
      <code>A {selection.leftVehicle.name} / {selection.leftWeapon.ammoLabel} → {selection.rightVehicle.name} {selection.rightIncomingZone.label}</code>
      <code>B {selection.rightVehicle.name} / {selection.rightWeapon.ammoLabel} → {selection.leftVehicle.name} {selection.leftIncomingZone.label}</code>
      <code>RESULT {resolution.winner.toUpperCase()} @ {resolution.decisiveTimeSeconds?.toFixed(2) ?? "UNRESOLVED"}s</code>
    </section>
  );
}

function VariantA({ selection, resolution }: { selection: DuelSelection; resolution: VehicleDuelResolution }) {
  return (
    <main className="duel-prototype duel-prototype--arena">
      <PrototypeHeader name="A — 镜像竞技场" description="先看双方载具与瞄准点，再看中央裁定。" />
      <div className="duel-prototype__arena-grid">
        <article className="duel-prototype__combatant">
          <VehicleIdentity side="A" vehicle={selection.leftVehicle} />
          <VehicleSelect side="A" vehicle={selection.leftVehicle} weapon={selection.leftWeapon} onVehicle={selection.setLeftVehicle} onWeapon={selection.setLeftWeapon} />
          <TargetMap vehicle={selection.leftVehicle} selectedZone={selection.leftIncomingZone} attackerLabel="B 方" onSelect={selection.setLeftIncomingZone} />
          <CombatCurve side="left" path={resolution.rightLosesAt} cutoffSeconds={resolution.decisiveTimeSeconds} />
          <AttackSummary side="left" weapon={selection.leftWeapon} targetVehicle={selection.rightVehicle} targetZone={selection.rightIncomingZone} path={resolution.rightLosesAt} shotsBeforeCutoff={resolution.leftShotsBeforeCutoff} />
        </article>
        <ArenaJudge resolution={resolution} />
        <article className="duel-prototype__combatant">
          <VehicleIdentity side="B" vehicle={selection.rightVehicle} />
          <VehicleSelect side="B" vehicle={selection.rightVehicle} weapon={selection.rightWeapon} onVehicle={selection.setRightVehicle} onWeapon={selection.setRightWeapon} />
          <TargetMap vehicle={selection.rightVehicle} selectedZone={selection.rightIncomingZone} attackerLabel="A 方" onSelect={selection.setRightIncomingZone} />
          <CombatCurve side="right" path={resolution.leftLosesAt} cutoffSeconds={resolution.decisiveTimeSeconds} />
          <AttackSummary side="right" weapon={selection.rightWeapon} targetVehicle={selection.leftVehicle} targetZone={selection.leftIncomingZone} path={resolution.leftLosesAt} shotsBeforeCutoff={resolution.rightShotsBeforeCutoff} />
        </article>
      </div>
      <RaceTimeline resolution={resolution} integratedVerdict />
      <StateLedger selection={selection} resolution={resolution} />
    </main>
  );
}

function VariantB({ selection, resolution }: { selection: DuelSelection; resolution: VehicleDuelResolution }) {
  return (
    <main className="duel-prototype duel-prototype--raceboard">
      <PrototypeHeader name="B — 伤害赛道" description="把谁先失去战斗力放到第一视觉层，载具选择退到上下两端。" />
      <div className="duel-prototype__raceboard-controls">
        <div><VehicleIdentity side="A" vehicle={selection.leftVehicle} /><VehicleSelect side="A" vehicle={selection.leftVehicle} weapon={selection.leftWeapon} onVehicle={selection.setLeftVehicle} onWeapon={selection.setLeftWeapon} /></div>
        <Verdict resolution={resolution} />
        <div><VehicleIdentity side="B" vehicle={selection.rightVehicle} /><VehicleSelect side="B" vehicle={selection.rightVehicle} weapon={selection.rightWeapon} onVehicle={selection.setRightVehicle} onWeapon={selection.setRightWeapon} /></div>
      </div>
      <RaceTimeline resolution={resolution} />
      <div className="duel-prototype__raceboard-targets">
        <TargetMap compact vehicle={selection.leftVehicle} selectedZone={selection.leftIncomingZone} attackerLabel="B 方" onSelect={selection.setLeftIncomingZone} />
        <div className="duel-prototype__crossfire">
          <Swords size={28} />
          <span>{selection.leftWeapon.shortLabel}</span>
          <i>交叉射击</i>
          <span>{selection.rightWeapon.shortLabel}</span>
        </div>
        <TargetMap compact vehicle={selection.rightVehicle} selectedZone={selection.rightIncomingZone} attackerLabel="A 方" onSelect={selection.setRightIncomingZone} />
      </div>
      <div className="duel-prototype__paired-attacks">
        <AttackSummary side="left" weapon={selection.leftWeapon} targetVehicle={selection.rightVehicle} targetZone={selection.rightIncomingZone} path={resolution.rightLosesAt} shotsBeforeCutoff={resolution.leftShotsBeforeCutoff} />
        <AttackSummary side="right" weapon={selection.rightWeapon} targetVehicle={selection.leftVehicle} targetZone={selection.leftIncomingZone} path={resolution.leftLosesAt} shotsBeforeCutoff={resolution.rightShotsBeforeCutoff} />
      </div>
      <StateLedger selection={selection} resolution={resolution} />
    </main>
  );
}

function RefereeColumn({ selection, resolution }: { selection: DuelSelection; resolution: VehicleDuelResolution }) {
  const events = [
    "00.00 s · 双方首发同时结算",
    resolution.rightLosesAt ? `${resolution.rightLosesAt.timeSeconds.toFixed(2)} s · B 方${lossLabel(resolution.rightLosesAt)}` : "B 方无致命事件",
    resolution.leftLosesAt ? `${resolution.leftLosesAt.timeSeconds.toFixed(2)} s · A 方${lossLabel(resolution.leftLosesAt)}` : "A 方无致命事件",
    resolution.verdict,
  ];
  return (
    <aside className="duel-prototype__referee-column">
      <Verdict resolution={resolution} />
      <div className="duel-prototype__rule-card">
        <ShieldAlert size={18} />
        <strong>弹药架规则</strong>
        <p>弹药架归零即成为摧毁时间；该侧同刻失去全部后续弹药与输出。</p>
      </div>
      <ol>{events.map((event, index) => <li key={`${index}:${event}`}>{event}</li>)}</ol>
      <div className="duel-prototype__telemetry">
        <span><Gauge size={14} /> A 截止前 {resolution.leftShotsBeforeCutoff} 发</span>
        <span><Flame size={14} /> B 截止前 {resolution.rightShotsBeforeCutoff} 发</span>
      </div>
      <StateLedger selection={selection} resolution={resolution} />
    </aside>
  );
}

function VariantC({ selection, resolution }: { selection: DuelSelection; resolution: VehicleDuelResolution }) {
  return (
    <main className="duel-prototype duel-prototype--referee">
      <PrototypeHeader name="C — 裁判直播台" description="两侧只负责配置，中间用事件流解释为什么判定这一方先爆炸。" />
      <div className="duel-prototype__referee-grid">
        <article className="duel-prototype__referee-side">
          <VehicleIdentity side="A" vehicle={selection.leftVehicle} />
          <VehicleSelect side="A" vehicle={selection.leftVehicle} weapon={selection.leftWeapon} onVehicle={selection.setLeftVehicle} onWeapon={selection.setLeftWeapon} />
          <TargetMap vehicle={selection.leftVehicle} selectedZone={selection.leftIncomingZone} attackerLabel="B 方" onSelect={selection.setLeftIncomingZone} />
          <AttackSummary side="left" weapon={selection.leftWeapon} targetVehicle={selection.rightVehicle} targetZone={selection.rightIncomingZone} path={resolution.rightLosesAt} shotsBeforeCutoff={resolution.leftShotsBeforeCutoff} />
        </article>
        <RefereeColumn selection={selection} resolution={resolution} />
        <article className="duel-prototype__referee-side">
          <VehicleIdentity side="B" vehicle={selection.rightVehicle} />
          <VehicleSelect side="B" vehicle={selection.rightVehicle} weapon={selection.rightWeapon} onVehicle={selection.setRightVehicle} onWeapon={selection.setRightWeapon} />
          <TargetMap vehicle={selection.rightVehicle} selectedZone={selection.rightIncomingZone} attackerLabel="A 方" onSelect={selection.setRightIncomingZone} />
          <AttackSummary side="right" weapon={selection.rightWeapon} targetVehicle={selection.leftVehicle} targetZone={selection.leftIncomingZone} path={resolution.leftLosesAt} shotsBeforeCutoff={resolution.rightShotsBeforeCutoff} />
        </article>
      </div>
    </main>
  );
}

function PrototypeHeader({ name, description }: { name: string; description: string }) {
  return (
    <header className="duel-prototype__page-header">
      <div><span>THROWAWAY UI PROTOTYPE</span><strong>载具斗蛐蛐</strong><p>{description}</p></div>
      <aside><b>{name}</b><small>演示数值仅用于验证交互与信息层级</small></aside>
    </header>
  );
}

function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = VARIANTS.findIndex(({ key }) => key === current);
  const select = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", VARIANTS[(next + VARIANTS.length) % VARIANTS.length].key);
    router.replace(`${pathname}?${params.toString()}`);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") select(index - 1);
      if (event.key === "ArrowRight") select(index + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  const active = VARIANTS[index];
  return (
    <nav className="duel-prototype__switcher" aria-label="切换原型变体">
      <button type="button" onClick={() => select(index - 1)} aria-label="上一个变体"><ChevronLeft size={18} /></button>
      <span>{active.key} — {active.name}</span>
      <button type="button" onClick={() => select(index + 1)} aria-label="下一个变体"><ChevronRight size={18} /></button>
    </nav>
  );
}

export default function VehicleDuelPrototype() {
  const searchParams = useSearchParams();
  const variant = normalizedVariant(searchParams.get("variant"));
  const [leftVehicleId, setLeftVehicleId] = useState("bmp2-afu");
  const [rightVehicleId, setRightVehicleId] = useState("m2a3");
  const [leftWeaponId, setLeftWeaponId] = useState("2a42-ap");
  const [rightWeaponId, setRightWeaponId] = useState("m919");
  const [leftIncomingZoneId, setLeftIncomingZoneId] = useState("ammo-rack");
  const [rightIncomingZoneId, setRightIncomingZoneId] = useState("ammo-rack");
  const leftVehicle = vehicleById(leftVehicleId);
  const rightVehicle = vehicleById(rightVehicleId);
  const leftWeapon = leftVehicle.weapons.find(({ id }) => id === leftWeaponId) ?? leftVehicle.weapons[0];
  const rightWeapon = rightVehicle.weapons.find(({ id }) => id === rightWeaponId) ?? rightVehicle.weapons[0];
  const leftIncomingZone = leftVehicle.zones.find(({ id }) => id === leftIncomingZoneId) ?? leftVehicle.zones[0];
  const rightIncomingZone = rightVehicle.zones.find(({ id }) => id === rightIncomingZoneId) ?? rightVehicle.zones[0];

  const setVehicle = (side: DuelSide, id: string) => {
    const vehicle = vehicleById(id);
    if (side === "left") {
      setLeftVehicleId(id);
      setLeftWeaponId(vehicle.weapons[0].id);
      setLeftIncomingZoneId("ammo-rack");
    } else {
      setRightVehicleId(id);
      setRightWeaponId(vehicle.weapons[0].id);
      setRightIncomingZoneId("ammo-rack");
    }
  };

  const resolution = useMemo(() => resolveVehicleDuel({
    left: { attacker: leftVehicle, weapon: leftWeapon, defender: rightVehicle, targetZone: rightIncomingZone },
    right: { attacker: rightVehicle, weapon: rightWeapon, defender: leftVehicle, targetZone: leftIncomingZone },
  }), [leftIncomingZone, leftVehicle, leftWeapon, rightIncomingZone, rightVehicle, rightWeapon]);

  const selection: DuelSelection = {
    leftVehicle,
    rightVehicle,
    leftWeapon,
    rightWeapon,
    leftIncomingZone,
    rightIncomingZone,
    setLeftVehicle: (id) => setVehicle("left", id),
    setRightVehicle: (id) => setVehicle("right", id),
    setLeftWeapon: setLeftWeaponId,
    setRightWeapon: setRightWeaponId,
    setLeftIncomingZone: setLeftIncomingZoneId,
    setRightIncomingZone: setRightIncomingZoneId,
  };

  return (
    <>
      {variant === "A" ? <VariantA selection={selection} resolution={resolution} /> : null}
      {variant === "B" ? <VariantB selection={selection} resolution={resolution} /> : null}
      {variant === "C" ? <VariantC selection={selection} resolution={resolution} /> : null}
      {process.env.NODE_ENV !== "production" ? <PrototypeSwitcher current={variant} /> : null}
    </>
  );
}
