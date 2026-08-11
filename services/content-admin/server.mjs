import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTENT_DOCUMENTS,
  parseContentDocument,
  prepareContentDocument,
} from "./document-validator.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = "/__admin/content";
const SESSION_COOKIE = "__Secure-sigua-content-admin";
const MAX_REQUEST_BYTES = 70 * 1024;
const MAX_COOKIE_BYTES = 4096;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS = 5;
const MAX_LOGIN_IDENTITIES = 4096;

class ConfigError extends Error {}
class RequestError extends Error {
  constructor(statusCode, message, headers = {}) {
    super(message);
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConfigError(`${name} is required`);
  }
  return value;
}

function base64UrlBytes(environment, name, expectedBytes = 32) {
  const encoded = required(environment, name);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new ConfigError(`${name} must be base64url`);
  }
  const value = Buffer.from(encoded, "base64url");
  if (value.length !== expectedBytes) {
    throw new ConfigError(`${name} must contain ${expectedBytes * 8} bits`);
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

export function loadContentAdminConfig(environment = process.env) {
  const publicOrigin = new URL(required(environment, "SIGUA_PUBLIC_ORIGIN"));
  if (
    publicOrigin.protocol !== "https:" ||
    publicOrigin.pathname !== "/" ||
    publicOrigin.username ||
    publicOrigin.password ||
    publicOrigin.search ||
    publicOrigin.hash
  ) {
    throw new ConfigError("SIGUA_PUBLIC_ORIGIN must be an HTTPS origin without a path");
  }
  return Object.freeze({
    publicOrigin: publicOrigin.origin,
    proxyAuthSecret: base64UrlBytes(environment, "SIGUA_CONTENT_ADMIN_PROXY_SECRET"),
    adminKeyDigest: base64UrlBytes(environment, "SIGUA_CONTENT_ADMIN_KEY_SHA256"),
    sessionSecret: base64UrlBytes(environment, "SIGUA_CONTENT_ADMIN_SESSION_SECRET"),
    contentRoot: path.resolve(required(environment, "SIGUA_CONTENT_ROOT")),
    listenHost: environment.SIGUA_CONTENT_ADMIN_LISTEN_HOST || "0.0.0.0",
    port: integer(environment, "SIGUA_CONTENT_ADMIN_PORT", 8083, 1, 65535),
    sessionTtlSeconds: integer(
      environment,
      "SIGUA_CONTENT_ADMIN_SESSION_TTL_SECONDS",
      900,
      300,
      3600,
    ),
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function digestHex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function etagFor(bytes) {
  return `"${digestHex(bytes)}"`;
}

function exactEtag(value) {
  return typeof value === "string" && /^"[a-f0-9]{64}"$/u.test(value)
    ? value
    : undefined;
}

function equalBytes(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function equalBase64Secret(candidate, expected) {
  if (typeof candidate !== "string" || !/^[A-Za-z0-9_-]+$/u.test(candidate)) return false;
  return equalBytes(Buffer.from(candidate, "base64url"), expected);
}

function jsonHeaders(body, extraHeaders = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  };
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, jsonHeaders(body, extraHeaders));
  response.end(body);
}

function sendText(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(body);
}

function requireSameOrigin(request, config) {
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (origin !== config.publicOrigin || (fetchSite && fetchSite !== "same-origin")) {
    throw new RequestError(403, "Forbidden");
  }
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new RequestError(415, "Content-Type must be application/json");
  }
  const chunks = [];
  let received = 0;
  let oversized = false;
  request.on("data", (chunk) => {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES) oversized = true;
    else chunks.push(chunk);
  });
  await new Promise((resolve, reject) => {
    request.once("end", resolve);
    request.once("error", reject);
  });
  if (oversized) throw new RequestError(413, "Payload Too Large");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}

function parseCookies(request) {
  const header = request.headers.cookie;
  if (typeof header !== "string" || Buffer.byteLength(header) > MAX_COOKIE_BYTES) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator > 0
          ? [part.slice(0, separator), part.slice(separator + 1)]
          : [part, ""];
      }),
  );
}

function signSessionPayload(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function issueSession(config, now, random) {
  const payload = {
    version: 1,
    issuedAt: Math.floor(now.getTime() / 1000),
    expiresAt: Math.floor(now.getTime() / 1000) + config.sessionTtlSeconds,
    csrfToken: random(32).toString("base64url"),
    nonce: random(16).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signSessionPayload(encodedPayload, config.sessionSecret);
  return {
    payload,
    cookie: `${SESSION_COOKIE}=${encodedPayload}.${signature}; Path=${API_ROOT}; HttpOnly; Secure; SameSite=Strict; Max-Age=${config.sessionTtlSeconds}`,
  };
}

function readSession(request, config, now) {
  const value = parseCookies(request)[SESSION_COOKIE];
  if (typeof value !== "string" || value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, candidateSignature] = parts;
  const expectedSignature = signSessionPayload(encodedPayload, config.sessionSecret);
  if (
    !/^[A-Za-z0-9_-]+$/u.test(candidateSignature) ||
    !equalBytes(
      Buffer.from(candidateSignature, "base64url"),
      Buffer.from(expectedSignature, "base64url"),
    )
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      payload?.version !== 1 ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.issuedAt > nowSeconds + 30 ||
      payload.expiresAt <= nowSeconds ||
      payload.expiresAt - payload.issuedAt !== config.sessionTtlSeconds ||
      typeof payload.csrfToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
      typeof payload.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{22}$/u.test(payload.nonce)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function requireSession(request, config, now) {
  const session = readSession(request, config, now);
  if (!session) throw new RequestError(401, "Authentication required");
  return session;
}

function requireCsrf(request, session) {
  const candidate = request.headers["x-csrf-token"];
  if (
    typeof candidate !== "string" ||
    !equalBytes(Buffer.from(candidate), Buffer.from(session.csrfToken))
  ) {
    throw new RequestError(403, "Forbidden");
  }
}

function clientIdentity(request) {
  const forwarded = request.headers["x-sigua-client-ip"];
  const value =
    typeof forwarded === "string" && forwarded.length > 0 && forwarded.length <= 128
      ? forwarded
      : request.socket.remoteAddress || "unknown";
  return digestHex(value);
}

function documentConfig(documentName, contentRoot) {
  const config = CONTENT_DOCUMENTS[documentName];
  if (!config) throw new RequestError(404, "Not Found");
  const targetPath = path.resolve(contentRoot, ...config.relativePath.split("/"));
  if (!targetPath.startsWith(`${contentRoot}${path.sep}`)) {
    throw new Error("content document path escaped content root");
  }
  return { ...config, targetPath };
}

async function readCurrentDocument(documentName, contentRoot) {
  const { targetPath } = documentConfig(documentName, contentRoot);
  const bytes = await readFile(targetPath);
  let source;
  try {
    source = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`stored ${documentName} document is invalid JSON`);
  }
  const document = parseContentDocument(documentName, source);
  if (!document) throw new Error(`stored ${documentName} document failed validation`);
  return { document, bytes, etag: etagFor(bytes), targetPath };
}

async function writeFileAtomically(targetPath, serialized, random) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${random(12).toString("hex")}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o644);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, targetPath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true });
  }
}

export function createContentAdminApp(config, options = {}) {
  const now = options.now || (() => new Date());
  const random = options.randomBytes || randomBytes;
  const authenticationDelayMs = options.authenticationDelayMs ?? 180;
  const failedLogins = new Map();
  let writeChain = Promise.resolve();

  function withWriteLock(task) {
    const result = writeChain.then(task, task);
    writeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function loginState(identity, at) {
    const existing = failedLogins.get(identity);
    if (!existing || existing.resetAt <= at) {
      if (!existing && failedLogins.size >= MAX_LOGIN_IDENTITIES) {
        const oldestIdentity = failedLogins.keys().next().value;
        if (oldestIdentity !== undefined) failedLogins.delete(oldestIdentity);
      }
      const state = { attempts: 0, resetAt: at + LOGIN_WINDOW_MS };
      failedLogins.set(identity, state);
      return state;
    }
    return existing;
  }

  function pruneLoginStates(at) {
    if (failedLogins.size < 1024) return;
    for (const [identity, state] of failedLogins) {
      if (state.resetAt <= at) failedLogins.delete(identity);
    }
  }

  async function handleSession(request, response) {
    const currentTime = now();
    if (request.method === "GET") {
      const session = requireSession(request, config, currentTime);
      sendJson(response, 200, {
        authenticated: true,
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      });
      return;
    }
    requireSameOrigin(request, config);
    if (request.method === "DELETE") {
      const session = requireSession(request, config, currentTime);
      requireCsrf(request, session);
      sendJson(
        response,
        200,
        { authenticated: false },
        {
          "Set-Cookie": `${SESSION_COOKIE}=; Path=${API_ROOT}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        },
      );
      return;
    }
    if (request.method !== "POST") {
      throw new RequestError(405, "Method Not Allowed", { Allow: "GET, POST, DELETE" });
    }
    const identity = clientIdentity(request);
    const currentMilliseconds = currentTime.getTime();
    pruneLoginStates(currentMilliseconds);
    const state = loginState(identity, currentMilliseconds);
    if (state.attempts >= LOGIN_ATTEMPTS) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - currentMilliseconds) / 1000));
      throw new RequestError(429, "Too Many Requests", { "Retry-After": String(retryAfter) });
    }
    const body = await readJsonBody(request);
    const candidate = typeof body?.key === "string" && body.key.length <= 512 ? body.key : "";
    const valid = equalBytes(sha256(candidate), config.adminKeyDigest);
    if (!valid) {
      state.attempts += 1;
      if (authenticationDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, authenticationDelayMs));
      }
      throw new RequestError(401, "Authentication failed");
    }
    failedLogins.delete(identity);
    const session = issueSession(config, currentTime, random);
    sendJson(
      response,
      200,
      {
        authenticated: true,
        csrfToken: session.payload.csrfToken,
        expiresAt: new Date(session.payload.expiresAt * 1000).toISOString(),
      },
      { "Set-Cookie": session.cookie },
    );
  }

  async function handleDocument(request, response, documentName) {
    const currentTime = now();
    const session = requireSession(request, config, currentTime);
    if (request.method === "GET") {
      const current = await readCurrentDocument(documentName, config.contentRoot);
      sendJson(
        response,
        200,
        { documentName, document: current.document, etag: current.etag },
        { ETag: current.etag },
      );
      return;
    }
    if (request.method !== "PUT") {
      throw new RequestError(405, "Method Not Allowed", { Allow: "GET, PUT" });
    }
    requireSameOrigin(request, config);
    requireCsrf(request, session);
    const body = await readJsonBody(request);
    const ifMatch = request.headers["if-match"];
    if (typeof ifMatch !== "string" || !ifMatch.trim()) {
      throw new RequestError(428, "If-Match is required");
    }
    const expectedEtag = exactEtag(body?.expectedEtag) ?? exactEtag(ifMatch);
    if (!expectedEtag) throw new RequestError(400, "If-Match is invalid");
    let prepared;
    try {
      prepared = prepareContentDocument(documentName, body?.document, currentTime);
    } catch (error) {
      throw new RequestError(
        422,
        error instanceof Error ? error.message : "Document failed validation",
      );
    }
    const saved = await withWriteLock(async () => {
      const current = await readCurrentDocument(documentName, config.contentRoot);
      if (current.etag !== expectedEtag) {
        throw new RequestError(412, "Document changed; reload before saving");
      }
      await writeFileAtomically(current.targetPath, prepared.serialized, random);
      const bytes = Buffer.from(prepared.serialized, "utf8");
      return { etag: etagFor(bytes) };
    });
    sendJson(
      response,
      200,
      {
        documentName,
        document: prepared.document,
        publishedAt: prepared.document.updatedAt,
        etag: saved.etag,
      },
      { ETag: saved.etag },
    );
  }

  async function handle(request, response) {
    const url = new URL(request.url || "/", config.publicOrigin);
    if (url.pathname === "/healthz") {
      sendText(response, 200, "ok\n");
      return;
    }
    if (!url.pathname.startsWith(`${API_ROOT}/`) && url.pathname !== API_ROOT) {
      sendText(response, 404, "Not Found\n");
      return;
    }
    if (!equalBase64Secret(request.headers["x-sigua-origin-auth"], config.proxyAuthSecret)) {
      sendText(response, 403, "Forbidden\n");
      return;
    }
    if (url.pathname === `${API_ROOT}/session`) {
      await handleSession(request, response);
      return;
    }
    const match = url.pathname.match(
      /^\/__admin\/content\/documents\/(notices|supporters|updates-china|updates-international)$/u,
    );
    if (match) {
      await handleDocument(request, response, match[1]);
      return;
    }
    sendText(response, 404, "Not Found\n");
  }

  return Object.freeze({ handle });
}

export function createContentAdminServer(app) {
  return http.createServer((request, response) => {
    Promise.resolve(app.handle(request, response)).catch((error) => {
      if (error instanceof RequestError) {
        sendJson(response, error.statusCode, { error: error.message }, error.headers);
        return;
      }
      process.stderr.write(
        `content-admin request failed: ${error instanceof Error ? error.stack : String(error)}\n`,
      );
      if (response.headersSent) response.destroy();
      else sendJson(response, 500, { error: "Internal Server Error" });
    });
  });
}

async function start() {
  const config = loadContentAdminConfig();
  const app = createContentAdminApp(config);
  const server = createContentAdminServer(app);
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.listen(config.port, config.listenHost, () => {
    process.stdout.write(`[content-admin] listening on ${config.listenHost}:${config.port}\n`);
  });
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close((error) => {
      if (error) process.stderr.write(`${error.stack || error}\n`);
      process.exit(error ? 1 : 0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
    process.stdout.write(`[content-admin] ${signal}; draining\n`);
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
