const TURRET_TOKEN_VERSION = 1;
const MAX_TURRET_STATIONS = 32;
const BYTES_PER_POSE = 5;
const ANGLE_SCALE = 10;
const MAX_TOKEN_BYTES = 1 + MAX_TURRET_STATIONS * BYTES_PER_POSE;
const MAX_TOKEN_LENGTH = Math.ceil(MAX_TOKEN_BYTES / 3) * 4;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/u;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteAngle(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.round(clamp(parsed, minimum, maximum) * ANGLE_SCALE) / ANGLE_SCALE
    : 0;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(token) {
  const base64 = token.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizedState(value) {
  if (!value || typeof value !== "object") return null;
  const activeStationIndex = Number(value.activeStationIndex);
  if (
    !Number.isInteger(activeStationIndex) ||
    activeStationIndex < 0 ||
    activeStationIndex >= MAX_TURRET_STATIONS
  ) {
    return null;
  }
  const poses = Array.isArray(value.poses) ? value.poses : [];
  const normalizedPoses = [];
  const seen = new Set();
  for (const pose of poses) {
    const stationIndex = Number(pose?.stationIndex);
    if (
      !Number.isInteger(stationIndex) ||
      stationIndex < 0 ||
      stationIndex >= MAX_TURRET_STATIONS ||
      seen.has(stationIndex)
    ) {
      return null;
    }
    seen.add(stationIndex);
    const yawDegrees = finiteAngle(pose.yawDegrees, -180, 180);
    const pitchDegrees = finiteAngle(pose.pitchDegrees, -90, 90);
    if (yawDegrees === 0 && pitchDegrees === 0) continue;
    normalizedPoses.push({ stationIndex, yawDegrees, pitchDegrees });
  }
  normalizedPoses.sort((left, right) => left.stationIndex - right.stationIndex);
  return { activeStationIndex, poses: normalizedPoses };
}

export function encodeViewerTurretState(value) {
  const normalized = normalizedState(value);
  if (!normalized) return "";
  if (normalized.activeStationIndex === 0 && normalized.poses.length === 0) {
    return "";
  }
  const bytes = new Uint8Array(1 + normalized.poses.length * BYTES_PER_POSE);
  const view = new DataView(bytes.buffer);
  bytes[0] = (TURRET_TOKEN_VERSION << 6) | normalized.activeStationIndex;
  normalized.poses.forEach((pose, index) => {
    const offset = 1 + index * BYTES_PER_POSE;
    view.setUint8(offset, pose.stationIndex);
    view.setInt16(offset + 1, Math.round(pose.yawDegrees * ANGLE_SCALE), true);
    view.setInt16(offset + 3, Math.round(pose.pitchDegrees * ANGLE_SCALE), true);
  });
  return bytesToBase64Url(bytes);
}

function decodeViewerTurretStateUnchecked(token) {
  const bytes = base64UrlToBytes(token);
  if (
    bytes.length < 1 ||
    bytes.length > MAX_TOKEN_BYTES ||
    (bytes.length - 1) % BYTES_PER_POSE !== 0
  ) {
    return null;
  }
  const version = bytes[0] >> 6;
  const activeStationIndex = bytes[0] & 0b111111;
  if (
    version !== TURRET_TOKEN_VERSION ||
    activeStationIndex >= MAX_TURRET_STATIONS
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const poses = [];
  let previousStationIndex = -1;
  for (let offset = 1; offset < bytes.length; offset += BYTES_PER_POSE) {
    const stationIndex = view.getUint8(offset);
    const yawDegrees = view.getInt16(offset + 1, true) / ANGLE_SCALE;
    const pitchDegrees = view.getInt16(offset + 3, true) / ANGLE_SCALE;
    if (
      stationIndex >= MAX_TURRET_STATIONS ||
      stationIndex <= previousStationIndex ||
      Math.abs(yawDegrees) > 180 ||
      Math.abs(pitchDegrees) > 90 ||
      (yawDegrees === 0 && pitchDegrees === 0)
    ) {
      return null;
    }
    previousStationIndex = stationIndex;
    poses.push({ stationIndex, yawDegrees, pitchDegrees });
  }
  return { activeStationIndex, poses };
}

export function decodeViewerTurretState(token) {
  if (token === "") return { activeStationIndex: 0, poses: [] };
  if (
    typeof token !== "string" ||
    token.length > MAX_TOKEN_LENGTH ||
    !TOKEN_PATTERN.test(token)
  ) {
    return null;
  }
  try {
    const decoded = decodeViewerTurretStateUnchecked(token);
    return decoded && encodeViewerTurretState(decoded) === token
      ? decoded
      : null;
  } catch {
    return null;
  }
}

export function normalizeViewerTurretToken(token) {
  return token === "" || decodeViewerTurretState(token) ? token : "";
}
