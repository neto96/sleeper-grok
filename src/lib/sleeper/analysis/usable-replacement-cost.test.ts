import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFantasyAnalysis,
  calculateOptimalLineup,
  calculateRosterReplacementCost,
  parseRosterConfiguration,
  type AnalysisRecord,
} from "./engine.ts";

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

function teamFrom(roster: AnalysisRecord[], slots: string[] = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]): AnalysisRecord {
  const analysis = buildFantasyAnalysis(
    { "1": { team_name: "Replacement Test", players: roster, starters: [], reserve: [], taxi: [] } },
    parseRosterConfiguration(slots),
  );
  return (analysis.teams as Record<string, AnalysisRecord>)["1"]!;
}

function records(team: AnalysisRecord, key: string): AnalysisRecord[] {
  return ((team.availability as AnalysisRecord)[key] ?? []) as AnalysisRecord[];
}

function assignedIds(lineup: Record<string, AnalysisRecord[]>): unknown[] {
  return Object.values(lineup).flat().map((candidate) => candidate.player_id);
}

function testLineupScore(lineup: Record<string, AnalysisRecord[]>): number {
  const tierScores: Record<string, number> = {
    elite: 5,
    strong: 4,
    useful: 3,
    fringe: 2,
    deep_waiver: 1,
    unknown: 0,
  };
  return Object.values(lineup).flat().reduce(
    (sum, candidate) =>
      sum + (tierScores[String(candidate.fantasy_value_tier)] ?? 0) * 100 + Number(candidate.importance_score ?? 0),
    0,
  );
}

describe("V3.4 usable replacement cost", () => {
  it("adds a usable result while retaining structural NLFL replacement behavior", () => {
    const roster = [
      player("burrow", "QB", 10),
      player("love", "RB", 10),
      player("jacobs", "RB", 20, { injury_status: "NA" }),
      player("price", "RB", 70, { injury_status: "Out" }),
      player("wilson", "WR", 200, { name: "Michael Wilson" }),
      player("waddle", "WR", 20, { injury_status: "Questionable" }),
      player("brown", "WR", 40, { status: "Inactive", injury_status: "IR" }),
      player("laporta", "TE", 45),
    ];
    const configuration = parseRosterConfiguration(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]);
    const team = teamFrom(roster, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]);
    const structural = team.roster_replacement_cost as AnalysisRecord[];
    const usable = records(team, "usable_replacement_cost");

    assert.ok(structural.some((row) => row.player_id === "jacobs"));
    assert.ok(structural.some((row) => row.player_id === "price"));
    assert.ok(usable.some((row) => row.player_id === "wilson"));
    assert.equal(usable.some((row) => row.player_id === "jacobs" || row.player_id === "price"), false);
    assert.ok(usable.every((row) => row.replacement_player_id !== "jacobs" && row.replacement_player_id !== "price"));
    assert.notEqual(usable, structural);

    const structuralWilson = structural.find((row) => row.player_id === "wilson");
    const expectedStructural = calculateRosterReplacementCost(team, configuration);
    assert.deepEqual(structural, expectedStructural);
    assert.deepEqual(structuralWilson, expectedStructural.find((row) => row.player_id === "wilson"));
    assert.deepEqual(
      {
        lineup_position: structuralWilson?.lineup_position,
        score_difference: structuralWilson?.score_difference,
        replacement_cost: structuralWilson?.replacement_cost,
      },
      { lineup_position: "WR", score_difference: 304, replacement_cost: "very_high" },
    );

    const usableLineup = (team.availability as AnalysisRecord).usable_lineup as Record<string, AnalysisRecord[]>;
    const usableBaselineScore = testLineupScore(usableLineup);
    assert.ok(usable.every((row) => row.lineup_score_before === usableBaselineScore));
  });

  it("keeps the structural candidate universe and usable candidate universe separate", () => {
    const team = teamFrom(
      [
        player("starting-qb", "QB", 5),
        player("reserve-qb", "QB", 1, { injury_status: "Out", roster_status: "reserve" }),
        player("rb-a", "RB", 10),
        player("rb-b", "RB", 20),
        player("wr-a", "WR", 10),
        player("wr-b", "WR", 20),
        player("te-a", "TE", 10),
      ],
      ["QB", "RB", "RB", "WR", "WR", "TE"],
    );
    const structural = team.roster_replacement_cost as AnalysisRecord[];
    const usable = records(team, "usable_replacement_cost");

    assert.ok(structural.some((row) => row.player_id === "reserve-qb"));
    assert.equal(usable.some((row) => row.player_id === "reserve-qb"), false);
    assert.equal(usable.some((row) => row.replacement_player_id === "reserve-qb"), false);
  });

  it("keeps a Questionable player eligible in usable replacement selection", () => {
    const team = teamFrom(
      [
        player("rb-a", "RB", 1),
        player("rb-b", "RB", 2),
        player("wr-a", "WR", 3),
        player("wr-questionable", "WR", 250, { injury_status: "Questionable" }),
        player("wr-depth", "WR", 450),
      ],
      ["RB", "WR", "FLEX"],
    );
    const usable = records(team, "usable_replacement_cost");
    const wrCost = usable.find((row) => row.player_id === "wr-a");

    assert.ok(wrCost);
    assert.equal(wrCost?.replacement_player_id, "wr-questionable");
    assert.equal(wrCost?.replacement_lineup_position, "WR");
  });

  it("selects a legal direct-position backup and retains the existing cost classification", () => {
    const team = teamFrom([player("qb-a", "QB", 10), player("qb-b", "QB", 250)], ["QB"]);
    const qbCost = records(team, "usable_replacement_cost").find((row) => row.player_id === "qb-a");

    assert.equal(qbCost?.replacement_player_id, "qb-b");
    assert.equal(qbCost?.replacement_lineup_position, "QB");
    assert.ok(Number(qbCost?.score_difference) > 0);
    assert.equal(qbCost?.replacement_cost, "high");
  });

  it("keeps specialized FLEX replacement choices within each configured eligibility", () => {
    const cases = [
      {
        slots: ["RB", "WRRB_FLEX"],
        roster: [
          player("rb-a", "RB", 1),
          player("rb-b", "RB", 2),
          player("wr-flex", "WR", 50),
          player("te-ineligible", "TE", 3),
        ],
        removed: "rb-a",
        expectedReplacement: "wr-flex",
      },
      {
        slots: ["WR", "REC_FLEX"],
        roster: [
          player("wr-a", "WR", 1),
          player("wr-b", "WR", 2),
          player("te-flex", "TE", 50),
          player("rb-ineligible", "RB", 3),
        ],
        removed: "wr-a",
        expectedReplacement: "te-flex",
      },
      {
        slots: ["QB", "SUPER_FLEX"],
        roster: [player("qb-a", "QB", 1), player("qb-b", "QB", 2), player("rb-super", "RB", 50)],
        removed: "qb-a",
        expectedReplacement: "rb-super",
      },
    ];

    for (const scenario of cases) {
      const team = teamFrom(scenario.roster, scenario.slots);
      const replacement = records(team, "usable_replacement_cost").find((row) => row.player_id === scenario.removed);
      assert.equal(replacement?.replacement_player_id, scenario.expectedReplacement, scenario.slots.join(" + "));
    }
  });

  it("returns a null replacement and preserves positive very_high cost when no usable replacement exists", () => {
    const team = teamFrom(
      [player("only-usable-qb", "QB", 10), player("out-qb", "QB", 1, { injury_status: "Out" })],
      ["QB"],
    );
    const usable = records(team, "usable_replacement_cost");
    const qbCost = usable.find((row) => row.player_id === "only-usable-qb");

    assert.ok(qbCost);
    assert.equal(qbCost?.replacement_player, null);
    assert.equal(qbCost?.replacement_player_id, null);
    assert.ok(Number(qbCost?.score_difference) > 0);
    assert.equal(qbCost?.replacement_cost, "very_high");
    assert.equal(usable.some((row) => row.player_id === "out-qb"), false);
  });

  it("re-optimizes the same legal FLEX assignment after each usable-player removal", () => {
    const team = teamFrom(
      [
        player("rb-a", "RB", 5),
        player("rb-b", "RB", 20),
        player("wr-a", "WR", 10),
        player("wr-b", "WR", 30),
        player("wr-c", "WR", 50),
      ],
      ["RB", "WR", "FLEX"],
    );
    const usable = records(team, "usable_replacement_cost");
    const wrCost = usable.find((row) => row.player_id === "wr-a");
    const availability = team.availability as AnalysisRecord;
    const usableLineup = availability.usable_lineup as Record<string, AnalysisRecord[]>;

    assert.ok(wrCost);
    assert.equal(new Set(assignedIds(usableLineup)).size, assignedIds(usableLineup).length);

    const positions = team.positions as Record<string, AnalysisRecord[]>;
    const remaining = Object.fromEntries(
      Object.entries(positions).map(([position, candidates]) => [
        position,
        candidates.filter((candidate) => candidate.player_id !== "wr-a"),
      ]),
    );
    const expected = calculateOptimalLineup(remaining, parseRosterConfiguration(["RB", "WR", "FLEX"]));
    const score = testLineupScore(expected);
    assert.equal(wrCost?.lineup_score_after, score);
    assert.equal(assignedIds(expected).includes("wr-a"), false);
    assert.equal(assignedIds(expected).includes(wrCost?.replacement_player_id), true);
  });
});
