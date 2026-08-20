"use client";

import {
  ArrowLeft,
  BarChart3,
  Flame,
  Gauge,
  Info,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { loadWikiWeaponCatalog } from "../lib/wiki-source";
import {
  optimizeWeaponRhythm,
  type WeaponDpsSimulation,
  type WeaponDpsOptimization,
  type WeaponDpsWeapon,
} from "../lib/weapon-dps-model";
import { weaponDpsWeaponsFromWikiDocument } from "../lib/weapon-dps-source";
import { WeaponRhythmTimeline } from "./WeaponRhythmTimeline";

function formatNumber(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 0 ? 0 : 0,
  });
}

function formatSeconds(value: number | null) {
  return value === null ? "—" : `${formatNumber(value, 2)} s`;
}

function thermalTone(weapon: WeaponDpsWeapon) {
  if (!weapon.overheat) return "unknown";
  return weapon.overheat.state === "observed" ? "observed" : "projected";
}

function simulationHeadline(simulation: WeaponDpsSimulation) {
  if (simulation.unavailableReason) return simulation.unavailableReason;
  if (simulation.killTimeSeconds !== null) {
    return `${formatSeconds(simulation.killTimeSeconds)} 击毁目标`;
  }
  return `${formatNumber(simulation.averageDps, 1)} DPS / ${formatNumber(simulation.totalDamage, 0)} 伤害`;
}

function rhythmPlanLabel(
  optimization: WeaponDpsOptimization,
  practical = true,
) {
  const plan = (practical ? optimization.recommended : optimization.best)?.plan;
  if (!plan) return "无法求解";
  if (plan.mode === "burn") return practical ? "连续射击（实战推荐）" : "连续射击（数学最快）";
  return `每 ${plan.burstSize} 发短停 ${formatNumber(plan.pauseSeconds, 2)} s（${practical ? "实战推荐" : "数学最快"}）`;
}

function ResultBadge({ simulation }: { simulation: WeaponDpsSimulation }) {
  if (simulation.thermalState === "unavailable") {
    return <span className="weapon-dps-badge weapon-dps-badge--unknown">温控资料待发布</span>;
  }
  return (
    <span className={`weapon-dps-badge weapon-dps-badge--${simulation.thermalState}`}>
      {simulation.thermalState === "observed" ? "观测模型" : "投影模型"}
    </span>
  );
}

export function WeaponDpsWorkbench() {
  const [weapons, setWeapons] = useState<WeaponDpsWeapon[]>([]);
  const [sourceRevision, setSourceRevision] = useState<string | null>(null);
  const [overheatProfileCount, setOverheatProfileCount] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The workbench owns the search; users choose weapons, not an arbitrary
  // pause that could bias the conclusion. The target is a stable demo horizon
  // until the same estimator is mounted in the clicked-hit damage card.
  const targetHealth = 6000;
  const horizonSeconds = 60;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedAssignment = params.get("weaponAssignmentId");
    const requestedCard = params.get("cardId");
    const requestedRawName = params.get("rawName");
    void loadWikiWeaponCatalog()
      .then((document) => {
        const result = weaponDpsWeaponsFromWikiDocument(document as Record<string, unknown>);
        setWeapons(result.weapons);
        setSourceRevision(result.sourceRevision);
        setOverheatProfileCount(result.overheatProfileCount);
        const exact = requestedAssignment
          ? result.weapons.find(({ assignmentId }) => assignmentId === requestedAssignment)
          : result.weapons.find(
              (weapon) =>
                requestedCard && requestedRawName &&
                weapon.sourceCardId === requestedCard &&
                weapon.sourceRawName === requestedRawName,
            );
        const defaultWeapon = exact ?? result.weapons.find(({ overheat }) => overheat) ?? result.weapons[0];
        if (defaultWeapon) setSelectedIds([defaultWeapon.id]);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Wiki 武器数据加载失败");
        setLoadState("error");
      });
  }, []);

  const filteredWeapons = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return weapons.slice(0, 120);
    return weapons
      .filter((weapon) => `${weapon.label} ${weapon.sourceLabel} ${weapon.assignmentId}`.toLocaleLowerCase("zh-CN").includes(normalized))
      .slice(0, 120);
  }, [query, weapons]);

  const selectedWeapons = useMemo(
    () => selectedIds.map((id) => weapons.find((weapon) => weapon.id === id)).filter((weapon): weapon is WeaponDpsWeapon => Boolean(weapon)),
    [selectedIds, weapons],
  );
  const rows = useMemo(
    () => selectedWeapons.map((weapon) => ({
      weapon,
      optimization: optimizeWeaponRhythm(weapon, {
        targetHealth,
        horizonSeconds,
        useMagazineReload: true,
      }),
    })),
    [selectedWeapons, targetHealth, horizonSeconds],
  );
  const primaryRow = rows[0] ?? null;
  const dataStatus = loadState !== "ready"
    ? loadState
    : overheatProfileCount === 0
      ? "missing"
      : overheatProfileCount < weapons.length
        ? "partial"
        : "ready";

  const toggleWeapon = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  return (
    <main className="weapon-dps-page">
      <header className="weapon-dps-hero">
        <div className="weapon-dps-hero__topline">
          <a className="weapon-dps-back" href="/" aria-label="返回 Armor 首页">
            <ArrowLeft size={16} aria-hidden="true" /> 返回 Armor
          </a>
          <span className="weapon-dps-kicker"><Gauge size={14} aria-hidden="true" /> Weapon rhythm lab</span>
        </div>
        <div className="weapon-dps-hero__grid">
          <div>
            <p className="weapon-dps-eyebrow">不是只看纸面射速</p>
            <h1>武器节奏与 DPS 对比</h1>
            <p className="weapon-dps-lede">
              同一张表里并排放入多把精确绑定的武器，比较“连续打到过热”和“短停控温”到底谁更快把目标打掉。
            </p>
          </div>
          <div className="weapon-dps-hero__insight">
            <Flame size={20} aria-hidden="true" />
            <span><strong>反直觉点</strong>：短停牺牲的是瞬时射速，换来的可能是更少的过热锁定。</span>
          </div>
        </div>
      </header>

      <section className="weapon-dps-workbench" aria-label="武器 DPS 工作台">
        <aside className="weapon-dps-library">
          <div className="weapon-dps-section-heading">
            <div><span>选择武器</span><strong>{selectedWeapons.length} / 4</strong></div>
            <small>精确 assignment，不合并同名变体</small>
          </div>
          <input
            className="weapon-dps-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索武器、载具或 assignment"
            aria-label="搜索武器、载具或 assignment"
          />
          {loadState === "loading" ? <div className="weapon-dps-status">正在从 Wiki 载入武器事实…</div> : null}
          {loadState === "error" ? <div className="weapon-dps-status weapon-dps-status--error" role="alert">{loadError}</div> : null}
          {loadState === "ready" && filteredWeapons.length === 0 ? <div className="weapon-dps-status">没有匹配的 Wiki 武器。</div> : null}
          <div className="weapon-dps-library__list">
            {filteredWeapons.map((weapon) => {
              const selected = selectedIds.includes(weapon.id);
              return (
                <button
                  className="weapon-dps-library__item"
                  type="button"
                  data-selected={selected}
                  key={weapon.id}
                  onClick={() => toggleWeapon(weapon.id)}
                  disabled={!selected && selectedIds.length >= 4}
                >
                  <span className="weapon-dps-library__item-mark">{selected ? "✓" : <Plus size={13} aria-hidden="true" />}</span>
                  <span><strong>{weapon.label}</strong><small>{weapon.sourceLabel}</small></span>
                  <em data-thermal={thermalTone(weapon)}>{weapon.overheat ? "温控" : "待补"}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="weapon-dps-main">
          <div className="weapon-dps-toolbar">
            <div className="weapon-dps-toolbar__summary">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>目标 <strong>{formatNumber(targetHealth, 0)} HP</strong></span>
              <span>观察窗 <strong>{formatNumber(horizonSeconds, 0)} s</strong></span>
              <span className={`weapon-dps-source-state weapon-dps-source-state--${dataStatus}`}>
                {dataStatus === "missing"
                  ? "Wiki 温控字段待发布"
                  : dataStatus === "partial"
                    ? `Wiki 温控 ${overheatProfileCount}/${weapons.length}`
                    : sourceRevision
                      ? `Wiki ${sourceRevision}`
                      : "Wiki 数据"}
              </span>
            </div>
            <span className="weapon-dps-auto-badge"><RotateCcw size={14} aria-hidden="true" /> 自动搜索节奏</span>
          </div>

          {dataStatus === "missing" ? (
            <div className="weapon-dps-data-notice" role="status">
              <Info size={17} aria-hidden="true" />
              <span><strong>Wiki 当前版本还没有发布 overheat profile。</strong> 下面仍可比较 Wiki 已提供的单发伤害、射击间隔和换弹；温控结论会在 Wiki 发布观测/投影字段后自动启用，Armor 不会本地猜测。</span>
            </div>
          ) : null}
          {dataStatus === "partial" ? (
            <div className="weapon-dps-data-notice" role="status">
              <Info size={17} aria-hidden="true" />
              <span><strong>温控模型只对已闭合的精确绑定启用。</strong> 当前 Wiki 提供 {overheatProfileCount} / {weapons.length} 个 assignment 的过热字段；其余武器仍可比较射击间隔、伤害和换弹，但不会被猜测成“不会过热”。</span>
            </div>
          ) : null}

          <ComparisonTable rows={rows} selectedWeapons={selectedWeapons} />
          <RhythmPlanner rows={rows} primaryRow={primaryRow} />

          {selectedWeapons.length === 0 ? (
            <div className="weapon-dps-empty"><TimerReset size={22} aria-hidden="true" /><strong>从左侧加入武器</strong><span>选中两把以上，比较才会显出节奏差。</span></div>
          ) : null}

          <div className="weapon-dps-method-note"><Info size={14} aria-hidden="true" /> 自动比较连续射击与 372 组短停候选，计入射速、换弹、升温和冷却；用户不需要猜节奏。</div>
        </div>
      </section>

      <footer className="weapon-dps-footer-note">
        <span>Armor 负责选择与模拟</span><i />
        <span>Wiki 负责精确武器事实</span><i />
        <span>网络触发延迟：下一阶段</span>
      </footer>
    </main>
  );
}

function ComparisonTable({
  rows,
  selectedWeapons,
}: {
  rows: Array<{ weapon: WeaponDpsWeapon; optimization: WeaponDpsOptimization }>;
  selectedWeapons: WeaponDpsWeapon[];
}) {
  return (
    <section className="weapon-dps-card weapon-dps-card--table">
      <div className="weapon-dps-card__heading"><div><span>同表对比</span><h2>连续烧 vs 短停控温</h2></div><small>{selectedWeapons.length} 个精确绑定</small></div>
      <div className="weapon-dps-table-wrap">
        <table className="weapon-dps-table">
          <thead><tr><th>武器</th><th>射击间隔</th><th>弹匣</th><th>连续烧基线</th><th>自动最佳节奏</th><th>自动收益</th></tr></thead>
          <tbody>
            {rows.map(({ weapon, optimization }) => {
              const recommended = optimization.recommended ?? optimization.burn;
              const mathematical = optimization.best ?? recommended;
              const gain = recommended.result.totalDamage - optimization.burn.result.totalDamage;
              return <tr key={weapon.id}>
                <th><strong>{weapon.label}</strong><small>{weapon.sourceLabel}</small><ResultBadge simulation={recommended.result} /></th>
                <td>{formatSeconds(weapon.timeBetweenShotsSeconds)}<small>{formatNumber(weapon.damagePerShot, 0)} damage / shot</small></td>
                <td>{weapon.magazineSize ? `${formatNumber(weapon.magazineSize, 0)} 发` : "—"}<small>{formatSeconds(weapon.tacticalReloadSeconds)} reload</small></td>
                <td><strong>{simulationHeadline(optimization.burn.result)}</strong><small>{optimization.burn.result.overheatCount > 0 ? `${formatSeconds(optimization.burn.result.firstOverheatSeconds)} 首次锁定` : "未触发过热"}</small></td>
                <td><strong>{simulationHeadline(recommended.result)}</strong><small>{rhythmPlanLabel(optimization)}{mathematical !== recommended ? ` · 数学上还快 ${formatSeconds(optimization.practical.deltaSeconds)}` : ""}</small></td>
                <td className={gain >= 0 ? "weapon-dps-positive" : "weapon-dps-negative"}>{gain >= 0 ? "+" : ""}{formatNumber(gain, 0)}<small>实战推荐 / {formatNumber(recommended.result.elapsedSeconds, 0)} s</small></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RhythmPlanner({
  rows,
  primaryRow,
}: {
  rows: Array<{ weapon: WeaponDpsWeapon; optimization: WeaponDpsOptimization }>;
  primaryRow: { weapon: WeaponDpsWeapon; optimization: WeaponDpsOptimization } | null;
}) {
  return (
    <section className="weapon-dps-card weapon-dps-card--planner">
      <div className="weapon-dps-card__heading"><div><span>节奏时间轴</span><h2>在同一秒轴上看懂开火、热量、锁定与伤害</h2></div><small>实战推荐自动计算</small></div>
      {primaryRow ? (
        <div className="weapon-dps-planner-grid">
          <div className="weapon-dps-planner-hero">
            <span className="weapon-dps-planner-hero__eyebrow">当前主武器</span>
            <h3>{primaryRow.weapon.label}</h3>
            <p>{primaryRow.weapon.sourceLabel}</p>
            <div className="weapon-dps-planner-callout">
              <Flame size={18} aria-hidden="true" />
              <strong>{primaryRow.optimization.recommended?.plan.mode === "controlled" ? "自动选择短停控温" : "自动选择连续射击"}</strong>
              <span>{primaryRow.optimization.recommended?.plan.mode === "controlled" ? "短停减少了过热锁定，并且优势超过实战阈值。" : primaryRow.optimization.best !== primaryRow.optimization.recommended ? "短停数学上略快，但优势太小，实战推荐连续射击。" : "在当前武器、目标和观察窗里，连续射击综合击毁时间更短。"}</span>
            </div>
          </div>
          <div className="weapon-dps-planner-comparison">
            <div className="weapon-dps-plan-card"><span>连续烧基线</span><strong>{simulationHeadline(primaryRow.optimization.burn.result)}</strong><small>{primaryRow.optimization.burn.result.overheatCount} 次锁定 · {primaryRow.optimization.burn.result.shots} 发</small><WeaponRhythmTimeline simulation={primaryRow.optimization.burn.result} targetHealth={6000} /></div>
            <div className="weapon-dps-plan-card weapon-dps-plan-card--controlled"><span>实战推荐：{rhythmPlanLabel(primaryRow.optimization)}</span><strong>{simulationHeadline((primaryRow.optimization.recommended ?? primaryRow.optimization.burn).result)}</strong><small>{(primaryRow.optimization.recommended ?? primaryRow.optimization.burn).result.overheatCount} 次锁定 · {(primaryRow.optimization.recommended ?? primaryRow.optimization.burn).result.shots} 发</small><WeaponRhythmTimeline simulation={(primaryRow.optimization.recommended ?? primaryRow.optimization.burn).result} targetHealth={6000} /></div>
          </div>
        </div>
      ) : <div className="weapon-dps-empty">先从左侧选择武器。</div>}
      {rows.length > 1 ? <div className="weapon-dps-planner-rank"><BarChart3 size={16} aria-hidden="true" /><span>其他已选武器的实战推荐收益：</span>{rows.slice(1).map(({ weapon, optimization }) => { const best = (optimization.recommended ?? optimization.burn).result; const gain = best.totalDamage - optimization.burn.result.totalDamage; return <b key={weapon.id}>{weapon.label} <em>{gain >= 0 ? "+" : ""}{formatNumber(gain, 0)}</em></b>; })}</div> : null}
    </section>
  );
}
