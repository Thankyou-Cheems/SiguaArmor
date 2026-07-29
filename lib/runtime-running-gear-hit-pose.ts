import type { HitSceneComponent } from "./hit-scene-pack";

export interface RuntimeRunningGearBonePose {
  stableOccurrenceId: string;
  boneName: string;
  matrix: readonly number[];
}

export interface RuntimeRunningGearHitComponentPose {
  componentIndex: number;
  boneName: string;
  stableOccurrenceId: string;
  matrix: readonly number[];
}

export interface RuntimeRunningGearHitPoseResolution {
  componentPoses: RuntimeRunningGearHitComponentPose[];
  unmatchedComponentIndices: number[];
  ambiguousComponentIndices: number[];
}

function normalizedRunningGearIdentity(value: string) {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]/gu, "");
}

function componentLeaf(componentPath: string) {
  const separator = componentPath.lastIndexOf(".");
  return separator >= 0 ? componentPath.slice(separator + 1) : componentPath;
}

function validPose(pose: RuntimeRunningGearBonePose) {
  return (
    pose.stableOccurrenceId.length > 0 &&
    pose.boneName.length > 0 &&
    pose.matrix.length === 16 &&
    pose.matrix.every(Number.isFinite)
  );
}

/**
 * Resolves only exact wheel-component suffixes to exact configured wheel
 * bones. Track collision components stay rigid with the chassis because the
 * planar evidence does not reconstruct track deformation between wheels.
 */
export function resolveRuntimeRunningGearHitComponentPoses(
  components: readonly Pick<
    HitSceneComponent,
    "componentPath" | "semanticKind"
  >[],
  bonePoses: readonly RuntimeRunningGearBonePose[],
): RuntimeRunningGearHitPoseResolution {
  const validBonePoses = bonePoses
    .filter(validPose)
    .map((pose) => ({
      ...pose,
      normalizedBoneName: normalizedRunningGearIdentity(pose.boneName),
    }))
    .filter(({ normalizedBoneName }) => normalizedBoneName.length >= 5);
  const componentPoses: RuntimeRunningGearHitComponentPose[] = [];
  const unmatchedComponentIndices: number[] = [];
  const ambiguousComponentIndices: number[] = [];

  components.forEach((component, componentIndex) => {
    if (component.semanticKind !== "wheel") return;
    const normalizedComponentName = normalizedRunningGearIdentity(
      componentLeaf(component.componentPath),
    );
    const candidates = validBonePoses.filter(({ normalizedBoneName }) =>
      normalizedComponentName.endsWith(normalizedBoneName),
    );
    if (candidates.length === 0) {
      unmatchedComponentIndices.push(componentIndex);
      return;
    }
    if (candidates.length !== 1) {
      ambiguousComponentIndices.push(componentIndex);
      return;
    }
    const [candidate] = candidates;
    componentPoses.push({
      componentIndex,
      boneName: candidate.boneName,
      stableOccurrenceId: candidate.stableOccurrenceId,
      matrix: candidate.matrix,
    });
  });

  return {
    componentPoses,
    unmatchedComponentIndices,
    ambiguousComponentIndices,
  };
}
