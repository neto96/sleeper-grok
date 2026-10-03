import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFantasyAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./engine.ts";

const NLFL = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN"];

function player(
  playerId: string,
  position: string,
  searchRank: number | null,
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

function nlflAnalysis(): AnalysisRecord {
  const targetPlayers = [
    player("burrow", "QB", 10),
    player("love", "RB", 10),
    player("jacobs", "RB", 20, { injury_status: "NA" }),
    player("price", "RB", 70, { injury_status: "Out" }),
    player("white", "RB", 250, { injury_status: "Out" }),
    player("wilson", "RB", 200),
    player("waddle", "WR", 20, { injury_status: "Questionable" }),
    player("brown", "WR", 40, { status: "Inactive", injury_status: "IR" }),
    player("laporta", "TE", 45),
    player("def", "DEF", null, { status: null, injury_status: null }),
  ];
  const comparisonPlayers = [
    player("rb-a", "RB", 10),
    player("rb-b", "RB", 100),
    player("rb-c", "RB", 200),
    player("forson", "RB", null, { status: "Practice Squad", injury_status: "NA" }),
  ];
  const rosters: Record<string, AnalysisRecord> = {
    "1": {
      team_name: "Main",
      owner: "Owner",
      players: targetPlayers,
      starters: [{ player_id: "love" }, { player_id: "jacobs" }],
      reserve: [],
      taxi: [],
    },
    "2": {
      team_name: "Comparison",
      owner: "Other",
      players: comparisonPlayers,
      starters: [],
      reserve: [],
      taxi: [{ player_id: "forson" }],
    },
  };
  return buildFantasyAnalysis(rosters, parseRosterConfiguration(NLFL));
}

function needAnalysis(targetCount: number, comparisonCount: number): AnalysisRecord {
  const makeRbs = (prefix: string, count: number): AnalysisRecord[] =>
    Array.from({ length: count }, (_, index) =>
      player(`${prefix}-${index}`, "RB", [10, 100, 200, 300, 350][index] ?? 500),
    );
  return buildFantasyAnalysis(
    {
      "1": { team_name: "Target", players: makeRbs("target", targetCount), starters: [], reserve: [], taxi: [] },
      "2": { team_name: "Comparison", players: makeRbs("comparison", comparisonCount), starters: [], reserve: [], taxi: [] },
    },
    parseRosterConfiguration(["RB", "RB"]),
  );
}

function teamFor(analysis: AnalysisRecord, rosterId = "1"): AnalysisRecord {
  return (analysis.teams as Record<string, AnalysisRecord>)[rosterId]!;
}

function availabilityOf(team: AnalysisRecord): AnalysisRecord {
  return team.availability as AnalysisRecord;
}

describe("V3.4 usable need, starting depth, and lineup strength", () => {
  it("keeps NLFL structural metrics intact and reports usable RB need as thin", () => {
    const analysis = nlflAnalysis();
    const team = teamFor(analysis);
    const availability = availabilityOf(team);

    const structuralSummary = (team.position_summary as AnalysisRecord).RB as AnalysisRecord;
    const structuralNeed = (team.position_need as AnalysisRecord).RB as AnalysisRecord;
    const structuralDepth = (team.starting_depth as AnalysisRecord).RB as AnalysisRecord;
    const structuralStrength = (team.lineup_strength as AnalysisRecord).RB as AnalysisRecord;
    assert.equal(structuralSummary.meaningful_players, 5);
    assert.equal(structuralSummary.depth_score, 27);
    assert.equal(structuralNeed.need, "low");
    assert.equal(structuralDepth.meaningful_players, 5);
    assert.equal(structuralDepth.starting_depth, "deep");
    assert.equal(structuralStrength.meaningful_players, 5);
    assert.equal(structuralStrength.rating, "strong");
    assert.ok(((team.optimal_lineup as AnalysisRecord).RB as AnalysisRecord[]).some((row) => row.player_id === "jacobs"));

    const usableSummary = ((availability.usable_summary as AnalysisRecord).RB ?? {}) as AnalysisRecord;
    const usableNeed = ((availability.usable_position_need as AnalysisRecord).RB ?? {}) as AnalysisRecord;
    const usableDepth = ((availability.usable_starting_depth as AnalysisRecord).RB ?? {}) as AnalysisRecord;
    const usableStrength = ((availability.usable_lineup_strength as AnalysisRecord).RB ?? {}) as AnalysisRecord;
    assert.equal(usableSummary.usable, 2);
    assert.equal(usableSummary.usable_meaningful, 2);
    assert.equal(usableNeed.direct_required, 2);
    assert.equal(usableNeed.need, "thin");
    assert.equal(usableDepth.meaningful_players, 2);
    assert.equal(usableDepth.starting_depth, "short");
    assert.equal(usableStrength.meaningful_players, 2);
    assert.equal(usableStrength.rating, "weak");
  });

  it("excludes unavailable meaningful players from usable depth and strength", () => {
    const team = teamFor(nlflAnalysis());
    const availability = availabilityOf(team);
    const rows = availability.players as AnalysisRecord[];
    const excludedIds = new Set(["jacobs", "price", "white"]);

    for (const id of excludedIds) {
      assert.ok(!Object.values(availability.usable_lineup as Record<string, AnalysisRecord[]>)
        .flat().some((candidate) => candidate.player_id === id));
    }
    assert.equal(
      ((availability.usable_starting_depth as AnalysisRecord).RB as AnalysisRecord).meaningful_players,
      2,
    );
    assert.equal(
      ((availability.usable_lineup_strength as AnalysisRecord).RB as AnalysisRecord).meaningful_players,
      2,
    );
    assert.equal(rows.filter((row) => excludedIds.has(String(row.player_id)) && row.currently_usable).length, 0);
    assert.equal(((team.position_summary as AnalysisRecord).RB as AnalysisRecord).meaningful_players, 5);
  });

  it("counts Questionable players in usable metrics and lineup selection", () => {
    const team = teamFor(nlflAnalysis());
    const availability = availabilityOf(team);
    const waddle = (availability.players as AnalysisRecord[]).find((row) => row.player_id === "waddle")!;

    assert.equal(waddle.availability, "uncertain");
    assert.equal(waddle.currently_usable, true);
    assert.equal(((availability.usable_summary as AnalysisRecord).WR as AnalysisRecord).usable, 1);
    assert.equal(((availability.usable_summary as AnalysisRecord).WR as AnalysisRecord).usable_meaningful, 1);
    assert.ok(Object.values(availability.usable_lineup as Record<string, AnalysisRecord[]>)
      .flat().some((candidate) => candidate.player_id === "waddle"));
  });

  it("does not add FLEX slots to direct position requirements", () => {
    const team = teamFor(nlflAnalysis());
    const usableNeed = availabilityOf(team).usable_position_need as AnalysisRecord;

    assert.equal((usableNeed.RB as AnalysisRecord).direct_required, 2);
    assert.equal((usableNeed.WR as AnalysisRecord).direct_required, 2);
    assert.equal((usableNeed.TE as AnalysisRecord).direct_required, 1);
  });

  it("uses median-relative moderate and low need classifications", () => {
    const low = teamFor(needAnalysis(3, 0));
    const moderate = teamFor(needAnalysis(3, 5));

    assert.equal(((availabilityOf(low).usable_position_need as AnalysisRecord).RB as AnalysisRecord).need, "low");
    assert.equal(((availabilityOf(moderate).usable_position_need as AnalysisRecord).RB as AnalysisRecord).need, "moderate");
  });

  it("keeps repeated and mixed FLEX slots out of direct demand", () => {
    const configuration = parseRosterConfiguration([
      "QB", "RB", "RB", "WR", "TE", "FLEX", "FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX",
    ]);
    const players = [
      player("qb-a", "QB", 10), player("qb-b", "QB", 20),
      player("rb-a", "RB", 10), player("rb-b", "RB", 20), player("rb-c", "RB", 30), player("rb-d", "RB", 40),
      player("wr-a", "WR", 10), player("wr-b", "WR", 20), player("wr-c", "WR", 30), player("wr-d", "WR", 40),
      player("te-a", "TE", 10), player("te-b", "TE", 20), player("te-c", "TE", 30),
    ];
    const analysis = buildFantasyAnalysis(
      { "1": { team_name: "Mixed FLEX", players, starters: [], reserve: [], taxi: [] } },
      configuration,
    );
    const availability = availabilityOf(teamFor(analysis));
    const need = availability.usable_position_need as AnalysisRecord;
    const lineup = availability.usable_lineup as Record<string, AnalysisRecord[]>;

    assert.equal((need.QB as AnalysisRecord).direct_required, 1);
    assert.equal((need.RB as AnalysisRecord).direct_required, 2);
    assert.equal((need.WR as AnalysisRecord).direct_required, 1);
    assert.equal((need.TE as AnalysisRecord).direct_required, 1);
    const assignedIds = Object.values(lineup).flat().map((row) => row.player_id);
    assert.equal(new Set(assignedIds).size, assignedIds.length);
    assert.equal((lineup.FLEX ?? []).length, 2);
    assert.equal((lineup.WRRB_FLEX ?? []).length, 1);
    assert.equal((lineup.REC_FLEX ?? []).length, 1);
    assert.equal((lineup.SUPER_FLEX ?? []).length, 1);
  });

  it("classifies a fully unavailable required position safely as critical", () => {
    const analysis = buildFantasyAnalysis(
      {
        "1": {
          team_name: "Unavailable RBs",
          players: [
            player("out-a", "RB", 10, { injury_status: "Out" }),
            player("out-b", "RB", 20, { injury_status: "IR" }),
          ],
          starters: [],
          reserve: [],
          taxi: [],
        },
      },
      parseRosterConfiguration(["QB", "RB", "RB"]),
    );
    const availability = availabilityOf(teamFor(analysis));
    const need = availability.usable_position_need as AnalysisRecord;
    const depth = availability.usable_starting_depth as AnalysisRecord;
    const strength = availability.usable_lineup_strength as AnalysisRecord;

    assert.equal((availability.usable_summary as AnalysisRecord).RB && ((availability.usable_summary as AnalysisRecord).RB as AnalysisRecord).usable, 0);
    assert.equal((need.RB as AnalysisRecord).need, "critical");
    assert.equal((need.RB as AnalysisRecord).usable_bodies, 0);
    assert.equal((depth.RB as AnalysisRecord).meaningful_players, 0);
    assert.equal((strength.RB as AnalysisRecord).meaningful_players, 0);
  });
});
