/**
 * Product-neutral DPS/rhythm calculations.
 *
 * This module intentionally consumes an already-resolved Wiki weapon fact. It
 * does not know about factions, cards, routes, or UI selection policy. The
 * caller must keep the exact assignment identity on the input so two weapons
 * that merely share a display name cannot silently collapse into one model.
 */

export type WeaponDpsEvidenceState = "observed" | "projected" | "unknown";

export interface WeaponDpsOverheatProfile {
  state: WeaponDpsEvidenceState;
  heatPerShot: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  coolingRatePerSecond: number | null;
  triggerStep: number | null;
  shutdownTemperature: number | null;
  triggerAt: number | null;
  unlockTemperature: number | null;
  effectTriggerLower?: number | null;
  effectTriggerUpper?: number | null;
  networkTriggerDelayState?: "deferred" | "observed" | "unknown";
  sourceBuildId?: string;
  sourceAssetPaths?: string[];
  propertyNames?: string[];
  evidence?: string | null;
}

export interface WeaponDpsWeapon {
  id: string;
  label: string;
  sourceLabel: string;
  assignmentId: string;
  sourceCardId: string | null;
  sourceRawName: string | null;
  variantIds?: string[];
  damagePerShot: number | null;
  timeBetweenShotsSeconds: number | null;
  magazineSize: number | null;
  tacticalReloadSeconds: number | null;
  dryReloadSeconds: number | null;
  overheat: WeaponDpsOverheatProfile | null;
}

export type WeaponDpsRhythmMode = "burn" | "controlled";

export interface WeaponDpsRhythmPlan {
  targetHealth: number;
  horizonSeconds: number;
  mode: WeaponDpsRhythmMode;
  burstSize: number;
  pauseSeconds: number;
  useMagazineReload: boolean;
}

export interface WeaponDpsEvent {
  kind: "shot" | "reload" | "pause" | "overheat" | "unlock";
  timeSeconds: number;
  temperature: number | null;
  damage: number;
  shotNumber: number;
}

export type WeaponDpsTimelineState =
  | "firing"
  | "short-pause"
  | "cooling"
  | "overheated"
  | "reloading";

export interface WeaponDpsTimelineSample {
  timeSeconds: number;
  state: WeaponDpsTimelineState;
  temperature: number | null;
  shotNumber: number;
}

export interface WeaponDpsHeatCurvePoint {
  shotNumber: number;
  timeSeconds: number;
  temperature: number | null;
  cumulativeDamage: number;
}

export interface WeaponDpsSimulation {
  weaponId: string;
  mode: WeaponDpsRhythmMode;
  thermalState: "observed" | "projected" | "unavailable";
  totalDamage: number;
  averageDps: number;
  shots: number;
  reloads: number;
  overheatCount: number;
  firstOverheatSeconds: number | null;
  killTimeSeconds: number | null;
  elapsedSeconds: number;
  finalTemperature: number | null;
  events: WeaponDpsEvent[];
  timeline: WeaponDpsTimelineSample[];
  heatCurve: WeaponDpsHeatCurvePoint[];
  heatRange: {
    min: number;
    max: number;
    warningAt: number | null;
    dangerAt: number | null;
    triggerAt: number | null;
  } | null;
  unavailableReason: string | null;
}

const EPSILON = 1e-7;
const MAX_EVENTS = 10_000;

function finitePositive(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function coolTemperature(
  temperature: number | null,
  seconds: number,
  profile: WeaponDpsOverheatProfile | null,
) {
  const coolingRate = profile?.coolingRatePerSecond ?? null;
  if (!profile || temperature === null || !finitePositive(coolingRate)) {
    return temperature;
  }
  const minimum = profile.temperatureMin ?? temperature;
  const maximum = profile.temperatureMax ?? temperature;
  return clamp(
    temperature - (coolingRate as number) * Math.max(seconds, 0),
    minimum,
    maximum,
  );
}

function thermalStateFor(weapon: WeaponDpsWeapon): WeaponDpsSimulation["thermalState"] {
  if (!weapon.overheat) return "unavailable";
  if (weapon.overheat.state === "unknown") return "unavailable";
  return weapon.overheat.state === "observed" ? "observed" : "projected";
}

function hasUsableThermalModel(profile: WeaponDpsOverheatProfile | null) {
  return Boolean(
    profile &&
      profile.state !== "unknown" &&
      finitePositive(profile.heatPerShot) &&
      Number.isFinite(profile.temperatureMin) &&
      Number.isFinite(profile.temperatureMax) &&
      finitePositive(profile.coolingRatePerSecond) &&
      Number.isFinite(profile.triggerAt ?? profile.shutdownTemperature),
  );
}

function buildTimelineSamples(
  weapon: WeaponDpsWeapon,
  profile: WeaponDpsOverheatProfile | null,
  events: readonly WeaponDpsEvent[],
  elapsedSeconds: number,
) {
  const samples: WeaponDpsTimelineSample[] = [];
  const sampleCount = Math.max(1, Math.ceil(elapsedSeconds));
  const shots = events.filter(({ kind }) => kind === "shot");
  const pauses = events.filter(({ kind }) => kind === "pause");
  const reloads = events.filter(({ kind }) => kind === "reload");
  const overheats = events.filter(({ kind }) => kind === "overheat");
  const unlocks = events.filter(({ kind }) => kind === "unlock");
  for (let timeSeconds = 0; timeSeconds <= sampleCount; timeSeconds += 1) {
    const nextTime = timeSeconds + 1;
    const shotsInSecond = shots.filter(
      ({ timeSeconds: shotTime }) => shotTime >= timeSeconds && shotTime < nextTime,
    );
    const hasPause = pauses.some(
      ({ timeSeconds: pauseTime }) => pauseTime >= timeSeconds && pauseTime < nextTime,
    );
    const hasReloadEnding = reloads.some(
      ({ timeSeconds: reloadTime }) => reloadTime > timeSeconds && reloadTime <= nextTime,
    );
    const lastOverheat = overheats.filter(({ timeSeconds: eventTime }) => eventTime <= timeSeconds).at(-1);
    const lastUnlock = unlocks.filter(({ timeSeconds: eventTime }) => eventTime <= timeSeconds).at(-1);
    const overheated = Boolean(
      lastOverheat && (!lastUnlock || lastUnlock.timeSeconds < lastOverheat.timeSeconds),
    );
    const state: WeaponDpsTimelineState = overheated
      ? "overheated"
      : hasReloadEnding
        ? "reloading"
        : shotsInSecond.length > 0
          ? "firing"
          : hasPause
            ? "short-pause"
            : "cooling";
    const lastEvent = events.filter(({ timeSeconds: eventTime }) => eventTime <= timeSeconds).at(-1);
    let temperature = lastEvent?.temperature ?? profile?.temperatureMin ?? null;
    if (temperature !== null && lastEvent && profile && state !== "firing") {
      temperature = coolTemperature(
        temperature,
        timeSeconds - lastEvent.timeSeconds,
        profile,
      );
    }
    samples.push({
      timeSeconds,
      state,
      temperature,
      shotNumber: shots.filter(({ timeSeconds: shotTime }) => shotTime < nextTime).length,
    });
  }
  return samples;
}

function buildHeatCurve(
  events: readonly WeaponDpsEvent[],
): WeaponDpsHeatCurvePoint[] {
  return events
    .filter(({ kind }) => kind === "shot")
    .map((event) => ({
      shotNumber: event.shotNumber,
      timeSeconds: event.timeSeconds,
      temperature: event.temperature,
      cumulativeDamage: event.damage,
    }));
}

/**
 * Simulate a fixed rhythm until the target dies or the requested horizon ends.
 *
 * The first shot is immediate. Subsequent shots wait until every active gate is
 * ready: cadence, reload, pause, and overheat cooling share elapsed wall time
 * rather than being blindly added. Heat is applied after each shot and cooling
 * is applied throughout every wait. In burn mode the lock is handled through
 * the lower hysteresis temperature when Wiki exposes it; no network delay is
 * invented here.
 */
export function simulateWeaponRhythm(
  weapon: WeaponDpsWeapon,
  plan: WeaponDpsRhythmPlan,
): WeaponDpsSimulation {
  const targetHealth = Math.max(plan.targetHealth, 1);
  const horizonSeconds = Math.max(plan.horizonSeconds, 0);
  const damagePerShot = weapon.damagePerShot;
  const interval = weapon.timeBetweenShotsSeconds;
  const hasDamageModel = finitePositive(damagePerShot);
  const hasCadenceModel = finitePositive(interval);
  const thermalModel = hasUsableThermalModel(weapon.overheat);
  const thermalState = thermalModel ? thermalStateFor(weapon) : "unavailable";
  const events: WeaponDpsEvent[] = [];
  const profile = thermalModel ? weapon.overheat : null;
  const minimum = profile?.temperatureMin ?? null;
  const maximum = profile?.temperatureMax ?? null;
  const triggerAt = profile
    ? profile.triggerAt ?? profile.shutdownTemperature
    : null;
  const unlockAt = profile
    ? profile.unlockTemperature ?? profile.temperatureMin
    : null;

  if (!hasDamageModel) {
    return {
      weaponId: weapon.id,
      mode: plan.mode,
      thermalState,
      totalDamage: 0,
      averageDps: 0,
      shots: 0,
      reloads: 0,
      overheatCount: 0,
      firstOverheatSeconds: null,
      killTimeSeconds: null,
      elapsedSeconds: 0,
      finalTemperature: minimum,
      events,
      timeline: [],
      heatCurve: [],
      heatRange: null,
      unavailableReason: "Wiki 未提供可计算的单发伤害",
    };
  }

  if ((damagePerShot as number) >= targetHealth) {
    const temperature = profile && minimum !== null && profile.heatPerShot !== null
      ? clamp(
          minimum + profile.heatPerShot,
          minimum,
          maximum ?? minimum + profile.heatPerShot,
        )
      : minimum;
    const overheated =
      temperature !== null && triggerAt !== null && temperature + EPSILON >= triggerAt;
    events.push({
      kind: "shot",
      timeSeconds: 0,
      temperature,
      damage: damagePerShot as number,
      shotNumber: 1,
    });
    if (overheated) {
      events.push({
        kind: "overheat",
        timeSeconds: 0,
        temperature,
        damage: damagePerShot as number,
        shotNumber: 1,
      });
    }
    return {
      weaponId: weapon.id,
      mode: plan.mode,
      thermalState,
      totalDamage: damagePerShot as number,
      averageDps: 0,
      shots: 1,
      reloads: 0,
      overheatCount: overheated ? 1 : 0,
      firstOverheatSeconds: overheated ? 0 : null,
      killTimeSeconds: 0,
      elapsedSeconds: 0,
      finalTemperature: temperature,
      events,
      timeline: buildTimelineSamples(weapon, profile, events, 0),
      heatCurve: buildHeatCurve(events),
      heatRange: profile
        ? {
            min: profile.temperatureMin ?? 0,
            max: profile.temperatureMax ?? 0,
            warningAt: profile.effectTriggerLower ?? null,
            dangerAt: profile.effectTriggerUpper ?? null,
            triggerAt,
          }
        : null,
      unavailableReason: null,
    };
  }

  if (!hasCadenceModel) {
    return {
      weaponId: weapon.id,
      mode: plan.mode,
      thermalState,
      totalDamage: 0,
      averageDps: 0,
      shots: 0,
      reloads: 0,
      overheatCount: 0,
      firstOverheatSeconds: null,
      killTimeSeconds: null,
      elapsedSeconds: 0,
      finalTemperature: minimum,
      events,
      timeline: [],
      heatCurve: [],
      heatRange: null,
      unavailableReason: "Wiki 未提供可计算的射击间隔",
    };
  }
  let elapsedSeconds = 0;
  let temperature = minimum;
  let totalDamage = 0;
  let shots = 0;
  let reloads = 0;
  let overheatCount = 0;
  let firstOverheatSeconds: number | null = null;
  let killTimeSeconds: number | null = null;
  let magazineShots = 0;
  let burstShots = 0;
  let overheated = false;
  let lastShotTimeSeconds: number | null = null;
  let guard = 0;

  const advance = (seconds: number) => {
    const bounded = Math.max(seconds, 0);
    elapsedSeconds += bounded;
    temperature = coolTemperature(temperature, bounded, profile);
  };

  while (
    elapsedSeconds < horizonSeconds - EPSILON &&
    killTimeSeconds === null &&
    guard++ < MAX_EVENTS
  ) {
    if (overheated && profile && unlockAt !== null && profile.coolingRatePerSecond) {
      const coolSeconds = Math.max(
        0,
        ((temperature ?? unlockAt) - unlockAt) / profile.coolingRatePerSecond,
      );
      if (coolSeconds > EPSILON) {
        advance(coolSeconds);
      } else {
        temperature = unlockAt;
      }
      if (elapsedSeconds > horizonSeconds + EPSILON) break;
      overheated = false;
      events.push({
        kind: "unlock",
        timeSeconds: elapsedSeconds,
        temperature,
        damage: totalDamage,
        shotNumber: shots,
      });
    }

    if (
      plan.useMagazineReload &&
      finitePositive(weapon.magazineSize) &&
      magazineShots >= (weapon.magazineSize as number)
    ) {
      const reloadSeconds =
        (weapon.tacticalReloadSeconds ?? weapon.dryReloadSeconds) ?? 0;
      if (reloadSeconds > EPSILON) {
        advance(reloadSeconds);
        if (elapsedSeconds > horizonSeconds + EPSILON) break;
        reloads += 1;
        events.push({
          kind: "reload",
          timeSeconds: elapsedSeconds,
          temperature,
          damage: totalDamage,
          shotNumber: shots,
        });
      }
      magazineShots = 0;
    }

    if (
      plan.mode === "controlled" &&
      burstShots >= Math.max(1, Math.floor(plan.burstSize))
    ) {
      const pauseSeconds = Math.max(plan.pauseSeconds, 0);
      if (pauseSeconds > EPSILON) {
        advance(pauseSeconds);
        if (elapsedSeconds > horizonSeconds + EPSILON) break;
        events.push({
          kind: "pause",
          timeSeconds: elapsedSeconds,
          temperature,
          damage: totalDamage,
          shotNumber: shots,
        });
      }
      burstShots = 0;
    }

    if (lastShotTimeSeconds !== null) {
      const elapsedSinceLastShot = Math.max(
        0,
        elapsedSeconds - lastShotTimeSeconds,
      );
      advance(Math.max(0, (interval as number) - elapsedSinceLastShot));
      if (elapsedSeconds >= horizonSeconds - EPSILON) break;
    }

    if (profile && temperature !== null && profile.heatPerShot !== null) {
      temperature = clamp(
        temperature + profile.heatPerShot,
        minimum ?? temperature,
        maximum ?? temperature + profile.heatPerShot,
      );
    }
    shots += 1;
    magazineShots += 1;
    burstShots += 1;
    totalDamage += damagePerShot as number;
    lastShotTimeSeconds = elapsedSeconds;
    events.push({
      kind: "shot",
      timeSeconds: elapsedSeconds,
      temperature,
      damage: totalDamage,
      shotNumber: shots,
    });
    if (killTimeSeconds === null && totalDamage >= targetHealth) {
      killTimeSeconds = elapsedSeconds;
    }

    if (
      profile &&
      triggerAt !== null &&
      temperature !== null &&
      temperature + EPSILON >= triggerAt
    ) {
      overheatCount += 1;
      if (firstOverheatSeconds === null) firstOverheatSeconds = elapsedSeconds;
      overheated = true;
      events.push({
        kind: "overheat",
        timeSeconds: elapsedSeconds,
        temperature,
        damage: totalDamage,
        shotNumber: shots,
      });
    }
  }

  const elapsedForDps = Math.max(
    killTimeSeconds ?? Math.min(elapsedSeconds, horizonSeconds),
    EPSILON,
  );
  return {
    weaponId: weapon.id,
    mode: plan.mode,
    thermalState,
    totalDamage,
    averageDps: totalDamage / elapsedForDps,
    shots,
    reloads,
    overheatCount,
    firstOverheatSeconds,
    killTimeSeconds,
    elapsedSeconds: Math.min(elapsedSeconds, horizonSeconds),
    finalTemperature: temperature,
    events,
    timeline: buildTimelineSamples(weapon, profile, events, Math.min(elapsedSeconds, horizonSeconds)),
    heatCurve: buildHeatCurve(events),
    heatRange: profile
      ? {
          min: profile.temperatureMin ?? 0,
          max: profile.temperatureMax ?? 0,
          warningAt: profile.effectTriggerLower ?? null,
          dangerAt: profile.effectTriggerUpper ?? null,
          triggerAt,
        }
      : null,
    unavailableReason: null,
  };
}

export function compareWeaponRhythms(
  weapons: readonly WeaponDpsWeapon[],
  plan: Omit<WeaponDpsRhythmPlan, "mode">,
) {
  return weapons.map((weapon) => ({
    weapon,
    burn: simulateWeaponRhythm(weapon, { ...plan, mode: "burn" }),
    controlled: simulateWeaponRhythm(weapon, { ...plan, mode: "controlled" }),
  }));
}

export interface WeaponDpsOptimizationOptions {
  targetHealth: number;
  horizonSeconds: number;
  useMagazineReload: boolean;
  maxBurstSize?: number;
  maxPauseSeconds?: number;
  pauseStepSeconds?: number;
}

export interface WeaponDpsRhythmCandidate {
  plan: WeaponDpsRhythmPlan;
  result: WeaponDpsSimulation;
}

export interface WeaponDpsOptimization {
  best: WeaponDpsRhythmCandidate | null;
  recommended: WeaponDpsRhythmCandidate | null;
  burn: WeaponDpsRhythmCandidate;
  controlled: WeaponDpsRhythmCandidate | null;
  candidates: WeaponDpsRhythmCandidate[];
  practical: {
    meaningful: boolean;
    deltaSeconds: number | null;
    gainRatio: number | null;
    reason: "controlled-meaningful" | "burn-equivalent" | "no-kill-comparison";
  };
}

function simulationBeats(
  left: WeaponDpsSimulation,
  right: WeaponDpsSimulation,
) {
  if (left.killTimeSeconds !== null || right.killTimeSeconds !== null) {
    if (left.killTimeSeconds === null) return false;
    if (right.killTimeSeconds === null) return true;
    if (Math.abs(left.killTimeSeconds - right.killTimeSeconds) > EPSILON) {
      return left.killTimeSeconds < right.killTimeSeconds;
    }
  }
  if (Math.abs(left.totalDamage - right.totalDamage) > EPSILON) {
    return left.totalDamage > right.totalDamage;
  }
  if (Math.abs(left.averageDps - right.averageDps) > EPSILON) {
    return left.averageDps > right.averageDps;
  }
  return left.overheatCount < right.overheatCount;
}

/**
 * Search a bounded set of burst/pause schedules and return the schedule that
 * actually wins for this target and horizon. The UI never asks the reader to
 * guess a pause: it reports this result and the winning plan as an explanation.
 */
export function optimizeWeaponRhythm(
  weapon: WeaponDpsWeapon,
  options: WeaponDpsOptimizationOptions,
): WeaponDpsOptimization {
  const maxBurstSize = Math.max(1, Math.floor(options.maxBurstSize ?? 32));
  const maxPauseSeconds = Math.max(0, options.maxPauseSeconds ?? 1.5);
  const pauseStepSeconds = Math.max(EPSILON, options.pauseStepSeconds ?? 0.05);
  const plans: WeaponDpsRhythmPlan[] = [{
    targetHealth: options.targetHealth,
    horizonSeconds: options.horizonSeconds,
    mode: "burn",
    burstSize: maxBurstSize,
    pauseSeconds: 0,
    useMagazineReload: options.useMagazineReload,
  }];
  const burstSizes = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32]
    .filter((burstSize, index, values) => burstSize <= maxBurstSize && values.indexOf(burstSize) === index);
  for (const burstSize of burstSizes) {
    for (let pause = 0; pause <= maxPauseSeconds + EPSILON; pause += pauseStepSeconds) {
      plans.push({
        targetHealth: options.targetHealth,
        horizonSeconds: options.horizonSeconds,
        mode: "controlled",
        burstSize,
        pauseSeconds: Number(pause.toFixed(4)),
        useMagazineReload: options.useMagazineReload,
      });
    }
  }
  const candidates = plans.map((plan) => ({
    plan,
    result: simulateWeaponRhythm(weapon, plan),
  }));
  const burn = candidates[0];
  let best = burn;
  let controlled: WeaponDpsRhythmCandidate | null = null;
  for (const candidate of candidates.slice(1)) {
    if (!controlled || simulationBeats(candidate.result, controlled.result)) {
      controlled = candidate;
    }
    if (simulationBeats(candidate.result, best.result)) best = candidate;
  }
  const bestKillTime = best.result.killTimeSeconds;
  const burnKillTime = burn.result.killTimeSeconds;
  const deltaSeconds = bestKillTime !== null && burnKillTime !== null
    ? burnKillTime - bestKillTime
    : null;
  const gainRatio = burn.result.totalDamage > EPSILON
    ? (best.result.totalDamage - burn.result.totalDamage) / burn.result.totalDamage
    : null;
  const meaningful = best !== burn && (
    (deltaSeconds !== null && deltaSeconds >= 0.25 && (gainRatio === null || gainRatio >= 0.05)) ||
    (deltaSeconds === null && gainRatio !== null && gainRatio >= 0.05)
  );
  const practicalReason = best === burn
    ? "burn-equivalent"
    : meaningful
      ? "controlled-meaningful"
      : "burn-equivalent";
  return {
    best,
    recommended: meaningful ? best : burn,
    burn,
    controlled,
    candidates,
    practical: {
      meaningful,
      deltaSeconds,
      gainRatio,
      reason: deltaSeconds === null && gainRatio === null
        ? "no-kill-comparison"
        : practicalReason,
    },
  };
}
