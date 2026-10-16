import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFantasyAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./engine.ts";
import { addFutureReadiness } from "./future-readiness.ts";
import { buildTeamRecommendations } from "./recommendations.ts";
import { recommendSafeDrop } from "./recommended-drop.ts";

const rec = (v: unknown) => v as AnalysisRecord;
const rows = (v: unknown) => v as AnalysisRecord[];
function fixture(slots = ["QB", "WR", "WR", "FLEX"]) {
  const configuration = parseRosterConfiguration(slots);
  const players = [
    { player_id: "qb", position: "QB", search_rank: 20, team: "BYE" },
    ...[20, 50, 100, 180, 230].map((rank, i) => ({ player_id: i === 4 ? "malik" : `wr${i}`, name: i === 4 ? "Malik Washington" : `WR ${i}`, position: "WR", search_rank: rank, team: "BUF" })),
  ].map((player) => ({ name: player.player_id, status: "Active", ...player }));
  const analysis = buildFantasyAnalysis({ "1": { players, starters: players.slice(0, 4), reserve: [], taxi: [] } }, configuration);
  addFutureReadiness(analysis, configuration, { currentWeek: 6, regularSeasonEndWeek: 18, byeScheduleAvailable: true, byeWeeksByTeam: { BYE: [6] } });
  return { configuration, team: rec(rec(analysis.teams)["1"]), analysis };
}
function makeOnlyMalikEligible(team: AnalysisRecord) {
  for (const row of rows(rec(team.positions).WR)) if (row.player_id !== "malik") row.roster_status = "starter";
}

describe("V3.5.1 recommended drops", () => {
  it("recommends a low-impact Malik-type WR for an urgent QB need using real engine data", () => {
    const { team, configuration } = fixture();
    const waivers = { available: true, candidates: [{ player_id: "kyler", name: "Kyler Murray", position: "QB", currently_usable: true }] };
    const before = structuredClone({ team, waivers });
    const action = buildTeamRecommendations(team, waivers, configuration).actions.find((action) => action.urgency === "act_now");
    assert.equal(action?.recommended_drop?.player_id, "malik");
    assert.match(action!.reason, /Recommended drop: Malik Washington/);
    assert.deepEqual({ team, waivers }, before);
  });

  it("fails closed without schedule, configuration, cost, protection or horizon evidence", () => {
    for (const mutate of [
      (t: AnalysisRecord) => { rec(t.future_readiness).bye_schedule_available = false; },
      (t: AnalysisRecord) => { delete rec(rec(t.future_readiness).weeks)["8"]; },
      (t: AnalysisRecord) => { delete t.player_protection; },
      (t: AnalysisRecord) => { delete rec(t.availability).usable_replacement_cost; },
    ]) {
      const { team, configuration } = fixture(); mutate(team);
      assert.equal(recommendSafeDrop(team, configuration), null);
    }
    assert.equal(recommendSafeDrop(fixture().team, {}), null);
  });

  it("rejects protected, hold, strong, starter, reserve, taxi and costly players", () => {
    for (const mutation of ["protect", "hold", "strong", "starter", "reserve", "taxi", "usable-cost", "structural-cost", "need", "unknown-need", "high-need"]) {
      const { team, configuration } = fixture(); makeOnlyMalikEligible(team);
      const malik = rows(rec(team.positions).WR).find((p) => p.player_id === "malik")!;
      if (["protect", "hold"].includes(mutation)) rows(team.player_protection).find((p) => p.player_id === "malik")!.protection = mutation;
      if (mutation === "strong") malik.fantasy_value_tier = "strong";
      if (["starter", "reserve", "taxi"].includes(mutation)) malik.roster_status = mutation;
      if (mutation === "usable-cost") rows(rec(team.availability).usable_replacement_cost).find((p) => p.player_id === "malik")!.score_difference = 1;
      if (mutation === "structural-cost") rows(team.roster_replacement_cost).find((p) => p.player_id === "malik")!.score_difference = 1;
      if (mutation === "need") rec(rec(team.availability).usable_position_need).WR = { need: "thin" };
      if (mutation === "unknown-need") rec(team.position_need).WR = { need: "unknown" };
      if (mutation === "high-need") rec(team.position_need).WR = { need: "high" };
      assert.equal(recommendSafeDrop(team, configuration), null, mutation);
    }
  });

  it("rejects a future starter and the last future backup, including FLEX cover", () => {
    for (const change of ["assigned", "last-backup", "flex-backup"]) {
      const { team, configuration } = fixture(); makeOnlyMalikEligible(team);
      const positions = rec(rec(rec(rec(team.future_readiness).weeks)["8"]).positions);
      if (change === "assigned") rec(positions.WR).assigned_player_ids = ["malik", "wr1"];
      else rec(positions[change === "flex-backup" ? "FLEX" : "WR"]).affected_player_ids = ["wr3"];
      assert.equal(recommendSafeDrop(team, configuration), null, change);
    }
  });

  it("explicitly declines an unsafe urgent drop and leaves nonurgent actions alone", () => {
    const { team, configuration } = fixture();
    rec(team.future_readiness).bye_schedule_available = false;
    const availability = rec(team.availability);
    rec(availability.usable_lineup).QB = [];
    const actions = buildTeamRecommendations(team, {}, configuration).actions;
    assert.ok(actions.some((action) => action.urgency === "act_now" && action.recommended_drop === null && action.reason.includes("No clearly safe drop identified.")));
    assert.ok(actions.filter((action) => action.urgency !== "act_now").every((action) => action.recommended_drop === undefined));
  });

  it("prefers established safe-to-move depth and can fall back to a low-tier bench player", () => {
    const { team, configuration } = fixture();
    const malik = rows(rec(team.positions).WR).find((p) => p.player_id === "malik")!;
    // Fringe/deep-waiver players intentionally have no engine surplus/protection row.
    malik.fantasy_value_tier = "fringe";
    rec(team.availability).actionable_surplus = rows(rec(team.availability).actionable_surplus).filter((p) => p.player_id !== "malik");
    team.player_protection = rows(team.player_protection).filter((p) => p.player_id !== "malik");
    assert.equal(recommendSafeDrop(team, configuration)?.player_id, "wr3");
    makeOnlyMalikEligible(team);
    assert.equal(recommendSafeDrop(team, configuration)?.player_id, "malik");
  });

  it("also offers a safe offensive bench drop for urgent K/DEF additions without valuing K/DEF", () => {
    const { team, configuration } = fixture(["QB", "WR", "WR", "FLEX", "K", "DEF"]);
    const actions = buildTeamRecommendations(team, {}, configuration).actions.filter((a) => ["k_stream", "def_stream"].includes(a.category) && a.urgency === "act_now");
    assert.ok(actions.some((a) => a.category === "k_stream"));
    assert.ok(actions.some((a) => a.category === "def_stream"));
    assert.ok(actions.every((a) => a.recommended_drop?.player_id === "malik"));
  });

  it("evaluates multiple urgent adds independently without cumulatively dropping players", () => {
    const { team, configuration } = fixture(["QB", "TE", "WR", "WR", "FLEX"]);
    const actions = buildTeamRecommendations(team, {}, configuration).actions.filter((a) => a.urgency === "act_now");
    assert.ok(actions.length >= 2);
    assert.ok(actions.every((a) => a.recommended_drop?.player_id === "malik"));
    assert.ok(actions.every((a) => a.reason.includes("on its own")));
  });
});
