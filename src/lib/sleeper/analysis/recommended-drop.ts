import { expandRosterSlots, type AnalysisRecord } from "./engine.ts";

export type RecommendedDrop = { player_id: string; name: string; position: string; reason: string };
const record = (value: unknown): AnalysisRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnalysisRecord : {};
const rows = (value: unknown): AnalysisRecord[] => Array.isArray(value) ? value as AnalysisRecord[] : [];
const ids = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const TIERS: Record<string, number> = { deep_waiver: 1, fringe: 2, useful: 3 };

/** One conservative drop alternative, evaluated independently against the unchanged roster. */
export function recommendSafeDrop(team: AnalysisRecord, configuration: AnalysisRecord): RecommendedDrop | null {
  const availability = record(team.availability);
  const readiness = record(team.future_readiness);
  const weeks = record(readiness.weeks);
  const start = Number(readiness.horizon_start_week);
  const end = Number(readiness.horizon_end_week);
  const slots = expandRosterSlots(configuration).filter((slot) => slot.slot_type !== "nonstarter");
  if (readiness.bye_schedule_available !== true || !Number.isInteger(start) || !Number.isInteger(end) || end < start || slots.length === 0) return null;
  if (slots.some((slot) => !slot.recognized)) return null;
  for (const value of [team.player_protection, team.roster_replacement_cost, availability.usable_replacement_cost, availability.actionable_surplus, availability.players]) {
    if (!Array.isArray(value)) return null;
  }
  const players: Array<AnalysisRecord & { position: string }> = Object.entries(record(team.positions)).flatMap(([position, value]) => rows(value).map((player) => ({ ...player, position })));
  const usableIds = new Set(rows(availability.players).filter((player) => player.currently_usable === true).map((player) => String(player.player_id)));
  const find = (value: unknown, id: string) => rows(value).find((row) => String(row.player_id) === id);
  const candidates = players.filter((player) => {
    const id = String(player.player_id);
    const position = player.position;
    const tier = String(player.fantasy_value_tier);
    if (!(tier in TIERS) || player.roster_status !== "bench" || !usableIds.has(id)) return false;
    const protection = find(team.player_protection, id);
    if (protection && protection.protection !== "replaceable" && protection.protection !== "tradeable") return false;
    const surplus = find(availability.actionable_surplus, id);
    if (tier === "useful" && (!protection || !surplus || !["surplus", "replaceable"].includes(String(surplus.surplus_type)))) return false;
    for (const value of [team.roster_replacement_cost, availability.usable_replacement_cost]) {
      const cost = find(value, id);
      if (!cost || cost.score_difference !== 0 || cost.lineup_position !== null) return false;
    }
    for (const value of [team.position_need, availability.usable_position_need]) {
      const need = record(record(value)[position]).need;
      if (!["low", "moderate"].includes(String(need))) return false;
    }
    for (let week = start; week <= end; week += 1) {
      const positions = record(record(weeks[String(week)]).positions);
      const assigned = new Set(Object.values(positions).flatMap((row) => ids(record(row).assigned_player_ids)));
      if (assigned.has(id)) return false;
      for (const slot of slots) {
        const row = record(positions[slot.slot_code]);
        // Require every horizon slot's evidence, even slots unrelated to this drop.
        if (!Array.isArray(row.assigned_player_ids) || !Array.isArray(row.affected_player_ids) || row.status === "unsupported" || !row.status) return false;
        if (!slot.eligible_positions.includes(position)) continue;
        const affected = new Set(ids(row.affected_player_ids));
        if (affected.has(id)) continue; // Removing a player already on bye cannot reduce this week's cover.
        if (row.status === "uncovered") return false;
        const backupIds = new Set(players.filter((other) =>
          String(other.player_id) !== id && slot.eligible_positions.includes(other.position) &&
          usableIds.has(String(other.player_id)) && !assigned.has(String(other.player_id)) && !affected.has(String(other.player_id)),
        ).map((other) => String(other.player_id)));
        if (backupIds.size === 0) return false;
      }
    }
    return true;
  });
  candidates.sort((a, b) => {
    const safe = (player: AnalysisRecord) => ["surplus", "replaceable"].includes(String(find(availability.actionable_surplus, String(player.player_id))?.surplus_type)) ? 0 : 1;
    return safe(a) - safe(b) || TIERS[String(a.fantasy_value_tier)]! - TIERS[String(b.fantasy_value_tier)]! || Number(a.importance_score) - Number(b.importance_score) || String(a.player_id).localeCompare(String(b.player_id));
  });
  const player = candidates[0];
  if (!player) return null;
  return {
    player_id: String(player.player_id), name: String(player.name), position: player.position,
    reason: `${player.position} retains backup depth without him, dropping him does not weaken the current starting lineup, and the next ${end - start + 1} weeks remain covered where they were covered before.`,
  };
}
