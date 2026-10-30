import { analyzeTrade, simulateTradeRosters, type TradeRequest } from './trade-analyzer.ts';
import { compareProjectedRosters, type ProjectionWeek } from './projected-valuation.ts';
import type { LeagueSnapshot } from './types.ts';

/** Validated, league-scored weeks only. The provider adapter owns freshness/scoring validation. */
export function analyzeProjectedTrade(snapshot: LeagueSnapshot, request: TradeRequest,
  weeks: ProjectionWeek[], drops: {teamA: string[]; teamB: string[]} = {teamA: request.teamADropIds ?? [], teamB: request.teamBDropIds ?? []}) {
  const structural = analyzeTrade({...snapshot, projections: undefined}, {...request,teamADropIds:[],teamBDropIds:[]});
  if (!structural.valid) return structural;
  const beforeA = snapshot.teams.find(t => t.rosterId === request.teamAId)!;
  const beforeB = snapshot.teams.find(t => t.rosterId === request.teamBId)!;
  const simulated = simulateTradeRosters(beforeA, beforeB, request.teamAPlayerIds, request.teamBPlayerIds);
  const errors: string[] = [];
  for (const key of ['teamA','teamB'] as const) {
    const active = [...simulated[key].starters,...simulated[key].bench];
    if (new Set(drops[key]).size !== drops[key].length || drops[key].some(id => !active.some(p => p.playerId === id))) {
      errors.push(`${key}: follow-up drops must be distinct active players on the resulting roster.`);
    }
    if (drops[key].length > structural[key].rosterSize.requiredDrops) errors.push(`${key}: too many follow-up drops.`);
  }
  if (errors.length) return {valid: false as const, errors};
  const evaluate = (key: 'teamA' | 'teamB') => {
    const before = key === 'teamA' ? beforeA : beforeB;
    const after = simulated[key];
    return compareProjectedRosters([...before.starters,...before.bench],
      [...after.starters,...after.bench].filter(p => !drops[key].includes(p.playerId)),
      snapshot.rosterSlots, weeks, structural[key].rosterSize.requiredDrops - drops[key].length);
  };
  return {valid: true as const, structural, metric: 'projected_offensive_lineup_change' as const,
    teamA: evaluate('teamA'), teamB: evaluate('teamB')};
}
