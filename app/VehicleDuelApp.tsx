"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Crosshair,
  Swords,
  TimerReset,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DEFAULT_VIEWER_NAVIGATION_STATE } from "../lib/catalog-navigation.mjs";
import {
  resolveVehicleDuel,
  type VehicleDuelAttackResolution,
  type VehicleDuelLethalPath,
  type VehicleDuelResolution,
} from "../lib/vehicle-duel-model.ts";
import { weaponNameZh } from "../lib/weapon-display-name.ts";
import { armorPath } from "../lib/public-site-topology.mjs";
import { RuntimeVehicleViewer, type RuntimeVehicleDuelHitSnapshot } from "./RuntimeVehicleViewer.tsx";
import { WeaponRhythmTimeline } from "./WeaponRhythmTimeline.tsx";
import type { RuntimeAttackSourceWeapon } from "./runtime-probe-weapon-labels.ts";
import type { SiteEdition } from "./site-edition.ts";
import {
  vehicleDuelData,
  type VehicleDuelBundle,
  type VehicleDuelOption,
} from "./vehicle-duel-data.ts";
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
  return (
    <div className="vehicle-duel__selectors">
      <label>
        <span>{side} 方载具</span>
        <select
          aria-label={`选择 ${side} 方载具`}
          value={selected.id}
          onChange={(event) => onVehicleChange(event.currentTarget.value)}
        >
          {groupedOptions(options).map((group) => (
            <optgroup key={group.factionName} label={group.factionName}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName} · {option.typeName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        <span>武器 / 弹种</span>
        <select
          aria-label={`选择 ${side} 方武器或弹种`}
          value={source?.weapons[weaponIndex] ? weaponIndex : 0}
          disabled={!source}
          onChange={(event) => onWeaponChange(Number(event.currentTarget.value))}
        >
          {(source?.weapons ?? []).map((weapon, index) => (
            <option key={weapon.weaponAssignmentId ?? `${weapon.weaponId}:${index}`} value={index}>
              {duelWeaponLabel(weapon)}
            </option>
          ))}
        </select>
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
  onNavigationChange,
  onHitChange,
}: {
  targetSide: "A" | "B";
  bundle: VehicleDuelBundle;
  attackerBundle: VehicleDuelBundle;
  attackerSide: "A" | "B";
  navigation: ViewerNavigationState;
  onNavigationChange: (state: ViewerNavigationState) => void;
  onHitChange: (snapshot: RuntimeVehicleDuelHitSnapshot | null) => void;
}) {
  return (
    <section className="vehicle-duel__target">
      <header>
        <span><Crosshair size={14} /> {attackerSide} 方选择命中位置</span>
        <nav aria-label={`${targetSide} 方命中视图`}>
          <button
            type="button"
            data-active={navigation.view === "armor"}
            onClick={() => onNavigationChange({ ...navigation, view: "armor" })}
          >装甲</button>
          <button
            type="button"
            data-active={navigation.view === "interior"}
            onClick={() => onNavigationChange({ ...navigation, view: "interior" })}
          >内构</button>
        </nav>
        <strong>{targetSide} 方 · {bundle.option.displayName}</strong>
      </header>
      <div className="vehicle-duel__viewer">
        <RuntimeVehicleViewer
          key={bundle.option.id}
          preview={bundle.preview}
          showChrome={false}
          mode={navigation.view === "interior" ? "interior" : "armor"}
          displayName={bundle.option.displayName}
          navigationState={navigation}
          onNavigationStateChange={onNavigationChange}
          attackLibraryOverride={attackerBundle.attackLibrary}
          duelTarget
          allowGlobalAttackSources={false}
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
    : `${loser} 方车体血量先归零`;
}

function DuelJudge({ resolution }: { resolution: VehicleDuelResolution | null }) {
  return (
    <aside className="vehicle-duel__judge" data-winner={resolution?.winner ?? "pending"}>
      <Swords size={30} />
      <span>交叉射击</span>
      <strong>{resolution ? verdictLabel(resolution) : "等待命中"}</strong>
      <b>{resolution?.decisiveTimeSeconds === null || !resolution
        ? "—"
        : `${resolution.decisiveTimeSeconds.toFixed(2)}s`}</b>
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
        <strong>{simulation.elapsedSeconds.toFixed(2)} s 截止 · {simulation.shots} 发</strong>
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

function DuelRace({ resolution }: { resolution: VehicleDuelResolution | null }) {
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
      <span>{label}</span>
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
      {row("left", "A 方火力 → B 方", leftTime, resolution?.rightLoss ?? null)}
      {row("right", "B 方火力 → A 方", rightTime, resolution?.leftLoss ?? null)}
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
        <div>
          <Link href={internalCatalogHref(siteEdition)}><ArrowLeft size={15} /> 返回载具目录</Link>
          <h1>载具斗蛐蛐</h1>
          <p>双方同时开火；车体或被命中的弹药架先归零的一方落败。</p>
        </div>
        <aside>
          <strong>{resolution ? verdictLabel(resolution) : "选择双方命中位置"}</strong>
          <small>{resolution ? verdictReason(resolution) : "双方从 0 秒同时开火；点击对方载具选择命中位置"}</small>
        </aside>
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

      <DuelRace resolution={resolution} />
    </main>
  );
}
