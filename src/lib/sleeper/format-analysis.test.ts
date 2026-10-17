import { APP_VERSION, CHANGELOG } from "./release.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMarkdown, buildAnalysisBundle, applyMyRoster, snapshotJson } from "./format.ts";
import type { LeagueSnapshot, PlayerSlot, TeamRoster, WaiverPlayer } from "./types.ts";
import { buildActionableWaiverAnalysis, type AnalysisRecord } from "./analysis/engine.ts";
import { priorityWaiverGroups } from "./priority-waivers.ts";

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
    assert.match(text, /### League Scarcity[\s\S]*QB: all roster: [^\n]+ · available players: [^\n]+/);
    assert.match(text, /RB: all roster: Plentiful league depth · available players: Limited league depth/);
    assert.match(text, /#### Position Need[\s\S]*RB: all roster: Some need · available players: Could use depth/);
    assert.match(text, /#### Strength & Depth[\s\S]*RB: all roster: [^\n]+ · available players: [^\n]+/);
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
    assert.match(text, /#### Best Lineup \(All Roster\)/);
    assert.match(text, /#### Availability-Eligible Lineup/);
    assert.match(text, /bye weeks are not excluded/);
    assert.match(text, /week-specific gaps, including byes/);
    assert.doesNotMatch(text, /Currently Usable Lineup/);
    const structural = text.split("#### Best Lineup (All Roster)")[1]?.split("#### Availability-Eligible Lineup")[0] ?? "";
    const usable = text.split("#### Availability-Eligible Lineup")[1]?.split("\*\*Protect\*\*")[0] ?? "";
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
    assert.match(text, /\| Player \| Lineup-Rating Drop \(All Roster\) \| Replacement \(All Roster\) \| Lineup-Rating Drop \(Available Players\) \| Replacement \(Available Players\) \|/);
    assert.match(text, /\| Josh Jacobs \| [^|]+ \| none \| — \| — \|/);
    assert.match(text, /\*\*Protect\*\*[\s\S]*A\.J\. Brown[^\n]*IR \/ unavailable/);
  });

  it("keeps structural and actionable surplus separate", () => {
    const { text } = markdown();
    assert.match(text, /#### Extra Depth \(All Roster\)/);
    assert.match(text, /#### Safe to Move \(Available Players\)/);
    assert.match(text, /Josh Jacobs/);
  });

  it("explains display labels without mutating engine fields or waiver ordering", () => {
    const data = snapshot();
    const before = structuredClone(data);
    const text = buildMarkdown(data);
    assert.doesNotMatch(text, /actionable surplus|structural surplus|usable loss|structural loss/i);
    assert.match(text, /rating units, not projected fantasy points/);
    assert.match(text, /this is not a drop recommendation/);
    assert.deepEqual(data, before);
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

  it("omits weekly context when missing and renders only compact matched context when present", () => {
    const withoutContext = snapshot();
    assert.doesNotMatch(buildMarkdown(withoutContext), /#### Weekly Context/);

    const data = snapshot();
    data.fantasyAnalysis.weekly_context_by_player = {
      laporta: {
        match_status: "matched",
        context: {
          week: 5,
          opponent: "MIN",
          projection: { consensus_points: 14.8, low: null, high: null },
          positional_rank: 12,
          weekly_rank: 38,
          matchup: { rating: "unknown", score: null },
          source_metadata: [{ provider: "hidden-from-summary", capability: "rankings", observed_at: null }],
        },
      },
    };
    const text = buildMarkdown(data);
    assert.match(text, /Sam LaPorta — Week 5 · vs MIN · Proj 14\.8 · TE12/);
    assert.doesNotMatch(text, /hidden-from-summary/);
  });

  it("keeps analysis, waiver score ordering, recommendation urgency, and snapshot version unchanged with context", () => {
    const data = snapshot();
    const baseline = data.fantasyAnalysis;
    const candidateRows = data.actionableWaiverAnalysis.candidates as AnalysisRecord[];
    const orderedIds = candidateRows.map((candidate) => candidate.player_id);
    const scores = candidateRows.map((candidate) => candidate.waiver_value_score);
    const selected = (baseline.teams as Record<string, AnalysisRecord>)["1"]!;
    const recommendationActions = ((selected.recommendations as AnalysisRecord).actions as AnalysisRecord[])
      .map((action) => [action.category, action.urgency, action.week, action.position_or_slot]);
    const baselineSnapshot = data.fantasyAnalysis;
    const team = data.teams[0]!;
    const withContext = buildAnalysisBundle(
      [team],
      [1],
      data.rosterSlots,
      Object.values(data.waiverByPosition).flat(),
      1,
      undefined,
      {
        laporta: {
          match_status: "matched",
          match_method: "provider_id",
          match_reason: null,
          context: {
            week: 5,
            opponent: "MIN",
            sources: 1,
            projection: { consensus_points: 14.8, low: null, high: null },
            weekly_rank: 38,
            positional_rank: 12,
            matchup: { rating: "unknown", score: null },
            rest_of_season: { rank: null, positional_rank: null },
            confidence: { level: "low", reason: "Only one source provided a projection." },
            source_metadata: [],
          },
        },
      },
    );
    const resultTeam = (withContext.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
    assert.equal(withContext.snapshotVersion, "3.2");
    assert.deepEqual(withContext.waiverAnalysis, data.waiverAnalysis);
    assert.deepEqual(withContext.actionableWaiverAnalysis.candidates && (withContext.actionableWaiverAnalysis.candidates as AnalysisRecord[]).map((candidate) => candidate.player_id), orderedIds);
    assert.deepEqual((withContext.actionableWaiverAnalysis.candidates as AnalysisRecord[]).map((candidate) => candidate.waiver_value_score), scores);
    assert.deepEqual(((resultTeam.recommendations as AnalysisRecord).actions as AnalysisRecord[]).map((action) => [action.category, action.urgency, action.week, action.position_or_slot]), recommendationActions);
    const baselineTeam = (baselineSnapshot.teams as Record<string, AnalysisRecord>)["1"]!;
    for (const key of ["optimal_lineup", "position_need", "lineup_strength", "starting_depth", "future_readiness"]) {
      assert.deepEqual(resultTeam[key], baselineTeam[key], key);
    }
    assert.deepEqual(resultTeam.availability, baselineTeam.availability);
  });

  it("renders weekly opportunity separately from waiver score and keeps streaming text week-specific", () => {
    const data = snapshot();
    const team = (data.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
    team.weekly_streaming_recommendations = {
      actions: [{
        urgency: "act_now",
        position: "TE",
        target_week: 6,
        title: "Add a TE for Week 6",
        rankings_available: true,
        reason: "Informational weekly ranks.",
        options: [{
          player_id: "hunter",
          name: "Hunter Henry",
          position: "TE",
          waiver_value_score: 42,
          availability: "questionable",
          opportunity: { target_week: 6, positional_rank: 8, opportunity: "good" },
        }],
      }],
    };
    data.fantasyAnalysis.weekly_opportunity_by_player = {
      hunter: { target_week: 6, position: "TE", positional_rank: 8, opportunity: "good" },
    };
    data.actionableWaiverAnalysis.candidates = [{
      player_id: "hunter", name: "Hunter Henry", position: "TE", waiver_value_score: 42,
      team_need: "thin", league_scarcity: "moderate", currently_usable: true,
    }];
    const text = buildMarkdown(data);
    assert.match(text, /\*\*Week 6 TE:\*\* Hunter Henry \(TE8\) \(Questionable\)/);
    assert.match(text, /Week 6 TE8 good short-term/);
    assert.match(text, /Waiver score 42/);
    assert.equal(data.snapshotVersion, "3.2");
  });

  it("prioritizes actionable waivers while retaining structural context and the raw pool", () => {
    const { text, snapshot: data } = markdown();
    const actionable = text.split("### Available Waiver Options")[1]?.split("### All-Player Context")[0] ?? "";
    assert.match(text, /## Waiver Analysis/);
    assert.match(actionable, /Questionable WR[^\n]*Questionable/);
    assert.doesNotMatch(actionable, /Baker Mayfield/);
    const structural = data.waiverAnalysis.candidates as AnalysisRecord[];
    assert.ok(structural.some((candidate) => candidate.name === "Baker Mayfield"));
    assert.match(text, /All-player waiver rankings include \d+ candidate\(s\), including currently unavailable players/);
    assert.match(text, /## Available Waiver \/ Free-Agent Players/);
    assert.match(text, /## Standings/);
    assert.match(text, /## Rosters/);
    assert.match(text, /## Recent Transactions/);
    assert.match(text, /## Matchups/);
    assert.match(text, /## Data Notes/);
  });
});

describe("priority waiver presentation", () => {
  it("shows urgent QB options ahead of stronger generic TE/RB rankings without changing raw data", () => {
    const data = snapshot();
    const team = (data.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
    team.recommendations = { actions: [{ urgency: "act_now", category: "lineup_hole", position_or_slot: "QB", week: 6, title: "Add a QB", reason: "No starter available." }] };
    data.actionableWaiverAnalysis = { available: true, team: "Example Team", candidates: [
      { player_id: "te", name: "Strong TE", position: "TE", waiver_value_score: 100 },
      { player_id: "rb", name: "Strong RB", position: "RB", waiver_value_score: 90 },
      { player_id: "qb", name: "Kyler Murray", position: "QB", waiver_value_score: 60 },
    ] };
    const before = structuredClone(data);
    const text = buildMarkdown(data);
    const section = text.slice(text.indexOf("## Waiver Analysis"));
    assert.ok(section.indexOf("Priority Need: QB for Week 6") < section.indexOf("Other Waiver Opportunities"));
    assert.ok(section.indexOf("1. Kyler Murray") < section.indexOf("Strong TE"));
    assert.ok(section.indexOf("Strong TE") < section.indexOf("Strong RB"));
    assert.deepEqual(data, before);
  });
});

it("retains Week 7 RB need options beyond the global top 40 without future-week context", () => {
  const data = snapshot();
  const roster = data.teams[0]!;
  const waivers: WaiverPlayer[] = [
    ...Array.from({ length: 45 }, (_, i) => ({ playerId: `te-${i}`, name: `TE ${i}`, position: "TE", nflTeam: "BUF", status: "Active", injuryStatus: null, searchRank: i + 1 })),
    ...Array.from({ length: 4 }, (_, i) => ({ playerId: `rb-${i}`, name: `Available RB ${i}`, position: "RB", nflTeam: "BUF", status: "Active", injuryStatus: i === 1 ? "Questionable" : null, searchRank: 900 + i })),
    { playerId: "out-rb", name: "Out RB", position: "RB", nflTeam: "BUF", status: "Active", injuryStatus: "Out", searchRank: 1 },
  ];
  const bundle = buildAnalysisBundle([roster], [1], data.rosterSlots, waivers, 1, {
    currentWeek: 6, regularSeasonEndWeek: 18, byeScheduleAvailable: true, byeWeeksByTeam: { TST: [7] },
  });
  const full = buildActionableWaiverAnalysis(bundle.analysisWaiverPool, bundle.fantasyAnalysis, 1).candidates as AnalysisRecord[];
  assert.deepEqual(bundle.actionableWaiverAnalysis.candidates, full.slice(0, 40));
  assert.ok(!(bundle.actionableWaiverAnalysis.candidates as AnalysisRecord[]).some(p => p.position === "RB"));
  const updated = { ...data, ...bundle, waiverByPosition: { RB: waivers.filter(p => p.position === "RB") } };
  const legacy = { ...updated, actionableWaiverAnalysis: { ...bundle.actionableWaiverAnalysis } };
  delete legacy.actionableWaiverAnalysis.positional_candidates;
  delete legacy.actionableWaiverAnalysis.target_week_candidates;
  assert.deepEqual(priorityWaiverGroups(legacy).find(g => g.slot === "RB" && g.week === 7)?.candidates, []);
  const group = priorityWaiverGroups(updated).find(g => g.slot === "RB" && g.week === 7)!;
  assert.deepEqual(group.candidates.map(({ target_week_bye_status, ...p }) => p), full.filter(p => p.position === "RB").slice(0, 3));
  assert.deepEqual(group.candidates.map(p => p.name), ["Available RB 0", "Available RB 1", "Available RB 2"]);
  const team = (bundle.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
  const action = ((team.recommendations as AnalysisRecord).actions as AnalysisRecord[]).find(a => a.position_or_slot === "RB" && a.week === 7)!;
  assert.match(String(action.reason), /is on bye/);
  assert.doesNotMatch(String(action.reason), /unavailable that week|No available waiver options/);
  assert.match(String(action.reason), /Available RB 0, Available RB 1, and Available RB 2/);
  assert.match(buildMarkdown(updated), /Priority Need: RB for Week 7\n\n1\. Available RB 0 \(target-week bye status unknown\)/);
  assert.match(String(action.reason), /Target-week bye status is unknown/);
  const switched = applyMyRoster(updated, 1);
  assert.deepEqual(priorityWaiverGroups(switched), priorityWaiverGroups(updated));
  assert.deepEqual(switched.actionableWaiverAnalysis?.candidates, full.slice(0, 40));
});

it("carries reliable target-week byes from snapshot construction into priority prose, Markdown and roster refresh", () => {
  const data = snapshot();
  const waivers: WaiverPlayer[] = [
    { playerId: "bye-rb", name: "Bye RB", position: "RB", nflTeam: "BYE", status: "Active", injuryStatus: null, searchRank: 1 },
    { playerId: "ready-rb", name: "Ready RB", position: "RB", nflTeam: "BUF", status: "Active", injuryStatus: null, searchRank: 10 },
  ];
  const bundle = buildAnalysisBundle(data.teams, [1], data.rosterSlots, waivers, 1, {
    currentWeek: 6, regularSeasonEndWeek: 18, byeScheduleAvailable: true, byeWeeksByTeam: { TST: [7], BYE: [7], BUF: [8] },
  });
  const updated = { ...data, ...bundle };
  for (const view of [updated, applyMyRoster(updated, 1)]) {
    const group = priorityWaiverGroups(view).find(g => g.slot === "RB" && g.week === 7)!;
    assert.deepEqual(group.candidates.map(p => p.player_id), ["ready-rb"]);
    const team = (view.fantasyAnalysis.teams as Record<string, AnalysisRecord>)["1"]!;
    const action = ((team.recommendations as AnalysisRecord).actions as AnalysisRecord[]).find(a => a.position_or_slot === "RB" && a.week === 7)!;
    assert.match(String(action.reason), /is on bye/);
    assert.match(String(action.reason), /Best available options: Ready RB/);
    assert.doesNotMatch(String(action.reason), /Bye RB|bye status is unknown/);
    const section = buildMarkdown(view).split("### Priority Need: RB for Week 7")[1]!.split("###")[0]!;
    assert.match(section, /1\. Ready RB/);
    assert.doesNotMatch(section, /Bye RB|bye status unknown/);
    assert.deepEqual((view.actionableWaiverAnalysis!.candidates as AnalysisRecord[]).map(p => p.player_id), ["bye-rb", "ready-rb"]);
  }
});


it("exports the app release separately from snapshot version without the full changelog", () => {
  const data = snapshot();
  const text = buildMarkdown(data);
  assert.equal(APP_VERSION, "3.5.1");
  assert.ok(text.split("## My Team")[0]!.includes(`- Analysis version: V${APP_VERSION}`));
  assert.equal(data.snapshotVersion, "3.2");
  assert.equal(snapshotJson(data).snapshot_version, "3.2");
  assert.equal(CHANGELOG[0].version, APP_VERSION);
  assert.deepEqual(CHANGELOG.map(release => release.version), ["3.5.1", "3.5", "3.4", "3.3"]);
  assert.ok(!text.includes(CHANGELOG[0].changes[0]));
});
