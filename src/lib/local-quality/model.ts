/** Shared reference-evidence adapter. No provider I/O or decision consumers. */
import { z } from "zod";
import {
  evaluatePlayerQuality,
  type QualityEvidence,
  type QualityStatus,
} from "../sleeper/player-quality.ts";
import type { LeagueSnapshot } from "../sleeper/types.ts";
const external = z.object({
  yahoo: z.string().min(1).optional(),
  espn: z.string().min(1).optional(),
});
const person = z.object({
  sleeperId: z.string().min(1),
  name: z.string().min(1),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  team: z.string().nullable(),
  externalIds: external.optional(),
});
const status = z.enum(["current", "stale", "missing", "identity_unresolved", "unsupported"]);
const envelope = z.object({
  version: z.literal(1),
  records: z
    .array(
      z.object({
        evidence: z.unknown(),
        team: z.string().nullable(),
        externalIds: external.optional(),
        qualityStatus: status.optional(),
      }),
    )
    .max(5000),
  mappings: z.record(z.string().min(1), z.string().min(1)).default({}),
  players: z.array(person).max(10000).default([]),
});
export type Person = z.infer<typeof person>;
export type LocalRecord = {
  evidence: QualityEvidence;
  team: string | null;
  externalIds?: z.infer<typeof external>;
  qualityStatus?: QualityStatus;
};
export type LocalCapture = {
  version: 1;
  records: LocalRecord[];
  mappings: Record<string, string>;
  players: Person[];
};
export function normalizeCapture(input: unknown, now = new Date().toISOString()): LocalCapture {
  const x = envelope.parse(input);
  const records = x.records.map((r) => {
    const q = evaluatePlayerQuality(r.evidence, {
      season: new Date(now).getUTCFullYear(),
      now,
      maxAgeHours: 72,
    });
    if (!q.evidence) throw Error("Malformed quality evidence");
    return {
      ...r,
      evidence: { ...q.evidence, sourceNote: "Manually supplied local research capture." },
    };
  });
  return { version: 1, records, mappings: x.mappings, players: x.players };
}
const name = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const team = (s: string | null) => s?.trim().toUpperCase() || null;
/** Exact, auditable matches only; ambiguity and conflicting bridges fail closed. */
export function resolveIdentity(r: LocalRecord, c: LocalCapture, people: Person[]): string | null {
  const p = r.evidence.player;
  const mapped =
    p.providerId && Object.hasOwn(c.mappings, p.providerId) ? c.mappings[p.providerId] : undefined;
  if (mapped && p.sleeperId && mapped !== p.sleeperId) return null;
  const explicit = mapped ?? (p.identityResolved ? p.sleeperId : null);
  if (explicit) {
    const found = people.filter((x) => x.sleeperId === explicit);
    return found.length === 1 && found[0].position === p.position ? explicit : null;
  }
  const matches = (["yahoo", "espn"] as const).flatMap((k) =>
    r.externalIds?.[k] ? people.filter((x) => x.externalIds?.[k] === r.externalIds![k]) : [],
  );
  if (matches.length)
    return new Set(matches.map((x) => x.sleeperId)).size === 1 &&
      matches.every((x) => x.position === p.position)
      ? matches[0].sleeperId
      : null;
  const exact = people.filter(
    (x) =>
      name(x.name) === name(p.name) &&
      x.position === p.position &&
      team(r.team) !== null &&
      team(r.team) === team(x.team),
  );
  return exact.length === 1 ? exact[0].sleeperId : null;
}
function resolveAll(c: LocalCapture, people: Person[]) {
  const ids = c.records.map((r) => resolveIdentity(r, c, people));
  return ids.map((id, i) => {
    if (!id) return null;
    const provider = c.records[i].evidence.player.providerId;
    return c.records.some(
      (r, j) =>
        j !== i &&
        ids[j] !== null &&
        ((r.evidence.player.providerId === provider && ids[j] !== id) ||
          (ids[j] === id && r.evidence.player.providerId !== provider)),
    )
      ? null
      : id;
  });
}
export function mappingSummary(c: LocalCapture) {
  const mapped = resolveAll(c, c.players).filter((x) => x !== null).length;
  return { records: c.records.length, mapped, unresolved: c.records.length - mapped };
}
export function rosAssets(c: LocalCapture, s: LeagueSnapshot, now = new Date().toISOString()) {
  const rosteredPlayers = s.teams.flatMap((t) => [
    ...t.starters,
    ...t.bench,
    ...t.reserve,
    ...t.taxi,
  ]);
  const rostered = new Set(rosteredPlayers.map((p) => p.playerId));
  const pool = (s.analysisWaiverPool ?? []).filter(
    (p) =>
      ["QB", "RB", "WR", "TE"].includes(String(p.position)) && !rostered.has(String(p.player_id)),
  );
  const people: Person[] = pool.map((p) => ({
    sleeperId: String(p.player_id),
    name: String(p.name),
    position: p.position as Person["position"],
    team: typeof p.team === "string" ? p.team : null,
  }));
  const all: Person[] = [
    ...people,
    ...rosteredPlayers
      .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
      .map((p) => ({
        sleeperId: p.playerId,
        name: p.name,
        position: p.position as Person["position"],
        team: p.nflTeam,
      })),
  ];
  for (const p of all) {
    const matches = c.players.filter((x) => x.sleeperId === p.sleeperId);
    if (matches.length === 1) p.externalIds = matches[0].externalIds;
  }
  const resolved = resolveAll(c, all);
  const diagnostics = { unresolved: 0, stale: 0, missing: 0, unsupported: 0, positionalOnly: 0 };
  const rows: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    rank: number;
    positionalRank: number | null;
    status: "current";
    freshness: string;
    asOf: string;
  }[] = [];
  const supported =
    s.scoring === "PPR" &&
    !s.rosterSlots.some((x) => ["SUPER_FLEX", "OP"].includes(x)) &&
    s.rosterSlots.filter((x) => x === "QB").length === 1;
  c.records.forEach((r, i) => {
    const id = resolved[i],
      e = r.evidence;
    if (!id) {
      diagnostics.unresolved++;
      return;
    }
    const p = people.find((x) => x.sleeperId === id);
    if (!p) return;
    const q = evaluatePlayerQuality(
      { ...e, player: { ...e.player, sleeperId: id, identityResolved: true } },
      { season: Number(s.season), now, maxAgeHours: 72 },
    );
    const duplicate = c.records.some(
      (other, j) => j !== i && resolved[j] === id && other.evidence.pool.id === e.pool.id,
    );
    if (
      !supported ||
      duplicate ||
      q.status === "unsupported" ||
      r.qualityStatus === "unsupported"
    ) {
      diagnostics.unsupported++;
      return;
    }
    if (r.qualityStatus === "identity_unresolved") {
      diagnostics.unresolved++;
      return;
    }
    if (e.pool.kind !== "overall") {
      diagnostics.positionalOnly++;
      return;
    }
    if (q.status === "missing" || r.qualityStatus === "missing") {
      diagnostics.missing++;
      return;
    }
    if (q.status === "stale" || r.qualityStatus === "stale") {
      diagnostics.stale++;
      return;
    }
    if (q.status !== "current" || e.overallEcr === null) {
      diagnostics.unresolved++;
      return;
    }
    rows.push({
      id,
      name: p.name,
      position: p.position,
      team: p.team,
      rank: e.overallEcr,
      positionalRank: e.positionalEcr,
      status: "current",
      freshness:
        q.freshnessBasis === "retrieval_only"
          ? "retrieval only"
          : q.freshnessBasis === "source_asof_and_retrieval"
            ? "source date"
            : "source updated",
      asOf: e.sourceUpdatedAt ?? e.sourceAsOfDate ?? e.retrievedAt,
    });
  });
  rows.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows, diagnostics, available: new Set(people.map((p) => p.sleeperId)).size };
}
