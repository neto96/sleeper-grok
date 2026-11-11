/** Invented controls only. Never a reconstructed league or observed provider dataset. */
import { readFileSync } from "node:fs";
import type { Capture } from "./study.ts";
import type { QualityFixture } from "../report.ts";
import {
  fantasyValueTier,
  fantasyImportanceScore,
} from "../../../src/lib/sleeper/analysis/engine.ts";
export const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/phase25-synthetic-quality.json", import.meta.url), "utf8"),
) as QualityFixture;
export function control(): Capture {
  const players = fixture.players.map((x) => ({
    playerId: x.evidence[0].player.sleeperId!,
    name: x.name,
    position: x.evidence[0].player.position,
    slot: "BN",
    status: "Active",
    injuryStatus: null,
    nflTeam: null,
    number: null,
    searchRank: x.legacy.searchRank,
  }));
  const positions = Object.fromEntries(
    ["QB", "RB", "WR", "TE"].map((pos) => [
      pos,
      players
        .filter((p) => p.position === pos)
        .map((p) => {
          const tier = fantasyValueTier({ search_rank: p.searchRank });
          return {
            player_id: p.playerId,
            name: p.name,
            status: "Active",
            injury_status: null,
            roster_status: "bench",
            fantasy_value_tier: tier,
            importance_score: fantasyImportanceScore({
              fantasy_value_tier: tier,
              roster_status: "bench",
            }),
          };
        }),
    ]),
  );
  return {
    fetchedAt: fixture.policy.now,
    season: "2026",
    week: 10,
    rosterSlots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"],
    benchSlots: 6,
    teams: [
      {
        rosterId: 101,
        teamName: "Synthetic A",
        starters: [],
        bench: players,
        reserve: [],
        taxi: [],
      },
    ],
    legacyTeams: { "101": { positions } },
    analysisWaiverPool: [],
  } as unknown as Capture;
}
export function incomplete(): Capture {
  const c = control();
  const unknown = {
    ...c.teams[0].bench[0],
    playerId: "synthetic-missing",
    name: "Synthetic missing",
  };
  c.teams[0].bench.push(unknown);
  c.legacyTeams["101"].positions.QB.push({
    ...c.legacyTeams["101"].positions.QB[0],
    player_id: unknown.playerId,
    name: unknown.name,
  });
  return c;
}
export function waiverControl(): Capture {
  const c = control();
  c.rosterSlots = ["WR"];
  c.benchSlots = 1;
  c.teams[0].bench = [c.teams[0].bench[4]];
  c.legacyTeams["101"].positions = { WR: [c.legacyTeams["101"].positions.WR[0]] };
  c.analysisWaiverPool = fixture.players
    .slice(9)
    .map((p) => ({
      player_id: p.evidence[0].player.sleeperId!,
      name: p.name,
      position: "WR",
      status: "Active",
      injury_status: null,
      search_rank: p.legacy.searchRank,
    }));
  const ids = [
    c.teams[0].bench[0].playerId,
    ...c.analysisWaiverPool.map((p) => String(p.player_id)),
  ];
  c.projections = {
    available: true,
    reason: null,
    fetchedAt: fixture.policy.now,
    season: "2026",
    fromWeek: 10,
    throughWeek: 10,
    policy: "core-offense-v1",
    exclusions: [],
    championshipVerified: false,
    weekStartCutoffs: { 10: Date.parse("2026-11-12T00:00:00Z") },
    weeks: [],
    players: ids.map((id, i) => ({
      playerId: id,
      injuryStatus: null,
      weeks: [
        {
          week: 10,
          status: i === 1 ? "bye" : "covered",
          points: i === 1 ? null : i === 0 ? 1 : i === 4 ? 20 : 5,
          updatedAt: Date.parse(fixture.policy.now),
        },
      ],
    })),
  } as unknown as NonNullable<Capture["projections"]>;
  c.projections!.weeks = [
    {
      week: 10,
      points: Object.fromEntries(
        c.projections!.players.map((p) => [p.playerId, p.weeks[0].points!]),
      ),
    },
  ];
  return c;
}
