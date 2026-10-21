/** Axis/unit re-expression only: callers retain space, origin, pose and bake state.
 * Matrices are column-major, column-vector affine transforms: B M B^-1.
 * No product/map names, dependencies, source data or normalization policy.
 */
const frames = Object.freeze({
  'ue-cm': { axes: [1, 2, 3], unitsPerMeter: 100, handedness: 1 },
  'ue-m': { axes: [1, 2, 3], unitsPerMeter: 1, handedness: 1 },
  'gltf-m': { axes: [1, 3, 2], unitsPerMeter: 1, handedness: -1 },
  'render-m': { axes: [1, -2, 3], unitsPerMeter: 1, handedness: -1 },
});
/** @typedef {'ue-cm'|'ue-m'|'gltf-m'|'render-m'} CoordinateBasis */
/** @typedef {[number,number,number]} Vec3 */
/** @param {readonly number[]} value @param {number} length */
function requireFinite(value, length) {
  if (value.length !== length) throw Error('Invalid coordinate value');
  for (let i = 0; i < length; i++) if (!Number.isFinite(value[i])) throw Error('Invalid coordinate value');
}
/** Compile once per format boundary, never infer a basis from a filename.
 * Directions retain length; normals need inverse-transpose for nonuniform poses.
 * @param {CoordinateBasis} source @param {CoordinateBasis} target
 */
export function coordinateAdapter(source, target) {
  if (!Object.hasOwn(frames, source) || !Object.hasOwn(frames, target)) throw Error('Unknown coordinate basis');
  const from = frames[source], to = frames[target];
  const indices = to.axes.map(axis => from.axes.findIndex(v => Math.abs(v) === Math.abs(axis)));
  const signs = to.axes.map((axis, i) => Math.sign(axis) * Math.sign(from.axes[indices[i]]));
  const divisor = from.unitsPerMeter / to.unitsPerMeter;
  const parity = from.handedness * to.handedness;
  const [i0,i1,i2] = indices, [s0,s1,s2] = signs;
  /** @param {number} v */
  const scale = divisor < 1 ? v => v * (1 / divisor) : v => v / divisor;
  /** @param {readonly number[]} value @returns {Vec3} */
  const direction = value => {
    requireFinite(value, 3);
    return [s0 * value[i0], s1 * value[i1], s2 * value[i2]];
  };
  /** @param {readonly number[]} value @returns {Vec3} */
  const position = value => {
    requireFinite(value, 3);
    return [scale(s0 * value[i0]), scale(s1 * value[i1]), scale(s2 * value[i2])];
  };
  return Object.freeze({
    source, target, reversesWinding: parity < 0, position, direction,
    /** Quaternion handedness changes are axial-vector changes, not XYZ swaps.
     * Input normalization remains the caller's existing policy.
     * @param {readonly number[]} value @returns {[number,number,number,number]}
     */
    quaternion(value) {
      requireFinite(value, 4);
      return [parity * s0 * value[i0], parity * s1 * value[i1], parity * s2 * value[i2], value[3]];
    },
    /** Translation scales; the linear part is conjugated, never scaled twice.
     * @param {readonly number[]} matrix
     */
    affine(matrix) {
      requireFinite(matrix, 16);
      if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw Error('Expected affine column-major matrix');
      const out = Array(16).fill(0); out[15] = 1;
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
        out[c * 4 + r] = signs[r] * signs[c] * matrix[indices[c] * 4 + indices[r]];
      }
      const t = position(matrix.slice(12, 15));
      out[12] = t[0]; out[13] = t[1]; out[14] = t[2];
      return out;
    },
  });
}
