"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
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

function groupedOptions(options: readonly VehicleDuelOption[]) {
  return [...new Set(options.map(({ factionName }) => factionName))].map(
    (factionName) => ({
      factionName,
      options: options.filter((option) => option.factionName === factionName),
    }),
  );
}

function duelWeaponLabel(weapon: RuntimeAttackSourceWeapon) {
  return weaponNameZh(
    weapon.selectorVariant?.label ?? weapon.displayNameZh,
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
  const visibleVehicleOptions = vehicleMatches.some(({ id }) => id === selected.id)
    ? vehicleMatches
    : [selected, ...vehicleMatches];
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
  const visibleWeapons = selectedWeapon && !weaponMatches.includes(selectedWeapon)
    ? [selectedWeapon, ...weaponMatches]
    : weaponMatches;

  useEffect(() => {
    setVehicleQuery("");
    setWeaponQuery("");
  }, [selected.id]);

  return (
    <div className="vehicle-duel__selectors">
      <label>
        <span>{side} 方载具</span>
        <span className="vehicle-duel__selector-search global-vehicle-search__input">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={vehicleQuery}
            placeholder="搜索名称 / 俗称 / 拼音"
            aria-label={`搜索 ${side} 方载具`}
            onChange={(event) => setVehicleQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || vehicleMatches.length === 0) return;
              event.preventDefault();
              onVehicleChange(vehicleMatches[0].id);
              setVehicleQuery("");
            }}
          />
        </span>
        <select
          aria-label={`选择 ${side} 方载具`}
          value={selected.id}
          onChange={(event) => {
            onVehicleChange(event.currentTarget.value);
            setVehicleQuery("");
          }}
        >
          {groupedOptions(visibleVehicleOptions).map((group) => (
            <optgroup key={group.factionName} label={group.factionName}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName} · {option.typeName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {normalizeVehicleSearch(vehicleQuery) && vehicleMatches.length === 0 ? (
          <small>没有匹配载具</small>
        ) : null}
      </label>
      <label>
        <span>武器 / 弹种</span>
        <span className="vehicle-duel__selector-search global-vehicle-search__input">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={weaponQuery}
            placeholder="搜索武器 / 弹种"
            aria-label={`搜索 ${side} 方武器或弹种`}
            disabled={!source}
            onChange={(event) => setWeaponQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !source || weaponMatches.length === 0) return;
              event.preventDefault();
              onWeaponChange(source.weapons.indexOf(weaponMatches[0]));
              setWeaponQuery("");
            }}
          />
        </span>
        <select
          aria-label={`选择 ${side} 方武器或弹种`}
          value={source?.weapons[weaponIndex] ? weaponIndex : 0}
          disabled={!source}
          onChange={(event) => {
            onWeaponChange(Number(event.currentTarget.value));
            setWeaponQuery("");
          }}
        >
          {visibleWeapons.map((weapon) => {
            const index = source?.weapons.indexOf(weapon) ?? 0;
            return <option key={weapon.weaponAssignmentId ?? `${weapon.weaponId}:${index}`} value={index}>
              {duelWeaponLabel(weapon)}
            </option>;
          })}
        </select>
        {normalizeVehicleSearch(weaponQuery) && weaponMatches.length === 0 ? (
          <small>没有匹配武器或弹种</small>
        ) : null}
      </label>
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

function verdictLabel(resolution: VehicleDuelResolution) {
  if (resolution.winner === "left") return "A 方胜出";
  if (resolution.winner === "right") return "B 方胜出";
  if (resolution.winner === "draw") return "同归于尽";
  return "等待有效命中";
}

function verdictReason(resolution: VehicleDuelResolution) {
  if (resolution.winner === "unresolved") return "双方都需要先选择能够造成致命伤害的命中位置";
  if (resolution.winner === "draw") {
    return `${resolution.decisiveTimeSeconds?.toFixed(2)} 秒的射击同时结算`;
  }
  const loss = resolution.winner === "left" ? resolution.rightLoss : resolution.leftLoss;
  const loser = resolution.winner === "left" ? "B" : "A";
  return loss?.poolKind === "ammo-rack"
    ? `${loser} 方弹药架归零并在同一时刻停止后续输出`
    : loss?.candidate.result.burnDamage
      ? `${loser} 方在正常交战状态进入低血量自燃，车体先归零`
      : `${loser} 方车体血量先归零`;
}

function DuelJudge({ resolution }: { resolution: VehicleDuelResolution | null }) {
  const marginSeconds = resolution
    ? vehicleDuelVictoryMarginSeconds(resolution)
    : null;
  return (
    <aside className="vehicle-duel__judge" data-winner={resolution?.winner ?? "pending"}>
      <span>交叉射击</span>
      <strong>{resolution ? verdictLabel(resolution) : "等待命中"}</strong>
      <b>{resolution?.decisiveTimeSeconds === null || !resolution
        ? "—"
        : `${resolution.decisiveTimeSeconds.toFixed(2)}s`}</b>
      <small>{resolution?.winner === "left" || resolution?.winner === "right"
        ? marginSeconds === null
          ? "对方暂无击毁时间"
          : `领先 ${marginSeconds.toFixed(2)}s`
        : resolution?.winner === "draw"
          ? "时间差 0.00s"
          : ""}</small>
    </aside>
  );
}

function DuelCurve({
  side,
  attack,
  loss,
  weapon,
}: {
  side: "A" | "B";
  attack: VehicleDuelAttackResolution | null;
  loss: VehicleDuelLethalPath | null;
  weapon: RuntimeAttackSourceWeapon | null;
}) {
  const simulation = attack?.actualSimulation ?? null;
  if (!simulation || !loss) {
    return (
      <section className="vehicle-duel__curve vehicle-duel__curve--empty">
        <span>{side} 方实际输出</span>
        <strong>请在对方载具上选择有效命中位置</strong>
      </section>
    );
  }
  return (
    <section className="vehicle-duel__curve" data-side={side}>
      <header>
        <span>{side} 方实际输出</span>
        <strong>
          {simulation.elapsedSeconds.toFixed(2)} s 截止 · {simulation.shots} 发
          {simulation.burnDamage > 0 ? ` · 正常自燃 ${simulation.burnDamage.toFixed(1)}` : ""}
        </strong>
      </header>
      <small>{weapon ? duelWeaponLabel(weapon) : "当前弹种"} → {poolLabel(loss.poolKind)}</small>
      <WeaponRhythmTimeline
        simulation={simulation}
        targetHealth={loss.maxHealth}
        targetLabel={poolLabel(loss.poolKind)}
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
  ) => (
    <div className="vehicle-duel__race-row" data-side={side}>
      <span title={label}>{label}</span>
      <i><b style={{ width: `${time === null ? 0 : Math.min(100, time / maximum * 100)}%` }} /></i>
      <strong>{time === null ? "—" : `${time.toFixed(2)} s`}</strong>
      <small>{loss ? poolLabel(loss.poolKind) : "未命中"}</small>
    </div>
  );
  return (
    <section className="vehicle-duel__race">
      <header>
        <TimerReset size={15} />
        <span>致命时间赛道</span>
        <b>{resolution ? verdictReason(resolution) : "双方从 0 秒同时开火"}</b>
        <small>同一时间的射击同时结算</small>
      </header>
      {row("left", `${leftName} → ${rightName}`, leftTime, resolution?.rightLoss ?? null)}
      {row("right", `${rightName} → ${leftName}`, rightTime, resolution?.leftLoss ?? null)}
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
            attack={resolution?.leftAttack ?? null}
            loss={resolution?.rightLoss ?? null}
            weapon={leftWeapon}
          />
        </article>

        <DuelJudge resolution={resolution} />

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
            attack={resolution?.rightAttack ?? null}
            loss={resolution?.leftLoss ?? null}
            weapon={rightWeapon}
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
