import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligiblePregame, evaluateCohort } from './evaluation.mjs';
test('only strictly pregame captures qualify; date-only is conservative', () => {
  const input = { fetchedAt: '2026-10-28T18:00:00Z', updatedAt: Date.parse('2026-10-28T17:00:00Z'), gameDate: '2026-10-29' };
  assert.equal(eligiblePregame(input), true);
  assert.equal(eligiblePregame({ ...input, gameDate: '2026-10-28' }), false);
  assert.equal(eligiblePregame({ ...input, kickoffAt: input.fetchedAt }), false);
  assert.equal(eligiblePregame({ ...input, updatedAt: Infinity }), false);
});
const record = (id, projected, actual, rank) => ({ playerId: id, projected, actual, searchRank: rank,
  season: '2026', week: 8, position: 'WR', pregameVerified: true, final: true, scoringMatched: true });
test('paired ranking comparison and MAE use the same eligible players', () => {
  const result = evaluateCohort([record('a', 20, 18, 30), record('b', 10, 12, 1)]);
  assert.equal(result.meanAbsoluteError, 2);
  assert.equal(result.pairs.projectionCorrect, 1);
  assert.equal(result.pairs.rankCorrect, 0);
});
test('unfinalized, unmatched, postgame and absent outcomes are excluded', () => {
  const base = record('a', 10, 0, 1);
  for (const change of [{ final: false }, { scoringMatched: false }, { pregameVerified: false }, { actual: null }]) {
    assert.equal(evaluateCohort([{ ...base, ...change }]).eligiblePlayers, 0);
  }
  assert.equal(evaluateCohort([base]).eligiblePlayers, 1);
});
test('ties stay visible, positions are separate, duplicates rejected', () => {
  const a = record('a', 10, 15, 1), b = record('b', 10, 12, 1);
  assert.equal(evaluateCohort([a, b]).pairs.projectionTies, 1);
  assert.equal(evaluateCohort([a, { ...b, position: 'QB' }]).pairs.count, 0);
  assert.throws(() => evaluateCohort([a, a]), /Duplicate/);
});
