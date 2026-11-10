import assert from "node:assert/strict";
import { test } from "node:test";
import { presentRecommendations } from "./recommendation-presentation.ts";
import type { AnalysisRecord } from "./analysis/engine.ts";

function depth(position: "QB" | "TE", week: number): AnalysisRecord {
  const name = position === "QB" ? "Joe Burrow" : "Sam LaPorta";
  return { category: "depth", urgency: "watch", position_or_slot: position, week,
    title: `${position} coverage is thin for Week ${week}`,
    reason: `${name} is your only available ${position} for Week ${week}. There is no legal replacement if ${name} cannot play; a currently covered starting slot would be left unfilled.`,
    related_player_ids: [position] };
}
for (const position of ["QB", "TE"] as const) test(`${position} repeats consolidate without losing the player, weeks or consequence`, () => {
  const actions = [10,11,12,13,14].map(week => depth(position,week));
  const before = structuredClone(actions);
  const rows = presentRecommendations(actions);
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.reason, /no backup in Weeks 10–14; if they cannot play, a starting slot is empty/);
  assert.ok(rows[0]!.reason.includes(position === "QB" ? "Joe Burrow" : "Sam LaPorta"));
  assert.deepEqual(rows[0]!.sources, before);
  assert.deepEqual(actions, before);
});
test("ACT NOW and separate real bye-week problems remain separate, ahead of watches", () => {
  const bye = (week: number, urgency: string): AnalysisRecord => ({ category: "bye_week", urgency,
    position_or_slot: "QB", week, title: `Add a QB for Week ${week}`, reason: "Starter is on bye.", related_player_ids: ["QB"] });
  const actions = [depth("TE",10), bye(13,"watch"), bye(11,"act_now"), bye(10,"act_now"), bye(14,"watch"), depth("TE",11)];
  const rows = presentRecommendations(actions);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => [row.urgency,row.week]), [["act_now",10],["act_now",11],["watch",10],["watch",13],["watch",14]]);
  assert.equal(rows.filter(row => row.sources[0]?.category === "bye_week").length, 4);
});
test("gaps, changed players, qualifiers, metadata and actionable drops prevent consolidation", () => {
  const base = depth("QB",10);
  const next = depth("QB",11);
  for (const changed of [{...next, week:12, title:depth("QB",12).title,reason:depth("QB",12).reason},
    {...next,related_player_ids:["another"]}, {...next,reason:`${next.reason} Bye status unknown.`},
    {...next,extraRisk:"unknown"}, {...next,recommended_drop:{player_id:"drop"}}, {...next,urgency:"act_now"}]) {
    assert.equal(presentRecommendations([base,changed]).length, 2);
  }
});
test("interleaved QB/TE warnings consolidate independently and preserve every action", () => {
  const actions = [10,11,12,13,14].flatMap(week => [depth("QB",week),depth("TE",week)]);
  const rows = presentRecommendations(actions);
  assert.equal(rows.length, 2);
  assert.equal(rows.flatMap(row => row.sources).length, actions.length);
  assert.ok(actions.every(action => rows.some(row => row.sources.includes(action))));
});
test("unrecognized reasons stay verbatim rather than being compressed speculatively", () => {
  const action = {...depth("TE",10), reason:"FLEX cover depends on Player A; Player B is Questionable."};
  assert.equal(presentRecommendations([action])[0]!.reason, action.reason);
});
test("a distant watch is not treated as near-term when earlier weeks have no actions", () => {
  const plan = {...depth("QB",14), urgency:"plan_ahead"};
  const watch = depth("TE",15);
  assert.deepEqual(presentRecommendations([watch,plan],10).map(row=>row.week),[14,15]);
});
