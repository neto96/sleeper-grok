// Private experiment policy. Missing rare categories are excluded, never imputed.
const EXCLUSIONS = {
  fum_rec_td: 'fumble-recovery touchdowns',
  st_ff: 'special-teams forced fumbles',
  st_fum_rec: 'special-teams fumble recoveries',
  st_td: 'special-teams touchdowns',
};
export function studyPolicy(summary) {
  if (!Array.isArray(summary?.scoringGaps) || summary.scoringGaps.some(x => typeof x !== 'string')) {
    throw new Error('Missing scoring coverage metadata.');
  }
  const unknown = summary.scoringGaps.filter(key => !Object.hasOwn(EXCLUSIONS, key));
  if (unknown.length) throw new Error(`Unsupported scoring requires review: ${unknown.join(', ')}`);
  const { fromWeek, throughWeek } = summary.window ?? {};
  if (!Number.isInteger(fromWeek) || !Number.isInteger(throughWeek) || fromWeek < 1 || throughWeek > 18 || fromWeek > throughWeek) {
    throw new Error('Invalid study window.');
  }
  return { version: 'core-offense-v1', metric: 'Core offensive projected points',
    exclusions: [...new Set(summary.scoringGaps)].map(key => EXCLUSIONS[key]),
    windowLabel: `Weeks ${fromWeek}–${throughWeek}`,
    championshipVerified: false,
    fullLeagueScoring: false, // K/DEF are outside this metric even with no offensive gaps.
    fullOffensiveScoring: summary.scoringGaps.length === 0,
    verdictInfluence: false };
}
