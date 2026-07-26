export const UPDATES_DOCUMENT_URL = "/squad/updates.json";
export const UPDATES_MAX_BYTES = 64 * 1024;
export const UPDATES_REFRESH_MS = 60_000;

const DOCUMENT_KEYS = new Set(["version", "updatedAt", "siteUpdatedOn", "entries"]);
const ENTRY_KEYS = new Set(["id", "date", "title", "items"]);
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/** @typedef {{ id: string, date: string, title: string, items: string[] }} UpdateEntry */
/**
 * @typedef {{ version: 1, updatedAt: string, siteUpdatedOn: string, entries: UpdateEntry[] }} UpdatesDocument
 */

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

function isCanonicalDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function parseEntry(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_KEYS)) return null;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!isCanonicalDate(value.date) || !isTrimmedText(value.title, 1, 80)) return null;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return null;
  if (!value.items.every((item) => isTrimmedText(item, 1, 240))) return null;
  return { id: value.id, date: value.date, title: value.title, items: [...value.items] };
}

/**
 * @param {unknown} value
 * @returns {UpdatesDocument | null}
 */
export function parseUpdatesDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return null;
  if (value.version !== 1 || !isCanonicalTimestamp(value.updatedAt)) return null;
  if (!isCanonicalDate(value.siteUpdatedOn)) return null;
  if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 50) return null;
  const ids = new Set();
  const entries = [];
  let previousDate = null;
  for (const candidate of value.entries) {
    const entry = parseEntry(candidate);
    if (!entry || ids.has(entry.id)) return null;
    if (previousDate !== null && entry.date > previousDate) return null;
    ids.add(entry.id);
    entries.push(entry);
    previousDate = entry.date;
  }
  if (entries[0].date > value.siteUpdatedOn) return null;
  return { version: 1, updatedAt: value.updatedAt, siteUpdatedOn: value.siteUpdatedOn, entries };
}

export function formatSiteUpdatedOn(value) {
  return `${value.replaceAll("-", "/")}版`;
}
