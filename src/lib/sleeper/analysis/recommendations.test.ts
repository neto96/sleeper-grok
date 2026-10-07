import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisRecord } from "./engine.ts";
import { addRecommendations, buildTeamRecommendations } from "./recommendations.ts";

function fixture(options: {
  weeks?: Record<string, Record<string, AnalysisRecord>>;
  need?: Record<string, string>;
  lineup?: Record<string, AnalysisRecord[]>;
  coverage?: AnalysisRecord;
  positions?: Record<string, AnalysisRecord[]>;
  scheduleAvailable?: boolean;
} = {}) {
  const weekData: Record<string, AnalysisRecord> = {};
  for (const [week, positions] of Object.entries(options.weeks ?? {})) weekData[week] = { positions };
  return {
    team: {
      positions: options.positions ?? {},
      availability: {
        usable_position_need: Object.fromEntries(
          Object.entries(options.need ?? {}).map(([position, need]) => [position, { need }]),
        ),
        usable_lineup: options.lineup ?? {},
      },
      lineup_coverage: options.coverage ?? {},
      future_readiness: {
        horizon_start_week: 5,
        horizon_end_week: 9,
        bye_schedule_available: options.scheduleAvailable ?? true,
        weeks: weekData,
      },
    } as AnalysisRecord,
  };
}

function row(status: string, urgency: string, affected: string[] = [], extra: AnalysisRecord = {}): AnalysisRecord {
  return {
    required: 1,
    usable: status === "uncovered" ? 0 : 1,
    status,
    urgency,
    reason: `Coverage ${status}`,
    affected_player_ids: affected,
    assigned_player_ids: [],
    ...extra,
  };
}

const actionable = (...candidates: AnalysisRecord[]): AnalysisRecord => ({ available: true, candidates });

describe("V3.5 Phase 2 recommendations", () => {
  it("marks an immediate uncovered TE as act_now", () => {
    const { team } = fixture({ weeks: { "5": { TE: row("uncovered", "act_now", ["laporta"]) } }, positions: { TE: [{ player_id: "laporta", name: "Sam LaPorta" }] } });
    const action = buildTeamRecommendations(team).actions[0]!;
    assert.equal(action.urgency, "act_now");
    assert.match(action.title, /TE.*Week 5/);
    assert.match(action.reason, /Sam LaPorta/);
  });

  it("marks a next-week QB hole as act_now", () => {
    const { team } = fixture({ weeks: { "6": { QB: row("uncovered", "act_now") } } });
    assert.equal(buildTeamRecommendations(team).actions[0]?.urgency, "act_now");
  });

  it("marks a two-weeks-away hole plan_ahead", () => {
    const { team } = fixture({ weeks: { "7": { WR: row("uncovered", "plan_ahead") } } });
    assert.equal(buildTeamRecommendations(team).actions[0]?.urgency, "plan_ahead");
  });

  it("marks uncovered weeks three or four away watch", () => {
    const { team } = fixture({ weeks: { "8": { RB: row("uncovered", "watch") }, "9": { TE: row("uncovered", "watch") } } });
    assert.ok(buildTeamRecommendations(team).actions.every((action) => action.urgency === "watch"));
  });

  it("suppresses generic thin depth when the same position has an uncovered future week", () => {
    const { team } = fixture({ weeks: { "5": { TE: row("thin", "watch") }, "6": { TE: row("uncovered", "act_now") } } });
    const actions = buildTeamRecommendations(team).actions;
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.week, 6);
  });

  it("creates a DEF-specific bye recommendation", () => {
    const { team } = fixture({
      weeks: { "8": { DEF: row("uncovered", "watch", ["buffalo"], { reason: "Bye week leaves no DEF slots fillable in Week 8." }) } },
      positions: { DEF: [{ player_id: "buffalo", name: "Buffalo Bills" }] },
    });
    const action = buildTeamRecommendations(team).actions[0]!;
    assert.equal(action.category, "def_stream");
    assert.match(action.title, /DEF.*Week 8/);
  });

  it("creates a K-specific bye recommendation", () => {
    const { team } = fixture({ weeks: { "9": { K: row("uncovered", "watch", ["k1"]) } }, positions: { K: [{ player_id: "k1", name: "Kicker" }] } });
    assert.equal(buildTeamRecommendations(team).actions[0]?.category, "k_stream");
  });

  it("attaches top actionable waiver candidates in their existing order without changing scores", () => {
    const candidates = [
      { player_id: "a", name: "Oronde Gadsden", position: "TE", waiver_value_score: 72, currently_usable: true },
      { player_id: "b", name: "Hunter Henry", position: "TE", waiver_value_score: 61, currently_usable: true },
      { player_id: "c", name: "Third TE", position: "TE", waiver_value_score: 50, currently_usable: true },
      { player_id: "d", name: "Fourth TE", position: "TE", waiver_value_score: 49, currently_usable: true },
    ];
    const before = structuredClone(candidates);
    const { team } = fixture({ weeks: { "6": { TE: row("uncovered", "act_now", ["laporta"]) } }, positions: { TE: [{ player_id: "laporta", name: "LaPorta" }] } });
    const action = buildTeamRecommendations(team, actionable(...candidates)).actions[0]!;
    assert.match(action.reason, /Oronde Gadsden and Hunter Henry and Third TE/);
    assert.deepEqual(candidates, before);
    assert.deepEqual(action.related_player_ids, ["laporta", "a", "b", "c"]);
  });

  it("does not suggest unavailable candidates through the actionable path", () => {
    const { team } = fixture({ weeks: { "6": { QB: row("uncovered", "act_now") } } });
    const action = buildTeamRecommendations(team, actionable({ name: "Unavailable QB", position: "QB", currently_usable: false })).actions[0]!;
    assert.doesNotMatch(action.reason, /Unavailable QB/);
    assert.match(action.reason, /No currently usable actionable waiver options/);
  });

  it("consolidates duplicate same-slot same-week entries", () => {
    const { team } = fixture({ weeks: { "6": { TE: row("uncovered", "act_now", ["t1"]) } } });
    const duplicateTeam = structuredClone(team);
    (duplicateTeam.future_readiness as AnalysisRecord).weeks = {
      "6": { positions: { TE: row("uncovered", "act_now", ["t1"]) } },
    };
    const actions = buildTeamRecommendations(duplicateTeam).actions;
    assert.equal(actions.filter((action) => action.week === 6 && action.position_or_slot === "TE").length, 1);
  });

  it("sorts recommendations by urgency then week", () => {
    const { team } = fixture({ weeks: { "9": { WR: row("uncovered", "watch") }, "7": { QB: row("uncovered", "plan_ahead") }, "6": { TE: row("uncovered", "act_now") } } });
    assert.deepEqual(buildTeamRecommendations(team).actions.map((action) => action.urgency), ["act_now", "plan_ahead", "watch"]);
  });

  it("leaves existing V3.4 and Phase 1 fields untouched", () => {
    const { team } = fixture({ weeks: { "6": { TE: row("uncovered", "act_now") } } });
    team.optimal_lineup = { QB: [{ player_id: "original" }] };
    team.availability = { ...(team.availability as AnalysisRecord), usable_lineup: { QB: [{ player_id: "original" }] } };
    team.future_readiness = { ...(team.future_readiness as AnalysisRecord), marker: "phase1" };
    const analysis: AnalysisRecord = { teams: { "1": team } };
    const before = structuredClone({
      optimal_lineup: team.optimal_lineup,
      availability: team.availability,
      future_readiness: team.future_readiness,
    });
    addRecommendations(analysis, {}, 1);
    assert.deepEqual(
      {
        optimal_lineup: team.optimal_lineup,
        availability: team.availability,
        future_readiness: team.future_readiness,
      },
      before,
    );
    assert.ok((team.recommendations as AnalysisRecord).actions);
  });

  it("does not make future actionable recommendations when schedule data is incomplete", () => {
    const { team } = fixture({ weeks: { "6": { TE: row("uncovered", "act_now", ["t1"]) } }, scheduleAvailable: false });
    assert.deepEqual(buildTeamRecommendations(team).actions, []);
  });

  it("preserves unsupported IDP rows without crashing or recommending unsupported coverage", () => {
    const { team } = fixture({ weeks: { "6": { IDP_FLEX: row("unsupported", "none") } } });
    assert.deepEqual(buildTeamRecommendations(team).actions, []);
  });
});
