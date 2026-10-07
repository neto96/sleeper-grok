/**
 * Informational weekly context adapter.
 * Source: Firecrawl Alexandria's fantasydata-com weekly rankings capability.
 * It consumes provider player id, name, position, team, opponent, rank, positional
 * rank, projected points, week and observed timestamp. Sleeper's fantasy_data_id
 * is the stable provider-id bridge; otherwise matching is name/team/position,
 * then uniquely name/position. Ambiguous records are never merged.
 * The production fetch/cache lives in weekly-context.server.ts. FantasyData
 * supplies one source only; matchup ratings, floor/ceiling and ROS values are
 * unavailable there. Context never changes V3.3/V3.4 valuation or waiver scores.
 */

export type WeeklyMatchStatus = "matched" | "unmatched" | "ambiguous";
export type MatchMethod = "provider_id" | "name_team_position" | "name_position_fallback";
export type MatchResult<T> = {
  status: WeeklyMatchStatus;
  method: MatchMethod | null;
  record: T | null;
  reason: string | null;
};

export type PlayerIdentity = {
  sleeperId: string;
  name: string;
  team: string | null;
  position: string;
  fantasyDataId?: string | number | null;
};

export type ExternalWeeklyPlayer = {
  player_id?: string | number | null;
  fantasy_data_id?: string | number | null;
  name?: string | null;
  position?: string | null;
  team?: string | null;
  opponent_id?: string | null;
  week?: number | null;
  projected_points?: number | null;
  rank?: number | string | null;
  pos_rank?: number | string | null;
  low?: number | null;
  high?: number | null;
  matchup_rating?: string | null;
  matchup_score?: number | null;
  rest_of_season_rank?: number | null;
  rest_of_season_positional_rank?: number | null;
  observed_at_ms?: number | null;
};

export type WeeklySourceObservation = {
  provider: string;
  capability: string;
  record: ExternalWeeklyPlayer;
  observedAt?: string | null;
};

export type WeeklyContext = {
  week: number;
  opponent: string | null;
  sources: number;
  projection: { consensus_points: number | null; low: number | null; high: number | null };
  weekly_rank: number | null;
  positional_rank: number | null;
  matchup: { rating: "great" | "good" | "neutral" | "tough" | "very_tough" | "unknown"; score: number | null };
  rest_of_season: { rank: number | null; positional_rank: number | null };
  confidence: { level: "high" | "medium" | "low" | "unknown"; reason: string | null };
  source_metadata: Array<{ provider: string; capability: string; observed_at: string | null }>;
};

export type PlayerWeeklyContextResult = {
  match_status: WeeklyMatchStatus;
  match_method: MatchMethod | null;
  match_reason: string | null;
  context: WeeklyContext | null;
};

const HIGH_CONFIDENCE_MAX_RELATIVE_SPREAD = 0.12;
const LOW_CONFIDENCE_MIN_RELATIVE_SPREAD = 0.30;
const HIGH_CONFIDENCE_MIN_SOURCES = 3;

export function normalizePlayerName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function normalizedPosition(value: unknown): string {
  const position = String(value ?? "").trim().toUpperCase();
  if (position === "DST" || position === "D/ST") return "DEF";
  return position;
}

function normalizedTeam(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function externalId(record: ExternalWeeklyPlayer): string | null {
  const value = record.fantasy_data_id ?? record.player_id;
  return value == null || String(value).trim() === "" ? null : String(value);
}

export function matchExternalPlayer<T extends ExternalWeeklyPlayer>(
  player: PlayerIdentity,
  records: T[],
): MatchResult<T> {
  const providerId = player.fantasyDataId == null ? null : String(player.fantasyDataId);
  if (providerId) {
    const byId = records.filter((candidate) => externalId(candidate) === providerId);
    if (byId.length === 1) return { status: "matched", method: "provider_id", record: byId[0]!, reason: null };
    if (byId.length > 1) return { status: "ambiguous", method: "provider_id", record: null, reason: "Provider ID maps to multiple records." };
  }

  const name = normalizePlayerName(player.name);
  const position = normalizedPosition(player.position);
  if (!name || !position) return { status: "unmatched", method: null, record: null, reason: "Name or position is missing." };
  const namePosition = records.filter(
    (candidate) => normalizePlayerName(candidate.name) === name && normalizedPosition(candidate.position) === position,
  );
  const team = normalizedTeam(player.team);
  const exact = team
    ? namePosition.filter((candidate) => normalizedTeam(candidate.team) === team)
    : [];
  if (exact.length === 1) return { status: "matched", method: "name_team_position", record: exact[0]!, reason: null };
  if (exact.length > 1) return { status: "ambiguous", method: "name_team_position", record: null, reason: "Name, team and position map to multiple records." };
  if (namePosition.length === 1) {
    return { status: "matched", method: "name_position_fallback", record: namePosition[0]!, reason: "Matched by normalized name and position; team did not resolve uniquely." };
  }
  if (namePosition.length > 1) return { status: "ambiguous", method: "name_position_fallback", record: null, reason: "Name and position map to multiple records." };
  return { status: "unmatched", method: null, record: null, reason: "No provider record matched name, team and position." };
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rankedNumber(value: unknown): number | null {
  const direct = finite(value);
  if (direct != null) return direct;
  const match = String(value ?? "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Normalize an explicit categorical provider matchup label; never infer from team/opponent. */
export function normalizeMatchupRating(value: unknown): WeeklyContext["matchup"]["rating"] {
  const label = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["great", "excellent", "favorable"].includes(label)) return "great";
  if (["good", "plus", "above_average"].includes(label)) return "good";
  if (["neutral", "average"].includes(label)) return "neutral";
  if (["tough", "difficult"].includes(label)) return "tough";
  if (["very_tough", "terrible", "unfavorable"].includes(label)) return "very_tough";
  return "unknown";
}

function projectionConfidence(values: number[]): WeeklyContext["confidence"] {
  if (values.length === 0) return { level: "unknown", reason: "No projection values were available." };
  if (values.length === 1) return { level: "low", reason: "Only one source provided a projection." };
  const center = median(values)!;
  const spread = (Math.max(...values) - Math.min(...values)) / Math.max(Math.abs(center), 1);
  if (spread > LOW_CONFIDENCE_MIN_RELATIVE_SPREAD) return { level: "low", reason: "Projection sources disagree substantially." };
  if (values.length >= HIGH_CONFIDENCE_MIN_SOURCES && spread <= HIGH_CONFIDENCE_MAX_RELATIVE_SPREAD) {
    return { level: "high", reason: "At least three sources cluster closely." };
  }
  return { level: "medium", reason: "Multiple sources contribute, with some uncertainty." };
}

export function normalizeWeeklyContext(
  week: number,
  observations: WeeklySourceObservation[],
): WeeklyContext {
  const projectionObservations = observations.filter((observation) => finite(observation.record.projected_points) != null);
  const points = projectionObservations.map((observation) => finite(observation.record.projected_points)!);
  const reportedLow = projectionObservations.map((observation) => finite(observation.record.low)).filter((value): value is number => value != null);
  const reportedHigh = projectionObservations.map((observation) => finite(observation.record.high)).filter((value): value is number => value != null);
  const ranks = observations.map((observation) => rankedNumber(observation.record.rank)).filter((value): value is number => value != null);
  const positionRanks = observations.map((observation) => rankedNumber(observation.record.pos_rank)).filter((value): value is number => value != null);
  const opponents = [...new Set(observations.map((observation) => normalizedTeam(observation.record.opponent_id)).filter(Boolean))];
  const ratings = observations.map((observation) => normalizeMatchupRating(observation.record.matchup_rating)).filter((rating) => rating !== "unknown");
  const rating = ratings.length > 0 && ratings.every((candidate) => candidate === ratings[0]) ? ratings[0]! : "unknown";
  const scores = observations.map((observation) => finite(observation.record.matchup_score)).filter((value): value is number => value != null);
  const rosRanks = observations.map((observation) => finite(observation.record.rest_of_season_rank)).filter((value): value is number => value != null);
  const rosPositionRanks = observations.map((observation) => finite(observation.record.rest_of_season_positional_rank)).filter((value): value is number => value != null);
  const sourceMetadata = [...new Map(observations.map((observation) => [observation.provider, {
    provider: observation.provider,
    capability: observation.capability,
    observed_at: observation.observedAt ?? null,
  }])).values()];
  return {
    week,
    opponent: opponents.length === 1 ? opponents[0]! : null,
    sources: new Set(projectionObservations.map((observation) => observation.provider)).size,
    projection: {
      consensus_points: median(points),
      low: reportedLow.length ? Math.min(...reportedLow) : points.length > 1 ? Math.min(...points) : null,
      high: reportedHigh.length ? Math.max(...reportedHigh) : points.length > 1 ? Math.max(...points) : null,
    },
    weekly_rank: median(ranks),
    positional_rank: median(positionRanks),
    matchup: { rating, score: scores.length ? median(scores) : null },
    rest_of_season: { rank: median(rosRanks), positional_rank: median(rosPositionRanks) },
    confidence: projectionConfidence(points),
    source_metadata: sourceMetadata,
  };
}

export function resolveWeeklyContexts(
  players: PlayerIdentity[],
  records: ExternalWeeklyPlayer[],
  week: number,
  provider: string,
  capability: string,
  observedAt: string | null = null,
): Record<string, PlayerWeeklyContextResult> {
  const results: Record<string, PlayerWeeklyContextResult> = {};
  const consumed = new Set<ExternalWeeklyPlayer>();
  for (const player of players) {
    const match = matchExternalPlayer(player, records);
    if (match.status !== "matched" || !match.record) {
      results[player.sleeperId] = {
        match_status: match.status,
        match_method: match.method,
        match_reason: match.reason,
        context: null,
      };
      continue;
    }
    if (consumed.has(match.record)) {
      results[player.sleeperId] = {
        match_status: "ambiguous",
        match_method: match.method,
        match_reason: "Provider record was already matched to another Sleeper player.",
        context: null,
      };
      continue;
    }
    consumed.add(match.record);
    const recordObservedAt = finite(match.record.observed_at_ms);
    const at = observedAt ?? (recordObservedAt == null ? null : new Date(recordObservedAt).toISOString());
    const sourceObservation = { provider, capability, record: match.record, observedAt: at };
    results[player.sleeperId] = {
      match_status: "matched",
      match_method: match.method,
      match_reason: match.reason,
      context: normalizeWeeklyContext(week, [sourceObservation]),
    };
  }
  return results;
}
