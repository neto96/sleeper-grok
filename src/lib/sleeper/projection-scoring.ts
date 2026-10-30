export type ForecastRow = { player_id: string; week: number; season: string | number;
  season_type: string; category: string; stats?: Record<string, number>; updated_at?: number;
  team?: string; opponent?: string; game_id?: string };
export type ScheduledWeek = {bye?: boolean; opponent?: string; gameId?: string};
type EstimateInput = { player: {id: string; position: string; team?: string | null; injuryStatus?: string | null};
  rows: ForecastRow[]; scoring: Record<string, number>; season: string | number;
  fromWeek: number; throughWeek: number; asOf: number; maxAgeDays?: number;
  verifiedByeWeeks?: number[]; teamSchedule?: Record<number,ScheduledWeek> | null };
type WeekEstimate = {week: number; status: string; points: number | null; updatedAt: number | null};
const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE']);
const SUPPORTED = new Set(['pass_yd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_td', 'rush_2pt', 'rec', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost']);
// Explicitly irrelevant for QB/RB/WR/TE offensive production; unknown rules are flagged.
const OTHER_UNITS = new Set(['sack', 'int', 'ff', 'fum_rec', 'safe', 'blk_kick', 'def_td',
  'def_st_td', 'def_st_ff', 'def_st_fum_rec', 'pts_allow_0', 'pts_allow_1_6',
  'pts_allow_7_13', 'pts_allow_14_20', 'pts_allow_21_27', 'pts_allow_28_34', 'pts_allow_35p',
  'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50p', 'fgmiss', 'xpm', 'xpmiss']);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function scoringGaps(scoring: Record<string, number>) {
  return Object.entries(scoring).filter(([key, value]) => value !== 0 &&
    (!finite(value) || (!SUPPORTED.has(key) && !OTHER_UNITS.has(key)))).map(([key]) => key).sort();
}

export function estimatePlayer({ player, rows, scoring, season, fromWeek, throughWeek,
  asOf, maxAgeDays = 7, verifiedByeWeeks = [], teamSchedule = null }: EstimateInput) {
  if (!OFFENSE.has(player.position)) throw new Error('Only QB/RB/WR/TE supported');
  if (!Number.isInteger(fromWeek) || !Number.isInteger(throughWeek) ||
      fromWeek < 1 || throughWeek > 18 || throughWeek < fromWeek || !finite(asOf)) {
    throw new Error('Invalid evaluation window');
  }
  const gaps = scoringGaps(scoring);
  const weeks = [];
  for (let week = fromWeek; week <= throughWeek; week++) {
    const matches = rows.filter(row => row.player_id === player.id && row.week === week &&
      String(row.season) === String(season) && row.season_type === 'regular');
    const forecast = matches.filter(row => row.category === 'proj' && row.stats &&
      ['pass_yd', 'rush_yd', 'rec_yd'].some(key => finite(row.stats![key])));
    const entry: WeekEstimate = { week, status: 'missing', points: null, updatedAt: null };
    const scheduled = teamSchedule?.[week];
    if (scheduled?.bye || verifiedByeWeeks.includes(week)) {
      // A supplied schedule and a projection disagree: do not silently prefer either.
      entry.status = forecast.length ? 'schedule_conflict' : 'bye';
    } else if (matches.length > 1) entry.status = 'duplicate';
    else if (forecast.length === 1) {
      const row = forecast[0];
      entry.updatedAt = row.updated_at ?? null;
      if (teamSchedule && !scheduled) entry.status = 'unknown_schedule';
      else if (scheduled && (row.team !== player.team || row.opponent !== scheduled.opponent ||
        row.game_id !== scheduled.gameId)) entry.status = 'schedule_conflict';
      else if (!finite(row.updated_at)) entry.status = 'unknown_freshness';
      else if (row.updated_at > asOf + 300_000) entry.status = 'future_timestamp';
      else if (asOf - row.updated_at > maxAgeDays * 86_400_000) entry.status = 'stale';
      else if ([...SUPPORTED].some(key => key in row.stats! && !finite(row.stats![key]))) {
        entry.status = 'invalid_stats';
      } else if (Object.values(scoring).some(value => !finite(value))) entry.status = 'invalid_scoring';
      else {
        entry.status = 'covered';
        // Sparse, absent supported counting stats are assumed zero, explicitly documented.
        entry.points = [...SUPPORTED].reduce((sum, key) =>
          sum + (row.stats![key] ?? 0) * (scoring[key] ?? 0), 0);
        if (!Number.isFinite(entry.points)) { entry.status = "invalid_stats"; entry.points = null; }
      }
    }
    weeks.push(entry);
  }
  const covered = weeks.filter(week => week.status === 'covered');
  const unknown = weeks.filter(week => !['covered', 'bye'].includes(week.status));
  const subtotal = covered.length ? covered.reduce((sum, week) => sum + week.points!, 0) : null;
  return { playerId: player.id, injuryStatus: player.injuryStatus ?? null,
    coveredWeeks: covered.length, unknownWeeks: unknown.map(week => week.week),
    byeWeeks: weeks.filter(week => week.status === 'bye').map(week => week.week),
    scoringGaps: gaps, coveredSubtotal: subtotal,
    pointsPerCoveredGame: subtotal === null ? null : subtotal / covered.length,
    // Never label a partial scoring calculation or incomplete schedule as a full ROS total.
    remainingTotal: unknown.length === 0 && gaps.length === 0 ? subtotal : null,
    weeks };
}

export function compareCommonWeeks(a: {weeks: Pick<WeekEstimate, "week" | "status" | "points">[]}, b: {weeks: Pick<WeekEstimate, "week" | "status" | "points">[]}) {
  const common = a.weeks.filter(x => x.status === 'covered' &&
    b.weeks.some(y => y.week === x.week && y.status === 'covered'));
  if (!common.length) return { count: 0, meanDifference: null };
  return { count: common.length, meanDifference: common.reduce((sum, x) =>
    sum + x.points! - b.weeks.find(y => y.week === x.week)!.points!, 0) / common.length };
}
