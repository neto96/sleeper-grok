import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessAvailability } from "./availability.ts";
import {
  buildActionableWaiverAnalysis,
  buildFantasyAnalysis,
  buildWaiverAnalysis,
  classifyLeagueScarcity,
  parseRosterConfiguration,
  type AnalysisRecord,
} from "./engine.ts";
import { buildAnalysisBundle, snapshotJson } from "../format.ts";
import type { LeagueSnapshot, TeamRoster, WaiverPlayer } from "../types.ts";

const NLFL = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN"];

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

function leagueAnalysis(configuration = NLFL): AnalysisRecord {
  const teams: Record<string, AnalysisRecord> = {
    "1": {
      team_name: "Target",
      players: [
        player("qb-a", "QB", 10),
        player("qb-b", "QB", 100),
        player("love", "RB", 10),
        player("jacobs", "RB", 20, { injury_status: "NA" }),
        player("price", "RB", 70, { injury_status: "Out" }),
        player("white", "RB", 250, { injury_status: "Out" }),
        player("rb-depth", "RB", 100),
        player("waddle", "WR", 20, { injury_status: "Questionable" }),
        player("brown", "WR", 40, { status: "Inactive", injury_status: "IR" }),
        player("michael-wilson", "WR", 200, { name: "Michael Wilson" }),
        player("wr-depth", "WR", 220),
        player("laporta", "TE", 45),
      ],
      starters: [
        { player_id: "qb-a" },
        { player_id: "love" },
        { player_id: "jacobs" },
        { player_id: "waddle" },
        { player_id: "michael-wilson" },
        { player_id: "laporta" },
      ],
      reserve: [],
      taxi: [],
    },
    "2": {
      team_name: "Comparison",
      players: [
        player("qb-c", "QB", 10),
        player("qb-d", "QB", 100),
        player("rb-c", "RB", 10, { injury_status: "IR" }),
        player("rb-d", "RB", 100, { injury_status: "Out" }),
        player("rb-e", "RB", 200, { injury_status: "PUP" }),
        player("rb-f", "RB", 250),
        player("wr-c", "WR", 10),
        player("wr-d", "WR", 100),
        player("wr-e", "WR", 200),
        player("wr-f", "WR", 250),
        player("te-c", "TE", 50),
      ],
      starters: [
        { player_id: "qb-c" },
        { player_id: "rb-c" },
        { player_id: "rb-d" },
        { player_id: "wr-c" },
        { player_id: "wr-d" },
        { player_id: "te-c" },
      ],
      reserve: [],
      taxi: [],
    },
  };
  return buildFantasyAnalysis(teams, parseRosterConfiguration(configuration));
}

function team(analysis: AnalysisRecord, rosterId = "1"): AnalysisRecord {
  return (analysis.teams as Record<string, AnalysisRecord>)[rosterId]!;
}

function candidates(result: AnalysisRecord): AnalysisRecord[] {
  return (result.candidates ?? []) as AnalysisRecord[];
}

describe("V3.4 usable league scarcity", () => {
  it("preserves NLFL structural scarcity and adds a separate usable result", () => {
    const analysis = leagueAnalysis();
    const structural = analysis.league_position_scarcity as AnalysisRecord;
    const usable = analysis.league_usable_scarcity as AnalysisRecord;

    assert.deepEqual(
      Object.fromEntries(Object.entries(structural).map(([position, row]) => [position, (row as AnalysisRecord).scarcity])),
      { QB: "moderate", RB: "low", WR: "low", TE: "high" },
    );
    assert.equal((team(analysis).position_need as AnalysisRecord).RB && ((team(analysis).position_need as AnalysisRecord).RB as AnalysisRecord).need, "low");
    assert.equal(((team(analysis).availability as AnalysisRecord).usable_position_need as AnalysisRecord).RB && ((((team(analysis).availability as AnalysisRecord).usable_position_need as AnalysisRecord).RB as AnalysisRecord).need), "thin");
    assert.equal((structural.RB as AnalysisRecord).scarcity, "low");
    assert.equal((usable.RB as AnalysisRecord).scarcity, "high");
    assert.deepEqual(Object.keys(usable).sort(), ["QB", "RB", "TE", "WR"]);
  });

  it("excludes unavailable meaningful supply while retaining Questionable supply", () => {
    const analysis = leagueAnalysis();
    const availability = team(analysis).availability as AnalysisRecord;
    const players = availability.players as AnalysisRecord[];
    const usableRb = ((analysis.league_usable_scarcity as AnalysisRecord).RB ?? {}) as AnalysisRecord;

    assert.equal(players.find((entry) => entry.player_id === "jacobs")?.currently_usable, false);
    assert.equal(players.find((entry) => entry.player_id === "price")?.currently_usable, false);
    assert.equal(players.find((entry) => entry.player_id === "waddle")?.currently_usable, true);
    assert.equal(players.find((entry) => entry.player_id === "waddle")?.availability, "uncertain");
    assert.equal(usableRb.average_meaningful_players, 1.5);
    assert.equal(usableRb.scarcity, "high");
    assert.equal(((analysis.league_usable_scarcity as AnalysisRecord).WR as AnalysisRecord).average_meaningful_players, 3.5);
  });

  it("uses the existing scarcity thresholds and remains independent of FLEX slot counts", () => {
    const thresholds = classifyLeagueScarcity({
      A: { median_depth_score: 8, average_depth_score: 20, average_meaningful_players: 4 },
      B: { median_depth_score: 9, average_depth_score: 20, average_meaningful_players: 1.5 },
      C: { median_depth_score: 9, average_depth_score: 20, average_meaningful_players: 2.5 },
      D: { median_depth_score: 15, average_depth_score: 20, average_meaningful_players: 2.6 },
    });
    assert.deepEqual(
      Object.fromEntries(Object.entries(thresholds).map(([position, row]) => [position, (row as AnalysisRecord).scarcity])),
      { A: "high", B: "high", C: "moderate", D: "low" },
    );

    const withoutFlex = leagueAnalysis(NLFL.filter((slot) => slot !== "FLEX"));
    const withFlex = leagueAnalysis(NLFL);
    assert.deepEqual(withFlex.league_usable_scarcity, withoutFlex.league_usable_scarcity);
  });
});

describe("V3.4 actionable waiver analysis", () => {
  const waiverPool: AnalysisRecord[] = [
    player("baker", "QB", 80, { name: "Baker Mayfield", injury_status: "Out" }),
    player("questionable-wr", "WR", 100, { injury_status: "Questionable" }),
    player("healthy-rb", "RB", 150),
    player("inactive-te", "TE", 30, { status: "Inactive" }),
    player("kicker", "K", 1),
  ];

  it("keeps structural waiver candidates intact and filters unusable candidates only from actionable results", () => {
    const analysis = leagueAnalysis();
    const rawPool = structuredClone(waiverPool);
    const structural = buildWaiverAnalysis(waiverPool, analysis, 1);
    const actionable = buildActionableWaiverAnalysis(waiverPool, analysis, 1);

    assert.ok(candidates(structural).some((candidate) => candidate.player_id === "baker"));
    assert.equal(candidates(actionable).some((candidate) => candidate.player_id === "baker"), false);
    assert.equal(candidates(actionable).some((candidate) => candidate.player_id === "inactive-te"), false);
    assert.equal(candidates(actionable).some((candidate) => candidate.player_id === "kicker"), false);
    assert.deepEqual(waiverPool, rawPool);
    assert.ok(candidates(actionable).every((candidate) => candidate.currently_usable === true));
  });

  it("retains Questionable waiver candidates with shared availability metadata", () => {
    const analysis = leagueAnalysis();
    const actionable = buildActionableWaiverAnalysis(waiverPool, analysis, 1);
    const questionable = candidates(actionable).find((candidate) => candidate.player_id === "questionable-wr");
    const assessment = assessAvailability(waiverPool.find((candidate) => candidate.player_id === "questionable-wr")!);

    assert.ok(questionable);
    assert.equal(questionable?.availability, "uncertain");
    assert.equal(questionable?.reason, "questionable");
    assert.equal(questionable?.currently_usable, true);
    assert.deepEqual(
      { availability: questionable?.availability, reason: questionable?.reason, currently_usable: questionable?.currently_usable },
      assessment,
    );
  });

  it("scores actionable candidates from usable team need and usable league scarcity", () => {
    const analysis = leagueAnalysis();
    const target = team(analysis);
    const availability = target.availability as AnalysisRecord;
    const structuralNeed = target.position_need as AnalysisRecord;
    const usableNeed = availability.usable_position_need as AnalysisRecord;
    const structuralScarcity = analysis.league_position_scarcity as AnalysisRecord;
    const usableScarcity = analysis.league_usable_scarcity as AnalysisRecord;

    assert.notEqual((structuralNeed.RB as AnalysisRecord).need, (usableNeed.RB as AnalysisRecord).need);
    assert.notEqual((structuralScarcity.RB as AnalysisRecord).scarcity, (usableScarcity.RB as AnalysisRecord).scarcity);

    const activeRb = [waiverPool.find((candidate) => candidate.player_id === "healthy-rb")!];
    const structural = candidates(buildWaiverAnalysis(activeRb, analysis, 1))[0]!;
    const actionable = candidates(buildActionableWaiverAnalysis(activeRb, analysis, 1))[0]!;
    assert.equal(actionable.team_need, (usableNeed.RB as AnalysisRecord).need);
    assert.equal(actionable.league_scarcity, (usableScarcity.RB as AnalysisRecord).scarcity);
    assert.equal(structural.team_need, (structuralNeed.RB as AnalysisRecord).need);
    assert.equal(structural.league_scarcity, (structuralScarcity.RB as AnalysisRecord).scarcity);
    assert.notEqual(actionable.waiver_value_score, structural.waiver_value_score);
  });

  it("exports actionable waiver results alongside the unchanged structural result", () => {
    const slot = (playerId: string, position: string, searchRank: number, injuryStatus: string | null = null): TeamRoster["bench"][number] => ({
      playerId,
      name: playerId,
      position,
      slot: "BN",
      nflTeam: "TST",
      injuryStatus,
      status: "Active",
      number: null,
      searchRank,
    });
    const target = {
      rosterId: 1,
      teamName: "Bundle team",
      ownerName: "Owner",
      username: "owner",
      avatar: null,
      isCommissioner: false,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      waiverPosition: 1,
      faabUsed: 0,
      faabBudget: 0,
      streak: null,
      starters: [],
      bench: [slot("qb", "QB", 10), slot("rb", "RB", 10)],
      reserve: [],
      taxi: [],
    } satisfies TeamRoster;
    const pool: WaiverPlayer[] = [
      { playerId: "baker", name: "Baker Mayfield", position: "QB", nflTeam: "TB", injuryStatus: "Out", status: "Active", searchRank: 80 },
      { playerId: "q-wr", name: "Questionable WR", position: "WR", nflTeam: "TST", injuryStatus: "Questionable", status: "Active", searchRank: 100 },
    ];
    const bundle = buildAnalysisBundle([target], [1], ["QB", "RB"], pool, 1);
    const json = snapshotJson({
      snapshotVersion: "3.2",
      fantasyAnalysis: bundle.fantasyAnalysis,
      waiverAnalysis: bundle.waiverAnalysis,
      actionableWaiverAnalysis: bundle.actionableWaiverAnalysis,
      analysisWaiverPool: bundle.analysisWaiverPool,
      markdown: "",
    } as LeagueSnapshot);

    assert.ok("actionableWaiverAnalysis" in bundle);
    assert.ok("actionable_waiver_analysis" in json);
    assert.ok((json.waiver_analysis as AnalysisRecord).candidates);
    assert.ok((json.actionable_waiver_analysis as AnalysisRecord).candidates);
    assert.equal((bundle.analysisWaiverPool as AnalysisRecord[]).length, 2);
  });
});
