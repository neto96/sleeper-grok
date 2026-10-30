import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePlayer, compareCommonWeeks } from './estimate.mjs';
import { fantasyValueTier } from '../../src/lib/sleeper/analysis/engine.ts';
import { validateSchedule } from './schedule.mjs';
const asOf = Date.parse('2026-10-28T18:00:00Z');
const row = (week = 8, stats = { pass_yd: 250, pass_td: 2, pass_int: 1 }) => ({
  player_id: 'fixture', season: '2026', season_type: 'regular', week,
  category: 'proj', updated_at: asOf, stats });
const args = (changes = {}) => ({ player: { id: 'fixture', position: 'QB' },
  rows: [row()], scoring: { pass_yd: .04, pass_td: 6, pass_int: -2 },
  season: '2026', fromWeek: 8, throughWeek: 8, asOf, ...changes });
test('league six-point passing TDs replace generic scoring', () => {
  assert.equal(estimatePlayer(args()).remainingTotal, 20);
  assert.equal(estimatePlayer(args({ scoring: { pass_yd: .04, pass_td: 4, pass_int: -2 } })).remainingTotal, 16);
});
test('missing week is unknown, not zero or a full ROS total', () => {
  const result = estimatePlayer(args({ throughWeek: 9 }));
  assert.equal(result.coveredSubtotal, 20); assert.equal(result.remainingTotal, null);
  assert.deepEqual(result.unknownWeeks, [9]); assert.equal(result.pointsPerCoveredGame, 20);
});
test('verified bye is distinct from missing and conflicting projection', () => {
  assert.equal(estimatePlayer(args({ throughWeek: 9, verifiedByeWeeks: [9] })).remainingTotal, 20);
  assert.equal(estimatePlayer(args({ verifiedByeWeeks: [8] })).weeks[0].status, 'schedule_conflict');
});
test('ADP-only payload is not a forecast; genuine zero is retained', () => {
  assert.equal(estimatePlayer(args({ rows: [row(8, { adp_dd_ppr: 1 })] })).coveredSubtotal, null);
  assert.equal(estimatePlayer(args({ rows: [row(8, { pass_yd: 0, pass_td: 0 })] })).remainingTotal, 0);
});
test('wrong season, week, player and actuals cannot enter projections', () => {
  for (const change of [{ season: '2025' }, { week: 7 }, { player_id: 'other' }, { category: 'stat' }]) {
    assert.equal(estimatePlayer(args({ rows: [{ ...row(), ...change }] })).coveredSubtotal, null);
  }
});
test('stale, missing and future timestamps do not become usable forecasts', () => {
  for (const updated_at of [asOf - 8 * 86400000, undefined, asOf + 86400000]) {
    assert.equal(estimatePlayer(args({ rows: [{ ...row(), updated_at }] })).remainingTotal, null);
  }
});
test('duplicate and malformed rows fail closed', () => {
  assert.equal(estimatePlayer(args({ rows: [row(), row()] })).weeks[0].status, 'duplicate');
  assert.equal(estimatePlayer(args({ rows: [row(8, { pass_yd: 250, pass_td: NaN })] })).remainingTotal, null);
  assert.equal(estimatePlayer(args({ scoring: { pass_td: NaN } })).remainingTotal, null);
});
test('unsupported scoring is flagged and prevents a complete total', () => {
  const result = estimatePlayer(args({ scoring: { pass_yd: .04, pass_td: 6, fum_rec_td: 6 } }));
  assert.deepEqual(result.scoringGaps, ['fum_rec_td']); assert.equal(result.remainingTotal, null);
});
test('injured player retains production evidence and separate injury flag', () => {
  const result = estimatePlayer(args({ player: { id: 'fixture', position: 'QB', injuryStatus: 'IR' } }));
  assert.equal(result.coveredSubtotal, 20); assert.equal(result.injuryStatus, 'IR');
});
test('comparison uses identical weeks, not unequal coverage sums', () => {
  const a = estimatePlayer(args({ rows: [row(8), row(9)], throughWeek: 9 }));
  const b = estimatePlayer(args({ rows: [row(9)], throughWeek: 9 }));
  assert.deepEqual(compareCommonWeeks(a, b), { count: 1, meanDifference: 0 });
  assert.equal(compareCommonWeeks(a, estimatePlayer(args({ rows: [] }))).meanDifference, null);
});
test('projection distinctions are independent of tier boundaries', () => {
  assert.equal(fantasyValueTier({ search_rank: 1 }), fantasyValueTier({ search_rank: 50 }));
  assert.notEqual(fantasyValueTier({ search_rank: 50 }), fantasyValueTier({ search_rank: 51 }));
  const a = estimatePlayer(args());
  const b = estimatePlayer(args({ rows: [row(8, { pass_yd: 300, pass_td: 3, pass_int: 1 })] }));
  assert.equal(compareCommonWeeks(b, a).meanDifference, 8);
});
test('frozen inputs remain untouched and row order is irrelevant', () => {
  const input = args({ rows: [row(8), row(9)], throughWeek: 9 });
  const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } };
  freeze(input);
  assert.deepEqual(estimatePlayer(input), estimatePlayer({ ...input, rows: [...input.rows].reverse() }));
});
test('scheduled opponent, team and game must agree with forecast', () => {
  const input = args({ player: { id: 'fixture', position: 'QB', team: 'BUF' },
    rows: [{ ...row(), team: 'BUF', opponent: 'BAL', game_id: 'game' }],
    teamSchedule: { 8: { opponent: 'BAL', gameId: 'game' } } });
  assert.equal(estimatePlayer(input).coveredWeeks, 1);
  for (const change of [{ team: 'KC' }, { opponent: 'KC' }, { game_id: 'other' }]) {
    assert.equal(estimatePlayer({ ...input, rows: [{ ...input.rows[0], ...change }] }).weeks[0].status, 'schedule_conflict');
  }
});
test('incomplete schedule cannot manufacture bye weeks', () => {
  assert.throws(() => validateSchedule([]), /272 games/);
  assert.throws(() => validateSchedule(Array.from({ length: 272 }, () => ({
    week: 1, home: 'BUF', away: 'BAL', game_id: 'duplicate' }))), /duplicated/);
});
