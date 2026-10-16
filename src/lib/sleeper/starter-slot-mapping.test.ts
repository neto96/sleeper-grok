import assert from "node:assert/strict";
import test from "node:test";

import { mapStarterIdsToSlots } from "./starter-slot-mapping.ts";

test("preserves starter slot indices when Sleeper includes an empty placeholder", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];
  const starters = ["0", "love", "wilson", "waddle", "tet", "strange", "michael", "shrader", "NE"];

  assert.deepEqual(mapStarterIdsToSlots(starters, slots), [
    { playerId: "love", slot: "RB" },
    { playerId: "wilson", slot: "RB" },
    { playerId: "waddle", slot: "WR" },
    { playerId: "tet", slot: "WR" },
    { playerId: "strange", slot: "TE" },
    { playerId: "michael", slot: "FLEX" },
    { playerId: "shrader", slot: "K" },
    { playerId: "NE", slot: "DEF" },
  ]);
});

test("preserves a middle empty slot without shifting later starters", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];
  const starters = ["qb", "rb1", "rb2", "wr1", "wr2", "0", "flex", "k", "def"];

  assert.deepEqual(mapStarterIdsToSlots(starters, slots), [
    { playerId: "qb", slot: "QB" },
    { playerId: "rb1", slot: "RB" },
    { playerId: "rb2", slot: "RB" },
    { playerId: "wr1", slot: "WR" },
    { playerId: "wr2", slot: "WR" },
    { playerId: "flex", slot: "FLEX" },
    { playerId: "k", slot: "K" },
    { playerId: "def", slot: "DEF" },
  ]);
});
