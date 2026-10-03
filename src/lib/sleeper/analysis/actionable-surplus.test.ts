import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFantasyAnalysis, calculateRosterSurplus, parseRosterConfiguration, type AnalysisRecord } from "./engine.ts";

function player(playerId: string, position: string, searchRank: number, extra: AnalysisRecord = {}): AnalysisRecord {
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

function buildTeam(roster: AnalysisRecord[], slots: string[]): { team: AnalysisRecord; configuration: AnalysisRecord } {
  const configuration = parseRosterConfiguration(slots);
  const analysis = buildFantasyAnalysis(
    { "1": { team_name: "Actionable Surplus", players: roster, starters: [], reserve: [], taxi: [] } },
    configuration,
  );
  return { team: (analysis.teams as Record<string, AnalysisRecord>)["1"]!, configuration };
}

function rows(team: AnalysisRecord, key: string): AnalysisRecord[] {
  return ((team.availability as AnalysisRecord)[key] ?? []) as AnalysisRecord[];
}

describe("V3.4 actionable surplus", () => {
  it("keeps structural NLFL surplus and adds a separate usable-only result", () => {
    const { team, configuration } = buildTeam(
      [
        player("burrow", "QB", 10),
        player("love", "RB", 10),
        player("jacobs", "RB", 20, { injury_status: "NA" }),
        player("price", "RB", 70, { injury_status: "Out" }),
        player("white", "RB", 250, { injury_status: "Out" }),
        player("rb-depth", "RB", 200),
        player("waddle", "WR", 20, { injury_status: "Questionable" }),
        player("brown", "WR", 40, { status: "Inactive", injury_status: "IR" }),
        player("michael-wilson", "WR", 200, { name: "Michael Wilson" }),
        player("wr-depth-a", "WR", 300),
        player("wr-depth-b", "WR", 350),
        player("laporta", "TE", 45),
      ],
      ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"],
    );
    const structural = team.roster_surplus as AnalysisRecord[];
    const actionable = rows(team, "actionable_surplus");
    const structuralBrown = structural.find((entry) => entry.player_id === "brown");

    assert.deepEqual(structural, calculateRosterSurplus(team, configuration));
    assert.equal(structuralBrown?.surplus_type, "surplus");
    assert.equal(actionable.some((entry) => entry.player_id === "brown"), false);
    assert.equal(actionable.some((entry) => entry.player_id === "jacobs" || entry.player_id === "price"), false);
    assert.ok(actionable.some((entry) => entry.player_id === "michael-wilson"));
    assert.ok(actionable.some((entry) => entry.player_id === "waddle"));
    assert.ok(actionable.every((entry) => entry.player_id !== "brown" && entry.player_id !== "jacobs" && entry.player_id !== "price"));
    assert.notDeepEqual(actionable, structural);
  });

  it("counts one excess player across direct and generic FLEX slots", () => {
    const { team } = buildTeam(
      [player("rb-a", "RB", 10), player("rb-b", "RB", 20), player("rb-c", "RB", 30), player("wr-a", "WR", 40)],
      ["RB", "RB", "FLEX"],
    );
    const actionable = rows(team, "actionable_surplus");
    const excess = actionable.filter((entry) => entry.surplus_type === "surplus" || entry.surplus_type === "replaceable");

    assert.equal(actionable.length, 4);
    assert.equal(excess.length, 1);
    assert.equal(new Set(actionable.map((entry) => entry.player_id)).size, actionable.length);
  });

  it("keeps repeated and mixed FLEX slot assignment unique", () => {
    const { team } = buildTeam(
      [
        player("rb-a", "RB", 10),
        player("rb-b", "RB", 20),
        player("wr-a", "WR", 30),
        player("wr-b", "WR", 40),
        player("te-a", "TE", 50),
        player("te-b", "TE", 60),
      ],
      ["FLEX", "FLEX", "REC_FLEX"],
    );
    const actionable = rows(team, "actionable_surplus");
    const assigned = actionable.filter((entry) => entry.in_optimal_lineup === true);

    assert.equal(new Set(actionable.map((entry) => entry.player_id)).size, actionable.length);
    assert.ok(assigned.length <= 3);
    assert.equal(new Set(assigned.map((entry) => entry.player_id)).size, assigned.length);
  });

  it("returns no actionable surplus for a fully unavailable position", () => {
    const { team } = buildTeam(
      [player("out-wr", "WR", 20, { injury_status: "Out" }), player("ir-wr", "WR", 40, { injury_status: "IR" })],
      ["WR", "FLEX"],
    );

    assert.deepEqual(rows(team, "actionable_surplus"), []);
  });
});
