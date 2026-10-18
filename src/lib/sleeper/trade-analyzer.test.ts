import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTrade, simulateTradeRosters } from "./trade-analyzer.ts";
import type { LeagueSnapshot, PlayerSlot, TeamRoster } from "./types.ts";

const ROSTER_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];

function player(id: string, position: string, rank: number, injuryStatus: string | null = null): PlayerSlot {
  return {
    playerId: id,
    name: id,
    position,
    slot: "BN",
    nflTeam: "TST",
    injuryStatus,
    status: "Active",
    number: null,
    searchRank: rank,
  };
}

function team(rosterId: number, name: string, players: PlayerSlot[]): TeamRoster {
  return {
    rosterId,
    teamName: name,
    ownerName: name,
    username: name,
    avatar: null,
    isCommissioner: false,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    waiverPosition: rosterId,
    faabUsed: 0,
    faabBudget: 100,
    streak: null,
    starters: [],
    bench: players,
    reserve: [],
    taxi: [],
  };
}

function snapshot(teams: TeamRoster[]): LeagueSnapshot {
  return {
    fetchedAt: "2026-10-18T00:00:00.000Z",
    leagueId: "1",
    leagueName: "Test",
    season: "2026",
    seasonType: "regular",
    status: "in_season",
    sport: "nfl",
    scoring: "PPR",
    week: 6,
    displayWeek: 6,
    rosterSlots: ROSTER_SLOTS,
    benchSlots: 6,
    playoffTeams: 6,
    avatar: null,
    myRosterId: 1,
    waiverSystem: "Waiver Priority",
    teams,
    waiverOrder: [],
    waiverByPosition: {},
    transactions: [],
    matchups: [],
    notes: [],
    snapshotVersion: "3.2",
    fantasyAnalysis: {},
    waiverAnalysis: {},
    actionableWaiverAnalysis: {},
    analysisWaiverPool: [],
    markdown: "",
    filename: "",
    jsonFilename: "",
  };
}

function baseTeams(): TeamRoster[] {
  return [
    team(1, "A", [
      player("a-qb", "QB", 20),
      player("a-rb1", "RB", 25),
      player("a-rb2", "RB", 80),
      player("a-rb3", "RB", 200),
      player("a-wr1", "WR", 30),
      player("a-wr2", "WR", 70),
      player("a-wr3", "WR", 180),
      player("a-te", "TE", 90),
    ]),
    team(2, "B", [
      player("b-qb", "QB", 35),
      player("b-rb1", "RB", 15),
      player("b-rb2", "RB", 60),
      player("b-rb3", "RB", 150),
      player("b-wr1", "WR", 10),
      player("b-wr2", "WR", 55),
      player("b-wr3", "WR", 140),
      player("b-te", "TE", 100),
    ]),
    team(3, "C", [
      player("c-qb", "QB", 40),
      player("c-rb1", "RB", 45),
      player("c-rb2", "RB", 90),
      player("c-wr1", "WR", 50),
      player("c-wr2", "WR", 95),
      player("c-te", "TE", 110),
    ]),
  ];
}

describe("trade simulation", () => {
  it("does not mutate source rosters", () => {
    const [a, b] = baseTeams();
    const beforeA = structuredClone(a);
    const beforeB = structuredClone(b);
    simulateTradeRosters(a!, b!, ["a-rb1"], ["b-wr1"]);
    assert.deepEqual(a, beforeA);
    assert.deepEqual(b, beforeB);
  });

  it("supports 1-for-1 and moves active players to the receiving bench", () => {
    const [a, b] = baseTeams();
    const result = simulateTradeRosters(a!, b!, ["a-rb1"], ["b-wr1"]);
    assert.ok(result.teamA.bench.some((row) => row.playerId === "b-wr1"));
    assert.ok(result.teamB.bench.some((row) => row.playerId === "a-rb1"));
  });

  it("preserves reserve and taxi state", () => {
    const [a, b] = baseTeams();
    a!.reserve.push({ ...player("a-ir", "WR", 50, "IR"), slot: "IR" });
    b!.taxi.push({ ...player("b-taxi", "RB", 200), slot: "TAXI" });
    const result = simulateTradeRosters(a!, b!, ["a-ir"], ["b-taxi"]);
    assert.ok(result.teamA.taxi.some((row) => row.playerId === "b-taxi"));
    assert.ok(result.teamB.reserve.some((row) => row.playerId === "a-ir"));
  });
});

describe("trade analyzer", () => {
  it("evaluates both teams independently for a 1-for-1", () => {
    const result = analyzeTrade(snapshot(baseTeams()), {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-rb1"],
      teamBPlayerIds: ["b-wr1"],
    });
    assert.equal(result.valid, true);
    if (!result.valid) return;
    assert.equal(result.teamA.rosterId, 1);
    assert.equal(result.teamB.rosterId, 2);
    assert.notDeepEqual(result.teamA.lineupChanges, result.teamB.lineupChanges);
  });

  it("supports 2-for-1, 1-for-2, and 2-for-2 without auto-dropping", () => {
    const s = snapshot(baseTeams());
    const twoForOne = analyzeTrade(s, {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-rb2", "a-wr2"],
      teamBPlayerIds: ["b-rb1"],
    });
    assert.equal(twoForOne.valid, true);
    if (twoForOne.valid) {
      assert.equal(twoForOne.teamB.rosterSize.after, twoForOne.teamB.rosterSize.before + 1);
      assert.deepEqual(twoForOne.teamB.potentialDrops, []);
    }
    assert.equal(analyzeTrade(s, {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-rb1"],
      teamBPlayerIds: ["b-wr1", "b-rb2"],
    }).valid, true);
    assert.equal(analyzeTrade(s, {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-rb1", "a-wr1"],
      teamBPlayerIds: ["b-wr1", "b-rb1"],
    }).valid, true);
  });

  it("reports the exact required drop count at roster capacity", () => {
    const teams = baseTeams();
    for (let i = teams[1]!.bench.length; i < 15; i += 1) {
      teams[1]!.bench.push(player(`b-fill-${i}`, "WR", 500 + i));
    }
    const result = analyzeTrade(snapshot(teams), {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-rb2", "a-wr2"],
      teamBPlayerIds: ["b-rb1"],
    });
    assert.equal(result.valid, true);
    if (!result.valid) return;
    assert.equal(result.teamB.rosterSize.before, 15);
    assert.equal(result.teamB.rosterSize.after, 16);
    assert.equal(result.teamB.rosterSize.requiredDrops, 1);
  });

  it("rejects same-team, empty, duplicate, overlap, and non-rostered trades", () => {
    const s = snapshot(baseTeams());
    assert.equal(analyzeTrade(s, { teamAId: 1, teamBId: 1, teamAPlayerIds: ["a-rb1"], teamBPlayerIds: ["a-wr1"] }).valid, false);
    assert.equal(analyzeTrade(s, { teamAId: 1, teamBId: 2, teamAPlayerIds: [], teamBPlayerIds: ["b-wr1"] }).valid, false);
    assert.equal(analyzeTrade(s, { teamAId: 1, teamBId: 2, teamAPlayerIds: ["a-rb1", "a-rb1"], teamBPlayerIds: ["b-wr1"] }).valid, false);
    assert.equal(analyzeTrade(s, { teamAId: 1, teamBId: 2, teamAPlayerIds: ["a-rb1"], teamBPlayerIds: ["a-rb1"] }).valid, false);
    assert.equal(analyzeTrade(s, { teamAId: 1, teamBId: 2, teamAPlayerIds: ["missing"], teamBPlayerIds: ["b-wr1"] }).valid, false);
  });

  it("keeps Questionable availability-eligible and IR structurally present", () => {
    const teams = baseTeams();
    teams[1]!.bench.push({ ...player("b-q", "WR", 25, "Questionable"), status: "Active" });
    teams[1]!.reserve.push({ ...player("b-ir", "WR", 5, "IR"), slot: "IR", status: "Inactive" });
    const q = analyzeTrade(snapshot(teams), {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-wr3"],
      teamBPlayerIds: ["b-q"],
    });
    assert.equal(q.valid, true);
    if (q.valid) assert.equal(q.teamA.availability.incoming[0]?.availability, "uncertain");
    const ir = analyzeTrade(snapshot(teams), {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-wr3"],
      teamBPlayerIds: ["b-ir"],
    });
    assert.equal(ir.valid, true);
    if (ir.valid) assert.equal(ir.teamA.availability.incoming[0]?.availability, "unavailable");
  });

  it("can change the optimized WR/FLEX allocation and surplus", () => {
    const result = analyzeTrade(snapshot(baseTeams()), {
      teamAId: 1,
      teamBId: 2,
      teamAPlayerIds: ["a-wr3"],
      teamBPlayerIds: ["b-wr1"],
    });
    assert.equal(result.valid, true);
    if (!result.valid) return;
    assert.ok(result.teamA.lineupChanges.some((change) => change.slot === "FLEX" || change.slot === "WR"));
  });

  it("does not mutate the snapshot", () => {
    const s = snapshot(baseTeams());
    const before = structuredClone(s.teams);
    analyzeTrade(s, { teamAId: 1, teamBId: 2, teamAPlayerIds: ["a-rb1"], teamBPlayerIds: ["b-wr1"] });
    assert.deepEqual(s.teams, before);
  });
});
