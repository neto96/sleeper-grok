import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekStartCutoffs,futureProjectionWeeks} from './projection-timing.ts';
test('date-only timing excludes the whole week on its earliest game day',()=>{
 const cut=weekStartCutoffs([{week:8,date:'2026-10-29'},{week:8,date:'2026-11-01'},{week:9,date:'2026-11-05'}]);
 assert.deepEqual(futureProjectionWeeks([{week:8},{week:9}],cut,Date.parse('2026-10-29T00:00:00Z')),[{week:9}]);
});
test('missing, invalid, live or completed timing cannot authorize future gains',()=>{
 for(const row of [{week:8},{week:8,date:'2026-02-30'},{week:8,date:'2099-01-01',status:'in_progress'},{week:8,date:'2099-01-01',status:'complete'}])assert.deepEqual(futureProjectionWeeks([{week:8}],weekStartCutoffs([row]),Date.now()),[]);
 assert.deepEqual(futureProjectionWeeks([{week:8}],undefined,Date.now()),[]);
});

test('Sleeper pre_game status retains future dated weeks',()=>{
 const cut=weekStartCutoffs([{week:9,date:'2026-11-05',status:'pre_game'}]);
 assert.deepEqual(futureProjectionWeeks([{week:9}],cut,Date.parse('2026-10-29T12:00:00Z')),[{week:9}]);
});

test('transaction-effective week excludes otherwise future games and invalid inputs fail closed',()=>{
 const weeks=[{week:9},{week:10}],cutoffs={9:Date.now()+86400000,10:Date.now()+8*86400000};
 assert.deepEqual(futureProjectionWeeks(weeks,cutoffs,Date.now(),10),[{week:10}]);
 assert.deepEqual(futureProjectionWeeks(weeks,cutoffs,Date.now(),11),[]);
 for(const invalid of [0,19,9.5,NaN])assert.deepEqual(futureProjectionWeeks(weeks,cutoffs,Date.now(),invalid),[]);
});
