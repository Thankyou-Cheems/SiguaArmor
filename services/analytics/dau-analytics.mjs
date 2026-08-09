import {
  createCipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { createReadStream } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";

import maxmind from "maxmind";

const RAW_FILE_PATTERN = /^dau-(\d{4}-\d{2}-\d{2})\.ndjson$/;
const ARCHIVE_FILE_PATTERN = /^dau-aggregate-(\d{4}-\d{2}-\d{2})\.json$/;
const FLUSH_INTERVAL_MS = 1_000;
const FLUSH_BATCH_SIZE = 256;

function utcDay(value) {
  return value.toISOString().slice(0, 10);
}

function dayOffset(now, offset) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offset);
  return utcDay(date);
}

function millisecondsUntilNextUtcDay(value) {
  const nextDay = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate() + 1,
  );
  return Math.max(1, nextDay - value.getTime());
}

export function normalizeClientIp(value) {
  if (typeof value !== "string") {
    return null;
  }
  let candidate = value.trim();
  if (!candidate || candidate.includes(",")) {
    return null;
  }
  if (candidate.startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) {
      candidate = mapped;
    }
  }
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function requestClientIp(request, trustEdgeOneClientIp) {
  if (trustEdgeOneClientIp) {
    const edgeIp = normalizeClientIp(request.headers["eo-connecting-ip"]);
    if (edgeIp) {
      return edgeIp;
    }
  }
  return normalizeClientIp(request.socket?.remoteAddress);
}

function deriveKey(secret, purpose) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.from("sigua-review-dau-v1", "utf8"),
      Buffer.from(purpose, "utf8"),
      32,
    ),
  );
}

function encryptIp(ip, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(ip, "utf8"), cipher.final()]);
  return Object.freeze({
    algorithm: "A256GCM",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
}

function normalizedPlaceName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= 120 ? normalized : null;
}

function localizedName(names) {
  return normalizedPlaceName(names?.["zh-CN"]) || normalizedPlaceName(names?.en);
}

function cityFromMmdb(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const countryCode = typeof record.country?.iso_code === "string"
    && /^[A-Z]{2}$/.test(record.country.iso_code)
    ? record.country.iso_code
    : null;
  const city = localizedName(record.city?.names);
  if (!countryCode || !city) {
    return null;
  }
  const subdivisionRecord = Array.isArray(record.subdivisions)
    ? record.subdivisions.at(-1)
    : null;
  return Object.freeze({
    countryCode,
    subdivision: localizedName(subdivisionRecord?.names),
    city,
  });
}

function normalizeStoredCity(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const countryCode = typeof value.countryCode === "string" && /^[A-Z]{2}$/.test(value.countryCode)
    ? value.countryCode
    : null;
  const city = normalizedPlaceName(value.city);
  if (!countryCode || !city) {
    return null;
  }
  return Object.freeze({
    countryCode,
    subdivision: normalizedPlaceName(value.subdivision),
    city,
  });
}

function cityKey(city) {
  return city ? JSON.stringify([city.countryCode, city.subdivision, city.city]) : null;
}

function buildDayAggregate(date, visitors, cityThreshold) {
  const cityCounts = new Map();
  let otherDau = 0;
  for (const city of visitors.values()) {
    const key = cityKey(city);
    if (!key) {
      otherDau += 1;
      continue;
    }
    const current = cityCounts.get(key);
    if (current) {
      current.dau += 1;
    } else {
      cityCounts.set(key, { ...city, dau: 1 });
    }
  }
  const cities = [];
  for (const city of cityCounts.values()) {
    if (city.dau < cityThreshold) {
      otherDau += city.dau;
    } else {
      cities.push(Object.freeze(city));
    }
  }
  cities.sort((left, right) => right.dau - left.dau
    || left.countryCode.localeCompare(right.countryCode)
    || (left.subdivision || "").localeCompare(right.subdivision || "")
    || left.city.localeCompare(right.city));
  return Object.freeze({
    version: 1,
    date,
    dau: visitors.size,
    cityThreshold,
    cities: Object.freeze(cities),
    otherDau,
  });
}

async function loadRawDayFile(filePath) {
  const visitors = new Map();
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (typeof event.visitorId === "string" && /^[a-f0-9]{64}$/.test(event.visitorId)) {
        visitors.set(event.visitorId, normalizeStoredCity(event.city));
      }
    } catch {
      // A partially written final line is ignored. Earlier valid records remain usable.
    }
  }
  return visitors;
}

function normalizeArchive(value, expectedDate) {
  if (
    value?.version !== 1
    || value.date !== expectedDate
    || !Number.isSafeInteger(value.dau)
    || value.dau < 0
    || !Number.isSafeInteger(value.cityThreshold)
    || value.cityThreshold < 3
    || value.cityThreshold > 100
    || !Number.isSafeInteger(value.otherDau)
    || value.otherDau < 0
    || !Array.isArray(value.cities)
  ) {
    throw new Error(`invalid DAU archive for ${expectedDate}`);
  }
  let total = value.otherDau;
  const cities = value.cities.map((entry) => {
    const city = normalizeStoredCity(entry);
    if (!city || !Number.isSafeInteger(entry.dau) || entry.dau < value.cityThreshold) {
      throw new Error(`invalid DAU city archive for ${expectedDate}`);
    }
    total += entry.dau;
    return Object.freeze({ ...city, dau: entry.dau });
  });
  if (total !== value.dau) {
    throw new Error(`DAU archive total mismatch for ${expectedDate}`);
  }
  return Object.freeze({
    version: 1,
    date: expectedDate,
    dau: value.dau,
    cityThreshold: value.cityThreshold,
    cities: Object.freeze(cities),
    otherDau: value.otherDau,
  });
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let fileHandle;
  try {
    fileHandle = await open(temporaryPath, "wx", 0o600);
    await fileHandle.writeFile(`${JSON.stringify(value)}\n`, { encoding: "utf8" });
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;
    if (process.platform !== "win32") {
      await chmod(temporaryPath, 0o600);
    }
    await rename(temporaryPath, filePath);
    await syncDirectory(path.dirname(filePath));
  } finally {
    await fileHandle?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function syncDirectory(directoryPath) {
  if (process.platform === "win32") {
    return;
  }
  const directoryHandle = await open(directoryPath, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

async function defaultCityResolver(databasePath) {
  if (!databasePath) {
    return () => null;
  }
  const lookup = await maxmind.open(databasePath, { watchForUpdates: false });
  return (ip) => cityFromMmdb(lookup.get(ip));
}

export async function createDauAnalytics(config, options = {}) {
  if (!config.analyticsEnabled) {
    return Object.freeze({
      enabled: false,
      record() {
        return false;
      },
      snapshot() {
        return [];
      },
      async flush() {},
      async close() {},
    });
  }

  const now = options.now || (() => new Date());
  const resolveCity = options.resolveCity || await defaultCityResolver(config.geoIpCityDatabase);
  const analyticsDir = path.resolve(config.analyticsDir);
  const identityKey = deriveKey(config.analyticsSecret, "daily-visitor-id");
  const encryptionKey = deriveKey(config.analyticsSecret, "ip-encryption");
  const visitorsByDay = new Map();
  const archivesByDay = new Map();
  let pending = [];
  let flushTimer = null;
  let retentionTimer = null;
  let flushChain = Promise.resolve();

  await mkdir(analyticsDir, { recursive: true, mode: 0o700 });

  async function compactRawFile(date, filePath) {
    const visitors = await loadRawDayFile(filePath);
    const archive = buildDayAggregate(
      date,
      visitors,
      config.analyticsCityThreshold,
    );
    const archivePath = path.join(analyticsDir, `dau-aggregate-${date}.json`);
    await atomicWriteJson(archivePath, archive);
    await rm(filePath, { force: true });
    await syncDirectory(analyticsDir);
    visitorsByDay.delete(date);
    archivesByDay.set(date, archive);
  }

  async function prune(at) {
    const cutoff = dayOffset(at, config.analyticsRetentionDays - 1);
    for (const entry of await readdir(analyticsDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      const match = RAW_FILE_PATTERN.exec(entry.name);
      if (match && match[1] < cutoff) {
        await compactRawFile(match[1], path.join(analyticsDir, entry.name));
      }
    }
  }

  const cutoff = dayOffset(now(), config.analyticsRetentionDays - 1);
  const entries = await readdir(analyticsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const archiveMatch = ARCHIVE_FILE_PATTERN.exec(entry.name);
    if (archiveMatch) {
      const value = JSON.parse(await readFile(path.join(analyticsDir, entry.name), "utf8"));
      archivesByDay.set(
        archiveMatch[1],
        normalizeArchive(value, archiveMatch[1]),
      );
    }
  }
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const rawMatch = RAW_FILE_PATTERN.exec(entry.name);
    if (!rawMatch) {
      continue;
    }
    const filePath = path.join(analyticsDir, entry.name);
    if (rawMatch[1] < cutoff) {
      await compactRawFile(rawMatch[1], filePath);
      continue;
    }
    visitorsByDay.set(rawMatch[1], await loadRawDayFile(filePath));
  }
  function scheduleRetention() {
    retentionTimer = setTimeout(() => {
      retentionTimer = null;
      void prune(now()).catch((error) => {
        process.stderr.write(`DAU retention failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }).finally(scheduleRetention);
    }, millisecondsUntilNextUtcDay(now()));
    retentionTimer.unref?.();
  }
  scheduleRetention();

  function writePending() {
    if (pending.length === 0) {
      return flushChain;
    }
    const events = pending;
    pending = [];
    const grouped = new Map();
    for (const event of events) {
      const group = grouped.get(event.date) || [];
      group.push(event);
      grouped.set(event.date, group);
    }
    flushChain = flushChain.catch(() => {}).then(async () => {
      const batches = [...grouped];
      for (let index = 0; index < batches.length; index += 1) {
        const [date, dateEvents] = batches[index];
        const filePath = path.join(analyticsDir, `dau-${date}.ndjson`);
        try {
          const lines = dateEvents.map((event) => `${JSON.stringify(event)}\n`).join("");
          await appendFile(filePath, lines, { encoding: "utf8", mode: 0o600 });
          if (process.platform !== "win32") {
            await chmod(filePath, 0o600);
          }
        } catch (error) {
          const retryEvents = batches.slice(index).flatMap(([, batchEvents]) => batchEvents);
          pending = [...retryEvents, ...pending];
          scheduleFlush();
          throw error;
        }
      }
    });
    return flushChain;
  }

  function scheduleFlush() {
    if (flushTimer || pending.length === 0) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void writePending().catch((error) => {
        process.stderr.write(`DAU flush failed: ${error instanceof Error ? error.message : String(error)}\n`);
      });
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }

  function record(request) {
    const ip = requestClientIp(request, config.trustEdgeOneClientIp);
    if (!ip) {
      return false;
    }
    const firstSeen = now();
    const date = utcDay(firstSeen);
    const visitorId = createHmac("sha256", identityKey)
      .update(date, "utf8")
      .update("\0", "utf8")
      .update(ip, "utf8")
      .digest("hex");
    const visitors = visitorsByDay.get(date) || new Map();
    if (visitors.has(visitorId)) {
      return false;
    }
    let city = null;
    try {
      city = normalizeStoredCity(resolveCity(ip));
    } catch (error) {
      process.stderr.write(`DAU city lookup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    visitors.set(visitorId, city);
    visitorsByDay.set(date, visitors);
    pending.push(
      Object.freeze({
        version: 3,
        date,
        visitorId,
        firstSeen: firstSeen.toISOString(),
        source: "public-web",
        city,
        ip: encryptIp(ip, encryptionKey),
      }),
    );
    if (pending.length >= FLUSH_BATCH_SIZE) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      void writePending().catch((error) => {
        process.stderr.write(`DAU flush failed: ${error instanceof Error ? error.message : String(error)}\n`);
      });
    } else {
      scheduleFlush();
    }
    return true;
  }

  function snapshot(days, at = now()) {
    const currentDate = utcDay(at);
    return Array.from({ length: days }, (_, index) => {
      const date = dayOffset(at, days - index - 1);
      const visitors = visitorsByDay.get(date);
      if (date === currentDate && visitors) {
        return Object.freeze({
          date,
          dau: visitors.size,
          cityThreshold: config.analyticsCityThreshold,
          cities: Object.freeze([]),
          otherDau: visitors.size,
          cityStatus: "pending_utc_day_close",
        });
      }
      const aggregate = visitors
        ? buildDayAggregate(date, visitors, config.analyticsCityThreshold)
        : archivesByDay.get(date);
      return aggregate || Object.freeze({
        date,
        dau: 0,
        cityThreshold: config.analyticsCityThreshold,
        cities: Object.freeze([]),
        otherDau: 0,
      });
    });
  }

  async function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await writePending();
  }

  async function close() {
    if (retentionTimer) {
      clearInterval(retentionTimer);
      retentionTimer = null;
    }
    await flush();
  }

  return Object.freeze({ enabled: true, record, snapshot, flush, close });
}
