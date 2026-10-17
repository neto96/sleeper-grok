import { getSlotEligiblePositions, type AnalysisRecord } from "./analysis/engine.ts";

export const UNKNOWN_PRIORITY_BYE_NOTE = "Target-week bye status is unknown for some options; verify their schedule before adding.";

/** Unknown schedule evidence remains a clearly labelled fallback, never confirmed eligibility. */
export function priorityByeStatus(player: AnalysisRecord, week: number | null, schedule: AnalysisRecord): "eligible" | "on_bye" | "unknown" {
  const byes = schedule.bye_weeks_by_team as Record<string, unknown> | undefined;
  const team = String(player.team ?? "").toUpperCase();
  const weeks = byes?.[team];
  if (schedule.available !== true || week === null || !Number.isInteger(week) ||
    week < Number(schedule.start_week) || week > Number(schedule.end_week) ||
    !Number.isInteger(schedule.start_week) || !Number.isInteger(schedule.end_week) ||
    !Array.isArray(weeks) || !weeks.every(w => Number.isInteger(w) && w >= 1 && w <= 18)) return "unknown";
  return weeks.includes(week) ? "on_bye" : "eligible";
}

export function targetWeekCandidates(candidates: AnalysisRecord[], week: number | null, schedule: AnalysisRecord): AnalysisRecord[] {
  return candidates.filter(player => player.currently_usable !== false && player.availability !== "unavailable" && player.availability !== "unknown")
    .map(player => ({ ...player, target_week_bye_status: priorityByeStatus(player, week, schedule) }))
    .filter(player => player.target_week_bye_status !== "on_bye");
}

export function selectPriorityCandidates(analysis: AnalysisRecord, slot: string, week: number | null, configuration: AnalysisRecord, schedule: AnalysisRecord): AnalysisRecord[] {
  if (analysis.available !== true) return [];
  const byWeek = analysis.target_week_candidates as Record<string, unknown> | undefined;
  const source = byWeek?.[String(week)] ?? analysis.positional_candidates ?? analysis.candidates;
  if (!Array.isArray(source)) return [];
  const eligible = ["QB", "RB", "WR", "TE"].includes(slot) ? [slot] : getSlotEligiblePositions(slot, configuration);
  return targetWeekCandidates(source as AnalysisRecord[], week, schedule)
    .filter(player => eligible.includes(String(player.position))).slice(0, 3);
}
