import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
register("./resolve-ts-hook.mjs", import.meta.url);
const { makeSnapshot, makeProjectionSnapshot } = await import("../../../tests/browser/fixture.ts");
const { buildMarkdown, snapshotJson } = await import("./format.ts");
const { analyzeTrade } = await import("./trade-analyzer.ts");
const { tradeSummary } = await import("./trade-presentation.ts");
const { buildTradeMarkdown } = await import("./trade-markdown.ts");
const { presentRecommendations } = await import("./recommendation-presentation.ts");
const { priorityWaiverGroups } = await import("./priority-waivers.ts");
const { projectedWaivers } = await import("./waiver-valuation.ts");
import type { AnalysisRecord } from "./analysis/engine.ts";

for (const projected of [false,true]) test(`presentation preserves complete analysis, verdicts and waiver rankings (${projected ? "projections" : "structural"})`, (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-11-10T06:00:00Z"));
  const snapshot = projected ? makeProjectionSnapshot() : makeSnapshot();
  const original = structuredClone(snapshot);
  const request = {teamAId:snapshot.myRosterId,teamBId:20,teamAPlayerIds:[`${snapshot.myRosterId}-4`],teamBPlayerIds:["20-4"]};
  const trade = analyzeTrade(snapshot,request);
  const tradeBefore = structuredClone(trade);
  const groups = priorityWaiverGroups(snapshot);
  const ranking = projectedWaivers(snapshot,`${snapshot.myRosterId}-4`);
  const json = snapshotJson(snapshot);
  const markdown = buildMarkdown(snapshot);
  const team = (snapshot.fantasyAnalysis.teams as Record<string, AnalysisRecord>)[String(snapshot.myRosterId)]!;
  const actions = (team.recommendations as AnalysisRecord).actions as AnalysisRecord[];
  const summaries = presentRecommendations(actions);
  assert.equal(summaries.flatMap(row=>row.sources).length,actions.length);
  if (trade.valid) {
    const text = buildTradeMarkdown(snapshot,request,trade);
    for (const impact of [trade.teamA,trade.teamB]) {
      const summary = tradeSummary(impact);
      assert.ok(summary.length<=3);
      assert.ok(text.includes(impact.verdict));
      for (const reason of impact.reasons) {
        if (!/^Requires \d+ follow-up drop/.test(reason)) assert.ok(text.includes(reason),reason);
      }
    }
  }
  assert.match(markdown,/App version: V3\.6\.1/);
  assert.match(markdown,/Analysis engine: V3\.5\.1/);
  assert.equal(snapshotJson(snapshot).snapshot_version,"3.2");
  assert.deepEqual(snapshot,original);
  assert.deepEqual(trade,tradeBefore);
  assert.deepEqual(analyzeTrade(snapshot,request),tradeBefore);
  assert.deepEqual(priorityWaiverGroups(snapshot),groups);
  assert.deepEqual(projectedWaivers(snapshot,`${snapshot.myRosterId}-4`),ranking);
  assert.deepEqual(snapshotJson(snapshot),json);
});
test("trade shortlist keeps cuts and incoming status even when engine reasons are truncated", () => {
  const snapshot = makeSnapshot();
  const trade = analyzeTrade(snapshot,{teamAId:snapshot.myRosterId,teamBId:20,teamAPlayerIds:[`${snapshot.myRosterId}-4`],teamBPlayerIds:["20-4","20-5","20-1"]});
  assert.ok(trade.valid);
  const impact = trade.teamA;
  const before = structuredClone(impact);
  const summary = tradeSummary(impact).join(" ");
  assert.match(summary,/Needs 2 follow-up cuts/);
  assert.match(summary,/Beta QB 2 \(Out\)/);
  assert.match(summary,/Beta WR 6 \(Questionable\)/);
  assert.deepEqual(impact,before);
});
