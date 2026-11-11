import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { QualityFixture } from "../report.ts";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { runStudy, rosterStudy, quality, coverage } = await import("./study.ts");
const { renderReport } = await import("./report.ts");
const { makeSnapshot, makeProjectionSnapshot } = await import("../../browser/fixture.ts");
const { analyzeTrade } = await import("../../../src/lib/sleeper/trade-analyzer.ts");
const { projectedWaivers } = await import("../../../src/lib/sleeper/waiver-valuation.ts");
const { snapshotJson } = await import("../../../src/lib/sleeper/format.ts");
const read = (name: string) =>
  JSON.parse(readFileSync(new URL("../../fixtures/" + name, import.meta.url), "utf8"));
const { fixture: f, control, incomplete, waiverControl } = await import("./fixture.ts");
const capture = incomplete(),
  study = runStudy(capture, f);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
test("synthetic coverage accounting and incomplete roster blocking", () => {
  assert.equal(study.coverage.total, 14);
  assert.equal(study.coverage.counts.current, 13);
  assert.equal(study.coverage.counts.missing, 1);
  assert.equal(study.counts.fullyCovered, 0);
  assert.equal(study.counts.curveBlocked, 1);
  assert.ok(study.rosters[0].comparisons.every((c) => c.status === "blocked" && c.result === null));
  assert.equal(study.rosters[0].curveSensitive, null);
  for (const c of [study.coverage, ...Object.values(study.positions)])
    assert.equal(
      Object.values(c.counts).reduce((a, b) => a + b, 0),
      c.total,
    );
});
test("complete synthetic full roster evaluates every curve and removal legally", () => {
  const c = control(),
    r = rosterStudy(c, c.teams[0], f, f.policy);
  assert.equal(r.complete, true);
  for (const cmp of r.comparisons) {
    const x = cmp.result!;
    assert.equal(cmp.status, "ready");
    assert.equal(x.lineup.filter((x) => x.id).length, 7);
    assert.equal(new Set(x.lineup.map((x) => x.id)).size, 7);
    assert.equal(x.removals.length, 13);
    assert.ok(x.removals.every((r) => r.loss >= -1e-8));
    for (const change of x.lineup) {
      const p = r.players.find((p) => p.id === change.id)!;
      assert.ok(
        change.slot === "FLEX"
          ? ["RB", "WR", "TE"].includes(p.position)
          : change.slot === p.position,
      );
    }
  }
  assert.equal(r.counterfactuals.length, 13);
  assert.ok(r.counterfactuals.every((x) => x.shadow.every((y) => y.consequence !== null)));
  assert.deepEqual(
    r.comparisons.map((c) => c.result!.lineup.map((x) => x.id).sort()),
    Array(3).fill(r.comparisons[0].result!.lineup.map((x) => x.id).sort()),
  );
});
test("counterfactual known-player loss stays unknown with incomplete replacements", () => {
  const rows = study.rosters.flatMap((r) => r.counterfactuals);
  assert.equal(rows.length, 13);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.legacyLoss));
    assert.ok(r.shadow.every((x) => x.consequence === null));
    assert.equal(r.allCurvesAgree, null);
    assert.match(r.reason!, /lack quality/);
  }
});
test("missing stale unsupported unresolved and duplicate evidence are explicit", () => {
  const c = control(),
    r = rosterStudy(c, c.teams[0], f, f.policy),
    p = r.players;
  assert.equal(
    coverage(quality(p, f, { ...f.policy, now: "2026-11-15T14:00:00Z" })).counts.stale,
    13,
  );
  for (const [key, mutate] of [
    [
      "unsupported",
      (f: QualityFixture) => {
        f.players[0].evidence[0].scoring = "HALF";
      },
    ],
    [
      "identity_unresolved",
      (f: QualityFixture) => {
        f.players[0].evidence[0].player.identityResolved = false;
      },
    ],
    [
      "missing",
      (f: QualityFixture) => {
        f.players[0].evidence = f.players[0].evidence.filter((e) => e.pool.kind !== "overall");
      },
    ],
  ] as const) {
    const altered = structuredClone(f);
    mutate(altered);
    assert.equal(coverage(quality(p, altered, f.policy)).counts[key], 1);
  }
  const duplicate = structuredClone(f);
  duplicate.players.push(duplicate.players[0]);
  assert.equal(coverage(quality(p, duplicate, f.policy)).counts.unsupported, 1);
});
test("historical clocks reject future evidence without fabricating history", () => {
  const past = runStudy(control(), f, { ...f.policy, now: "2026-10-29T19:00:00Z" });
  assert.equal(past.coverage.counts.current, 0);
  assert.equal(past.coverage.counts.unsupported, 13);
});
test("available lineup differs from ROS evidence without altering quality scores", () => {
  const c = control();
  const id = c.teams[0].bench.find((p) => p.position === "QB")!.playerId;
  c.legacyTeams[String(c.teams[0].rosterId)].positions.QB[0].injury_status = "Out";
  const r = rosterStudy(c, c.teams[0], f, f.policy);
  assert.equal(r.coverage.counts.current, 13);
  for (const c of r.comparisons) {
    assert.ok(c.result!.lineup.some((p) => p.id === id));
    assert.ok(!c.result!.current.some((p) => p.id === id));
    assert.equal(c.result!.availabilitySensitive, true);
  }
});
test("synthetic waiver ROS vs immediate-help split and tied winners", () => {
  const c = waiverControl();
  const r = runStudy(c, f).waivers[0];
  assert.equal(r.projectedCommon!.topChoice, false);
  assert.deepEqual(r.projectedCommon!.tiedWinners, ["synthetic-13"]);
  assert.equal(r.rosLeaderBye, true);
  assert.equal(r.curveOrderAgreement, true);
  for (const p of c.projections!.players)
    p.weeks[0].points = p.playerId === "synthetic-5" ? 30 : p.weeks[0].points;
  const tied = runStudy(c, f).waivers[0];
  assert.equal(tied.projectedCommon!.topChoice, true);
  assert.equal(tied.projectedCommon!.tiedWinners.length, 4);
  assert.equal(tied.projectedCommon!.top3, null);
});
test("deterministic report and study do not mutate inputs", () => {
  const before = hash([capture, f]);
  assert.deepEqual(runStudy(capture, f), study);
  const report = renderReport(study);
  assert.equal(
    report,
    readFileSync(
      new URL("../../../docs/V3.7-PHASE2.5-EVIDENCE-AND-ACCESS.md", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(hash([capture, f]), before);
  assert.equal((report.match(/^### (READY|BLOCKED):/gm) ?? []).length, 1);
  assert.match(report, /BLOCKED: production quality source not established/);
});
for (const make of [makeSnapshot, makeProjectionSnapshot])
  test(`existing structural/projected outputs remain byte-identical: ${make.name}`, (t) => {
    t.mock.method(Date, "now", () => Date.parse("2026-11-10T12:00:00Z"));
    const s = make();
    const read = () => ({
      s,
      json: snapshotJson(s),
      trade: analyzeTrade(s, {
        teamAId: s.myRosterId,
        teamBId: 20,
        teamAPlayerIds: [`${s.myRosterId}-4`],
        teamBPlayerIds: ["20-4"],
      }),
      waivers: projectedWaivers(s, `${s.myRosterId}-4`),
    });
    const before = hash(read());
    runStudy(capture, f);
    assert.equal(hash(read()), before);
    assert.deepEqual(make(), s);
    assert.equal(snapshotJson(s).snapshot_version, "3.2");
  });
test("production has no imports of study or league research fixtures; research has no provider calls", () => {
  const root = resolve(import.meta.dirname, "../../.."),
    walk = (p: string): string[] =>
      readdirSync(p, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(resolve(p, d.name)) : [resolve(p, d.name)],
      );
  for (const file of [...walk(resolve(root, "src")), ...walk(resolve(root, "server"))])
    if (/\.(ts|tsx|js|mjs)$/.test(file))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /quality\/phase25|phase25-synthetic-quality|phase25-local-study-aggregates|nlfl-week10-shadow-study|nlfl-historical-shadow/,
      );
  assert.doesNotMatch(
    readFileSync(new URL("./study.ts", import.meta.url), "utf8"),
    /\bfetch\s*\(|\bDate\.now\s*\(/,
  );
});

test("public evidence contains only synthetic controls and aggregate findings", () => {
  const aggregate = read("phase25-local-study-aggregates.json");
  assert.match(aggregate.provenance, /cannot independently reconstruct/);
  assert.equal(aggregate.coverage.total, 150);
  assert.equal(aggregate.coverage.counts.current, 9);
  assert.equal(aggregate.waiverCoverage.total, 580);
  assert.equal(aggregate.waiverCoverage.counts.current, 4);
  assert.equal(aggregate.counts.fullyCovered, 0);
  assert.equal(aggregate.counts.startingLineupsCovered, 0);
  assert.doesNotMatch(
    JSON.stringify(aggregate),
    /playerId|player_id|rosterId|teamName|owner|username|projections|players|teams/,
  );
  assert.equal(f.players.length, 13);
  for (const p of f.players) {
    assert.match(p.name, /^Synthetic /);
    for (const e of p.evidence) {
      assert.match(e.player.sleeperId!, /^synthetic-/);
      assert.match(e.player.providerId!, /^synthetic-provider-/);
      assert.match(e.sourceNote!, /Synthetic rank/);
    }
  }
});
