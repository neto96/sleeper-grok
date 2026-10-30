import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lineupEvidence} from './lineup-evidence.mjs';
const p=id=>({playerId:id,name:id,position:'RB',slot:'BN'});
test('trade improvement and drop loss reconcile to final change',()=>{
  const r=lineupEvidence([p('a')],[p('a'),p('b')],[p('a')],['RB'],{a:10,b:20});
  assert.equal(r.tradeOnlyDelta,10);assert.equal(r.dropDelta,-10);assert.equal(r.finalDelta,0);
  assert.deepEqual(r.entering,[]);assert.deepEqual(r.leaving,[]);
});
test('names explain missing data and no unsupported benefit is displayed',()=>{
  const r=lineupEvidence([p('a')],[p('b')],[p('b')],['RB'],{a:10});
  assert.match(r.afterReason,/Missing forecasts: b/);assert.equal(r.finalDelta,null);
  assert.equal(r.tradeOnlyDelta,null);assert.deepEqual(r.entering,[]);
});
test('lineup entrants and departures are roster changes, not slot movement',()=>{
  const r=lineupEvidence([p('a')],[p('b')],[p('b')],['RB'],{a:10,b:15});
  assert.deepEqual(r.entering,['b']);assert.deepEqual(r.leaving,['a']);assert.equal(r.finalDelta,5);
  const hole=lineupEvidence([p('a')],[],[],['RB'],{a:10});
  assert.match(hole.afterReason,/Not enough eligible/);
});
