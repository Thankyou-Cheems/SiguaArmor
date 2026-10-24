import { validateRuntimeGroundedPose } from "./runtime-grounded-pose.ts";

// Compare the complete JSON documents, including fields unknown to the runtime
// projection. In particular, do not normalize matrices or erase signed zero.
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key =>
    Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/** A changed flat-record hash may only add model URLs to an existing exact
 * occurrence/source/rig binding. This does not renew the pose's authority. */
export function assertAppendOnlyGroundedPoseAliases(
  referenceValue: unknown,
  currentValue: unknown,
  generatedClass: string,
): void {
  const reference = validateRuntimeGroundedPose(referenceValue, generatedClass);
  const current = validateRuntimeGroundedPose(currentValue, generatedClass);
  const { bindings: oldBindings, ...oldFields } = reference;
  const { bindings: newBindings, ...newFields } = current;
  if (!sameValue(oldFields, newFields) || newBindings.length <= oldBindings.length ||
    !oldBindings.every((binding, index) => sameValue(binding, newBindings[index])) ||
    !newBindings.slice(oldBindings.length).every(alias => oldBindings.some(binding =>
      sameValue(binding, { ...alias, assetUrl: binding.assetUrl })))) {
    throw new Error("平地基准已更新，地形姿态需刷新");
  }
}
