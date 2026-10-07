import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMarkdown, buildAnalysisBundle } from "./format.ts";
import type { LeagueSnapshot, PlayerSlot, TeamRoster, WaiverPlayer } from "./types.ts";
import type { AnalysisRecord } from "./analysis/engine.ts";

function player(
  playerId: string,
  name: string,
  position: string,
  injuryStatus: string | null = null,
  status: string | null = "Active",
  searchRank: number | null = 50,
): PlayerSlot {
  return {
    playerId,
    name,
    position,
    slot: "BN",
    nflTeam: "TST",
    injuryStatus,
    status,
    number: null,
    searchRank,
  };
}

function snapshot(): LeagueSnapshot {
  const starters = [
    player("qb", "Joe Burrow", "QB"),
    player("love", "Jeremiyah Love", "RB", null, "Active", 20),
    player("jacobs", "Josh Jacobs", "RB", "NA", "Active", 30),
    player("waddle", "Jaylen Waddle", "WR", "Questionable", "Active", 70),
    player("brown", "A.J. Brown", "WR", "IR", "Inactive", 40),
    player("laporta", "Sam LaPorta", "TE", null, "Active", 45),
  ];
  const roster: TeamRoster = {
    rosterId: 1,
    teamName: "Example Team",
    ownerName: "Owner",
    username: "owner",
    avatar: null,
    isCommissioner: false,
    wins: 2,
    losses: 1,
    ties: 0,
    pointsFor: 300,
    pointsAgainst: 250,
    waiverPosition: 3,
    faabUsed: 0,
    faabBudget: 100,
    streak: null,
    starters,
    bench: [player("rb-bench", "RB Bench", "RB", null, "Active", 180)],
    reserve: [],
    taxi: [],
  };
  const waiverPlayers: WaiverPlayer[] = [
    { playerId: "baker", name: "Baker Mayfield", position: "QB", nflTeam: "TB", injuryStatus: "Out", status: "Active", searchRank: 60 },
    { playerId: "q-wr", name: "Questionable WR", position: "WR", nflTeam: "TST", injuryStatus: "Questionable", status: "Active", searchRank: 90 },
    { playerId: "healthy-rb", name: "Healthy RB", position: "RB", nflTeam: "TST", injuryStatus: null, status: "Active", searchRank: 100 },
  ];
  const bundle = buildAnalysisBundle(
    [roster],
    [1],
    ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN"],
    waiverPlayers,
    1,
  );
  const waiverByPosition = Object.fromEntries(
    ["QB", "RB", "WR", "TE"].map((position) => [
      position,
      waiverPlayers
        .filter((candidate) => candidate.position === position)
        .map((candidate) => ({ ...candidate, playerId: candidate.playerId, nflTeam: candidate.nflTeam })),
    ]),
  );
  return {
    fetchedAt: "2026-10-05T12:00:00.000Z",
    leagueId: "league-test",
    leagueName: "Test League",
    season: "2026",
    seasonType: "regular",
    status: "in_season",
    sport: "nfl",
    scoring: "PPR",
    week: 5,
    displayWeek: 5,
    rosterSlots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
    benchSlots: 2,
    playoffTeams: 4,
    avatar: null,
    myRosterId: 1,
    waiverSystem: "FAAB",
    teams: [roster],
    waiverOrder: [{ rosterId: 1, teamName: "Example Team", ownerName: "Owner", waiverPosition: 3 }],
    waiverByPosition,
    transactions: [],
    matchups: [],
    notes: ["Synthetic fixture."],
    ...bundle,
    markdown: "",
    filename: "test.md",
    jsonFilename: "test.json",
  } as LeagueSnapshot;
}

function markdown(): { text: string; snapshot: LeagueSnapshot } {
  const data = snapshot();
  return { text: buildMarkdown(data), snapshot: data };
}

describe("V3.4 Fantasy Analysis Markdown", () => {
  it("pairs structural and usable scarcity, need, and strength/depth", () => {
    const { text } = markdown();
    assert.match(text, /### League Scarcity[\s\S]*QB: structural [a-z_]+ · usable [a-z_]+/);
    assert.match(text, /RB: structural low · usable moderate/);
    assert.match(text, /#### Position Need[\s\S]*RB: structural moderate · usable thin/);
    assert.match(text, /#### Strength & Depth[\s\S]*RB: structural [^\n]+ · usable [^\n]+/);
  });

  it("lists unusable players but leaves Questionable players out of unavailable roster output", () => {
    const { text } = markdown();
    const availability = text.split("#### Roster Availability")[1]?.split("#### Position Need")[0] ?? "";
    assert.match(availability, /Josh Jacobs — NA — unavailable/);
    assert.match(availability, /A\.J\. Brown — IR — unavailable/);
    assert.doesNotMatch(availability, /Jaylen Waddle/);
  });

  it("shows separate structural and usable lineups, preserving unavailable structural selections and empty slots", () => {
    const { text, snapshot: data } = markdown();
    assert.match(text, /#### Structural Optimal Lineup/);
    assert.match(text, /#### Currently Usable Lineup/);
    const structural = text.split("#### Structural Optimal Lineup")[1]?.split("#### Currently Usable Lineup")[0] ?? "";
    const usable = text.split("#### Currently Usable Lineup")[1]?.split("\*\*Protect\*\*")[0] ?? "";
    assert.match(structural, /Josh Jacobs/);
    assert.doesNotMatch(usable, /Josh Jacobs|Jadarian Price|A\.J\. Brown/);
    assert.match(usable, /Empty/);
    const teamAnalysis = (data.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const structuralLineup = teamAnalysis.optimal_lineup as Record<string, AnalysisRecord[]>;
    assert.ok(structuralLineup.RB?.some((candidate) => candidate.name === "Josh Jacobs"));
  });

  it("pairs replacement risk and protects unavailable players with availability context", () => {
    const { text } = markdown();
    assert.match(text, /#### Replacement Risk/);
    assert.match(text, /\| Player \| Structural Loss \| Structural Replacement \| Usable Loss \| Usable Replacement \|/);
    assert.match(text, /\| Josh Jacobs \| [^|]+ \| none \| — \| — \|/);
    assert.match(text, /\*\*Protect\*\*[\s\S]*A\.J\. Brown[^\n]*IR \/ unavailable/);
  });

  it("keeps structural and actionable surplus separate", () => {
    const { text } = markdown();
    assert.match(text, /#### Structural Surplus/);
    assert.match(text, /#### Actionable Surplus/);
    assert.match(text, /Josh Jacobs/);
  });

  it("renders engine recommendations near the top of the fantasy analysis", () => {
    const data = snapshot();
    const teams = data.fantasyAnalysis.teams as Record<string, AnalysisRecord>;
    teams["1"]!.recommendations = {
      actions: [{
        category: "bye_week",
        urgency: "act_now",
        position_or_slot: "TE",
        week: 6,
        title: "Add a TE for Week 6",
        reason: "Sam LaPorta is unavailable and no usable replacement is rostered.",
        related_player_ids: ["laporta"],
      }],
    };
    const text = buildMarkdown(data);
    const nextMoves = text.split("#### Recommended Next Moves")[1]?.split("#### Roster Availability")[0] ?? "";
    assert.match(nextMoves, /ACT NOW — TE, Week 6/);
    assert.match(nextMoves, /Sam LaPorta is unavailable/);
  });

  it("prioritizes actionable waivers while retaining structural context and the raw pool", () => {
    const { text, snapshot: data } = markdown();
    const actionable = text.split("### Actionable Recommendations")[1]?.split("### Structural Context")[0] ?? "";
    assert.match(text, /## Waiver Analysis/);
    assert.match(actionable, /Questionable WR[^\n]*Questionable/);
    assert.doesNotMatch(actionable, /Baker Mayfield/);
    const structural = data.waiverAnalysis.candidates as AnalysisRecord[];
    assert.ok(structural.some((candidate) => candidate.name === "Baker Mayfield"));
    assert.match(text, /Structural waiver analysis retains \d+ candidate\(s\) and may include currently unavailable players/);
    assert.match(text, /## Available Waiver \/ Free-Agent Players/);
    assert.match(text, /## Standings/);
    assert.match(text, /## Rosters/);
    assert.match(text, /## Recent Transactions/);
    assert.match(text, /## Matchups/);
    assert.match(text, /## Data Notes/);
  });
});
