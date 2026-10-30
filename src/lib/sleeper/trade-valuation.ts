import {futureProjectionWeeks} from "./projection-timing.ts";
import { compareProjectedRosters } from './projected-valuation.ts';
import type { TeamTradeImpact, TradeRequest } from './trade-analyzer.ts';
import type { LeagueSnapshot, TeamRoster } from './types.ts';

export type TradeValuation = {
  basis: 'projected_lineup' | 'structural_fallback'; reason: string;
  meanDelta: number | null; comparableWeeks: number; totalWeeks: number;
};
const active = (team: TeamRoster) => [...team.starters,...team.bench];
const offense = new Set(['QB','RB','WR','TE']);

/** Apply only complete-window forecasts; never combine point values and rank scores. */
export function applyTradeValuation(snapshot: LeagueSnapshot, request: TradeRequest,
  before: TeamRoster, after: TeamRoster, impact: TeamTradeImpact, now = Date.now()): TeamTradeImpact {
  const data=snapshot.projections;
  if (!data) return impact; // Historical snapshots preserve their existing analysis.
  const fallback = (reason: string): TeamTradeImpact => ({...impact,
    valuation:{basis:'structural_fallback',reason,meanDelta:null,comparableWeeks:0,totalWeeks:data.weeks.length},
    reasons:[`Structural fallback: ${reason}`, ...impact.reasons].slice(0,5)});
  if (!data.available) return fallback(data.reason ?? 'Projected values unavailable.');
  const fetched=Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now+300000 || now-fetched>7*86400000) return fallback('Projection capture is stale or invalid.');
  if (data.policy!=='core-offense-v1' || data.exclusions.some(x=>!['fum_rec_td','st_ff','st_fum_rec','st_td'].includes(x))) return fallback('Scoring policy requires review.');
  if (data.season!==snapshot.season || data.fromWeek!==snapshot.week || data.throughWeek < data.fromWeek || data.throughWeek>18 ||
      !Number.isInteger(data.fromWeek) || !Number.isInteger(data.throughWeek) ||
      data.weeks.length!==data.throughWeek-data.fromWeek+1 || data.weeks.some((w,i)=>w.week!==data.fromWeek+i)) return fallback('Projection window does not match this snapshot.');
  if (impact.rosterSize.requiredDrops) return fallback('Resolve follow-up drops before using projected valuation.');
  const movedIds = new Set([...request.teamAPlayerIds,...request.teamBPlayerIds,
    ...(request.teamADropIds ?? []),...(request.teamBDropIds ?? [])]);
  const moved = snapshot.teams.flatMap(t=>[...active(t),...t.reserve,...t.taxi]).filter(p=>movedIds.has(p.playerId));
  if (moved.some(p=>!offense.has(p.position) || ['IR','TAXI'].includes(p.slot))) return fallback('This trade or its follow-up drops include players outside the active offensive projection model.');
  // Revalidate the loaded forecast timestamps and coverage; an open tab may age.
  const ids=new Set([...active(before),...active(after)].filter(p=>offense.has(p.position)).map(p=>p.playerId));
  if (new Set(data.players.map(p=>p.playerId)).size!==data.players.length) return fallback('Duplicate forecast identities.');
  const weeks=futureProjectionWeeks(data.weeks,data.weekStartCutoffs,now,data.effectiveFromWeek ?? data.fromWeek).map(w=>({week:w.week,points:{...w.points}}));
  if(!weeks.length)return fallback("No fully future weeks with verified timing remain.");
  for(const id of ids) for(const week of weeks) {
    const entries=data.players.find(p=>p.playerId===id)?.weeks.filter(w=>w.week===week.week) ?? [];
    const row=entries[0];
    if(entries.length!==1 || !row || (row.status!=='bye' && (row.status!=='covered' ||
        typeof row.updatedAt!=='number' || !Number.isFinite(row.updatedAt) || row.updatedAt>now+300000 || now-row.updatedAt>7*86400000)) ||
        (row.status==='bye' ? week.points[id]!==null : !Number.isFinite(row.points) || week.points[id]!==row.points)) delete week.points[id];
  }
  try {
    const comparison=compareProjectedRosters(active(before),active(after),snapshot.rosterSlots,weeks);
    if (comparison.meanDelta===null || comparison.weeks.some(w=>w.delta===null)) return fallback('Complete projected lineups are unavailable for every week in the window.');
    const delta=comparison.meanDelta;
    const availabilityRisk=impact.availability.incoming.some(p=>p.availability!=='available');
    const verdict=delta < -0.005 ? 'Worse' : availabilityRisk ? 'Risky' : delta > 0.005 ? 'Improvement' : 'Mostly lateral';
    const reason=`Projected offensive lineup change: ${delta>=0?'+':''}${delta.toFixed(2)} points per week over ${weeks.length} week${weeks.length === 1 ? "" : "s"} (${weeks[0].week}–${weeks[weeks.length-1].week}).`;
    const injury=availabilityRisk ? 'Incoming availability remains uncertain; projections do not confirm future participation.' : 'Only fully future weeks are compared; same-day or unknown game timing is excluded. Forecasts assume future participation.';
    return {...impact,verdict,valuation:{basis:'projected_lineup',reason,meanDelta:delta,comparableWeeks:weeks.length,totalWeeks:weeks.length},
      reasons:[reason,injury,...impact.reasons.map(r=>`Structural context: ${r}`)].slice(0,5)};
  } catch {
    return fallback('Projected lineup configuration or data requires review.');
  }
}
