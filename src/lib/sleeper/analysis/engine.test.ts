import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFantasyAnalysis,
  buildWaiverAnalysis,
  calculateOptimalLineup,
  calculateRosterSurplus,
  classifyLeagueScarcity,
  fantasyValueTier,
  parseRosterConfiguration,
  type AnalysisRecord,
  type JsonValue,
} from "./engine.ts";

const NLFL = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN"];

function rankPlayer(id: string, position: string, rank: number, extra: AnalysisRecord = {}) {
  return { player_id: id, name: id, position, search_rank: rank, ...extra };
}

function tierPlayer(id: string, position: string, tier = "elite", importance = 0) {
  return { player_id: id, position, fantasy_value_tier: tier, importance_score: importance };
}

function optimize(slots: string[], players: AnalysisRecord[]) {
  const positions: Record<string, AnalysisRecord[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const player of players) (positions[player.position as string] ??= []).push(player);
  return calculateOptimalLineup(positions, parseRosterConfiguration(slots));
}

function ids(lineup: Record<string, AnalysisRecord[]>) {
  return Object.fromEntries(
    Object.entries(lineup).map(([slot, players]) => [slot, players.map((player) => player.player_id)]),
  );
}

const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

function assertLegalLineup(lineup: Record<string, AnalysisRecord[]>, players: AnalysisRecord[]) {
  const positionById = new Map(players.map((player) => [player.player_id, String(player.position)]));
  const used: JsonValue[] = [];
  for (const [slot, assigned] of Object.entries(lineup)) {
    const eligible = SLOT_ELIGIBILITY[slot];
    if (!eligible) continue;
    for (const player of assigned) {
      const position = positionById.get(player.player_id) ?? String(player.position);
      assert.ok(eligible.includes(position), `${String(player.player_id)} (${position}) is illegal for ${slot}`);
      used.push(player.player_id);
    }
  }
  assert.equal(new Set(used).size, used.length);
}

describe("V3.3 roster configuration", () => {
  it("parses the standard NLFL configuration", () => {
    assert.deepEqual(parseRosterConfiguration(NLFL), {
      direct_slots: { DEF: 1, K: 1, QB: 1, RB: 2, TE: 1, WR: 2 },
      flex_slots: { FLEX: { count: 1, eligible_positions: ["RB", "WR", "TE"] } },
      nonstarter_slots: { BN: 6 },
      unrecognized_slots: {},
    });
  });

  it("keeps bench out of starting requirements and preserves unknown slots", () => {
    const parsed = parseRosterConfiguration(["BN", "BN", "WR", "WEIRD", "IDP_FLEX"]);
    assert.deepEqual(parsed.direct_slots, { WR: 1 });
    assert.deepEqual(parsed.nonstarter_slots, { BN: 2 });
    assert.equal((parsed.direct_slots as AnalysisRecord).BN, undefined);
    assert.deepEqual(parsed.unrecognized_slots, { WEIRD: 1 });
    assert.deepEqual((parsed.flex_slots as AnalysisRecord).IDP_FLEX, {
      count: 1,
      eligible_positions: ["DL", "LB", "DB"],
    });
  });
});

describe("V3.3 tiers and scarcity", () => {
  it("keeps the search-rank tier boundaries", () => {
    const cases: [JsonValue, string][] = [
      [null, "unknown"],
      ["not-a-rank", "unknown"],
      [0, "elite"],
      [50, "elite"],
      [51, "strong"],
      [120, "strong"],
      [121, "useful"],
      [250, "useful"],
      [251, "fringe"],
      [400, "fringe"],
      [401, "deep_waiver"],
    ];
    for (const [rank, expected] of cases) {
      assert.equal(fantasyValueTier({ search_rank: rank }), expected);
    }
  });

  it("keeps league scarcity thresholds", () => {
    const cases: [number, number, string][] = [
      [8, 9, "high"],
      [20, 1.5, "high"],
      [14, 3, "moderate"],
      [20, 2.5, "moderate"],
      [15, 2.6, "low"],
    ];
    for (const [medianDepth, meaningful, expected] of cases) {
      const result = classifyLeagueScarcity({
        RB: {
          median_depth_score: medianDepth,
          average_depth_score: medianDepth,
          average_meaningful_players: meaningful,
        },
      });
      assert.equal((result.RB as AnalysisRecord).scarcity, expected);
    }
  });
});

describe("V3.3 optimal lineup", () => {
  it("fills the NLFL offense and leaves K/DEF out of the optimizer", () => {
    const roster = {
      "3": {
        team_name: "Test Team",
        owner: "Test Owner",
        players: [
          rankPlayer("qb", "QB", 10),
          rankPlayer("rb1", "RB", 20),
          rankPlayer("rb2", "RB", 30),
          rankPlayer("rb3", "RB", 40),
          rankPlayer("wr1", "WR", 50),
          rankPlayer("wr2", "WR", 60),
          rankPlayer("wr3", "WR", 70),
          rankPlayer("te1", "TE", 80),
          rankPlayer("k", "K", 90),
          rankPlayer("def", "DEF", 100),
        ],
        starters: [],
        reserve: [],
        taxi: [],
      },
    };
    const analysis = buildFantasyAnalysis(roster, parseRosterConfiguration(NLFL));
    assert.equal(analysis.snapshot_version, undefined);
    assert.deepEqual(analysis.lineup_requirements, {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      K: 1,
      DEF: 1,
      FLEX: 1,
    });
    assert.deepEqual(analysis.flex_positions, ["RB", "TE", "WR"]);
    const team = (analysis.teams as Record<string, AnalysisRecord>)["3"]!;
    const lineup = team.optimal_lineup as Record<string, AnalysisRecord[]>;
    assert.deepEqual(ids(lineup), {
      QB: ["qb"],
      RB: ["rb1", "rb2"],
      WR: ["wr1", "wr2"],
      TE: ["te1"],
      FLEX: ["rb3"],
    });
    assert.equal(lineup.K, undefined);
    assert.equal(lineup.DEF, undefined);
    const coverage = team.lineup_coverage as AnalysisRecord;
    assert.equal((coverage.K as AnalysisRecord).required, 1);
    assert.equal((coverage.DEF as AnalysisRecord).required, 1);
    assert.equal((coverage.FLEX as AnalysisRecord).coverage, 1);
    const summary = coverage.summary as AnalysisRecord;
    assert.equal(summary.supported_configured_slots, 9);
    assert.equal(summary.covered_slots, 9);
  });

  it("respects WRRB_FLEX, REC_FLEX, SUPER_FLEX, and mixed slots", () => {
    const wrrbPlayers = [
      tierPlayer("te1", "TE", "elite", 50),
      tierPlayer("wr1", "WR", "useful", 1),
    ];
    const wrrb = optimize(["WRRB_FLEX"], wrrbPlayers);
    assert.deepEqual(ids(wrrb), { QB: [], RB: [], WR: [], TE: [], FLEX: [], WRRB_FLEX: ["wr1"] });
    assert.equal(wrrb.WRRB_FLEX?.some((player) => player.position === "TE"), false);
    assertLegalLineup(wrrb, wrrbPlayers);

    const recPlayers = [
      tierPlayer("rb1", "RB", "elite", 50),
      tierPlayer("te1", "TE", "useful", 1),
    ];
    const rec = optimize(["REC_FLEX"], recPlayers);
    assert.deepEqual(ids(rec), { QB: [], RB: [], WR: [], TE: [], FLEX: [], REC_FLEX: ["te1"] });
    assert.equal(rec.REC_FLEX?.some((player) => player.position === "RB"), false);
    assertLegalLineup(rec, recPlayers);
    const superFlexPlayers = [
      tierPlayer("qb1", "QB", "elite", 20),
      tierPlayer("qb2", "QB", "strong", 10),
      tierPlayer("rb1", "RB", "useful", 5),
    ];
    const superFlex = optimize(["QB", "SUPER_FLEX"], superFlexPlayers);
    assert.deepEqual(ids(superFlex), {
      QB: ["qb1"],
      RB: [],
      WR: [],
      TE: [],
      FLEX: [],
      SUPER_FLEX: ["qb2"],
    });
    assert.equal(superFlex.SUPER_FLEX?.[0]?.position, "QB");
    assertLegalLineup(superFlex, superFlexPlayers);

    const mixedPlayers = [
      tierPlayer("rb1", "RB", "elite", 40),
      tierPlayer("rb2", "RB", "strong", 20),
      tierPlayer("wr1", "WR", "elite", 30),
      tierPlayer("wr2", "WR", "useful", 10),
      tierPlayer("te1", "TE", "strong", 15),
    ];
    const mixed = optimize(["RB", "FLEX", "WRRB_FLEX", "REC_FLEX"], mixedPlayers);
    assert.deepEqual(ids(mixed), {
      QB: [],
      RB: ["rb1"],
      WR: [],
      TE: [],
      FLEX: ["wr1"],
      REC_FLEX: ["te1"],
      WRRB_FLEX: ["rb2"],
    });
    assertLegalLineup(mixed, mixedPlayers);
    assert.equal(mixed.WRRB_FLEX?.some((player) => player.position === "TE"), false);
    assert.equal(mixed.REC_FLEX?.some((player) => player.position === "RB"), false);

    const solvedTogether = [
      tierPlayer("qb1", "QB", "elite", 50),
      tierPlayer("qb2", "QB", "strong", 40),
      tierPlayer("rb1", "RB", "elite", 45),
      tierPlayer("rb2", "RB", "useful", 5),
      tierPlayer("wr1", "WR", "elite", 35),
      tierPlayer("te1", "TE", "elite", 60),
    ];
    const together = optimize(["QB", "RB", "FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX"], solvedTogether);
    assert.deepEqual(ids(together), {
      QB: ["qb1"],
      RB: ["rb1"],
      WR: [],
      TE: [],
      FLEX: ["te1"],
      REC_FLEX: ["wr1"],
      SUPER_FLEX: ["qb2"],
      WRRB_FLEX: ["rb2"],
    });
    assert.equal(together.SUPER_FLEX?.[0]?.position, "QB");
    assert.equal(together.WRRB_FLEX?.some((player) => player.position === "TE"), false);
    assert.equal(together.REC_FLEX?.some((player) => player.position === "RB"), false);
    assertLegalLineup(together, solvedTogether);
  });

  it("assigns each player once and allows underfilled slots", () => {
    const unique = optimize(["RB", "RB", "FLEX"], [
      tierPlayer("same", "RB", "elite", 50),
      { ...tierPlayer("same", "WR", "elite", 50), position: "WR" },
      tierPlayer("wr1", "WR", "useful", 1),
    ]);
    const used = Object.values(unique).flat().map((player) => player.player_id);
    assert.equal(used.filter((id) => id === "same").length, 1);
    const under = optimize(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"], [
      tierPlayer("qb", "QB", "elite", 1),
    ]);
    assert.deepEqual(ids(under), {
      QB: ["qb"],
      RB: [],
      WR: [],
      TE: [],
      FLEX: [],
    });
  });

  it("does not select K or DEF", () => {
    const lineup = optimize(["QB", "K", "DEF", "FLEX"], [
      { player_id: "k", position: "K", fantasy_value_tier: "elite", importance_score: 99 },
      { player_id: "def", position: "DEF", fantasy_value_tier: "elite", importance_score: 99 },
      tierPlayer("rb", "RB", "useful", 1),
    ]);
    assert.deepEqual(ids(lineup).FLEX, ["rb"]);
    assert.equal(JSON.stringify(lineup).includes('"k"'), false);
  });
});

describe("V3.3 roster surplus", () => {
  it("counts one shared FLEX once when RB and WR both can fill it", () => {
    const slots = ["RB", "RB", "FLEX"];
    const players = [
      { player_id: "rb1", name: "rb1", position: "RB", fantasy_value_tier: "useful" },
      { player_id: "rb2", name: "rb2", position: "RB", fantasy_value_tier: "useful" },
      { player_id: "rb3", name: "rb3", position: "RB", fantasy_value_tier: "useful" },
      { player_id: "wr1", name: "wr1", position: "WR", fantasy_value_tier: "useful" },
    ];
    const configuration = parseRosterConfiguration(slots);
    const positions: Record<string, AnalysisRecord[]> = { QB: [], RB: [], WR: [], TE: [] };
    for (const player of players) (positions[player.position] ??= []).push(player);
    const surplus = calculateRosterSurplus(
      { positions, optimal_lineup: calculateOptimalLineup(positions, configuration) },
      configuration,
    );
    const excess = surplus.filter((player) => player.surplus_type === "surplus" || player.surplus_type === "replaceable");
    assert.equal(excess.length, 1);
    assert.deepEqual(
      surplus.map((player) => ({
        player_id: player.player_id,
        surplus_type: player.surplus_type,
        in_optimal_lineup: player.in_optimal_lineup,
      })),
      [
        { player_id: "rb1", surplus_type: "needed", in_optimal_lineup: true },
        { player_id: "rb2", surplus_type: "needed", in_optimal_lineup: true },
        { player_id: "rb3", surplus_type: "needed", in_optimal_lineup: false },
        { player_id: "wr1", surplus_type: "surplus", in_optimal_lineup: true },
      ],
    );
  });
});

describe("V3.3 need, replacement cost, and waivers", () => {
  it("uses configured direct demand for need and replacement cost", () => {
    const rosters = {
      "1": {
        team_name: "A",
        owner: "A",
        players: [rankPlayer("a-rb1", "RB", 10), rankPlayer("a-rb2", "RB", 20), rankPlayer("a-qb", "QB", 30)],
        starters: [{ player_id: "a-rb1" }, { player_id: "a-rb2" }, { player_id: "a-qb" }],
        reserve: [],
        taxi: [],
      },
      "3": {
        team_name: "Mine",
        owner: "Me",
        players: [
          rankPlayer("m-rb", "RB", 300),
          rankPlayer("m-qb", "QB", 10),
          rankPlayer("k", "K", 1),
          rankPlayer("def", "DEF", 1),
        ],
        starters: [{ player_id: "m-qb" }],
        reserve: [],
        taxi: [],
      },
    };
    const analysis = buildFantasyAnalysis(rosters, parseRosterConfiguration(["QB", "RB", "RB", "FLEX"]));
    const mine = (analysis.teams as Record<string, AnalysisRecord>)["3"]!;
    const need = mine.position_need as Record<string, AnalysisRecord>;
    assert.equal(need.RB?.need, "high");
    assert.match(String(need.RB?.reason), /2 required/);
    const costs = mine.roster_replacement_cost as AnalysisRecord[];
    const qb = costs.find((row) => row.player_id === "m-qb");
    assert.ok(qb);
    assert.equal(qb?.lineup_score_before, 710);
    assert.equal(qb?.lineup_score_after, 203);
    assert.equal(qb?.score_difference, 507);
    assert.equal(qb?.replacement_cost, "very_high");
    assert.equal(qb?.replacement_player_id, null);
    assert.equal(
      costs.some(
        (row) => row.position === "K" || row.position === "DEF" || row.player_id === "k" || row.player_id === "def",
      ),
      false,
    );
    const scarcity = analysis.league_position_scarcity as Record<string, AnalysisRecord>;
    const waiver = buildWaiverAnalysis(
      [
        { player_id: "w1", name: "Waiver WR", position: "WR", team: "SYN", search_rank: 90 },
        { player_id: "k1", name: "Kicker", position: "K", team: "SYN", search_rank: 1 },
        { player_id: "rbw", name: "Waiver RB", position: "RB", team: "SYN", search_rank: 200 },
      ],
      analysis,
      3,
    );
    assert.equal(waiver.available, true);
    const candidates = waiver.candidates as AnalysisRecord[];
    assert.equal(candidates.some((row) => row.position === "K"), false);
    assert.equal(candidates[0]?.team_need, need[String(candidates[0]?.position)]?.need);
    assert.equal(candidates.find((row) => row.player_id === "rbw")?.league_scarcity, scarcity.RB?.scarcity);
    assert.ok(candidates.some((row) => row.player_id === "rbw" && row.team_need === "high"));
  });
});
