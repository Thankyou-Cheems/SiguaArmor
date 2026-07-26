export const MAX_SHARED_SHOT_PATHS = 5;

const SHARE_FORMAT_VERSION = 1;
const BYTES_PER_PATH = 12;
const ENTRY_POINT_SCALE = 100;
const MAX_ENTRY_POINT_COMPONENT = 32767 / ENTRY_POINT_SCALE;
const MAX_TOKEN_LENGTH = Math.ceil((1 + MAX_SHARED_SHOT_PATHS * BYTES_PER_PATH) / 3) * 4;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function signedUnit(value) {
  return value < 0 ? -1 : 1;
}

function normalizeDirection(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError("Shared shot direction must contain three finite numbers");
  }
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-6) throw new RangeError("Shared shot direction cannot be zero");
  return [value[0] / length, value[1] / length, value[2] / length];
}

function encodeOctahedralDirection(value) {
  const direction = normalizeDirection(value);
  const l1 = Math.abs(direction[0]) + Math.abs(direction[1]) + Math.abs(direction[2]);
  let x = direction[0] / l1;
  let y = direction[1] / l1;
  const z = direction[2] / l1;
  if (z < 0) {
    const previousX = x;
    x = (1 - Math.abs(y)) * signedUnit(previousX);
    y = (1 - Math.abs(previousX)) * signedUnit(y);
  }
  return [
    Math.round(clamp(x, -1, 1) * 32767),
    Math.round(clamp(y, -1, 1) * 32767),
  ];
}

function decodeOctahedralDirection(xValue, yValue) {
  let x = clamp(xValue / 32767, -1, 1);
  let y = clamp(yValue / 32767, -1, 1);
  let z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const previousX = x;
    x = (1 - Math.abs(y)) * signedUnit(previousX);
    y = (1 - Math.abs(previousX)) * signedUnit(y);
  }
  return normalizeDirection([x, y, z]);
}

function encodeEntryPoint(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError("Shared shot entry point must contain three finite numbers");
  }
  return value.map((component) => {
    if (Math.abs(component) > MAX_ENTRY_POINT_COMPONENT) {
      throw new RangeError("Shared shot entry point is outside the compact coordinate range");
    }
    return Math.round(component * ENTRY_POINT_SCALE);
  });
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(token) {
  if (!/^[A-Za-z0-9_-]+$/u.test(token)) throw new TypeError("Invalid shared shot token");
  const padded = token.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(token.length / 4) * 4,
    "=",
  );
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeSharedShotPaths(paths, activeIndex = paths.length - 1) {
  if (!Array.isArray(paths) || paths.length === 0) return "";
  const boundedPaths = paths.slice(-MAX_SHARED_SHOT_PATHS);
  const boundedActiveIndex = clamp(
    Number.isInteger(activeIndex) ? activeIndex - Math.max(0, paths.length - boundedPaths.length) : 0,
    0,
    boundedPaths.length - 1,
  );
  const bytes = new Uint8Array(1 + boundedPaths.length * BYTES_PER_PATH);
  const view = new DataView(bytes.buffer);
  bytes[0] = (SHARE_FORMAT_VERSION << 6) | (boundedActiveIndex << 3) | boundedPaths.length;

  boundedPaths.forEach((path, index) => {
    const offset = 1 + index * BYTES_PER_PATH;
    const entryPoint = encodeEntryPoint(path.entryPoint);
    const direction = encodeOctahedralDirection(path.direction);
    const distanceM = clamp(Number(path.distanceM), 0, 3000);
    if (!Number.isFinite(distanceM)) throw new TypeError("Shared shot distance must be finite");
    view.setInt16(offset, entryPoint[0], true);
    view.setInt16(offset + 2, entryPoint[1], true);
    view.setInt16(offset + 4, entryPoint[2], true);
    view.setInt16(offset + 6, direction[0], true);
    view.setInt16(offset + 8, direction[1], true);
    view.setUint16(offset + 10, Math.round(distanceM * 10), true);
  });
  return bytesToBase64Url(bytes);
}

export function decodeSharedShotPaths(token) {
  const empty = { paths: [], activeIndex: -1 };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return empty;
  try {
    const bytes = base64UrlToBytes(token);
    const version = bytes[0] >> 6;
    const count = bytes[0] & 0b111;
    const activeIndex = (bytes[0] >> 3) & 0b111;
    if (
      version !== SHARE_FORMAT_VERSION ||
      count < 1 ||
      count > MAX_SHARED_SHOT_PATHS ||
      activeIndex >= count ||
      bytes.length !== 1 + count * BYTES_PER_PATH
    ) {
      return empty;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const paths = Array.from({ length: count }, (_, index) => {
      const offset = 1 + index * BYTES_PER_PATH;
      return {
        entryPoint: [
          view.getInt16(offset, true) / ENTRY_POINT_SCALE,
          view.getInt16(offset + 2, true) / ENTRY_POINT_SCALE,
          view.getInt16(offset + 4, true) / ENTRY_POINT_SCALE,
        ],
        direction: decodeOctahedralDirection(
          view.getInt16(offset + 6, true),
          view.getInt16(offset + 8, true),
        ),
        distanceM: view.getUint16(offset + 10, true) / 10,
      };
    });
    return { paths, activeIndex };
  } catch {
    return empty;
  }
}

export function normalizeSharedShotToken(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN_LENGTH) return "";
  const decoded = decodeSharedShotPaths(value);
  if (decoded.paths.length === 0) return "";
  return encodeSharedShotPaths(decoded.paths, decoded.activeIndex) === value ? value : "";
}
