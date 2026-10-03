import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFantasyAnalysis,
  calculateOptimalLineup,
  parseRosterConfiguration,
  type AnalysisRecord,
} from "./engine.ts";

const STARTING_SLOTS = ["QB", "RB", "RB", "WR", "TE", "FLEX"];

function player(
  playerId: string,
  position: string,
  searchRank: number,
  extra: AnalysisRecord = {},
): AnalysisRecord {
  return {
    player_id: playerId,
    name: playerId,
    position,
    team: "TST",
    status: "Active",
    injury_status: null,
    search_rank: searchRank,
    ...extra,
  };
}

function buildAnalysis() {
  const roster: Record<string, AnalysisRecord> = {
    "1": {
      team_name: "Usable Lineup Test",
      owner: "Test Owner",
      players: [
        player("burrow", "QB", 10),
        player("jacobs", "RB", 10, { injury_status: "NA" }),
        player("price", "RB", 20, { injury_status: "Out" }),
        player("love", "RB", 30),
        player("wilson", "RB", 40),
        player("waddle", "WR", 15, { injury_status: "Questionable" }),
        player("healthy-wr", "WR", 25),
        player("laporta", "TE", 10),
      ],
      starters: [],
      reserve: [],
      taxi: [],
    },
  };
  const configuration = parseRosterConfiguration(STARTING_SLOTS);
  return { analysis: buildFantasyAnalysis(roster, configuration), configuration };
}

describe("V3.4 currently usable lineup", () => {
  it("filters availability candidates and reuses the structural optimizer for legal assignments", () => {
    const { analysis, configuration } = buildAnalysis();
    const team = (analysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const availability = team.availability as AnalysisRecord;
    const structural = team.optimal_lineup as Record<string, AnalysisRecord[]>;
    const usable = availability.usable_lineup as Record<string, AnalysisRecord[]>;

    assert.ok(structural.RB?.some((candidate) => candidate.player_id === "jacobs"));
    assert.ok(!Object.values(usable).flat().some((candidate) => candidate.player_id === "jacobs"));
    assert.ok(!Object.values(usable).flat().some((candidate) => candidate.player_id === "price"));
    assert.ok(Object.values(usable).flat().some((candidate) => candidate.player_id === "waddle"));

    const assignedIds = Object.values(usable).flat().map((candidate) => candidate.player_id);
    assert.equal(new Set(assignedIds).size, assignedIds.length);
    assert.equal((usable.RB ?? []).length, 2);
    assert.equal((usable.FLEX ?? []).length, 1);

    const positions = team.positions as Record<string, AnalysisRecord[]>;
    const usableIds = new Set(
      (availability.players as AnalysisRecord[])
        .filter((candidate) => candidate.currently_usable === true)
        .map((candidate) => String(candidate.player_id)),
    );
    const filteredCandidates = Object.fromEntries(
      ["QB", "RB", "WR", "TE"].map((position) => [
        position,
        (positions[position] ?? []).filter((candidate) => usableIds.has(String(candidate.player_id))),
      ]),
    );
    assert.deepEqual(usable, calculateOptimalLineup(filteredCandidates, configuration));
  });
});
