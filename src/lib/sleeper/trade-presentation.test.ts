import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineupChangeReason } from "./trade-presentation.ts";
import type { LineupChange } from "./trade-analyzer.ts";

const change = (extra: Partial<LineupChange> = {}): LineupChange => ({
  context: "all_roster", slot: "FLEX", ordinal: 1, kind: "upgraded",
  beforePlayerId: "rome", beforePlayerName: "Rome Odunze",
  afterPlayerId: "michael", afterPlayerName: "Michael Wilson", ...extra,
});

describe("trade lineup summary presentation", () => {
  it("labels different all-roster and available changes without mutating evidence", () => {
    const changes = [change(), change({ context: "available", beforePlayerId: "xavier", beforePlayerName: "Xavier Worthy" }),
      change({ slot: "WR", ordinal: 2, kind: "downgraded", beforePlayerId: "ladd", beforePlayerName: "Ladd McConkey", afterPlayerId: "rome", afterPlayerName: "Rome Odunze" })];
    const before = structuredClone(changes);
    assert.equal(lineupChangeReason(changes[0]!, changes), "All-roster lineup: FLEX1 improves from Rome Odunze to Michael Wilson.");
    assert.equal(lineupChangeReason(changes[1]!, changes), "Available lineup: FLEX1 improves from Xavier Worthy to Michael Wilson.");
    assert.equal(lineupChangeReason(changes[2]!, changes), "All-roster lineup: WR2 drops from Ladd McConkey to Rome Odunze.");
    assert.deepEqual(changes, before);
  });
  it("uses one shared description for identical changes in both lineups", () => {
    const changes = [change(), change({ context: "available" })];
    assert.equal(lineupChangeReason(changes[0]!, changes), lineupChangeReason(changes[1]!, changes));
    assert.match(lineupChangeReason(changes[0]!, changes), /^Both lineups:/);
  });
  it("does not repeat context for a single relevant lineup analysis", () => {
    const row = change({ kind: "filled", beforePlayerId: null, beforePlayerName: null });
    assert.equal(lineupChangeReason(row, [row]), "FLEX1 is filled by Michael Wilson.");
  });
  it("distinguishes conflicting changes even when the player names match", () => {
    const changes = [change(), change({ context: "available", kind: "downgraded" })];
    assert.match(lineupChangeReason(changes[0]!, changes), /^All-roster lineup:/);
    assert.match(lineupChangeReason(changes[1]!, changes), /^Available lineup:/);
  });
});
