import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRosterConfiguration, type AnalysisRecord } from "./analysis/engine.ts";
import { priorityWaiverGroups } from "./priority-waivers.ts";

function fixture(actions: AnalysisRecord[]) {
  return {
    myRosterId: 1,
    fantasyAnalysis: { roster_configuration: parseRosterConfiguration(["QB", "RB", "TE", "FLEX", "K", "DEF"]), teams: { "1": { recommendations: { actions } } } },
    actionableWaiverAnalysis: { available: true, candidates: [
      { player_id: "te", name: "Top TE", position: "TE", waiver_value_score: 100 },
      { player_id: "rb", name: "Top RB", position: "RB", waiver_value_score: 90 },
      ...["Kyler Murray", "C.J. Stroud", "Fernando Mendoza", "Fourth QB"].map((name, i) => ({ player_id: `qb${i}`, name, position: "QB", waiver_value_score: 60 - i })),
    ] },
    waiverByPosition: {},
  };
}
const urgent = (position_or_slot = "QB", week = 6): AnalysisRecord => ({ urgency: "act_now", category: "lineup_hole", position_or_slot, week });

test("urgent QB candidates retain source order and scores without mutating inputs", () => {
  const data = fixture([urgent()]);
  const before = structuredClone(data);
  const groups = priorityWaiverGroups(data);
  assert.equal(groups[0]?.title, "Priority Need: QB for Week 6");
  assert.deepEqual(groups[0]?.candidates.map(p => p.name), ["Kyler Murray", "C.J. Stroud", "Fernando Mendoza"]);
  assert.deepEqual(groups[0]?.candidates.map(p => p.waiver_value_score), [60, 59, 58]);
  assert.deepEqual(data, before);
});

test("no urgent add leaves normal presentation intact", () => {
  assert.deepEqual(priorityWaiverGroups(fixture([])), []);
  assert.deepEqual(priorityWaiverGroups(fixture([{ ...urgent(), urgency: "plan_ahead" }, { ...urgent(), category: "upgrade" }])), []);
});

test("multiple slots and weeks retained, exact duplicate groups removed, unsupported slots empty", () => {
  const groups = priorityWaiverGroups(fixture([urgent(), urgent(), urgent("RB"), urgent("QB", 7), urgent("UNKNOWN")]));
  assert.deepEqual(groups.map(g => [g.slot, g.week]), [["QB", 6], ["RB", 6], ["QB", 7], ["UNKNOWN", 6]]);
  assert.deepEqual(groups[3]?.candidates, []);
});

test("FLEX uses configured eligibility and excludes known unavailable candidates", () => {
  const data = fixture([urgent("FLEX")]);
  const config = data.fantasyAnalysis.roster_configuration;
  config.flex_slots = { FLEX: { count: 1, eligible_positions: ["TE"] } };
  assert.deepEqual(priorityWaiverGroups(data)[0]?.candidates.map(p => p.position), ["TE"]);
  Object.assign(data.actionableWaiverAnalysis.candidates[0]!, { availability: "unavailable" });
  assert.deepEqual(priorityWaiverGroups(data)[0]?.candidates, []);
});

test("K/DEF uses healthy raw pool without inventing scores", () => {
  const data = fixture([urgent("K")]);
  data.waiverByPosition = { K: [
    { playerId: "out", name: "Out", position: "K", nflTeam: "TST", status: "Active", injuryStatus: "Out", searchRank: 1 },
    { playerId: "healthy", name: "Healthy", position: "K", nflTeam: "TST", status: "Active", injuryStatus: null, searchRank: 2 },
    { playerId: "questionable", name: "Questionable", position: "K", nflTeam: "TST", status: "Active", injuryStatus: "Questionable", searchRank: 3 },
  ] };
  assert.deepEqual(priorityWaiverGroups(data)[0]?.candidates.map(p => p.name), ["Healthy", "Questionable"]);
  assert.equal(priorityWaiverGroups(data)[0]?.candidates[1]?.availability, "uncertain");
  assert.equal(priorityWaiverGroups(data)[0]?.candidates[0]?.waiver_value_score, undefined);
});

test("empty or unavailable actionable pool keeps explicit priority need with no candidates", () => {
  const data = fixture([urgent()]);
  data.actionableWaiverAnalysis.candidates = [];
  assert.deepEqual(priorityWaiverGroups(data)[0]?.candidates, []);
  data.actionableWaiverAnalysis.available = false;
  assert.equal(priorityWaiverGroups(data)[0]?.title, "Priority Need: QB for Week 6");
});
