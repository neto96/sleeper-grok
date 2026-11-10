import { evaluatePlayerQuality, experimentalQualityIndices, type QualityEvidence, type QualityPolicy } from "../../src/lib/sleeper/player-quality.ts";
import { fantasyValueTier, fantasyImportanceScore } from "../../src/lib/sleeper/analysis/engine.ts";
export type QualityFixture = {
  attribution: string; policy: QualityPolicy;
  legacySource: {capturedAt: string; description: string};
  poolCaptures: {pool:string;retrievedAt:string;queriedLimit:number;returnedCount:number}[];
  players: {name:string;legacy:{searchRank:number|null;rosterStatus:string;status:string|null;injuryStatus:string|null};evidence:QualityEvidence[]}[];
};
const safe=(s:string)=>s.replace(/[\r\n|]/g," ");
const number=(n:number|null|undefined)=>n == null ? "—" : n.toFixed(1);
/** Test/report-only mirror of the private legacy objective; never a new production scorer. */
export function legacyScores(legacy: QualityFixture["players"][number]["legacy"]) {
  const tier=fantasyValueTier({search_rank:legacy.searchRank});
  const weight=fantasyImportanceScore({fantasy_value_tier:tier,roster_status:"reserve"});
  return {tier,normalizedBench:weight*100+fantasyImportanceScore({fantasy_value_tier:tier,roster_status:"bench"}),
    actual:legacy.status === "Inactive" || legacy.injuryStatus === "IR" ? -1
      : weight*100+fantasyImportanceScore({fantasy_value_tier:tier,roster_status:legacy.rosterStatus})};
}
export function renderQualityReport(fixture:QualityFixture):string {
  const lines=["# Shadow Player Quality — frozen Week 10 research", "",fixture.attribution,"",
    "Experimental analytical indices only: not fantasy points, projected points, trade prices, player-value ratios, or an ECR trade-value chart. No benchmark is the correct value. No production decisions consume these results.","",
    `Evaluation clock: ${fixture.policy.now}; maximum evidence age: ${fixture.policy.maxAgeHours} hours. This is an explicit research policy, not a validated production refresh interval.`,
    `Legacy capture: ${fixture.legacySource.capturedAt}. ${fixture.legacySource.description}`,"",
    "## Provenance and ranking pools","",
    "Provider: FantasyPros; NFL 2026; ROS; PPR; reference format: redraft-1qb. This preset is not a reconstruction of the league's complete custom scoring. Source as-of date: 2026-11-10; expert update timestamps were not supplied.","",
    ...fixture.poolCaptures.map(p=>`- ${p.pool}: retrieved ${p.retrievedAt}; ${p.returnedCount} rows returned, request limit ${p.queriedLimit}. Only representative observations are retained.`),"",
    "ALL positional annotations and standalone positional consensus ranks are preserved independently. No averaging or cross-pool normalization. Current means within this fixture's source-as-of/retrieval-age policy; it does not verify expert update freshness.","",
    "## Representative players — indices from overall ROS ECR only","",
    "Legacy score is the existing structural objective for the captured status; -1 means excluded by its Inactive/IR rule. Bench-normalized score holds status constant to expose tier flattening; it is not a roster-value recommendation.","",
    "| Player | Legacy search rank | Tier | Legacy score | Bench-normalized | Overall ECR | ALL positional annotation | Separate position ECR | Power | Log | Percentile | Status / uncertainty |",
    "|---|---:|---|---:|---:|---:|---|---|---:|---:|---:|---|"];
  for(const p of fixture.players){
    const overall=p.evidence.find(e=>e.pool.kind === "overall")!;
    const positional=p.evidence.find(e=>e.pool.kind === "position")!;
    const q=evaluatePlayerQuality(overall,fixture.policy),pos=evaluatePlayerQuality(positional,fixture.policy),legacy=legacyScores(p.legacy);
    lines.push(`| ${safe(p.name)} | ${p.legacy.searchRank??"—"} | ${legacy.tier} | ${legacy.actual} | ${legacy.normalizedBench} | ${overall.overallEcr??"—"} | ${overall.positionalEcr===null?"—":overall.player.position+overall.positionalEcr} | ${positional.positionalEcr===null?"—":positional.player.position+positional.positionalEcr} | ${number(q.indices?.shiftedPower)} | ${number(q.indices?.logarithmic)} | ${number(q.indices?.percentile)} | ${q.status}; position ${pos.status}; ${q.freshnessBasis} |`);
  }
  lines.push("","## Controlled rank benchmarks","",
    "These are hypothetical ranks, not additional live player observations. Legacy search rank and ROS ECR are separate inputs set to the same number here solely to compare curve shape.","",
    "| Rank | Legacy bench tier | Legacy bench score | Power | Log | Percentile |","|---:|---|---:|---:|---:|---:|");
  for(const r of [1,5,10,25,50,51,75,100,150,200,250,251]){
    const l=legacyScores({searchRank:r,rosterStatus:"bench",status:"Active",injuryStatus:null}),q=experimentalQualityIndices(r);
    lines.push(`| ${r} | ${l.tier} | ${l.actual} | ${number(q.shiftedPower)} | ${number(q.logarithmic)} | ${number(q.percentile)} |`);
  }
  lines.push("","## Flattening and disagreement findings","",
    "- Search ranks 1 and 50 both score 506 on the legacy bench objective. Each experimental overall-rank curve separates ranks 1 and 50.",
    "- Search rank 50 to 51 drops from 506 to 405. Experimental curves change continuously instead of making a 101-unit tier jump.",
    "- Jacobs and Love are both legacy elite (506 bench-normalized), but overall ROS ECR is 71 versus 116. Their separate RB consensus is RB21 versus RB38; ALL annotations are RB24 versus RB30. Love's captured legacy exclusion is availability, not a quality index of zero.",
    "- LaPorta, Odunze, Sutton, Thomas and Johnston share legacy strong/405 bench-normalized despite overall ranks 79, 65, 97, 128 and 141. LaPorta's ALL annotation TE5 and separate TE consensus TE6 are not collapsed.",
    "- Michael Wilson is legacy strong but missing from the retrieved ALL/WR pools. All quality indices remain absent, not zero. This is not proof that every FantasyPros pool omits him.","",
    "## Policy and model limitations","",
    "- shadow-quality-v1: power = 100 / (1 + (rank - 1) / 24); logarithmic = max(0, 100 × ln(251 / rank) / ln(251)); percentile = max(0, 100 × (250 - rank) / 249). Parameters are experimental, fixed, and not calibrated to fantasy outcomes.",
    "- Log and percentile have continuous floors at 251 and 250 respectively, with a change of slope at those endpoints. A zero benchmark index does not imply a worthless player. Power remains positive for finite practical ranks.",
    "- Missing, stale, unresolved and unsupported evidence receives no numeric fallback. Original ranks and notes remain available. Positional-pool indices are separately evaluable but never substituted into this overall-index table.",
    "- Data age, incomplete rank coverage, different expert pools and manual identity crosswalks remain limitations. Retrieval timestamps are not expert update timestamps.",
    "- Display rounds indices to one decimal; calculations retain precision. An index of 40 is not evidence of twice the player value of 20.",
    "- The production app has no imports, routes, payload fields or provider calls for this research module. Snapshot compatibility remains 3.2; app/engine release labels remain unchanged.","");
  return lines.join("\n");
}
