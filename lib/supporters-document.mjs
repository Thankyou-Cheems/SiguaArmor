export const SUPPORTERS_DOCUMENT_URL = "/supporters.json";
export const SUPPORTERS_MAX_BYTES = 32 * 1024;
export const SUPPORTERS_REFRESH_MS = 60_000;

const DOCUMENT_KEYS = new Set(["version", "updatedAt", "entries"]);
const ENTRY_KEYS = new Set(["id", "name", "nameSegments", "kind", "url", "note"]);
const NAME_SEGMENT_KEYS = new Set(["text", "color"]);
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/** @typedef {"sponsor" | "friend"} SupporterKind */
/**
 * @typedef {{ text: string, color: string }} SupporterNameSegment
 */
/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   nameSegments?: SupporterNameSegment[],
 *   kind: SupporterKind,
 *   url?: string,
 *   note?: string,
 * }} SupporterEntry
 */
/** @typedef {{ version: 1, updatedAt: string, entries: SupporterEntry[] }} SupportersDocument */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTrimmedText(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum &&
    value.trim() === value && !CONTROL_CHARACTER_PATTERN.test(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseNameSegments(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const segments = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, NAME_SEGMENT_KEYS)) return null;
    if (!isTrimmedText(candidate.text, 1, 40)) return null;
    if (typeof candidate.color !== "string" || !COLOR_PATTERN.test(candidate.color)) {
      return null;
    }
    segments.push({ text: candidate.text, color: candidate.color });
  }
  return segments.map((segment) => segment.text).join("") === name ? segments : null;
}

function parseEntry(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_KEYS)) return null;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!isTrimmedText(value.name, 1, 40)) return null;
  if (value.kind !== "sponsor" && value.kind !== "friend") return null;
  if (value.url !== undefined && !isSafeHttpsUrl(value.url)) return null;
  if (value.note !== undefined && !isTrimmedText(value.note, 1, 120)) return null;
  const nameSegments = parseNameSegments(value.nameSegments, value.name);
  if (nameSegments === null) return null;
  /** @type {SupporterEntry} */
  const entry = { id: value.id, name: value.name, kind: value.kind };
  if (nameSegments !== undefined) entry.nameSegments = nameSegments;
  if (value.url !== undefined) entry.url = value.url;
  if (value.note !== undefined) entry.note = value.note;
  return entry;
}

/**
 * @param {unknown} value
 * @returns {SupportersDocument | null}
 */
export function parseSupportersDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return null;
  if (value.version !== 1 || !isCanonicalTimestamp(value.updatedAt)) return null;
  if (!Array.isArray(value.entries) || value.entries.length > 100) return null;
  const ids = new Set();
  const entries = [];
  for (const candidate of value.entries) {
    const entry = parseEntry(candidate);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    entries.push(entry);
  }
  return { version: 1, updatedAt: value.updatedAt, entries };
}
