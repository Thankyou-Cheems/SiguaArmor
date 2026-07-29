import * as THREE from "three";

export type RuntimeSkeletalPoseMode =
  | "observed"
  | "reference"
  | "native-planar";

export type RuntimeSkeletalPoseEvidence =
  | "observed-stable"
  | "observed-snapshot"
  | "reference-equivalent";

export interface RuntimeSkeletalPoseController {
  readonly evidence: RuntimeSkeletalPoseEvidence;
  readonly selectedBoneNames: readonly string[];
  readonly changedBoneNames: readonly string[];
  readonly declaredReferenceEquivalentMismatch: boolean;
  apply(
    mode: RuntimeSkeletalPoseMode,
    referenceTranslationOffsetsByBoneName?: RuntimeBoneTranslationOffsets,
  ): void;
  componentPoseMatrixForBone(
    boneName: string,
    componentRoot: THREE.Object3D,
  ): THREE.Matrix4 | null;
}

interface LocalTrs {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface RuntimeBoneTranslationOffset {
  x: number;
  y: number;
  z: number;
}

export type RuntimeBoneTranslationOffsets = Readonly<
  Record<string, RuntimeBoneTranslationOffset>
>;

export interface RuntimeSkeletalPoseControllerOptions {
  observedSampleCount: number;
  referenceEquivalent: boolean;
}

interface RuntimeChassisJointContext {
  assetHasPrimary?: boolean;
  relatedToPrimary?: boolean;
}

export type RuntimeChassisJointClassification =
  | {
      status: "include";
      role: string;
      ruleId: string;
      confidence: "high" | "structural";
    }
  | {
      status: "exclude";
      role: null;
      ruleId: string;
      confidence: "high";
      reason: string;
    }
  | {
      status: "unknown";
      role: null;
      ruleId: "no-high-confidence-rule";
      confidence: null;
    };

const INTERIOR_STEERING_WHEEL =
  /(?:^|[_-])steering[_-]?wheel(?:[_-]|$)|^steeringwheel|steeringwheelbone|^bone_steering_wheel$/iu;
const PRESSURE_INSTRUMENT = /(?:tire|tyre)[_-]?pressure/iu;
const HATCH_DAMPER = /hatch.*damper|damper.*hatch/iu;
const SUSPENSION_TOKEN = /susp(?:ension)?/iu;
const WHEEL_TOKEN = /wheel/iu;
const TIRE_TOKEN = /(?:tire|tyre)/iu;
const SHOCK_TOKEN = /shock/iu;
const SPRING_TOKEN = /spring/iu;
const SWAY_BAR_TOKEN = /sway[_-]?bar/iu;
const SWING_ARM_TOKEN = /swing[_-]?arm/iu;
const TIE_ROD_TOKEN = /tie[_-]?rod/iu;
const DRIVE_AXLE_TOKEN = /drive[_-]?axle|driveaxle/iu;
const AXLE_TOKEN = /axle/iu;
const HUB_TOKEN = /hub/iu;
const STRUT_TOKEN = /strut/iu;
const BOGIE_TOKEN = /bogie/iu;
const IDLER_TOKEN = /idler/iu;
const SPROCKET_TOKEN = /sprocket/iu;
const RETURN_ROLLER_TOKEN = /return[_-]?roller/iu;

// Reconstructing local TRS from inverse-bind matrices introduces low-order
// float noise (about 1.15e-7 on the T-64 rig) even when the poses are
// semantically identical.
const LOCAL_MATRIX_EPSILON = 1e-6;

function included(
  role: string,
  ruleId: string,
  confidence: "high" | "structural" = "high",
): RuntimeChassisJointClassification {
  return { status: "include", role, ruleId, confidence };
}

function excluded(
  ruleId: string,
  reason: string,
): RuntimeChassisJointClassification {
  return {
    status: "exclude",
    role: null,
    ruleId,
    confidence: "high",
    reason,
  };
}

function unknown(): RuntimeChassisJointClassification {
  return {
    status: "unknown",
    role: null,
    ruleId: "no-high-confidence-rule",
    confidence: null,
  };
}

export function classifyRuntimeChassisJointName(
  name: string,
  context: RuntimeChassisJointContext = {},
): RuntimeChassisJointClassification {
  if (typeof name !== "string" || name.trim() === "") return unknown();

  if (INTERIOR_STEERING_WHEEL.test(name)) {
    return excluded(
      "exclude-interior-steering-wheel",
      "Cabin steering-wheel control, not running gear.",
    );
  }
  if (PRESSURE_INSTRUMENT.test(name)) {
    return excluded(
      "exclude-pressure-instrument",
      "Tire-pressure instrument, not running gear.",
    );
  }
  if (HATCH_DAMPER.test(name)) {
    return excluded(
      "exclude-hatch-damper",
      "Hatch damper, not running gear.",
    );
  }

  if (SUSPENSION_TOKEN.test(name)) {
    if (SHOCK_TOKEN.test(name)) {
      return included("suspension-shock", "include-suspension-shock");
    }
    if (SPRING_TOKEN.test(name)) {
      return included("suspension-spring", "include-suspension-spring");
    }
    if (SWAY_BAR_TOKEN.test(name)) {
      return included("suspension-sway-bar", "include-suspension-sway-bar");
    }
    if (TIE_ROD_TOKEN.test(name)) {
      return included("suspension-tie-rod", "include-suspension-tie-rod");
    }
    if (DRIVE_AXLE_TOKEN.test(name)) {
      return included("suspension-drive-axle", "include-suspension-drive-axle");
    }
    if (AXLE_TOKEN.test(name)) {
      return included("suspension-axle", "include-suspension-axle");
    }
    if (HUB_TOKEN.test(name)) {
      return included("suspension-hub", "include-suspension-hub");
    }
    if (/arm/iu.test(name)) {
      return included("suspension-arm", "include-suspension-arm");
    }
    if (/root|base|top|bottom|middle|mid|upper|lower/iu.test(name)) {
      return included("suspension-anchor", "include-suspension-anchor");
    }
    if (/link|elbow|lookat|steer/iu.test(name)) {
      return included("suspension-linkage", "include-suspension-linkage");
    }
    return included("suspension-other", "include-suspension-token");
  }

  if (WHEEL_TOKEN.test(name)) {
    if (HUB_TOKEN.test(name) || /attach/iu.test(name)) {
      return included("wheel-hub", "include-wheel-hub");
    }
    if (TIRE_TOKEN.test(name)) {
      return included("wheel-tire", "include-wheel-tire");
    }
    if (/roller/iu.test(name)) {
      return included("track-return-wheel", "include-wheel-roller");
    }
    if (/stabilis/iu.test(name)) {
      return included("stabilizer-wheel", "include-stabilizer-wheel");
    }
    if (/sim/iu.test(name)) {
      return included("wheel-physics-helper", "include-sim-wheel");
    }
    if (/phys|visual/iu.test(name)) {
      return included("wheel-helper", "include-wheel-helper");
    }
    return included("wheel", "include-wheel-token");
  }

  if (TIRE_TOKEN.test(name)) {
    return included("wheel-tire", "include-tire-token");
  }

  if (context.assetHasPrimary !== true) return unknown();

  if (SHOCK_TOKEN.test(name)) {
    return included("suspension-shock", "include-shock-token");
  }
  if (SPRING_TOKEN.test(name)) {
    return included("suspension-spring", "include-spring-token");
  }
  if (SWAY_BAR_TOKEN.test(name)) {
    return included("suspension-sway-bar", "include-sway-bar-token");
  }
  if (SWING_ARM_TOKEN.test(name)) {
    return included("suspension-arm", "include-swing-arm-token");
  }
  if (TIE_ROD_TOKEN.test(name)) {
    return included("suspension-tie-rod", "include-tie-rod-token");
  }
  if (DRIVE_AXLE_TOKEN.test(name)) {
    return included("drive-axle", "include-drive-axle-token");
  }
  if (AXLE_TOKEN.test(name)) {
    return included("axle", "include-axle-token");
  }
  if (BOGIE_TOKEN.test(name)) {
    return included("track-bogie", "include-bogie-token");
  }
  if (IDLER_TOKEN.test(name)) {
    return included("track-idler", "include-idler-token");
  }
  if (SPROCKET_TOKEN.test(name)) {
    return included("track-sprocket", "include-sprocket-token");
  }
  if (RETURN_ROLLER_TOKEN.test(name)) {
    return included("track-return-wheel", "include-return-roller-token");
  }

  if (context.relatedToPrimary === true && HUB_TOKEN.test(name)) {
    return included(
      "suspension-hub",
      "include-related-hub-token",
      "structural",
    );
  }
  if (context.relatedToPrimary === true && STRUT_TOKEN.test(name)) {
    return included(
      "suspension-strut",
      "include-related-strut-token",
      "structural",
    );
  }

  return unknown();
}

function isPrimaryRuntimeRunningGearJoint(name: string) {
  const classification = classifyRuntimeChassisJointName(name);
  return (
    classification.status === "include" &&
    (SUSPENSION_TOKEN.test(name) ||
      WHEEL_TOKEN.test(name) ||
      TIRE_TOKEN.test(name))
  );
}

function localTrs(bone: THREE.Bone): LocalTrs {
  return {
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  };
}

function localTrsFromMatrix(matrix: THREE.Matrix4): LocalTrs {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function applyLocalTrs(bone: THREE.Bone, value: LocalTrs) {
  bone.position.copy(value.position);
  bone.quaternion.copy(value.quaternion);
  bone.scale.copy(value.scale);
  bone.updateMatrix();
  bone.matrixWorldNeedsUpdate = true;
}

function localMatrix(value: LocalTrs) {
  return new THREE.Matrix4().compose(
    value.position,
    value.quaternion,
    value.scale,
  );
}

function localTrsChanged(left: LocalTrs, right: LocalTrs) {
  const leftElements = localMatrix(left).elements;
  const rightElements = localMatrix(right).elements;
  return leftElements.some(
    (value, index) =>
      Math.abs(value - rightElements[index]) > LOCAL_MATRIX_EPSILON,
  );
}

function updateSkeletonWorld(skeleton: THREE.Skeleton) {
  const bones = new Set(skeleton.bones);
  for (const bone of skeleton.bones) {
    if (!(bone.parent instanceof THREE.Bone) || !bones.has(bone.parent)) {
      bone.updateMatrixWorld(true);
    }
  }
  skeleton.update();
}

function selectedWheelPoseBones(skeleton: THREE.Skeleton) {
  const bones = new Set(skeleton.bones);
  const selected = new Set<THREE.Bone>();
  const primaryBones = new Set(
    skeleton.bones.filter((bone) =>
      isPrimaryRuntimeRunningGearJoint(bone.name),
    ),
  );

  function relatedToPrimary(candidate: THREE.Bone) {
    for (const primary of primaryBones) {
      let current: THREE.Object3D | null = primary;
      while (current instanceof THREE.Bone && bones.has(current)) {
        if (current === candidate) return true;
        current = current.parent;
      }

      current = candidate;
      while (current instanceof THREE.Bone && bones.has(current)) {
        if (current === primary) return true;
        current = current.parent;
      }
    }
    return false;
  }

  for (const bone of skeleton.bones) {
    const classification = classifyRuntimeChassisJointName(bone.name, {
      assetHasPrimary: primaryBones.size > 0,
      relatedToPrimary: relatedToPrimary(bone),
    });
    if (classification.status !== "include") continue;
    selected.add(bone);

    let parent = bone.parent;
    while (parent instanceof THREE.Bone && bones.has(parent)) {
      const grandparent = parent.parent;
      if (!(grandparent instanceof THREE.Bone) || !bones.has(grandparent)) {
        // Keep the source skeleton root as the rigid chassis boundary. The
        // settled chassis matrix is applied by the viewer outside the skin.
        break;
      }
      selected.add(parent);
      parent = grandparent;
    }
  }

  return skeleton.bones.filter((bone) => selected.has(bone));
}

export function isRuntimeWheelOrSuspensionBoneName(name: string) {
  return (
    classifyRuntimeChassisJointName(name, {
      assetHasPrimary: true,
    }).status === "include"
  );
}

export function runtimeSkeletalPoseEvidence({
  observedSampleCount,
  referenceEquivalent,
}: RuntimeSkeletalPoseControllerOptions): RuntimeSkeletalPoseEvidence {
  if (referenceEquivalent) return "reference-equivalent";
  return observedSampleCount >= 3
    ? "observed-stable"
    : "observed-snapshot";
}

export function createRuntimeSkeletalPoseController(
  skeleton: THREE.Skeleton,
  options: RuntimeSkeletalPoseControllerOptions,
): RuntimeSkeletalPoseController | null {
  if (
    skeleton.bones.length === 0 ||
    skeleton.bones.length !== skeleton.boneInverses.length ||
    skeleton.boneInverses.some(
      (inverse) =>
        inverse.elements.some((value) => !Number.isFinite(value)) ||
        Math.abs(inverse.determinant()) <= 1e-12,
    )
  ) {
    return null;
  }

  const selectedBones = selectedWheelPoseBones(skeleton);
  if (selectedBones.length === 0) return null;

  const observedByBone = new Map(
    skeleton.bones.map((bone) => [bone, localTrs(bone)]),
  );

  const boneIndexByBone = new Map(
    skeleton.bones.map((bone, index) => [bone, index]),
  );
  const referenceByBone = new Map<THREE.Bone, LocalTrs>();
  for (let index = 0; index < skeleton.bones.length; index += 1) {
    const bone = skeleton.bones[index];
    const parent = bone.parent;
    const parentIndex =
      parent instanceof THREE.Bone ? boneIndexByBone.get(parent) : undefined;
    if (parentIndex === undefined) {
      // Release optimization may rewrite the common root inverse-bind basis.
      // The root remains the rigid chassis boundary; only parent-relative
      // inverse-bind transforms are invariant under that rewrite.
      referenceByBone.set(bone, observedByBone.get(bone)!);
      continue;
    }
    const childInverse = skeleton.boneInverses[index];
    const referenceLocal = skeleton.boneInverses[parentIndex]
      .clone()
      .multiply(childInverse.clone().invert());
    referenceByBone.set(bone, localTrsFromMatrix(referenceLocal));
  }

  const changedBoneNames = selectedBones
    .filter((bone) =>
      localTrsChanged(
        observedByBone.get(bone)!,
        referenceByBone.get(bone)!,
      ),
    )
    .map((bone) => bone.name);
  const selectedBoneByName = new Map<string, THREE.Bone | null>();
  for (const bone of selectedBones) {
    selectedBoneByName.set(
      bone.name,
      selectedBoneByName.has(bone.name) ? null : bone,
    );
  }

  const boneMatrixRelativeTo = (
    bone: THREE.Bone,
    componentRoot: THREE.Object3D,
    reference: boolean,
  ) => {
    const chain: THREE.Object3D[] = [];
    let current: THREE.Object3D | null = bone;
    while (current && current !== componentRoot) {
      chain.push(current);
      current = current.parent;
    }
    if (current !== componentRoot) return null;

    const result = new THREE.Matrix4();
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const object = chain[index];
      if (
        reference &&
        object instanceof THREE.Bone &&
        selectedBones.includes(object)
      ) {
        result.multiply(localMatrix(referenceByBone.get(object)!));
      } else {
        if (object.matrixAutoUpdate) object.updateMatrix();
        result.multiply(object.matrix);
      }
    }
    return result;
  };

  return {
    evidence: runtimeSkeletalPoseEvidence(options),
    selectedBoneNames: selectedBones.map((bone) => bone.name),
    changedBoneNames,
    declaredReferenceEquivalentMismatch:
      options.referenceEquivalent && changedBoneNames.length > 0,
    apply(mode, referenceTranslationOffsetsByBoneName = {}) {
      for (const bone of selectedBones) {
        const offset = referenceTranslationOffsetsByBoneName[bone.name];
        const nativePlanarBone = mode === "native-planar" && offset;
        applyLocalTrs(
          bone,
          mode === "reference" || nativePlanarBone
            ? referenceByBone.get(bone)!
            : observedByBone.get(bone)!,
        );
        if (
          nativePlanarBone &&
          Number.isFinite(offset.x) &&
          Number.isFinite(offset.y) &&
          Number.isFinite(offset.z)
        ) {
          bone.position.add(offset);
          bone.updateMatrix();
          bone.matrixWorldNeedsUpdate = true;
        }
      }
      updateSkeletonWorld(skeleton);
    },
    componentPoseMatrixForBone(boneName, componentRoot) {
      const bone = selectedBoneByName.get(boneName);
      if (!bone) return null;
      const referenceMatrix = boneMatrixRelativeTo(
        bone,
        componentRoot,
        true,
      );
      const currentMatrix = boneMatrixRelativeTo(
        bone,
        componentRoot,
        false,
      );
      if (
        !referenceMatrix ||
        !currentMatrix ||
        Math.abs(referenceMatrix.determinant()) <= 1e-12
      ) {
        return null;
      }
      return currentMatrix
        .clone()
        .multiply(referenceMatrix.clone().invert());
    },
  };
}
