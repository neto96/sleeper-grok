import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { evaluatePlayerQuality, experimentalQualityIndices } from "./player-quality.ts";
import { renderQualityReport, legacyScores, type QualityFixture } from "../../../tests/quality/report.ts";
register("./resolve-ts-hook.mjs",import.meta.url);
const {makeSnapshot,makeProjectionSnapshot}=await import("../../../tests/browser/fixture.ts");
const {analyzeTrade}=await import("./trade-analyzer.ts");
const {projectedWaivers}=await import("./waiver-valuation.ts");
const {snapshotJson}=await import("./format.ts");
const {fantasyValueTier,calculateRosterReplacementCost}=await import("./analysis/engine.ts");
const fixture=JSON.parse(readFileSync(new URL("../../../tests/fixtures/shadow-quality-week10.json",import.meta.url),"utf8")) as QualityFixture;
const policy=fixture.policy;
const evidence=()=>structuredClone(fixture.players[0]!.evidence[0]!);
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

const expected=[
 [1,100,100,100],[5,85.7,70.9,98.4],[10,72.7,58.3,96.4],[25,50,41.7,90.4],
 [50,32.9,29.2,80.3],[75,24.5,21.9,70.3],[100,19.5,16.7,60.2],[150,13.9,9.3,40.2],[200,10.8,4.1,20.1],
];
for(const [r,power,log,percentile] of expected) test(`fixed curve characterization at rank ${r}`,()=>{
 const q=experimentalQualityIndices(r!);
 assert.deepEqual(Object.values(q).map(n=>Number(n.toFixed(1))),[power,log,percentile]);
});
test("all adjacent ranks monotone and finite, including the tail",()=>{
 let previous=experimentalQualityIndices(1);
 for(let r=1.25;r<=10000;r+=0.25){
  const q=experimentalQualityIndices(r);
  for(const key of Object.keys(q) as (keyof typeof q)[]){assert.ok(Number.isFinite(q[key]));assert.ok(q[key]>=0&&q[key]<=previous[key]);}
  previous=q;
 }
 for(const r of [1e10,Number.MAX_VALUE]) assert.ok(Object.values(experimentalQualityIndices(r)).every(Number.isFinite));
 for(const r of [0,-1,NaN,Infinity]) assert.throws(()=>experimentalQualityIndices(r),RangeError);
});
test("no jumps at former tier boundaries or benchmark floors",()=>{
 for(const r of [5,10,25,50,51,75,100,120,150,200,250,251,400]){
  const left=experimentalQualityIndices(r-1e-7),right=experimentalQualityIndices(r+1e-7);
  for(const k of Object.keys(left) as (keyof typeof left)[])assert.ok(Math.abs(left[k]-right[k])<1e-4);
 }
 const gap=(a:number,b:number)=>experimentalQualityIndices(a).shiftedPower-experimentalQualityIndices(b).shiftedPower;
 assert.ok(gap(1,2)>gap(50,51));assert.ok(gap(50,51)<1);
});
test("provider pools retain conflicting ranks without blending",()=>{
 const p=fixture.players.find(p=>p.name === "Josh Jacobs")!;
 const [overall,positional]=p.evidence.map(e=>evaluatePlayerQuality(e,policy));
 assert.equal(overall!.evidence!.overallEcr,71);assert.equal(overall!.evidence!.positionalEcr,24);
 assert.equal(positional!.evidence!.positionalEcr,21);assert.equal(positional!.evidence!.overallEcr,null);
 assert.equal(overall!.indexRank,71);assert.equal(positional!.indexRank,21);
 assert.notEqual(overall!.evidence!.pool.id,positional!.evidence!.pool.id);
 assert.deepEqual(overall!.indices,experimentalQualityIndices(71));assert.deepEqual(positional!.indices,experimentalQualityIndices(21));
 const changed={...p.evidence[0]!,positionalEcr:1};
 assert.deepEqual(evaluatePlayerQuality(changed,policy).indices,overall!.indices);
});
test("missing overall does not borrow a positional annotation",()=>{
 const e=evidence();e.overallEcr=null;
 const q=evaluatePlayerQuality(e,policy);assert.equal(q.status,"missing");assert.equal(q.indices,null);
 const wilson=fixture.players.find(p=>p.name === "Michael Wilson")!;
 for(const row of wilson.evidence){const q=evaluatePlayerQuality(row,policy);assert.equal(q.status,"missing");assert.equal(q.indices,null);assert.match(q.notes.join(" "),/absence is not zero/);}
});
test("explicit clock and freshness policy withhold stale evidence",()=>{
 const e=evidence();
 assert.equal(evaluatePlayerQuality(e,policy).status,"current");
 const stale=evaluatePlayerQuality(e,{...policy,now:"2026-11-14T14:00:00Z"});
 assert.equal(stale.status,"stale");assert.equal(stale.indices,null);assert.equal(stale.evidence!.overallEcr,e.overallEcr);
 e.sourceUpdatedAt="2026-11-01T12:00:00Z";assert.equal(evaluatePlayerQuality(e,policy).status,"stale");
 e.sourceUpdatedAt=null;e.sourceAsOfDate="2026-11-01";assert.equal(evaluatePlayerQuality(e,policy).status,"stale");
 e.sourceAsOfDate=null;const coarse=evaluatePlayerQuality(e,policy);
 assert.equal(coarse.freshnessBasis,"retrieval_only");assert.match(coarse.notes.join(" "),/not verified expert update/);
});
test("identity failures never silently assign a score",()=>{
 for(const patch of [{identityResolved:false},{sleeperId:null},{providerId:null}]){
  const e=evidence();Object.assign(e.player,patch);assert.equal(evaluatePlayerQuality(e,policy).status,"identity_unresolved");assert.equal(evaluatePlayerQuality(e,policy).indices,null);
 }
});
test("unsupported formats, malformed ranks, mismatched pools and invalid times fail closed",()=>{
 const e=evidence();
 for(const patch of [{scoring:"HALF"},{rankingType:"WEEKLY"},{format:"superflex"},{season:2025},{provider:"Other"},
  {overallEcr:0},{overallEcr:"25"},{overallEcr:Infinity},{positionalEcr:-1},{pool:{...e.pool,id:"foreign"}},
  {pool:{...e.pool,position:"QB"}},{retrievedAt:"2026-11-11T00:00:00Z"},{retrievedAt:"2026-02-30T00:00:00Z"},
  {retrievedAt:"2026-11-10"},{sourceUpdatedAt:"2026-11-11T00:00:00Z"},{sourceAsOfDate:"2026-11-11"}]){
  const q=evaluatePlayerQuality({...e,...patch},policy);assert.equal(q.status,"unsupported",JSON.stringify(patch));assert.equal(q.indices,null);
 }
 for(const input of [null,[],{},"data"])assert.equal(evaluatePlayerQuality(input,policy).status,"unsupported");
 const pos=structuredClone(fixture.players[0]!.evidence[1]!);pos.overallEcr=25;
 assert.equal(evaluatePlayerQuality(pos,policy).status,"unsupported");
 assert.throws(()=>evaluatePlayerQuality(e,{...policy,maxAgeHours:0}),RangeError);
});
test("input is immutable, outputs detached, and unknown fields not propagated",()=>{
 const e={...evidence(),secret:"do-not-copy"};const before=structuredClone(e);
 const a=evaluatePlayerQuality(e,policy),b=evaluatePlayerQuality(e,policy);
 assert.deepEqual(a,b);assert.deepEqual(e,before);assert.ok(!JSON.stringify(a).includes("do-not-copy"));
 a.evidence!.player.name="changed";a.evidence!.pool.id="changed";assert.deepEqual(e,before);
});
test("frozen report is deterministic, correctly labeled, and preserves missing and disagreeing ranks",()=>{
 const before=structuredClone(fixture);const report=renderQualityReport(fixture);
 assert.equal(report,renderQualityReport(fixture));assert.deepEqual(fixture,before);
 assert.equal(report,readFileSync(new URL("../../../docs/V3.7-PHASE1-SHADOW-QUALITY-REPORT.md",import.meta.url),"utf8"));
 for(const term of ["not fantasy points","not evidence of twice","RB24","RB21","TE5","TE6","Michael Wilson","missing","no numeric fallback","101-unit tier jump"])assert.ok(report.includes(term),term);
 const jacobs=legacyScores(fixture.players.find(p=>p.name === "Josh Jacobs")!.legacy),love=legacyScores(fixture.players.find(p=>p.name === "Jeremiyah Love")!.legacy);
 assert.equal(jacobs.normalizedBench,love.normalizedBench);assert.equal(love.actual,-1);
});
test("report's legacy objective mirror agrees with real replacement calculations",()=>{
 for(const r of [1,50,51,120,121,250,251,400,401]){
  const l=legacyScores({searchRank:r,rosterStatus:"bench",status:"Active",injuryStatus:null});
  const p={player_id:"one",name:"One",position:"QB",fantasy_value_tier:fantasyValueTier({search_rank:r}),importance_score:l.actual-Math.floor(l.actual/100)*100,status:"Active",injury_status:null};
  const rows=calculateRosterReplacementCost({positions:{QB:[p]}},{direct_slots:{QB:1},flex_slots:{}});
  assert.equal(rows[0]!.score_difference,l.actual);
 }
});
const goldens=[
 {snapshot:"b8abff6b53646fceaa68ae7b5e5c99b599c200934bd4e326106e80addc52ffc4",json:"b4894a394082cad0f6967369f326b1d9ef97f199346b17b91ff40c6dd9239631",trade:"f185f35a827afa18fb0de7785f7ef5e77958cdd782e05d78ac4e53c9ffd4e553",waivers:"f2f5c0a952e6d42822166ac302231f6afc4ad69f77cf882f6db681f718283feb"},
 {snapshot:"c8a17e6dfc8ef1940b1efa4cbb5b30234e59ef942d454977d1518088a8d09515",json:"b4894a394082cad0f6967369f326b1d9ef97f199346b17b91ff40c6dd9239631",trade:"ea6ba6438b85681a2b54e2578a97086d19b346a2d26dfc832bd01d34cedb1395",waivers:"f283103debdf19dfe64f7c4b2471425a491c7d14e312e04c3417669feb867593"},
];
for(const [i,make] of [makeSnapshot,makeProjectionSnapshot].entries())test(`baseline f70f04f remains byte-identical after shadow evaluation: ${make.name}`,(t)=>{
 t.mock.method(Date,"now",()=>Date.parse("2026-11-10T12:00:00Z"));
 const snapshot=make(),before=structuredClone(snapshot);
 for(const p of fixture.players)for(const e of p.evidence)evaluatePlayerQuality(e,policy);
 renderQualityReport(fixture);
 const request={teamAId:snapshot.myRosterId,teamBId:20,teamAPlayerIds:[`${snapshot.myRosterId}-4`],teamBPlayerIds:["20-4"]};
 const observed={snapshot:hash(snapshot),json:hash(snapshotJson(snapshot)),trade:hash(analyzeTrade(snapshot,request)),waivers:hash(projectedWaivers(snapshot,`${snapshot.myRosterId}-4`))};
 assert.deepEqual(observed,goldens[i]);assert.deepEqual(snapshot,before);assert.equal(snapshotJson(snapshot).snapshot_version,"3.2");
 assert.deepEqual(make(),before);
});
test("no production module imports the shadow module, fixture or report",()=>{
 const root=resolve(import.meta.dirname,"../..");
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(resolve(dir,d.name)):[resolve(dir,d.name)]);
 for(const file of [...walk(root),...walk(resolve(root,"../server"))]){
  if(!/\.(?:ts|tsx|js|mjs)$/.test(file)||file.endsWith(".test.ts")||file.endsWith("/player-quality.ts"))continue;
  assert.doesNotMatch(readFileSync(file,"utf8"),/player-quality|shadow-quality-week10|tests\/quality/,relative(root,file));
 }
 const module=readFileSync(new URL("./player-quality.ts",import.meta.url),"utf8");
 assert.doesNotMatch(module,/\bfetch\s*\(|\bimport\s*\(|\bDate\.now\s*\(/);
});

test("equivalent timezone instants preserve source-day validation",()=>{
 const e=evidence();e.retrievedAt="2026-11-10T01:00:00Z";
 const utc=evaluatePlayerQuality(e,policy);
 e.retrievedAt="2026-11-09T20:00:00-05:00";
 const offset=evaluatePlayerQuality(e,policy);
 assert.equal(utc.status,"current");assert.equal(offset.status,utc.status);
 assert.deepEqual(offset.indices,utc.indices);assert.equal(offset.freshness,utc.freshness);
 e.retrievedAt="2026-11-10T01:00:00+05:00";
 assert.equal(evaluatePlayerQuality(e,policy).status,"unsupported");
});
test("pool kind requires a literal string and freshness duration cannot overflow",()=>{
 const e=structuredClone(fixture.players[0]!.evidence[1]!);
 for(const kind of [["position"],{toString:()=>"position"},null,1]){
  const q=evaluatePlayerQuality({...e,pool:{...e.pool,kind}},policy);
  assert.equal(q.status,"unsupported");assert.equal(q.evidence,null);assert.equal(q.indices,null);
 }
 assert.throws(()=>evaluatePlayerQuality(e,{...policy,maxAgeHours:Number.MAX_VALUE}),RangeError);
});
