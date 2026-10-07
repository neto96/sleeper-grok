import type { AnalysisRecord } from "./engine.ts";
import { assessAvailability } from "./availability.ts";
import type { PlayerWeeklyContextResult } from "./weekly-context.ts";

export type WeeklyOpportunity = {
  target_week: number;
  position: string;
  projection_points: number | null;
  weekly_rank: number | null;
  positional_rank: number | null;
  opponent: string | null;
  context_quality: "strong" | "usable" | "limited" | "unknown";
  opportunity: "excellent" | "good" | "neutral" | "poor" | "unknown";
  reason: string | null;
};

export type WeeklyStreamOption = {
  player_id: string;
  name: string;
  position: string;
  waiver_value_score: number | null;
  availability: string | null;
  opportunity: WeeklyOpportunity;
};

export type WeeklyStreamingAction = {
  urgency: string;
  position: string;
  target_week: number;
  title: string;
  options: WeeklyStreamOption[];
  reason: string;
  rankings_available: boolean;
};

const POSITIONAL_RANK_BANDS: Record<string, [number, number, number]> = {
  QB: [8, 16, 24],
  RB: [12, 24, 36],
  WR: [12, 24, 36],
  TE: [6, 12, 20],
  K: [6, 12, 20],
  DEF: [6, 12, 20],
};

function record(value: unknown): AnalysisRecord {
  return value && typeof value === "object" ? value as AnalysisRecord : {};
}

function list(value: unknown): AnalysisRecord[] {
  return Array.isArray(value) ? value as AnalysisRecord[] : [];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function classifyWeeklyOpportunity(position: string, positionalRank: number | null): WeeklyOpportunity["opportunity"] {
  if (positionalRank == null || positionalRank < 1) return "unknown";
  const bands = POSITIONAL_RANK_BANDS[position];
  if (!bands) return "unknown";
  if (positionalRank <= bands[0]) return "excellent";
  if (positionalRank <= bands[1]) return "good";
  if (positionalRank <= bands[2]) return "neutral";
  return "poor";
}

export function buildWeeklyOpportunity(
  targetWeek: number,
  position: string,
  result: PlayerWeeklyContextResult | AnalysisRecord | undefined,
): WeeklyOpportunity {
  const resolution = record(result);
  const context = record(resolution.context);
  if (resolution.match_status !== "matched" || finite(context.week) !== targetWeek) {
    return {
      target_week: targetWeek,
      position,
      projection_points: null,
      weekly_rank: null,
      positional_rank: null,
      opponent: null,
      context_quality: "unknown",
      opportunity: "unknown",
      reason: null,
    };
  }
  const projection = record(context.projection);
  const confidence = record(context.confidence);
  const projectionPoints = finite(projection.consensus_points);
  const weeklyRank = finite(context.weekly_rank);
  const positionalRank = finite(context.positional_rank);
  const hasContext = projectionPoints != null || weeklyRank != null || positionalRank != null;
  const contextQuality: WeeklyOpportunity["context_quality"] = !hasContext
    ? "unknown"
    : confidence.level === "high" && positionalRank != null
      ? "strong"
      : confidence.level === "medium" && positionalRank != null
        ? "usable"
        : "limited";
  const opportunity = classifyWeeklyOpportunity(position, positionalRank);
  const rankText = positionalRank == null ? "" : `${position}${positionalRank}`;
  const projectionText = projectionPoints == null ? "" : `${projectionPoints.toFixed(1)} projected points`;
  const reason = [rankText, projectionText].filter(Boolean).join(" · ") || null;
  return {
    target_week: targetWeek,
    position,
    projection_points: projectionPoints,
    weekly_rank: weeklyRank,
    positional_rank: positionalRank,
    opponent: typeof context.opponent === "string" ? context.opponent : null,
    context_quality: contextQuality,
    opportunity,
    reason,
  };
}

export function selectTargetWeek(team: AnalysisRecord, position: string): number | null {
  const readiness = record(team.future_readiness);
  const weeks = record(readiness.weeks);
  const matchingWeeks = Object.entries(weeks)
    .map(([week, value]) => ({ week: Number(week), row: record(record(value).positions && record(record(value).positions)[position]) }))
    .filter(({ week }) => Number.isInteger(week))
    .sort((a, b) => a.week - b.week);
  const hole = matchingWeeks.find(({ row }) => row.status === "uncovered");
  if (hole) return hole.week;

  const need = record(record(record(team.availability).usable_position_need)[position]).need;
  if (["critical", "thin", "moderate"].includes(String(need))) {
    const currentWeek = Number(readiness.horizon_start_week);
    return Number.isInteger(currentWeek) ? currentWeek : null;
  }
  return null;
}

function opportunityOrder(value: WeeklyOpportunity["opportunity"]): number {
  return ({ excellent: 0, good: 1, neutral: 2, poor: 3, unknown: 4 })[value];
}

export function buildWeeklyOpportunityView(
  team: AnalysisRecord,
  actionableWaiverAnalysis: AnalysisRecord,
  contextByPlayer: Record<string, PlayerWeeklyContextResult | AnalysisRecord>,
  freeAgentPool: AnalysisRecord[] = [],
): { by_player: Record<string, WeeklyOpportunity>; actions: WeeklyStreamingAction[] } {
  const candidates = list(actionableWaiverAnalysis.candidates)
    .filter((candidate) => candidate.currently_usable !== false);
  const byPlayer: Record<string, WeeklyOpportunity> = {};
  for (const candidate of candidates) {
    const position = String(candidate.position ?? "");
    const week = selectTargetWeek(team, position);
    if (week == null) continue;
    const id = String(candidate.player_id ?? "");
    if (id) byPlayer[id] = buildWeeklyOpportunity(week, position, contextByPlayer[id]);
  }

  const recommendations = list(record(team.recommendations).actions);
  const actions: WeeklyStreamingAction[] = [];
  for (const action of recommendations) {
    const position = String(action.position_or_slot ?? "");
    const upgrade = action.category === "upgrade" && action.urgency === "opportunity";
    const targetWeek = finite(action.week) ?? (upgrade ? selectTargetWeek(team, position) : null);
    if (targetWeek == null || (!upgrade && !["act_now", "plan_ahead", "watch"].includes(String(action.urgency)))) continue;
    const sourceCandidates = position === "K" || position === "DEF"
      ? freeAgentPool.filter((candidate) => String(candidate.position) === position
        && assessAvailability(candidate).currently_usable)
      : candidates.filter((candidate) => String(candidate.position) === position);
    const options: WeeklyStreamOption[] = [];
    for (const candidate of sourceCandidates) {
      const id = String(candidate.player_id ?? "");
      const opportunity = buildWeeklyOpportunity(targetWeek, position, contextByPlayer[id]);
      if (!id || opportunity.opportunity === "unknown") continue;
      options.push({
        player_id: id,
        name: String(candidate.name ?? id),
        position,
        waiver_value_score: finite(candidate.waiver_value_score),
        availability: candidate.availability === "uncertain" ? "questionable" : null,
        opportunity,
      });
    }
    options.sort((a, b) => opportunityOrder(a.opportunity.opportunity) - opportunityOrder(b.opportunity.opportunity)
      || (a.opportunity.positional_rank ?? Infinity) - (b.opportunity.positional_rank ?? Infinity)
      || (b.opportunity.projection_points ?? -Infinity) - (a.opportunity.projection_points ?? -Infinity));
    if (options.length === 0 && position !== "K" && position !== "DEF") continue;
    actions.push({
      urgency: String(action.urgency),
      position,
      target_week: targetWeek,
      title: String(action.title ?? `Add a ${position} for Week ${targetWeek}`),
      options: options.slice(0, 3),
      reason: options.length > 0
        ? `Weekly rankings for Week ${targetWeek} are informational; the existing waiver order and scores are unchanged.`
        : `Streaming rankings are not available for Week ${targetWeek}.`,
      rankings_available: options.length > 0,
    });
  }
  return { by_player: byPlayer, actions };
}
