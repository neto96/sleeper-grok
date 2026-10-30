import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectedLineup, compareProjectedRosters } from './lineup.mjs';
const p = (id, position, slot = 'BN') => ({ playerId: id, position, slot });
test('duplicate roster entries cannot fill two lineup slots', () => {
  assert.throws(()=>projectedLineup([p('r','RB'),p('r','RB')],['RB','FLEX'],{r:20}),/Duplicate/);
});
test('mixed flex eligibility is legal and invariant to roster order', () => {
  const players=[p('q','QB'),p('r','RB'),p('w','WR'),p('t','TE')];
  const slots=['REC_FLEX','WRRB_FLEX','SUPER_FLEX'];
  const points={q:30,r:20,w:10,t:15};
  const a=projectedLineup(players,slots,points);
  assert.equal(a.points,65);
  assert.deepEqual(a,projectedLineup([...players].reverse(),slots,points));
  assert.equal(a.lineup.find(x=>x.slot==='REC_FLEX').playerId,'t');
});
test('K and DEF do not require forecasts for an offensive comparison', () => {
  assert.equal(projectedLineup([p('r','RB'),p('k','K'),p('d','DEF')],['RB','K','DEF'],{r:10}).points,10);
});
test('FLEX assignment maximizes total without double counting players', () => {
  const r = projectedLineup([p('r','RB'),p('w','WR'),p('w2','WR')],['WR','FLEX'],{r:20,w:15,w2:10});
  assert.equal(r.points,35); assert.equal(new Set(r.lineup.map(x=>x.playerId)).size,2);
});
test('missing forecast suppresses comparison; known bye may be replaced', () => {
  const players=[p('a','RB'),p('b','RB')];
  assert.equal(projectedLineup(players,['RB'],{a:10}).complete,false);
  assert.equal(projectedLineup(players,['RB'],{a:null,b:5}).points,5);
});
test('required drops block result; dropping depth can reveal a hole', () => {
  const a=[p('a','RB')];
  assert.match(compareProjectedRosters(a,a,['RB'],[],1).blocked,/drops/);
  assert.equal(compareProjectedRosters(a,[],['RB'],[{week:8,points:{a:10}}]).meanDelta,null);
});
test('reserve excluded, negative starters retained, superflex supported', () => {
  assert.equal(projectedLineup([p('a','QB'),p('b','QB','IR')],['SUPER_FLEX'],{a:-2}).points,-2);
});
