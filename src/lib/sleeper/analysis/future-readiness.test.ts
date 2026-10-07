import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addFutureReadiness, deriveByeWeeksFromSchedule, readinessUrgency } from "./future-readiness.ts";
import { SNAPSHOT_VERSION, buildFantasyAnalysis, parseRosterConfiguration, type AnalysisRecord } from "./engine.ts";

const options = (byeWeeksByTeam: Record<string, number[]> = {}, currentWeek = 6) => ({
  currentWeek,
  regularSeasonEndWeek: 18,
  byeWeeksByTeam,
  byeScheduleAvailable: true,
});

function player(id: string, position: string, extra: AnalysisRecord = {}): AnalysisRecord {
  return { player_id: id, name: id, position, team: "BUF", status: "Active", injury_status: null, search_rank: 50, ...extra };
}

function analyze(
  roster: AnalysisRecord[],
  slots: string[],
  readinessOptions = options(),
): AnalysisRecord {
  const configuration = parseRosterConfiguration(slots);
  const analysis = buildFantasyAnalysis(
    { "1": { team_name: "Fixture", players: roster, starters: [], reserve: [], taxi: [] } },
    configuration,
  );
  addFutureReadiness(analysis, configuration, readinessOptions);
  return ((analysis.teams as Record<string, AnalysisRecord>)["1"]!.future_readiness as AnalysisRecord);
}

function week(readiness: AnalysisRecord, number: number): AnalysisRecord {
  return ((readiness.weeks as Record<string, AnalysisRecord>)[String(number)]!.positions as Record<string, AnalysisRecord>);
}

describe("V3.5 future readiness", () => {
  it("marks a QB bye uncovered without a backup and covered with a usable backup", () => {
    assert.equal((week(analyze([player("qb", "QB")], ["QB"], options({ BUF: [6] })), 6).QB as AnalysisRecord).status, "uncovered");
    assert.equal((week(analyze([player("qb", "QB"), player("backup", "QB", { team: "NYJ" })], ["QB"], options({ BUF: [6] })), 6).QB as AnalysisRecord).status, "covered");
  });

  it("marks a TE bye uncovered without a backup", () => {
    assert.equal((week(analyze([player("te", "TE")], ["TE"], options({ BUF: [6] })), 6).TE as AnalysisRecord).status, "uncovered");
  });

  it("keeps Questionable backups usable", () => {
    const readiness = analyze([player("te", "TE"), player("te-q", "TE", { team: "NYJ", injury_status: "Questionable" })], ["TE"], options({ BUF: [6] }));
    assert.equal((week(readiness, 6).TE as AnalysisRecord).status, "covered");
  });

  it("does not let Out, IR, NA, PUP, or DNR backups cover a slot", () => {
    for (const injury_status of ["Out", "IR", "NA", "PUP", "DNR"]) {
      const readiness = analyze([player("qb", "QB"), player("backup", "QB", { team: "NYJ", injury_status })], ["QB"], options({ BUF: [6] }));
      assert.equal((week(readiness, 6).QB as AnalysisRecord).status, "uncovered", injury_status);
    }
  });

  it("excludes a player on bye only in that simulated week", () => {
    const readiness = analyze([player("qb", "QB")], ["QB"], options({ BUF: [6] }, 5));
    assert.notEqual((week(readiness, 5).QB as AnalysisRecord).status, "uncovered");
    assert.equal((week(readiness, 6).QB as AnalysisRecord).status, "uncovered");
    assert.notEqual((week(readiness, 7).QB as AnalysisRecord).status, "uncovered");
  });

  it("keeps FLEX assignment globally legal without reusing a player", () => {
    const readiness = analyze([
      player("rb-bye", "RB"),
      player("rb-backup", "RB", { team: "NYJ" }),
      player("wr", "WR", { team: "MIA" }),
      player("te", "TE", { team: "KC" }),
    ], ["RB", "WR", "TE", "FLEX"], options({ BUF: [6] }));
    const positions = week(readiness, 6);
    const assignedIds = ["RB", "WR", "TE", "FLEX"].flatMap((key) => (positions[key] as AnalysisRecord).assigned_player_ids as string[]);
    assert.equal(assignedIds.length, 3);
    assert.equal(new Set(assignedIds).size, assignedIds.length);
  });

  it("marks DEF bye uncovered and covered when a second usable DEF is rostered", () => {
    const missing = analyze([player("def", "DEF")], ["DEF"], options({ BUF: [6] }));
    const backup = analyze([player("def", "DEF"), player("def2", "DEF", { team: "NYJ" })], ["DEF"], options({ BUF: [6] }));
    assert.equal((week(missing, 6).DEF as AnalysisRecord).status, "uncovered");
    assert.equal((week(backup, 6).DEF as AnalysisRecord).status, "covered");
  });

  it("marks a K bye uncovered without a backup and covered with one", () => {
    assert.equal((week(analyze([player("k", "K")], ["K"], options({ BUF: [6] })), 6).K as AnalysisRecord).status, "uncovered");
    assert.equal((week(analyze([player("k", "K"), player("k2", "K", { team: "NYJ" })], ["K"], options({ BUF: [6] })), 6).K as AnalysisRecord).status, "covered");
  });

  it("adds readiness without changing V3.4 analysis or snapshot version", () => {
    const roster = { "1": { team_name: "Fixture", players: [player("qb", "QB"), player("rb", "RB")], starters: [], reserve: [], taxi: [] } };
    const configuration = parseRosterConfiguration(["QB", "RB", "FLEX"]);
    const baseline = buildFantasyAnalysis(structuredClone(roster), configuration);
    const additive = buildFantasyAnalysis(structuredClone(roster), configuration);
    addFutureReadiness(additive, configuration, options());
    const team = (additive.teams as Record<string, AnalysisRecord>)["1"]!;
    delete team.future_readiness;
    assert.deepEqual(additive, baseline);
    assert.equal(SNAPSHOT_VERSION, "3.2");
  });

  it("surfaces unsupported IDP slots without attempting to optimize them", () => {
    const readiness = analyze([player("qb", "QB")], ["QB", "DL", "IDP_FLEX"]);
    const positions = week(readiness, 6);
    assert.equal((positions.DL as AnalysisRecord).status, "unsupported");
    assert.equal((positions.IDP_FLEX as AnalysisRecord).status, "unsupported");
  });

  it("uses a deterministic four-future-week horizon, bounded by the regular season", () => {
    const first = analyze([player("qb", "QB")], ["QB"], options({}, 6));
    const second = analyze([player("qb", "QB")], ["QB"], options({}, 6));
    assert.deepEqual(first, second);
    assert.equal(first.horizon_start_week, 6);
    assert.equal(first.horizon_end_week, 10);
    assert.deepEqual(Object.keys(first.weeks as object), ["6", "7", "8", "9", "10"]);
    const bounded = analyze([player("qb", "QB")], ["QB"], { ...options({}, 6), regularSeasonEndWeek: 8 });
    assert.equal(bounded.horizon_end_week, 8);
    assert.deepEqual(Object.keys(bounded.weeks as object), ["6", "7", "8"]);
  });

  it("maps urgency by weeks away and keeps covered weeks at none", () => {
    assert.equal(readinessUrgency("uncovered", 6, 6), "act_now");
    assert.equal(readinessUrgency("uncovered", 7, 6), "act_now");
    assert.equal(readinessUrgency("uncovered", 8, 6), "plan_ahead");
    assert.equal(readinessUrgency("uncovered", 9, 6), "watch");
    assert.equal(readinessUrgency("uncovered", 10, 6), "watch");
    assert.equal(readinessUrgency("covered", 6, 6), "none");
    assert.equal(readinessUrgency("thin", 6, 6), "watch");
  });

  it("derives team bye weeks from a complete schedule fixture and rejects incomplete data", () => {
    const teams = Array.from({ length: 32 }, (_, index) => `T${index}`);
    const games: { week: number; home: string; away: string }[] = [];
    for (let week = 1; week <= 18; week += 1) {
      const active = week === 6 ? teams.slice(2) : teams;
      for (let index = 0; index < active.length; index += 2) {
        games.push({ week, home: active[index]!, away: active[index + 1]! });
      }
    }
    const result = deriveByeWeeksFromSchedule(games);
    assert.equal(result.available, true);
    assert.deepEqual(result.byeWeeksByTeam.T0, [6]);
    assert.deepEqual(deriveByeWeeksFromSchedule([]).available, false);
  });
});