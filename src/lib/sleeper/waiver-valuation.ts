import {futureProjectionWeeks} from "./projection-timing.ts";
import { projectedLineup, type ProjectionWeek } from './projected-valuation.ts';
import { assessAvailability } from './analysis/availability.ts';
import type { LeagueSnapshot, PlayerSlot } from './types.ts';
export type WaiverValue = {playerId:string;name:string;position:string;delta:number|null;reason:string|null;uncertain:boolean};
export type ProjectedWaivers = {status:'ready'|'choose_drop'|'unavailable';reason:string|null;dropName:string|null;rows:WaiverValue[]};
const offense=new Set(['QB','RB','WR','TE']);
export function projectedWaivers(snapshot:LeagueSnapshot,dropId:string|null=null,now=Date.now()):ProjectedWaivers {
  const unavailable=(reason:string):ProjectedWaivers=>({status:'unavailable',reason,dropName:null,rows:[]});
  const data=snapshot.projections, team=snapshot.teams.find(t=>t.rosterId===snapshot.myRosterId);
  if(!data?.available || !team) return unavailable(data?.reason ?? 'Projection data is unavailable.');
  const fetched=Date.parse(data.fetchedAt);
  if(!Number.isFinite(fetched) || fetched>now+300000 || now-fetched>7*86400000) return unavailable('Projection capture is stale or invalid.');
  if(data.policy!=='core-offense-v1' || data.exclusions.some(x=>!['fum_rec_td','st_ff','st_fum_rec','st_td'].includes(x))) return unavailable('Unsupported scoring policy.');
  if(data.season!==snapshot.season || data.fromWeek!==snapshot.week || !Number.isInteger(data.fromWeek) || !Number.isInteger(data.throughWeek) || data.fromWeek<1 || data.throughWeek>18 || data.fromWeek>data.throughWeek ||
      data.weeks.length!==data.throughWeek-data.fromWeek+1 || data.weeks.some((w,i)=>w.week!==data.fromWeek+i)) return unavailable('Projection window does not match this snapshot.');
  const active=[...team.starters,...team.bench];
  const capacity=snapshot.rosterSlots.length+snapshot.benchSlots;
  if(active.length>capacity) return unavailable('Resolve the existing roster overflow first.');
  const drop=active.find(p=>p.playerId===dropId);
  if(dropId && (!drop || !offense.has(drop.position))) return unavailable('Choose an active offensive player to drop.');
  if(active.length===capacity && !drop) return {status:'choose_drop',reason:'Choose a hypothetical drop to compare legal adds.',dropName:null,rows:[]};
  if(active.length<capacity && dropId) return unavailable('An open roster spot is available; no drop is needed.');
  if(new Set(data.players.map(p=>p.playerId)).size!==data.players.length) return unavailable('Duplicate forecast identities.');
  const weeks:ProjectionWeek[]=futureProjectionWeeks(data.weeks,data.weekStartCutoffs,now,data.effectiveFromWeek ?? data.fromWeek).map(w=>({week:w.week,points:{}}));
  if(!weeks.length)return unavailable("No fully future weeks with verified timing remain.");
  for(const p of data.players) for(const week of weeks) {
    const matches=p.weeks.filter(w=>w.week===week.week),r=matches[0];
    if(matches.length!==1 || !r)continue;
    if(r.status==='bye') week.points[p.playerId]=null;
    else if(r.status==='covered' && typeof r.points==='number' && Number.isFinite(r.points) && typeof r.updatedAt==='number' && Number.isFinite(r.updatedAt) && r.updatedAt<=now+300000 && now-r.updatedAt<=7*86400000)week.points[p.playerId]=r.points;
  }
  const rostered=new Set(snapshot.teams.flatMap(t=>[...t.starters,...t.bench,...t.reserve,...t.taxi]).map(p=>p.playerId));
  const seen=new Set<string>();
  const rows:WaiverValue[]=[];
  try {
    // The unchanged roster is identical for every candidate: solve each week once.
    const baseline=weeks.map(w=>projectedLineup(active,snapshot.rosterSlots,w.points));
    const baselineComplete=baseline.every(w=>w.complete);
    const remaining=active.filter(p=>p.playerId!==dropId);
    for(const raw of snapshot.analysisWaiverPool) {
      if(typeof raw.player_id!=='string' || typeof raw.position!=='string' || !offense.has(raw.position) || rostered.has(raw.player_id))continue;
      if(seen.has(raw.player_id))return unavailable('Duplicate waiver identities.');
      seen.add(raw.player_id);
      const availability=assessAvailability({position:raw.position,status:raw.status??null,injury_status:raw.injury_status??null,roster_status:'bench'});
      if(!availability.currently_usable)continue;
      const candidate:PlayerSlot={playerId:raw.player_id,name:String(raw.name ?? raw.player_id),position:raw.position,
        slot:'BN',nflTeam:typeof raw.team==='string'?raw.team:null,status:typeof raw.status==='string'?raw.status:null,
        injuryStatus:typeof raw.injury_status==='string'?raw.injury_status:null,number:null,searchRank:null};
      let delta:number|null=null;
      // Missing baseline/candidate evidence cannot yield a complete-window comparison.
      // Avoid running the optimizer at all for those unknown candidates.
      if(baselineComplete && weeks.every(w=>Object.hasOwn(w.points,candidate.playerId))) {
        let sum=0,complete=true;
        for(let i=0;i<weeks.length;i++) {
          const after=projectedLineup([...remaining,candidate],snapshot.rosterSlots,weeks[i].points);
          if(!after.complete){complete=false;break;}
          sum+=after.points!-baseline[i].points!;
        }
        if(complete)delta=sum/weeks.length;
      }
      const complete=delta!==null;
      rows.push({playerId:candidate.playerId,name:candidate.name,position:candidate.position,
        delta,reason:complete?null:'Incomplete forecast or lineup.',uncertain:availability.availability==='uncertain'});
    }
  } catch {return unavailable('Projected lineup configuration or data requires review.');}
  rows.sort((a,b)=>(a.delta===null?1:0)-(b.delta===null?1:0) || (b.delta??0)-(a.delta??0) || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  return {status:'ready',reason:null,dropName:drop?.name??null,rows};
}
