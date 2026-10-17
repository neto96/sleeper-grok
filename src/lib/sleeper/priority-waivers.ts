import { selectPriorityCandidates } from "./priority-candidates.ts";
import { getSlotEligiblePositions, type AnalysisRecord } from "./analysis/engine.ts";
import { assessAvailability } from "./analysis/availability.ts";
import type { LeagueSnapshot } from "./types.ts";

export type PriorityWaiverGroup = {
  title: string;
  slot: string;
  week: number | null;
  candidates: AnalysisRecord[];
};

export const PRIORITY_WAIVER_NOTE = "Options match the position and known availability. Check bye weeks and game status before adding.";

/** Presentation only: preserve the original candidate order and every score. */
export function priorityWaiverGroups(snapshot: Pick<LeagueSnapshot, "fantasyAnalysis" | "myRosterId" | "actionableWaiverAnalysis" | "waiverByPosition">): PriorityWaiverGroup[] {
  const analysis = snapshot.fantasyAnalysis;
  const team = (analysis.teams as Record<string, AnalysisRecord> | undefined)?.[String(snapshot.myRosterId)];
  const actions = (team?.recommendations as AnalysisRecord | undefined)?.actions;
  if (!Array.isArray(actions)) return [];
  const configuration = (analysis.roster_configuration ?? {}) as AnalysisRecord;
  const waiver = snapshot.actionableWaiverAnalysis;
  const groups: PriorityWaiverGroup[] = [];
  const seen = new Set<string>();
  for (const action of actions as AnalysisRecord[]) {
    if (action.urgency !== "act_now" || !["lineup_hole", "bye_week", "k_stream", "def_stream"].includes(String(action.category))) continue;
    if (typeof action.position_or_slot !== "string" || !action.position_or_slot.trim()) continue;
    const slot = action.position_or_slot.trim().toUpperCase();
    const week = typeof action.week === "number" && Number.isInteger(action.week) && action.week > 0 ? action.week : null;
    const key = `${slot}:${week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const eligible = getSlotEligiblePositions(slot, configuration);
    // Special teams have no offensive waiver score; retain their raw pool order.
    const source: AnalysisRecord[] = slot === "K" || slot === "DEF"
      ? (snapshot.waiverByPosition[slot] ?? []).filter((player) => assessAvailability({ position: player.position, status: player.status, injury_status: player.injuryStatus }).currently_usable)
        .map((player) => ({ player_id: player.playerId, name: player.name, position: player.position, team: player.nflTeam,
          ...assessAvailability({ position: player.position, status: player.status, injury_status: player.injuryStatus }),
        }))
      : [];
    const candidates = slot === "K" || slot === "DEF"
      ? source.filter((player) => eligible.includes(String(player.position)) && player.currently_usable !== false && player.availability !== "unavailable" && player.availability !== "unknown").slice(0, 3)
      : selectPriorityCandidates(waiver ?? {}, slot, week, configuration, (analysis.priority_bye_schedule ?? {}) as AnalysisRecord);
    groups.push({ title: `Priority Need: ${slot}${week === null ? "" : ` for Week ${week}`}`, slot, week, candidates });
  }
  return groups;
}
