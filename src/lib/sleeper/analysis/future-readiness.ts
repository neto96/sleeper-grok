import type { AnalysisRecord, JsonValue } from "./engine.ts";
import { calculateOptimalLineup, expandRosterSlots } from "./engine.ts";

const OFFENSE = new Set(["QB", "RB", "WR", "TE"]);
const SPECIAL_TEAMS = new Set(["K", "DEF"]);
const MAX_REGULAR_SEASON_WEEK = 18;

export type FutureReadinessOptions = {
  currentWeek: number;
  regularSeasonEndWeek: number;
  byeWeeksByTeam: Record<string, number[]>;
  byeScheduleAvailable: boolean;
};

type SlotSpec = {
  code: string;
  required: number;
  eligible: string[];
  kind: "offense" | "special" | "unsupported";
};

function slotSpecs(configuration: AnalysisRecord): SlotSpec[] {
  const grouped = new Map<string, SlotSpec>();
  for (const slot of expandRosterSlots(configuration)) {
    if (slot.slot_type === "nonstarter") continue;
    const code = slot.slot_code;
    let kind: SlotSpec["kind"] = "unsupported";
    if (
      (slot.slot_type === "direct" || slot.slot_type === "flex") &&
      slot.eligible_positions.length > 0 &&
      slot.eligible_positions.every((position) => OFFENSE.has(position))
    ) {
      kind = "offense";
    } else if (slot.slot_type === "direct" && SPECIAL_TEAMS.has(code)) {
      kind = "special";
    }
    const current = grouped.get(code) ?? {
      code,
      required: 0,
      eligible: [...slot.eligible_positions],
      kind,
    };
    current.required += 1;
    for (const position of slot.eligible_positions) {
      if (!current.eligible.includes(position)) current.eligible.push(position);
    }
    if (current.kind !== kind) current.kind = "unsupported";
    grouped.set(code, current);
  }
  return [...grouped.values()];
}

export function readinessUrgency(
  status: "covered" | "thin" | "uncovered" | "unsupported",
  week: number,
  currentWeek: number,
): "none" | "watch" | "plan_ahead" | "act_now" {
  if (status === "unsupported" || status === "covered") return "none";
  if (status === "thin") return "watch";
  const weeksAway = week - currentWeek;
  if (weeksAway <= 1) return "act_now";
  if (weeksAway === 2) return "plan_ahead";
  return "watch";
}

function isOnBye(player: AnalysisRecord, week: number, byes: Record<string, number[]>): boolean {
  const team = String(player.team ?? "").toUpperCase();
  return (byes[team] ?? []).includes(week);
}

function distinctPlayers(players: AnalysisRecord[]): AnalysisRecord[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (player.player_id == null) return false;
    const id = String(player.player_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function addFutureReadiness(
  fantasyAnalysis: AnalysisRecord,
  configuration: AnalysisRecord,
  options: FutureReadinessOptions,
): void {
  const rawWeek = Number(options.currentWeek);
  const horizonStart = Number.isFinite(rawWeek) ? Math.max(1, Math.trunc(rawWeek)) : 1;
  const rawEnd = Number(options.regularSeasonEndWeek);
  const regularEnd = Number.isFinite(rawEnd)
    ? Math.min(MAX_REGULAR_SEASON_WEEK, Math.max(1, Math.trunc(rawEnd)))
    : MAX_REGULAR_SEASON_WEEK;
  const horizonEnd = Math.min(horizonStart + 4, regularEnd, MAX_REGULAR_SEASON_WEEK);
  const specs = slotSpecs(configuration);
  const teams = (fantasyAnalysis.teams ?? {}) as Record<string, AnalysisRecord>;

  for (const team of Object.values(teams)) {
    const positionPlayers = (team.positions ?? {}) as Record<string, AnalysisRecord[]>;
    const availability = (team.availability ?? {}) as AnalysisRecord;
    const usableById = new Map<string, boolean>(
      ((availability.players ?? []) as AnalysisRecord[]).map((player) => [
        String(player.player_id),
        player.currently_usable === true,
      ]),
    );
    const weeks: Record<string, JsonValue> = {};

    for (let week = horizonStart; week <= horizonEnd; week += 1) {
      const futureOffense: Record<string, AnalysisRecord[]> = {};
      for (const position of OFFENSE) {
        futureOffense[position] = distinctPlayers(positionPlayers[position] ?? []).filter(
          (player) =>
            usableById.get(String(player.player_id)) === true &&
            !isOnBye(player, week, options.byeWeeksByTeam),
        );
      }
      const lineup = calculateOptimalLineup(futureOffense, configuration);
      const assignedIds = new Set(
        Object.values(lineup).flatMap((players) => players.map((player) => String(player.player_id))),
      );
      const positions: Record<string, JsonValue> = {};

      for (const spec of specs) {
        const affected = distinctPlayers(
          spec.eligible.flatMap((position) => positionPlayers[position] ?? []),
        ).filter((player) => isOnBye(player, week, options.byeWeeksByTeam));
        let usable = 0;
        let extraBodies = 0;
        let assignedPlayerIds: string[] = [];
        let status: "covered" | "thin" | "uncovered" | "unsupported" = "unsupported";
        let reason: string | null = null;

        if (!options.byeScheduleAvailable) {
          reason = "Bye-week coverage could not be evaluated because the NFL schedule is unavailable.";
        } else if (spec.kind === "unsupported") {
          reason = `Coverage is not evaluated for ${spec.code}.`;
        } else if (spec.kind === "offense") {
          const assigned = lineup[spec.code] ?? [];
          assignedPlayerIds = assigned.map((player) => String(player.player_id));
          usable = assignedPlayerIds.length;
          const eligible = distinctPlayers(
            spec.eligible.flatMap((position) => futureOffense[position] ?? []),
          );
          extraBodies = eligible.filter((player) => !assignedIds.has(String(player.player_id))).length;
          status =
            usable < spec.required
              ? "uncovered"
              : extraBodies === 0 && affected.length === 0
                ? "thin"
                : "covered";
        } else {
          const available = distinctPlayers(positionPlayers[spec.code] ?? []).filter(
            (player) =>
              usableById.get(String(player.player_id)) === true &&
              !isOnBye(player, week, options.byeWeeksByTeam),
          );
          assignedPlayerIds = available.slice(0, spec.required).map((player) => String(player.player_id));
          usable = assignedPlayerIds.length;
          extraBodies = Math.max(0, available.length - spec.required);
          status =
            usable < spec.required
              ? "uncovered"
              : extraBodies === 0 && affected.length === 0
                ? "thin"
                : "covered";
        }

        if (status === "uncovered") {
          reason =
            affected.length > 0
              ? `Bye week leaves ${usable} of ${spec.required} ${spec.code} slots fillable in Week ${week}.`
              : usable === 0
                ? `No usable ${spec.code} available for Week ${week}.`
                : `Only ${usable} usable ${spec.code} available for ${spec.required} slots in Week ${week}.`;
        } else if (status === "thin") {
          reason = `Only enough usable ${spec.code} players to fill ${spec.required} slot(s) in Week ${week}.`;
        } else if (status === "covered") {
          reason = `${spec.code} lineup remains covered in Week ${week}.`;
        }

        positions[spec.code] = {
          required: spec.required,
          usable,
          status,
          urgency: readinessUrgency(status, week, horizonStart),
          reason,
          affected_player_ids: affected.map((player) => String(player.player_id)),
          assigned_player_ids: assignedPlayerIds,
          assigned_player_ids: assignedPlayerIds,
        };
      }
      weeks[String(week)] = { positions };
    }

    team.future_readiness = {
      horizon_start_week: horizonStart,
      horizon_end_week: horizonEnd,
      bye_schedule_available: options.byeScheduleAvailable,
      weeks,
    };
  }
}

export function deriveByeWeeksFromSchedule(
  games: unknown,
): { available: boolean; byeWeeksByTeam: Record<string, number[]> } {
  if (!Array.isArray(games)) return { available: false, byeWeeksByTeam: {} };
  const teams = new Set<string>();
  const teamsByWeek = new Map<number, Set<string>>();
  const weeks = new Set<number>();

  for (const item of games) {
    if (item == null || typeof item !== "object") continue;
    const game = item as Record<string, unknown>;
    const week = Number(game.week);
    const home = String(game.home ?? "").trim().toUpperCase();
    const away = String(game.away ?? "").trim().toUpperCase();
    if (!Number.isInteger(week) || week < 1 || week > MAX_REGULAR_SEASON_WEEK || !home || !away) continue;
    weeks.add(week);
    teams.add(home);
    teams.add(away);
    const scheduled = teamsByWeek.get(week) ?? new Set<string>();
    scheduled.add(home);
    scheduled.add(away);
    teamsByWeek.set(week, scheduled);
  }

  const complete =
    teams.size >= 32 &&
    Array.from({ length: MAX_REGULAR_SEASON_WEEK }, (_, index) => index + 1).every((week) =>
      weeks.has(week),
    );
  if (!complete) return { available: false, byeWeeksByTeam: {} };

  const byeWeeksByTeam: Record<string, number[]> = {};
  for (const team of teams) {
    byeWeeksByTeam[team] = Array.from(
      { length: MAX_REGULAR_SEASON_WEEK },
      (_, index) => index + 1,
    ).filter((week) => !teamsByWeek.get(week)?.has(team));
  }
  return { available: true, byeWeeksByTeam };
}
