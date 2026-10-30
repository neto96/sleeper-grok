import {weekStartCutoffs} from "./projection-timing.ts";
import { estimatePlayer, scoringGaps, type ForecastRow } from './projection-scoring.ts';
import { validateSchedule } from './projection-schedule.ts';
import type { ProjectionWeek } from './projected-valuation.ts';

export type ProjectionIdentity = {id: string; position: string; team: string | null; injuryStatus?: string | null};
export type ProjectionData = {
  effectiveFromWeek?: number;
  weekStartCutoffs?: Record<number,number|null>;
  available: boolean; reason: string | null; fetchedAt: string;
  season: string; fromWeek: number; throughWeek: number;
  policy: 'core-offense-v1'; exclusions: string[]; championshipVerified: false;
  weeks: ProjectionWeek[]; players: ReturnType<typeof estimatePlayer>[];
};
type Input = { season: string; fromWeek: number; throughWeek: number;
  players: ProjectionIdentity[]; scoring: Record<string, number>; schedule: unknown };
type GetJson = (url: string, signal?: AbortSignal) => Promise<unknown>;
const KNOWN_EXCLUSIONS = new Set(['fum_rec_td','st_ff','st_fum_rec','st_td']);
const OFFENSE = new Set(['QB','RB','WR','TE']);
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {headers:{Accept:'application/json'},signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Projection request failed (${response.status})`);
  return response.json();
}
/** Bound even injected transports that ignore cancellation; always remove listeners. */
async function getWithinBudget(get: GetJson, url: string, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Projection retrieval exceeded its time budget'));
    signal.addEventListener('abort', onAbort, {once:true});
  });
  try { return await Promise.race([get(url, signal), aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
/** No polling or partial run reuse. Three requests in flight, 20 seconds total. */
export async function loadProjections(input: Input, get: GetJson = getJson, now = Date.now(), budget: AbortSignal = AbortSignal.timeout(20_000)): Promise<ProjectionData> {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([budget, cancellation.signal]);
  const base: ProjectionData = {available:false,reason:null,fetchedAt:new Date(now).toISOString(),
    season:input.season,fromWeek:input.fromWeek,throughWeek:input.throughWeek,
    policy:'core-offense-v1',exclusions:[],championshipVerified:false,weeks:[],players:[]};
  try {
    if (!/^\d{4}$/.test(input.season) || !Number.isInteger(input.fromWeek) || !Number.isInteger(input.throughWeek) ||
        input.fromWeek < 1 || input.throughWeek > 18 || input.fromWeek > input.throughWeek) throw new Error('Invalid projection window');
    if (!Object.keys(input.scoring).length || Object.values(input.scoring).some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid league scoring');
    base.exclusions = scoringGaps(input.scoring);
    if (base.exclusions.some(key => !KNOWN_EXCLUSIONS.has(key))) throw new Error('Unsupported league scoring requires review');
    const schedule = validateSchedule(input.schedule);
    const players = input.players.filter(p => OFFENSE.has(p.position));
    if (!players.length || new Set(players.map(p=>p.id)).size !== players.length) throw new Error('Missing or duplicate projection identities');
    const window = Array.from({length:input.throughWeek-input.fromWeek+1},(_,i)=>input.fromWeek+i);
    const rows: ForecastRow[] = [];
    for (let start=0; start<window.length; start+=3) {
      const batch = await Promise.all(window.slice(start,start+3).map(async week => {
        const payload = await getWithinBudget(get, `https://api.sleeper.app/projections/nfl/${input.season}/${week}?season_type=regular&position%5B%5D=QB&position%5B%5D=RB&position%5B%5D=WR&position%5B%5D=TE`, signal);
        if (!Array.isArray(payload) || payload.some(row=>!row || typeof row !== 'object' ||
            typeof row.player_id !== 'string' || row.week !== week || String(row.season)!==input.season || row.season_type!=='regular')) {
          throw new Error('Invalid projection response identity');
        }
        return payload as ForecastRow[];
      }));
      rows.push(...batch.flat());
    }
    const results = players.map(player => estimatePlayer({player, rows, scoring:input.scoring,
      season:input.season,fromWeek:input.fromWeek,throughWeek:input.throughWeek,asOf:now,
      // No known team means no validated schedule: every forecast stays unknown.
      teamSchedule:player.team && Object.hasOwn(schedule,player.team) ? schedule[player.team] : {}}));
    const weeks = window.map(week => {
      const points: Record<string,number|null> = Object.create(null);
      for (const player of results) {
        const row=player.weeks.find(r=>r.week===week)!;
        if (row.status==='covered') points[player.playerId]=row.points;
        else if(row.status==='bye') points[player.playerId]=null;
      }
      return {week,points};
    });
    return {...base,available:true,weeks,players:results,weekStartCutoffs:weekStartCutoffs(input.schedule)};
  } catch (error) {
    return {...base,reason:budget.aborted ? 'Projection retrieval exceeded its time budget' : error instanceof Error ? error.message : 'Projection retrieval failed'};
  } finally {
    cancellation.abort();
  }
}
