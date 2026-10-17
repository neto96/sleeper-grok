import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFantasyAnalysis, buildActionableWaiverAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./analysis/engine.ts";
import { presentActionableWaiverAnalysis } from "./format.ts";
import { priorityByeStatus, selectPriorityCandidates } from "./priority-candidates.ts";
import { priorityWaiverGroups } from "./priority-waivers.ts";
import { buildTeamRecommendations } from "./analysis/recommendations.ts";

const configuration = parseRosterConfiguration(["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"]);
const schedule: AnalysisRecord = { available: true, start_week: 6, end_week: 10, bye_weeks_by_team: { BYE: [7], OK: [], OTHER: [8] } };
function fixture(position: string) {
  const fantasy = buildFantasyAnalysis({ "1": { team_name: "Mine", players: [], starters: [], reserve: [], taxi: [] } }, configuration);
  fantasy.priority_bye_schedule = schedule;
  const pool = [
    { player_id: "bye", team: "BYE", search_rank: 1 },
    { player_id: "healthy", team: "OK", search_rank: 2 },
    { player_id: "different-week", team: "OTHER", search_rank: 3 },
    { player_id: "questionable", team: "OK", search_rank: 4, injury_status: "Questionable" },
    { player_id: "out", team: "OK", search_rank: 1, injury_status: "Out" },
  ].map(p => ({ position, name: p.player_id, status: "Active", injury_status: null, ...p }));
  return { fantasy, pool, waiver: presentActionableWaiverAnalysis(fantasy, pool, 1) };
}
for (const position of ["QB", "RB", "WR", "TE"]) {
  test(`${position}: target-week byes excluded before three-option limit; raw rankings unchanged`, () => {
    const { fantasy, pool, waiver } = fixture(position);
    const full = buildActionableWaiverAnalysis(pool, fantasy, 1).candidates as AnalysisRecord[];
    assert.deepEqual(waiver.candidates, full);
    assert.deepEqual(waiver.positional_candidates, full.slice(0, 3));
    const before = structuredClone(waiver);
    const selected = selectPriorityCandidates(waiver, position, 7, configuration, schedule);
    assert.deepEqual(selected.map(p => p.player_id), ["healthy", "different-week", "questionable"]);
    assert.ok(selected.every(p => p.target_week_bye_status === "eligible"));
    assert.deepEqual(selected.map(({ target_week_bye_status, ...p }) => p), full.filter(p => p.player_id !== "bye"));
    assert.deepEqual(selectPriorityCandidates(waiver, position, 6, configuration, schedule).map(p => p.player_id), ["bye", "healthy", "different-week"]);
    assert.deepEqual(waiver, before);
    const team: AnalysisRecord = { positions: { [position]: [{ player_id: "rostered", name: "Rostered Player" }] }, future_readiness: { bye_schedule_available: true, weeks: { "7": { positions: { [position]: { status: "uncovered", urgency: "act_now", affected_player_ids: ["rostered"] } } } } } };
    const action = buildTeamRecommendations(team, waiver, configuration, schedule).actions[0]!;
    assert.match(action.reason, /Rostered Player is on bye/);
    assert.match(action.reason, /Best available options: healthy, different-week, and questionable/);
    assert.ok(!action.related_player_ids.includes("bye"));
    team.recommendations = { actions: [action] } as unknown as AnalysisRecord;
    const groups = priorityWaiverGroups({ myRosterId: 1, fantasyAnalysis: { teams: { "1": team }, roster_configuration: configuration, priority_bye_schedule: schedule }, actionableWaiverAnalysis: waiver, waiverByPosition: {} });
    assert.deepEqual(groups[0]?.candidates, selected);
  });
}

test("missing, incomplete, out-of-range and malformed schedule evidence stays explicitly unknown", () => {
  const { fantasy, pool } = fixture("RB");
  for (const context of [{}, { ...schedule, available: false }, { ...schedule, bye_weeks_by_team: {} }, { ...schedule, end_week: 6 }, { ...schedule, bye_weeks_by_team: { BYE: ["7"], OK: null, OTHER: [99] } }]) {
    fantasy.priority_bye_schedule = context;
    const waiver = presentActionableWaiverAnalysis(fantasy, pool, 1);
    const selected = selectPriorityCandidates(waiver, "RB", 7, configuration, context);
    assert.equal(selected.length, 3);
    assert.ok(selected.every(p => p.target_week_bye_status === "unknown"));
    const team = { future_readiness: { bye_schedule_available: true, weeks: { "7": { positions: { RB: { status: "uncovered", urgency: "act_now", affected_player_ids: [] } } } } } };
    assert.match(buildTeamRecommendations(team, waiver, configuration, context).actions[0]!.reason, /Target-week bye status is unknown/);
  }
  assert.equal(priorityByeStatus({ team: null }, 7, schedule), "unknown");
  assert.equal(priorityByeStatus({ team: "OK" }, null, schedule), "unknown");
  assert.equal(priorityByeStatus({ team: "bye" }, 7, schedule), "on_bye");
});

test("all target-week candidates on bye leaves an empty priority need, not a generic fallback", () => {
  const { fantasy, pool } = fixture("RB");
  const waiver = presentActionableWaiverAnalysis(fantasy, pool.filter(p => p.player_id === "bye"), 1);
  assert.equal((waiver.candidates as AnalysisRecord[]).length, 1);
  assert.deepEqual(selectPriorityCandidates(waiver, "RB", 7, configuration, schedule), []);
});

test("FLEX respects configured positions and keeps the full ranking order after bye exclusion", () => {
  const { fantasy, pool } = fixture("RB");
  const waiver = presentActionableWaiverAnalysis(fantasy, [...pool, { ...pool[1], player_id: "wr", position: "WR" }], 1);
  const full = buildActionableWaiverAnalysis([...pool, { ...pool[1], player_id: "wr", position: "WR" }], fantasy, 1).candidates as AnalysisRecord[];
  assert.deepEqual(selectPriorityCandidates(waiver, "FLEX", 7, configuration, schedule).map(p => p.player_id), full.filter(p => p.team !== "BYE").slice(0, 3).map(p => p.player_id));
});

test("a missing team entry stays unknown alongside confirmed eligible candidates", () => {
  const { fantasy, pool } = fixture("RB");
  const incomplete = { ...schedule, bye_weeks_by_team: { BYE: [7], OK: [] } };
  fantasy.priority_bye_schedule = incomplete;
  const waiver = presentActionableWaiverAnalysis(fantasy, pool, 1);
  const candidates = selectPriorityCandidates(waiver, "RB", 7, configuration, incomplete);
  assert.deepEqual(candidates.map(p => [p.player_id, p.target_week_bye_status]), [
    ["healthy", "eligible"], ["different-week", "unknown"], ["questionable", "eligible"],
  ]);
});

test("K/DEF raw priority selection is unchanged by offensive target-week schedule filtering", () => {
  for (const slot of ["K", "DEF"]) {
    const raw = { playerId: slot, name: slot, position: slot, nflTeam: "BYE", status: "Active", injuryStatus: null, searchRank: 1 };
    const actions = [{ urgency: "act_now", category: slot === "K" ? "k_stream" : "def_stream", position_or_slot: slot, week: 7 }];
    const base = { myRosterId: 1, fantasyAnalysis: { roster_configuration: configuration, teams: { "1": { recommendations: { actions } } } }, actionableWaiverAnalysis: { available: true, candidates: [] }, waiverByPosition: { [slot]: [raw] } };
    const withSchedule = { ...base, fantasyAnalysis: { ...base.fantasyAnalysis, priority_bye_schedule: schedule } };
    assert.deepEqual(priorityWaiverGroups(withSchedule), priorityWaiverGroups(base));
    assert.equal(priorityWaiverGroups(withSchedule)[0]?.candidates[0]?.player_id, slot);
  }
});
