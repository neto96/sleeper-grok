import { selectPriorityCandidates, UNKNOWN_PRIORITY_BYE_NOTE } from "../priority-candidates.ts";
import type { AnalysisRecord } from "./engine.ts";
import { recommendSafeDrop, type RecommendedDrop } from "./recommended-drop.ts";

export type RecommendationUrgency = "act_now" | "plan_ahead" | "watch" | "opportunity" | "none";
export type RecommendationCategory =
  | "lineup_hole"
  | "bye_week"
  | "depth"
  | "waiver"
  | "def_stream"
  | "k_stream"
  | "upgrade";

export type RecommendationAction = {
  category: RecommendationCategory;
  urgency: RecommendationUrgency;
  position_or_slot: string | null;
  week: number | null;
  title: string;
  reason: string;
  related_player_ids: string[];
  recommended_drop?: RecommendedDrop | null;
};

const ORDER: Record<RecommendationUrgency, number> = {
  act_now: 0,
  plan_ahead: 1,
  watch: 2,
  opportunity: 3,
  none: 4,
};
const OFFENSE = new Set(["QB", "RB", "WR", "TE", "FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX"]);

function record(value: unknown): AnalysisRecord {
  return value && typeof value === "object" ? (value as AnalysisRecord) : {};
}

function list(value: unknown): AnalysisRecord[] {
  return Array.isArray(value) ? (value as AnalysisRecord[]) : [];
}

function playerName(team: AnalysisRecord, id: string): string {
  const positions = record(team.positions);
  for (const players of Object.values(positions)) {
    const found = list(players).find((player) => String(player.player_id) === id);
    if (found) return String(found.name ?? found.team ?? id);
  }
  return id;
}

function waiverCandidates(analysis: AnalysisRecord, position: string): AnalysisRecord[] {
  if (analysis.available !== true) return [];
  return list(analysis.candidates).filter(
    (candidate) => candidate.position === position && candidate.currently_usable !== false,
  );
}

function candidateNames(candidates: AnalysisRecord[]): string {
  const names = candidates.slice(0, 3).map((candidate) => String(candidate.name ?? "")).filter(Boolean);
  if (names.length === 0) return "No available waiver options identified.";
  return `Best available options: ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names)}.`;
}

function urgency(value: unknown): RecommendationUrgency | null {
  return value === "act_now" || value === "plan_ahead" || value === "watch" ? value : null;
}

function actionKey(action: RecommendationAction): string {
  return `${action.position_or_slot ?? ""}:${action.week ?? ""}`;
}

export function buildTeamRecommendations(
  team: AnalysisRecord,
  actionableWaiverAnalysis: AnalysisRecord = {},
  configuration: AnalysisRecord = {},
  priorityByeSchedule: AnalysisRecord = {},
): { actions: RecommendationAction[] } {
  const actions: RecommendationAction[] = [];
  const hasActionableWaiverAnalysis = actionableWaiverAnalysis.available === true;
  const readiness = record(team.future_readiness);
  const readinessWeeks = record(readiness.weeks);
  const coveredThin = new Set<string>();
  const uncoveredPositions = new Set<string>();
  const seen = new Set<string>();

  for (const [weekKey, weekValue] of Object.entries(readinessWeeks)) {
    const week = Number(weekKey);
    if (!Number.isInteger(week)) continue;
    const slots = record(record(weekValue).positions);
    for (const [position, rawRow] of Object.entries(slots)) {
      const row = record(rawRow);
      const status = row.status;
      const isSpecial = position === "DEF" || position === "K";
      // A single usable kicker or defense is enough; only an actual hole needs action.
      if (isSpecial && status !== "uncovered") continue;
      if (status === "thin" || (status === "covered" && row.usable != null && Number(row.usable) <= Number(row.required))) {
        coveredThin.add(position);
      }
      const affectedIds = list(row.affected_player_ids).map(String);
      if (status === "thin") {
        const action: RecommendationAction = {
          category: "depth",
          urgency: "watch",
          position_or_slot: position,
          week,
          title: `${position} coverage is thin for Week ${week}`,
          reason: String(row.reason ?? `Only enough usable ${position} players to fill the required slots.`),
          related_player_ids: list(row.assigned_player_ids).map(String),
        };
        const key = actionKey(action);
        if (!seen.has(key)) {
          seen.add(key);
          actions.push(action);
        }
        continue;
      }
      if (status !== "uncovered") continue;
      const rowUrgency = urgency(row.urgency) ?? (isSpecial && affectedIds.length > 0 ? "watch" : null);
      if (!rowUrgency || readiness.bye_schedule_available !== true) continue;
      const ids = affectedIds;
      const category: RecommendationCategory = isSpecial
        ? position === "DEF" ? "def_stream" : "k_stream"
        : ids.length > 0 ? "bye_week" : "lineup_hole";
      const candidates = OFFENSE.has(position) ? selectPriorityCandidates(actionableWaiverAnalysis, position, week, configuration, priorityByeSchedule) : [];
      const affectedName = ids.length ? playerName(team, ids[0]!) : position;
      let title: string;
      let reason: string;
      if (isSpecial) {
        title = `Add a ${position} for Week ${week}`;
        reason = ids.length
          ? `${affectedName} is on bye and no usable replacement is rostered.`
          : `No usable ${position} is available for the required Week ${week} slot.`;
      } else if (ids.length) {
        title = `${rowUrgency === "act_now" ? "Add" : "Plan for"} a ${position} for Week ${week}`;
        reason = `${affectedName} is on bye and no usable replacement is rostered.`;
      } else {
        title = `${rowUrgency === "act_now" ? "Add" : "Plan for"} a ${position} for Week ${week}`;
        reason = String(row.reason ?? `No usable ${position} is available for Week ${week}.`);
      }
      if (candidates.length > 0) {
        reason += ` ${candidateNames(candidates)}`;
        if (candidates.some(candidate => candidate.target_week_bye_status === "unknown")) reason += ` ${UNKNOWN_PRIORITY_BYE_NOTE}`;
      }
      else if (!isSpecial && OFFENSE.has(position) && hasActionableWaiverAnalysis) {
        reason += " No available waiver options identified.";
      }
      const action: RecommendationAction = {
        category,
        urgency: rowUrgency,
        position_or_slot: position,
        week,
        title,
        reason,
        related_player_ids: [...new Set([...ids, ...candidates.slice(0, 3).map((candidate) => String(candidate.player_id ?? "")).filter(Boolean)])],
      };
      const key = actionKey(action);
      if (!seen.has(key)) {
        seen.add(key);
        actions.push(action);
      }
      if (status === "uncovered") uncoveredPositions.add(position);
    }
  }

  // Current usable lineup slots are an engine result independent of schedule completeness.
  if (readiness.bye_schedule_available !== true) {
    const lineup = record(record(team.availability).usable_lineup);
    const coverage = record(team.lineup_coverage);
    const flexSlots = record(coverage.flex_slots);
    const week = Number(readiness.horizon_start_week);
    if (Number.isInteger(week)) {
      const requiredBySlot: Record<string, number> = {};
      for (const position of ["QB", "RB", "WR", "TE"]) {
        requiredBySlot[position] = Number(record(coverage[position]).required ?? 0);
      }
      for (const [slot, row] of Object.entries(flexSlots)) {
        requiredBySlot[slot] = Number(record(row).supported_required ?? 0);
      }
      for (const [slot, required] of Object.entries(requiredBySlot)) {
        if (required <= 0 || !OFFENSE.has(slot)) continue;
        const players = list(lineup[slot]);
        if (players.length >= required) continue;
        actions.push({
          category: "lineup_hole",
          urgency: "act_now",
          position_or_slot: slot,
          week,
          title: `Fill the ${slot} lineup for Week ${week}`,
          reason: `You are short ${required - players.length} availability-eligible ${slot} starter(s). Bye-week coverage is unknown.`,
          related_player_ids: players.map((player) => String(player.player_id ?? "")).filter(Boolean),
        });
      }
      // K/DEF are deliberately outside the offensive optimizer. Their current
      // availability can still reveal a hole when bye-week data is unavailable.
      for (const position of ["K", "DEF"]) {
        const required = Number(record(coverage[position]).required ?? 0);
        if (required <= 0) continue;
        const usableIds = new Set(
          list(record(team.availability).players)
            .filter((player) => player.position === position && player.currently_usable === true)
            .map((player) => String(player.player_id ?? ""))
            .filter(Boolean),
        );
        if (usableIds.size >= required) continue;
        actions.push({
          category: position === "DEF" ? "def_stream" : "k_stream",
          urgency: "act_now",
          position_or_slot: position,
          week,
          title: `Add a ${position} for Week ${week}`,
          reason: `You are short ${required - usableIds.size} availability-eligible ${position} starter(s). Bye-week coverage is unknown.`,
          related_player_ids: [...usableIds],
        });
      }
    }
  }

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    if (action.category === "depth" && uncoveredPositions.has(action.position_or_slot ?? "")) actions.splice(index, 1);
  }

  for (const position of ["QB", "RB", "WR", "TE"]) {
    if (uncoveredPositions.has(position) || coveredThin.has(position)) continue;
    const need = record(record(record(team.availability).usable_position_need)[position]).need;
    if (need !== "critical" && need !== "thin" && need !== "moderate") continue;
    const candidates = waiverCandidates(actionableWaiverAnalysis, position);
    if (candidates.length === 0) continue;
    actions.push({
      category: "upgrade",
      urgency: "opportunity",
      position_or_slot: position,
      week: null,
      title: `Consider adding a ${position}`,
      reason: candidateNames(candidates),
      related_player_ids: candidates.slice(0, 3).map((candidate) => String(candidate.player_id ?? "")).filter(Boolean),
    });
  }

  // Each action is an alternative evaluated against the original roster, not a sequence of drops.
  const urgentAdds = actions.filter((action) => action.urgency === "act_now" && ["lineup_hole", "bye_week", "k_stream", "def_stream"].includes(action.category));
  if (urgentAdds.length > 0) {
    const drop = recommendSafeDrop(team, configuration);
    for (const action of urgentAdds) {
      action.recommended_drop = drop;
      action.reason += drop
        ? ` Recommended drop: ${drop.name}. ${drop.reason} Evaluate this move on its own before making another add.`
        : " No clearly safe drop identified.";
    }
  }

  actions.sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || (a.week ?? 0) - (b.week ?? 0) || String(a.position_or_slot).localeCompare(String(b.position_or_slot)));
  return { actions };
}

export function addRecommendations(
  fantasyAnalysis: AnalysisRecord,
  actionableWaiverAnalysis: AnalysisRecord,
  myRosterId: number | string,
): void {
  const teams = record(fantasyAnalysis.teams) as Record<string, AnalysisRecord>;
  for (const [rosterId, team] of Object.entries(teams)) {
    team.recommendations = buildTeamRecommendations(
      team,
      rosterId === String(myRosterId) ? actionableWaiverAnalysis : {},
      record(fantasyAnalysis.roster_configuration),
      record(fantasyAnalysis.priority_bye_schedule),
    ) as unknown as AnalysisRecord;
  }
}
