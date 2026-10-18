import { buildFantasyAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./analysis/engine.ts";
import type { LeagueSnapshot, PlayerSlot, TeamRoster } from "./types.ts";

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const NEED_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2 };
const DEPTH_ORDER: Record<string, number> = { deep: 0, adequate: 1, covered_by_flex: 1, thin: 2, short: 3 };
const RISK_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2, very_high: 3 };
const TIER_ORDER: Record<string, number> = { unknown: 0, deep_waiver: 1, fringe: 2, useful: 3, strong: 4, elite: 5 };

export type TradeVerdict = "Strong improvement" | "Improvement" | "Mostly lateral" | "Risky" | "Worse";
export type DeltaDirection = "improved" | "unchanged" | "worsened";
export type TradeRequest = { teamAId: number; teamBId: number; teamAPlayerIds: string[]; teamBPlayerIds: string[] };

export type LineupChange = {
  context: "all_roster" | "available";
  slot: string;
  ordinal: number;
  kind: "filled" | "uncovered" | "upgraded" | "downgraded" | "changed";
  beforePlayerId: string | null;
  beforePlayerName: string | null;
  afterPlayerId: string | null;
  afterPlayerName: string | null;
};

export type PositionImpact = {
  position: (typeof POSITIONS)[number];
  need: DeltaDirection;
  depth: DeltaDirection;
  availableNeed: DeltaDirection;
  availableDepth: DeltaDirection;
};

export type ReplacementRiskChange = {
  playerId: string;
  playerName: string;
  direction: "increased" | "decreased";
  before: string;
  after: string;
};

export type AvailabilityMove = {
  playerId: string;
  playerName: string;
  position: string;
  availability: string;
  reason: string;
};

export type TeamTradeImpact = {
  rosterId: number;
  teamName: string;
  verdict: TradeVerdict;
  reasons: string[];
  rosterSize: { before: number; after: number; expected: number; overBy: number; underBy: number; requiredDrops: number };
  lineupChanges: LineupChange[];
  positionImpact: PositionImpact[];
  replacementRiskChanges: ReplacementRiskChange[];
  surplusChanges: { extraDepthAdded: string[]; extraDepthRemoved: string[]; safeToMoveAdded: string[]; safeToMoveRemoved: string[] };
  availability: { incoming: AvailabilityMove[]; outgoing: AvailabilityMove[] };
  potentialDrops: string[];
};

export type TradeAnalysisResult =
  | { valid: false; errors: string[] }
  | { valid: true; teamA: TeamTradeImpact; teamB: TeamTradeImpact; futureReadinessIncluded: false; note: string };

type LocatedPlayer = { player: PlayerSlot; bucket: "active" | "reserve" | "taxi" };
type TeamAnalysisPair = { team: TeamRoster; analysis: AnalysisRecord };

function activePlayers(team: TeamRoster): PlayerSlot[] {
  return [...team.starters, ...team.bench];
}
function allPlayers(team: TeamRoster): PlayerSlot[] {
  return [...team.starters, ...team.bench, ...team.reserve, ...team.taxi];
}
function locatePlayer(team: TeamRoster, playerId: string): LocatedPlayer | null {
  const active = activePlayers(team).find((player) => player.playerId === playerId);
  if (active) return { player: active, bucket: "active" };
  const reserve = team.reserve.find((player) => player.playerId === playerId);
  if (reserve) return { player: reserve, bucket: "reserve" };
  const taxi = team.taxi.find((player) => player.playerId === playerId);
  if (taxi) return { player: taxi, bucket: "taxi" };
  return null;
}
function cloneTeam(team: TeamRoster): TeamRoster {
  return {
    ...team,
    starters: team.starters.map((player) => ({ ...player })),
    bench: team.bench.map((player) => ({ ...player })),
    reserve: team.reserve.map((player) => ({ ...player })),
    taxi: team.taxi.map((player) => ({ ...player })),
  };
}
function removePlayers(team: TeamRoster, ids: Set<string>): TeamRoster {
  const next = cloneTeam(team);
  next.starters = next.starters.filter((player) => !ids.has(player.playerId));
  next.bench = next.bench.filter((player) => !ids.has(player.playerId));
  next.reserve = next.reserve.filter((player) => !ids.has(player.playerId));
  next.taxi = next.taxi.filter((player) => !ids.has(player.playerId));
  return next;
}
function addLocatedPlayer(team: TeamRoster, located: LocatedPlayer): void {
  const player = { ...located.player };
  if (located.bucket === "reserve") team.reserve.push({ ...player, slot: "IR" });
  else if (located.bucket === "taxi") team.taxi.push({ ...player, slot: "TAXI" });
  else team.bench.push({ ...player, slot: "BN" });
}

export function simulateTradeRosters(
  teamA: TeamRoster,
  teamB: TeamRoster,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
): { teamA: TeamRoster; teamB: TeamRoster } {
  const fromA = teamAPlayerIds.map((id) => locatePlayer(teamA, id));
  const fromB = teamBPlayerIds.map((id) => locatePlayer(teamB, id));
  const nextA = removePlayers(teamA, new Set(teamAPlayerIds));
  const nextB = removePlayers(teamB, new Set(teamBPlayerIds));
  for (const located of fromB) if (located) addLocatedPlayer(nextA, located);
  for (const located of fromA) if (located) addLocatedPlayer(nextB, located);
  return { teamA: nextA, teamB: nextB };
}

function playerRecord(player: PlayerSlot): AnalysisRecord {
  return {
    player_id: player.playerId,
    name: player.name,
    position: player.position,
    team: player.nflTeam,
    status: player.status,
    injury_status: player.injuryStatus,
    search_rank: player.searchRank,
  };
}
function rosterData(
  teams: TeamRoster[],
  startersByRoster: Map<number, Set<string>> = new Map(),
): Record<string, AnalysisRecord> {
  return Object.fromEntries(teams.map((team) => {
    const starterIds = startersByRoster.get(team.rosterId) ?? new Set<string>();
    return [String(team.rosterId), {
      team_name: team.teamName,
      owner: team.ownerName,
      players: allPlayers(team).map(playerRecord),
      starters: [...starterIds].map((playerId) => ({ player_id: playerId })),
      reserve: team.reserve.map((player) => ({ player_id: player.playerId })),
      taxi: team.taxi.map((player) => ({ player_id: player.playerId })),
    }];
  }));
}
function lineupIds(team: AnalysisRecord): Set<string> {
  const result = new Set<string>();
  const lineup = (team.optimal_lineup ?? {}) as Record<string, AnalysisRecord[]>;
  for (const players of Object.values(lineup)) {
    for (const player of players) if (player.player_id != null) result.add(String(player.player_id));
  }
  return result;
}
function analyzeNormalizedLeague(teams: TeamRoster[], rosterSlots: string[]): AnalysisRecord {
  const configuration = parseRosterConfiguration(rosterSlots);
  const preliminary = buildFantasyAnalysis(rosterData(teams), configuration);
  const preliminaryTeams = preliminary.teams as Record<string, AnalysisRecord>;
  const starters = new Map<number, Set<string>>();
  for (const team of teams) starters.set(team.rosterId, lineupIds(preliminaryTeams[String(team.rosterId)] ?? {}));
  return buildFantasyAnalysis(rosterData(teams, starters), configuration);
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function validateTrade(snapshot: LeagueSnapshot, request: TradeRequest): string[] {
  const errors: string[] = [];
  if (request.teamAId === request.teamBId) errors.push("Choose two different teams.");
  if (request.teamAPlayerIds.length === 0 || request.teamBPlayerIds.length === 0) errors.push("Each team must send at least one player.");
  if (unique(request.teamAPlayerIds).length !== request.teamAPlayerIds.length || unique(request.teamBPlayerIds).length !== request.teamBPlayerIds.length) {
    errors.push("A player cannot be selected more than once.");
  }
  if (request.teamAPlayerIds.some((id) => request.teamBPlayerIds.includes(id))) errors.push("The same player cannot be selected by both teams.");
  const teamA = snapshot.teams.find((team) => team.rosterId === request.teamAId);
  const teamB = snapshot.teams.find((team) => team.rosterId === request.teamBId);
  if (!teamA || !teamB) return [...errors, "One of the selected teams is not in this league snapshot."];
  for (const id of request.teamAPlayerIds) if (!locatePlayer(teamA, id)) errors.push(`${id} is not rostered by ${teamA.teamName}.`);
  for (const id of request.teamBPlayerIds) if (!locatePlayer(teamB, id)) errors.push(`${id} is not rostered by ${teamB.teamName}.`);
  return unique(errors);
}
function lineupEntries(value: unknown): Map<string, AnalysisRecord> {
  const lineup = value && typeof value === "object" ? value as Record<string, AnalysisRecord[]> : {};
  const result = new Map<string, AnalysisRecord>();
  for (const [slot, players] of Object.entries(lineup)) {
    players.forEach((player, index) => result.set(`${slot}:${index + 1}`, player));
  }
  return result;
}
function lineupDelta(before: AnalysisRecord, after: AnalysisRecord, context: LineupChange["context"]): LineupChange[] {
  const beforeLineup = context === "available"
    ? ((before.availability as AnalysisRecord | undefined)?.usable_lineup ?? {})
    : (before.optimal_lineup ?? {});
  const afterLineup = context === "available"
    ? ((after.availability as AnalysisRecord | undefined)?.usable_lineup ?? {})
    : (after.optimal_lineup ?? {});
  const b = lineupEntries(beforeLineup);
  const a = lineupEntries(afterLineup);
  const keys = [...new Set([...b.keys(), ...a.keys()])].sort();
  const changes: LineupChange[] = [];
  for (const key of keys) {
    const [slot = "", ordinalRaw = "0"] = key.split(":");
    const ordinal = Number(ordinalRaw);
    const beforePlayer = b.get(key);
    const afterPlayer = a.get(key);
    const beforeId = beforePlayer?.player_id == null ? null : String(beforePlayer.player_id);
    const afterId = afterPlayer?.player_id == null ? null : String(afterPlayer.player_id);
    if (beforeId === afterId) continue;
    let kind: LineupChange["kind"] = "changed";
    if (!beforePlayer && afterPlayer) kind = "filled";
    else if (beforePlayer && !afterPlayer) kind = "uncovered";
    else if (beforePlayer && afterPlayer) {
      const beforeTier = TIER_ORDER[String(beforePlayer.fantasy_value_tier ?? "unknown")] ?? 0;
      const afterTier = TIER_ORDER[String(afterPlayer.fantasy_value_tier ?? "unknown")] ?? 0;
      if (afterTier > beforeTier) kind = "upgraded";
      else if (afterTier < beforeTier) kind = "downgraded";
    }
    changes.push({
      context,
      slot,
      ordinal,
      kind,
      beforePlayerId: beforeId,
      beforePlayerName: beforePlayer?.name == null ? null : String(beforePlayer.name),
      afterPlayerId: afterId,
      afterPlayerName: afterPlayer?.name == null ? null : String(afterPlayer.name),
    });
  }
  return changes;
}
function compareMetric(before: unknown, after: unknown, order: Record<string, number>): DeltaDirection {
  const beforeValue = order[String(before ?? "")];
  const afterValue = order[String(after ?? "")];
  if (beforeValue == null || afterValue == null || beforeValue === afterValue) return "unchanged";
  return afterValue < beforeValue ? "improved" : "worsened";
}
function positionImpacts(before: AnalysisRecord, after: AnalysisRecord): PositionImpact[] {
  const beforeNeed = (before.position_need ?? {}) as Record<string, AnalysisRecord>;
  const afterNeed = (after.position_need ?? {}) as Record<string, AnalysisRecord>;
  const beforeDepth = (before.starting_depth ?? {}) as Record<string, AnalysisRecord>;
  const afterDepth = (after.starting_depth ?? {}) as Record<string, AnalysisRecord>;
  const beforeAvailability = (before.availability ?? {}) as AnalysisRecord;
  const afterAvailability = (after.availability ?? {}) as AnalysisRecord;
  const beforeUsableNeed = (beforeAvailability.usable_position_need ?? {}) as Record<string, AnalysisRecord>;
  const afterUsableNeed = (afterAvailability.usable_position_need ?? {}) as Record<string, AnalysisRecord>;
  const beforeUsableDepth = (beforeAvailability.usable_starting_depth ?? {}) as Record<string, AnalysisRecord>;
  const afterUsableDepth = (afterAvailability.usable_starting_depth ?? {}) as Record<string, AnalysisRecord>;
  return POSITIONS.map((position) => ({
    position,
    need: compareMetric(beforeNeed[position]?.need, afterNeed[position]?.need, NEED_ORDER),
    depth: compareMetric(beforeDepth[position]?.starting_depth, afterDepth[position]?.starting_depth, DEPTH_ORDER),
    availableNeed: compareMetric(beforeUsableNeed[position]?.need, afterUsableNeed[position]?.need, NEED_ORDER),
    availableDepth: compareMetric(beforeUsableDepth[position]?.starting_depth, afterUsableDepth[position]?.starting_depth, DEPTH_ORDER),
  }));
}
function replacementChanges(before: AnalysisRecord, after: AnalysisRecord): ReplacementRiskChange[] {
  const beforeRows = (before.roster_replacement_cost ?? []) as AnalysisRecord[];
  const afterRows = (after.roster_replacement_cost ?? []) as AnalysisRecord[];
  const beforeById = new Map(beforeRows.map((row) => [String(row.player_id), row]));
  const changes: ReplacementRiskChange[] = [];
  for (const row of afterRows) {
    const id = String(row.player_id);
    const previous = beforeById.get(id);
    if (!previous) continue;
    const beforeRisk = String(previous.replacement_cost ?? "low");
    const afterRisk = String(row.replacement_cost ?? "low");
    const b = RISK_ORDER[beforeRisk] ?? 0;
    const a = RISK_ORDER[afterRisk] ?? 0;
    if (a === b) continue;
    changes.push({
      playerId: id,
      playerName: String(row.name ?? id),
      direction: a > b ? "increased" : "decreased",
      before: beforeRisk,
      after: afterRisk,
    });
  }
  return changes;
}
function namedSurplus(team: AnalysisRecord, available: boolean): Map<string, string> {
  const availability = (team.availability ?? {}) as AnalysisRecord;
  const rows = (available ? availability.actionable_surplus : team.roster_surplus) as AnalysisRecord[] | undefined;
  const result = new Map<string, string>();
  for (const row of rows ?? []) {
    const type = String(row.surplus_type ?? "");
    if (available ? !["surplus", "replaceable"].includes(type) : type !== "surplus") continue;
    if (row.player_id != null) result.set(String(row.player_id), String(row.name ?? row.player_id));
  }
  return result;
}
function setDiffNames(left: Map<string, string>, right: Map<string, string>): string[] {
  return [...left.entries()].filter(([id]) => !right.has(id)).map(([, name]) => name);
}
function availabilityMove(team: AnalysisRecord, playerId: string): AvailabilityMove | null {
  const availability = (team.availability ?? {}) as AnalysisRecord;
  const row = ((availability.players ?? []) as AnalysisRecord[]).find((player) => String(player.player_id) === playerId);
  if (!row) return null;
  return {
    playerId,
    playerName: String(row.name ?? playerId),
    position: String(row.position ?? ""),
    availability: String(row.availability ?? "unknown"),
    reason: String(row.reason ?? "unknown_status").replaceAll("_", " "),
  };
}
function summarizeVerdict(
  lineupChanges: LineupChange[],
  impacts: PositionImpact[],
  riskChanges: ReplacementRiskChange[],
  requiredDrops: number,
  availabilityIncoming: AvailabilityMove[],
): { verdict: TradeVerdict; reasons: string[] } {
  const positiveLineup = lineupChanges.filter((change) => change.kind === "filled" || change.kind === "upgraded");
  const negativeLineup = lineupChanges.filter((change) => change.kind === "uncovered" || change.kind === "downgraded");
  const improvedPositions = impacts.filter((impact) => [impact.need, impact.depth, impact.availableNeed, impact.availableDepth].includes("improved"));
  const worsenedPositions = impacts.filter((impact) => [impact.need, impact.depth, impact.availableNeed, impact.availableDepth].includes("worsened"));
  const increasedRisk = riskChanges.filter((change) => change.direction === "increased");
  const decreasedRisk = riskChanges.filter((change) => change.direction === "decreased");
  const unavailableIncoming = availabilityIncoming.filter((move) => move.availability === "unavailable");
  const hasPositive = positiveLineup.length > 0 || improvedPositions.length > 0 || decreasedRisk.length > 0;
  const hasNegative = negativeLineup.length > 0 || worsenedPositions.length > 0 || increasedRisk.length > 0 || requiredDrops > 0 || unavailableIncoming.length > 0;
  let verdict: TradeVerdict;
  if (!hasPositive && hasNegative) verdict = "Worse";
  else if (hasPositive && hasNegative) verdict = "Risky";
  else if (positiveLineup.length >= 2 || improvedPositions.length >= 2) verdict = "Strong improvement";
  else if (hasPositive) verdict = "Improvement";
  else verdict = "Mostly lateral";

  const reasons: string[] = [];
  for (const change of positiveLineup.slice(0, 2)) {
    reasons.push(change.kind === "filled"
      ? `Fills ${change.slot}${change.ordinal} with ${change.afterPlayerName}.`
      : `Upgrades ${change.slot}${change.ordinal} from ${change.beforePlayerName} to ${change.afterPlayerName}.`);
  }
  for (const change of negativeLineup.slice(0, 2)) {
    reasons.push(change.kind === "uncovered"
      ? `Leaves ${change.slot}${change.ordinal} without a starter.`
      : `Downgrades ${change.slot}${change.ordinal} from ${change.beforePlayerName} to ${change.afterPlayerName}.`);
  }
  for (const impact of improvedPositions.slice(0, 2)) reasons.push(`${impact.position} depth or need improves.`);
  for (const impact of worsenedPositions.slice(0, 2)) reasons.push(`${impact.position} depth or need worsens.`);
  if (requiredDrops > 0) reasons.push(`Requires ${requiredDrops} follow-up drop${requiredDrops === 1 ? "" : "s"} to reach the active roster limit.`);
  if (unavailableIncoming.length > 0) reasons.push(`Adds ${unavailableIncoming.map((move) => move.playerName).join(", ")} while currently unavailable.`);
  if (reasons.length === 0) reasons.push("The current analysis sees little starting-lineup or depth change.");
  return { verdict, reasons: unique(reasons).slice(0, 5) };
}
function buildTeamImpact(
  before: TeamAnalysisPair,
  after: TeamAnalysisPair,
  incomingIds: string[],
  outgoingIds: string[],
  expectedRosterSize: number,
): TeamTradeImpact {
  const lineupChanges = [
    ...lineupDelta(before.analysis, after.analysis, "all_roster"),
    ...lineupDelta(before.analysis, after.analysis, "available"),
  ];
  const positionImpact = positionImpacts(before.analysis, after.analysis);
  const replacementRiskChanges = replacementChanges(before.analysis, after.analysis);
  const beforeExtra = namedSurplus(before.analysis, false);
  const afterExtra = namedSurplus(after.analysis, false);
  const beforeSafe = namedSurplus(before.analysis, true);
  const afterSafe = namedSurplus(after.analysis, true);
  const beforeSize = activePlayers(before.team).length;
  const afterSize = activePlayers(after.team).length;
  const requiredDrops = Math.max(afterSize - expectedRosterSize, 0);
  const incoming = incomingIds.map((id) => availabilityMove(after.analysis, id)).filter((row): row is AvailabilityMove => row !== null);
  const outgoing = outgoingIds.map((id) => availabilityMove(before.analysis, id)).filter((row): row is AvailabilityMove => row !== null);
  const summary = summarizeVerdict(lineupChanges, positionImpact, replacementRiskChanges, requiredDrops, incoming);
  return {
    rosterId: before.team.rosterId,
    teamName: before.team.teamName,
    verdict: summary.verdict,
    reasons: summary.reasons,
    rosterSize: {
      before: beforeSize,
      after: afterSize,
      expected: expectedRosterSize,
      overBy: Math.max(afterSize - expectedRosterSize, 0),
      underBy: Math.max(expectedRosterSize - afterSize, 0),
      requiredDrops,
    },
    lineupChanges,
    positionImpact,
    replacementRiskChanges,
    surplusChanges: {
      extraDepthAdded: setDiffNames(afterExtra, beforeExtra),
      extraDepthRemoved: setDiffNames(beforeExtra, afterExtra),
      safeToMoveAdded: setDiffNames(afterSafe, beforeSafe),
      safeToMoveRemoved: setDiffNames(beforeSafe, afterSafe),
    },
    availability: { incoming, outgoing },
    potentialDrops: [],
  };
}

export function analyzeTrade(snapshot: LeagueSnapshot, request: TradeRequest): TradeAnalysisResult {
  const errors = validateTrade(snapshot, request);
  if (errors.length > 0) return { valid: false, errors };
  const teamA = snapshot.teams.find((team) => team.rosterId === request.teamAId)!;
  const teamB = snapshot.teams.find((team) => team.rosterId === request.teamBId)!;
  const simulated = simulateTradeRosters(teamA, teamB, request.teamAPlayerIds, request.teamBPlayerIds);
  const beforeTeams = snapshot.teams.map((team) => cloneTeam(team));
  const afterTeams = snapshot.teams.map((team) => {
    if (team.rosterId === teamA.rosterId) return simulated.teamA;
    if (team.rosterId === teamB.rosterId) return simulated.teamB;
    return cloneTeam(team);
  });
  const beforeLeague = analyzeNormalizedLeague(beforeTeams, snapshot.rosterSlots);
  const afterLeague = analyzeNormalizedLeague(afterTeams, snapshot.rosterSlots);
  const beforeAnalysis = beforeLeague.teams as Record<string, AnalysisRecord>;
  const afterAnalysis = afterLeague.teams as Record<string, AnalysisRecord>;
  const expectedRosterSize = snapshot.rosterSlots.length + snapshot.benchSlots;
  return {
    valid: true,
    teamA: buildTeamImpact(
      { team: teamA, analysis: beforeAnalysis[String(teamA.rosterId)]! },
      { team: simulated.teamA, analysis: afterAnalysis[String(teamA.rosterId)]! },
      request.teamBPlayerIds,
      request.teamAPlayerIds,
      expectedRosterSize,
    ),
    teamB: buildTeamImpact(
      { team: teamB, analysis: beforeAnalysis[String(teamB.rosterId)]! },
      { team: simulated.teamB, analysis: afterAnalysis[String(teamB.rosterId)]! },
      request.teamAPlayerIds,
      request.teamBPlayerIds,
      expectedRosterSize,
    ),
    futureReadinessIncluded: false,
    note: "Phase 1 reuses structural and current-availability analysis. Future-week readiness deltas are deferred to Phase 2.",
  };
}
