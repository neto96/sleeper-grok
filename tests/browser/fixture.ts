import { buildAnalysisBundle, buildMarkdown } from "../../src/lib/sleeper/format";
import { DEFAULT_LEAGUE_ID, DEFAULT_MY_ROSTER_ID } from "../../src/lib/sleeper/constants";
import type { LeagueSnapshot, PlayerSlot, TeamRoster } from "../../src/lib/sleeper/types";

// Fictional, fixed records: no live rosters, credentials or external services.
const slots = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];
function team(rosterId: number, teamName: string): TeamRoster {
  const positions = ["QB", "QB", "RB", "RB", "WR", "WR", "WR", "TE", "K", "DEF"];
  const players: PlayerSlot[] = positions.map((position, index) => ({
    playerId: `${rosterId}-${index}`, name: `${teamName} ${position} ${index + 1}`,
    position, slot: "BN", nflTeam: index % 2 ? "BUF" : "DAL",
    status: "Active", injuryStatus: index === 1 ? "Out" : index === 5 ? "Questionable" : null,
    number: index + 1, searchRank: 30 + index * 20 + rosterId,
  }));
  return { rosterId, teamName, ownerName: teamName, username: teamName, avatar: null,
    isCommissioner: false, wins: 3, losses: 2, ties: 0, pointsFor: 500, pointsAgainst: 450,
    waiverPosition: rosterId, faabUsed: 0, faabBudget: 100, streak: null,
    starters: [], bench: players, reserve: [], taxi: [] };
}
export function makeSnapshot(): LeagueSnapshot {
  const teams = [team(DEFAULT_MY_ROSTER_ID, "Alpha"), team(20, "Beta"), team(30, "Gamma")];
  const bundle = buildAnalysisBundle(teams, teams.map(t => t.rosterId), [...slots, "BN", "BN", "BN"], [], DEFAULT_MY_ROSTER_ID,
    { currentWeek: 6, regularSeasonEndWeek: 18, byeScheduleAvailable: true, byeWeeksByTeam: { BUF: [7], DAL: [8] } });
  const snapshot: LeagueSnapshot = { fetchedAt: "2026-10-18T12:00:00.000Z", leagueId: DEFAULT_LEAGUE_ID,
    leagueName: "Private Test League", season: "2026", seasonType: "regular", status: "in_season", sport: "nfl",
    scoring: "PPR", week: 6, displayWeek: 6, rosterSlots: slots, benchSlots: 3, playoffTeams: 2, avatar: null,
    myRosterId: DEFAULT_MY_ROSTER_ID, waiverSystem: "Waiver Priority", teams, waiverOrder: [], waiverByPosition: {},
    transactions: [], matchups: [], notes: ["Fictional browser-test fixture."], ...bundle,
    markdown: "", filename: "private-test.md", jsonFilename: "private-test.json" };
  snapshot.markdown = buildMarkdown(snapshot);
  return snapshot;
}

export function makeProjectionSnapshot(): LeagueSnapshot {
  const snapshot=makeSnapshot();
  const updatedAt=Date.now();
  const points=Object.fromEntries(snapshot.teams.flatMap(t=>[...t.starters,...t.bench])
    .filter(p=>['QB','RB','WR','TE'].includes(p.position))
    .map(p=>[p.playerId,p.playerId.startsWith('20-') ? 25 : 10]));
  snapshot.analysisWaiverPool=[{player_id:'free-rb',name:'Available Runner',position:'RB',team:'BUF',status:'Active',injury_status:null,search_rank:999},
    {player_id:'unknown-wr',name:'Unknown Receiver',position:'WR',team:'BUF',status:'Active',injury_status:null,search_rank:1}];
  points['free-rb']=30;
  snapshot.projections={available:true,reason:null,season:snapshot.season,fromWeek:snapshot.week,
    throughWeek:snapshot.week,fetchedAt:new Date(updatedAt).toISOString(),policy:'core-offense-v1',
    exclusions:[],championshipVerified:false,weekStartCutoffs:{[ snapshot.week ]:Date.now()+86400000},weeks:[{week:snapshot.week,points}],
    players:Object.entries(points).map(([playerId,value])=>({playerId,injuryStatus:null,coveredWeeks:1,
      unknownWeeks:[],byeWeeks:[],scoringGaps:[],coveredSubtotal:value,pointsPerCoveredGame:value,
      remainingTotal:value,weeks:[{week:snapshot.week,status:'covered',points:value,updatedAt}]}))};
  snapshot.projections.throughWeek=snapshot.week+1;
  snapshot.projections.weekStartCutoffs![snapshot.week+1]=Date.now()+8*86400000;
  snapshot.projections.weeks.push({week:snapshot.week+1,points:{...points}});
  for(const player of snapshot.projections.players) player.weeks.push({...player.weeks[0],week:snapshot.week+1});
  return snapshot;
}
