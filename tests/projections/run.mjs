import { readFile, writeFile } from 'node:fs/promises';
import { estimatePlayer, compareCommonWeeks } from './estimate.mjs';
import { fantasyValueTier } from '../../src/lib/sleeper/analysis/engine.ts';
import { validateSchedule } from './schedule.mjs';
import { studyPolicy } from './policy.mjs';

const output = new URL('../../test-results/projections/', import.meta.url);
const capture = JSON.parse(await readFile(new URL('capture.json', output), 'utf8'));
const { season, fromWeek, throughWeek } = capture.window;
const players = capture.players.data;
const scoring = capture.league.data.scoring_settings;
const schedule = capture.schedule ? validateSchedule(capture.schedule.data) : null;
const rows = [];
for (let week = fromWeek; week <= throughWeek; week++) {
  const data = capture[`week${week}`].data;
  if (!Array.isArray(data)) throw new Error(`Week ${week} is not an array`);
  rows.push(...data);
}
const asOf = Math.max(...Object.values(capture).filter(x => x.fetchedAt).map(x => Date.parse(x.fetchedAt)));
const ids = [...new Set(capture.rosters.data.flatMap(roster => roster.players))];
const results = ids.filter(id => ['QB', 'RB', 'WR', 'TE'].includes(players[id]?.position)).map(id => {
  const player = players[id];
  const result = estimatePlayer({ player: { id, team: player.team, position: player.position, injuryStatus: player.injury_status },
    rows, scoring, season, fromWeek, throughWeek, asOf, teamSchedule: schedule?.[player.team] });
  return { name: `${player.first_name} ${player.last_name}`, position: player.position,
    searchRank: player.search_rank ?? null, tier: fantasyValueTier({ search_rank: player.search_rank ?? null }), ...result };
});
// Same-position, same-tier comparisons on overlapping weeks. Examples are descriptive,
// never claims of observed predictive accuracy or recommendations to make a trade.
const pairs = [];
for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
  const a = results[i], b = results[j];
  if (a.position !== b.position || a.tier !== b.tier || a.tier === 'unknown') continue;
  if (a.injuryStatus || b.injuryStatus) continue;
  const comparison = compareCommonWeeks(a, b);
  if (comparison.count >= 6) pairs.push({ a: a.name, b: b.name, position: a.position, tier: a.tier,
    ranks: [a.searchRank, b.searchRank], ...comparison });
}
pairs.sort((a, b) => Math.abs(b.meanDifference) - Math.abs(a.meanDifference));
const namedComparisons = [['Puka Nacua', 'A.J. Brown'], ['Michael Wilson', 'Rome Odunze'],
  ['Michael Wilson', 'Xavier Worthy']].map(([first, second]) => {
  const a = results.find(x => x.name === first), b = results.find(x => x.name === second);
  return a && b ? { a: first, b: second, tiers: [a.tier, b.tier], ...compareCommonWeeks(a, b) } : null;
}).filter(Boolean);
const summary = { capturedAt: new Date(asOf).toISOString(), window: capture.window,
  rosteredOffense: results.length, anyCoverage: results.filter(x => x.coveredWeeks > 0).length,
  completeTotals: results.filter(x => x.remainingTotal !== null).length,
  scheduleValidated: !!schedule,
  scoringGaps: [...new Set(results.flatMap(x => x.scoringGaps))],
  weekStatuses: results.flatMap(x => x.weeks).reduce((map, x) => ({ ...map, [x.status]: (map[x.status] ?? 0) + 1 }), {}),
  sameTierExamples: pairs.slice(0, 6),
  sameTierPairsCompared: pairs.length,
  sameTierPairsAtLeastOnePointApart: pairs.filter(x => Math.abs(x.meanDifference) >= 1).length,
  namedComparisons,
  caveats: ['No accuracy backtest: forecasts have not been evaluated against subsequent outcomes.',
    schedule ? 'Byes derived from a complete validated schedule; other gaps remain unknown.' : 'No verified bye schedule supplied; missing weeks remain unknown.',
    'Supported-stat subtotals exclude flagged scoring categories and are not complete league totals.',
    'Current injury flags do not establish future return dates.',
    'Week 17 is the explicit experiment cutoff, not an automatically inferred championship.'] };
const tradeTeams = capture.rosters.data.map(roster => {
  const convert = (id, slot) => { const p = players[id] ?? {}; return { playerId: id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || id,
    position: p.position ?? 'Unknown', slot, nflTeam: p.team ?? null,
    status: p.status ?? null, injuryStatus: p.injury_status ?? null, number: p.number ?? null,
    searchRank: p.search_rank ?? null }; };
  const reserve = new Set(roster.reserve ?? []), taxi = new Set(roster.taxi ?? []);
  return { rosterId: roster.roster_id, teamName: `Roster ${roster.roster_id}`,
    ownerName: `Roster ${roster.roster_id}`, username: '', avatar: null, isCommissioner: false,
    wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, waiverPosition: 0,
    faabUsed: 0, faabBudget: 0, streak: null, starters: [],
    bench: roster.players.filter(id => !reserve.has(id) && !taxi.has(id)).map(id => convert(id, 'BN')),
    reserve: [...reserve].map(id => convert(id, 'IR')), taxi: [...taxi].map(id => convert(id, 'TAXI')) };
});
const tradeInput = { teams: tradeTeams, leagueId: capture.league.data.league_id,
  leagueName: capture.league.data.name, season, fetchedAt: summary.capturedAt,
  rosterSlots: capture.league.data.roster_positions.filter(s => s !== 'BN'),
  benchSlots: capture.league.data.roster_positions.filter(s => s === 'BN').length };
await writeFile(new URL('comparison.json', output), JSON.stringify({ summary, policy: studyPolicy(summary), results, tradeInput }, null, 2));
console.log(JSON.stringify(summary, null, 2));
