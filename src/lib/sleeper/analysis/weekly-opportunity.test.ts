import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisRecord } from "./engine.ts";
import {
  buildWeeklyOpportunity,
  buildWeeklyOpportunityView,
  classifyWeeklyOpportunity,
  selectTargetWeek,
} from "./weekly-opportunity.ts";

function context(week: number, position: string, rank: number, points = 12): AnalysisRecord {
  return {
    match_status: "matched",
    context: {
      week,
      opponent: "MIN",
      weekly_rank: rank,
      positional_rank: rank,
      projection: { consensus_points: points },
      confidence: { level: "low" },
      matchup: { rating: "unknown", score: null },
    },
  };
}

function team(position: string, week: number, urgency = "act_now"): AnalysisRecord {
  return {
    availability: { usable_position_need: { [position]: { need: "thin" } } },
    future_readiness: {
      horizon_start_week: 5,
      weeks: { [String(week)]: { positions: { [position]: { status: "uncovered", urgency } } } },
    },
    recommendations: {
      actions: [{ category: "lineup_hole", urgency, position_or_slot: position, week, title: `Add a ${position} for Week ${week}` }],
    },
  };
}

const candidates = (...items: AnalysisRecord[]): AnalysisRecord => ({ available: true, candidates: items });

describe("V3.5 Phase 4 weekly opportunity", () => {
  it("selects the target week for urgent QB and TE holes", () => {
    const qbTeam = team("QB", 6);
    const teTeam = team("TE", 8, "plan_ahead");
    assert.equal(selectTargetWeek(qbTeam, "QB"), 6);
    assert.equal(selectTargetWeek(teTeam, "TE"), 8);
    const qb = buildWeeklyOpportunityView(qbTeam, candidates({ player_id: "q", name: "QB", position: "QB" }), { q: context(6, "QB", 10) });
    const te = buildWeeklyOpportunityView(teTeam, candidates({ player_id: "t", name: "TE", position: "TE" }), { t: context(8, "TE", 8) });
    assert.equal(qb.by_player.q?.target_week, 6);
    assert.equal(qb.actions[0]?.target_week, 6);
    assert.equal(te.by_player.t?.target_week, 8);
    assert.equal(te.actions[0]?.target_week, 8);
  });

  it("never uses context from a different week", () => {
    const opportunity = buildWeeklyOpportunity(6, "QB", context(7, "QB", 4));
    assert.equal(opportunity.opportunity, "unknown");
    assert.equal(opportunity.projection_points, null);
    assert.equal(opportunity.positional_rank, null);
  });

  it("classifies positional rank bands deterministically", () => {
    assert.equal(classifyWeeklyOpportunity("QB", 8), "excellent");
    assert.equal(classifyWeeklyOpportunity("QB", 9), "good");
    assert.equal(classifyWeeklyOpportunity("QB", 17), "neutral");
    assert.equal(classifyWeeklyOpportunity("QB", 25), "poor");
    assert.equal(classifyWeeklyOpportunity("TE", 6), "excellent");
    assert.equal(classifyWeeklyOpportunity("TE", 7), "good");
    assert.equal(classifyWeeklyOpportunity("TE", 13), "neutral");
    assert.equal(classifyWeeklyOpportunity("TE", 21), "poor");
    assert.equal(classifyWeeklyOpportunity("TE", null), "unknown");
  });

  it("keeps missing context unknown and returns no streaming options", () => {
    const current = team("TE", 6);
    const waiver = candidates({ player_id: "t", name: "TE", position: "TE" });
    const result = buildWeeklyOpportunityView(current, waiver, {});
    assert.equal(result.by_player.t?.opportunity, "unknown");
    assert.equal(result.actions.length, 0);
  });

  it("excludes unavailable candidates and retains Questionable candidates with a marker", () => {
    const current = team("TE", 6);
    const result = buildWeeklyOpportunityView(current, candidates(
      { player_id: "out", name: "Out TE", position: "TE", currently_usable: false },
      { player_id: "q", name: "Questionable TE", position: "TE", currently_usable: true, availability: "uncertain" },
    ), { q: context(6, "TE", 8) });
    assert.deepEqual(result.actions[0]?.options.map((option) => option.player_id), ["q"]);
    assert.equal(result.actions[0]?.options[0]?.availability, "questionable");
  });

  it("keeps waiver score/order intact while short-term order uses target-week rank", () => {
    const current = team("WR", 6);
    const waiver = candidates(
      { player_id: "structural", name: "Structural favorite", position: "WR", waiver_value_score: 90, currently_usable: true },
      { player_id: "streamer", name: "Weekly streamer", position: "WR", waiver_value_score: 25, currently_usable: true },
    );
    const before = structuredClone(waiver);
    const result = buildWeeklyOpportunityView(current, waiver, {
      structural: context(6, "WR", 30, 8),
      streamer: context(6, "WR", 4, 17),
    });
    assert.deepEqual(waiver, before);
    assert.deepEqual(result.actions[0]?.options.map((option) => option.player_id), ["streamer", "structural"]);
    assert.equal(result.actions[0]?.options[0]?.waiver_value_score, 25);
  });

  it("uses the roster's current week for a thin position when no future hole exists", () => {
    const current = team("TE", 6);
    (current.future_readiness as AnalysisRecord).weeks = { "6": { positions: { TE: { status: "covered" } } } };
    (current.recommendations as AnalysisRecord).actions = [{ category: "upgrade", urgency: "opportunity", position_or_slot: "TE", week: null, title: "Consider adding a TE" }];
    assert.equal(selectTargetWeek(current, "TE"), 5);
    const view = buildWeeklyOpportunityView(current, candidates({ player_id: "te", name: "TE", position: "TE", currently_usable: true }), { te: context(5, "TE", 8) });
    assert.equal(view.actions[0]?.target_week, 5);
    assert.equal(view.actions[0]?.urgency, "opportunity");
  });

  it("surfaces DEF and K ranks only for exact-week available free agents", () => {
    const defense = team("DEF", 6);
    const k = team("K", 6);
    const pool = [{ player_id: "dst", name: "Bills", position: "DEF", status: "Active", injury_status: null }];
    const defenseResult = buildWeeklyOpportunityView(defense, candidates(), { dst: context(6, "DEF", 3) }, pool);
    assert.equal(defenseResult.actions[0]?.options[0]?.player_id, "dst");
    assert.equal(defenseResult.actions[0]?.options[0]?.opportunity.opportunity, "excellent");
    const kResult = buildWeeklyOpportunityView(k, candidates(), { kicker: context(6, "K", 8) }, [
      { player_id: "kicker", name: "Kicker", position: "K", status: "Active", injury_status: null },
    ]);
    assert.equal(kResult.actions[0]?.options[0]?.opportunity.target_week, 6);
  });

  it("keeps DEF/K alerts when ranks are unavailable and makes no matchup claim", () => {
    const def = buildWeeklyOpportunityView(team("DEF", 6), candidates(), {}, [
      { player_id: "dst", name: "Bills", position: "DEF", status: "Active", injury_status: null },
    ]);
    assert.equal(def.actions[0]?.rankings_available, false);
    assert.match(def.actions[0]?.reason ?? "", /not available/);
    const opportunity = buildWeeklyOpportunity(6, "TE", context(6, "TE", 8));
    assert.doesNotMatch(opportunity.reason ?? "", /matchup/i);
    assert.equal(opportunity.opportunity, "good");
  });

  it("keeps the Phase 2 urgency on the derived streaming view", () => {
    const current = team("QB", 8, "plan_ahead");
    const result = buildWeeklyOpportunityView(current, candidates({ player_id: "qb", name: "QB", position: "QB" }), { qb: context(8, "QB", 9) });
    assert.equal(result.actions[0]?.urgency, "plan_ahead");
  });
});
