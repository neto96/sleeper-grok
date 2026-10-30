import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withProjectionEndWeek} from './projection-window.ts';
import type {LeagueSnapshot} from './types.ts';
const source={projections:{fromWeek:8,throughWeek:10,weeks:[8,9,10].map(week=>({week,points:{a:10}})),players:[{playerId:'a',scoringGaps:[],weeks:[8,9,10].map(week=>({week,status:'covered',points:10,updatedAt:1}))}]}} as unknown as LeagueSnapshot;
test('explicit cutoff trims weekly data and recomputes totals without mutating source',()=>{
 const original=JSON.stringify(source),result=withProjectionEndWeek(source,9);
 assert.equal(result.projections!.weeks.length,2);assert.equal(result.projections!.players[0].remainingTotal,20);
 assert.equal(JSON.stringify(source),original);assert.equal(withProjectionEndWeek(source,10).projections!.weeks.length,3);
});
test('cutoff rejects unavailable or invalid weeks',()=>{
 for(const end of [7,11,8.5,NaN])assert.throws(()=>withProjectionEndWeek(source,end));
});
