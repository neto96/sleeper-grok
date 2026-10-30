import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeProjectedTrade } from './projected-trade.ts';
import type { LeagueSnapshot, PlayerSlot, TeamRoster } from './types.ts';
const ROSTER_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];

function player(id: string, position: string, rank: number, injuryStatus: string | null = null): PlayerSlot {
  return {
    playerId: id,
    name: id,
    position,
    slot: "BN",
    nflTeam: "TST",
    injuryStatus,
    status: "Active",
    number: null,
    searchRank: rank,
  };
}

function team(rosterId: number, name: string, players: PlayerSlot[]): TeamRoster {
  return {
    rosterId,
    teamName: name,
    ownerName: name,
    username: name,
    avatar: null,
    isCommissioner: false,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    waiverPosition: rosterId,
    faabUsed: 0,
    faabBudget: 100,
    streak: null,
    starters: [],
    bench: players,
    reserve: [],
    taxi: [],
  };
}

function snapshot(teams: TeamRoster[]): LeagueSnapshot {
  return {
    fetchedAt: "2026-10-18T00:00:00.000Z",
    leagueId: "1",
    leagueName: "Test",
    season: "2026",
    seasonType: "regular",
    status: "in_season",
    sport: "nfl",
    scoring: "PPR",
    week: 6,
    displayWeek: 6,
    rosterSlots: ROSTER_SLOTS,
    benchSlots: 6,
    playoffTeams: 6,
    avatar: null,
    myRosterId: 1,
    waiverSystem: "Waiver Priority",
    teams,
    waiverOrder: [],
    waiverByPosition: {},
    transactions: [],
    matchups: [],
    notes: [],
    snapshotVersion: "3.2",
    fantasyAnalysis: {},
    waiverAnalysis: {},
    actionableWaiverAnalysis: {},
    analysisWaiverPool: [],
    markdown: "",
    filename: "",
    jsonFilename: "",
  };
}


function fixture() {
  const value = snapshot([team(1,'A',[player('a','RB',1)]),team(2,'B',[player('b','RB',400),player('c','RB',450)])]);
  value.rosterSlots = ['RB']; value.benchSlots = 1;
  return value;
}
const request = {teamAId:1,teamBId:2,teamAPlayerIds:['a'],teamBPlayerIds:['b']};
const weeks = [{week:8,points:{a:10,b:20,c:5}}];
test('trade projection uses points despite opposing search ranks and does not mutate snapshot', () => {
  const value=fixture(), original=JSON.stringify(value);
  const result=analyzeProjectedTrade(value,request,weeks);
  assert.ok(result.valid);
  assert.equal(result.teamA.meanDelta,10);
  assert.equal(result.teamB.meanDelta,-10);
  assert.equal(JSON.stringify(value),original);
});
test('uneven trade stays blocked until valid required drops are supplied', () => {
  const value=fixture(); value.benchSlots=0;
  const uneven={...request,teamBPlayerIds:['b','c']};
  const blocked=analyzeProjectedTrade(value,uneven,weeks);
  assert.ok(blocked.valid); assert.match(blocked.teamA.blocked ?? '',/drops/);
  const resolved=analyzeProjectedTrade(value,uneven,weeks,{teamA:['b'],teamB:[]});
  assert.ok(resolved.valid); assert.equal(resolved.teamA.meanDelta,-5);
  assert.equal(analyzeProjectedTrade(value,uneven,weeks,{teamA:['a'],teamB:[]}).valid,false);
  assert.equal(analyzeProjectedTrade(value,uneven,weeks,{teamA:['b','c'],teamB:[]}).valid,false);
});
test('invalid trade cannot obtain a projection verdict', () => {
  assert.equal(analyzeProjectedTrade(fixture(),{...request,teamBId:1},weeks).valid,false);
});

function withProjections() {
  const value=fixture(); value.week=8;
  const updatedAt=Date.now();
  value.projections={available:true,reason:null,fetchedAt:new Date(updatedAt).toISOString(),season:'2026',
    fromWeek:8,throughWeek:8,policy:'core-offense-v1',exclusions:[],championshipVerified:false,weekStartCutoffs:{[ 8 ]:Date.now()+86400000},weeks,
    players:Object.entries(weeks[0].points).map(([playerId,points])=>({playerId,injuryStatus:null,
      coveredWeeks:1,unknownWeeks:[],byeWeeks:[],scoringGaps:[],coveredSubtotal:points,
      pointsPerCoveredGame:points,remainingTotal:points,weeks:[{week:8,status:'covered',points,updatedAt}]}))};
  return value;
}
test('main trade verdict uses projected gain despite worse incoming search rank',async()=>{
  const {analyzeTrade}=await import('./trade-analyzer.ts');
  const value=withProjections(); const result=analyzeTrade(value,request);
  assert.ok(result.valid);
  assert.equal(result.teamA.verdict,'Improvement');
  assert.equal(result.teamA.valuation?.basis,'projected_lineup');
  assert.equal(result.teamA.valuation?.meanDelta,10);
  assert.equal(result.teamB.verdict,'Worse');
  const {buildTradeMarkdown}=await import('./trade-markdown.ts');
  const markdown=buildTradeMarkdown(value,request,result);
  assert.match(markdown,/Projected offensive lineup change/);
  assert.match(markdown,/Valuation basis/);
  assert.doesNotMatch(markdown,/Phase 1 limitation/);
});
test('stale, incomplete, mismatched and unresolved forecasts explicitly fall back',async()=>{
  const {analyzeTrade}=await import('./trade-analyzer.ts');
  for (const mutate of [
    (v:LeagueSnapshot)=>{v.projections!.fetchedAt='2020-01-01';},
    (v:LeagueSnapshot)=>{v.projections!.players[0].weeks[0].updatedAt=0;},
    (v:LeagueSnapshot)=>{v.projections!.throughWeek=9;},
    (v:LeagueSnapshot)=>{v.projections!.season='2025';},
    (v:LeagueSnapshot)=>{v.projections!.players=[];},
    (v:LeagueSnapshot)=>{v.projections!.available=false;v.projections!.reason='offline';},
    (v:LeagueSnapshot)=>{v.benchSlots=0;},
  ]) {
    const value=withProjections(); mutate(value);
    const result=analyzeTrade(value,request);assert.ok(result.valid);
    // Capacity changes can block only the receiving roster that is over its limit.
    assert.ok([result.teamA,result.teamB].some(t=>t.valuation?.basis==='structural_fallback'));
    assert.match(result.note,/structural fallback/);
  }
});
test('projected gains retain injury caution and do not imply confirmed participation',async()=>{
  const {analyzeTrade}=await import('./trade-analyzer.ts');
  const value=withProjections();value.teams[1].bench[0].injuryStatus='Out';
  const result=analyzeTrade(value,request);assert.ok(result.valid);
  assert.equal(result.teamA.valuation?.basis,'projected_lineup');
  assert.equal(result.teamA.verdict,'Risky');
  assert.match(result.teamA.reasons.join(' '),/uncertain/);
});

test('main trade drop choices change the verdict, export, and roster size without mutation',async()=>{
  const {analyzeTrade}=await import('./trade-analyzer.ts');
  const {buildTradeMarkdown}=await import('./trade-markdown.ts');
  const value=withProjections(); value.benchSlots=0;
  const original=JSON.stringify(value);
  const uneven={...request,teamBPlayerIds:['b','c']};
  for(const [drop,delta] of [['b',-5],['c',10]] as const) {
    const selected={...uneven,teamADropIds:[drop]};
    const result=analyzeTrade(value,selected); assert.ok(result.valid);
    assert.equal(result.teamA.valuation?.meanDelta,delta);
    assert.equal(result.teamA.rosterSize.after,1);
    assert.equal(result.teamA.rosterSize.requiredDrops,0);
    assert.equal(result.teamA.selectedDrops?.[0].playerId,drop);
    assert.match(buildTradeMarkdown(value,selected,result),new RegExp(`Selected follow-up drops: ${drop}`));
  }
  for(const drops of [['a'],['b','b'],['b','c']]) assert.equal(analyzeTrade(value,{...uneven,teamADropIds:drops}).valid,false);
  assert.equal(JSON.stringify(value),original);
});

test('dropping a kicker cannot be treated as a fully valued offensive-only improvement',async()=>{
  const {analyzeTrade}=await import('./trade-analyzer.ts');
  const value=withProjections();value.teams[0].bench.push(player('k','K',200));
  const result=analyzeTrade(value,{...request,teamBPlayerIds:['b','c'],teamADropIds:['k']});
  assert.ok(result.valid);
  assert.equal(result.teamA.valuation?.basis,'structural_fallback');
  assert.match(result.teamA.valuation?.reason ?? '',/follow-up drops/);
});

test('main verdict cannot credit a week after its conservative game-day cutoff',async()=>{
 const {analyzeTrade}=await import('./trade-analyzer.ts');
 const value=withProjections();value.projections!.weekStartCutoffs={8:0};
 const result=analyzeTrade(value,request);assert.ok(result.valid);
 assert.equal(result.teamA.valuation?.basis,'structural_fallback');
 assert.match(result.teamA.valuation?.reason??'',/future weeks/);
});
