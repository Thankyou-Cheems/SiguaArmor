const CAMERA_TOKEN_VERSION = 1;
const CAMERA_TOKEN_BYTES = 13;
const CAMERA_TOKEN_PATTERN = /^[A-Za-z0-9_-]{18}$/u;
const ANGLE_SCALE = 100;
const POSITION_SCALE = 100;
const DISTANCE_SCALE = 100;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedYaw(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
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

function normalizedCameraState(value) {
  if (!value || typeof value !== "object") return null;
  const yaw = finiteNumber(value.yaw);
  const pitch = finiteNumber(value.pitch);
  const distance = finiteNumber(value.distance);
  const target = Array.isArray(value.target)
    ? value.target.map(finiteNumber)
    : [];
  if (
    yaw === null ||
    pitch === null ||
    distance === null ||
    target.length !== 3 ||
    target.some((coordinate) => coordinate === null)
  ) {
    return null;
  }
  return {
    yaw: normalizedYaw(yaw),
    pitch: clamp(pitch, -85, 85),
    distance: clamp(distance, 0.01, 655.35),
    target: target.map((coordinate) => clamp(coordinate, -327.67, 327.67)),
  };
}

export function encodeViewerCameraState(value) {
  const normalized = normalizedCameraState(value);
  if (!normalized) return "";
  const bytes = new Uint8Array(CAMERA_TOKEN_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, CAMERA_TOKEN_VERSION);
  view.setInt16(1, Math.round(normalized.yaw * ANGLE_SCALE));
  view.setInt16(3, Math.round(normalized.pitch * ANGLE_SCALE));
  view.setUint16(5, Math.round(normalized.distance * DISTANCE_SCALE));
  normalized.target.forEach((coordinate, index) => {
    view.setInt16(7 + index * 2, Math.round(coordinate * POSITION_SCALE));
  });
  return bytesToBase64Url(bytes);
}

function decodeViewerCameraTokenUnchecked(token) {
  const bytes = base64UrlToBytes(token);
  if (bytes.length !== CAMERA_TOKEN_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== CAMERA_TOKEN_VERSION) return null;
  return {
    yaw: view.getInt16(1) / ANGLE_SCALE,
    pitch: view.getInt16(3) / ANGLE_SCALE,
    distance: view.getUint16(5) / DISTANCE_SCALE,
    target: [
      view.getInt16(7) / POSITION_SCALE,
      view.getInt16(9) / POSITION_SCALE,
      view.getInt16(11) / POSITION_SCALE,
    ],
  };
}

export function decodeViewerCameraState(token) {
  if (typeof token !== "string" || !CAMERA_TOKEN_PATTERN.test(token)) return null;
  try {
    const decoded = decodeViewerCameraTokenUnchecked(token);
    return decoded && encodeViewerCameraState(decoded) === token ? decoded : null;
  } catch {
    return null;
  }
}

export function normalizeViewerCameraToken(token) {
  return decodeViewerCameraState(token) ? token : "";
}
