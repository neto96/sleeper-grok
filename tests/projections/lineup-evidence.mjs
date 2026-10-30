import { projectedLineup } from './lineup.mjs';

export function lineupEvidence(before, transferred, resolved, slots, points) {
  const a = projectedLineup(before, slots, points);
  const interim = projectedLineup(transferred, slots, points);
  const b = projectedLineup(resolved, slots, points);
  const names = new Map([...before, ...transferred, ...resolved].map(p => [p.playerId, p.name ?? p.playerId]));
  const incomplete = value => value.complete ? null : value.missing.length
    ? `Missing forecasts: ${value.missing.map(id => names.get(id) ?? id).join(', ')}`
    : 'Not enough eligible players with forecasts to fill every offensive slot.';
  const beforeIds = new Set(a.lineup.map(p => p.playerId));
  const afterIds = new Set(b.lineup.map(p => p.playerId));
  const comparable = a.complete && b.complete;
  return { before: a, transferred: interim, after: b,
    beforeReason: incomplete(a), afterReason: incomplete(b),
    entering: comparable ? [...afterIds].filter(id => !beforeIds.has(id)).map(id => names.get(id)) : [],
    leaving: comparable ? [...beforeIds].filter(id => !afterIds.has(id)).map(id => names.get(id)) : [],
    // Components require all three complete lineups on this exact same week.
    tradeOnlyDelta: comparable && interim.complete ? interim.points - a.points : null,
    dropDelta: comparable && interim.complete ? b.points - interim.points : null,
    finalDelta: comparable ? b.points - a.points : null };
}
