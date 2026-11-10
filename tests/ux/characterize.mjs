import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
register('../../src/lib/sleeper/resolve-ts-hook.mjs',import.meta.url);
const { presentRecommendations } = await import('../../src/lib/sleeper/recommendation-presentation.ts');
const { tradeSummary } = await import('../../src/lib/sleeper/trade-presentation.ts');
const { PRIORITY_WAIVER_NOTE } = await import('../../src/lib/sleeper/priority-waivers.ts');
const fixture=JSON.parse(await readFile(new URL('../fixtures/ux-week10.json',import.meta.url),'utf8'));
const original=structuredClone(fixture);
const rows=presentRecommendations(fixture.actions,fixture.week);
const next=rows.map(row=>`- **${row.urgency.replaceAll('_',' ').toUpperCase()} — ${row.title}:** ${row.reason}`).join('\n');
const trade=fixture.impacts.flatMap(tradeSummary);
const waiver=fixture.priorityGroups.map(group=>`### Need now: ${group.slot} · Week ${group.week}\n\n`+
  (group.candidates.length ? group.candidates.map((player,index)=>`${index+1}. ${player.name}${player.target_week_bye_status==='unknown'?' (target-week bye status unknown)':''}${player.availability==='uncertain'?' (Questionable)':''}`).join('\n') : 'No available candidates found for this need.')+'\n').join('\n')+`\n_${PRIORITY_WAIVER_NOTE}_`;
assert.equal(fixture.week,10);
assert.equal(rows.length,8);
assert.equal(rows.flatMap(row=>row.sources).length,16);
assert.equal(rows.filter(row=>row.urgency==='act_now').length,3);
for(const action of fixture.actions.filter(action=>action.category!=='depth')) {
  assert.ok(next.includes(action.title));assert.ok(next.includes(action.reason));
}
assert.ok(next.includes('Joe Burrow has no backup in Weeks 10–14'));
assert.ok(next.includes('Sam LaPorta has no backup in Weeks 10–14'));
assert.deepEqual(fixture,original);
const metrics={capture:fixture.capturedAt,week:fixture.week,
  nextMoveLines:[fixture.actions.length,rows.length],nextMoveCharacters:[fixture.baseline.nextMoves.length,next.length],
  tradeSummaryLines:[fixture.baseline.tradeReasons.flat().length,trade.length],
  tradeSummaryCharacters:[fixture.baseline.tradeReasons.flat().join(' ').length,trade.join(' ').length],
  priorityWaiverCharacters:[fixture.baseline.priorityWaivers.length,waiver.length],
  repeatedSharedWaiverNotes:[3,1],sourceActionsRetained:rows.flatMap(row=>row.sources).length};
console.log(JSON.stringify(metrics,null,2));
