# Review Access Gate Spec

Status: Draft
Owner: maintainers
Prefix: `REVIEWACC-`

## Scope

This specification governs the temporary, non-public review deployment used to show unreleased
site content to individually identified official reviewers. It covers the TencentCloudPublic origin
review gateway, reviewer credential configuration, signed sessions, origin-issued short-lived asset
URLs, EdgeOne Token authentication and static caching, and the reviewer-specific full-screen
watermark.

## Non-goals

- This specification does not authorize public release while `accessPolicy.publishStatus` is
  `blocked`.
- This specification does not authorize deploying raw research assets; review deployments may
  contain only separately approved build artifacts.
- This specification does not replace the future static public production boundary in `DEPLOY-01`;
  the origin authentication and signing gateway exists only on a dedicated temporary review
  hostname.
- This specification does not depend on Cloudflare, EdgeOne edge functions, a database,
  request-time application rendering, or server-side simulation.
- This specification does not claim encryption at rest, DRM, screenshot prevention, immediate
  revocation of an already issued asset URL, or proof of the human using a key. TLS protects content
  in transit; the watermark attributes a session to the reviewer identity assigned to that key.

## Request Boundary

The review hostname has two deliberately different delivery paths:

1. Unlock, session, HTML, service-worker, and asset-signing requests always reach the
   TencentCloudPublic gateway and are never cached.
2. Content-addressed release assets are requested only with a short-lived URL signed by the origin.
   EdgeOne validates that URL before its cache lookup, then returns a cache hit or fetches the file
   from the origin gateway. A cache hit does not reach the origin for the asset bytes; the preceding
   signing request is the origin authorization decision for that asset request.

## Normative Clauses

- `REVIEWACC-01`: The dedicated review hostname MUST route unlock, activation, service-worker,
  asset-signing, document, and application-API requests through the TencentCloudPublic review
  gateway; only the protected immutable release-asset prefix may be satisfied from EdgeOne cache.
- `REVIEWACC-02`: The gateway MUST fail startup, or return only a closed `503`, without opening the
  static artifact when `REVIEW_ACCESS_CONFIG`, `REVIEW_SESSION_SECRET`,
  `REVIEW_EDGE_TOKEN_SECRET`, `REVIEW_RELEASE_MANIFEST`, or `REVIEW_STATIC_ROOT` is missing or
  invalid.
- `REVIEWACC-03`: Before a valid review session is verified, the gateway MUST NOT return application
  HTML, RSC payloads, service-worker code, signed asset URLs, JSON APIs, or an artifact file; EdgeOne
  MUST reject every unsigned, malformed, or expired protected-asset URL.
- `REVIEWACC-04`: The only unauthenticated review routes MUST be `GET /__review/unlock` and
  same-origin `POST /__review/unlock`; every other unauthenticated origin request MUST return the
  inline unlock response or an authorization error without opening an artifact file. The inline
  unlock response MUST use the main site's visual tokens while remaining self-contained and MUST
  NOT request application images, fonts, stylesheets, scripts, or other release assets.
- `REVIEWACC-05`: Every review credential MUST be a generator-produced random value with at least
  256 bits of entropy, and `REVIEW_ACCESS_CONFIG` MUST store only its lowercase SHA-256 digest,
  stable credential ID, and assigned watermark owner.
- `REVIEWACC-06`: Credential verification MUST hash the submitted value with Web Crypto SHA-256
  and compare every fixed-length digest byte without an early-return content comparison.
- `REVIEWACC-07`: A successful unlock MUST issue a bounded-lifetime HMAC-SHA-256 session cookie
  whose authenticated payload contains the credential ID, assigned watermark owner, and expiry;
  non-loopback responses MUST use `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and no `Domain`
  attribute.
- `REVIEWACC-08`: The gateway MUST verify the session signature and expiry before trusting the
  credential ID or watermark owner, serving protected control-plane content, signing an asset path,
  or opening an artifact file.
- `REVIEWACC-09`: The gateway MUST resolve requested files against the real static root, reject path
  traversal and symlink escape, avoid directory listing, and support only `GET` and `HEAD` plus one
  valid byte range for authenticated static resources.
- `REVIEWACC-10`: Every authenticated HTML response MUST contain a fixed, viewport-covering,
  pointer-transparent tiled watermark showing only the verified key owner and the text
  `预发布版，仅供审核`; it MUST NOT expose the internal credential ID.
- `REVIEWACC-11`: Unlock, activation, service-worker, signing, HTML, and API responses MUST be
  private, non-indexable, and `no-store`. Submitted keys and signed session cookies MUST NOT appear
  in a URL, log message, response body, or client-readable cookie.
- `REVIEWACC-12`: The same-origin asset-signing endpoint MUST accept only `POST`, require a valid
  session, accept only normalized paths present in the immutable release manifest, and issue an
  EdgeOne Type A Token-authenticated URL valid for no more than 120 seconds. The URL MUST contain no
  reviewer identity or session value and MUST be returned with `Cache-Control: private, no-store`.
- `REVIEWACC-13`: A no-store service worker served by the gateway MUST intercept only the protected
  immutable release-asset prefix, obtain a fresh signed URL from `REVIEWACC-12`, and fetch that URL
  through EdgeOne. It MUST fail closed when signing, session validation, or network access fails and
  MUST NOT persist protected responses in Cache Storage.
- `REVIEWACC-14`: EdgeOne MUST apply Token authentication to the entire protected release-asset
  prefix before cache lookup, use the same runtime-only secret as the origin signer, and reject
  invalid or expired signatures with `403`. Only content-addressed assets may receive a positive
  node-cache TTL; browser TTL MUST be no-cache, and HTML, control-plane, API, error, and unlock
  responses MUST never be cached.
- `REVIEWACC-15`: The origin gateway MUST independently validate both the signed review session and
  the Type A asset token before opening an asset on an EdgeOne cache miss. Direct IP, forged Host,
  alternate hostname, and directly published container-port requests MUST NOT bypass those checks.
- `REVIEWACC-16`: The EdgeOne rule MUST rely on its documented behavior of excluding authentication
  parameters from the cache key so authorized reviewers share one cached artifact; no credential ID,
  owner, cookie, or session value may vary or contaminate cached bytes.
- `REVIEWACC-17`: The Caddy review-host route MUST reverse proxy to the gateway only and MUST NOT
  expose the same review artifact through `file_server`, another hostname, an IP-based route, or a
  container port published directly on the host.
- `REVIEWACC-18`: `REVIEW_ACCESS_CONFIG`, `REVIEW_SESSION_SECRET`, and
  `REVIEW_EDGE_TOKEN_SECRET` MUST exist only in ignored runtime configuration. The committed Sigua
  Armor and HomeLab repositories MUST NOT contain live review keys, live key digests, session
  signing secrets, or EdgeOne Token secrets.
- `REVIEWACC-19`: The review access implementation MUST NOT restore the removed Squad Armor binary
  tree or add development-only `/__research/` routes to a deployable build.
- `REVIEWACC-20`: Review deployment MUST remain blocked until a standalone static artifact exists,
  and gateway enforcement, cached authorized delivery, unsigned/expired rejection, no-cache browser
  behavior, and direct-origin authentication have been verified against the real review hostname.
  The `ruikang.wang` free-plan console was read-only verified on 2026-07-15 to expose an enabled
  Token-authentication action and Type A configuration; this capability MUST be rechecked if the
  plan or site is replaced.
- `REVIEWACC-21`: The origin unlock endpoint MUST enforce bounded request bodies, same-origin POST,
  per-connection and global failed-attempt budgets, and `Retry-After` responses. EdgeOne SHOULD also
  rate-limit the unlock path before traffic reaches the origin.

## Credential Configuration

`REVIEW_ACCESS_CONFIG` is a secret JSON string governed by
`docs/specs/schemas/review-access-config.schema.json`. Each credential has this shape:

```json
{
  "id": "official-reviewer-a",
  "owner": "官方审核 / Reviewer A",
  "keyHash": "64 lowercase hexadecimal SHA-256 characters"
}
```

`REVIEW_SESSION_SECRET` and `REVIEW_EDGE_TOKEN_SECRET` are separate generator-produced secrets with
at least 256 bits of entropy. The latter is copied only into EdgeOne Token-authentication runtime
configuration and the origin runtime. `REVIEW_STATIC_ROOT` names the read-only mounted standalone
artifact directory, and `REVIEW_RELEASE_MANIFEST` names its generated content-addressed asset
allowlist. The session lifetime defaults to four hours and must remain between one and twenty-four
hours; an asset URL is valid for at most 120 seconds.

## Release Manifest

`REVIEW_RELEASE_MANIFEST` has version `1`, one release-specific asset prefix below
`/__review/assets/`, an exact asset allowlist, and exact document routes. Every asset entry contains
`urlPath`, a normalized root-relative `filePath`, and the complete lowercase SHA-256. The URL must
contain at least the first 16 SHA-256 characters, and the gateway verifies every file digest and
real path before listening. The artifact directory is mounted read-only in production.

```json
{
  "version": 1,
  "assetPrefix": "/__review/assets/release-20260715/",
  "assets": [
    {
      "urlPath": "/__review/assets/release-20260715/app-0123456789abcdef.js",
      "filePath": "assets/app.js",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "documents": [{ "route": "/", "filePath": "index.html" }]
}
```

## Contract Coverage

- [behavioral] `tests/contracts/review-access-contract.test.mjs` enforces
  `REVIEWACC-02..REVIEWACC-13`, `REVIEWACC-15`, and `REVIEWACC-21` with real Web Crypto credential,
  signed-session, Type A token, expiry, tamper, same-origin, fail-closed, allowlist, traversal,
  symlink-escape logic, byte-range, cache-header, service-worker, rate-limit, and HTML-watermark
  cases.
- [static] `tests/contracts/review-access-contract.test.mjs` enforces `REVIEWACC-01`,
  `REVIEWACC-14`, and `REVIEWACC-17..REVIEWACC-19` against the gateway source, container boundary,
  deployment SOP, and secret-free repository inputs. Build-output coverage remains blocked on the
  standalone static artifact.
- [manual] EdgeOne and final review-host probes will enforce `REVIEWACC-01`,
  `REVIEWACC-14..REVIEWACC-17`, and `REVIEWACC-20` by verifying an authorized second asset request is
  an EdgeOne cache hit, unsigned/tampered/expired requests return `403`, HTML and signing requests
  remain cache misses, browser storage contains no protected response, and direct-origin requests
  still require both the session and asset token.

The real-crypto adversarial tests and actual free-plan Token-authentication check pass. This
specification remains Draft until a standalone static build, EdgeOne cache/authentication probes,
and direct-origin gateway checks pass.
