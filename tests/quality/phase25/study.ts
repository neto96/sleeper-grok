import {
  evaluatePlayerQuality,
  type QualityEvidence,
  type QualityPolicy,
  type QualityStatus,
} from "../../../src/lib/sleeper/player-quality.ts";
import {
  calculateOptimalLineup,
  calculateRosterReplacementCost,
  parseRosterConfiguration,
  expandRosterSlots,
  buildWaiverAnalysis,
  type AnalysisRecord,
} from "../../../src/lib/sleeper/analysis/engine.ts";
import { assessAvailability } from "../../../src/lib/sleeper/analysis/availability.ts";
import { projectedWaivers } from "../../../src/lib/sleeper/waiver-valuation.ts";
import type { LeagueSnapshot, TeamRoster } from "../../../src/lib/sleeper/types.ts";
import type { QualityFixture } from "../report.ts";
export const curves = ["shiftedPower", "logarithmic", "percentile"] as const;
export const offense = ["QB", "RB", "WR", "TE"];
export type Capture = {
  fetchedAt: string;
  season: string;
  week: number;
  rosterSlots: string[];
  teams: TeamRoster[];
  legacyTeams: Record<
    string,
    {
      positions: Record<string, AnalysisRecord[]>;
      position_need?: AnalysisRecord;
      team_name?: string;
    }
  >;
  analysisWaiverPool?: AnalysisRecord[];
  league_position_scarcity?: AnalysisRecord;
  benchSlots?: number;
  projections?: LeagueSnapshot["projections"];
  provenance?: { sourceSha256: string };
  source?: string;
};
type Player = { id: string; name: string; position: string; record: AnalysisRecord };
type Slot = { slot: string; id: string | null };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ids = (a: Slot[]) => a.flatMap((x) => (x.id ? [x.id] : [])).sort();
const positions = (ps: Player[]) =>
  Object.fromEntries(
    offense.map((pos) => [
      pos,
      ps.filter((p) => p.position === pos).map((p) => ({ ...p.record, position: pos })),
    ]),
  );
const score = (p: Player) =>
  p.record.status === "Inactive" || p.record.injury_status === "IR"
    ? -1
    : ({ elite: 5, strong: 4, useful: 3, fringe: 2, deep_waiver: 1 }[
        String(p.record.fantasy_value_tier)
      ] ?? 0) *
        100 +
      Number(p.record.importance_score ?? 0);
const usable = (p: Player) =>
  assessAvailability({ ...p.record, position: p.position }).currently_usable;
const configured = (slots: string[]) =>
  expandRosterSlots(parseRosterConfiguration(slots)).filter((x) =>
    x.eligible_positions.some((p) => offense.includes(p)),
  );
function legacy(ps: Player[], slots: string[]) {
  const l = calculateOptimalLineup(positions(ps), parseRosterConfiguration(slots));
  const used: Record<string, number> = {};
  return configured(slots).map((s) => {
    const i = used[s.slot_code] ?? 0;
    used[s.slot_code] = i + 1;
    return { slot: s.slot_code, id: String(l[s.slot_code]?.[i]?.player_id ?? "") || null };
  });
}
/** Offline DP, maximizing index sum then slot coverage. Partial lineups stay explicitly incomplete. */
export function solve(ps: Player[], slots: string[], scores: Record<string, number>) {
  const config = configured(slots);
  if (config.length > 12) throw Error("Study slot limit exceeded");
  let states = new Map<number, { score: number; lineup: Slot[] }>([
    [0, { score: 0, lineup: config.map((s) => ({ slot: s.slot_code, id: null })) }],
  ]);
  for (const p of ps) {
    if (!Number.isFinite(scores[p.id])) throw Error("Unknown score");
    const next = new Map(states);
    for (const [mask, state] of states)
      config.forEach((slot, i) => {
        if (mask & (1 << i) || !slot.eligible_positions.includes(p.position)) return;
        const key = mask | (1 << i),
          value = state.score + scores[p.id];
        if (!next.has(key) || value > next.get(key)!.score + 1e-9) {
          const lineup = state.lineup.map((x) => ({ ...x }));
          lineup[i].id = p.id;
          next.set(key, { score: value, lineup });
        }
      });
    states = next;
  }
  const best = [...states].sort(
    (a, b) => b[1].score - a[1].score || ids(b[1].lineup).length - ids(a[1].lineup).length,
  )[0][1];
  return { ...best, complete: best.lineup.every((x) => x.id !== null) };
}
export function quality(ps: Player[], f: QualityFixture, policy: QualityPolicy) {
  return ps.map((p) => {
    const candidates = f.players
      .flatMap((x) => x.evidence)
      .filter((e) => e.pool.kind === "overall" && e.player.sleeperId === p.id);
    if (!candidates.length)
      return {
        id: p.id,
        position: p.position,
        status: "missing" as QualityStatus,
        indices: null,
        note: "No overall observation in retained reference; not proof provider omits player.",
      };
    if (candidates.length !== 1)
      return {
        id: p.id,
        position: p.position,
        status: "unsupported" as QualityStatus,
        indices: null,
        note: "Duplicate reference identity.",
      };
    const q = evaluatePlayerQuality(candidates[0], policy);
    if (candidates[0].player.position !== p.position)
      return {
        id: p.id,
        position: p.position,
        status: "identity_unresolved" as QualityStatus,
        indices: null,
        note: "Position crosswalk mismatch.",
      };
    return {
      id: p.id,
      position: p.position,
      status: q.status,
      indices: q.indices,
      note: q.notes.join(" "),
    };
  });
}
export function coverage(rows: ReturnType<typeof quality>) {
  const counts = { current: 0, missing: 0, stale: 0, unsupported: 0, identity_unresolved: 0 };
  for (const r of rows) counts[r.status]++;
  return {
    total: rows.length,
    counts,
    percent: Object.fromEntries(
      Object.entries(counts).map(([k, n]) => [k, rows.length ? (100 * n) / rows.length : 0]),
    ),
  };
}
const relations = (input: { id: string; loss: number }[]) => {
  const rows = [...input].sort((a, b) => a.id.localeCompare(b.id));
  return rows.flatMap((a, i) =>
    rows.slice(i + 1).map((b) => ({
      a: a.id,
      b: b.id,
      order: Math.abs(a.loss - b.loss) < 1e-8 ? 0 : Math.sign(a.loss - b.loss),
    })),
  );
};
const chain = (a: Slot[], b: Slot[]) =>
  a.flatMap((x, i) =>
    x.id === b[i].id ? [] : [{ slot: x.slot, ordinal: i + 1, from: x.id, to: b[i].id }],
  );
export function rosterStudy(c: Capture, t: TeamRoster, f: QualityFixture, policy: QualityPolicy) {
  const ps: Player[] = Object.entries(c.legacyTeams[String(t.rosterId)].positions)
    .filter(([pos]) => offense.includes(pos))
    .flatMap(([pos, rows]) =>
      rows.map((r) => ({
        id: String(r.player_id),
        name: String(r.name),
        position: pos,
        record: { ...r },
      })),
    );
  if (new Set(ps.map((p) => p.id)).size !== ps.length) throw Error("Duplicate roster identity");
  const q = quality(ps, f, policy),
    current = new Set(q.filter((x) => x.status === "current").map((x) => x.id));
  const baseline = legacy(ps, c.rosterSlots),
    available = legacy(ps.filter(usable), c.rosterSlots),
    legacyRemoval = calculateRosterReplacementCost(
      { positions: positions(ps) },
      parseRosterConfiguration(c.rosterSlots),
    );
  const complete = q.every((x) => x.status === "current"),
    starterCovered = baseline.every((x) => x.id !== null && current.has(x.id));
  const legacyObjective = (a: Slot[]) =>
    a.reduce((sum, x) => sum + (x.id ? score(ps.find((p) => p.id === x.id)!) : 0), 0);
  const baselineRows = legacyRemoval.map((r) => ({
    id: String(r.player_id),
    loss: Number(r.score_difference),
  }));
  const comparisons = curves.map((curve) => {
    if (!complete) return { curve, status: "blocked" as const, result: null };
    const scores = Object.fromEntries(q.map((x) => [x.id, x.indices![curve]]));
    // Hold structural eligibility constant for the objective comparison. Health and reserve/taxi use a separate view.
    const eligible = ps.filter((p) => score(p) >= 0),
      ros = solve(eligible, c.rosterSlots, scores),
      now = solve(ps.filter(usable), c.rosterSlots, scores);
    const removals = ps.map((p) => {
      const after = solve(
        eligible.filter((x) => x.id !== p.id),
        c.rosterSlots,
        scores,
      );
      return {
        id: p.id,
        loss: ros.score - after.score,
        replacements: ids(after.lineup).filter((id) => !ids(ros.lineup).includes(id)),
        chain: chain(ros.lineup, after.lineup),
        complete: after.complete,
      };
    });
    const changed = !same(ids(baseline), ids(ros.lineup)),
      slotsChanged = !same(baseline, ros.lineup);
    const tiesOnly =
      slotsChanged && Math.abs(legacyObjective(ros.lineup) - legacyObjective(baseline)) < 1e-8;
    // Cross-tier changes are descriptive; no causal cliff attribution is claimed.
    // A tier boundary alone is not enough to assert that it caused a choice.
    const boundaryPairs = chain(baseline, ros.lineup).filter(
      (x) =>
        x.from &&
        x.to &&
        ps.find((p) => p.id === x.from)!.record.fantasy_value_tier !==
          ps.find((p) => p.id === x.to)!.record.fantasy_value_tier,
    ).length;
    return {
      curve,
      status: "ready" as const,
      result: {
        lineup: ros.lineup,
        current: now.lineup,
        starterMembershipChanged: changed,
        slotAssignmentChanged: slotsChanged,
        tiesOnly,
        crossTierChanges: boundaryPairs,
        cliffCausation: "not established by observational rank differences",
        replacementOrderChanged: !same(relations(baselineRows), relations(removals)),
        availabilitySensitive: !same(ids(ros.lineup), ids(now.lineup)),
        removals,
      },
    };
  });
  const evaluated = comparisons.filter((x) => x.result !== null),
    curveSensitive =
      evaluated.length === 3
        ? new Set(
            evaluated.map((x) =>
              JSON.stringify({
                lineup: x.result!.lineup,
                current: x.result!.current,
                replacement: relations(x.result!.removals),
              }),
            ),
          ).size > 1
        : null;
  const counterfactuals = q
    .filter((x) => x.status === "current")
    .map((row) => {
      const before = baseline,
        after = legacy(
          ps.filter((p) => p.id !== row.id),
          c.rosterSlots,
        );
      return {
        id: row.id,
        name: ps.find((p) => p.id === row.id)!.name,
        legacyLoss: baselineRows.find((r) => r.id === row.id)!.loss,
        legacyReplacements: ids(after).filter((id) => !ids(before).includes(id)),
        legacyChain: chain(before, after),
        shadow: comparisons.map((x) => ({
          curve: x.curve,
          consequence: x.result?.removals.find((r) => r.id === row.id) ?? null,
        })),
        allCurvesAgree: complete
          ? new Set(
              comparisons.map((x) =>
                JSON.stringify(x.result!.removals.find((r) => r.id === row.id)!.chain),
              ),
            ).size === 1
          : null,
        reason: complete
          ? null
          : "Other roster candidates lack quality; removal consequence is not identifiable.",
      };
    });
  return {
    rosterId: t.rosterId,
    name: t.teamName,
    players: ps,
    quality: q,
    coverage: coverage(q),
    baseline,
    available,
    starterCovered,
    complete,
    legacyRemoval,
    comparisons,
    curveSensitive,
    availabilitySensitive: !same(ids(baseline), ids(available)),
    counterfactuals,
  };
}
export function overlap(a: string[], b: string[], k: number) {
  return a.slice(0, k).filter((id) => b.slice(0, k).includes(id)).length;
}
export function waiverStudy(
  c: Capture,
  roster: ReturnType<typeof rosterStudy>,
  f: QualityFixture,
  policy: QualityPolicy,
) {
  const raw = (c.analysisWaiverPool ?? []).filter((p) => offense.includes(String(p.position)));
  const ps = raw.map((r) => ({
      id: String(r.player_id),
      name: String(r.name),
      position: String(r.position),
      record: r,
    })),
    q = quality(ps, f, policy);
  const ranked = q.filter((x) => x.status === "current");
  const qualityOrders = curves.map((curve) => ({
    curve,
    ids: q
      .filter((x) => x.status === "current")
      .sort((a, b) => b.indices![curve] - a.indices![curve] || a.id.localeCompare(b.id))
      .map((x) => x.id),
  }));
  const structural = buildWaiverAnalysis(
    raw,
    { teams: c.legacyTeams, league_position_scarcity: c.league_position_scarcity ?? {} },
    roster.rosterId,
  ).candidates as AnalysisRecord[];
  const fullIds = structural.map((r) => String(r.player_id)),
    supported = new Set(ranked.map((x) => x.id)),
    common = fullIds.filter((id) => supported.has(id));
  const t = c.teams.find((t) => t.rosterId === roster.rosterId)!,
    active = [...t.starters, ...t.bench],
    capacity = c.rosterSlots.length + (c.benchSlots ?? 0);
  const dropCandidates = roster.legacyRemoval
    .filter((r) => active.some((p) => p.playerId === r.player_id))
    .sort(
      (a, b) =>
        Number(a.score_difference) - Number(b.score_difference) ||
        String(a.player_id).localeCompare(String(b.player_id)),
    );
  const drop =
    active.length === capacity ? String(dropCandidates[0]?.player_id ?? "") || null : null;
  const projection = c.projections
    ? projectedWaivers(
        { ...c, myRosterId: roster.rosterId } as unknown as LeagueSnapshot,
        drop,
        Date.parse(policy.now),
      )
    : null;
  const curveOrderAgreement = qualityOrders.every((x) => same(x.ids, qualityOrders[0].ids));
  const rosIds = curveOrderAgreement ? qualityOrders[0].ids : [],
    complete = q.length > 0 && q.every((x) => x.status === "current");
  const compareOrders = (a: string[], b: string[]) => ({
    topChoice: a.length && b.length ? a[0] === b[0] : null,
    top3: overlap(a, b, 3),
    top5: overlap(a, b, 5),
    denominator3: Math.min(3, a.length, b.length),
    denominator5: Math.min(5, a.length, b.length),
  });
  const topRos = ps.find((p) => p.id === rosIds[0]);
  const topProjection = projection?.rows.find((p) => p.delta !== null);
  const projectionComplete =
    projection?.status === "ready" &&
    projection.rows.length > 0 &&
    projection.rows.every((p) => p.delta !== null);
  const projectedCommonRows =
    projection?.rows.filter((p) => supported.has(p.playerId) && p.delta !== null) ?? [];
  const projectedCommon = projectedCommonRows.map((p) => p.playerId);
  const commonProjectionComplete =
    rosIds.length > 0 &&
    rosIds.every((id) => projection?.rows.some((p) => p.playerId === id && p.delta !== null));
  const winners = projectedCommonRows
    .filter((p) => Math.abs(p.delta! - projectedCommonRows[0].delta!) < 1e-8)
    .map((p) => p.playerId);
  const boundaryTie = (k: number) =>
    projectedCommonRows.length > k &&
    Math.abs(projectedCommonRows[k - 1].delta! - projectedCommonRows[k].delta!) < 1e-8;
  const projectedOverlap = commonProjectionComplete
    ? {
        ...compareOrders(rosIds, projectedCommon),
        topChoice: winners.includes(rosIds[0]),
        tiedWinners: winners,
        top3: boundaryTie(3) ? null : overlap(rosIds, projectedCommon, 3),
        top5: boundaryTie(5) ? null : overlap(rosIds, projectedCommon, 5),
      }
    : null;
  return {
    rosterId: roster.rosterId,
    coverage: coverage(q),
    qualityOrders,
    curveOrderAgreement,
    structuralTop5: fullIds.slice(0, 5),
    globalComparison: complete ? compareOrders(fullIds, rosIds) : null,
    commonSubset: { size: common.length, ...compareOrders(common, rosIds) },
    drop,
    projectionStatus: projection?.status ?? "unavailable",
    projectionReason: projection?.reason ?? null,
    projectionComplete,
    projectedTop: projectionComplete ? topProjection : null,
    projectedKnownLeader: topProjection ?? null,
    projectedCommon: projectedOverlap,
    rosSubsetLeader: topRos?.name ?? null,
    rosLeaderHealth: topRos ? assessAvailability(topRos.record) : null,
    rosLeaderBye: topRos
      ? c.projections?.players
          .find((p) => p.playerId === topRos.id)
          ?.weeks.find((w) => w.week === c.week)?.status === "bye"
      : null,
    unscoredProjectedRows: projection?.rows.filter((x) => x.delta === null).length ?? 0,
  };
}
export function runStudy(c: Capture, f: QualityFixture, policy: QualityPolicy = f.policy) {
  const rosters = c.teams.map((t) => rosterStudy(c, t, f, policy));
  const rows = rosters.flatMap((r) => r.quality);
  if (new Set(rows.map((x) => x.id)).size !== rows.length) throw Error("Player rostered twice");
  const waivers = c.analysisWaiverPool ? rosters.map((r) => waiverStudy(c, r, f, policy)) : [];
  const waiverQuality = quality(
    (c.analysisWaiverPool ?? [])
      .filter((p) => offense.includes(String(p.position)))
      .map((p) => ({
        id: String(p.player_id),
        name: String(p.name),
        position: String(p.position),
        record: p,
      })),
    f,
    policy,
  );
  const counts = {
    rosters: rosters.length,
    fullyCovered: rosters.filter((r) => r.complete).length,
    startingLineupsCovered: rosters.filter((r) => r.starterCovered).length,
    curveSensitive: rosters.filter((r) => r.curveSensitive === true).length,
    curveBlocked: rosters.filter((r) => r.curveSensitive === null).length,
    legacyAvailabilitySensitive: rosters.filter((r) => r.availabilitySensitive).length,
  };
  const curveMetrics = curves.map((curve) => {
    const valid = rosters.flatMap((r) =>
      r.comparisons.filter((c) => c.curve === curve && c.result !== null).map((c) => c.result!),
    );
    return {
      curve,
      evaluable: valid.length,
      blocked: rosters.length - valid.length,
      starterChanges: valid.length ? valid.filter((v) => v.starterMembershipChanged).length : null,
      slotChanges: valid.length ? valid.filter((v) => v.slotAssignmentChanged).length : null,
      replacementChanges: valid.length
        ? valid.filter((v) => v.replacementOrderChanged).length
        : null,
      tiesOnly: valid.length ? valid.filter((v) => v.tiesOnly).length : null,
      crossTierChanges: valid.length ? valid.reduce((n, v) => n + v.crossTierChanges, 0) : null,
      causalCliffs: null,
      availabilitySensitive: valid.length
        ? valid.filter((v) => v.availabilitySensitive).length
        : null,
    };
  });
  return {
    curveMetrics,
    capture: c.fetchedAt,
    week: c.week,
    policy,
    coverage: coverage(rows),
    positions: Object.fromEntries(
      offense.map((pos) => [pos, coverage(rows.filter((r) => r.position === pos))]),
    ),
    waiverPositions: Object.fromEntries(
      offense.map((pos) => [pos, coverage(waiverQuality.filter((r) => r.position === pos))]),
    ),
    counts,
    rosters,
    waivers,
  };
}
