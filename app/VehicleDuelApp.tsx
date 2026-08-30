"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Crosshair,
  Search,
  TimerReset,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DEFAULT_VIEWER_NAVIGATION_STATE } from "../lib/catalog-navigation.mjs";
import {
  resolveVehicleDuel,
  vehicleDuelVictoryMarginSeconds,
  type VehicleDuelAttackResolution,
  type VehicleDuelLethalPath,
  type VehicleDuelResolution,
} from "../lib/vehicle-duel-model.ts";
import { weaponNameZh } from "../lib/weapon-display-name.ts";
import type {
  WeaponDpsEvent,
  WeaponDpsSimulation,
} from "../lib/weapon-dps-model.ts";
import { armorPath } from "../lib/public-site-topology.mjs";
import { wikiAssetUrl } from "../lib/wiki-source.ts";
import {
  RuntimeVehicleViewer,
  type RuntimeVehicleDuelHitSnapshot,
  type RuntimeVehicleViewerDisplayOverrides,
} from "./RuntimeVehicleViewer.tsx";
import { WeaponRhythmTimeline } from "./WeaponRhythmTimeline.tsx";
import type { RuntimeAttackSourceWeapon } from "./runtime-probe-weapon-labels.ts";
import type { SiteEdition } from "./site-edition.ts";
import {
  vehicleDuelData,
  type VehicleDuelBundle,
  type VehicleDuelOption,
} from "./vehicle-duel-data.ts";
import {
  normalizeVehicleSearch,
  rankVehicleCandidateSearch,
  rankVerifiedVehicleCandidateSearch,
} from "./vehicle-search.ts";
import type { ViewerNavigationState } from "./viewer-types.ts";

interface BundleState {
  optionId: string;
  bundle: VehicleDuelBundle | null;
  error: string | null;
}

function internalCatalogHref(siteEdition: SiteEdition) {
  if (process.env.NODE_ENV === "development") {
    return siteEdition === "china" ? "/china" : "/";
  }
  return armorPath(siteEdition);
}

function defaultNavigation(): ViewerNavigationState {
  return { ...DEFAULT_VIEWER_NAVIGATION_STATE } as ViewerNavigationState;
}

function optionForRequest(
  options: readonly VehicleDuelOption[],
  requested: string | null,
) {
  if (!requested) return null;
  return options.find(
    (option) => option.id === requested || option.cardId === requested,
  ) ?? null;
}

function defaultPair(
  options: readonly VehicleDuelOption[],
  leftRequested: string | null,
  rightRequested: string | null,
) {
  const left = optionForRequest(options, leftRequested) ??
    options.find(({ cardId }) => cardId === "afu--bmp-2--ifv") ??
    options[0] ?? null;
  const right = optionForRequest(options, rightRequested) ??
    options.find(({ cardId }) => cardId === "usa--m2a3--ifv") ??
    options.find(({ id }) => id !== left?.id) ??
    left;
  return { left, right };
}

function useBundle(option: VehicleDuelOption | null) {
  const [state, setState] = useState<BundleState>({
    optionId: "",
    bundle: null,
    error: null,
  });
  useEffect(() => {
    if (!option) {
      setState({ optionId: "", bundle: null, error: null });
      return;
    }
    let active = true;
    setState((current) => ({
      optionId: option.id,
      bundle: current.bundle,
      error: null,
    }));
    void vehicleDuelData.loadVehicle(option)
      .then((bundle) => {
        if (active) setState({ optionId: option.id, bundle, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          optionId: option.id,
          bundle: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
    };
  }, [option]);
  return state;
}

function attackSource(bundle: VehicleDuelBundle | null) {
  return bundle
    ? bundle.attackLibrary.runtimeAttackSourceForId(bundle.option.attackSourceId)
    : null;
}

function controlledAttackNavigation(
  current: ViewerNavigationState,
  bundle: VehicleDuelBundle,
  weaponIndex: number,
) {
  const source = attackSource(bundle);
  if (!source) return current;
  return {
    ...current,
    protection: false,
    attacker: source.shareSlug,
    weapon: "",
    weaponIndex: weaponIndex === 0 ? null : weaponIndex,
    distance: 0,
  } satisfies ViewerNavigationState;
}

function duelWeaponLabel(weapon: RuntimeAttackSourceWeapon) {
  return weaponNameZh(
    weapon.selectorVariant?.label ?? weapon.displayNameZh,
  );
}

interface DuelSearchChoice {
  id: string;
  primary: string;
  secondary: string;
  context: string;
}

function DuelSearchSelect({
  label,
  ariaLabel,
  searchPlaceholder,
  selectedLabel,
  selectedId,
  query,
  choices,
  disabled = false,
  emptyLabel,
  onQueryChange,
  onSelect,
}: {
  label: string;
  ariaLabel: string;
  searchPlaceholder: string;
  selectedLabel: string;
  selectedId: string;
  query: string;
  choices: readonly DuelSearchChoice[];
  disabled?: boolean;
  emptyLabel: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const listId = `${ariaLabel.replace(/\s+/gu, "-")}-results`;

  useEffect(() => {
    setPreviewIndex(0);
  }, [choices.length, query]);

  const commit = (choice: DuelSearchChoice) => {
    onSelect(choice.id);
    onQueryChange("");
    setOpen(false);
  };

  return (
    <div
      className="vehicle-duel__search-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onQueryChange("");
          setOpen(false);
        }
      }}
    >
      <span>{label}</span>
      <div className="vehicle-duel__search-select" data-open={open} data-disabled={disabled}>
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          value={open ? query : selectedLabel}
          placeholder={searchPlaceholder}
          readOnly={!open}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onQueryChange("");
              setOpen(false);
              event.currentTarget.blur();
              return;
            }
            if (choices.length === 0) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setPreviewIndex((current) =>
                (current + direction + choices.length) % choices.length,
              );
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              commit(choices[previewIndex] ?? choices[0]);
            }
          }}
        />
        <ChevronDown size={14} aria-hidden="true" />
        {open ? (
          <div className="vehicle-duel__search-results" id={listId} role="listbox">
            {choices.length === 0 ? (
              <small>{emptyLabel}</small>
            ) : choices.map((choice, index) => (
              <button
                key={choice.id}
                type="button"
                role="option"
                aria-selected={choice.id === selectedId}
                data-preview={index === previewIndex}
                data-selected={choice.id === selectedId}
                onMouseEnter={() => setPreviewIndex(index)}
                onFocus={() => setPreviewIndex(index)}
                onClick={() => commit(choice)}
              >
                <strong>{choice.primary}</strong>
                <span>{choice.secondary}</span>
                <small>{choice.context}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function vehicleSearchRank(option: VehicleDuelOption, query: string) {
  return rankVehicleCandidateSearch({
    promoEntryId: option.cardId,
    primary: option.searchPrimary,
    aliases: option.searchAliases,
    rawName: option.rawName,
    groupId: option.attackSourcePresentation.groupId,
    context: option.searchContext,
  }, query);
}

function weaponSearchRank(weapon: RuntimeAttackSourceWeapon, query: string) {
  return rankVerifiedVehicleCandidateSearch({
    primary: [
      duelWeaponLabel(weapon),
      weapon.displayNameZh,
      weapon.displayNameEnglish,
      weapon.displayName,
      weapon.gunName,
      weapon.projectileName ?? "",
    ],
    aliases: weapon.searchAliases ?? [],
    context: [
      weapon.runtimeAssetPath ?? "",
      weapon.sourceRawName,
      weapon.selectorVariant?.familyLabel ?? "",
      weapon.selectorVariant?.displayLabel ?? "",
      weapon.selectorVariant?.qualifier ?? "",
    ],
  }, query);
}

function DuelDisplayControls({
  value,
  onChange,
}: {
  value: Required<RuntimeVehicleViewerDisplayOverrides>;
  onChange: (value: Required<RuntimeVehicleViewerDisplayOverrides>) => void;
}) {
  const controls = [
    ["physicalPoseEnabled", "真实物理"],
    ["relativeArmorScale", "相对着色"],
    ["specialArmorVisible", "附加装甲"],
    ["exteriorSpacedArmorHighlight", "外观装甲高亮"],
  ] as const;
  return (
    <nav className="vehicle-duel__display-controls" aria-label="同步调节双侧载具显示">
      <span>双侧显示</span>
      {controls.map(([key, label]) => (
        <button
          key={key}
          className="viewer-protection-switch"
          type="button"
          role="switch"
          aria-checked={value[key]}
          data-active={value[key]}
          onClick={() => onChange({ ...value, [key]: !value[key] })}
        >
          <span className="viewer-protection-switch__track" aria-hidden="true"><span /></span>
          <span>{label}</span>
          <strong>{value[key] ? "开" : "关"}</strong>
        </button>
      ))}
    </nav>
  );
}

function VehicleSelect({
  side,
  options,
  selected,
  bundle,
  weaponIndex,
  onVehicleChange,
  onWeaponChange,
}: {
  side: "A" | "B";
  options: readonly VehicleDuelOption[];
  selected: VehicleDuelOption;
  bundle: VehicleDuelBundle | null;
  weaponIndex: number;
  onVehicleChange: (id: string) => void;
  onWeaponChange: (index: number) => void;
}) {
  const source = attackSource(bundle);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [weaponQuery, setWeaponQuery] = useState("");
  const vehicleMatches = useMemo(() => {
    if (!normalizeVehicleSearch(vehicleQuery)) return options;
    return options
      .map((option, index) => ({
        option,
        index,
        rank: vehicleSearchRank(option, vehicleQuery),
      }))
      .filter(
        (match): match is { option: VehicleDuelOption; index: number; rank: number } =>
          match.rank !== null,
      )
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .map(({ option }) => option);
  }, [options, vehicleQuery]);
  const weaponMatches = useMemo(() => {
    const weapons = source?.weapons ?? [];
    if (!normalizeVehicleSearch(weaponQuery)) return weapons;
    return weapons
      .map((weapon, index) => ({
        weapon,
        index,
        rank: weaponSearchRank(weapon, weaponQuery),
      }))
      .filter(
        (match): match is { weapon: RuntimeAttackSourceWeapon; index: number; rank: number } =>
          match.rank !== null,
      )
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .map(({ weapon }) => weapon);
  }, [source, weaponQuery]);
  const selectedWeapon = source?.weapons[weaponIndex] ?? null;
  const vehicleChoices = vehicleMatches.map((option) => ({
    id: option.id,
    primary: option.displayName,
    secondary: option.typeName,
    context: option.factionName,
  }));
  const weaponChoices = weaponMatches.map((weapon) => {
    const index = source?.weapons.indexOf(weapon) ?? 0;
    const primary = duelWeaponLabel(weapon);
    return {
      id: String(index),
      primary,
      secondary: weapon.gunName === primary
        ? weapon.projectileName ?? "当前弹种"
        : weapon.gunName,
      context: weapon.selectorVariant?.familyLabel ?? weapon.projectileName ?? "当前载具武器",
    };
  });

  useEffect(() => {
    setVehicleQuery("");
    setWeaponQuery("");
  }, [selected.id]);

  return (
    <div className="vehicle-duel__selectors">
      <DuelSearchSelect
        label={`${side} 方载具`}
        ariaLabel={`搜索并选择 ${side} 方载具`}
        searchPlaceholder="搜索名称 / 俗称 / 拼音"
        selectedLabel={`${selected.displayName} · ${selected.typeName}`}
        selectedId={selected.id}
        query={vehicleQuery}
        choices={vehicleChoices}
        emptyLabel="没有匹配载具"
        onQueryChange={setVehicleQuery}
        onSelect={onVehicleChange}
      />
      <DuelSearchSelect
        label="武器 / 弹种"
        ariaLabel={`搜索并选择 ${side} 方武器或弹种`}
        searchPlaceholder="搜索武器 / 弹种"
        selectedLabel={selectedWeapon ? duelWeaponLabel(selectedWeapon) : "正在载入武器"}
        selectedId={String(source?.weapons[weaponIndex] ? weaponIndex : 0)}
        query={weaponQuery}
        choices={weaponChoices}
        disabled={!source}
        emptyLabel="没有匹配武器或弹种"
        onQueryChange={setWeaponQuery}
        onSelect={(index) => onWeaponChange(Number(index))}
      />
    </div>
  );
}

function TargetViewer({
  targetSide,
  bundle,
  attackerBundle,
  attackerSide,
  navigation,
  displayOverrides,
  onNavigationChange,
  onHitChange,
}: {
  targetSide: "A" | "B";
  bundle: VehicleDuelBundle;
  attackerBundle: VehicleDuelBundle;
  attackerSide: "A" | "B";
  navigation: ViewerNavigationState;
  displayOverrides: Required<RuntimeVehicleViewerDisplayOverrides>;
  onNavigationChange: (state: ViewerNavigationState) => void;
  onHitChange: (snapshot: RuntimeVehicleDuelHitSnapshot | null) => void;
}) {
  const modes = [
    ["armor", "装甲"],
    ["interior", "内构"],
    ["exterior", "外观"],
  ] as const;
  const activeModeIndex = Math.max(
    0,
    modes.findIndex(([mode]) => mode === navigation.view),
  );
  return (
    <section className="vehicle-duel__target">
      <header>
        <span className="vehicle-duel__aim-label"><Crosshair size={14} /> {attackerSide} 方选择命中位置</span>
        <nav
          className="viewer-mode-tabs vehicle-duel__mode-tabs"
          aria-label={`${targetSide} 方命中视图`}
          style={{
            "--viewer-mode-count": modes.length,
            "--viewer-mode-index": activeModeIndex,
          } as CSSProperties}
        >
          <span className="viewer-mode-tabs__thumb" aria-hidden="true" />
          {modes.map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              data-active={navigation.view === mode}
              aria-pressed={navigation.view === mode}
              onClick={() => onNavigationChange({ ...navigation, view: mode })}
            >{label}</button>
          ))}
        </nav>
        <strong>{targetSide} 方 · {bundle.option.displayName}</strong>
      </header>
      <div className="vehicle-duel__viewer">
        <RuntimeVehicleViewer
          key={bundle.option.id}
          preview={bundle.preview}
          referenceData={bundle.referenceData}
          showChrome={false}
          mode={navigation.view === "exterior"
            ? "exterior"
            : navigation.view === "interior"
              ? "interior"
              : "armor"}
          displayName={bundle.option.displayName}
          navigationState={navigation}
          onNavigationStateChange={onNavigationChange}
          attackLibraryOverride={attackerBundle.attackLibrary}
          duelTarget
          allowGlobalAttackSources={false}
          displayOverrides={displayOverrides}
          shotTraceLimit={1}
          onDuelHitChange={onHitChange}
        />
      </div>
    </section>
  );
}

function poolLabel(poolKind: string) {
  return poolKind === "ammo-rack" ? "弹药架" : "车体";
}

function verdictLabel(
  resolution: VehicleDuelResolution,
  leftName: string,
  rightName: string,
) {
  if (resolution.winner === "left") return `${leftName}胜出`;
  if (resolution.winner === "right") return `${rightName}胜出`;
  if (resolution.winner === "draw") return "同归于尽";
  return "等待有效命中";
}

function verdictReason(
  resolution: VehicleDuelResolution,
  leftName: string,
  rightName: string,
) {
  if (resolution.winner === "unresolved") {
    const leftExhausted = resolution.leftAttack.actualSimulation?.ammoExhausted === true;
    const rightExhausted = resolution.rightAttack.actualSimulation?.ammoExhausted === true;
    if (leftExhausted && rightExhausted) return "双方弹药耗尽，均无法击毁目标";
    if (leftExhausted) return `${leftName}弹药耗尽，当前命中无法击毁目标`;
    if (rightExhausted) return `${rightName}弹药耗尽，当前命中无法击毁目标`;
    return "双方都需要先选择能够造成致命伤害的命中位置";
  }
  if (resolution.winner === "draw") {
    return `${resolution.decisiveTimeSeconds?.toFixed(2)} 秒的射击同时结算`;
  }
  const loss = resolution.winner === "left" ? resolution.rightLoss : resolution.leftLoss;
  const loser = resolution.winner === "left" ? rightName : leftName;
  return loss?.poolKind === "ammo-rack"
    ? `${loser}弹药架归零并在同一时刻停止后续输出`
    : loss?.candidate.result.burnDamage
      ? `${loser}在正常交战状态进入低血量自燃，车体先归零`
      : `${loser}车体血量先归零`;
}

interface DuelInteractionBeat {
  key: string;
  side: "left" | "right";
  timeSeconds: number;
  kind: WeaponDpsEvent["kind"];
  label: string;
}

interface DuelInteractionMoment {
  key: string;
  timeSeconds: number;
  left: DuelInteractionBeat[];
  right: DuelInteractionBeat[];
}

function sampledShotNumbers(events: readonly WeaponDpsEvent[], limit = 7) {
  const shots = events.filter(({ kind }) => kind === "shot");
  if (shots.length <= limit) return new Set(shots.map(({ shotNumber }) => shotNumber));
  return new Set(Array.from({ length: limit }, (_, index) =>
    shots[Math.round(index * (shots.length - 1) / (limit - 1))].shotNumber
  ));
}

function duelInteractionBeats(
  simulation: WeaponDpsSimulation | null,
  side: DuelInteractionBeat["side"],
) {
  if (!simulation) return [];
  const shownShots = sampledShotNumbers(simulation.events);
  const burnEvents = simulation.events.filter(({ kind }) => kind === "burn");
  const shownBurnTimes = new Set(
    [burnEvents[0]?.timeSeconds, burnEvents.at(-1)?.timeSeconds]
      .filter((value): value is number => value !== undefined),
  );
  return simulation.events.flatMap((event, index): DuelInteractionBeat[] => {
    if (event.kind === "pause") return [];
    if (event.kind === "shot" && !shownShots.has(event.shotNumber)) return [];
    if (event.kind === "burn" && !shownBurnTimes.has(event.timeSeconds)) return [];
    const label = event.kind === "shot"
      ? `第 ${event.shotNumber} 发`
      : event.kind === "reload"
        ? "换弹完成"
        : event.kind === "overheat"
          ? "过热锁定"
          : event.kind === "unlock"
            ? "冷却解锁"
            : "目标自燃";
    return [{
      key: `${side}:${event.kind}:${event.timeSeconds}:${index}`,
      side,
      timeSeconds: event.timeSeconds,
      kind: event.kind,
      label,
    }];
  });
}

function duelInteractionMoments(beats: readonly DuelInteractionBeat[]) {
  const moments = new Map<string, DuelInteractionMoment>();
  for (const beat of beats) {
    const key = beat.timeSeconds.toFixed(2);
    const moment = moments.get(key) ?? {
      key,
      timeSeconds: beat.timeSeconds,
      left: [],
      right: [],
    };
    moment[beat.side].push(beat);
    moments.set(key, moment);
  }
  return [...moments.values()].sort((left, right) =>
    left.timeSeconds - right.timeSeconds || left.key.localeCompare(right.key, "en")
  );
}

function DuelInteractionDiagram({
  resolution,
  leftName,
  rightName,
}: {
  resolution: VehicleDuelResolution | null;
  leftName: string;
  rightName: string;
}) {
  const beats = [
    ...duelInteractionBeats(resolution?.leftAttack.actualSimulation ?? null, "left"),
    ...duelInteractionBeats(resolution?.rightAttack.actualSimulation ?? null, "right"),
  ].sort(
    (left, right) =>
      left.timeSeconds - right.timeSeconds ||
      left.side.localeCompare(right.side, "en") ||
      left.key.localeCompare(right.key, "en"),
  );
  const moments = duelInteractionMoments(beats);
  return (
    <section className="vehicle-duel__interaction" aria-label="双方射击互动时间轴">
      <header>
        <strong title={leftName}>{leftName}</strong>
        <span>时间</span>
        <strong title={rightName}>{rightName}</strong>
      </header>
      <div className="vehicle-duel__interaction-track">
        {moments.length === 0 ? (
          <p>双方选择命中点后显示交战互动</p>
        ) : moments.map((moment) => (
          <div
            className="vehicle-duel__interaction-beat"
            key={moment.key}
          >
            <span className="vehicle-duel__interaction-events" data-side="left">
              {moment.left.map((beat) => (
                <span data-kind={beat.kind} key={beat.key}><b>{beat.label}</b><i>→</i></span>
              ))}
            </span>
            <time>{moment.timeSeconds.toFixed(2)}s</time>
            <span className="vehicle-duel__interaction-events" data-side="right">
              {moment.right.map((beat) => (
                <span data-kind={beat.kind} key={beat.key}><i>←</i><b>{beat.label}</b></span>
              ))}
            </span>
          </div>
        ))}
        {resolution?.decisiveTimeSeconds !== null && resolution ? (
          <div className="vehicle-duel__interaction-terminal">
            <strong>胜负判定</strong>
          </div>
        ) : null}
      </div>
      <footer>同一时间发生的攻击同时结算</footer>
    </section>
  );
}

function DuelJudge({
  resolution,
  leftName,
  rightName,
}: {
  resolution: VehicleDuelResolution | null;
  leftName: string;
  rightName: string;
}) {
  const marginSeconds = resolution
    ? vehicleDuelVictoryMarginSeconds(resolution)
    : null;
  const losingAttack = resolution?.winner === "left"
    ? resolution.rightAttack
    : resolution?.winner === "right"
      ? resolution.leftAttack
      : null;
  return (
    <aside className="vehicle-duel__judge" data-winner={resolution?.winner ?? "pending"}>
      <header className="vehicle-duel__verdict">
        <span>交战节奏</span>
        <strong>{resolution
          ? verdictLabel(resolution, leftName, rightName)
          : "等待命中"}</strong>
        <b>{resolution?.decisiveTimeSeconds === null || !resolution
          ? "—"
          : `${resolution.decisiveTimeSeconds.toFixed(2)}s`}</b>
        <small>{resolution?.winner === "left" || resolution?.winner === "right"
          ? marginSeconds === null
            ? losingAttack?.actualSimulation?.ammoExhausted
              ? "对方弹药耗尽"
              : "对方暂无击毁时间"
            : `领先 ${marginSeconds.toFixed(2)}s`
          : resolution?.winner === "draw"
            ? "时间差 0.00s"
            : "双方从 0 秒同时开火"}</small>
      </header>
      <DuelInteractionDiagram
        resolution={resolution}
        leftName={leftName}
        rightName={rightName}
      />
    </aside>
  );
}

function DuelCurve({
  side,
  vehicleName,
  incomingAttack,
  selfAttack,
  incomingWeapon,
}: {
  side: "A" | "B";
  vehicleName: string;
  incomingAttack: VehicleDuelAttackResolution | null;
  selfAttack: VehicleDuelAttackResolution | null;
  incomingWeapon: RuntimeAttackSourceWeapon | null;
}) {
  const incomingSimulation = incomingAttack?.actualSimulation ?? null;
  const incomingTarget = incomingAttack?.actualTarget ?? null;
  const selfSimulation = selfAttack?.actualSimulation ?? null;
  const selfTarget = selfAttack?.actualTarget ?? null;
  if (!incomingSimulation || !incomingTarget || !selfSimulation || !selfTarget) {
    return (
      <section className="vehicle-duel__curve vehicle-duel__curve--empty">
        <span>{vehicleName}交战图表</span>
        <strong>请在双方载具上选择有效命中位置</strong>
      </section>
    );
  }
  return (
    <section className="vehicle-duel__curve" data-side={side}>
      <header>
        <span title={vehicleName}>{vehicleName}</span>
        <strong>
          本车 {selfSimulation.shots} 发 · 承受 {incomingSimulation.shots} 发
        </strong>
      </header>
      <small>
        {incomingWeapon ? duelWeaponLabel(incomingWeapon) : "对方弹种"} → 本车{poolLabel(incomingTarget.poolKind)}
        {" · "}本车输出 → 对方{poolLabel(selfTarget.poolKind)}
      </small>
      <WeaponRhythmTimeline
        simulation={selfSimulation}
        targetHealth={selfTarget.maxHealth}
        targetLabel={poolLabel(selfTarget.poolKind)}
        receivedDamageSimulation={incomingSimulation}
        receivedTargetHealth={incomingTarget.maxHealth}
        receivedTargetLabel={poolLabel(incomingTarget.poolKind)}
        compact
      />
    </section>
  );
}

function DuelRace({
  resolution,
  leftName,
  rightName,
}: {
  resolution: VehicleDuelResolution | null;
  leftName: string;
  rightName: string;
}) {
  const leftTime = resolution?.rightLoss?.timeSeconds ?? null;
  const rightTime = resolution?.leftLoss?.timeSeconds ?? null;
  const maximum = Math.max(leftTime ?? 0, rightTime ?? 0, 1);
  const row = (
    side: "left" | "right",
    label: string,
    time: number | null,
    loss: VehicleDuelLethalPath | null,
    attack: VehicleDuelAttackResolution | null,
  ) => (
    <div className="vehicle-duel__race-row" data-side={side}>
      <span title={label}>{label}</span>
      <i><b style={{ width: `${time === null ? 0 : Math.min(100, time / maximum * 100)}%` }} /></i>
      <strong>{time === null
        ? attack?.actualSimulation?.ammoExhausted
          ? "弹药耗尽"
          : "—"
        : `${time.toFixed(2)} s`}</strong>
      <small>{loss
        ? poolLabel(loss.poolKind)
        : attack?.actualTarget
          ? poolLabel(attack.actualTarget.poolKind)
          : "未命中"}</small>
    </div>
  );
  return (
    <section className="vehicle-duel__race">
      <header>
        <TimerReset size={15} />
        <span>致命时间赛道</span>
        <b>{resolution
          ? verdictReason(resolution, leftName, rightName)
          : "双方从 0 秒同时开火"}</b>
        <small>同一时间的射击同时结算</small>
      </header>
      {row("left", `${leftName} → ${rightName}`, leftTime, resolution?.rightLoss ?? null, resolution?.leftAttack ?? null)}
      {row("right", `${rightName} → ${leftName}`, rightTime, resolution?.leftLoss ?? null, resolution?.rightAttack ?? null)}
    </section>
  );
}

export function VehicleDuelApp({ siteEdition }: { siteEdition: SiteEdition }) {
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);
  const [options, setOptions] = useState<VehicleDuelOption[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [leftOptionId, setLeftOptionId] = useState("");
  const [rightOptionId, setRightOptionId] = useState("");
  const [leftWeaponIndex, setLeftWeaponIndex] = useState(0);
  const [rightWeaponIndex, setRightWeaponIndex] = useState(0);
  const [leftNavigation, setLeftNavigation] = useState(defaultNavigation);
  const [rightNavigation, setRightNavigation] = useState(defaultNavigation);
  const [displayOverrides, setDisplayOverrides] = useState<
    Required<RuntimeVehicleViewerDisplayOverrides>
  >({
    physicalPoseEnabled: true,
    relativeArmorScale: false,
    specialArmorVisible: true,
    exteriorSpacedArmorHighlight: false,
  });
  const [leftIncomingHit, setLeftIncomingHit] = useState<RuntimeVehicleDuelHitSnapshot | null>(null);
  const [rightIncomingHit, setRightIncomingHit] = useState<RuntimeVehicleDuelHitSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void vehicleDuelData.loadCatalog(siteEdition)
      .then((nextOptions) => {
        if (!active) return;
        setOptions(nextOptions);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [siteEdition]);

  useEffect(() => {
    if (initializedRef.current || options.length === 0) return;
    initializedRef.current = true;
    const pair = defaultPair(
      options,
      searchParams.get("left"),
      searchParams.get("right"),
    );
    setLeftOptionId(pair.left?.id ?? "");
    setRightOptionId(pair.right?.id ?? "");
  }, [options, searchParams]);

  const leftOption = options.find(({ id }) => id === leftOptionId) ?? null;
  const rightOption = options.find(({ id }) => id === rightOptionId) ?? null;
  const leftBundleState = useBundle(leftOption);
  const rightBundleState = useBundle(rightOption);
  const leftAttackerBundle = leftBundleState.bundle;
  const rightAttackerBundle = rightBundleState.bundle;
  const leftBundle = leftAttackerBundle?.option.id === leftOption?.id
    ? leftAttackerBundle
    : null;
  const rightBundle = rightAttackerBundle?.option.id === rightOption?.id
    ? rightAttackerBundle
    : null;
  const leftSource = attackSource(leftBundle);
  const rightSource = attackSource(rightBundle);
  const leftWeapon = leftSource?.weapons[leftWeaponIndex] ?? null;
  const rightWeapon = rightSource?.weapons[rightWeaponIndex] ?? null;

  useEffect(() => {
    setLeftWeaponIndex(0);
    setLeftIncomingHit(null);
    setRightIncomingHit(null);
  }, [leftOptionId]);
  useEffect(() => {
    setRightWeaponIndex(0);
    setRightIncomingHit(null);
    setLeftIncomingHit(null);
  }, [rightOptionId]);
  useEffect(() => {
    if (!rightBundle) return;
    setLeftNavigation((current) =>
      controlledAttackNavigation(current, rightBundle, rightWeaponIndex));
  }, [rightBundle, rightWeaponIndex]);
  useEffect(() => {
    if (!leftBundle) return;
    setRightNavigation((current) =>
      controlledAttackNavigation(current, leftBundle, leftWeaponIndex));
  }, [leftBundle, leftWeaponIndex]);

  const onLeftHitChange = useCallback(
    (snapshot: RuntimeVehicleDuelHitSnapshot | null) =>
      setLeftIncomingHit(snapshot),
    [],
  );
  const onRightHitChange = useCallback(
    (snapshot: RuntimeVehicleDuelHitSnapshot | null) =>
      setRightIncomingHit(snapshot),
    [],
  );

  const resolution = useMemo(() =>
    rightIncomingHit && leftIncomingHit
      ? resolveVehicleDuel({
          leftAttack: {
            weapon: rightIncomingHit.weapon,
            targets: rightIncomingHit.targets,
          },
          rightAttack: {
            weapon: leftIncomingHit.weapon,
            targets: leftIncomingHit.targets,
          },
        })
      : null,
  [leftIncomingHit, rightIncomingHit]);

  if (catalogError) {
    return <main className="vehicle-duel vehicle-duel--error"><strong>载具目录加载失败</strong><p>{catalogError}</p></main>;
  }
  if (!leftOption || !rightOption) {
    return <main className="vehicle-duel vehicle-duel--loading"><strong>正在载入载具目录</strong></main>;
  }

  return (
    <main className="vehicle-duel" data-site-edition={siteEdition}>
      <header className="vehicle-duel__heading">
        <Link
          className="vehicle-duel__catalog-link"
          href={internalCatalogHref(siteEdition)}
          aria-label="返回载具目录"
          title="返回载具目录"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- shared brand logo is served by SiguaWiki */}
          <img
            src={wikiAssetUrl("/assets/brand/siguad-wiki-logo.svg")}
            alt=""
            width={42}
            height={49}
            aria-hidden="true"
          />
        </Link>
        <div className="vehicle-duel__title">
          <h1>载具斗蛐蛐</h1>
          <p>双方同时开火；车体或被命中的弹药架先归零的一方落败。</p>
        </div>
        <DuelDisplayControls value={displayOverrides} onChange={setDisplayOverrides} />
      </header>

      <section className="vehicle-duel__arena">
        <article className="vehicle-duel__side" data-side="left">
          <VehicleSelect
            side="A"
            options={options}
            selected={leftOption}
            bundle={leftBundle}
            weaponIndex={leftWeaponIndex}
            onVehicleChange={setLeftOptionId}
            onWeaponChange={setLeftWeaponIndex}
          />
          {leftBundle && rightAttackerBundle ? (
            <TargetViewer
              targetSide="A"
              bundle={leftBundle}
              attackerBundle={rightAttackerBundle}
              attackerSide="B"
              navigation={leftNavigation}
              displayOverrides={displayOverrides}
              onNavigationChange={setLeftNavigation}
              onHitChange={onLeftHitChange}
            />
          ) : (
            <div className="vehicle-duel__viewer-loading">{leftBundleState.error ?? "正在载入 A 方载具"}</div>
          )}
          <DuelCurve
            side="A"
            vehicleName={leftOption.displayName}
            incomingAttack={resolution?.rightAttack ?? null}
            selfAttack={resolution?.leftAttack ?? null}
            incomingWeapon={rightWeapon}
          />
        </article>

        <DuelJudge
          resolution={resolution}
          leftName={leftOption.displayName}
          rightName={rightOption.displayName}
        />

        <article className="vehicle-duel__side" data-side="right">
          <VehicleSelect
            side="B"
            options={options}
            selected={rightOption}
            bundle={rightBundle}
            weaponIndex={rightWeaponIndex}
            onVehicleChange={setRightOptionId}
            onWeaponChange={setRightWeaponIndex}
          />
          {rightBundle && leftAttackerBundle ? (
            <TargetViewer
              targetSide="B"
              bundle={rightBundle}
              attackerBundle={leftAttackerBundle}
              attackerSide="A"
              navigation={rightNavigation}
              displayOverrides={displayOverrides}
              onNavigationChange={setRightNavigation}
              onHitChange={onRightHitChange}
            />
          ) : (
            <div className="vehicle-duel__viewer-loading">{rightBundleState.error ?? "正在载入 B 方载具"}</div>
          )}
          <DuelCurve
            side="B"
            vehicleName={rightOption.displayName}
            incomingAttack={resolution?.leftAttack ?? null}
            selfAttack={resolution?.rightAttack ?? null}
            incomingWeapon={leftWeapon}
          />
        </article>
      </section>

      <DuelRace
        resolution={resolution}
        leftName={leftOption.displayName}
        rightName={rightOption.displayName}
      />
    </main>
  );
}
