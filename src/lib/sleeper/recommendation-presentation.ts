import type { AnalysisRecord } from "./analysis/engine.ts";

export type PresentedRecommendation = {
  title: string; reason: string; urgency: string; week: number | null;
  /** Original evidence, retained without modifying the engine's action objects. */
  sources: AnalysisRecord[];
};

/** Only a known, losslessly restatable depth warning may be consolidated. */
function depthWarning(action: AnalysisRecord): { name: string; position: string; key: string } | null {
  if (action.category !== "depth" || action.urgency !== "watch" || !Number.isInteger(action.week)
    || action.recommended_drop != null || !Array.isArray(action.related_player_ids)) return null;
  const position = String(action.position_or_slot);
  if (position !== "QB" && position !== "TE") return null;
  const prefix = String(action.reason).match(/^(.+) is your only available (QB|TE) for Week (\d+)\./);
  if (!prefix || prefix[2] !== position || Number(prefix[3]) !== action.week) return null;
  const name = prefix[1]!;
  const expected = `${name} is your only available ${position} for Week ${action.week}. There is no legal replacement if ${name} cannot play; a currently covered starting slot would be left unfilled.`;
  if (action.reason !== expected || action.title !== `${position} coverage is thin for Week ${action.week}`) return null;
  // Extra or changed metadata must not be silently discarded during a merge.
  const { week: _week, title: _title, reason: _reason, ...identity } = action;
  return { name, position, key: JSON.stringify(identity) };
}

export function presentRecommendations(actions: readonly AnalysisRecord[], currentWeek?: number): PresentedRecommendation[] {
  const rows: (PresentedRecommendation & { key?: string; end?: number; name?: string; position?: string })[] = [];
  // A stable copy permits chronological merging even when engine order interleaves positions.
  for (const action of [...actions].sort((a, b) => Number(a.week ?? Infinity) - Number(b.week ?? Infinity))) {
    const depth = depthWarning(action);
    const week = typeof action.week === "number" ? action.week : null;
    const previous = depth ? [...rows].reverse().find(row => row.key === depth.key && row.end === Number(week) - 1) : undefined;
    if (previous) {
      previous.sources.push(action);
      previous.end = week!;
      previous.reason = `${depth!.name} has no backup in Weeks ${previous.week}–${week}; if they cannot play, a starting slot is empty.`;
    } else {
      rows.push({ title: depth ? `${depth.position} depth` : String(action.title ?? "Review roster"),
        reason: depth ? `${depth.name} has no backup in Week ${week}; if they cannot play, a starting slot is empty.` : String(action.reason ?? ""),
        urgency: String(action.urgency ?? "watch"), week, sources: [action],
        ...(depth ? { key: depth.key, end: week!, name: depth.name, position: depth.position } : {}) });
    }
  }
  const priority = (row: PresentedRecommendation) => row.urgency === "act_now" ? 0
    : row.urgency === "watch" && row.week != null && currentWeek != null && row.week <= currentWeek + 1 ? 1 : 2;
  return rows.sort((a,b) => priority(a) - priority(b) || Number(a.week ?? Infinity) - Number(b.week ?? Infinity))
    .map(({ title, reason, urgency, week, sources }) => ({ title, reason, urgency, week, sources }));
}
