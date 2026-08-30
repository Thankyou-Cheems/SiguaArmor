import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDauAnalytics } from "./dau-analytics.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 64;

class ConfigError extends Error {}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConfigError(`${name} is required`);
  }
  return value;
}

function base64UrlSecret(environment, name) {
  const encoded = required(environment, name);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new ConfigError(`${name} must be base64url`);
  }
  const value = Buffer.from(encoded, "base64url");
  if (value.length !== 32) {
    throw new ConfigError(`${name} must contain 256 random bits`);
  }
  return value;
}

function integer(environment, name, fallback, minimum, maximum) {
  const raw = environment[name] || String(fallback);
  if (!/^\d+$/u.test(raw)) throw new ConfigError(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ConfigError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

export function loadPublicAnalyticsConfig(environment = process.env) {
  const publicOrigin = new URL(required(environment, "SIGUA_PUBLIC_ORIGIN"));
  if (publicOrigin.protocol !== "https:" || publicOrigin.pathname !== "/") {
    throw new ConfigError("SIGUA_PUBLIC_ORIGIN must be an HTTPS origin without a path");
  }
  const geoIpDatabaseRelease = required(environment, "SIGUA_GEOIP_DATABASE_RELEASE");
  if (!/^\d{4}-\d{2}$/u.test(geoIpDatabaseRelease)) {
    throw new ConfigError("SIGUA_GEOIP_DATABASE_RELEASE must use YYYY-MM");
  }
  return Object.freeze({
    publicOrigin: publicOrigin.origin,
    listenHost: environment.SIGUA_ANALYTICS_LISTEN_HOST || "0.0.0.0",
    port: integer(environment, "SIGUA_ANALYTICS_PORT", 8081, 1, 65535),
    originAuthSecret: base64UrlSecret(environment, "SIGUA_ORIGIN_AUTH_SECRET"),
    adminProxySecret: base64UrlSecret(
      environment,
      "SIGUA_CONTENT_ADMIN_PROXY_SECRET",
    ),
    analyticsEnabled: true,
    analyticsDir: path.resolve(required(environment, "SIGUA_ANALYTICS_DIR")),
    analyticsSecret: base64UrlSecret(environment, "SIGUA_ANALYTICS_SECRET"),
    analyticsRetentionDays: integer(
      environment,
      "SIGUA_ANALYTICS_RETENTION_DAYS",
      30,
      1,
      90,
    ),
    analyticsCityThreshold: integer(
      environment,
      "SIGUA_ANALYTICS_CITY_THRESHOLD",
      3,
      3,
      100,
    ),
    geoIpCityDatabase: path.resolve(required(environment, "SIGUA_GEOIP_CITY_DATABASE")),
    geoIpDatabaseRelease,
    trustEdgeOneClientIp: environment.SIGUA_TRUST_EDGEONE_CLIENT_IP !== "0",
  });
}

function equalSecret(candidate, expected) {
  if (typeof candidate !== "string" || !/^[A-Za-z0-9_-]+$/u.test(candidate)) return false;
  const actual = Buffer.from(candidate, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function send(response, statusCode, body = "") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function publicDauSnapshot(analytics) {
  const snapshot = analytics.snapshot(1).at(-1);
  if (!snapshot) {
    throw new Error("current DAU snapshot is unavailable");
  }
  return Object.freeze({
    schemaVersion: "sigua-public-dau/v1",
    date: snapshot.date,
    dau: snapshot.dau,
  });
}

function adminDauOverview(config, analytics) {
  return Object.freeze({
    schemaVersion: "sigua-admin-dau-overview/v1",
    generatedAt: new Date().toISOString(),
    geoIpDatabaseRelease: config.geoIpDatabaseRelease,
    cityThreshold: config.analyticsCityThreshold,
    days: analytics.overview(),
  });
}

export async function createPublicAnalyticsApp(config, options = {}) {
  const analytics = await createDauAnalytics(config, options.analyticsOptions);

  async function handle(request, response) {
    const url = new URL(request.url || "/", config.publicOrigin);
    if (url.pathname === "/healthz") {
      send(response, 200, "ok\n");
      return;
    }
    if (url.pathname === "/__analytics/admin/overview") {
      if (!equalSecret(request.headers["x-sigua-admin-proxy"], config.adminProxySecret)) {
        send(response, 403, "Forbidden\n");
        return;
      }
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        send(response, 405, "Method Not Allowed\n");
        return;
      }
      sendJson(response, 200, adminDauOverview(config, analytics));
      return;
    }
    if (url.pathname !== "/__analytics/dau") {
      send(response, 404, "Not Found\n");
      return;
    }
    if (!equalSecret(request.headers["x-sigua-origin-auth"], config.originAuthSecret)) {
      send(response, 403, "Forbidden\n");
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, publicDauSnapshot(analytics));
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      send(response, 405, "Method Not Allowed\n");
      return;
    }
    const origin = request.headers.origin;
    const fetchSite = request.headers["sec-fetch-site"];
    if (origin !== config.publicOrigin || (fetchSite && fetchSite !== "same-origin")) {
      send(response, 403, "Forbidden\n");
      return;
    }
    let received = 0;
    let oversized = false;
    request.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) oversized = true;
    });
    await new Promise((resolve, reject) => {
      request.once("end", resolve);
      request.once("error", reject);
      request.resume();
    });
    if (oversized) {
      send(response, 413, "Payload Too Large\n");
      return;
    }
    analytics.record(request);
    sendJson(response, 200, publicDauSnapshot(analytics));
  }

  return Object.freeze({ analytics, handle });
}

export function createPublicAnalyticsServer(app) {
  return http.createServer((request, response) => {
    Promise.resolve(app.handle(request, response)).catch((error) => {
      process.stderr.write(`analytics request failed: ${error instanceof Error ? error.stack : String(error)}\n`);
      if (response.headersSent) response.destroy();
      else send(response, 500, "Internal Server Error\n");
    });
  });
}

async function start() {
  const config = loadPublicAnalyticsConfig();
  const app = await createPublicAnalyticsApp(config);
  const server = createPublicAnalyticsServer(app);
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.listen(config.port, config.listenHost, () => {
    process.stdout.write(`[public-analytics] listening on ${config.listenHost}:${config.port}\n`);
  });
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async (error) => {
      await app.analytics.close();
      if (error) process.stderr.write(`${error.stack || error}\n`);
      process.exit(error ? 1 : 0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
    process.stdout.write(`[public-analytics] ${signal}; draining\n`);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, "server.mjs")) {
  start().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
