export interface GunnerSightLinearColor {
  R: number;
  G: number;
  B: number;
  A: number;
}

export interface GunnerSightDynamicBindingLike {
  semantic: string;
  property: string;
  targetWidgetName?: string;
  relatedSeatPawnClassPaths?: string[];
  valueModel?: {
    kind?: string;
    minimum?: number;
    maximum?: number;
    emptyWhenNegative?: boolean;
    negativeText?: string;
    color?: GunnerSightLinearColor;
    falseColor?: GunnerSightLinearColor;
    trueColor?: GunnerSightLinearColor;
    interpolationSpeedPerSecond?: number | null;
    anglesDegrees?: number[];
    sourceCdoProperty?: string;
  } | null;
}

export interface GunnerSightRuntimeState {
  rangeMeters: number | null;
  roundsRemaining: number | null;
  magazineCapacity: number | null;
  magazinesRemaining?: number | null;
  reloadProgress: number;
  weaponReady: boolean;
  weaponReloading: boolean;
  stabilized: boolean;
  guidanceActive: boolean;
  currentWeaponLabel: string;
  currentFireModeSourceValue?: number | null;
  currentWeaponClassPath?: string;
  commanderOverride?: boolean;
  weaponOverheated?: boolean;
  stationRelativeYawDegrees: number;
  stationPitchDegrees: number;
  relatedStationRelativeYawDegrees: ReadonlyMap<string, number>;
  currentSeatPawnClassPath?: string;
  activeZoomIndex?: number;
}

export interface GunnerSightDynamicPresentation {
  text?: string;
  visible?: boolean;
  color?: GunnerSightLinearColor;
  opacity?: number;
  angleDegrees?: number;
  translation?: { X: number; Y: number };
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function classNameFromPath(value: string) {
  const objectName = value.split(".").at(-1) ?? value.split("/").at(-1) ?? value;
  return objectName;
}

function relatedStationAngle(
  binding: GunnerSightDynamicBindingLike,
  state: GunnerSightRuntimeState,
) {
  const classPaths = binding.relatedSeatPawnClassPaths ?? [];
  const currentClassPath = state.currentSeatPawnClassPath ?? "";
  const target = binding.targetWidgetName?.toLowerCase() ?? "";
  if (target.includes("commander")) {
    const commander = finiteOrNull(
      state.relatedStationRelativeYawDegrees.get("role:commander"),
    );
    if (commander !== null) return commander;
  }
  if (target.includes("turret")) {
    const gunner = finiteOrNull(
      state.relatedStationRelativeYawDegrees.get("role:gunner"),
    );
    if (gunner !== null) return gunner;
  }
  const orderedClassPaths = target.includes("commander")
    ? [
        ...classPaths.filter((value) => value !== currentClassPath),
        ...classPaths.filter((value) => value === currentClassPath),
      ]
    : target.includes("turret") && classPaths.includes(currentClassPath)
      ? [currentClassPath, ...classPaths.filter((value) => value !== currentClassPath)]
      : classPaths;
  for (const classPath of orderedClassPaths) {
    const exact = state.relatedStationRelativeYawDegrees.get(classPath);
    if (finiteOrNull(exact) !== null) return exact!;
    const className = classNameFromPath(classPath);
    const byClassName = state.relatedStationRelativeYawDegrees.get(className);
    if (finiteOrNull(byClassName) !== null) return byClassName!;
  }
  return null;
}

function booleanValue(
  binding: GunnerSightDynamicBindingLike,
  state: GunnerSightRuntimeState,
): boolean | null {
  const semantic = binding.semantic;
  switch (semantic) {
    case "excluded-damage-state-indicator":
      return false;
    case "weapon-empty-indicator":
      return state.roundsRemaining === 0;
    case "magazine-rounds-display-color":
      return (state.roundsRemaining ?? 0) > 0;
    case "weapon-ready-indicator":
    case "weapon-ready-status":
      return state.weaponReady;
    case "weapon-reloading-indicator":
      return state.weaponReloading;
    case "weapon-not-ready-indicator":
      return !state.weaponReady && !state.weaponReloading &&
        (state.roundsRemaining ?? 0) > 0;
    case "weapon-overheat-indicator":
      return state.weaponOverheated === true;
    case "commander-override-indicator":
      return state.commanderOverride === true;
    case "current-weapon-selection-indicator": {
      const currentClassPath = state.currentWeaponClassPath ?? "";
      return currentClassPath.length > 0 &&
        (binding.relatedSeatPawnClassPaths ?? []).includes(currentClassPath);
    }
    case "stabilization-indicator":
    case "stabilization-status":
      return state.stabilized;
    case "guidance-indicator":
      return state.guidanceActive;
    case "rangefinder-indicator":
      return finiteOrNull(state.rangeMeters) !== null && state.rangeMeters! >= 0;
    default:
      return null;
  }
}

function rangefinderText(
  binding: GunnerSightDynamicBindingLike,
  state: GunnerSightRuntimeState,
) {
  const rangeMeters = finiteOrNull(state.rangeMeters);
  if (rangeMeters === null) return "";
  const model = binding.valueModel;
  if ((model?.emptyWhenNegative ?? true) && rangeMeters < 0) return "";
  const minimum = finiteOrNull(model?.minimum) ?? 0;
  const maximum = finiteOrNull(model?.maximum) ?? 9999;
  return String(Math.floor(Math.min(maximum, Math.max(minimum, rangeMeters))));
}

function zoomStageVisible(targetWidgetName: string | undefined, zoomIndex: number) {
  const normalized = (targetWidgetName ?? "").toLowerCase();
  if (normalized.includes("unzoom")) return zoomIndex === 0;
  const numbered = normalized.match(/(?:zoomed|zoom|stage)[_ -]?(\d+)/u);
  if (numbered) return zoomIndex === Number(numbered[1]);
  if (normalized.includes("zoom")) return zoomIndex > 0;
  return true;
}

export function resolveGunnerSightDynamicBinding(
  binding: GunnerSightDynamicBindingLike,
  state: GunnerSightRuntimeState,
): GunnerSightDynamicPresentation | null {
  const property = binding.property;
  if (property === "text") {
    switch (binding.semantic) {
      case "rangefinder-distance-meters":
        return { text: rangefinderText(binding, state) };
      case "magazine-rounds-remaining":
        return {
          text: state.roundsRemaining === null
            ? ""
            : String(Math.max(0, Math.floor(state.roundsRemaining))),
        };
      case "current-weapon-label":
        return { text: state.currentWeaponLabel };
      case "weapon-and-ammo-label":
        return {
          text: state.roundsRemaining === null
            ? state.currentWeaponLabel
            : `${state.currentWeaponLabel} · ${Math.max(
                0,
                Math.floor(state.roundsRemaining),
              )}`,
        };
      case "weapon-fire-mode-label": {
        const fireMode = finiteOrNull(state.currentFireModeSourceValue);
        return { text: fireMode === null ? "" : String(Math.trunc(fireMode)) };
      }
      case "zoom-stage-label":
        return { text: `Z${(state.activeZoomIndex ?? 0) + 1}` };
      case "station-relative-yaw-degrees":
        return { text: `${state.stationRelativeYawDegrees.toFixed(1)}°` };
      case "station-pitch-degrees":
        return { text: `${state.stationPitchDegrees.toFixed(1)}°` };
      case "stabilization-status":
        return { text: state.stabilized ? "STA" : "" };
      case "weapon-ready-status":
        return {
          text: state.weaponReloading
            ? "RELOAD"
            : state.weaponReady
              ? "READY"
              : "EMPTY",
        };
      default:
        return null;
    }
  }

  if (property === "render-angle-degrees") {
    if (binding.semantic === "magazine-rounds-dial-angle") {
      const angles = binding.valueModel?.anglesDegrees ?? [];
      const magazineIndex = finiteOrNull(state.magazinesRemaining);
      if (angles.length === 0 || magazineIndex === null) return null;
      const index = Math.min(
        angles.length - 1,
        Math.max(0, Math.floor(magazineIndex)),
      );
      const angleDegrees = finiteOrNull(angles[index]);
      return angleDegrees === null ? null : { angleDegrees };
    }
    if (binding.semantic === "station-relative-yaw-degrees") {
      return { angleDegrees: state.stationRelativeYawDegrees };
    }
    if (binding.semantic === "station-pitch-degrees") {
      return { angleDegrees: state.stationPitchDegrees };
    }
    if (binding.semantic === "related-station-relative-yaw-degrees") {
      const angleDegrees = relatedStationAngle(binding, state);
      return angleDegrees === null ? null : { angleDegrees };
    }
    return null;
  }

  if (property === "visibility") {
    if (binding.semantic === "zoom-stage-visibility") {
      return {
        visible: zoomStageVisible(
          binding.targetWidgetName,
          state.activeZoomIndex ?? 0,
        ),
      };
    }
    const value = booleanValue(binding, state);
    return value === null ? null : { visible: value };
  }

  if (property === "color-and-opacity") {
    if (binding.valueModel?.kind === "constant-linear-color") {
      const color = binding.valueModel.color;
      return color ? { color, opacity: color.A } : null;
    }
    const value = booleanValue(binding, state);
    if (value === null) return null;
    const color = value
      ? binding.valueModel?.trueColor
      : binding.valueModel?.falseColor;
    return color
      ? { color, opacity: color.A }
      : null;
  }

  if (property === "render-opacity") {
    const value = booleanValue(binding, state);
    return value === null ? null : { opacity: value ? 1 : 0 };
  }

  return null;
}

export function resolveGunnerSightDynamicBindingGroup(
  bindings: readonly GunnerSightDynamicBindingLike[],
  state: GunnerSightRuntimeState,
): GunnerSightDynamicPresentation | null {
  if (bindings.length === 0) return null;
  const first = bindings[0];
  if (
    first.semantic === "current-weapon-selection-indicator" &&
    bindings.every((binding) =>
      binding.semantic === first.semantic &&
      binding.property === first.property &&
      binding.targetWidgetName === first.targetWidgetName
    )
  ) {
    return resolveGunnerSightDynamicBinding({
      ...first,
      relatedSeatPawnClassPaths: [...new Set(bindings.flatMap((binding) =>
        binding.relatedSeatPawnClassPaths ?? []
      ))],
    }, state);
  }
  for (const binding of bindings) {
    const resolved = resolveGunnerSightDynamicBinding(binding, state);
    if (resolved) return resolved;
  }
  return null;
}

function interpNumber(
  current: number | undefined,
  target: number | undefined,
  speedPerSecond: number,
  elapsedSeconds: number,
) {
  if (target === undefined) return undefined;
  if (current === undefined) return target;
  const alpha = Math.min(1, Math.max(0, speedPerSecond * elapsedSeconds));
  const next = current + (target - current) * alpha;
  return Math.abs(target - next) < 1e-4 ? target : next;
}

export function interpolateGunnerSightDynamicPresentation(
  current: GunnerSightDynamicPresentation | null | undefined,
  target: GunnerSightDynamicPresentation,
  speedPerSecond: number | null | undefined,
  elapsedSeconds: number,
): GunnerSightDynamicPresentation {
  if (
    !current ||
    typeof speedPerSecond !== "number" ||
    !Number.isFinite(speedPerSecond) ||
    speedPerSecond <= 0 ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds <= 0
  ) return target;
  const result: GunnerSightDynamicPresentation = {
    ...target,
    angleDegrees: interpNumber(
      current.angleDegrees,
      target.angleDegrees,
      speedPerSecond,
      elapsedSeconds,
    ),
    opacity: interpNumber(
      current.opacity,
      target.opacity,
      speedPerSecond,
      elapsedSeconds,
    ),
  };
  if (target.color) {
    result.color = {
      R: interpNumber(current.color?.R, target.color.R, speedPerSecond, elapsedSeconds)!,
      G: interpNumber(current.color?.G, target.color.G, speedPerSecond, elapsedSeconds)!,
      B: interpNumber(current.color?.B, target.color.B, speedPerSecond, elapsedSeconds)!,
      A: interpNumber(current.color?.A, target.color.A, speedPerSecond, elapsedSeconds)!,
    };
  }
  if (target.translation) {
    result.translation = {
      X: interpNumber(
        current.translation?.X,
        target.translation.X,
        speedPerSecond,
        elapsedSeconds,
      )!,
      Y: interpNumber(
        current.translation?.Y,
        target.translation.Y,
        speedPerSecond,
        elapsedSeconds,
      )!,
    };
  }
  return result;
}

export function gunnerSightDynamicPresentationSettled(
  current: GunnerSightDynamicPresentation,
  target: GunnerSightDynamicPresentation,
) {
  const close = (left: number | undefined, right: number | undefined) =>
    left === right || (
      left !== undefined && right !== undefined && Math.abs(left - right) < 1e-4
    );
  return current.text === target.text &&
    current.visible === target.visible &&
    close(current.angleDegrees, target.angleDegrees) &&
    close(current.opacity, target.opacity) &&
    close(current.color?.R, target.color?.R) &&
    close(current.color?.G, target.color?.G) &&
    close(current.color?.B, target.color?.B) &&
    close(current.color?.A, target.color?.A) &&
    close(current.translation?.X, target.translation?.X) &&
    close(current.translation?.Y, target.translation?.Y);
}
