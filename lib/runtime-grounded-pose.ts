export interface RuntimeGroundedPose {
  schemaVersion: "sigua-vehicle-grounded-pose/v1";
  sourceBuildId: string;
  generatedClass: string;
  basis: "gltf-y-up-metres-parent-local";
  admission: "rendered-physics-three-stable-samples";
  chassis: {
    gltfMatrix: number[];
    pitchDeg: number;
    rollDeg: number;
    heightAbovePlaneCm: number;
  };
  rigs: { boneNames: string[]; localMatrices: number[] }[];
  bindings: { stableOccurrenceId: string; assetUrl: string; sourceMeshPath: string; rigIndex: number }[];
}

function validMatrix(value: unknown, requireNonsingular = true): value is number[] {
  if (!Array.isArray(value) || value.length !== 16 || !value.every(Number.isFinite)) return false;
  const m = value;
  const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  return (!requireNonsingular || Math.abs(determinant) > 1e-12) && [m[3], m[7], m[11], m[15] - 1].every(v => Math.abs(v) < 1e-9);
}

export function validateRuntimeGroundedPose(value: unknown, generatedClass: string): RuntimeGroundedPose {
  const pose = value as RuntimeGroundedPose;
  if (pose?.schemaVersion !== "sigua-vehicle-grounded-pose/v1" ||
    pose.generatedClass !== generatedClass || pose.basis !== "gltf-y-up-metres-parent-local" ||
    pose.admission !== "rendered-physics-three-stable-samples" ||
    typeof pose.sourceBuildId !== "string" || !pose.sourceBuildId || !pose.chassis ||
    !validMatrix(pose.chassis.gltfMatrix) ||
    ![...pose.chassis.gltfMatrix, pose.chassis.pitchDeg, pose.chassis.rollDeg, pose.chassis.heightAbovePlaneCm].every(Number.isFinite) ||
    !Array.isArray(pose.rigs) || !pose.rigs.length || !Array.isArray(pose.bindings) || !pose.bindings.length) {
    throw new Error("Invalid rendered physical pose");
  }
  for (const rig of pose.rigs) {
    if (!Array.isArray(rig.boneNames) || !rig.boneNames.length ||
      !rig.boneNames.every(name => typeof name === "string" && name.length > 0) ||
      new Set(rig.boneNames).size !== rig.boneNames.length ||
      rig.localMatrices?.length !== rig.boneNames.length * 16 || !rig.localMatrices.every(Number.isFinite)) {
      throw new Error("Invalid rendered skeleton pose");
    }
    for (let i = 0; i < rig.boneNames.length; i++) {
      // Some unused animated panels are intentionally hidden by zero scale.
      // Selected running-gear transforms have a separate nonsingular gate.
      if (!validMatrix(rig.localMatrices.slice(i * 16, i * 16 + 16), false)) throw new Error("Invalid rendered joint matrix");
    }
  }
  const identities = new Set<string>();
  for (const binding of pose.bindings) {
    const identity = `${binding.stableOccurrenceId}\0${binding.assetUrl}`;
    if (typeof binding.stableOccurrenceId !== "string" || !binding.stableOccurrenceId ||
      typeof binding.assetUrl !== "string" || !/^\/assets\/runtime-probe\/models\/[a-f0-9]{64}\.gltf$/u.test(binding.assetUrl) ||
      typeof binding.sourceMeshPath !== "string" || !binding.sourceMeshPath ||
      !Number.isInteger(binding.rigIndex) || !pose.rigs[binding.rigIndex] || identities.has(identity)) {
      throw new Error("Invalid rendered pose occurrence binding");
    }
    identities.add(identity);
  }
  return pose;
}

export function groundedPoseLocalMatrices(
  pose: RuntimeGroundedPose | null | undefined,
  generatedClass: string | null,
  placement: { stableOccurrenceId: string; assetUrl: string; sourceMeshPath: string },
): Readonly<Record<string, readonly number[]>> | undefined {
  if (!pose || pose.generatedClass !== generatedClass) return undefined;
  const matches = pose.bindings.filter(b => b.stableOccurrenceId === placement.stableOccurrenceId &&
    b.assetUrl === placement.assetUrl && b.sourceMeshPath === placement.sourceMeshPath);
  if (matches.length !== 1) return undefined;
  const rig = pose.rigs[matches[0].rigIndex];
  return Object.fromEntries(rig.boneNames.map((name, index) => [name, rig.localMatrices.slice(index * 16, index * 16 + 16)]));
}
