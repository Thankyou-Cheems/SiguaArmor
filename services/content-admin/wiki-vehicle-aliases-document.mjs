const DOCUMENT_KEYS = new Set(["schemaVersion", "updatedAt", "groups"]);
const GROUP_KEYS = new Set(["id", "label", "terms", "targets"]);
const TARGET_KEYS = new Set(["edition", "cardId", "rawNames"]);
const EDITIONS = new Set(["international", "china"]);
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isText(value, minimum, maximum) {
  return typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.trim() === value &&
    !CONTROL_CHARACTER_PATTERN.test(value);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseTarget(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, TARGET_KEYS)) return null;
  if (!EDITIONS.has(value.edition) || !isText(value.cardId, 1, 160)) return null;
  const target = { edition: value.edition, cardId: value.cardId };
  if (value.rawNames !== undefined) {
    if (
      !Array.isArray(value.rawNames) ||
      value.rawNames.length < 1 ||
      value.rawNames.length > 80 ||
      !value.rawNames.every((rawName) => isText(rawName, 1, 180)) ||
      new Set(value.rawNames).size !== value.rawNames.length
    ) {
      return null;
    }
    target.rawNames = [...value.rawNames];
  }
  return target;
}

function parseGroup(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, GROUP_KEYS)) return null;
  if (!ID_PATTERN.test(value.id) || !isText(value.label, 1, 60)) return null;
  if (
    !Array.isArray(value.terms) ||
    value.terms.length < 1 ||
    value.terms.length > 30 ||
    !value.terms.every((term) => isText(term, 1, 40)) ||
    new Set(value.terms).size !== value.terms.length ||
    !Array.isArray(value.targets) ||
    value.targets.length < 1 ||
    value.targets.length > 200
  ) {
    return null;
  }
  const targets = value.targets.map(parseTarget);
  if (targets.some((target) => target === null)) return null;
  const targetKeys = targets.map((target) =>
    `${target.edition}\u0000${target.cardId}\u0000${target.rawNames?.join("\u0000") ?? "*"}`,
  );
  if (new Set(targetKeys).size !== targetKeys.length) return null;
  return { id: value.id, label: value.label, terms: [...value.terms], targets };
}

export function parseWikiVehicleAliasesDocument(value) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, DOCUMENT_KEYS) ||
    value.schemaVersion !== "sigua-vehicle-community-aliases/v1" ||
    !canonicalTimestamp(value.updatedAt) ||
    !Array.isArray(value.groups) ||
    value.groups.length > 100
  ) {
    return null;
  }
  const groups = value.groups.map(parseGroup);
  if (groups.some((group) => group === null)) return null;
  if (new Set(groups.map(({ id }) => id)).size !== groups.length) return null;
  return {
    schemaVersion: "sigua-vehicle-community-aliases/v1",
    updatedAt: value.updatedAt,
    groups,
  };
}

export function prepareWikiVehicleAliasesDocument(value, now = new Date()) {
  if (!isRecord(value)) throw new Error("document must be an object");
  const document = parseWikiVehicleAliasesDocument({
    ...value,
    updatedAt: now.toISOString(),
  });
  if (!document) throw new Error("vehicle aliases document failed validation");
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  return { document, serialized, bytes: Buffer.byteLength(serialized) };
}
