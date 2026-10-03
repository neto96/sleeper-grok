import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFantasyAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./engine.ts";

const NLFL = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN"];

function player(
  playerId: string,
  name: string,
  position: string,
  searchRank: number | null,
  extra: AnalysisRecord = {},
): AnalysisRecord {
  return {
    player_id: playerId,
    name,
    position,
    team: "TST",
    status: "Active",
    injury_status: null,
    search_rank: searchRank,
    ...extra,
  };
}

function buildFixture() {
  const mainPlayers = [
    player("burrow", "Joe Burrow", "QB", 10),
    player("love", "Jeremiyah Love", "RB", 10),
    player("jacobs", "Josh Jacobs", "RB", 20, { injury_status: "NA" }),
    player("price", "Jadarian Price", "RB", 70, { injury_status: "Out" }),
    player("white", "Rachaad White", "RB", 250, { injury_status: "Out" }),
    player("wilson", "Emanuel Wilson", "RB", 200),
    player("waddle", "Jaylen Waddle", "WR", 20, { injury_status: "Questionable" }),
    player("brown", "A.J. Brown", "WR", 40, { status: "Inactive", injury_status: "IR" }),
    player("laporta", "Sam LaPorta", "TE", 45),
    player("def", "Test Defense", "DEF", null, { status: null, injury_status: null }),
    // Duplicate input ID verifies the additive availability list is unique.
    player("burrow", "Joe Burrow", "QB", 10),
  ];
  const secondaryPlayers = [
    player("rb-a", "Secondary RB A", "RB", 10),
    player("rb-b", "Secondary RB B", "RB", 100),
    player("rb-c", "Secondary RB C", "RB", 200),
    player("forson", "Joe Forson", "RB", null, { status: "Practice Squad", injury_status: "NA" }),
    player("reserve-k", "Reserve K", "K", null),
  ];
  const rosters: Record<string, AnalysisRecord> = {
    "1": {
      team_name: "Main Team",
      owner: "Main Owner",
      players: mainPlayers,
      starters: [{ player_id: "love" }, { player_id: "jacobs" }],
      reserve: [],
      taxi: [],
    },
    "2": {
      team_name: "Comparison Team",
      owner: "Comparison Owner",
      players: secondaryPlayers,
      starters: [],
      reserve: [{ player_id: "reserve-k" }],
      taxi: [{ player_id: "forson" }],
    },
  };
  return buildFantasyAnalysis(rosters, parseRosterConfiguration(NLFL));
}

function playersFor(analysis: AnalysisRecord, rosterId: string): AnalysisRecord[] {
  const team = (analysis.teams as Record<string, AnalysisRecord>)[rosterId]!;
  return ((team.availability as AnalysisRecord).players as AnalysisRecord[]);
}

describe("V3.4 Phase 2 team availability integration", () => {
  it("adds per-team player assessments and a positional usable summary", () => {
    const analysis = buildFixture();
    const team = (analysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const availability = team.availability as AnalysisRecord;

    assert.ok(Array.isArray(availability.players));
    assert.deepEqual(Object.keys(availability.usable_summary as AnalysisRecord).sort(), ["QB", "RB", "TE", "WR"]);
    assert.equal(analysis.snapshot_version, undefined);
    assert.equal(analysis.analysis_version, undefined);

    const playerRows = availability.players as AnalysisRecord[];
    const ids = playerRows.map((row) => row.player_id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(playerRows.every((row) =>
      ["player_id", "name", "position", "team", "status", "injury_status", "roster_status", "availability", "reason", "currently_usable"]
        .every((key) => key in row),
    ));
  });

  it("assesses representative player availability without changing structural meaningfulness", () => {
    const analysis = buildFixture();
    const rows = playersFor(analysis, "1");
    const byName = new Map(rows.map((row) => [row.name, row]));
    const expectations: Array<[string, string, boolean]> = [
      ["Joe Burrow", "available", true],
      ["Jaylen Waddle", "uncertain", true],
      ["Josh Jacobs", "unavailable", false],
      ["Jadarian Price", "unavailable", false],
      ["Rachaad White", "unavailable", false],
      ["A.J. Brown", "unavailable", false],
    ];

    for (const [name, availability, usable] of expectations) {
      const row = byName.get(name)!;
      assert.equal(row.availability, availability, name);
      assert.equal(row.currently_usable, usable, name);
    }

    const team = (analysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const brown = byName.get("A.J. Brown")!;
    const brownStructural = ((team.positions as AnalysisRecord).WR as AnalysisRecord[])
      .find((row) => row.player_id === brown.player_id)!;
    assert.equal(brownStructural.fantasy_value_tier, "elite");
    assert.equal(brown.availability, "unavailable");
  });

  it("reports the expected RB usable counts while preserving V3.3 structure", () => {
    const analysis = buildFixture();
    const team = (analysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const availability = team.availability as AnalysisRecord;
    const usableSummary = availability.usable_summary as AnalysisRecord;

    assert.deepEqual(usableSummary.RB, {
      rostered: 5,
      meaningful: 5,
      usable: 2,
      usable_meaningful: 2,
      unavailable_meaningful: 3,
    });

    const positionSummary = team.position_summary as AnalysisRecord;
    const structuralRb = positionSummary.RB as AnalysisRecord;
    assert.equal(structuralRb.meaningful_players, 5);
    assert.equal(structuralRb.depth_score, 27);
    assert.equal(((team.position_need as AnalysisRecord).RB as AnalysisRecord).need, "low");
    assert.ok(((team.optimal_lineup as AnalysisRecord).RB as AnalysisRecord[]).some((row) => row.player_id === "jacobs"));
  });

  it("retains reserve/taxi roster records and the null-status defense case", () => {
    const analysis = buildFixture();
    const secondaryRows = playersFor(analysis, "2");
    const forson = secondaryRows.find((row) => row.name === "Joe Forson")!;
    const reserveK = secondaryRows.find((row) => row.name === "Reserve K")!;
    const defense = playersFor(analysis, "1").find((row) => row.position === "DEF")!;

    assert.equal(forson.roster_status, "taxi");
    assert.equal(forson.availability, "unavailable");
    assert.equal(forson.currently_usable, false);
    assert.equal(reserveK.roster_status, "reserve");
    assert.equal(reserveK.availability, "unavailable");
    assert.equal(reserveK.currently_usable, false);
    assert.deepEqual(
      [defense.availability, defense.reason, defense.currently_usable],
      ["available", "active", true],
    );
  });
});
