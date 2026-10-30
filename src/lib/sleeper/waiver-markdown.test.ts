import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendWaiverMarkdown} from './waiver-markdown.ts';
import type {LeagueSnapshot} from './types.ts';
import type {ProjectedWaivers} from './waiver-valuation.ts';
const snapshot={myRosterId:1,teams:[{rosterId:1,teamName:'Test'}],projections:{fromWeek:8,throughWeek:17,exclusions:[]}} as unknown as LeagueSnapshot;
const result:ProjectedWaivers={status:'ready',reason:null,dropName:'Drop <tag>',rows:[{playerId:'x',name:'Player *name*',position:'RB',delta:2,reason:null,uncertain:false},{playerId:'y',name:'Missing',position:'WR',delta:null,reason:'missing',uncertain:true}]};
test('waiver export includes exact choice, numeric gain and unknown coverage with escaped names',()=>{
 const text=appendWaiverMarkdown('base',snapshot,{snapshot,result});
 assert.match(text,/Hypothetical drop: Drop &lt;tag&gt;/);
 assert.ok(text.includes('Player \\*name\\*'));assert.match(text,/\+2.00 points\/week/);
 assert.match(text,/Unknown — incomplete/);assert.match(text,/1 fully comparable candidates; 1 unknown/);
});
test('stale snapshot identity, absent and unresolved comparisons never enter export',()=>{
 assert.equal(appendWaiverMarkdown('base',{...snapshot},{snapshot,result}),'base');
 assert.equal(appendWaiverMarkdown('base',snapshot,null),'base');
 assert.equal(appendWaiverMarkdown('base',snapshot,{snapshot,result:{...result,status:'choose_drop'}}),'base');
});
