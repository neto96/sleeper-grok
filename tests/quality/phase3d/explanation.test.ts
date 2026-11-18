import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { decisionContext, availabilityLabel } =
  await import("../../../src/lib/local-quality/waiver-context.ts");
const { makeProjectionSnapshot } = await import("../../browser/fixture.ts");
import type { RosView } from "../../../src/lib/local-quality/waiver-context.ts";
import type { ProjectedWaivers } from "../../../src/lib/sleeper/waiver-valuation.ts";
function inputs() {
  const view: RosView = {
    rows: [
      {
        id: "a",
        name: "Alpha",
        position: "QB",
        team: "TST",
        rank: 79,
        positionalRank: 10,
        status: "current",
        freshness: "source date",
        asOf: "2026-11-17",
      },
    ],
    available: 1,
    diagnostics: { unresolved: 0, stale: 0, missing: 0, unsupported: 0, positionalOnly: 0 },
  };
  const s = makeProjectionSnapshot();
  s.analysisWaiverPool = [
    { player_id: "a", position: "QB", team: "TST", status: "Active", injury_status: null },
  ];
  s.actionableWaiverAnalysis = {
    available: true,
    candidates: [{ player_id: "a", name: "Alpha", position: "QB", team_need: "high" }],
  };
  const projected: ProjectedWaivers = {
    status: "ready",
    reason: null,
    dropName: null,
    rows: [
      { playerId: "a", name: "Alpha", position: "QB", delta: 4.8, reason: null, uncertain: false },
    ],
  };
  return { view, s, projected };
}
test("full agreement retains projected metric and existing need label", () => {
  const { view, s, projected } = inputs();
  const r = decisionContext(view, s, projected);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /All three views agree: Alpha/);
  assert.match(r.lines[0], /\+4.80 pts\/week/);
  assert.match(r.lines[0], /QB need/);
});
test("ROS vs projected disagreement describes evidence, not guessed causation", () => {
  const { view, s, projected } = inputs();
  projected.rows[0].playerId = "b";
  projected.rows[0].name = "Beta";
  const r = decisionContext(view, s, projected);
  assert.deepEqual(r.notes, [
    "ROS asset strength and projected lineup change favor different players.",
  ]);
  assert.ok(!r.notes.join(" ").includes("immediately"));
});
test("ROS vs waiver disagreement and projected-model agreement are concise", () => {
  const { view, s, projected } = inputs();
  s.actionableWaiverAnalysis!.candidates = [
    { player_id: "b", name: "Beta", position: "WR", team_need: "critical" },
  ];
  projected.rows[0] = { ...projected.rows[0], playerId: "b", name: "Beta" };
  let r = decisionContext(view, s, projected);
  assert.equal(r.lines.length, 2);
  assert.ok(
    r.lines.some(
      (x) => x.includes("projected + waiver model leader: Beta") && x.includes("WR need"),
    ),
  );
  projected.status = "unavailable";
  r = decisionContext(view, s, projected);
  assert.deepEqual(r.notes, ["ROS and current waiver-model rankings favor different players."]);
});
for (const [injury, label] of [
  ["Out", "currently unavailable"],
  ["Questionable", "questionable"],
])
  test(`ROS leader ${injury} preserves order and uses one explanation`, () => {
    const { view, s, projected } = inputs();
    s.analysisWaiverPool[0].injury_status = injury;
    projected.rows[0].playerId = "b";
    const before = JSON.stringify(view);
    const r = decisionContext(view, s, projected);
    assert.deepEqual(r.notes, [`ROS leader is ${label}; ROS order is unchanged.`]);
    assert.equal(JSON.stringify(view), before);
  });
test("bye wording uses verified current-week schedule only", () => {
  const { view, s, projected } = inputs();
  s.fantasyAnalysis.priority_bye_schedule = {
    available: true,
    start_week: s.week,
    end_week: s.week,
    bye_weeks_by_team: { TST: [s.week] },
  };
  assert.equal(availabilityLabel(s, "a"), `Bye Week ${s.week}`);
  assert.match(decisionContext(view, s, projected).notes[0], /on bye/);
  s.fantasyAnalysis.priority_bye_schedule = { available: false };
  assert.equal(availabilityLabel(s, "a"), null);
});
test("partial coverage groups shared choices without claiming consensus", () => {
  const { view, s, projected } = inputs();
  view.available = 588;
  const r = decisionContext(view, s, projected);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /listed choice/);
  assert.ok(!r.lines[0].includes("agree"));
  assert.deepEqual(r.notes, [
    "ROS coverage is partial; unranked or unmatched players remain unknown.",
  ]);
});
test("missing metrics and unreliable need labels omitted", () => {
  const { view, s, projected } = inputs();
  projected.rows[0].delta = null;
  s.actionableWaiverAnalysis!.candidates = [
    { player_id: "a", name: "Alpha", position: "QB", team_need: "unknown" },
  ];
  let r = decisionContext(view, s, projected);
  assert.ok(!r.lines.join(" ").includes("pts/week"));
  assert.ok(!r.lines.join(" ").includes("QB need"));
  s.actionableWaiverAnalysis!.candidates = [
    { player_id: "a", name: "Alpha", position: "QB", team_need: "low" },
  ];
  assert.ok(!decisionContext(view, s, projected).lines.join(" ").includes("QB need"));
});
test("all inputs and ranking orders remain unchanged", () => {
  const x = inputs();
  const before = JSON.stringify(x);
  decisionContext(x.view, x.s, x.projected);
  assert.equal(JSON.stringify(x), before);
});

test("no projected leader is implied when all metrics are absent", () => {
  const {view,s,projected}=inputs(); projected.rows[0].delta=null;
  const r=decisionContext(view,s,projected);
  assert.ok(!r.notes.some(n=>n.includes("Projected leader")));
});
