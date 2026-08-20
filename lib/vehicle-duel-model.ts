import {
  optimizeWeaponRhythm,
  type WeaponDpsRhythmCandidate,
  type WeaponDpsSimulation,
  type WeaponDpsWeapon,
} from "./weapon-dps-model.ts";
import type { WeaponHitDpsTarget } from "./weapon-hit-dps.ts";

export type VehicleDuelWinner = "left" | "right" | "draw" | "unresolved";

export interface VehicleDuelAttackInput {
  weapon: WeaponDpsWeapon;
  targets: readonly WeaponHitDpsTarget[];
}

export interface VehicleDuelLethalPath extends WeaponHitDpsTarget {
  poolKind: "hull" | "ammo-rack";
  timeSeconds: number;
  candidate: WeaponDpsRhythmCandidate;
}

export interface VehicleDuelAttackResolution {
  lethalPath: VehicleDuelLethalPath | null;
  alternatives: VehicleDuelLethalPath[];
  actualSimulation: WeaponDpsSimulation | null;
}

export interface VehicleDuelResolution {
  winner: VehicleDuelWinner;
  decisiveTimeSeconds: number | null;
  leftLoss: VehicleDuelLethalPath | null;
  rightLoss: VehicleDuelLethalPath | null;
  leftAttack: VehicleDuelAttackResolution;
  rightAttack: VehicleDuelAttackResolution;
}

const EPSILON = 1e-7;

function selectedCandidate(
  optimization: ReturnType<typeof optimizeWeaponRhythm>,
) {
  return optimization.recommended ?? optimization.best ?? optimization.burn;
}

function resolveUninterruptedAttack(
  attack: VehicleDuelAttackInput,
  horizonSeconds: number,
) {
  const alternatives = attack.targets
    .flatMap((target): VehicleDuelLethalPath[] => {
      if (
        (target.poolKind !== "hull" && target.poolKind !== "ammo-rack") ||
        target.damagePerShot <= 0 ||
        target.maxHealth <= 0
      ) return [];
      const candidate = selectedCandidate(optimizeWeaponRhythm(
        { ...attack.weapon, damagePerShot: target.damagePerShot },
        {
          targetHealth: target.maxHealth,
          horizonSeconds,
          useMagazineReload: true,
          targetBurning: target.targetBurning ?? null,
        },
      ));
      if (candidate.result.killTimeSeconds === null) return [];
      return [{
        ...target,
        poolKind: target.poolKind,
        timeSeconds: candidate.result.killTimeSeconds,
        candidate,
      }];
    })
    .sort(
      (left, right) =>
        left.timeSeconds - right.timeSeconds ||
        (left.poolKind === right.poolKind
          ? 0
          : left.poolKind === "ammo-rack" ? -1 : 1) ||
        left.key.localeCompare(right.key, "en"),
    );
  return {
    lethalPath: alternatives[0] ?? null,
    alternatives,
  };
}

function truncateSimulation(
  path: VehicleDuelLethalPath | null,
  cutoffSeconds: number | null,
): WeaponDpsSimulation | null {
  if (!path) return null;
  const source = path.candidate.result;
  const cutoff = Math.max(
    0,
    Math.min(cutoffSeconds ?? source.elapsedSeconds, source.elapsedSeconds),
  );
  const events = source.events.filter(
    ({ timeSeconds }) => timeSeconds <= cutoff + EPSILON,
  );
  const heatCurve = source.heatCurve.filter(
    ({ timeSeconds }) => timeSeconds <= cutoff + EPSILON,
  );
  const timeline = source.timeline.filter(
    ({ timeSeconds }) => timeSeconds <= cutoff + EPSILON,
  );
  const shotEvents = events.filter(({ kind }) => kind === "shot");
  const damageEvents = events.filter(
    ({ kind }) => kind === "shot" || kind === "burn",
  );
  const overheatEvents = events.filter(({ kind }) => kind === "overheat");
  const totalDamage = damageEvents.at(-1)?.damage ?? 0;
  const burnDamage = events
    .filter(({ kind }) => kind === "burn")
    .reduce((total, event) => total + event.damageAmount, 0);
  const killTimeSeconds = source.killTimeSeconds !== null &&
    source.killTimeSeconds <= cutoff + EPSILON
      ? source.killTimeSeconds
      : null;
  return {
    ...source,
    totalDamage,
    burnDamage,
    averageDps: cutoff > EPSILON ? totalDamage / cutoff : 0,
    shots: shotEvents.length,
    reloads: events.filter(
      ({ kind, completed }) => kind === "reload" && completed !== false,
    ).length,
    overheatCount: overheatEvents.length,
    firstOverheatSeconds: overheatEvents[0]?.timeSeconds ?? null,
    killTimeSeconds,
    elapsedSeconds: cutoff,
    finalTemperature:
      events.at(-1)?.temperature ?? source.heatRange?.min ?? null,
    events,
    timeline,
    heatCurve,
    damageCurve: damageEvents.map((event) => ({
      kind: event.kind as "shot" | "burn",
      timeSeconds: event.timeSeconds,
      cumulativeDamage: event.damage,
    })),
  };
}

export function resolveVehicleDuel(
  {
    leftAttack,
    rightAttack,
  }: {
    leftAttack: VehicleDuelAttackInput;
    rightAttack: VehicleDuelAttackInput;
  },
  { horizonSeconds = 180 }: { horizonSeconds?: number } = {},
): VehicleDuelResolution {
  const leftUninterrupted = resolveUninterruptedAttack(
    leftAttack,
    horizonSeconds,
  );
  const rightUninterrupted = resolveUninterruptedAttack(
    rightAttack,
    horizonSeconds,
  );
  const rightLoss = leftUninterrupted.lethalPath;
  const leftLoss = rightUninterrupted.lethalPath;
  const rightLossTime = rightLoss?.timeSeconds ?? Number.POSITIVE_INFINITY;
  const leftLossTime = leftLoss?.timeSeconds ?? Number.POSITIVE_INFINITY;
  let winner: VehicleDuelWinner;
  if (!Number.isFinite(rightLossTime) && !Number.isFinite(leftLossTime)) {
    winner = "unresolved";
  } else if (Math.abs(rightLossTime - leftLossTime) <= EPSILON) {
    winner = "draw";
  } else {
    winner = rightLossTime < leftLossTime ? "left" : "right";
  }
  const decisiveTimeSeconds = winner === "unresolved"
    ? null
    : Math.min(rightLossTime, leftLossTime);
  return {
    winner,
    decisiveTimeSeconds,
    leftLoss,
    rightLoss,
    leftAttack: {
      ...leftUninterrupted,
      actualSimulation: truncateSimulation(
        leftUninterrupted.lethalPath,
        decisiveTimeSeconds,
      ),
    },
    rightAttack: {
      ...rightUninterrupted,
      actualSimulation: truncateSimulation(
        rightUninterrupted.lethalPath,
        decisiveTimeSeconds,
      ),
    },
  };
}
