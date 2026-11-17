import type { QualityEvidence } from "../../../src/lib/sleeper/player-quality.ts";
export const now = "2026-11-16T12:00:00.000Z";
export function evidence(id = "free-1", rank: number | null = 20): QualityEvidence {
  return {
    player: {
      sleeperId: id,
      providerId: "fp-" + id,
      name: "Synthetic Receiver",
      position: "WR",
      identityResolved: true,
    },
    provider: "FantasyPros",
    season: 2026,
    rankingType: "ROS",
    scoring: "PPR",
    format: "redraft-1qb",
    pool: { id: "fantasypros:NFL:2026:ROS:PPR:redraft-1qb:ALL", kind: "overall", position: null },
    overallEcr: rank,
    positionalEcr: 10,
    sourceUpdatedAt: now,
    sourceAsOfDate: null,
    retrievedAt: now,
    sourceNote: "Synthetic test only",
  };
}
export function capture() {
  return {
    version: 1 as const,
    records: [{ evidence: evidence(), team: "TST" }],
    mappings: {},
    players: [],
  };
}
