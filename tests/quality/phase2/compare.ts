import {
  evaluatePlayerQuality,
  type ExperimentalIndices,
  type QualityPolicy,
} from "../../../src/lib/sleeper/player-quality.ts";
import {
  calculateOptimalLineup,
  calculateRosterReplacementCost,
  calculateRosterSurplus,
  calculatePlayerProtection,
  parseRosterConfiguration,
  expandRosterSlots,
  buildWaiverAnalysis,
  fantasyValueTier,
  fantasyImportanceScore,
  type AnalysisRecord,
} from "../../../src/lib/sleeper/analysis/engine.ts";
import { assessAvailability } from "../../../src/lib/sleeper/analysis/availability.ts";
import { compareProjectedRosters } from "../../../src/lib/sleeper/projected-valuation.ts";
import type { Scenario, Subject } from "./scenarios.ts";
export const curves = ["shiftedPower", "logarithmic", "percentile"] as const;
type Curve = keyof ExperimentalIndices;
export const taxonomy = {
  legacy_flattening: "Equal legacy scores conceal different overall ECR evidence.",
  legacy_cliff: "Controlled adjacent search-rank boundary changes the legacy tier objective.",
  quality_vs_availability:
    "ROS asset retention differs from current usability; quality is not discounted.",
  quality_vs_roster_fit: "Best asset or package direction differs from legal lineup consequence.",
  missing_quality:
    "At least one required record is missing, stale, unresolved, unsupported, or from an incompatible pool.",
  replacement_pool_effect:
    "Removal consequence depends on eligible replacements in this specific roster.",
  forced_drop_effect:
    "Roster capacity requires cuts; selected cuts or unresolved cuts change interpretation.",
  curve_sensitive: "At least one discrete decision or asset-direction sign differs across curves.",
  no_material_difference:
    "No observed membership, slot, top-choice or asset-direction disagreement.",
} as const;
type Category = keyof typeof taxonomy;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (ids: string[]) => [...ids].sort();
const sign = (n: number) => (Math.abs(n) < 1e-9 ? "flat" : n > 0 ? "gain" : "loss");
export function record(p: Subject): AnalysisRecord {
  const tier = fantasyValueTier({ search_rank: p.searchRank });
  return {
    player_id: p.id,
    name: p.name,
    position: p.position,
    search_rank: p.searchRank,
    status: p.status,
    injury_status: p.injuryStatus,
    roster_status: "bench",
    fantasy_value_tier: tier,
    importance_score: fantasyImportanceScore({ fantasy_value_tier: tier, roster_status: "bench" }),
  };
}
const structural = (p: Subject) => {
  const r = record(p);
  if (p.status === "Inactive" || p.injuryStatus === "IR") return -1;
  return (
    fantasyImportanceScore({ ...r, roster_status: "reserve" }) * 100 + Number(r.importance_score)
  );
};
const eligibleNow = (p: Subject) => assessAvailability(record(p)).currently_usable;
const positions = (players: Subject[]) =>
  Object.fromEntries(
    ["QB", "RB", "WR", "TE"].map((pos) => [
      pos,
      players.filter((p) => p.position === pos).map(record),
    ]),
  );
type Assignment = { slot: string; id: string | null };
const flatten = (lineup: Record<string, AnalysisRecord[]>, slots: string[]): Assignment[] => {
  const used: Record<string, number> = {};
  return slots.map((slot) => {
    const index = used[slot] ?? 0;
    used[slot] = index + 1;
    return { slot, id: String(lineup[slot]?.[index]?.player_id ?? "") || null };
  });
};
function configured(slots: string[]) {
  return expandRosterSlots(parseRosterConfiguration(slots)).filter(
    (s) => s.slot_type === "direct" || s.slot_type === "flex",
  );
}
/** Small-fixture exhaustive solver. Maximize sum, then filled slots; deterministic input-order ties.
 * ROS mode ignores availability deliberately; current mode applies the existing availability predicate.
 * Never called by production. Incompatible/incomplete evidence is rejected before this solver.
 */
export function optimize(
  players: Subject[],
  slots: string[],
  scores: Record<string, number>,
  usable = false,
) {
  const config = configured(slots);
  let best = -Infinity,
    filledBest = -1,
    result: Assignment[] = [];
  function visit(i: number, total: number, used: Set<string>, a: Assignment[]) {
    if (i === config.length) {
      if (total > best + 1e-9 || (Math.abs(total - best) <= 1e-9 && used.size > filledBest)) {
        best = total;
        filledBest = used.size;
        result = a.slice();
      }
      return;
    }
    const slot = config[i];
    for (const p of players) {
      if (
        used.has(p.id) ||
        !slot.eligible_positions.includes(p.position) ||
        (usable && !eligibleNow(p))
      )
        continue;
      if (!Number.isFinite(scores[p.id])) throw Error("Missing shadow score");
      used.add(p.id);
      a.push({ slot: slot.slot_code, id: p.id });
      visit(i + 1, total + scores[p.id], used, a);
      a.pop();
      used.delete(p.id);
    }
    a.push({ slot: slot.slot_code, id: null });
    visit(i + 1, total, used, a);
    a.pop();
  }
  visit(0, 0, new Set(), []);
  return { score: best, lineup: result };
}
const ids = (a: Assignment[]) => a.flatMap((x) => (x.id ? [x.id] : []));
const total = (a: Assignment[], scores: Record<string, number>) =>
  ids(a).reduce((s, id) => s + scores[id], 0);
const direction = (a: Subject[], b: Subject[], scores: Record<string, number>) =>
  b.reduce((s, p) => s + scores[p.id], 0) - a.reduce((s, p) => s + scores[p.id], 0);
function legacyRoster(s: Scenario) {
  const config = parseRosterConfiguration(s.slots),
    pos = positions(s.roster);
  const lineup = calculateOptimalLineup(pos, config),
    replacement = calculateRosterReplacementCost({ positions: pos }, config);
  const surplus = calculateRosterSurplus({ positions: pos, optimal_lineup: lineup }, config);
  const protect = calculatePlayerProtection({
    roster_surplus: surplus,
    roster_replacement_cost: replacement,
  });
  const slotNames = configured(s.slots).map((x) => x.slot_code);
  return {
    lineup: flatten(lineup, slotNames),
    current: flatten(
      calculateOptimalLineup(positions(s.roster.filter(eligibleNow)), config),
      slotNames,
    ),
    replacement,
    surplus: surplus.filter((p) => p.surplus_type !== "needed").map((p) => String(p.player_id)),
    protect: protect.filter((p) => p.protection === "protect").map((p) => String(p.player_id)),
    protectionRows: protect,
  };
}
function projected(before: Subject[], after: Subject[], s: Scenario, required = 0) {
  return compareProjectedRosters(
    before.map((p) => ({ playerId: p.id, position: p.position, slot: "BN" })),
    after.map((p) => ({ playerId: p.id, position: p.position, slot: "BN" })),
    s.slots,
    [{ week: 10, points: s.points }],
    required,
  );
}
export function compareScenario(s: Scenario, policy: QualityPolicy) {
  if (!Number.isInteger(s.capacity) || s.capacity < s.roster.length || s.slots.length > s.capacity)
    throw Error("Invalid scenario capacity");
  if (s.kind === "trade" && (!s.outgoing.length || !s.incoming.length))
    throw Error("Empty trade side");
  const all = [...s.roster, ...s.incoming];
  if (new Set(all.map((p) => p.id)).size !== all.length) throw Error("Duplicate scenario identity");
  if (s.slots.some((x) => !["QB", "RB", "WR", "TE", "FLEX"].includes(x)))
    throw Error("Unsupported research slots");
  if (
    s.outgoing.some((id) => !s.roster.some((p) => p.id === id)) ||
    new Set(s.outgoing).size !== s.outgoing.length
  )
    throw Error("Invalid outgoing selection");
  const evaluation = all.map((p) => ({
    id: p.id,
    result: evaluatePlayerQuality(
      p.evidence,
      s.stale ? { ...policy, now: "2026-11-15T14:00:00Z" } : policy,
    ),
  }));
  const poolIds = new Set(evaluation.map((x) => x.result.evidence?.pool.id));
  const blocked = evaluation
    .filter(
      (x) =>
        x.result.status !== "current" ||
        x.result.evidence?.pool.kind !== "overall" ||
        x.result.evidence.player.sleeperId !== x.id ||
        x.result.evidence.player.position !== all.find((p) => p.id === x.id)!.position,
    )
    .map((x) => ({
      id: x.id,
      status: x.result.status === "current" ? "incompatible_pool_or_identity" : x.result.status,
    }));
  if (poolIds.size !== 1 && !blocked.length)
    blocked.push({ id: "pool", status: "incompatible_pool" });
  const legacy = legacyRoster(s);
  const legacyScores = Object.fromEntries(all.map((p) => [p.id, structural(p)]));
  const afterBeforeCuts = [...s.roster.filter((p) => !s.outgoing.includes(p.id)), ...s.incoming];
  const required = s.kind === "trade" ? Math.max(0, afterBeforeCuts.length - s.capacity) : 0;
  if (
    new Set(s.drops).size !== s.drops.length ||
    s.drops.length > required ||
    s.drops.some((id) => !afterBeforeCuts.some((p) => p.id === id))
  )
    throw Error("Invalid cut selection");
  const after = afterBeforeCuts.filter((p) => !s.drops.includes(p.id));
  const unmet = required - s.drops.length;
  const sentLegacy = s.roster.filter((p) => s.outgoing.includes(p.id));
  const legacyAssetGross = direction(sentLegacy, s.incoming, legacyScores);
  const legacyAssetNet = legacyAssetGross - s.drops.reduce((n, id) => n + legacyScores[id], 0);
  const legacyTrade =
    s.kind === "trade"
      ? {
          gross: legacyAssetGross,
          net: unmet ? null : legacyAssetNet,
          direction: unmet ? "unresolved_cuts" : sign(legacyAssetNet),
        }
      : null;
  const projection = s.kind === "trade" ? projected(s.roster, after, s, unmet) : null;
  const preCutProjection = s.kind === "trade" ? projected(s.roster, afterBeforeCuts, s) : null;
  const waiverLegacy =
    s.kind === "waiver"
      ? (buildWaiverAnalysis(
          s.incoming.map(record),
          {
            teams: { "1": { team_name: "Synthetic", position_need: { WR: { need: "high" } } } },
            league_position_scarcity: { WR: { scarcity: "moderate" } },
          },
          1,
        ).candidates as AnalysisRecord[])
      : [];
  const waiverProjection =
    s.kind === "waiver"
      ? s.incoming
          .map((p) => ({
            id: p.id,
            ...projected(
              s.roster,
              [...s.roster, p],
              s,
              Math.max(0, s.roster.length + 1 - s.capacity),
            ),
          }))
          .sort(
            (a, b) =>
              (b.meanDelta ?? -Infinity) - (a.meanDelta ?? -Infinity) || a.id.localeCompare(b.id),
          )
      : [];
  const waiverProjectionStatus =
    s.kind !== "waiver"
      ? "not_applicable"
      : s.roster.length >= s.capacity
        ? "unsupported: select a legal drop before comparing"
        : !waiverProjection.length || waiverProjection.some((row) => row.meanDelta === null)
          ? "unsupported: complete comparable projections required for every candidate"
          : "ready";
  const projectedTopIds =
    waiverProjectionStatus === "ready"
      ? waiverProjection
          .filter((row) => Math.abs(row.meanDelta! - waiverProjection[0].meanDelta!) < 1e-9)
          .map((row) => row.id)
      : [];
  const categories: Category[] = [];
  if (s.cliff) categories.push("legacy_cliff");
  if (
    all.some((a, i) =>
      all
        .slice(i + 1)
        .some(
          (b) =>
            structural(a) === structural(b) &&
            a.evidence.overallEcr !== null &&
            b.evidence.overallEcr !== null &&
            a.evidence.overallEcr !== b.evidence.overallEcr,
        ),
    )
  )
    categories.push("legacy_flattening");
  if (all.some((p) => !eligibleNow(p)) || Object.values(s.points).includes(null))
    categories.push("quality_vs_availability");
  if (blocked.length) categories.push("missing_quality");
  if (required) categories.push("forced_drop_effect");
  const comparisons = blocked.length
    ? []
    : curves.map((curve) => {
        const scores = Object.fromEntries(evaluation.map((x) => [x.id, x.result.indices![curve]]));
        const ros = optimize(s.roster, s.slots, scores),
          current = optimize(s.roster, s.slots, scores, true);
        const replacement = s.roster.map((p) => ({
          id: p.id,
          loss:
            ros.score -
            optimize(
              s.roster.filter((q) => q.id !== p.id),
              s.slots,
              scores,
            ).score,
        }));
        const protect = ids(ros.lineup),
          surplus = s.roster.filter((p) => !protect.includes(p.id)).map((p) => p.id);
        const changes = ros.lineup.flatMap((a, i) =>
          a.id === legacy.lineup[i].id
            ? []
            : [
                {
                  slot: a.slot,
                  ordinal: i + 1,
                  displaced: legacy.lineup[i].id,
                  incoming: a.id,
                  consequence: "starter_change",
                  legacyScoreDifference:
                    (a.id ? legacyScores[a.id] : 0) -
                    (legacy.lineup[i].id ? legacyScores[legacy.lineup[i].id!] : 0),
                  qualityIndexDifference:
                    (a.id ? scores[a.id] : 0) -
                    (legacy.lineup[i].id ? scores[legacy.lineup[i].id!] : 0),
                },
              ],
        );
        const waiver = s.incoming
          .map((p) => ({ id: p.id, index: scores[p.id] }))
          .sort((a, b) => b.index - a.index || a.id.localeCompare(b.id));
        const sent = s.roster.filter((p) => s.outgoing.includes(p.id));
        const cut = afterBeforeCuts.filter((p) => s.drops.includes(p.id));
        const assetDelta = direction(sent, s.incoming, scores),
          netAssetDelta = assetDelta - cut.reduce((n, p) => n + scores[p.id], 0);
        const trade =
          s.kind === "trade"
            ? {
                grossAssetDelta: assetDelta,
                grossDirection: sign(assetDelta),
                netAssetDelta: unmet ? null : netAssetDelta,
                netDirection: unmet ? "unresolved_cuts" : sign(netAssetDelta),
                bestOutgoing: Math.max(...sent.map((p) => scores[p.id])),
                bestIncoming: Math.max(...s.incoming.map((p) => scores[p.id])),
                cutIndex: cut.reduce((n, p) => n + scores[p.id], 0),
              }
            : null;
        const replacementOrder = sorted(s.roster.map((p) => p.id)).sort(
          (a, b) =>
            replacement.find((p) => p.id === b)!.loss - replacement.find((p) => p.id === a)!.loss,
        );
        // Observable consequences; magnitude alone never makes a scenario material.
        const effects = {
          lineup: !equal(legacy.lineup, ros.lineup),
          currentLineup: !equal(legacy.current, current.lineup),
          protect: !equal(sorted(legacy.protect), sorted(protect)),
          surplus: !equal(sorted(legacy.surplus), sorted(surplus)),
          replacement: s.roster.some((a, i) =>
            s.roster
              .slice(i + 1)
              .some(
                (b) =>
                  sign(
                    Number(legacy.replacement.find((p) => p.player_id === a.id)!.score_difference) -
                      Number(
                        legacy.replacement.find((p) => p.player_id === b.id)!.score_difference,
                      ),
                  ) !==
                  sign(
                    replacement.find((p) => p.id === a.id)!.loss -
                      replacement.find((p) => p.id === b.id)!.loss,
                  ),
              ),
          ),
          waiver: s.kind === "waiver" && waiverLegacy[0]?.player_id !== waiver[0]?.id,
          trade:
            s.kind === "trade" &&
            trade!.netDirection !==
              sign(
                direction(sent, s.incoming, legacyScores) -
                  cut.reduce((n, p) => n + legacyScores[p.id], 0),
              ),
        };
        return {
          curve,
          ros,
          current,
          replacement,
          replacementOrder,
          protect,
          surplus,
          changes,
          legacyObjectiveDifference:
            total(ros.lineup, legacyScores) - total(legacy.lineup, legacyScores),
          qualityObjectiveDifference: ros.score - total(legacy.lineup, scores),
          waiver,
          trade,
          effects,
        };
      });
  const signatures = comparisons.map((c) =>
    JSON.stringify(
      s.kind === "roster"
        ? {
            lineup: c.ros.lineup,
            current: c.current.lineup,
            protect: sorted(c.protect),
            surplus: sorted(c.surplus),
            replacement: c.replacementOrder,
          }
        : s.kind === "waiver"
          ? c.waiver.map((x) => x.id)
          : { gross: c.trade!.grossDirection, net: c.trade!.netDirection },
    ),
  );
  const stabilityFor = (values: unknown[], magnitude = false) =>
    blocked.length
      ? "unsupported because evidence missing/stale/incompatible"
      : new Set(values.map((v) => JSON.stringify(v))).size > 1
        ? "curve-sensitive"
        : magnitude
          ? "same direction, different magnitude"
          : "same under all curves";
  const decisionStability =
    s.kind === "roster"
      ? {
          lineup: stabilityFor(comparisons.map((c) => c.ros.lineup)),
          currentLineup: stabilityFor(comparisons.map((c) => c.current.lineup)),
          replacement: stabilityFor(
            comparisons.map((c) => c.replacementOrder),
            true,
          ),
          protect: stabilityFor(comparisons.map((c) => sorted(c.protect))),
          surplus: stabilityFor(comparisons.map((c) => sorted(c.surplus))),
        }
      : s.kind === "waiver"
        ? {
            rosWaiverOrder: stabilityFor(comparisons.map((c) => c.waiver.map((p) => p.id))),
          }
        : {
            grossAssetDirection: stabilityFor(
              comparisons.map((c) => c.trade!.grossDirection),
              true,
            ),
            netAssetDirection: unmet
              ? "unsupported until required cuts are selected"
              : stabilityFor(
                  comparisons.map((c) => c.trade!.netDirection),
                  true,
                ),
          };
  const sensitive = new Set(signatures).size > 1;
  const material =
    comparisons.some((c) =>
      s.kind === "roster"
        ? Object.entries(c.effects).some(([k, v]) => k !== "replacement" && v)
        : s.kind === "waiver"
          ? c.effects.waiver ||
            (waiverProjectionStatus === "ready" && !projectedTopIds.includes(c.waiver[0]?.id))
          : c.effects.trade,
    ) || required > 0;
  if (sensitive) categories.push("curve_sensitive");
  if (
    comparisons.some(
      (c) =>
        s.kind === "roster" &&
        c.replacement.some((r) => r.loss > 0) &&
        s.roster.length > s.slots.length,
    )
  )
    categories.push("replacement_pool_effect");
  if (
    comparisons.some(
      (c) =>
        s.kind === "trade" &&
        projection?.meanDelta != null &&
        c.trade!.netAssetDelta !== null &&
        c.trade!.netDirection !== sign(projection.meanDelta),
    ) ||
    (s.kind === "waiver" &&
      waiverProjectionStatus === "ready" &&
      comparisons.some((c) => !projectedTopIds.includes(c.waiver[0]?.id)))
  )
    categories.push("quality_vs_roster_fit");
  if (!material && !blocked.length) categories.push("no_material_difference");
  const stability = blocked.length
    ? "unsupported because evidence missing/stale/incompatible"
    : sensitive
      ? "curve-sensitive"
      : s.kind === "trade"
        ? "same direction, different magnitude"
        : "same under all curves";
  const outcome = blocked.length
    ? "blocked"
    : sensitive
      ? "curve-sensitive"
      : material
        ? "materially different"
        : "unchanged";
  return {
    id: s.id,
    kind: s.kind,
    note: s.note,
    names: Object.fromEntries(all.map((p) => [p.id, p.name])),
    legacy,
    legacyTrade,
    legacyScores,
    comparisons,
    blocked,
    requiredDrops: required,
    selectedDrops: s.drops,
    remainingRequiredDrops: unmet,
    openSpots: s.kind === "trade" ? Math.max(0, s.capacity - after.length) : 0,
    projection,
    preCutProjection,
    waiverLegacy,
    waiverProjection,
    waiverProjectionStatus,
    projectedTopIds,
    categories,
    decisionStability,
    stability,
    outcome,
    material,
  };
}
