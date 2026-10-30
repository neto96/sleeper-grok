const ELIGIBLE: Record<string, readonly string[]> = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['WR', 'RB'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'] };

// Projection objective: scores are validated league-scored offensive points.
// A null score is a verified bye; a missing key is an unknown forecast.
export type ProjectionPlayer = { playerId: string; position: string; slot: string };
export type LineupEntry = { slot: string; index: number; playerId: string; points: number };
export type ProjectedLineup = { complete: boolean; points: number | null; missing: string[]; lineup: LineupEntry[] };
export type ProjectionWeek = { week: number; points: Record<string, number | null> };

export function projectedLineup(players: ProjectionPlayer[], slots: string[], points: Record<string, number | null>): ProjectedLineup {
  if (new Set(players.map(p => p.playerId)).size !== players.length) throw new Error('Duplicate roster player');
  const offense = slots.filter(s => !['K', 'DEF', 'BN', 'IR'].includes(s));
  if (offense.some(s => !ELIGIBLE[s]) || offense.length > 12) throw new Error('Unsupported lineup configuration');
  const active = players.filter(p => !['IR', 'TAXI'].includes(p.slot) && ['QB','RB','WR','TE'].includes(p.position));
  const missing = active.filter(p => !Object.hasOwn(points, p.playerId));
  if (missing.length) return { complete: false, points: null, missing: missing.map(p => p.playerId), lineup: [] };
  let states = new Map<number, { points: number; lineup: LineupEntry[] }>([[0, { points: 0, lineup: [] }]]);
  for (const p of [...active].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    const score = points[p.playerId];
    if (score === null) continue; // Explicit bye/unavailable, not missing data.
    if (!Number.isFinite(score)) throw new Error('Invalid projection');
    const next = new Map(states);
    for (const [mask, state] of states) offense.forEach((slot, index) => {
      if ((mask & (1 << index)) || !ELIGIBLE[slot].includes(p.position)) return;
      const key = mask | (1 << index), total = state.points + score;
      if (!next.has(key) || next.get(key)!.points < total) next.set(key, { points: total,
        lineup: [...state.lineup, { slot, index, playerId: p.playerId, points: score }] });
    });
    states = next;
  }
  const result = states.get((1 << offense.length) - 1);
  return result ? { complete: true, missing: [], ...result } : { complete: false, points: null, missing: [], lineup: [] };
}

export function compareProjectedRosters(before: ProjectionPlayer[], after: ProjectionPlayer[], slots: string[], weeks: ProjectionWeek[], requiredDrops = 0) {
  const weekIds = weeks.map(w => w.week);
  if (new Set(weekIds).size !== weekIds.length || weekIds.some(w => !Number.isInteger(w) || w < 1 || w > 18)) {
    throw new Error('Invalid or duplicate projection week');
  }
  if (requiredDrops > 0) return { blocked: 'Select follow-up drops before comparing projected lineups.', weeks: [], meanDelta: null };
  const results = weeks.map(({ week, points }) => {
    const a = projectedLineup(before, slots, points), b = projectedLineup(after, slots, points);
    return { week, before: a, after: b, delta: a.complete && b.complete ? b.points! - a.points! : null };
  });
  const comparable = results.filter(x => x.delta !== null);
  return { blocked: null, weeks: results, meanDelta: comparable.length ? comparable.reduce((s, x) => s + x.delta!, 0) / comparable.length : null };
}

/**
 * Roster-specific marginal value: the complete starting lineup with this player
 * versus its best complete lineup after removal. Bench coverage is the baseline;
 * a supplied available free agent may replace the removed player in that one slot
 * of roster capacity. This is not a cross-position market/trade fairness price.
 */
export function projectedReplacementValue(
  roster: ProjectionPlayer[], playerId: string, slots: string[], weeks: ProjectionWeek[],
  availableReplacements: ProjectionPlayer[] = [],
) {
  const player = roster.find(p => p.playerId === playerId);
  if (!player || !['QB', 'RB', 'WR', 'TE'].includes(player.position) || ['IR', 'TAXI'].includes(player.slot)) {
    throw new Error('Choose an active offensive roster player');
  }
  const rosterIds = new Set(roster.map(p => p.playerId));
  if (new Set(availableReplacements.map(p => p.playerId)).size !== availableReplacements.length ||
      availableReplacements.some(p => rosterIds.has(p.playerId) || !['QB','RB','WR','TE'].includes(p.position) || ['IR','TAXI'].includes(p.slot))) {
    throw new Error('Invalid available replacement pool');
  }
  // Reuse comparison validation, including duplicate weeks and roster entries.
  compareProjectedRosters(roster, roster, slots, weeks);
  const remaining = roster.filter(p => p.playerId !== playerId);
  const results = weeks.map(({week, points}) => {
    const withPlayer = projectedLineup(roster, slots, points);
    const alternatives = [
      { replacementId: null as string | null, result: projectedLineup(remaining, slots, points) },
      ...availableReplacements.map(p => ({ replacementId: p.playerId,
        result: projectedLineup([...remaining, {...p, slot: 'BN'}], slots, points) })),
    ];
    // Unknown candidate forecasts mean the best replacement cannot be established.
    const missing = [...new Set(alternatives.flatMap(a => a.result.missing))].sort();
    const complete = alternatives.filter(a => a.result.complete).sort((a,b) =>
      b.result.points! - a.result.points! || (a.replacementId ?? '').localeCompare(b.replacementId ?? ''));
    const best = missing.length ? undefined : complete[0];
    return {week, withPlayer, withoutPlayer: best?.result ?? null,
      replacementId: best?.replacementId ?? null, missing,
      pointsAboveReplacement: withPlayer.complete && best ? withPlayer.points! - best.result.points! : null};
  });
  const comparable = results.filter(r => r.pointsAboveReplacement !== null);
  return {playerId, basis: 'roster_and_supplied_available_pool' as const,
    candidateCount: availableReplacements.length, weeks: results,
    comparableWeeks: comparable.length,
    meanPointsAboveReplacement: comparable.length
      ? comparable.reduce((sum,r) => sum + r.pointsAboveReplacement!, 0) / comparable.length : null};
}
