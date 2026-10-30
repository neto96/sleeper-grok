import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePreviewWeeks } from './preview-input.mjs';
const now=Date.parse('2026-10-28T18:00:00Z');
const fixture=()=>({summary:{capturedAt:new Date(now).toISOString(),window:{season:'2026',fromWeek:8,throughWeek:8},scheduleValidated:true},
  tradeInput:{season:'2026',teams:[{}]},results:[{playerId:'a',weeks:[{week:8,status:'covered',updatedAt:now,points:0}]}]});
test('preview preserves genuine zero and rejects invalid capture time and season',()=>{
  assert.equal(preparePreviewWeeks(fixture(),now)[0].points.a,0);
  for(const capturedAt of ['invalid',new Date(now+86400000).toISOString(),new Date(now-8*86400000).toISOString()]){
    const d=fixture();d.summary.capturedAt=capturedAt;assert.throws(()=>preparePreviewWeeks(d,now));
  }
  const d=fixture();d.tradeInput.season='2025';assert.throws(()=>preparePreviewWeeks(d,now));
});
test('future and stale forecasts become missing rather than zero',()=>{
  for(const updatedAt of [null,now+86400000,now-8*86400000]){
    const d=fixture();d.results[0].weeks[0].updatedAt=updatedAt;
    assert.equal('a' in preparePreviewWeeks(d,now)[0].points,false);
  }
});
test('duplicate records fail closed; only verified byes become null',()=>{
  const d=fixture();d.results.push(d.results[0]);assert.throws(()=>preparePreviewWeeks(d,now));
  const b=fixture();b.results[0].weeks[0].status='bye';
  assert.equal(preparePreviewWeeks(b,now)[0].points.a,null);
  b.summary.scheduleValidated=false;assert.equal('a' in preparePreviewWeeks(b,now)[0].points,false);
});
