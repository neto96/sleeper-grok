import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProjections } from './projections.server.ts';
const now=Date.parse('2026-10-28T12:00:00Z');
const teams='ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
// Fictional complete schedule, independent of live NFL data.
const schedule=Array.from({length:17},(_,w)=>Array.from({length:16},(_,i)=>({
  week:w+1,home:teams[i*2],away:teams[i*2+1],game_id:`${w+1}-${i}`}))).flat();
const input={season:'2026',fromWeek:8,throughWeek:8,players:[{id:'q',position:'QB',team:'BUF'}],scoring:{pass_yd:.04,pass_td:6},schedule};
const row=(week=8)=>({player_id:'q',season:'2026',week,season_type:'regular',category:'proj',
  team:'BUF',opponent:'BAL',game_id:`${week}-1`,updated_at:now,stats:{pass_yd:250,pass_td:2}});
test('league scoring drives forecasts; identities and metadata remain explicit',async()=>{
  const result=await loadProjections(input,async()=>[row()],now);
  assert.equal(result.available,true); assert.equal(result.weeks[0].points.q,22);
  assert.equal(result.championshipVerified,false); assert.equal(result.policy,'core-offense-v1');
});
test('unsupported scoring and incomplete schedule block before network requests',async()=>{
  let calls=0; const get=async()=>{calls++;return [row()];};
  const changes: Partial<Parameters<typeof loadProjections>[0]>[] = [{scoring:{bonus_pass_yd:3}},{schedule:[]},{scoring:{pass_td:NaN}}];
  for(const change of changes) {
    const result=await loadProjections({...input,...change},get,now);
    assert.equal(result.available,false); assert.deepEqual(result.weeks,[]);
  }
  assert.equal(calls,0);
});
test('rare exclusions are named and missing forecast is distinct from a verified bye',async()=>{
  const result=await loadProjections({...input,throughWeek:18,scoring:{...input.scoring,st_td:6}},async()=>[],now);
  assert.equal(result.available,true);assert.deepEqual(result.exclusions,['st_td']);
  assert.equal(Object.hasOwn(result.weeks[0].points,'q'),false);
  assert.equal(result.weeks.at(-1)!.points.q,null);
});
test('wrong season responses, failures and duplicates cannot supply usable points',async()=>{
  for(const get of [async()=>[{...row(),season:'2025'}],async()=>{throw new Error('offline');}]) {
    const result=await loadProjections(input,get,now);assert.equal(result.available,false);assert.deepEqual(result.weeks,[]);
  }
  const duplicate=await loadProjections(input,async()=>[row(),row()],now);
  assert.equal(Object.hasOwn(duplicate.weeks[0].points,'q'),false);
  assert.equal(duplicate.players[0].weeks[0].status,'duplicate');
});
test('stale forecasts and schedule conflicts remain unknown',async()=>{
  for(const change of [{updated_at:now-8*86400000},{opponent:'KC'}]) {
    const result=await loadProjections(input,async()=>[{...row(),...change}],now);
    assert.equal(Object.hasOwn(result.weeks[0].points,'q'),false);
  }
});
test('transport is capped at three concurrent requests and failure discards partial runs',async()=>{
  let active=0,maximum=0,calls=0;
  const result=await loadProjections({...input,throughWeek:12},async url=>{
    active++;calls++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,2)); active--;
    const week=Number(url.match(/2026\/(\d+)/)![1]);
    if(week===12)throw new Error('offline');
    return [row(week)];
  },now);
  assert.equal(calls,5);assert.equal(maximum,3);assert.equal(result.available,false);assert.deepEqual(result.players,[]);
});

test('whole-run budget cancels in-flight work and never publishes partial forecasts',async()=>{
  const controller=new AbortController();
  const signals: AbortSignal[]=[];
  let calls=0;
  const resultPromise=loadProjections({...input,throughWeek:18},async (_url,signal)=>{
    calls++; signals.push(signal!);
    if(calls===3)queueMicrotask(()=>controller.abort());
    return new Promise(()=>{}); // Deliberately ignores cancellation.
  },now,controller.signal);
  const result=await resultPromise;
  assert.equal(calls,3);
  assert.ok(signals.every(signal=>signal.aborted));
  assert.equal(result.available,false);
  assert.match(result.reason!,/time budget/);
  assert.deepEqual(result.players,[]);
  assert.deepEqual(result.weeks,[]);
});
test('expired budget makes no upstream calls',async()=>{
  let calls=0;
  const result=await loadProjections(input,async()=>{calls++;return [];},now,AbortSignal.abort());
  assert.equal(calls,0); assert.equal(result.available,false);
  assert.match(result.reason!,/time budget/);
});
