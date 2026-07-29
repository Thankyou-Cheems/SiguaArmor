const RUNTIME_GROUND_SCALE_LENGTHS_M = [
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  20,
  50,
  100,
] as const;

export const RUNTIME_GROUND_SCALE_SEGMENTS = 5;

export function runtimeGroundScaleLengthM(modelSpanM: number) {
  if (!Number.isFinite(modelSpanM) || modelSpanM <= 0) return 1;
  const targetM = Math.max(modelSpanM, RUNTIME_GROUND_SCALE_LENGTHS_M[0]);
  let selectedM: number = RUNTIME_GROUND_SCALE_LENGTHS_M[0];
  let selectedDistance = Math.abs(Math.log(selectedM / targetM));
  for (const candidateM of RUNTIME_GROUND_SCALE_LENGTHS_M) {
    const candidateDistance = Math.abs(Math.log(candidateM / targetM));
    if (candidateDistance < selectedDistance) {
      selectedM = candidateM;
      selectedDistance = candidateDistance;
    }
  }
  return selectedM;
}
