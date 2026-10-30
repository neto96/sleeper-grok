/** Date-only schedules close a whole week at midnight UTC on its first game day.
 * This intentionally excludes some still-playable games instead of inventing kickoff times.
 */
export function weekStartCutoffs(schedule:unknown):Record<number,number|null> {
  const result:Record<number,number|null>={};
  if(!Array.isArray(schedule))return result;
  for(const game of schedule) {
    if(!game || !Number.isInteger(game.week) || game.week<1 || game.week>18)continue;
    const date=typeof game.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(game.date)?game.date:null;
    const stamp=date?Date.parse(`${date}T00:00:00Z`):NaN;
    const valid=Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===date;
    if(!valid || (game.status && !['scheduled','pre','pre_game','not_started'].includes(game.status) && game.status!=='complete')) {
      result[game.week]=null;
    } else if(game.status==='complete') result[game.week]=0;
    else if(result[game.week]!==null) result[game.week]=Math.min(result[game.week]??Infinity,stamp);
  }
  return result;
}
export function futureProjectionWeeks<T extends {week:number}>(weeks:T[],cutoffs:Record<number,number|null>|undefined,now:number,effectiveFromWeek=1):T[] {
  if(!Number.isInteger(effectiveFromWeek) || effectiveFromWeek<1 || effectiveFromWeek>18)return [];
  return weeks.filter(w=>w.week>=effectiveFromWeek && typeof cutoffs?.[w.week]==='number' && Number.isFinite(cutoffs[w.week]) && cutoffs[w.week]!>now);
}
