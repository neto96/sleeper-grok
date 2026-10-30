// Evaluate only a matched, same-position cohort. No outcomes are fetched here.
// Dates without kickoff times use midnight UTC: conservative exclusion, not a
// claim that the game starts then. Same-day captures require precise kickoff data.
export function eligiblePregame({ fetchedAt, updatedAt, gameDate, kickoffAt }) {
  const fetched = Date.parse(fetchedAt);
  const kickoff = kickoffAt ? Date.parse(kickoffAt) :
    /^\d{4}-\d{2}-\d{2}$/.test(gameDate ?? '') ? Date.parse(`${gameDate}T00:00:00Z`) : NaN;
  return Number.isFinite(fetched) && Number.isFinite(kickoff) &&
    typeof updatedAt === 'number' && Number.isFinite(updatedAt) &&
    updatedAt <= fetched && fetched < kickoff;
}

export function evaluateCohort(records) {
  const valid = records.filter(r => r.pregameVerified === true && r.final === true &&
    r.scoringMatched === true && ['QB', 'RB', 'WR', 'TE'].includes(r.position) &&
    [r.projected, r.actual, r.searchRank].every(Number.isFinite) && r.searchRank > 0);
  const keys = valid.map(r => `${r.season}:${r.week}:${r.playerId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate player outcome');
  const pairs = { count: 0, projectionCorrect: 0, rankCorrect: 0,
    projectionTies: 0, rankTies: 0 };
  for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) {
    const a = valid[i], b = valid[j];
    if (a.season !== b.season || a.week !== b.week || a.position !== b.position || a.actual === b.actual) continue;
    pairs.count++;
    const actual = Math.sign(a.actual - b.actual);
    const prediction = Math.sign(a.projected - b.projected);
    const rank = Math.sign(b.searchRank - a.searchRank);
    pairs.projectionCorrect += prediction === actual ? 1 : 0;
    pairs.rankCorrect += rank === actual ? 1 : 0;
    pairs.projectionTies += prediction === 0 ? 1 : 0;
    pairs.rankTies += rank === 0 ? 1 : 0;
  }
  return { eligiblePlayers: valid.length, excludedPlayers: records.length - valid.length,
    meanAbsoluteError: valid.length ? valid.reduce((s, r) => s + Math.abs(r.projected - r.actual), 0) / valid.length : null,
    pairs, verdict: 'descriptive_only' };
}
