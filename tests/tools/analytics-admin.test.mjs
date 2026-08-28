import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDauAnalytics } from "../../services/analytics/dau-analytics.mjs";
import {
  createPublicAnalyticsApp,
  createPublicAnalyticsServer,
} from "../../services/analytics/server.mjs";

const FIXED_NOW = new Date("2026-08-28T12:00:00.000Z");

function analyticsConfig(analyticsDir) {
  return {
    publicOrigin: "https://armor.siguad.icu",
    listenHost: "127.0.0.1",
    port: 0,
    originAuthSecret: randomBytes(32),
    adminProxySecret: randomBytes(32),
    analyticsEnabled: true,
    analyticsDir,
    analyticsSecret: randomBytes(32),
    analyticsRetentionDays: 30,
    analyticsCityThreshold: 3,
    geoIpCityDatabase: "unused.mmdb",
    geoIpDatabaseRelease: "2026-08",
    trustEdgeOneClientIp: true,
  };
}

function requestForIp(ip) {
  return {
    headers: { "eo-connecting-ip": ip },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

test("admin overview returns every thresholded DAU day without IP material", async () => {
  const analyticsDir = await mkdtemp(path.join(tmpdir(), "sigua-analytics-admin-"));
  const config = analyticsConfig(analyticsDir);
  await writeFile(
    path.join(analyticsDir, "dau-aggregate-2026-07-01.json"),
    `${JSON.stringify({
      version: 1,
      date: "2026-07-01",
      dau: 5,
      cityThreshold: 3,
      cities: [{
        countryCode: "CN",
        subdivision: "北京",
        city: "北京市",
        dau: 3,
      }],
      otherDau: 2,
    })}\n`,
    "utf8",
  );
  const cities = new Map([
    ["203.0.113.1", { countryCode: "CN", subdivision: "北京", city: "北京市" }],
    ["203.0.113.2", { countryCode: "CN", subdivision: "北京", city: "北京市" }],
    ["203.0.113.3", { countryCode: "CN", subdivision: "北京", city: "北京市" }],
  ]);
  const analytics = await createDauAnalytics(config, {
    now: () => new Date(FIXED_NOW),
    resolveCity: (ip) => cities.get(ip) ?? null,
  });
  try {
    assert.equal(analytics.record(requestForIp("203.0.113.1")), true);
    assert.equal(analytics.record(requestForIp("203.0.113.1")), false);
    assert.equal(analytics.record(requestForIp("203.0.113.2")), true);
    assert.equal(analytics.record(requestForIp("203.0.113.3")), true);
    assert.equal(analytics.record(requestForIp("203.0.113.4")), true);
    const overview = analytics.overview();
    assert.equal(overview.length, 2);
    assert.deepEqual(overview[0], {
      version: 1,
      date: "2026-07-01",
      dau: 5,
      cityThreshold: 3,
      cities: [{ countryCode: "CN", subdivision: "北京", city: "北京市", dau: 3 }],
      otherDau: 2,
      cityStatus: "archived",
    });
    assert.deepEqual(overview[1], {
      version: 1,
      date: "2026-08-28",
      dau: 4,
      cityThreshold: 3,
      cities: [{ countryCode: "CN", subdivision: "北京", city: "北京市", dau: 3 }],
      otherDau: 1,
      cityStatus: "live_thresholded",
    });
    assert.doesNotMatch(JSON.stringify(overview), /visitorId|ciphertext|"ip"/u);
  } finally {
    await analytics.close();
    await rm(analyticsDir, { recursive: true, force: true });
  }
});

test("analytics admin endpoint requires the internal management proxy secret", async () => {
  const analyticsDir = await mkdtemp(path.join(tmpdir(), "sigua-analytics-endpoint-"));
  const config = analyticsConfig(analyticsDir);
  const app = await createPublicAnalyticsApp(config, {
    analyticsOptions: {
      now: () => new Date(FIXED_NOW),
      resolveCity: () => ({ countryCode: "CN", subdivision: "上海", city: "上海市" }),
    },
  });
  const server = createPublicAnalyticsServer(app);
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve());
    });
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const forbidden = await fetch(`${baseUrl}/__analytics/admin/overview`);
    assert.equal(forbidden.status, 403);
    const authorized = await fetch(`${baseUrl}/__analytics/admin/overview`, {
      headers: {
        "X-Sigua-Admin-Proxy": config.adminProxySecret.toString("base64url"),
      },
    });
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(payload.schemaVersion, "sigua-admin-dau-overview/v1");
    assert.equal(payload.geoIpDatabaseRelease, "2026-08");
    assert.equal(payload.cityThreshold, 3);
    assert.deepEqual(payload.days, []);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await app.analytics.close();
    await rm(analyticsDir, { recursive: true, force: true });
  }
});
