import {
  optimizeWeaponRhythm,
  type WeaponDpsRhythmCandidate,
  type WeaponDpsWeapon,
} from "../../../lib/weapon-dps-model";

export type DuelPoolKind = "hull" | "ammo-rack" | "engine" | "track";
export type DuelSide = "left" | "right";

export interface DuelTargetZone {
  id: string;
  label: string;
  note: string;
  x: number;
  y: number;
  poolFactors: Partial<Record<DuelPoolKind, number>>;
}

export interface DuelWeapon extends WeaponDpsWeapon {
  shortLabel: string;
  ammoLabel: string;
  impactDamage: number;
}

export interface DuelVehicle {
  id: string;
  faction: string;
  name: string;
  role: string;
  accent: string;
  pools: Record<DuelPoolKind, number>;
  weapons: DuelWeapon[];
  zones: DuelTargetZone[];
}

export interface DuelAttackInput {
  attacker: DuelVehicle;
  weapon: DuelWeapon;
  defender: DuelVehicle;
  targetZone: DuelTargetZone;
}

export interface DuelLethalPath {
  poolKind: "hull" | "ammo-rack";
  poolLabel: string;
  timeSeconds: number;
  shots: number;
  reloads: number;
  overheats: number;
  candidate: WeaponDpsRhythmCandidate;
}

export interface DuelAttackResolution {
  attackerId: string;
  defenderId: string;
  weaponId: string;
  targetZoneId: string;
  lethalPath: DuelLethalPath | null;
  alternatives: DuelLethalPath[];
}

export interface VehicleDuelResolution {
  winner: DuelSide | "draw" | "unresolved";
  decisiveTimeSeconds: number | null;
  leftAttack: DuelAttackResolution;
  rightAttack: DuelAttackResolution;
  leftLosesAt: DuelLethalPath | null;
  rightLosesAt: DuelLethalPath | null;
  leftShotsBeforeCutoff: number;
  rightShotsBeforeCutoff: number;
  verdict: string;
}

const EPSILON = 1e-6;
const HORIZON_SECONDS = 180;

function selectedCandidate(candidate: ReturnType<typeof optimizeWeaponRhythm>) {
  return candidate.recommended ?? candidate.best ?? candidate.burn;
}

function resolveAttack(input: DuelAttackInput): DuelAttackResolution {
  const alternatives = (["hull", "ammo-rack"] as const).flatMap((poolKind) => {
    const factor = input.targetZone.poolFactors[poolKind] ?? 0;
    const damagePerShot = input.weapon.impactDamage * factor;
    if (damagePerShot <= 0) return [];
    const optimization = optimizeWeaponRhythm(
      { ...input.weapon, damagePerShot },
      {
        targetHealth: input.defender.pools[poolKind],
        horizonSeconds: HORIZON_SECONDS,
        useMagazineReload: true,
      },
    );
    const candidate = selectedCandidate(optimization);
    if (candidate.result.killTimeSeconds === null) return [];
    return [{
      poolKind,
      poolLabel: poolKind === "ammo-rack" ? "弹药架" : "车体",
      timeSeconds: candidate.result.killTimeSeconds,
      shots: candidate.result.shots,
      reloads: candidate.result.reloads,
      overheats: candidate.result.overheatCount,
      candidate,
    } satisfies DuelLethalPath];
  }).sort((left, right) => left.timeSeconds - right.timeSeconds);

  return {
    attackerId: input.attacker.id,
    defenderId: input.defender.id,
    weaponId: input.weapon.id,
    targetZoneId: input.targetZone.id,
    lethalPath: alternatives[0] ?? null,
    alternatives,
  };
}

function shotCountBefore(path: DuelLethalPath | null, cutoffSeconds: number | null) {
  if (!path) return 0;
  if (cutoffSeconds === null) return path.shots;
  return path.candidate.result.events.filter(
    (event) => event.kind === "shot" && event.timeSeconds <= cutoffSeconds + EPSILON,
  ).length;
}

export function resolveVehicleDuel({
  left,
  right,
}: {
  left: DuelAttackInput;
  right: DuelAttackInput;
}): VehicleDuelResolution {
  const leftAttack = resolveAttack(left);
  const rightAttack = resolveAttack(right);
  const rightLosesAt = leftAttack.lethalPath;
  const leftLosesAt = rightAttack.lethalPath;
  const leftTime = leftLosesAt?.timeSeconds ?? Number.POSITIVE_INFINITY;
  const rightTime = rightLosesAt?.timeSeconds ?? Number.POSITIVE_INFINITY;

  let winner: VehicleDuelResolution["winner"];
  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) {
    winner = "unresolved";
  } else if (Math.abs(leftTime - rightTime) <= EPSILON) {
    winner = "draw";
  } else {
    winner = rightTime < leftTime ? "left" : "right";
  }
  const decisiveTimeSeconds = winner === "unresolved"
    ? null
    : Math.min(leftTime, rightTime);

  const lossText = (side: "左侧" | "右侧", path: DuelLethalPath | null) => {
    if (!path) return `${side}在 180 秒内未被摧毁`;
    return path.poolKind === "ammo-rack"
      ? `${side}弹药架 ${path.timeSeconds.toFixed(2)} 秒归零，立即失去弹药与后续输出`
      : `${side}车体 ${path.timeSeconds.toFixed(2)} 秒归零`;
  };
  const verdict = winner === "draw"
    ? `同归于尽 · ${decisiveTimeSeconds?.toFixed(2)} 秒的射击同时结算`
    : winner === "left"
      ? `左侧胜 · ${lossText("右侧", rightLosesAt)}`
      : winner === "right"
        ? `右侧胜 · ${lossText("左侧", leftLosesAt)}`
        : "180 秒内双方都无法形成致命结果";

  return {
    winner,
    decisiveTimeSeconds,
    leftAttack,
    rightAttack,
    leftLosesAt,
    rightLosesAt,
    leftShotsBeforeCutoff: shotCountBefore(leftAttack.lethalPath, leftLosesAt?.timeSeconds ?? null),
    rightShotsBeforeCutoff: shotCountBefore(rightAttack.lethalPath, rightLosesAt?.timeSeconds ?? null),
    verdict,
  };
}

function thermalCannon() {
  return {
    state: "projected" as const,
    heatPerShot: 3.4,
    temperatureMin: 60,
    temperatureMax: 120,
    coolingRatePerSecond: 15,
    triggerStep: 6,
    shutdownTemperature: 105,
    triggerAt: 108,
    unlockTemperature: 102,
  };
}

function makeWeapon({
  id,
  shortLabel,
  ammoLabel,
  impactDamage,
  interval,
  magazine,
  reload,
  thermal = false,
}: {
  id: string;
  shortLabel: string;
  ammoLabel: string;
  impactDamage: number;
  interval: number;
  magazine: number;
  reload: number;
  thermal?: boolean;
}): DuelWeapon {
  return {
    id,
    label: `${shortLabel} · ${ammoLabel}`,
    shortLabel,
    ammoLabel,
    impactDamage,
    sourceLabel: "PROTOTYPE",
    assignmentId: `prototype:${id}`,
    sourceCardId: null,
    sourceRawName: null,
    damagePerShot: impactDamage,
    timeBetweenShotsSeconds: interval,
    magazineSize: magazine,
    tacticalReloadSeconds: reload,
    dryReloadSeconds: reload,
    overheat: thermal ? thermalCannon() : null,
  };
}

function genericZones(): DuelTargetZone[] {
  return [
    { id: "upper-front", label: "正面上首", note: "低收益车体伤害", x: 31, y: 43, poolFactors: { hull: 0.22 } },
    { id: "side-hull", label: "车体侧面", note: "稳定车体伤害", x: 50, y: 54, poolFactors: { hull: 0.62 } },
    { id: "ammo-rack", label: "弹药架", note: "归零即判负并停止输出", x: 61, y: 38, poolFactors: { hull: 0.34, "ammo-rack": 0.52 } },
    { id: "engine", label: "发动机", note: "失去机动，不直接判负", x: 77, y: 56, poolFactors: { hull: 0.28, engine: 0.82 } },
    { id: "track", label: "履带", note: "断履，不直接判负", x: 42, y: 73, poolFactors: { hull: 0.08, track: 0.76 } },
  ];
}

export const DUEL_VEHICLES: DuelVehicle[] = [
  {
    id: "bmp2-afu",
    faction: "乌克兰武装部队",
    name: "BMP-2",
    role: "步兵战车",
    accent: "#7fd4d9",
    pools: { hull: 1250, "ammo-rack": 600, engine: 500, track: 600 },
    zones: genericZones(),
    weapons: [
      makeWeapon({ id: "2a42-ap", shortLabel: "2A42", ammoLabel: "3UBR8 脱壳穿甲弹", impactDamage: 300, interval: 0.092, magazine: 100, reload: 4, thermal: true }),
      makeWeapon({ id: "2a42-he", shortLabel: "2A42", ammoLabel: "3UOR6 曳光破片弹", impactDamage: 100, interval: 0.092, magazine: 100, reload: 4, thermal: true }),
      makeWeapon({ id: "konkurs", shortLabel: "9M113 Konkurs", ammoLabel: "重破甲导弹", impactDamage: 1800, interval: 12, magazine: 1, reload: 12 }),
    ],
  },
  {
    id: "m2a3",
    faction: "美国陆军",
    name: "M2A3 Bradley",
    role: "步兵战车",
    accent: "#d8c78b",
    pools: { hull: 1500, "ammo-rack": 650, engine: 600, track: 650 },
    zones: genericZones(),
    weapons: [
      makeWeapon({ id: "m919", shortLabel: "M242", ammoLabel: "M919 25mm APFSDS", impactDamage: 260, interval: 0.18, magazine: 70, reload: 6.5, thermal: true }),
      makeWeapon({ id: "m792", shortLabel: "M242", ammoLabel: "M792 HEI-T", impactDamage: 110, interval: 0.18, magazine: 70, reload: 6.5, thermal: true }),
      makeWeapon({ id: "tow2a", shortLabel: "BGM-71 TOW", ammoLabel: "TOW-2A", impactDamage: 1800, interval: 20, magazine: 2, reload: 20 }),
    ],
  },
  {
    id: "t72b3",
    faction: "俄罗斯陆军",
    name: "T-72B3",
    role: "主战坦克",
    accent: "#a7bf7a",
    pools: { hull: 3000, "ammo-rack": 1000, engine: 750, track: 750 },
    zones: genericZones(),
    weapons: [
      makeWeapon({ id: "3bm60", shortLabel: "2A46M-5", ammoLabel: "3BM60 APFSDS", impactDamage: 800, interval: 7.5, magazine: 1, reload: 7.5 }),
      makeWeapon({ id: "3bk31", shortLabel: "2A46M-5", ammoLabel: "3BK31 HEAT", impactDamage: 1900, interval: 7.5, magazine: 1, reload: 7.5 }),
    ],
  },
  {
    id: "m1a2",
    faction: "美国陆军",
    name: "M1A2 Abrams",
    role: "主战坦克",
    accent: "#d4b483",
    pools: { hull: 3000, "ammo-rack": 1100, engine: 800, track: 800 },
    zones: genericZones(),
    weapons: [
      makeWeapon({ id: "m829a4", shortLabel: "M256", ammoLabel: "M829A4 APFSDS", impactDamage: 800, interval: 6.5, magazine: 1, reload: 6.5 }),
      makeWeapon({ id: "m830a1", shortLabel: "M256", ammoLabel: "M830A1 MPAT", impactDamage: 1600, interval: 6.5, magazine: 1, reload: 6.5 }),
    ],
  },
];

export function vehicleById(id: string) {
  return DUEL_VEHICLES.find((vehicle) => vehicle.id === id) ?? DUEL_VEHICLES[0];
}
