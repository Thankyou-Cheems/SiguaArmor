import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultVehicleRankerBoard,
  importVehicleRankerCards,
  moveVehicleRankerCard,
  normalizeVehicleRankerBoard,
  removeVehicleRankerTier,
  reorderVehicleRankerTier,
  VEHICLE_RANKER_UNRANKED_ID,
} from "../../lib/vehicle-ranker-model.ts";

test("vehicle ranker starts with the agreed five levels", () => {
  const board = createDefaultVehicleRankerBoard();
  assert.deepEqual(
    board.tiers.map(({ label }) => label),
    ["夯", "顶级", "人上人", "NPC", "拉完了"],
  );
});

test("cards move between the holding pool and tiers without duplication", () => {
  let board = createDefaultVehicleRankerBoard();
  board = moveVehicleRankerCard(board, "ztz99a", VEHICLE_RANKER_UNRANKED_ID);
  board = moveVehicleRankerCard(board, "m1a2", board.tiers[0].id);
  board = moveVehicleRankerCard(board, "ztz99a", board.tiers[0].id, "m1a2");
  assert.deepEqual(board.unrankedCardIds, []);
  assert.deepEqual(board.tiers[0].cardIds, ["ztz99a", "m1a2"]);

  board = moveVehicleRankerCard(board, "m1a2", board.tiers[0].id, "ztz99a");
  assert.deepEqual(board.tiers[0].cardIds, ["m1a2", "ztz99a"]);
});

test("removing a tier preserves its cards in the holding pool", () => {
  let board = createDefaultVehicleRankerBoard();
  board = moveVehicleRankerCard(board, "lav", board.tiers[1].id);
  board = removeVehicleRankerTier(board, board.tiers[1].id);
  assert.equal(board.tiers.length, 4);
  assert.deepEqual(board.unrankedCardIds, ["lav"]);
});

test("saved boards are bounded, deduplicated, and filtered against live catalog ids", () => {
  const board = normalizeVehicleRankerBoard({
    version: 1,
    tiers: [
      { id: "best", label: "  自定义超强档位名称  ", tone: "red", cardIds: ["a", "a", "gone"] },
      { id: "rest", label: "", tone: "invalid", cardIds: ["a", "b"] },
    ],
    unrankedCardIds: ["b", "c", "gone"],
  }, new Set(["a", "b", "c"]));
  assert.equal(board.tiers[0].label, "自定义超强档位名称");
  assert.deepEqual(board.tiers[0].cardIds, ["a"]);
  assert.deepEqual(board.tiers[1].cardIds, ["b"]);
  assert.deepEqual(board.unrankedCardIds, ["c"]);
});

test("tiers can be reordered without changing their card contents", () => {
  const board = createDefaultVehicleRankerBoard();
  const moved = reorderVehicleRankerTier(board, board.tiers[1].id, -1);
  assert.equal(moved.tiers[0].label, "顶级");
  assert.equal(moved.tiers[1].label, "夯");
});

test("faction import adds only missing vehicles and preserves ranked placements", () => {
  let board = createDefaultVehicleRankerBoard();
  board = moveVehicleRankerCard(board, "already-ranked", board.tiers[0].id);
  board = importVehicleRankerCards(board, [
    "already-ranked",
    "new-one",
    "new-two",
    "new-one",
  ]);
  assert.deepEqual(board.tiers[0].cardIds, ["already-ranked"]);
  assert.deepEqual(board.unrankedCardIds, ["new-one", "new-two"]);
});
