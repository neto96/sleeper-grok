import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
register("../../../src/lib/sleeper/resolve-ts-hook.mjs", import.meta.url);
const { bundledCapture: capture, bundledSourceNote } = await import("../../../src/lib/ros-quality/bundled.ts");
const { rosAssets } = await import("../../../src/lib/local-quality/model.ts");
const { decisionContext } = await import("../../../src/lib/local-quality/waiver-context.ts");
const { makeProjectionSnapshot } = await import("../../browser/fixture.ts");
const { snapshotJson, buildMarkdown } = await import("../../../src/lib/sleeper/format.ts");
const { projectedWaivers } = await import("../../../src/lib/sleeper/waiver-valuation.ts");
const { priorityWaiverGroups } = await import("../../../src/lib/sleeper/priority-waivers.ts");
const { analyzeTrade } = await import("../../../src/lib/sleeper/trade-analyzer.ts");
const now = "2026-11-18T12:00:00Z";
function snapshot() {
 const s = makeProjectionSnapshot();
 s.analysisWaiverPool = capture.records.slice(0,30).map((r,i)=>({player_id:`bundled-test-${i}`,name:r.evidence.player.name,position:r.evidence.player.position,team:r.team,status:"Active",injury_status:null}));
 return s;
}
test("approved 223 offensive ALL records retain source provenance, annotations and unresolved identities",()=>{
 assert.equal(capture.records.length,223);
 assert.deepEqual(capture.mappings,{}); assert.deepEqual(capture.players,[]);
 for(const {evidence:e} of capture.records){
  assert.equal(e.sourceAsOfDate,"2026-11-17");assert.equal(e.sourceUpdatedAt,null);
  assert.equal(e.season,2026); assert.equal(e.scoring,"PPR"); assert.equal(e.rankingType,"ROS");
  assert.equal(e.pool.kind,"overall"); assert.equal(e.pool.position,null);
  assert.equal(e.player.sleeperId,null); assert.equal(e.player.identityResolved,false);
  assert.ok(["RB","WR","TE","QB"].includes(e.player.position));
  assert.ok(e.overallEcr!>0); assert.match(e.sourceNote,/Bundled Week 11/);
 }
});
test("source label is fixed and expired evidence stays withheld, not refreshed by Sleeper",()=>{
 assert.match(bundledSourceNote(now),/Nov 17, 2026.*Refresh updates Sleeper only/);
 assert.doesNotMatch(bundledSourceNote(now),/stale/);
 const later="2026-11-21T12:00:00Z";
 assert.match(bundledSourceNote(later),/stale/);
 assert.equal(rosAssets(capture,snapshot(),later).rows.length,0);
 assert.equal(rosAssets(capture,snapshot(),later).diagnostics.stale,30);
});
test("fresh roster and status changes recompute against the identical bundle",()=>{
 const s=snapshot(), original=JSON.stringify(capture),v=rosAssets(capture,s,now);
 assert.equal(v.rows.length,30);
 const next=structuredClone(s), p=next.analysisWaiverPool[0];
 next.fetchedAt="2026-11-18T13:00:00Z";
 next.teams[0].bench.push({...next.teams[0].bench[0],playerId:String(p.player_id),name:String(p.name),position:String(p.position),nflTeam:String(p.team)});
 const after=rosAssets(capture,next,now);
 assert.equal(after.rows.length,29);assert.ok(!after.rows.some(r=>r.id===p.player_id));
 assert.equal(JSON.stringify(capture),original);
});
test("quality decoration leaves waiver, projections, trade, Markdown and snapshot byte-identical",()=>{
 const s=snapshot();
 const observe=()=>JSON.stringify({s,json:snapshotJson(s),md:buildMarkdown(s),priority:priorityWaiverGroups(s),projection:projectedWaivers(s),trade:analyzeTrade(s,{teamAId:s.myRosterId,teamBId:20,teamAPlayerIds:[`${s.myRosterId}-4`],teamBPlayerIds:["20-4"]})});
 const before=observe();decisionContext(rosAssets(capture,s,now),s,projectedWaivers(s));
 assert.equal(observe(),before);assert.equal(snapshotJson(s).snapshot_version,"3.2");
});
test("bundled boundary contains no fetch, auth, local paths or raw provider links",async()=>{
 const data=await readFile("src/lib/ros-quality/week11-2026.json","utf8");
 assert.doesNotMatch(data,/https?:|api.key|token|authorization|local-data|more_info_link/i);
 for(const f of ["src/components/waiver-ros-assets.tsx","src/components/ros-assets.tsx","src/lib/ros-quality/bundled.ts"])
  assert.doesNotMatch(await readFile(f,"utf8"),/fetch\(|api\.fantasypros|x-api-key|authorization/i);
 const wrapper=await readFile("src/components/waiver-ros-assets.tsx","utf8");
 assert.match(wrapper,/LOCAL_QUALITY_ENABLED/);assert.match(wrapper,/capture={bundledCapture}/);
});
