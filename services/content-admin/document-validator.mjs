import {
  parseWikiVehicleAliasesDocument,
  prepareWikiVehicleAliasesDocument,
} from "./wiki-vehicle-aliases-document.mjs";

const DOCUMENT_KEYS = new Set(["version", "updatedAt", "siteUpdatedOn", "entries"]);
const SUPPORTER_KEYS = new Set(["id", "name", "nameSegments", "kind", "url", "note"]);
const SUPPORTER_NAME_SEGMENT_KEYS = new Set(["text", "color"]);
const UPDATE_KEYS = new Set(["id", "date", "title", "items"]);
const NOTICES_DOCUMENT_KEYS = new Set(["version", "updatedAt", "editions"]);
const NOTICE_EDITIONS_KEYS = new Set(["china", "international"]);
const NOTICE_KEYS = new Set(["title", "lines"]);
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SITE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const CONTENT_DOCUMENTS = Object.freeze({
  notices: Object.freeze({
    relativePath: "notices.json",
    maxBytes: 32 * 1024,
  }),
  supporters: Object.freeze({
    relativePath: "supporters.json",
    maxBytes: 32 * 1024,
  }),
  "updates-china": Object.freeze({
    relativePath: "updates.json",
    maxBytes: 64 * 1024,
  }),
  "updates-international": Object.freeze({
    relativePath: "squad/updates.json",
    maxBytes: 64 * 1024,
  }),
  "wiki-vehicle-aliases": Object.freeze({
    storage: "wiki",
    relativePath: "data/vehicles/community-aliases.json",
    maxBytes: 128 * 1024,
  }),
});

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

function isCanonicalDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
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

function parseSupporterNameSegments(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const segments = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, SUPPORTER_NAME_SEGMENT_KEYS)) {
      return null;
    }
    if (!isTrimmedText(candidate.text, 1, 40)) return null;
    if (typeof candidate.color !== "string" || !COLOR_PATTERN.test(candidate.color)) {
      return null;
    }
    segments.push({ text: candidate.text, color: candidate.color });
  }
  return segments.map((segment) => segment.text).join("") === name ? segments : null;
}

function parseSupporterEntry(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, SUPPORTER_KEYS)) return null;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!isTrimmedText(value.name, 1, 40)) return null;
  if (value.kind !== "sponsor" && value.kind !== "friend") return null;
  if (value.url !== undefined && !isSafeHttpsUrl(value.url)) return null;
  if (value.note !== undefined && !isTrimmedText(value.note, 1, 120)) return null;
  const nameSegments = parseSupporterNameSegments(value.nameSegments, value.name);
  if (nameSegments === null) return null;
  const entry = { id: value.id, name: value.name, kind: value.kind };
  if (nameSegments !== undefined) entry.nameSegments = nameSegments;
  if (value.url !== undefined) entry.url = value.url;
  if (value.note !== undefined) entry.note = value.note;
  return entry;
}

function parseSupportersDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return null;
  if (value.version !== 1 || !isCanonicalTimestamp(value.updatedAt)) return null;
  if ("siteUpdatedOn" in value) return null;
  if (!Array.isArray(value.entries) || value.entries.length > 100) return null;
  const ids = new Set();
  const entries = [];
  for (const candidate of value.entries) {
    const entry = parseSupporterEntry(candidate);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    entries.push(entry);
  }
  return { version: 1, updatedAt: value.updatedAt, entries };
}

function parseUpdateEntry(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_KEYS)) return null;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!isCanonicalDate(value.date) || !isTrimmedText(value.title, 1, 80)) return null;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return null;
  if (!value.items.every((item) => isTrimmedText(item, 1, 240))) return null;
  return { id: value.id, date: value.date, title: value.title, items: [...value.items] };
}

function parseUpdatesDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS)) return null;
  if (
    value.version !== 1 ||
    !isCanonicalTimestamp(value.updatedAt) ||
    !isCanonicalDate(value.siteUpdatedOn)
  ) {
    return null;
  }
  if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 50) {
    return null;
  }
  const ids = new Set();
  const entries = [];
  let previousDate = null;
  for (const candidate of value.entries) {
    const entry = parseUpdateEntry(candidate);
    if (!entry || ids.has(entry.id)) return null;
    if (previousDate !== null && entry.date > previousDate) return null;
    ids.add(entry.id);
    entries.push(entry);
    previousDate = entry.date;
  }
  if (entries[0].date > value.siteUpdatedOn) return null;
  return {
    version: 1,
    updatedAt: value.updatedAt,
    siteUpdatedOn: value.siteUpdatedOn,
    entries,
  };
}

function parseNotice(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, NOTICE_KEYS)) return null;
  if (value.title !== undefined && !isTrimmedText(value.title, 1, 80)) return null;
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 4) {
    return null;
  }
  if (!value.lines.every((line) => isTrimmedText(line, 1, 240))) return null;
  const notice = { lines: [...value.lines] };
  if (value.title !== undefined) notice.title = value.title;
  return notice;
}

function parseNoticesDocument(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, NOTICES_DOCUMENT_KEYS)) return null;
  if (value.version !== 1 || !isCanonicalTimestamp(value.updatedAt)) return null;
  if (!isRecord(value.editions) || !hasOnlyKeys(value.editions, NOTICE_EDITIONS_KEYS)) {
    return null;
  }
  const china = parseNotice(value.editions.china);
  const international = parseNotice(value.editions.international);
  if (!china || !international) return null;
  return {
    version: 1,
    updatedAt: value.updatedAt,
    editions: { china, international },
  };
}

function siteDateInShanghai(date) {
  const parts = Object.fromEntries(
    SITE_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseContentDocument(documentName, value) {
  if (documentName === "wiki-vehicle-aliases") {
    return parseWikiVehicleAliasesDocument(value);
  }
  if (documentName === "notices") return parseNoticesDocument(value);
  if (documentName === "supporters") return parseSupportersDocument(value);
  if (documentName === "updates-china" || documentName === "updates-international") {
    return parseUpdatesDocument(value);
  }
  return null;
}

export function prepareContentDocument(documentName, value, now = new Date()) {
  if (documentName === "wiki-vehicle-aliases") {
    const prepared = prepareWikiVehicleAliasesDocument(value, now);
    if (prepared.bytes > CONTENT_DOCUMENTS[documentName].maxBytes) {
      throw new Error(`document is ${prepared.bytes} bytes; maximum is ${CONTENT_DOCUMENTS[documentName].maxBytes}`);
    }
    return prepared;
  }
  if (!isRecord(value)) throw new Error("document must be an object");
  const candidate =
    documentName === "supporters" || documentName === "notices"
      ? { ...value, updatedAt: now.toISOString() }
      : {
          ...value,
          updatedAt: now.toISOString(),
          siteUpdatedOn: siteDateInShanghai(now),
        };
  const document = parseContentDocument(documentName, candidate);
  if (!document) throw new Error("document failed validation");
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const config = CONTENT_DOCUMENTS[documentName];
  if (!config) throw new Error("unknown content document");
  const bytes = Buffer.byteLength(serialized);
  if (bytes > config.maxBytes) {
    throw new Error(`document is ${bytes} bytes; maximum is ${config.maxBytes}`);
  }
  return { document, serialized, bytes };
}
