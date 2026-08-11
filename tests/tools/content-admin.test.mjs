import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createContentAdminApp,
  createContentAdminServer,
} from "../../services/content-admin/server.mjs";

const PUBLIC_ORIGIN = "https://armor.siguad.icu";

function parseJson(response) {
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : Promise.reject(new Error(`non-json response: ${response.status}`));
}

function headersForApi(proxyAuthToken, cookie, extra = {}) {
  return {
    "X-Sigua-Origin-Auth": proxyAuthToken,
    Origin: PUBLIC_ORIGIN,
    "sec-fetch-site": "same-origin",
    ...extra,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function authHeaders({ proxyAuthToken, cookie, csrfToken, headers = {} }) {
  return headersForApi(
    proxyAuthToken,
    cookie,
    {
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...headers,
    },
  );
}

async function withContentAdminServer(callback) {
  const originAuthToken = randomBytes(32).toString("base64url");
  const adminPlain = "sigua-admin-pass";
  const adminKeyDigest = createHash("sha256").update(adminPlain).digest();
  const sessionSecret = randomBytes(32);
  const contentRoot = await mkdtemp(path.join(tmpdir(), "sigua-armor-admin-"));
  const config = {
    publicOrigin: PUBLIC_ORIGIN,
    proxyAuthSecret: Buffer.from(originAuthToken, "base64url"),
    adminKeyDigest,
    sessionSecret,
    contentRoot,
    listenHost: "127.0.0.1",
    port: 0,
    sessionTtlSeconds: 900,
  };
  const app = createContentAdminApp(config);
  const server = createContentAdminServer(app);
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    await writeFile(
      path.join(contentRoot, "notices.json"),
      `${JSON.stringify(
        {
          version: 1,
          updatedAt: "2026-08-10T00:00:00.000Z",
          editions: {
            china: { title: "国服载具资料库", lines: ["国服提示"] },
            international: { lines: ["International notice"] },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      path.join(contentRoot, "supporters.json"),
      `${JSON.stringify(
        {
          version: 1,
          updatedAt: "2026-08-10T00:00:00.000Z",
          entries: [
            {
              id: "alpha",
              name: "@示例",
              nameSegments: [{ text: "@示例", color: "#ffffff" }],
              kind: "friend",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await mkdir(path.join(contentRoot, "squad"), { recursive: true });
    await writeFile(
      path.join(contentRoot, "updates.json"),
      `${JSON.stringify({ version: 1, updatedAt: "2026-08-10T00:00:00.000Z", siteUpdatedOn: "2026-08-10", entries: [{ id: "u", date: "2026-08-10", title: "x", items: ["y"] }] }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(contentRoot, "squad", "updates.json"),
      `${JSON.stringify({ version: 1, updatedAt: "2026-08-10T00:00:00.000Z", siteUpdatedOn: "2026-08-10", entries: [{ id: "u", date: "2026-08-10", title: "x", items: ["y"] }] }, null, 2)}\n`,
      "utf8",
    );
    try {
      await callback({
        baseUrl,
        adminPlain,
        adminKeyDigest: originAuthToken,
        authHeaders,
      });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    await rm(contentRoot, { recursive: true, force: true });
  }
}

test("content-admin preserves ETag lifecycle and Unicode supporters through consecutive saves", async () => {
  await withContentAdminServer(async ({ baseUrl, adminPlain, adminKeyDigest, authHeaders }) => {
    const loginResponse = await fetch(`${baseUrl}/__admin/content/session`, {
      method: "POST",
      headers: headersForApi(adminKeyDigest, null, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ key: adminPlain }),
    });
    assert.equal(loginResponse.status, 200);
    const loginPayload = await parseJson(loginResponse);
    const cookieHeader = loginResponse.headers.get("set-cookie");
    const cookie = cookieHeader ? cookieHeader.split(";", 1)[0] : "";
    assert.ok(cookie);

    const current = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "GET",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
      }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(current.response.status, 200);
    const firstEtag = current.response.headers.get("etag");
    assert.ok(firstEtag);
    assert.equal(current.value.etag, firstEtag);

    const noIfMatch = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "PUT",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
        csrfToken: loginPayload.csrfToken,
        headers: { "Content-Type": "application/json" },
      }),
      body: JSON.stringify({
        expectedEtag: firstEtag,
        document: current.value.document,
      }),
    });
    assert.equal(noIfMatch.status, 428);

    const firstSave = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "PUT",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
        csrfToken: loginPayload.csrfToken,
        headers: { "Content-Type": "application/json", "If-Match": firstEtag },
      }),
      body: JSON.stringify({
        expectedEtag: firstEtag,
        document: {
          ...current.value.document,
          entries: ["@飞行ACV✈️", "@猹Cheems🐕", "@玩家👨‍💻", "@测试❤️‍🔥", "@测试🇨🇳"].map(
            (name, index) => ({
              id: `emoji-${index + 1}`,
              name,
              nameSegments: [{ text: name, color: "#ffffff" }],
              kind: "friend",
            }),
          ),
        },
      }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(firstSave.response.status, 200);
    assert.deepEqual(
      firstSave.value.document.entries.map((entry) => entry.name),
      ["@飞行ACV✈️", "@猹Cheems🐕", "@玩家👨‍💻", "@测试❤️‍🔥", "@测试🇨🇳"],
    );
    const secondEtag = firstSave.response.headers.get("etag");
    assert.ok(secondEtag);
    assert.notEqual(secondEtag, firstEtag);
    assert.equal(firstSave.value.etag, secondEtag);

    const secondSave = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "PUT",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
        csrfToken: loginPayload.csrfToken,
        headers: { "Content-Type": "application/json", "If-Match": secondEtag },
      }),
      body: JSON.stringify({
        expectedEtag: secondEtag,
        document: {
          ...firstSave.value.document,
          entries: firstSave.value.document.entries.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  name: "@飞行ACV✈️第二次",
                  nameSegments: [{ text: "@飞行ACV✈️第二次", color: "#ffffff" }],
                }
              : entry,
          ),
        },
      }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(secondSave.response.status, 200);
    const thirdEtag = secondSave.response.headers.get("etag");
    assert.ok(thirdEtag);
    assert.notEqual(thirdEtag, secondEtag);
    assert.equal(secondSave.value.etag, thirdEtag);

    const stale = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "PUT",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
        csrfToken: loginPayload.csrfToken,
        headers: { "Content-Type": "application/json", "If-Match": firstEtag },
      }),
      body: JSON.stringify({
        expectedEtag: firstEtag,
        document: current.value.document,
      }),
    });
    assert.equal(stale.status, 412);

    const reloaded = await fetch(`${baseUrl}/__admin/content/documents/supporters`, {
      method: "GET",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
      }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(reloaded.response.status, 200);
    assert.equal(reloaded.value.etag, thirdEtag);
    assert.equal(reloaded.value.document.entries[0].name, "@飞行ACV✈️第二次");
  });
});

test("content-admin publishes both editions of the blue notice with ETag protection", async () => {
  await withContentAdminServer(async ({ baseUrl, adminPlain, adminKeyDigest, authHeaders }) => {
    const loginResponse = await fetch(`${baseUrl}/__admin/content/session`, {
      method: "POST",
      headers: headersForApi(adminKeyDigest, null, { "Content-Type": "application/json" }),
      body: JSON.stringify({ key: adminPlain }),
    });
    assert.equal(loginResponse.status, 200);
    const session = await parseJson(loginResponse);
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] ?? "";

    const current = await fetch(`${baseUrl}/__admin/content/documents/notices`, {
      headers: authHeaders({ proxyAuthToken: adminKeyDigest, cookie }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(current.response.status, 200);
    const etag = current.response.headers.get("etag");
    assert.ok(etag);

    const saved = await fetch(`${baseUrl}/__admin/content/documents/notices`, {
      method: "PUT",
      headers: authHeaders({
        proxyAuthToken: adminKeyDigest,
        cookie,
        csrfToken: session.csrfToken,
        headers: { "Content-Type": "application/json", "If-Match": etag },
      }),
      body: JSON.stringify({
        expectedEtag: etag,
        document: {
          ...current.value.document,
          editions: {
            china: { title: "维护提示🔧", lines: ["国服内容已更新。"] },
            international: { title: "Notice", lines: ["Global data refreshed."] },
          },
        },
      }),
    }).then((response) => parseJson(response).then((value) => ({ response, value })));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.value.document.editions.china.title, "维护提示🔧");
    assert.deepEqual(saved.value.document.editions.international.lines, ["Global data refreshed."]);
    assert.notEqual(saved.response.headers.get("etag"), etag);
  });
});
