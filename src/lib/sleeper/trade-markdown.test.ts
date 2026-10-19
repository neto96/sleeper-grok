import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExportMarkdown, buildTradeMarkdown, type AnalyzedTradeExport } from "./trade-markdown.ts";
import { lineupChangeReason } from "./trade-presentation.ts";
import type { TradeAnalysisResult, TeamTradeImpact, TradeRequest } from "./trade-analyzer.ts";
import type { LeagueSnapshot, TeamRoster, PlayerSlot } from "./types.ts";

function team(rosterId: number, teamName: string, playerNames: string[]): TeamRoster {
  return { rosterId, teamName, ownerName: teamName, username: teamName, avatar: null,
    isCommissioner: false, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    waiverPosition: 1, faabUsed: 0, faabBudget: 100, streak: null, starters: [], reserve: [], taxi: [],
    bench: playerNames.map((name, index): PlayerSlot => ({ playerId: `${rosterId}-${index}`, name,
      position: "WR", slot: "BN", nflTeam: "TST", injuryStatus: null, status: "Active", number: null, searchRank: 50 })) };
}
function fixture(): { snapshot: LeagueSnapshot; request: TradeRequest; result: TradeAnalysisResult } {
  const teams = [team(1, "Team Alpha", ["Receiver One", "Receiver Two"]), team(2, "Team Beta", ["Runner Three"])];
  const snapshot: LeagueSnapshot = {
    fetchedAt: "2026-10-18T00:00:00Z", leagueId: "test", leagueName: "League", season: "2026",
    seasonType: "regular", status: "in_season", sport: "nfl", scoring: "PPR", week: 6, displayWeek: 6,
    rosterSlots: ["WR"], benchSlots: 1, playoffTeams: 6, avatar: null, myRosterId: 1,
    waiverSystem: "Waiver Priority", teams, analysisWaiverPool: [], waiverOrder: [], waiverByPosition: {}, transactions: [],
    matchups: [], notes: [], snapshotVersion: "3.2", fantasyAnalysis: {}, waiverAnalysis: {},
    markdown: "# League\n\nOriginal snapshot.\n", filename: "snapshot.md", jsonFilename: "snapshot.json",
  };
  const impact = (rosterId: number, teamName: string): TeamTradeImpact => ({ rosterId, teamName,
    verdict: "Mostly lateral", reasons: ["Little starting-lineup change."],
    rosterSize: { before: 2, after: 1, expected: 2, overBy: 0, underBy: 1, requiredDrops: 0 },
    lineupChanges: [], positionImpact: [], replacementRiskChanges: [],
    surplusChanges: { extraDepthAdded: [], extraDepthRemoved: [], safeToMoveAdded: [], safeToMoveRemoved: [] },
    availability: { incoming: [], outgoing: [] }, potentialDrops: [] });
  const teamA = impact(1, "Team Alpha");
  const teamB = impact(2, "Team Beta");
  teamB.verdict = "Risky";
  teamB.rosterSize = { before: 2, after: 3, expected: 2, overBy: 1, underBy: 0, requiredDrops: 1 };
  return { snapshot, request: { teamAId: 1, teamBId: 2, teamAPlayerIds: ["1-0", "1-1"], teamBPlayerIds: ["2-0"] },
    result: { valid: true, teamA, teamB, futureReadinessIncluded: false, note: "Future readiness is not included." } };
}

describe("trade Markdown export", () => {
  it("appends both sides, selected players, verdicts, required drops and the Phase 1 limitation", () => {
    const trade = fixture();
    const text = buildExportMarkdown(trade.snapshot, trade);
    assert.ok(text.startsWith(trade.snapshot.markdown));
    assert.match(text, /## Trade Analysis/);
    assert.match(text, /Team Alpha sends to Team Beta: Receiver One, Receiver Two/);
    assert.match(text, /Team Beta sends to Team Alpha: Runner Three/);
    assert.match(text, /### Team Alpha — impact/);
    assert.match(text, /### Team Beta — impact/);
    assert.match(text, /Verdict: \*\*Mostly lateral\*\*/);
    assert.match(text, /Verdict: \*\*Risky\*\*/);
    assert.match(text, /Active roster size: 2 → 3/);
    assert.match(text, /Required drops: \*\*1\*\*/);
    assert.match(text, /future-readiness deltas.*not yet included/);
  });

  it("keeps normal Markdown byte-for-byte for no, cleared, invalid, or stale result", () => {
    const trade = fixture();
    const original = trade.snapshot.markdown;
    assert.equal(buildExportMarkdown(trade.snapshot, null), original);
    const invalid: AnalyzedTradeExport = { ...trade, result: { valid: false, errors: ["Invalid"] } };
    assert.equal(buildExportMarkdown(trade.snapshot, invalid), original);
    assert.equal(buildTradeMarkdown(trade.snapshot, trade.request, invalid.result), "");
    assert.equal(buildExportMarkdown({ ...trade.snapshot }, trade), original);
    buildExportMarkdown(trade.snapshot, trade);
    assert.equal(buildExportMarkdown(trade.snapshot, null), original);
    assert.equal(trade.snapshot.markdown, original);
  });

  it("formats existing lineup, depth, surplus, replacement risk and incoming availability evidence", () => {
    const trade = fixture();
    assert.ok(trade.result.valid);
    const impact = trade.result.teamA;
    impact.lineupChanges = ["all_roster", "available"].map((context) => ({
      context: context as "all_roster" | "available", slot: "FLEX", ordinal: 1, kind: "changed",
      beforePlayerId: "1-0", beforePlayerName: "Receiver One", afterPlayerId: "2-0", afterPlayerName: "Runner Three" }));
    impact.positionImpact = [{ position: "RB", need: "improved", depth: "unchanged", availableNeed: "unchanged", availableDepth: "worsened" }];
    impact.surplusChanges.extraDepthAdded = ["Bench Player"];
    impact.surplusChanges.safeToMoveRemoved = ["New Starter"];
    impact.replacementRiskChanges = [{ playerId: "x", playerName: "Fragile Starter", direction: "increased", before: "low", after: "very_high" }];
    impact.availability.incoming = [
      { playerId: "o", playerName: "Out Player", position: "RB", availability: "unavailable", reason: "out" },
      { playerId: "q", playerName: "Questionable Player", position: "WR", availability: "available", reason: "questionable" },
      { playerId: "h", playerName: "Healthy Player", position: "WR", availability: "available", reason: "active" },
    ];
    const text = buildTradeMarkdown(trade.snapshot, trade.request, trade.result);
    assert.match(text, /All-roster lineup: FLEX1: Receiver One → Runner Three/);
    assert.match(text, /Availability-eligible lineup: FLEX1/);
    assert.match(text, /RB: all-roster need improved; available-player depth worsened/);
    assert.match(text, /Extra Depth added: Bench Player/);
    assert.match(text, /Safe to Move removed: New Starter/);
    assert.match(text, /Replacement risk for Fragile Starter: low → very high/);
    assert.match(text, /Out Player.*unavailable/);
    assert.match(text, /Questionable Player.*questionable/);
    assert.doesNotMatch(text, /Healthy Player/);
  });

  it("escapes roster text and limits supplied reasons without recalculating the verdict", () => {
    const trade = fixture();
    assert.ok(trade.result.valid);
    trade.result.teamA.teamName = "<Team>\n## Injected";
    trade.snapshot.teams[0]!.bench[0]!.name = "[Player](https://example.com)";
    trade.result.teamA.reasons = Array.from({ length: 7 }, (_, i) => `Reason ${i}`);
    const text = buildTradeMarkdown(trade.snapshot, trade.request, trade.result);
    assert.match(text, /&lt;Team&gt;/);
    assert.ok(text.includes("&lt;Team&gt; ## Injected")); // Flattened, not a new heading.
    assert.ok(text.includes("\\[Player\\](https://example.com)"));
    assert.match(text, /Reason 4/);
    assert.doesNotMatch(text, /Reason 5/);
    assert.match(text, /Mostly lateral/);
  });

  it("keeps ordinary punctuation natural while protecting active Markdown syntax", () => {
    const trade = fixture();
    assert.ok(trade.result.valid);
    trade.snapshot.teams[0]!.bench[0]!.name = "A.J. Brown";
    trade.result.teamA.reasons = ["RB depth or need improves.", "Requires 2 follow-up drops.", "# Heading", "1. Numbered", "- Nested"];
    const text = buildTradeMarkdown(trade.snapshot, trade.request, trade.result);
    assert.ok(text.includes("A.J. Brown"));
    assert.ok(text.includes("RB depth or need improves."));
    assert.ok(text.includes("Requires 2 follow-up drops."));
    assert.ok(text.includes("- \\# Heading"));
    assert.ok(text.includes("- 1\\. Numbered"));
    assert.ok(text.includes("- \\- Nested"));
    assert.ok(!text.includes("A\\.J\\."));
    assert.ok(!text.includes("follow\\-up"));
  });

  it("exports the same context-specific reasons shown by the UI", () => {
    const trade = fixture();
    assert.ok(trade.result.valid);
    const impact = trade.result.teamA;
    impact.lineupChanges = [
      { context: "all_roster", slot: "FLEX", ordinal: 1, kind: "upgraded", beforePlayerId: "rome", beforePlayerName: "Rome Odunze", afterPlayerId: "michael", afterPlayerName: "Michael Wilson" },
      { context: "available", slot: "FLEX", ordinal: 1, kind: "upgraded", beforePlayerId: "xavier", beforePlayerName: "Xavier Worthy", afterPlayerId: "michael", afterPlayerName: "Michael Wilson" },
    ];
    impact.reasons = impact.lineupChanges.map((change) => lineupChangeReason(change, impact.lineupChanges));
    const before = structuredClone(trade.result);
    const text = buildExportMarkdown(trade.snapshot, trade);
    for (const reason of impact.reasons) assert.ok(text.includes(`- ${reason}`));
    assert.match(text, /All-roster lineup: FLEX1 improves from Rome Odunze/);
    assert.match(text, /Available lineup: FLEX1 improves from Xavier Worthy/);
    assert.match(text, /## Trade Analysis/);
    assert.deepEqual(trade.result, before);
  });
});
