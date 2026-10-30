import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectedWaivers} from './waiver-valuation.ts';
import type {LeagueSnapshot,PlayerSlot,TeamRoster} from './types.ts';
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
function withProjections() {
  const value=fixture(); value.week=8;
  const updatedAt=Date.now();
  value.projections={available:true,reason:null,fetchedAt:new Date(updatedAt).toISOString(),season:'2026',
    fromWeek:8,throughWeek:8,policy:'core-offense-v1',exclusions:[],championshipVerified:false,weekStartCutoffs:{[ 8 ]:Date.now()+86400000},weeks:[{week:8,points:{a:10,b:20,c:5}}],
    players:Object.entries({a:10,b:20,c:5}).map(([playerId,points])=>({playerId,injuryStatus:null,
      coveredWeeks:1,unknownWeeks:[],byeWeeks:[],scoringGaps:[],coveredSubtotal:points,
      pointsPerCoveredGame:points,remainingTotal:points,weeks:[{week:8,status:'covered',points,updatedAt}]}))};
  return value;
}

function waiverFixture() {
  const s=withProjections();s.benchSlots=0;
  s.analysisWaiverPool=[{player_id:'free',name:'Free RB',position:'RB',team:'BUF',status:'Active',injury_status:null,search_rank:999}];
  const entry=structuredClone(s.projections!.players[1]);entry.playerId='free';s.projections!.players.push(entry);
  return s;
}
test('full roster requires an explicit valid offensive drop',()=>{
  const s=waiverFixture();assert.equal(projectedWaivers(s).status,'choose_drop');
  assert.equal(projectedWaivers(s,'b').status,'unavailable');
  const result=projectedWaivers(s,'a');assert.equal(result.rows[0].delta,10);assert.equal(result.dropName,'a');
});
test('open slot needs no drop; ranking follows gain rather than search rank',()=>{
  const s=waiverFixture();s.benchSlots=1;
  assert.equal(projectedWaivers(s).rows[0].delta,10);
  assert.equal(projectedWaivers(s,'a').status,'unavailable');
  s.analysisWaiverPool.push({...s.analysisWaiverPool[0],player_id:'low',name:'Low RB',search_rank:1});
  const entry=structuredClone(s.projections!.players[0]);entry.playerId='low';s.projections!.players.push(entry);
  assert.deepEqual(projectedWaivers(s).rows.map(r=>[r.playerId,r.delta]),[['free',10],['low',0]]);
});
test('missing candidate and baseline forecasts remain unknown, negative changes retained',()=>{
  const s=waiverFixture();s.projections!.players.find(p=>p.playerId==='free')!.weeks[0].points=5;
  assert.equal(projectedWaivers(s,'a').rows[0].delta,-5);
  s.projections!.players=s.projections!.players.filter(p=>p.playerId!=='a');
  assert.equal(projectedWaivers(s,'a').rows[0].delta,null);
});
test('stale data and duplicate candidates block; unavailable and rostered candidates excluded',()=>{
  const s=waiverFixture();const old=structuredClone(s);old.projections!.fetchedAt='2020-01-01';
  assert.equal(projectedWaivers(old,'a').status,'unavailable');
  s.analysisWaiverPool.push({...s.analysisWaiverPool[0]});assert.equal(projectedWaivers(s,'a').status,'unavailable');
  s.analysisWaiverPool=[{...s.analysisWaiverPool[0],injury_status:'Out'},{...s.analysisWaiverPool[0],player_id:'b'}];
  assert.deepEqual(projectedWaivers(s,'a').rows,[]);
});
test('changing selected roster recomputes value without mutating inputs',()=>{
  const s=waiverFixture();s.benchSlots=1;const original=JSON.stringify(s);
  assert.equal(projectedWaivers(s).rows[0].delta,10);assert.equal(JSON.stringify(s),original);
  const other={...s,myRosterId:2};assert.equal(projectedWaivers(other,'c').rows[0].delta,0);
});
