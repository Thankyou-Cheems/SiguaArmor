export const DATA_ACCURACY_NOTICES_DOCUMENT_URL = "/notices.json";
export const DATA_ACCURACY_NOTICES_MAX_BYTES = 32 * 1024;

const DOCUMENT_KEYS = new Set(["version", "updatedAt", "editions"]);
const EDITIONS_KEYS = new Set(["china", "international"]);
const NOTICE_KEYS = new Set(["title", "lines"]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;

/** @typedef {{ title?: string, lines: string[] }} DataAccuracyNotice */
/**
 * @typedef {{
 *   version: 1,
 *   updatedAt: string,
 *   editions: { china: DataAccuracyNotice, international: DataAccuracyNotice },
 * }} DataAccuracyNoticesDocument
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTrimmedText(value, minimum, maximum) {
  return typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.trim() === value &&
    !CONTROL_CHARACTER_PATTERN.test(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

/** @returns {DataAccuracyNotice | null} */
function parseNotice(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, NOTICE_KEYS)) return null;
  if (value.title !== undefined && !isTrimmedText(value.title, 1, 80)) return null;
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 4) {
    return null;
  }
  if (!value.lines.every((line) => isTrimmedText(line, 1, 240))) return null;
  /** @type {DataAccuracyNotice} */
  const notice = { lines: [...value.lines] };
  if (value.title !== undefined) notice.title = value.title;
  return notice;
}

/** @returns {DataAccuracyNoticesDocument | null} */
export function parseDataAccuracyNoticesDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return null;
  if (value.version !== 1 || !isCanonicalTimestamp(value.updatedAt)) return null;
  if (!isRecord(value.editions) || !hasOnlyKeys(value.editions, EDITIONS_KEYS)) return null;
  const china = parseNotice(value.editions.china);
  const international = parseNotice(value.editions.international);
  if (!china || !international) return null;
  return {
    version: 1,
    updatedAt: value.updatedAt,
    editions: { china, international },
  };
}
