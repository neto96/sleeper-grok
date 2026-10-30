import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectedReplacementValue, compareProjectedRosters, projectedLineup } from './projected-valuation.ts';
const p = (playerId: string, position = 'RB', slot = 'BN') => ({playerId, position, slot});
test('replacement value measures lineup loss, not raw player points', () => {
  const roster = [p('starter'),p('backup')];
  const weeks = [{week:8,points:{starter:20,backup:15}}];
  assert.equal(projectedReplacementValue(roster,'starter',['RB'],weeks).meanPointsAboveReplacement,5);
  assert.equal(projectedReplacementValue(roster,'backup',['RB'],weeks).meanPointsAboveReplacement,0);
});
test('available replacement can improve the alternative and produce negative value', () => {
  const result = projectedReplacementValue([p('starter')],'starter',['RB'],
    [{week:8,points:{starter:10,free:12}}],[p('free')]);
  assert.equal(result.meanPointsAboveReplacement,-2);
  assert.equal(result.weeks[0].replacementId,'free');
});
test('FLEX replacement uses roster fit across positions without adding every candidate', () => {
  const result = projectedReplacementValue([p('r'),p('w','WR')],'r',['RB','FLEX'],
    [{week:8,points:{r:20,w:15,freeR:10,freeW:30}}],[p('freeR'),p('freeW','WR')]);
  assert.equal(result.meanPointsAboveReplacement,10);
  assert.equal(result.weeks[0].replacementId,'freeR');
});
test('missing replacement forecasts and unfilled lineups withhold value', () => {
  assert.equal(projectedReplacementValue([p('r')],'r',['RB'],[{week:8,points:{r:20}}]).meanPointsAboveReplacement,null);
  const result = projectedReplacementValue([p('r'),p('b')],'r',['RB'],
    [{week:8,points:{r:20,b:10}}],[p('unknown')]);
  assert.equal(result.meanPointsAboveReplacement,null);
  assert.deepEqual(result.weeks[0].missing,['unknown']);
});
test('bye weeks use available bench replacements; no fabricated points for byes', () => {
  const result = projectedReplacementValue([p('r'),p('b')],'r',['RB'],
    [{week:8,points:{r:null,b:10}},{week:9,points:{r:20,b:10}}]);
  assert.equal(result.meanPointsAboveReplacement,5);
  assert.equal(result.comparableWeeks,2);
});
test('invalid identities, reserve targets, and duplicate weeks are rejected', () => {
  assert.throws(()=>projectedReplacementValue([p('r')],'r',['RB'],[],[p('r')]),/pool/);
  assert.throws(()=>projectedReplacementValue([p('r','RB','IR')],'r',['RB'],[]),/active/);
  assert.throws(()=>compareProjectedRosters([],[],[],[{week:8,points:{}},{week:8,points:{}}]),/week/);
  assert.equal(projectedLineup([p('toString')],['RB'],{}).complete,false);
});
