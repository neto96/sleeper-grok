import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisRecord } from "./engine.ts";
import {
  matchExternalPlayer,
  normalizeMatchupRating,
  normalizePlayerName,
  normalizeWeeklyContext,
  resolveWeeklyContexts,
  type ExternalWeeklyPlayer,
  type PlayerIdentity,
  type WeeklySourceObservation,
} from "./weekly-context.ts";
import { createWeeklyContextLoader, WEEKLY_CONTEXT_TTL_MS } from "./weekly-context.server.ts";
import { buildAnalysisBundle } from "../format.ts";
import type { PlayerSlot, TeamRoster } from "../types.ts";

function external(overrides: Partial<ExternalWeeklyPlayer> = {}): ExternalWeeklyPlayer {
  return { name: "A.J. Brown", team: "PHI", position: "WR", week: 6, projected_points: 14, rank: 20, pos_rank: "WR8", opponent_id: "DAL", ...overrides };
}

function source(record: ExternalWeeklyPlayer, provider: string): WeeklySourceObservation {
  return { provider, capability: "weekly-rankings", record };
}

const sleeperPlayer: PlayerIdentity = {
  sleeperId: "sleeper-1",
  name: "A.J. Brown Jr.",
  team: "PHI",
  position: "WR",
  fantasyDataId: "fd-1",
};

describe("V3.5 weekly context identity and normalization", () => {
  it("prefers the stable external provider ID", () => {
    const rows = [external({ player_id: "fd-1", name: "Different Display", team: "NYJ" })];
    const result = matchExternalPlayer(sleeperPlayer, rows);
    assert.equal(result.status, "matched");
    assert.equal(result.method, "provider_id");
  });

  it("matches normalized name, team and position", () => {
    const result = matchExternalPlayer(
      { sleeperId: "2", name: "A.J. Brown", team: "PHI", position: "WR" },
      [external({ player_id: "external-2", name: "AJ Brown", team: "phi" })],
    );
    assert.equal(result.status, "matched");
    assert.equal(result.method, "name_team_position");
  });

  it("normalizes punctuation, accents, spacing and suffixes", () => {
    assert.equal(normalizePlayerName("D’Andre Swift, Jr."), "dandreswift");
    assert.equal(normalizePlayerName("A.J. Brown III"), "ajbrown");
    const result = matchExternalPlayer(
      { sleeperId: "3", name: "D'Andre Swift Jr.", team: "CHI", position: "RB" },
      [external({ name: "D Andre Swift", team: "CHI", position: "RB" })],
    );
    assert.equal(result.status, "matched");
  });

  it("uses name and position only when the fallback is unique", () => {
    const result = matchExternalPlayer(
      { sleeperId: "4", name: "A.J. Brown", team: "UNKNOWN", position: "WR" },
      [external({ name: "AJ Brown", team: "PHI" })],
    );
    assert.equal(result.method, "name_position_fallback");
  });

  it("reports ambiguous matches without merging them", () => {
    const result = matchExternalPlayer(
      { sleeperId: "5", name: "A.J. Brown", team: null, position: "WR" },
      [external({ player_id: "one" }), external({ player_id: "two" })],
    );
    assert.equal(result.status, "ambiguous");
    assert.equal(result.record, null);
    assert.match(result.reason ?? "", /multiple records/);
  });

  it("assigns low confidence to a one-source projection", () => {
    const context = normalizeWeeklyContext(6, [source(external(), "one")]);
    assert.equal(context.sources, 1);
    assert.equal(context.projection.consensus_points, 14);
    assert.equal(context.confidence.level, "low");
  });

  it("assigns high confidence when at least three projections cluster", () => {
    const context = normalizeWeeklyContext(6, [
      source(external({ projected_points: 14 }), "one"),
      source(external({ projected_points: 14.5 }), "two"),
      source(external({ projected_points: 14.2 }), "three"),
      source(external({ projected_points: 14.3 }), "four"),
    ]);
    assert.equal(context.projection.consensus_points, 14.25);
    assert.equal(context.projection.low, 14);
    assert.equal(context.projection.high, 14.5);
    assert.equal(context.confidence.level, "high");
  });

  it("keeps two-source close projections at medium and divergent projections low", () => {
    const close = normalizeWeeklyContext(6, [source(external({ projected_points: 14 }), "one"), source(external({ projected_points: 15 }), "two")]);
    const divergent = normalizeWeeklyContext(6, [source(external({ projected_points: 8 }), "one"), source(external({ projected_points: 20 }), "two")]);
    assert.equal(close.confidence.level, "medium");
    assert.equal(divergent.confidence.level, "low");
  });

  it("preserves missing projections as null and confidence unknown rather than zero", () => {
    const context = normalizeWeeklyContext(6, [source(external({ projected_points: null }), "one")]);
    assert.equal(context.projection.consensus_points, null);
    assert.equal(context.projection.low, null);
    assert.equal(context.projection.high, null);
    assert.equal(context.confidence.level, "unknown");
  });

  it("normalizes explicit matchup labels and leaves absent matchup data unknown", () => {
    assert.equal(normalizeMatchupRating("Very Tough"), "very_tough");
    assert.equal(normalizeMatchupRating("above average"), "good");
    assert.equal(normalizeMatchupRating(null), "unknown");
    assert.deepEqual(normalizeWeeklyContext(6, [source(external(), "one")]).matchup, { rating: "unknown", score: null });
  });

  it("returns explicit unmatched/ambiguous resolution states", () => {
    const players = [
      { sleeperId: "missing", name: "Nobody", team: "TST", position: "WR" },
      { sleeperId: "ambiguous", name: "A.J. Brown", team: null, position: "WR" },
    ];
    const result = resolveWeeklyContexts(players, [external(), external({ player_id: "duplicate" })], 6, "fixture", "rankings");
    assert.equal(result.missing?.match_status, "unmatched");
    assert.equal(result.ambiguous?.match_status, "ambiguous");
    assert.equal(result.ambiguous?.context, null);
  });
});

describe("V3.5 weekly context server adapter", () => {
  function response(week = 6) {
    return new Response(JSON.stringify({
      success: true,
      data: {
        alexandria: [{ provider: "fantasydata-com", data: { week, observed_at_ms: 1790968311987, players: [external({ player_id: "fd-1" })] } }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  it("does not call the provider when the Firecrawl credential is absent", async () => {
    let calls = 0;
    const load = createWeeklyContextLoader(async () => { calls += 1; return response(); });
    const result = await load({ apiKey: undefined, season: "2026", week: 6, scoring: "PPR", players: [sleeperPlayer] });
    assert.equal(result.failure, "missing_credentials");
    assert.equal(calls, 0);
  });

  it("caches a successful provider response for the configured TTL", async () => {
    let calls = 0;
    let now = 100;
    const load = createWeeklyContextLoader(async () => { calls += 1; return response(); }, () => now);
    const request = { apiKey: "fixture-only", season: "2026", week: 6, scoring: "PPR" as const, players: [sleeperPlayer] };
    const first = await load(request);
    now += WEEKLY_CONTEXT_TTL_MS - 1;
    const second = await load(request);
    const otherLeague = await load({
      ...request,
      players: [{ ...sleeperPlayer, sleeperId: "other-league-player" }],
    });
    assert.equal(first.available, true);
    assert.equal(second.available, true);
    assert.ok(otherLeague.byPlayerId["other-league-player"]);
    assert.equal(otherLeague.byPlayerId["sleeper-1"], undefined);
    assert.equal(calls, 1);
    assert.equal(second.byPlayerId["sleeper-1"]?.context?.week, 6);
  });

  it("contains provider failures, briefly caches them, and allows offline analysis", async () => {
    let calls = 0;
    const load = createWeeklyContextLoader(async () => { calls += 1; throw new Error("fixture failure"); });
    const request = { apiKey: "fixture-only", season: "2026", week: 6, scoring: "PPR" as const, players: [sleeperPlayer] };
    const first = await load(request);
    const second = await load(request);
    assert.equal(first.failure, "fetch_failed");
    assert.equal(second.failure, "fetch_failed");
    assert.equal(calls, 1);
    const bundle = buildAnalysisBundle([teamFixture()], [1], ["QB", "RB", "WR", "TE", "BN"], [], 1);
    assert.equal(bundle.snapshotVersion, "3.2");
    assert.ok((bundle.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]);
  });
});

function slot(playerId: string, name: string, position: string): PlayerSlot {
  return { playerId, name, position, slot: "BN", nflTeam: "PHI", injuryStatus: null, status: "Active", number: null, searchRank: 20 };
}

function teamFixture(): TeamRoster {
  return {
    rosterId: 1, teamName: "Fixture", ownerName: "Owner", username: "owner", avatar: null,
    isCommissioner: false, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    waiverPosition: 1, faabUsed: 0, faabBudget: 100, streak: null,
    starters: [slot("qb", "Quarterback", "QB")],
    bench: [slot("wr", "A.J. Brown", "WR")], reserve: [], taxi: [],
  };
}
