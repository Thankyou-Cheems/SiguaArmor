import assert from "node:assert/strict";
import test from "node:test";

import { parseSupportersDocument } from "../../lib/supporters-document.mjs";

test("parseSupportersDocument keeps @/中文/emoji names", () => {
  const fixture = {
    version: 1,
    updatedAt: "2026-08-10T00:00:00.000Z",
    entries: [
      {
        id: "emoji-1",
        name: "@飞行ACV✈️",
        nameSegments: [{ text: "@飞行ACV✈️", color: "#ffffff" }],
        kind: "friend",
        url: "https://example.com/",
      },
      {
        id: "emoji-2",
        name: "@猹Cheems🐕",
        nameSegments: [{ text: "@猹Cheems🐕", color: "#ffffff" }],
        kind: "sponsor",
      },
      {
        id: "emoji-3",
        name: "@北哥🔥",
        nameSegments: [{ text: "@北哥🔥", color: "#ffffff" }],
        kind: "friend",
      },
      {
        id: "emoji-4",
        name: "@玩家👨‍💻",
        nameSegments: [{ text: "@玩家👨‍💻", color: "#ffffff" }],
        kind: "friend",
      },
      {
        id: "emoji-5",
        name: "@小队❤️‍🔥",
        nameSegments: [{ text: "@小队❤️‍🔥", color: "#ffffff" }],
        kind: "friend",
      },
      {
        id: "emoji-6",
        name: "@测试🇨🇳",
        nameSegments: [{ text: "@测试🇨🇳", color: "#ffffff" }],
        kind: "sponsor",
        note: "emoji 测试",
      },
    ],
  };

  const parsed = parseSupportersDocument(fixture);
  assert.notEqual(parsed, null);
  assert.equal(parsed.entries.length, 6);
  assert.deepEqual(
    parsed.entries.map((entry) => entry.name),
    fixture.entries.map((entry) => entry.name),
  );
  assert.equal(parsed.entries[5].note, "emoji 测试");
});

