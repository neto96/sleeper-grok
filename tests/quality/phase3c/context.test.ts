import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { visibleAssets, rosAnnotation, decisionContext, availabilityLabel } =
  await import("../../../src/lib/local-quality/waiver-context.ts");
const { rosAssets } = await import("../../../src/lib/local-quality/model.ts");
const { makeProjectionSnapshot } = await import("../../browser/fixture.ts");
const { snapshotJson, buildMarkdown } = await import("../../../src/lib/sleeper/format.ts");
const { projectedWaivers } = await import("../../../src/lib/sleeper/waiver-valuation.ts");
const { analyzeTrade } = await import("../../../src/lib/sleeper/trade-analyzer.ts");
const { priorityWaiverGroups } = await import("../../../src/lib/sleeper/priority-waivers.ts");
const { capture, now } = await import("../phase3a/fixture.ts");
import type { RosView } from "../../../src/lib/local-quality/waiver-context.ts";
import type { ProjectedWaivers } from "../../../src/lib/sleeper/waiver-valuation.ts";
function view(n = 30): RosView {
  return {
    rows: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `Synthetic ${i}`,
      position: i % 2 ? "RB" : "WR",
      team: "TST",
      rank: i + 1,
      positionalRank: i + 1,
      status: "current",
      freshness: "source date",
      asOf: "2026-11-17",
    })),
    available: n,
    diagnostics: { unresolved: 0, stale: 0, missing: 0, unsupported: 0, positionalOnly: 0 },
  };
}
function projection(id = "p0", delta: number | null = 2): ProjectedWaivers {
  return {
    status: "ready",
    reason: null,
    dropName: null,
    rows: [
      {
        playerId: id,
        name: `Synthetic ${id.slice(1)}`,
        position: "WR",
        delta,
        reason: null,
        uncertain: false,
      },
    ],
  };
}
function snapshot() {
  const s = makeProjectionSnapshot();
  s.actionableWaiverAnalysis = {
    available: true,
    candidates: [{ player_id: "p0", name: "Synthetic 0" }],
  };
  s.analysisWaiverPool = [
    {
      player_id: "p0",
      name: "Synthetic 0",
      position: "WR",
      team: "TST",
      status: "Active",
      injury_status: null,
    },
  ];
  return s;
}
test("default ten, expand to twenty-five; position filtering precedes limits", () => {
  const v = view(),
    before = JSON.stringify(v);
  assert.equal(visibleAssets(v, "All", false).rows.length, 10);
  assert.equal(visibleAssets(v, "All", true).rows.length, 25);
  assert.equal(visibleAssets(v, "RB", true).rows.length, 15);
  assert.ok(visibleAssets(v, "RB", false).rows.every((p) => p.position === "RB"));
  assert.equal(visibleAssets(v, "QB", false).rows.length, 0);
  assert.equal(JSON.stringify(v), before);
});
test("annotations follow candidate IDs without ordering and do not label unknown evidence unranked", () => {
  const v = view(),
    ids = ["p2", "absent", "p0"];
  assert.deepEqual(
    ids.map((id) => rosAnnotation(v, id)),
    ["ROS #3 · WR3", "ROS: no current matched rank", "ROS #1 · WR1"],
  );
  assert.deepEqual(ids, ["p2", "absent", "p0"]);
});
test("complete agreement collapses, partial agreement collapses only with complete evidence", () => {
  const v = view(),
    s = snapshot();
  assert.match(decisionContext(v, s, projection()).lines[0], /All three views agree/);
  s.actionableWaiverAnalysis!.candidates = [{ player_id: "p2", name: "Synthetic 2" }];
  assert.match(decisionContext(v, s, projection()).lines[0], /ROS \+ projected leader/);
  v.available++;
  const result = decisionContext(v, s, projection());
  assert.equal(result.lines.length, 3);
  assert.ok(result.notes.some((n) => n.includes("incomplete")));
});
test("disagreement preserves units; unavailability does not penalize rank", () => {
  const s = snapshot(),
    v = view();
  s.analysisWaiverPool[0].injury_status = "Out";
  const r = decisionContext(v, s, projection("p1", -0.5));
  assert.ok(r.lines.some((l) => l.includes("-0.50 pts/week")));
  assert.ok(r.notes.some((n) => n.includes("currently unavailable")));
  assert.ok(r.notes.some((n) => n.includes("different players")));
  assert.equal(availabilityLabel(s, "p0"), "Currently unavailable");
  assert.equal(v.rows[0].id, "p0");
});
test("missing ROS/projections are omitted; incomplete and tied evidence cannot claim consensus", () => {
  const s = snapshot();
  assert.equal(
    decisionContext(view(0), s, { ...projection(), status: "unavailable" }).lines.length,
    1,
  );
  assert.equal(decisionContext(view(), s, projection("p0", null)).lines.length, 2);
  const v = view();
  v.rows[1].rank = 1;
  assert.ok(!decisionContext(v, s, projection()).lines.some((l) => l.includes("agree")));
  const p = projection();
  p.rows.push({ ...p.rows[0], playerId: "unknown", delta: null });
  assert.ok(!decisionContext(view(), s, p).lines.some((l) => l.includes("agree")));
  assert.ok(decisionContext(view(), s, p).notes.some((n) => n.includes("measured candidates")));
});
test("quality context preserves snapshots, Markdown, priority order, projections and trade behavior", () => {
  const s = snapshot();
  const observe = () =>
    JSON.stringify({
      s,
      json: snapshotJson(s),
      md: buildMarkdown(s),
      priority: priorityWaiverGroups(s),
      projected: projectedWaivers(s),
      trade: analyzeTrade(s, {
        teamAId: s.myRosterId,
        teamBId: 20,
        teamAPlayerIds: [`${s.myRosterId}-4`],
        teamBPlayerIds: ["20-4"],
      }),
    });
  const before = observe(),
    v = rosAssets(capture(), s, now);
  visibleAssets(v, "RB", true);
  rosAnnotation(v, "p0");
  decisionContext(v, s, projectedWaivers(s));
  assert.equal(observe(), before);
  assert.equal(snapshotJson(s).snapshot_version, "3.2");
});
test("structural ties do not imply unique consensus", () => {
  const s = snapshot();
  s.actionableWaiverAnalysis!.candidates = [
    { player_id: "p0", name: "Synthetic 0", waiver_value_score: 10 },
    { player_id: "p1", name: "Synthetic 1", waiver_value_score: 10 },
  ];
  const result = decisionContext(view(), s, projection());
  assert.ok(!result.lines.some((l) => l.includes("agree")));
  assert.ok(result.notes.some((n) => n.includes("waiver score is tied")));
});
