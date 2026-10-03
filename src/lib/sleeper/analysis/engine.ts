/**
 * V3.3 roster-analysis layer.
 *
 * Faithful port of the pure analysis functions in sleeper_v3_2.py at
 * a76e2c8f945d8c5f3b7ffd6d30620f1beb31d54d (V3.3 configuration-driven
 * analysis; snapshot_version remains "3.2"). This module does not call
 * Sleeper. The web app feeds it league data it has already fetched.
 *
 * Dead code after the first `return` in Python's calculate_player_protection
 * is not ported.
 */

import { assessAvailability } from "./availability.ts";

export const SNAPSHOT_VERSION = "3.2" as const;

const DIRECT_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const OFFENSIVE_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const ANALYZER_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
const MEANINGFUL_TIERS = new Set(["elite", "strong", "useful"]);
const TIER_SCORE: Record<string, number> = {
  elite: 5,
  strong: 4,
  useful: 3,
  fringe: 2,
  deep_waiver: 1,
  unknown: 0,
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AnalysisRecord = { [key: string]: JsonValue };

type SlotInstance = {
  slot_code: string;
  ordinal: number;
  eligible_positions: string[];
  slot_type: "direct" | "flex" | "nonstarter" | "unknown";
  is_direct: boolean;
  is_flex: boolean;
  recognized: boolean;
  supported_by_analyzer: boolean;
};

function cleanName(value: unknown): string {
  if (value == null) return "";
  return String(value).split(/\s+/).filter(Boolean).join(" ").trim();
}

function pythonRound(value: number, ndigits: number): number {
  const factor = 10 ** ndigits;
  const shifted = value * factor;
  const sign = shifted < 0 ? -1 : 1;
  const abs = Math.abs(shifted);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  let rounded = floor;
  if (frac > 0.5) rounded = floor + 1;
  else if (frac < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return (sign * rounded) / factor;
}

function asInt(rank: unknown): number | null {
  if (rank == null) return null;
  if (typeof rank === "boolean") return rank ? 1 : 0;
  if (typeof rank === "number" && Number.isFinite(rank)) return Math.trunc(rank);
  if (typeof rank === "string" && /^-?\d+$/.test(rank.trim())) return Number.parseInt(rank.trim(), 10);
  return null;
}

function copyRecord<T extends AnalysisRecord>(value: T): T {
  return { ...value };
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) next[key] = record[key]!;
  return next;
}

export function fantasyValueTier(player: AnalysisRecord): string {
  const rank = asInt(player.search_rank);
  if (player.search_rank == null) return "unknown";
  if (rank == null) return "unknown";
  if (rank <= 50) return "elite";
  if (rank <= 120) return "strong";
  if (rank <= 250) return "useful";
  if (rank <= 400) return "fringe";
  return "deep_waiver";
}

export function fantasyImportanceScore(player: AnalysisRecord): number {
  const statusScores: Record<string, number> = { starter: 2, bench: 1, reserve: 0, taxi: 0 };
  const tier = String(player.fantasy_value_tier ?? "unknown");
  const status = String(player.roster_status ?? "bench");
  return (TIER_SCORE[tier] ?? 0) + (statusScores[status] ?? 0);
}

export function waiverValueScore(
  player: AnalysisRecord,
  positionNeed: string,
  leagueScarcity: string,
): number {
  let score = 0;
  const rank = asInt(player.search_rank);
  if (player.search_rank != null && rank != null) {
    if (rank <= 50) score += 50;
    else if (rank <= 100) score += 40;
    else if (rank <= 150) score += 30;
    else if (rank <= 250) score += 20;
    else if (rank <= 400) score += 10;
  }
  const needScores: Record<string, number> = { high: 30, moderate: 15, low: 0, unknown: 0 };
  const scarcityScores: Record<string, number> = { high: 20, moderate: 10, low: 0, unknown: 0 };
  score += needScores[positionNeed] ?? 0;
  score += scarcityScores[leagueScarcity] ?? 0;
  return score;
}

export function parseRosterConfiguration(rosterPositions: unknown[] | null | undefined): AnalysisRecord {
  const directCodes = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"]);
  const flexEligibility: Record<string, string[]> = {
    FLEX: ["RB", "WR", "TE"],
    WRRB_FLEX: ["RB", "WR"],
    REC_FLEX: ["WR", "TE"],
    SUPER_FLEX: ["QB", "RB", "WR", "TE"],
    IDP_FLEX: ["DL", "LB", "DB"],
  };
  const directSlots: Record<string, number> = {};
  const flexSlots: Record<string, { count: number; eligible_positions: string[] }> = {};
  const nonstarterSlots: Record<string, number> = {};
  const unrecognizedSlots: Record<string, number> = {};

  for (const rawSlot of rosterPositions ?? []) {
    const slotCode = String(rawSlot).trim();
    const normalized = slotCode.toUpperCase();
    if (normalized === "BN") {
      nonstarterSlots.BN = (nonstarterSlots.BN ?? 0) + 1;
    } else if (normalized in flexEligibility) {
      const slot = (flexSlots[normalized] ??= {
        count: 0,
        eligible_positions: [...flexEligibility[normalized]!],
      });
      slot.count += 1;
    } else if (directCodes.has(normalized)) {
      directSlots[normalized] = (directSlots[normalized] ?? 0) + 1;
    } else {
      unrecognizedSlots[slotCode] = (unrecognizedSlots[slotCode] ?? 0) + 1;
    }
  }

  return {
    direct_slots: sortedRecord(directSlots),
    flex_slots: sortedRecord(flexSlots),
    nonstarter_slots: sortedRecord(nonstarterSlots),
    unrecognized_slots: sortedRecord(unrecognizedSlots),
  };
}

export function getSlotEligiblePositions(slotCode: string, rosterConfiguration: AnalysisRecord | null): string[] {
  const normalized = String(slotCode).trim().toUpperCase();
  const configuration = rosterConfiguration ?? {};
  const direct = (configuration.direct_slots ?? {}) as Record<string, number>;
  if (normalized in direct) return [normalized];
  const flex = ((configuration.flex_slots ?? {}) as Record<string, { eligible_positions?: string[] }>)[normalized];
  if (flex) return [...(flex.eligible_positions ?? [])];
  return [];
}

export function expandRosterSlots(rosterConfiguration: AnalysisRecord | null | undefined): SlotInstance[] {
  const configuration = rosterConfiguration ?? {};
  const directSlots = (configuration.direct_slots ?? {}) as Record<string, number>;
  const flexSlots = (configuration.flex_slots ?? {}) as Record<string, { count?: number; eligible_positions?: string[] }>;
  const nonstarterSlots = (configuration.nonstarter_slots ?? {}) as Record<string, number>;
  const unrecognizedSlots = (configuration.unrecognized_slots ?? {}) as Record<string, number>;

  const ordered: string[] = [];
  for (const code of ["QB", "RB", "WR", "TE"]) if (code in directSlots) ordered.push(code);
  ordered.push(...Object.keys(flexSlots).filter((code) => code === "FLEX").sort());
  ordered.push(...Object.keys(flexSlots).filter((code) => code !== "FLEX").sort());
  for (const code of ["K", "DEF", "DL", "LB", "DB"]) if (code in directSlots) ordered.push(code);

  const slots: SlotInstance[] = [];

  function addInstances(slotCode: string, rawCount: unknown, slotType: SlotInstance["slot_type"], recognized: boolean) {
    let count = 0;
    const parsed = typeof rawCount === "number" ? rawCount : Number(rawCount);
    if (Number.isFinite(parsed)) count = Math.max(0, Math.trunc(parsed));
    const eligible = getSlotEligiblePositions(slotCode, configuration);
    const supported = eligible.some((position) => ANALYZER_POSITIONS.has(position));
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      slots.push({
        slot_code: slotCode,
        ordinal,
        eligible_positions: [...eligible],
        slot_type: slotType,
        is_direct: slotType === "direct",
        is_flex: slotType === "flex",
        recognized,
        supported_by_analyzer: supported,
      });
    }
  }

  for (const slotCode of ordered) {
    if (slotCode in directSlots) addInstances(slotCode, directSlots[slotCode], "direct", true);
    else addInstances(slotCode, flexSlots[slotCode]?.count ?? 0, "flex", true);
  }
  for (const slotCode of Object.keys(nonstarterSlots).sort()) {
    addInstances(slotCode, nonstarterSlots[slotCode], "nonstarter", true);
  }
  for (const slotCode of Object.keys(unrecognizedSlots).sort()) {
    addInstances(slotCode, unrecognizedSlots[slotCode], "unknown", false);
  }
  return slots;
}

type CoverageCandidate = {
  candidate_id: string;
  player_id: JsonValue;
  position: string;
};

function candidateKey(playerId: JsonValue, position: string, index: number): string {
  if (playerId != null) return JSON.stringify(["player", String(playerId)]);
  return JSON.stringify(["missing_id", position, index]);
}

export function assignRosterSlotCoverage(slotInstances: SlotInstance[], positions: Record<string, AnalysisRecord[]>) {
  const supportedSlots: SlotInstance[] = [];
  const unsupportedSlots: Record<string, number> = {};
  const candidatesBySlot: CoverageCandidate[][] = [];
  const eligibleByFlex = new Map<string, Set<string>>();
  const allFlex = new Set<string>();

  for (const slot of slotInstances) {
    if (slot.slot_type === "nonstarter") continue;
    if (slot.slot_type === "unknown" || !slot.supported_by_analyzer) {
      unsupportedSlots[slot.slot_code] = (unsupportedSlots[slot.slot_code] ?? 0) + 1;
      continue;
    }
    if (slot.slot_type !== "direct" && slot.slot_type !== "flex") continue;

    const eligible = slot.eligible_positions.filter((position) => ANALYZER_POSITIONS.has(position));
    const slotCandidates: CoverageCandidate[] = [];
    const seen = new Set<string>();
    for (const position of eligible) {
      const players = positions[position] ?? [];
      for (let index = 0; index < players.length; index += 1) {
        const player = players[index]!;
        const key = candidateKey(player.player_id, position, index);
        if (seen.has(key)) continue;
        if (
          slot.is_flex &&
          (player.status === "Inactive" ||
            player.injury_status === "IR" ||
            !MEANINGFUL_TIERS.has(String(player.fantasy_value_tier)))
        ) {
          continue;
        }
        seen.add(key);
        slotCandidates.push({ candidate_id: key, player_id: player.player_id, position });
      }
    }
    if (slot.is_flex) {
      const bag = eligibleByFlex.get(slot.slot_code) ?? new Set<string>();
      for (const candidate of slotCandidates) bag.add(candidate.candidate_id);
      eligibleByFlex.set(slot.slot_code, bag);
      for (const id of bag) allFlex.add(id);
    }
    supportedSlots.push(slot);
    candidatesBySlot.push(slotCandidates);
  }

  let bestAssignment: Array<CoverageCandidate | null> | null = null;
  let bestCovered = -1;

  function search(
    slotIndex: number,
    used: Set<string>,
    assignment: Array<CoverageCandidate | null>,
    covered: number,
  ) {
    if (slotIndex === supportedSlots.length) {
      if (covered > bestCovered) {
        bestCovered = covered;
        bestAssignment = assignment.slice();
      }
      return;
    }
    if (covered + supportedSlots.length - slotIndex <= bestCovered) return;
    for (const candidate of candidatesBySlot[slotIndex] ?? []) {
      if (used.has(candidate.candidate_id)) continue;
      used.add(candidate.candidate_id);
      assignment.push(candidate);
      search(slotIndex + 1, used, assignment, covered + 1);
      assignment.pop();
      used.delete(candidate.candidate_id);
    }
    assignment.push(null);
    search(slotIndex + 1, used, assignment, covered);
    assignment.pop();
  }

  search(0, new Set(), [], 0);

  const assignments: AnalysisRecord[] = [];
  const chosen: Array<CoverageCandidate | null> = bestAssignment ?? [];
  supportedSlots.forEach((slot, index) => {
    const candidate = chosen[index];
    if (!candidate) return;
    assignments.push({
      slot_code: slot.slot_code,
      ordinal: slot.ordinal,
      slot_type: slot.slot_type,
      player_id: candidate.player_id,
      position: candidate.position,
    });
  });

  const eligibleCounts: Record<string, number> = {};
  for (const slotCode of [...eligibleByFlex.keys()].sort()) {
    eligibleCounts[slotCode] = eligibleByFlex.get(slotCode)!.size;
  }

  return {
    assignments,
    supported_slot_count: supportedSlots.length,
    covered_slot_count: assignments.length,
    unsupported_slots: sortedRecord(unsupportedSlots),
    eligible_player_counts_by_flex: eligibleCounts,
    eligible_player_count_across_flex: allFlex.size,
  };
}

function median(sortedValues: number[]): number {
  const count = sortedValues.length;
  if (count % 2 === 0) {
    return (sortedValues[count / 2 - 1]! + sortedValues[count / 2]!) / 2;
  }
  return sortedValues[Math.floor(count / 2)]!;
}

export function buildLeaguePositionAnalysis(fantasyAnalysis: AnalysisRecord): AnalysisRecord {
  const positions = [...DIRECT_POSITIONS];
  const leagueAnalysis: AnalysisRecord = {};
  const rosterDemands: Record<string, AnalysisRecord> = {};
  const directDemandByPosition: Record<string, number> = Object.fromEntries(positions.map((position) => [position, 0]));
  const flexDemandByCode: Record<string, { count: number; eligible_positions: string[] }> = {};
  const eligibleFlexByPosition: Record<string, number> = Object.fromEntries(positions.map((position) => [position, 0]));
  let totalConfigured = 0;
  let totalSupported = 0;
  const unsupportedSlotCounts: Record<string, number> = {};
  const teams = fantasyAnalysis.teams as Record<string, AnalysisRecord>;

  for (const [rosterId, team] of Object.entries(teams)) {
    const rosterConfiguration = (team.roster_configuration ?? fantasyAnalysis.roster_configuration ?? {}) as AnalysisRecord;
    const configuredSlots = expandRosterSlots(rosterConfiguration);
    const directDemand: Record<string, number> = Object.fromEntries(positions.map((position) => [position, 0]));
    const flexSlots: Record<string, { count: number; eligible_positions: string[] }> = {};
    const unsupportedSlots: Record<string, number> = {};
    let supportedCount = 0;
    let configuredCount = 0;

    for (const slot of configuredSlots) {
      if (slot.slot_type === "nonstarter") continue;
      configuredCount += 1;
      if (slot.slot_type === "unknown" || !slot.supported_by_analyzer) {
        unsupportedSlots[slot.slot_code] = (unsupportedSlots[slot.slot_code] ?? 0) + 1;
        unsupportedSlotCounts[slot.slot_code] = (unsupportedSlotCounts[slot.slot_code] ?? 0) + 1;
        continue;
      }
      if (slot.slot_type === "direct") {
        if (slot.slot_code in directDemand) {
          directDemand[slot.slot_code] = (directDemand[slot.slot_code] ?? 0) + 1;
          directDemandByPosition[slot.slot_code] = (directDemandByPosition[slot.slot_code] ?? 0) + 1;
          supportedCount += 1;
        }
      } else if (slot.slot_type === "flex") {
        const flex = (flexSlots[slot.slot_code] ??= {
          count: 0,
          eligible_positions: [...slot.eligible_positions],
        });
        flex.count += 1;
        supportedCount += 1;
      }
    }

    for (const [slotCode, flexSlot] of Object.entries(flexSlots)) {
      const aggregate = (flexDemandByCode[slotCode] ??= {
        count: 0,
        eligible_positions: [...flexSlot.eligible_positions],
      });
      aggregate.count += flexSlot.count;
      for (const position of flexSlot.eligible_positions) {
        if (position in eligibleFlexByPosition) {
          eligibleFlexByPosition[position] = (eligibleFlexByPosition[position] ?? 0) + flexSlot.count;
        }
      }
    }

    totalConfigured += configuredCount;
    totalSupported += supportedCount;
    rosterDemands[rosterId] = {
      direct_slots: directDemand,
      flex_slots: flexSlots,
      configured_starting_slots: configuredCount,
      supported_starting_slots: supportedCount,
      unsupported_slots: sortedRecord(unsupportedSlots),
    };
  }

  leagueAnalysis.configuration_demand = {
    direct_demand_by_position: directDemandByPosition,
    flex_demand_by_slot_code: sortedRecord(flexDemandByCode),
    eligible_flex_slot_instances_by_position: eligibleFlexByPosition,
    total_configured_starting_slots: totalConfigured,
    supported_starting_slots: totalSupported,
    unsupported_slot_counts: sortedRecord(unsupportedSlotCounts),
    by_roster: rosterDemands,
  };

  for (const position of positions) {
    const teamCounts: AnalysisRecord[] = [];
    for (const [rosterId, team] of Object.entries(teams)) {
      const summary = ((team.position_summary as AnalysisRecord)[position] ?? {}) as AnalysisRecord;
      teamCounts.push({
        roster_id: rosterId,
        team_name: team.team_name,
        total: summary.total,
        starters: summary.starters,
        bench: summary.bench,
        depth_score: summary.depth_score,
        meaningful_players: summary.meaningful_players,
      });
    }
    if (teamCounts.length === 0) continue;
    const totals = teamCounts.map((team) => Number(team.total));
    const depthScores = teamCounts.map((team) => Number(team.depth_score));
    const meaningfulCounts = teamCounts.map((team) => Number(team.meaningful_players));
    const count = totals.length;
    leagueAnalysis[position] = {
      teams: teamCounts,
      configured_direct_demand: directDemandByPosition[position],
      eligible_flex_slot_instances: eligibleFlexByPosition[position],
      average_total: pythonRound(totals.reduce((sum, value) => sum + value, 0) / count, 2),
      median_total: median([...totals].sort((a, b) => a - b)),
      minimum_total: Math.min(...totals),
      maximum_total: Math.max(...totals),
      average_depth_score: pythonRound(depthScores.reduce((sum, value) => sum + value, 0) / count, 2),
      median_depth_score: median([...depthScores].sort((a, b) => a - b)),
      minimum_depth_score: Math.min(...depthScores),
      maximum_depth_score: Math.max(...depthScores),
      average_meaningful_players: pythonRound(meaningfulCounts.reduce((sum, value) => sum + value, 0) / count, 2),
      median_meaningful_players: median([...meaningfulCounts].sort((a, b) => a - b)),
      minimum_meaningful_players: Math.min(...meaningfulCounts),
      maximum_meaningful_players: Math.max(...meaningfulCounts),
    };
  }

  const flexTeamCounts: AnalysisRecord[] = [];
  for (const [rosterId, team] of Object.entries(teams)) {
    const demand = rosterDemands[rosterId]!;
    const flexPositions = [
      ...new Set(
        Object.values(demand.flex_slots as Record<string, { eligible_positions: string[] }>).flatMap(
          (slot) => slot.eligible_positions,
        ),
      ),
    ].sort();
    const meaningfulByPosition: Record<string, AnalysisRecord[]> = {};
    const teamPositions = (team.positions ?? {}) as Record<string, AnalysisRecord[]>;
    for (const position of positions) {
      meaningfulByPosition[position] = (teamPositions[position] ?? []).filter((player) =>
        MEANINGFUL_TIERS.has(String(player.fantasy_value_tier)),
      );
    }
    const directPlayerIds = new Set<string>();
    for (const [position, required] of Object.entries(demand.direct_slots as Record<string, number>)) {
      const players = meaningfulByPosition[position] ?? [];
      for (let index = 0; index < Math.min(required, players.length); index += 1) {
        const playerId = players[index]?.player_id;
        directPlayerIds.add(playerId != null ? JSON.stringify(["player", String(playerId)]) : JSON.stringify(["missing_id", position, index]));
      }
    }
    const meaningfulFlexIds = new Set<string>();
    for (const position of flexPositions) {
      const players = meaningfulByPosition[position] ?? [];
      players.forEach((player, index) => {
        const playerId = player.player_id;
        const key = playerId != null ? JSON.stringify(["player", String(playerId)]) : JSON.stringify(["missing_id", position, index]);
        if (!directPlayerIds.has(key)) meaningfulFlexIds.add(key);
      });
    }
    const configuredFlexSlots = Object.values(demand.flex_slots as Record<string, { count: number }>).reduce(
      (sum, slot) => sum + slot.count,
      0,
    );
    flexTeamCounts.push({
      roster_id: rosterId,
      team_name: team.team_name,
      meaningful_flex_players: meaningfulFlexIds.size,
      configured_flex_slots: configuredFlexSlots,
    });
  }

  if (flexTeamCounts.length > 0) {
    const flexValues = flexTeamCounts.map((team) => Number(team.meaningful_flex_players));
    const sortedFlex = [...flexValues].sort((a, b) => a - b);
    leagueAnalysis.FLEX = {
      teams: flexTeamCounts,
      configured_slots: Object.values(flexDemandByCode).reduce((sum, item) => sum + item.count, 0),
      slot_counts_by_type: Object.fromEntries(
        Object.entries(flexDemandByCode)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([slotCode, data]) => [slotCode, data.count]),
      ),
      eligible_positions_by_type: Object.fromEntries(
        Object.entries(flexDemandByCode)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([slotCode, data]) => [slotCode, data.eligible_positions]),
      ),
      average_meaningful_players: pythonRound(flexValues.reduce((sum, value) => sum + value, 0) / flexValues.length, 2),
      median_meaningful_players: median(sortedFlex),
      minimum_meaningful_players: Math.min(...flexValues),
      maximum_meaningful_players: Math.max(...flexValues),
    };
  }

  return leagueAnalysis;
}

export function getPositionSlotRequirements(position: string, configuredSlots: SlotInstance[]) {
  const directRequired = configuredSlots.filter(
    (slot) => slot.slot_type === "direct" && slot.slot_code === position && slot.supported_by_analyzer,
  ).length;
  const flexSlotCodes = [
    ...new Set(
      configuredSlots
        .filter(
          (slot) =>
            slot.slot_type === "flex" && slot.supported_by_analyzer && slot.eligible_positions.includes(position),
        )
        .map((slot) => slot.slot_code),
    ),
  ].sort();
  return { direct_required: directRequired, flex_slot_codes: flexSlotCodes };
}

export function classifyPositionNeed(
  position: string,
  teamSummary: AnalysisRecord,
  leaguePositionAnalysis: AnalysisRecord,
  configuredSlots: SlotInstance[],
): AnalysisRecord {
  const meaningful = Number(teamSummary.meaningful_players ?? 0);
  const depthScore = Number(teamSummary.depth_score ?? 0);
  const starters = Number(teamSummary.starters ?? 0);
  const positionData = leaguePositionAnalysis[position] as AnalysisRecord | undefined;
  if (!positionData) return { need: "unknown", reason: "No league comparison available." };

  const medianDepth = Number(positionData.median_depth_score ?? 0);
  const medianMeaningful = Number(positionData.median_meaningful_players ?? 0);
  const requiredPlayers = getPositionSlotRequirements(position, configuredSlots).direct_required;
  const startingShortage = Math.max(requiredPlayers - starters, 0);
  const depthDifference = depthScore - medianDepth;
  const meaningfulDifference = meaningful - medianMeaningful;
  const base = { depth_difference: depthDifference, meaningful_difference: meaningfulDifference };

  if (startingShortage > 0) {
    return {
      need: "high",
      reason: `Only ${starters} starting ${position} player(s) for ${requiredPlayers} required.`,
      ...base,
    };
  }
  if (depthScore < medianDepth && meaningful < medianMeaningful) {
    return {
      need: "moderate",
      reason: `${position} depth is below the league median in both quality and meaningful player count.`,
      ...base,
    };
  }
  if (meaningful < medianMeaningful) {
    return {
      need: "moderate",
      reason: `${position} has fewer meaningful players than the league median.`,
      ...base,
    };
  }
  if (depthScore < medianDepth) {
    return { need: "moderate", reason: `${position} depth is below the league median.`, ...base };
  }
  if (depthScore > medianDepth && meaningful > medianMeaningful) {
    return {
      need: "low",
      reason: `${position} depth and meaningful player count are above the league median.`,
      ...base,
    };
  }
  return { need: "moderate", reason: `${position} depth is around the league median.`, ...base };
}

function classifyUsablePositionNeed(
  position: string,
  usableSummary: AnalysisRecord,
  leagueMedians: { usable_bodies: number; usable_meaningful: number },
  configuredSlots: SlotInstance[],
): AnalysisRecord {
  const directRequired = getPositionSlotRequirements(position, configuredSlots).direct_required;
  const usableBodies = Number(usableSummary.usable ?? 0);
  const usableMeaningful = Number(usableSummary.usable_meaningful ?? 0);
  const bodiesDifference = usableBodies - leagueMedians.usable_bodies;
  const meaningfulDifference = usableMeaningful - leagueMedians.usable_meaningful;

  let need: string;
  let reason: string;
  if (usableBodies < directRequired) {
    need = "critical";
    reason = `Only ${usableBodies} currently usable ${position} player(s) for ${directRequired} required direct slot(s).`;
  } else if (usableMeaningful <= directRequired) {
    need = "thin";
    reason = `Currently usable meaningful ${position} depth does not exceed direct demand.`;
  } else if (usableMeaningful < leagueMedians.usable_meaningful) {
    need = "moderate";
    reason = `Currently usable meaningful ${position} depth is below the league median.`;
  } else if (usableBodies > leagueMedians.usable_bodies && usableMeaningful > leagueMedians.usable_meaningful) {
    need = "low";
    reason = `Currently usable ${position} depth and meaningful depth are above the league medians.`;
  } else {
    need = "moderate";
    reason = `Currently usable ${position} depth is around the league median.`;
  }

  return {
    need,
    reason,
    direct_required: directRequired,
    usable_bodies: usableBodies,
    usable_meaningful: usableMeaningful,
    usable_bodies_difference: bodiesDifference,
    usable_meaningful_difference: meaningfulDifference,
    league_median_usable_bodies: leagueMedians.usable_bodies,
    league_median_usable_meaningful: leagueMedians.usable_meaningful,
  };
}

function playerScore(player: AnalysisRecord): number {
  if (player.status === "Inactive") return -1;
  if (player.injury_status === "IR") return -1;
  return (TIER_SCORE[String(player.fantasy_value_tier)] ?? 0) * 100 + Number(player.importance_score ?? 0);
}

export function calculateOptimalLineup(
  positions: Record<string, AnalysisRecord[]>,
  rosterConfiguration: AnalysisRecord,
): Record<string, AnalysisRecord[]> {
  const supported = new Set<string>(OFFENSIVE_POSITIONS);
  const bestLineup: Record<string, AnalysisRecord[]> = { QB: [], RB: [], WR: [], TE: [], FLEX: [] };
  const slots: { lineup_position: string; eligible_positions: string[]; is_flex: boolean }[] = [];

  for (const configured of expandRosterSlots(rosterConfiguration)) {
    if (configured.slot_type !== "direct" && configured.slot_type !== "flex") continue;
    const eligible = configured.eligible_positions.filter((position) => supported.has(position));
    if (eligible.length === 0) continue;
    if (configured.is_flex) bestLineup[configured.slot_code] ??= [];
    slots.push({
      lineup_position: configured.slot_code,
      eligible_positions: eligible,
      is_flex: configured.is_flex,
    });
  }

  const candidates: {
    player_id: unknown;
    position: string;
    score: number;
    order: number;
    player: AnalysisRecord;
  }[] = [];
  const seen = new Set<unknown>();
  for (const position of OFFENSIVE_POSITIONS) {
    for (const player of positions[position] ?? []) {
      const playerId = player.player_id;
      if (playerId == null || seen.has(playerId)) continue;
      const score = playerScore(player);
      if (score < 0) continue;
      seen.add(playerId);
      const annotated = copyRecord(player);
      annotated.position = position;
      candidates.push({
        player_id: playerId,
        position,
        score,
        order: candidates.length,
        player: annotated,
      });
    }
  }

  const legacyFlexPriority: Record<string, number> = { WR: 0, RB: 1, TE: 2 };
  const candidatesBySlot = slots.map((slot) => {
    const positionPriority =
      slot.is_flex && slot.lineup_position === "FLEX"
        ? legacyFlexPriority
        : Object.fromEntries(slot.eligible_positions.map((position, index) => [position, index]));
    return candidates
      .filter((candidate) => slot.eligible_positions.includes(candidate.position))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const priorityA = positionPriority[a.position] ?? 99;
        const priorityB = positionPriority[b.position] ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.order - b.order;
      });
  });

  let bestScore = -1;
  let bestFilled = -1;
  let bestAssignment: Array<(typeof candidates)[number] | null> | null = null;

  function search(
    slotIndex: number,
    totalScore: number,
    used: Set<unknown>,
    assignment: Array<(typeof candidates)[number] | null>,
    filled: number,
  ) {
    if (slotIndex === slots.length) {
      if (totalScore > bestScore || (totalScore === bestScore && filled > bestFilled)) {
        bestScore = totalScore;
        bestFilled = filled;
        bestAssignment = assignment.slice();
      }
      return;
    }
    let upperScore = totalScore;
    let upperFilled = filled;
    for (const remaining of candidatesBySlot.slice(slotIndex)) {
      const available = remaining.filter((candidate) => !used.has(candidate.player_id)).map((candidate) => candidate.score);
      if (available.length > 0) {
        upperScore += Math.max(...available);
        upperFilled += 1;
      }
    }
    if (
      bestAssignment &&
      (upperScore < bestScore || (upperScore === bestScore && upperFilled <= bestFilled))
    ) {
      return;
    }
    for (const candidate of candidatesBySlot[slotIndex] ?? []) {
      if (used.has(candidate.player_id)) continue;
      used.add(candidate.player_id);
      assignment.push(candidate);
      search(slotIndex + 1, totalScore + candidate.score, used, assignment, filled + 1);
      assignment.pop();
      used.delete(candidate.player_id);
    }
    assignment.push(null);
    search(slotIndex + 1, totalScore, used, assignment, filled);
    assignment.pop();
  }

  search(0, 0, new Set(), [], 0);
  if (bestAssignment) {
    slots.forEach((slot, index) => {
      const candidate = (bestAssignment as Array<(typeof candidates)[number] | null>)[index];
      if (candidate) bestLineup[slot.lineup_position]!.push(copyRecord(candidate.player));
    });
  }
  return bestLineup;
}

export function classifyStartingDepth(
  position: string,
  teamSummary: AnalysisRecord,
  positions: Record<string, AnalysisRecord[]>,
  optimalLineup: Record<string, AnalysisRecord[]>,
  configuredSlots: SlotInstance[],
): AnalysisRecord {
  const requirements = getPositionSlotRequirements(position, configuredSlots);
  const requiredPlayers = requirements.direct_required;
  const starters = Number(teamSummary.starters ?? 0);
  const meaningful = Number(teamSummary.meaningful_players ?? 0);
  const directShortage = Math.max(requiredPlayers - starters, 0);
  const directSurplus = Math.max(starters - requiredPlayers, 0);
  const positionIds = new Set((positions[position] ?? []).map((player) => player.player_id));
  const flexIds = new Set<unknown>();
  for (const slotCode of requirements.flex_slot_codes) {
    for (const player of optimalLineup[slotCode] ?? []) {
      const playerId = player.player_id;
      if (positionIds.has(playerId) && (player.position ?? position) === position) flexIds.add(playerId);
    }
  }
  const flexAvailable = flexIds.size;
  const result = {
    required: requiredPlayers,
    starters,
    direct_shortage: directShortage,
    direct_surplus: directSurplus,
    meaningful_players: meaningful,
    flex_available: flexAvailable,
    starting_depth: "adequate",
  };
  if (requiredPlayers === 0 && flexAvailable === 0) return result;
  if (position === "QB") {
    const effective = requiredPlayers + flexAvailable;
    result.starting_depth = meaningful < effective ? "short" : meaningful === effective ? "thin" : "deep";
    return result;
  }
  if (position === "TE") {
    if (directShortage > 0) result.starting_depth = "short";
    else if (meaningful <= requiredPlayers + flexAvailable) result.starting_depth = "thin";
    else result.starting_depth = "adequate";
    return result;
  }
  if (directShortage > 0) result.starting_depth = flexAvailable > 0 ? "covered_by_flex" : "short";
  else if (meaningful >= requiredPlayers + 2 || flexAvailable > 0) result.starting_depth = "deep";
  else if (meaningful > requiredPlayers) result.starting_depth = "adequate";
  else result.starting_depth = "thin";
  return result;
}

export function calculateLineupStrength(team: AnalysisRecord, rosterConfiguration: AnalysisRecord): AnalysisRecord {
  const configured = expandRosterSlots(rosterConfiguration);
  const directRequirements: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const flexCodes: Record<string, string[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const slot of configured) {
    if (!slot.supported_by_analyzer) continue;
    if (slot.slot_type === "direct" && slot.slot_code in directRequirements) {
      directRequirements[slot.slot_code] = (directRequirements[slot.slot_code] ?? 0) + 1;
    } else if (slot.slot_type === "flex") {
      for (const position of slot.eligible_positions) {
        if (position in flexCodes && !flexCodes[position]!.includes(slot.slot_code)) {
          flexCodes[position]!.push(slot.slot_code);
        }
      }
    }
  }
  const optimal = (team.optimal_lineup ?? {}) as Record<string, AnalysisRecord[]>;
  const strength: AnalysisRecord = {};
  const teamPositions = (team.positions ?? {}) as Record<string, AnalysisRecord[]>;
  const startingDepth = team.starting_depth as Record<string, AnalysisRecord>;

  for (const position of OFFENSIVE_POSITIONS) {
    const depth = startingDepth[position]!;
    const meaningful = Number(depth.meaningful_players);
    const directShortage = Number(depth.direct_shortage ?? 0);
    const directPlayers = optimal[position] ?? [];
    const positionIds = new Set<JsonValue>((teamPositions[position] ?? []).map((player) => player.player_id));
    const directIds = new Set<JsonValue>(directPlayers.map((player) => player.player_id).filter((id) => id != null));
    const assigned = new Set<JsonValue>();
    for (const slotCode of flexCodes[position] ?? []) {
      for (const player of optimal[slotCode] ?? []) {
        const playerId = player.player_id;
        if (positionIds.has(playerId) && !directIds.has(playerId) && !assigned.has(playerId)) assigned.add(playerId);
      }
    }
    const flexUsed = assigned.size;
    const required = directRequirements[position] ?? 0;
    let rating: string;
    if (directShortage > 0) rating = flexUsed > 0 ? "covered" : "weak";
    else if (position === "QB" || position === "TE") {
      rating = meaningful >= 2 ? "strong" : meaningful === 1 ? "adequate" : "weak";
    } else if (directPlayers.length >= required && meaningful >= required + 2) rating = "strong";
    else if (directPlayers.length >= required && meaningful > required) rating = "adequate";
    else if (flexUsed > 0) rating = "covered";
    else rating = "weak";
    strength[position] = {
      rating,
      meaningful_players: meaningful,
      direct_shortage: directShortage,
      flex_used: flexUsed,
    };
  }
  return strength;
}

export function calculateRosterSurplus(team: AnalysisRecord, rosterConfiguration: AnalysisRecord): AnalysisRecord[] {
  const positions = (team.positions ?? {}) as Record<string, AnalysisRecord[]>;
  const optimal = (team.optimal_lineup ?? {}) as Record<string, AnalysisRecord[]>;
  const lineupIds = new Set<unknown>();
  for (const players of Object.values(optimal)) {
    for (const player of players) lineupIds.add(player.player_id);
  }
  const meaningfulPositions: Record<string, AnalysisRecord[]> = {};
  for (const position of OFFENSIVE_POSITIONS) {
    const ranked = (positions[position] ?? [])
      .map((player, index) => ({ player, index }))
      .filter((entry) => MEANINGFUL_TIERS.has(String(entry.player.fantasy_value_tier)));
    ranked.sort((a, b) => {
      const lineupA = lineupIds.has(a.player.player_id) ? 0 : 1;
      const lineupB = lineupIds.has(b.player.player_id) ? 0 : 1;
      if (lineupA !== lineupB) return lineupA - lineupB;
      const tierA = -(TIER_SCORE[String(a.player.fantasy_value_tier)] ?? 0);
      const tierB = -(TIER_SCORE[String(b.player.fantasy_value_tier)] ?? 0);
      if (tierA !== tierB) return tierA - tierB;
      return a.index - b.index;
    });
    meaningfulPositions[position] = ranked.map((entry) => entry.player);
  }

  const offensiveSlots = expandRosterSlots(rosterConfiguration).filter(
    (slot) =>
      (slot.slot_type === "direct" || slot.slot_type === "flex") &&
      slot.supported_by_analyzer &&
      slot.eligible_positions.some((position) => (OFFENSIVE_POSITIONS as readonly string[]).includes(position)),
  );
  const coverage = assignRosterSlotCoverage(offensiveSlots, meaningfulPositions);
  const needed = new Set(
    coverage.assignments
      .filter((assignment) => assignment.player_id != null)
      .map((assignment) => String(assignment.player_id)),
  );

  const surplus: AnalysisRecord[] = [];
  const reported = new Set<string>();
  for (const position of OFFENSIVE_POSITIONS) {
    for (const player of meaningfulPositions[position] ?? []) {
      const playerId = player.player_id;
      if (playerId != null) {
        const key = String(playerId);
        if (reported.has(key)) continue;
        reported.add(key);
      }
      const inLineup = lineupIds.has(playerId);
      const isNeeded = playerId != null && needed.has(String(playerId));
      const surplusType = isNeeded ? "needed" : position === "QB" || position === "TE" ? "replaceable" : "surplus";
      const status = player.injury_status === "IR" ? "injured" : player.roster_status === "starter" ? "starter" : "bench";
      surplus.push({
        player_id: playerId ?? null,
        name: player.name ?? null,
        position,
        fantasy_value_tier: player.fantasy_value_tier,
        roster_status: status,
        in_optimal_lineup: inLineup,
        surplus_type: surplusType,
      });
    }
  }
  return surplus;
}

function lineupScore(lineup: Record<string, AnalysisRecord[]>): number {
  let total = 0;
  for (const players of Object.values(lineup)) {
    for (const player of players) total += playerScore(player);
  }
  return total;
}

export function calculateRosterReplacementCost(team: AnalysisRecord, rosterConfiguration: AnalysisRecord): AnalysisRecord[] {
  const positions = (team.positions ?? {}) as Record<string, AnalysisRecord[]>;
  return calculateReplacementCostForCandidates(positions, rosterConfiguration);
}

function calculateReplacementCostForCandidates(
  positions: Record<string, AnalysisRecord[]>,
  rosterConfiguration: AnalysisRecord,
): AnalysisRecord[] {
  const baseline = calculateOptimalLineup(positions, rosterConfiguration);
  const originalScore = lineupScore(baseline);
  const baselineAssignments = new Map<unknown, { lineup_position: string; player: AnalysisRecord }>();
  for (const [lineupPosition, players] of Object.entries(baseline)) {
    for (const player of players) {
      if (player.player_id != null) {
        baselineAssignments.set(player.player_id, { lineup_position: lineupPosition, player });
      }
    }
  }
  const relevant = new Map<JsonValue, AnalysisRecord>();
  for (const position of OFFENSIVE_POSITIONS) {
    for (const player of positions[position] ?? []) {
      if (player.player_id != null && !relevant.has(player.player_id)) relevant.set(player.player_id, player);
    }
  }
  const baselineIds = new Set(baselineAssignments.keys());
  const rows: AnalysisRecord[] = [];

  for (const [playerId, player] of relevant) {
    const lineupData = baselineAssignments.get(playerId);
    const lineupPosition = lineupData?.lineup_position ?? null;
    const modified: Record<string, AnalysisRecord[]> = {};
    for (const [position, rosterPlayers] of Object.entries(positions)) {
      modified[position] = rosterPlayers.filter((rosterPlayer) => rosterPlayer.player_id !== playerId);
    }
    const rebuilt = calculateOptimalLineup(modified, rosterConfiguration);
    const rebuiltScore = lineupScore(rebuilt);
    const scoreDifference = originalScore - rebuiltScore;
    const rebuiltIds = new Set<unknown>();
    for (const players of Object.values(rebuilt)) {
      for (const candidate of players) rebuiltIds.add(candidate.player_id);
    }
    const replacementIds = [...rebuiltIds].filter((id) => !baselineIds.has(id));
    let replacementPlayer: string | null = null;
    let replacementPlayerId: JsonValue = null;
    let replacementTier: JsonValue = null;
    let replacementLineupPosition: string | null = null;

    if (replacementIds.length > 0) {
      const replacementIdSet = new Set(replacementIds);
      const candidates: { player: AnalysisRecord; score: number; position_priority: number }[] = [];
      for (const rebuiltPlayers of Object.values(rebuilt)) {
        for (const candidate of rebuiltPlayers) {
          if (!replacementIdSet.has(candidate.player_id)) continue;
          const sameSlot =
            lineupPosition === "QB" || lineupPosition === "RB" || lineupPosition === "WR" || lineupPosition === "TE";
          candidates.push({
            player: candidate,
            score: playerScore(candidate),
            position_priority: !sameSlot ? 0 : candidate.position === lineupPosition ? 0 : 1,
          });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.position_priority - b.position_priority || b.score - a.score);
        const replacement = candidates[0]!.player;
        replacementPlayer = (replacement.name as string | undefined) ?? null;
        replacementPlayerId = replacement.player_id ?? null;
        replacementTier = replacement.fantasy_value_tier ?? null;
        for (const [slot, slotPlayers] of Object.entries(rebuilt)) {
          if (slotPlayers.some((entry) => entry.player_id === replacementPlayerId)) {
            replacementLineupPosition = slot;
            break;
          }
        }
      }
    }

    let level: string;
    if (replacementPlayer == null && scoreDifference > 0) level = "very_high";
    else if (scoreDifference >= 200) level = "high";
    else if (scoreDifference >= 100) level = "moderate";
    else level = "low";

    rows.push({
      player_id: playerId,
      name: player.name ?? null,
      position: player.position ?? null,
      lineup_position: lineupPosition,
      replacement_player: replacementPlayer,
      replacement_player_id: replacementPlayerId,
      replacement_lineup_position: replacementLineupPosition,
      replacement_tier: replacementTier,
      lineup_score_before: originalScore,
      lineup_score_after: rebuiltScore,
      score_difference: scoreDifference,
      replacement_cost: level,
    });
  }
  return rows;
}

export function calculatePlayerProtection(team: AnalysisRecord): AnalysisRecord[] {
  const surplusPlayers = (team.roster_surplus ?? []) as AnalysisRecord[];
  const replacementCosts = new Map<unknown, AnalysisRecord>();
  for (const player of (team.roster_replacement_cost ?? []) as AnalysisRecord[]) {
    replacementCosts.set(player.player_id, player);
  }
  const protection: AnalysisRecord[] = [];

  for (const player of surplusPlayers) {
    const playerId = player.player_id;
    const tier = player.fantasy_value_tier;
    const inLineup = Boolean(player.in_optimal_lineup ?? false);
    const surplusType = player.surplus_type;
    const status = player.roster_status;
    const replacement = replacementCosts.get(playerId);
    const replacementLevel = replacement ? (replacement.replacement_cost as string | null) : null;
    const scoreDifference = replacement ? (replacement.score_difference as number | null) : null;
    const replacementPlayer = replacement ? (replacement.replacement_player as string | null) : null;
    let protectionLevel: string;
    let reason: string;

    if (status === "injured") {
      protectionLevel = "protect";
      reason = "High-value player currently unavailable due to injury.";
    } else if (tier === "elite") {
      protectionLevel = "protect";
      reason = "Elite fantasy asset.";
    } else if (replacement && replacementLevel === "very_high") {
      protectionLevel = "protect";
      reason = "Very difficult to replace within the current roster.";
    } else if (replacement && replacementLevel === "high") {
      protectionLevel = "protect";
      reason = "High lineup replacement cost.";
    } else if (replacement && replacementLevel === "moderate") {
      protectionLevel = "hold";
      if (replacementPlayer) {
        reason =
          scoreDifference != null
            ? `Moderate lineup replacement cost. Could be replaced by ${replacementPlayer} with a ${scoreDifference}-point loss.`
            : `Moderate lineup replacement cost. Could be replaced by ${replacementPlayer}.`;
      } else {
        reason = "Moderate lineup replacement cost.";
      }
    } else if (replacement && replacementLevel === "low") {
      if (surplusType === "surplus") {
        protectionLevel = "tradeable";
        reason = replacementPlayer
          ? `Low lineup replacement cost. ${replacementPlayer} can replace this player with minimal lineup impact.`
          : "Low lineup replacement cost and roster surplus.";
      } else if (inLineup) {
        protectionLevel = "tradeable";
        reason = "Currently in the optimal lineup, but inexpensive to replace.";
      } else {
        protectionLevel = "replaceable";
        reason = "Low lineup replacement cost and limited lineup importance.";
      }
    } else if (surplusType === "surplus" && tier === "strong") {
      protectionLevel = "tradeable";
      reason = "Strong player who is surplus to the current optimal lineup.";
    } else if (tier === "useful" && surplusType === "surplus") {
      protectionLevel = "replaceable";
      reason = "Useful player who is not needed for the optimal lineup.";
    } else if (tier === "useful") {
      protectionLevel = "hold";
      reason = "Useful depth player.";
    } else {
      protectionLevel = "replaceable";
      reason = "Lower-value player with limited lineup importance.";
    }

    protection.push({
      player_id: playerId ?? null,
      name: player.name ?? null,
      position: player.position ?? null,
      fantasy_value_tier: tier ?? null,
      replacement_cost: replacementLevel,
      replacement_player: replacementPlayer,
      score_difference: scoreDifference,
      protection: protectionLevel,
      reason,
    });
  }
  return protection;
}

export function classifyLeagueScarcity(leaguePositionAnalysis: AnalysisRecord): AnalysisRecord {
  const scarcity: AnalysisRecord = {};
  for (const [position, data] of Object.entries(leaguePositionAnalysis)) {
    const row = data as AnalysisRecord;
    const medianDepth = Number(row.median_depth_score);
    const averageDepth = Number(row.average_depth_score);
    const meaningful = Number(row.average_meaningful_players);
    const level = medianDepth <= 8 || meaningful <= 1.5 ? "high" : medianDepth <= 14 || meaningful <= 2.5 ? "moderate" : "low";
    scarcity[position] = {
      scarcity: level,
      median_depth_score: medianDepth,
      average_depth_score: averageDepth,
      average_meaningful_players: meaningful,
    };
  }
  return scarcity;
}

export function buildFantasyAnalysis(
  rosterData: Record<string, AnalysisRecord>,
  rosterConfiguration: AnalysisRecord,
): AnalysisRecord {
  const configuredSlots = expandRosterSlots(rosterConfiguration);
  const lineupRequirements: Record<string, number> = {};
  for (const position of DIRECT_POSITIONS) {
    lineupRequirements[position] = configuredSlots.filter(
      (slot) => slot.slot_type === "direct" && slot.slot_code === position,
    ).length;
  }
  for (const slot of configuredSlots) {
    if (slot.slot_type === "direct" && !(slot.slot_code in lineupRequirements)) {
      lineupRequirements[slot.slot_code] = (lineupRequirements[slot.slot_code] ?? 0) + 1;
    }
  }
  const flexSlotsByCode: Record<string, { count: number; eligible_positions: string[] }> = {};
  for (const slot of configuredSlots) {
    if (!slot.is_flex) continue;
    const flex = (flexSlotsByCode[slot.slot_code] ??= {
      count: 0,
      eligible_positions: [...slot.eligible_positions],
    });
    flex.count += 1;
  }
  lineupRequirements.FLEX = Object.values(flexSlotsByCode).reduce((sum, slot) => sum + slot.count, 0);
  const flexPositions = [
    ...new Set(Object.values(flexSlotsByCode).flatMap((slot) => slot.eligible_positions)),
  ].sort();

  const analysis: AnalysisRecord = {
    roster_configuration: rosterConfiguration,
    lineup_requirements: lineupRequirements,
    flex_positions: flexPositions,
    flex_slot_requirements: flexSlotsByCode,
    teams: {},
  };
  const teams = analysis.teams as Record<string, AnalysisRecord>;

  for (const [rosterId, roster] of Object.entries(rosterData)) {
    const positions: Record<string, AnalysisRecord[]> = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
    const starterIds = new Set(((roster.starters ?? []) as AnalysisRecord[]).map((player) => String(player.player_id)));
    const reserveIds = new Set(((roster.reserve ?? []) as AnalysisRecord[]).map((player) => String(player.player_id)));
    const taxiIds = new Set(((roster.taxi ?? []) as AnalysisRecord[]).map((player) => String(player.player_id)));
    const availabilityPlayers: AnalysisRecord[] = [];
    const availabilityPlayerIds = new Set<string>();
    const usableSummary: AnalysisRecord = Object.fromEntries(
      OFFENSIVE_POSITIONS.map((position) => [
        position,
        { rostered: 0, meaningful: 0, usable: 0, usable_meaningful: 0, unavailable_meaningful: 0 },
      ]),
    );

    for (const player of (roster.players ?? []) as AnalysisRecord[]) {
      const playerId = String(player.player_id);
      const position = String(player.position ?? "");
      if (!(position in positions)) continue;
      const rosterStatus = starterIds.has(playerId)
        ? "starter"
        : reserveIds.has(playerId)
          ? "reserve"
          : taxiIds.has(playerId)
            ? "taxi"
            : "bench";
      const valueTier = fantasyValueTier(player);
      positions[position]!.push({
        player_id: playerId,
        name: cleanName(player.name),
        team: player.team ?? null,
        status: player.status ?? null,
        injury_status: player.injury_status ?? null,
        roster_status: rosterStatus,
        fantasy_value_tier: valueTier,
        importance_score: fantasyImportanceScore({ fantasy_value_tier: valueTier, roster_status: rosterStatus }),
      });
      if (!availabilityPlayerIds.has(playerId)) {
        availabilityPlayerIds.add(playerId);
        const assessment = assessAvailability({
          position,
          status: player.status ?? null,
          injury_status: player.injury_status ?? null,
          roster_status: rosterStatus,
        });
        availabilityPlayers.push({
          player_id: playerId,
          name: player.name ?? null,
          position,
          team: player.team ?? null,
          status: player.status ?? null,
          injury_status: player.injury_status ?? null,
          roster_status: rosterStatus,
          ...assessment,
        });
        if ((OFFENSIVE_POSITIONS as readonly string[]).includes(position)) {
          const summary = usableSummary[position] as AnalysisRecord;
          const meaningful = MEANINGFUL_TIERS.has(valueTier);
          summary.rostered = Number(summary.rostered) + 1;
          if (meaningful) summary.meaningful = Number(summary.meaningful) + 1;
          if (assessment.currently_usable) summary.usable = Number(summary.usable) + 1;
          if (meaningful && assessment.currently_usable) {
            summary.usable_meaningful = Number(summary.usable_meaningful) + 1;
          }
          if (meaningful && assessment.availability === "unavailable") {
            summary.unavailable_meaningful = Number(summary.unavailable_meaningful) + 1;
          }
        }
      }
    }

    const positionSummary: AnalysisRecord = {};
    for (const [position, playersAtPosition] of Object.entries(positions)) {
      positionSummary[position] = {
        total: playersAtPosition.length,
        starters: playersAtPosition.filter((player) => player.roster_status === "starter").length,
        bench: playersAtPosition.filter((player) => player.roster_status === "bench").length,
        reserve: playersAtPosition.filter((player) => player.roster_status === "reserve").length,
        taxi: playersAtPosition.filter((player) => player.roster_status === "taxi").length,
        depth_score: playersAtPosition.reduce((sum, player) => sum + Number(player.importance_score), 0),
        meaningful_players: playersAtPosition.filter((player) =>
          ["elite", "strong", "useful"].includes(String(player.fantasy_value_tier)),
        ).length,
      };
    }

    const coverage = assignRosterSlotCoverage(configuredSlots, positions);
    const lineupCoverage: AnalysisRecord = {};
    for (const position of DIRECT_POSITIONS) {
      const totalPlayers = positions[position]!.length;
      const required = lineupRequirements[position] ?? 0;
      const directCoverage = coverage.assignments.filter(
        (assignment) => assignment.slot_type === "direct" && assignment.slot_code === position,
      ).length;
      lineupCoverage[position] = {
        required,
        total: totalPlayers,
        direct_coverage: directCoverage,
        surplus: Math.max(totalPlayers - required, 0),
        shortage: Math.max(required - directCoverage, 0),
      };
    }
    const flexCoverageByCode: AnalysisRecord = {};
    for (const [slotCode, flexSlot] of Object.entries(flexSlotsByCode)) {
      const supportedRequired = configuredSlots.filter(
        (slot) => slot.slot_type === "flex" && slot.slot_code === slotCode && slot.supported_by_analyzer,
      ).length;
      const flexCoverage = coverage.assignments.filter(
        (assignment) => assignment.slot_type === "flex" && assignment.slot_code === slotCode,
      ).length;
      flexCoverageByCode[slotCode] = {
        required: flexSlot.count,
        supported_required: supportedRequired,
        eligible_players: coverage.eligible_player_counts_by_flex[slotCode] ?? 0,
        coverage: flexCoverage,
        shortage: Math.max(supportedRequired - flexCoverage, 0),
        unsupported: flexSlot.count - supportedRequired,
      };
    }
    const supportedFlexRequired = Object.values(flexCoverageByCode).reduce<number>(
      (sum, data) => sum + Number((data as AnalysisRecord).supported_required),
      0,
    );
    const flexCoverage = Object.values(flexCoverageByCode).reduce<number>(
      (sum, data) => sum + Number((data as AnalysisRecord).coverage),
      0,
    );
    lineupCoverage.FLEX = {
      required: lineupRequirements.FLEX,
      supported_required: supportedFlexRequired,
      eligible_players: coverage.eligible_player_count_across_flex,
      coverage: flexCoverage,
      shortage: Math.max(supportedFlexRequired - flexCoverage, 0),
      unsupported: (lineupRequirements.FLEX ?? 0) - supportedFlexRequired,
    };
    lineupCoverage.flex_slots = flexCoverageByCode;
    lineupCoverage.summary = {
      supported_configured_slots: coverage.supported_slot_count,
      covered_slots: coverage.covered_slot_count,
      uncovered_slots: coverage.supported_slot_count - coverage.covered_slot_count,
      unsupported_slots: coverage.unsupported_slots,
      assignments: coverage.assignments,
    };

    teams[String(rosterId)] = {
      team_name: cleanName(roster.team_name),
      owner: cleanName(roster.owner),
      positions,
      availability: { players: availabilityPlayers, usable_summary: usableSummary },
      position_summary: positionSummary,
      lineup_coverage: lineupCoverage,
      position_need: {},
    };
  }

  analysis.league_position_analysis = buildLeaguePositionAnalysis(analysis);
  const league = analysis.league_position_analysis as AnalysisRecord;
  analysis.league_position_scarcity = classifyLeagueScarcity(
    Object.fromEntries(OFFENSIVE_POSITIONS.filter((position) => position in league).map((position) => [position, league[position]])),
  );

  const usableLeagueMedians: Record<string, { usable_bodies: number; usable_meaningful: number }> = {};
  for (const position of OFFENSIVE_POSITIONS) {
    const summaries = Object.values(teams).map((team) =>
      (((team.availability as AnalysisRecord).usable_summary as AnalysisRecord)[position] ?? {}) as AnalysisRecord,
    );
    const usableBodies = summaries.map((summary) => Number(summary.usable ?? 0)).sort((a, b) => a - b);
    const usableMeaningful = summaries.map((summary) => Number(summary.usable_meaningful ?? 0)).sort((a, b) => a - b);
    usableLeagueMedians[position] = {
      usable_bodies: usableBodies.length > 0 ? median(usableBodies) : 0,
      usable_meaningful: usableMeaningful.length > 0 ? median(usableMeaningful) : 0,
    };
  }
  for (const team of Object.values(teams)) {
    const optimalLineup = calculateOptimalLineup(team.positions as Record<string, AnalysisRecord[]>, rosterConfiguration);
    team.optimal_lineup = optimalLineup;
    const availability = team.availability as AnalysisRecord;
    const usableByPlayerId = new Map<string, boolean>(
      ((availability.players ?? []) as AnalysisRecord[]).map((player): [string, boolean] => [
        String(player.player_id),
        player.currently_usable === true,
      ]),
    );
    const structuralPositions = team.positions as Record<string, AnalysisRecord[]>;
    const usablePositions: Record<string, AnalysisRecord[]> = Object.fromEntries(
      OFFENSIVE_POSITIONS.map((position) => [
        position,
        (structuralPositions[position] ?? []).filter((player) =>
          usableByPlayerId.get(String(player.player_id)) === true,
        ),
      ]),
    );
    availability.usable_lineup = calculateOptimalLineup(usablePositions, rosterConfiguration);
    team.availability = availability;
    const usablePositionSummary: Record<string, AnalysisRecord> = {};
    for (const position of OFFENSIVE_POSITIONS) {
      const candidates = usablePositions[position] ?? [];
      usablePositionSummary[position] = {
        starters: candidates.filter((player) => player.roster_status === "starter").length,
        meaningful_players: candidates.filter((player) =>
          MEANINGFUL_TIERS.has(String(player.fantasy_value_tier)),
        ).length,
      };
    }
    const usableStartingDepth: AnalysisRecord = {};
    const usablePositionNeed: AnalysisRecord = {};
    for (const position of OFFENSIVE_POSITIONS) {
      const usableSummary = ((availability.usable_summary as AnalysisRecord)[position] ?? {}) as AnalysisRecord;
      usableStartingDepth[position] = classifyStartingDepth(
        position,
        usablePositionSummary[position] ?? {},
        usablePositions,
        availability.usable_lineup as Record<string, AnalysisRecord[]>,
        configuredSlots,
      );
      usablePositionNeed[position] = classifyUsablePositionNeed(
        position,
        usableSummary,
        usableLeagueMedians[position]!,
        configuredSlots,
      );
    }
    availability.usable_starting_depth = usableStartingDepth;
    availability.usable_position_need = usablePositionNeed;
    availability.usable_lineup_strength = calculateLineupStrength(
      {
        positions: usablePositions,
        optimal_lineup: availability.usable_lineup as Record<string, AnalysisRecord[]>,
        starting_depth: usableStartingDepth,
      },
      rosterConfiguration,
    );
    availability.usable_replacement_cost = calculateReplacementCostForCandidates(usablePositions, rosterConfiguration);
    const positionNeed: AnalysisRecord = {};
    for (const position of OFFENSIVE_POSITIONS) {
      positionNeed[position] = classifyPositionNeed(
        position,
        ((team.position_summary as AnalysisRecord)[position] ?? {}) as AnalysisRecord,
        league,
        configuredSlots,
      );
    }
    team.position_need = positionNeed;
    const startingDepth: AnalysisRecord = {};
    for (const position of OFFENSIVE_POSITIONS) {
      startingDepth[position] = classifyStartingDepth(
        position,
        ((team.position_summary as AnalysisRecord)[position] ?? {}) as AnalysisRecord,
        team.positions as Record<string, AnalysisRecord[]>,
        optimalLineup,
        configuredSlots,
      );
    }
    team.starting_depth = startingDepth;
    team.lineup_strength = calculateLineupStrength(team, rosterConfiguration);
    team.roster_surplus = calculateRosterSurplus(team, rosterConfiguration);
    team.roster_replacement_cost = calculateRosterReplacementCost(team, rosterConfiguration);
    team.player_protection = calculatePlayerProtection(team);
  }

  return analysis;
}

export function buildWaiverAnalysis(
  waiverPool: AnalysisRecord[],
  fantasyAnalysis: AnalysisRecord,
  myRosterId: number | string,
): AnalysisRecord {
  const teams = fantasyAnalysis.teams as Record<string, AnalysisRecord>;
  const myTeam = teams[String(myRosterId)];
  if (!myTeam) return { available: false, candidates: [] };
  const leagueScarcity = (fantasyAnalysis.league_position_scarcity ?? {}) as Record<string, AnalysisRecord>;
  const offensive = new Set<string>(OFFENSIVE_POSITIONS);
  const candidates: AnalysisRecord[] = [];
  for (const player of waiverPool) {
    const position = String(player.position ?? "");
    if (!offensive.has(position)) continue;
    const needLevel = String((((myTeam.position_need ?? {}) as AnalysisRecord)[position] as AnalysisRecord | undefined)?.need ?? "unknown");
    const scarcity = String((leagueScarcity[position]?.scarcity as string | undefined) ?? "unknown");
    candidates.push({
      player_id: player.player_id,
      name: player.name,
      position,
      team: player.team ?? null,
      status: player.status ?? null,
      injury_status: player.injury_status ?? null,
      search_rank: player.search_rank ?? null,
      team_need: needLevel,
      league_scarcity: scarcity,
      waiver_value_score: waiverValueScore(player, needLevel, scarcity),
    });
  }
  candidates.sort((a, b) => {
    const score = Number(b.waiver_value_score) - Number(a.waiver_value_score);
    if (score !== 0) return score;
    const rankA = a.search_rank == null ? 999999 : Number(a.search_rank);
    const rankB = b.search_rank == null ? 999999 : Number(b.search_rank);
    return rankA - rankB;
  });
  return { available: true, team: myTeam.team_name, candidates };
}
