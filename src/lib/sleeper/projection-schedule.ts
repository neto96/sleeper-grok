import type { ScheduledWeek } from './projection-scoring.ts';
const TEAMS = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');

// Only derive byes from a complete, internally consistent regular-season schedule.
export function validateSchedule(input: unknown) {
  if (!Array.isArray(input) || input.length !== 272) throw new Error('Schedule must contain 272 games');
  const games = input as {week: number; home: string; away: string; game_id: string}[];
  const ids = new Set();
  const byTeam: Record<string, Record<number, ScheduledWeek>> = Object.fromEntries(TEAMS.map(team => [team, {}]));
  for (const game of games) {
    if (!game || !Number.isInteger(game.week) || game.week < 1 || game.week > 18 ||
      !TEAMS.includes(game.home) || !TEAMS.includes(game.away) || game.home === game.away ||
      typeof game.game_id !== 'string' || !game.game_id || ids.has(game.game_id)) {
      throw new Error('Invalid or duplicated scheduled game');
    }
    ids.add(game.game_id);
    for (const [team, opponent] of [[game.home, game.away], [game.away, game.home]]) {
      if (byTeam[team][game.week]) throw new Error('Team scheduled twice in one week');
      byTeam[team][game.week] = { opponent, gameId: game.game_id };
    }
  }
  for (const team of TEAMS) {
    if (Object.keys(byTeam[team]).length !== 17) throw new Error('Incomplete team schedule');
    for (let week = 1; week <= 18; week++) byTeam[team][week] ??= { bye: true };
  }
  return byTeam;
}
