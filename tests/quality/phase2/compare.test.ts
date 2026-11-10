import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { scenarios } = await import("./scenarios.ts");
const { compareScenario, curves, optimize } = await import("./compare.ts");
const { compareAll, renderDecisionReport } = await import("./report.ts");
const { makeSnapshot, makeProjectionSnapshot } = await import("../../browser/fixture.ts");
const { snapshotJson } = await import("../../../src/lib/sleeper/format.ts");
const { analyzeTrade } = await import("../../../src/lib/sleeper/trade-analyzer.ts");
const { projectedWaivers } = await import("../../../src/lib/sleeper/waiver-valuation.ts");
const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/shadow-quality-week10.json", import.meta.url), "utf8"),
);
const fixtures = () => scenarios(fixture);
const scenario = (id: string) => fixtures().find((s) => s.id === id)!;
const result = (id: string) => compareScenario(scenario(id), fixture.policy);
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
test("15 deterministic scenarios cover all requested cases and curves", () => {
  const a = compareAll(fixture);
  assert.equal(a.length, 15);
  assert.deepEqual(a, compareAll(fixture));
  for (const r of a) assert.equal(r.comparisons.length, r.blocked.length ? 0 : 3);
  assert.ok(a.some((r) => r.outcome === "curve-sensitive"));
  assert.ok(a.some((r) => r.outcome === "unchanged"));
  assert.equal(a.filter((r) => r.outcome === "blocked").length, 3);
});
test("Jacobs/Love flattening changes starter, replacement and surplus without availability contamination", () => {
  const r = result("jacobs-love");
  assert.ok(r.categories.includes("legacy_flattening"));
  for (const c of r.comparisons) {
    assert.equal(r.names[c.ros.lineup[0].id!], "Josh Jacobs");
    assert.equal(r.names[c.changes[0].displaced!], "Jeremiyah Love");
    assert.equal(c.changes[0].legacyScoreDifference, 0);
    assert.ok(c.changes[0].qualityIndexDifference > 0);
    assert.equal(c.effects.surplus, true);
    assert.equal(c.effects.replacement, true);
  }
});
test("LaPorta FLEX and positional replacement remain different questions", () => {
  const flex = result("laporta-flex");
  assert.ok(flex.comparisons.every((c) => flex.names[c.ros.lineup[0].id!] === "Rome Odunze"));
  const pool = result("replacement-pool");
  for (const c of pool.comparisons) {
    assert.equal(pool.names[c.ros.lineup.find((x) => x.slot === "TE")!.id!], "Sam LaPorta");
    assert.ok(c.replacement.find((p) => pool.names[p.id] === "Sam LaPorta")!.loss > 0);
  }
});
test("adjacent boundary is a real legacy cliff with a small smooth quality difference", () => {
  const r = result("adjacent-cliff");
  assert.ok(r.categories.includes("legacy_cliff"));
  for (const c of r.comparisons) {
    assert.equal(c.changes[0].legacyScoreDifference, -101);
    assert.ok(c.changes[0].qualityIndexDifference > 0 && c.changes[0].qualityIndexDifference < 1);
  }
});
test("availability does not erase ROS quality or silently change current eligibility", () => {
  const r = result("waddle-out");
  for (const c of r.comparisons) {
    assert.equal(r.names[c.ros.lineup[0].id!], "Jaylen Waddle");
    assert.equal(r.names[c.current.lineup[0].id!], "Rome Odunze");
    assert.deepEqual(c.current.lineup, r.legacy.current);
  }
  assert.ok(r.categories.includes("quality_vs_availability"));
});
test("missing, stale, incompatible pool and identity evidence block full comparisons", () => {
  for (const id of ["wilson-missing", "stale-laporta", "trade-missing"]) {
    const r = result(id);
    assert.equal(r.outcome, "blocked");
    assert.deepEqual(r.comparisons, []);
  }
  for (const mutate of [
    (s: ReturnType<typeof scenario>) => {
      s.roster[0].evidence.pool.id = "foreign";
    },
    (s: ReturnType<typeof scenario>) => {
      s.roster[0].evidence.player.sleeperId = "other";
    },
    (s: ReturnType<typeof scenario>) => {
      s.roster[0].evidence.player.identityResolved = false;
    },
  ]) {
    const s = scenario("jacobs-love");
    mutate(s);
    assert.equal(compareScenario(s, fixture.policy).outcome, "blocked");
  }
  assert.ok(result("trade-missing").projection!.meanDelta! > 0);
});
test("waiver structural, ROS and projected views remain separate; bye never becomes missing", () => {
  const r = result("immediate-wr-bye");
  assert.equal(r.names[String(r.waiverLegacy[0].player_id)], "Courtland Sutton");
  for (const c of r.comparisons) assert.equal(r.names[c.waiver[0].id], "Courtland Sutton");
  assert.equal(r.names[r.waiverProjection[0].id], "Ja'Kobi Lane");
  assert.equal(r.waiverProjection.find((p) => r.names[p.id] === "Courtland Sutton")!.meanDelta, 0);
  const s = scenario("immediate-wr-bye");
  delete s.points[s.incoming[0].id];
  const missing = compareScenario(s, fixture.policy).waiverProjection.find(
    (p) => p.id === s.incoming[0].id,
  )!;
  assert.equal(missing.meanDelta, null);
});
test("multi-player curve sensitivity, best asset, legal cuts and open spots are explicit", () => {
  const r = result("two-for-one-cuts");
  assert.equal(r.stability, "curve-sensitive");
  assert.equal(r.requiredDrops, 1);
  assert.equal(r.remainingRequiredDrops, 0);
  assert.ok(r.projection!.meanDelta! > 0);
  assert.ok(r.comparisons.every((c) => c.trade!.bestOutgoing > c.trade!.bestIncoming));
  assert.ok(new Set(r.comparisons.map((c) => c.trade!.grossDirection)).size > 1);
  const unresolved = result("two-for-one-unresolved");
  assert.equal(unresolved.projection!.meanDelta, null);
  assert.ok(unresolved.projection!.blocked);
  assert.ok(unresolved.comparisons.every((c) => c.trade!.netAssetDelta === null));
  const consolidation = result("three-for-one");
  assert.equal(consolidation.openSpots, 2);
  assert.ok(consolidation.projection!.meanDelta! > 0);
  const cut = result("costly-cut");
  assert.equal(cut.preCutProjection!.meanDelta, 0);
  assert.ok(cut.projection!.meanDelta! < 0);
});
test("weaker asset can leave while existing projected lineup improves", () => {
  const r = result("weaker-out-improves");
  assert.ok(r.comparisons.every((c) => c.trade!.bestIncoming > c.trade!.bestOutgoing));
  assert.ok(r.projection!.meanDelta! > 0);
});
test("solver is legal, deterministic and handles no players, repeated slots and eligibility", () => {
  const s = scenario("replacement-pool"),
    scores = Object.fromEntries(s.roster.map((p, i) => [p.id, 10 + i]));
  const a = optimize(s.roster, ["WR", "FLEX"], scores);
  assert.equal(new Set(a.lineup.map((x) => x.id)).size, 2);
  assert.equal(s.roster.find((p) => p.id === a.lineup[0].id)!.position, "WR");
  assert.deepEqual(a, optimize(s.roster, ["WR", "FLEX"], scores));
  assert.equal(optimize([], ["WR"], {}).lineup[0].id, null);
  assert.throws(() => optimize(s.roster, s.slots, {}), /Missing shadow score/);
});
test("duplicate identities and illegal selected cuts fail closed", () => {
  const s = scenario("two-for-one-cuts");
  s.drops = ["not-on-roster"];
  assert.throws(() => compareScenario(s, fixture.policy), /Invalid cut/);
  const d = scenario("jacobs-love");
  d.roster.push(d.roster[0]);
  d.capacity = d.roster.length;
  assert.throws(() => compareScenario(d, fixture.policy), /Duplicate/);
});
test("inputs remain deeply unchanged and report is deterministic and complete", () => {
  const copy = structuredClone(fixture),
    s = fixtures(),
    before = structuredClone(s);
  for (const item of s) compareScenario(item, fixture.policy);
  const report = renderDecisionReport(fixture);
  assert.deepEqual(s, before);
  assert.deepEqual(fixture, copy);
  assert.equal(report, renderDecisionReport(fixture));
  assert.equal(
    report,
    readFileSync(
      new URL("../../../docs/V3.7-PHASE2-DECISION-COMPARISON.md", import.meta.url),
      "utf8",
    ),
  );
  for (const term of [
    "SYNTHETIC",
    "not fantasy points",
    "Missing ECR",
    "Phase 3",
    "No production verdict",
    "Legacy structural package",
    "Required cuts",
    "quality-index loss",
    "Positional pools",
  ])
    assert.ok(report.includes(term), term);
});
for (const make of [makeSnapshot, makeProjectionSnapshot])
  test(`production byte-equivalence around Phase 2 execution: ${make.name}`, (t) => {
    t.mock.method(Date, "now", () => Date.parse("2026-11-10T12:00:00Z"));
    const snapshot = make(),
      copy = structuredClone(snapshot);
    const req = {
      teamAId: snapshot.myRosterId,
      teamBId: 20,
      teamAPlayerIds: [`${snapshot.myRosterId}-4`],
      teamBPlayerIds: ["20-4"],
    };
    const capture = () => ({
      snapshot,
      compatibility: snapshotJson(snapshot),
      trade: analyzeTrade(snapshot, req),
      waivers: projectedWaivers(snapshot, `${snapshot.myRosterId}-4`),
    });
    const before = hash(capture());
    compareAll(fixture);
    renderDecisionReport(fixture);
    assert.equal(hash(capture()), before);
    assert.deepEqual(snapshot, copy);
    assert.deepEqual(make(), copy);
    assert.equal(snapshotJson(snapshot).snapshot_version, "3.2");
  });
test("no production imports Phase 2; report harness has no network or implicit clock", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const walk = (p: string): string[] =>
    readdirSync(p, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(resolve(p, d.name)) : [resolve(p, d.name)],
    );
  for (const file of [...walk(resolve(root, "src")), ...walk(resolve(root, "server"))])
    if (/\.(ts|tsx|js|mjs)$/.test(file))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /quality\/phase2|phase2\/compare|phase2\/scenarios/,
      );
  for (const file of ["compare.ts", "scenarios.ts", "report.ts"])
    assert.doesNotMatch(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      /\bfetch\s*\(|\bDate\.now\s*\(/,
    );
});

test("per-decision stability distinguishes gross sensitivity from settled net cut impact", () => {
  const r = result("costly-cut");
  assert.equal(r.decisionStability.grossAssetDirection, "curve-sensitive");
  assert.equal(r.decisionStability.netAssetDirection, "same direction, different magnitude");
  assert.equal(
    result("two-for-one-unresolved").decisionStability.netAssetDirection,
    "unsupported until required cuts are selected",
  );
  for (const r of compareAll(fixture).filter((r) => r.blocked.length))
    assert.ok(Object.values(r.decisionStability).every((v) => v.startsWith("unsupported")));
});

test("positional consensus is not silently borrowed for overall lineup quality", () => {
  const s = scenario("jacobs-love");
  const source = fixture.players.find((p: { name: string }) => p.name === "Josh Jacobs");
  s.roster[1].evidence = structuredClone(
    source.evidence.find((e: { pool: { kind: string } }) => e.pool.kind === "position"),
  );
  const r = compareScenario(s, fixture.policy);
  assert.equal(r.outcome, "blocked");
  assert.deepEqual(r.comparisons, []);
});

test("missing all or partial waiver projections cannot imply a roster-fit disagreement", () => {
  for (const partial of [false, true]) {
    const s = scenario("immediate-wr-bye");
    if (partial) delete s.points[s.incoming[0].id];
    else s.points = {};
    const r = compareScenario(s, fixture.policy);
    assert.match(r.waiverProjectionStatus, /unsupported/);
    assert.deepEqual(r.projectedTopIds, []);
    assert.equal(r.material, false);
    assert.ok(!r.categories.includes("quality_vs_roster_fit"));
    assert.equal(r.comparisons.length, 3);
  }
});
test("full waiver roster requires a legal drop and does not publish an illegal gain", () => {
  const s = scenario("immediate-wr-bye");
  s.capacity = s.roster.length;
  const r = compareScenario(s, fixture.policy);
  assert.match(r.waiverProjectionStatus, /legal drop/);
  assert.ok(r.waiverProjection.every((row) => row.meanDelta === null && row.blocked));
  assert.equal(r.material, false);
  assert.deepEqual(r.projectedTopIds, []);
});
test("tied projected winners are not falsely separated by identity ordering", () => {
  const s = scenario("immediate-wr-bye");
  for (const p of [...s.roster, ...s.incoming]) s.points[p.id] = 5;
  const r = compareScenario(s, fixture.policy);
  assert.equal(r.waiverProjectionStatus, "ready");
  assert.equal(r.projectedTopIds.length, 4);
  assert.equal(r.material, false);
  assert.ok(!r.categories.includes("quality_vs_roster_fit"));
});
