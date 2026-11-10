import type { QualityFixture } from "../report.ts";
import { scenarios } from "./scenarios.ts";
import { compareScenario, taxonomy } from "./compare.ts";
export function compareAll(f: QualityFixture) {
  return scenarios(f).map((s) => compareScenario(s, f.policy));
}
export function renderDecisionReport(f: QualityFixture) {
  const results = compareAll(f),
    counts = Object.fromEntries(
      ["unchanged", "materially different", "curve-sensitive", "blocked"].map((k) => [
        k,
        results.filter((r) => r.outcome === k).length,
      ]),
    );
  const lines = [
    "# V3.7 Phase 2 — Shadow Decision Comparison",
    "",
    "## Executive summary",
    "",
    `Evaluated **${results.length} scenarios**: **${counts.unchanged} unchanged**, **${counts["materially different"]} materially different**, **${counts["curve-sensitive"]} curve-sensitive**, **${counts.blocked} blocked by quality evidence**. These are disjoint scenario buckets: blocked first, then curve-sensitive, then material, then unchanged. Curve-sensitive scenarios may also be material.`,
    `${results.filter((r) => r.material).length} scenarios have observable material consequences (overlapping count); ${results.filter((r) => r.remainingRequiredDrops > 0).length} scenario(s) also require an unselected cut. These counts describe constructed examples, not a population estimate or proof of prediction accuracy.`,
    "",
    "Continuous evidence removes within-tier ties, but changing the score also changes which assets the roster appears able to spare. The safest next step is a larger, offline, fully covered lineup/replacement study. Protect, surplus and multi-player trade aggregation remain risky; no production decision-engine migration or permanent curve is justified by these fixtures. The smallest production candidate is a separately labeled ROS waiver asset view, conditional on validated data access.",
    "",
    "## Evidence and scope",
    "",
    `Source: the Phase 1 frozen FantasyPros ROS PPR redraft-1QB reference, captured ${f.poolCaptures[0].retrievedAt}; legacy fields captured ${f.legacySource.capturedAt}. Evaluation clock ${f.policy.now}; freshness policy ${f.policy.maxAgeHours} hours. These are historical observations, not newly fetched rankings.`,
    "All roster compositions, trade offers, normalized healthy statuses, roster capacities, bye assignments and projected numbers are explicitly SYNTHETIC. Actual source ECR is unchanged except the labeled adjacent-boundary control. There are no new live provider calls. Positional pools and ALL positional annotations are never substituted for overall ROS ECR.",
    "Experimental quality indices are not fantasy points, projected points, trade prices, or ratios of player worth. A lower ECR number means a higher ranking, not necessarily a better roster outcome. Missing ECR is unknown quality, never zero. Synthetic projection deltas use the existing production projected-lineup calculation, not an index-to-points conversion.",
    "",
    "## Comparison policies and materiality",
    "",
    "- Legacy lineup, replacement, surplus, Protect and waiver ordering call the existing engine directly. Legacy scores normalize roster status to bench for this controlled study. Structural all-roster and currently usable lineups are recorded separately.",
    "- The offline shadow solver maximizes overall quality-index sum subject to the same configured offensive slot eligibility. It also reports a current-usability version using the existing availability predicate. Equal optima use deterministic input order; order-only tie outcomes are not evidence of predictive superiority.",
    "- Shadow Protect is a deliberately narrow experimental policy: retain the ROS-optimal starting set even when currently unavailable. Shadow surplus is its complement. This is not a complete asset-protection or safe-to-trade policy: premium bench assets, future coverage and injury recovery remain unresolved. Membership differences can be policy-driven, not just curve-driven.",
    "- Replacement is removal and re-optimization within this roster, with no assumed waiver replacement. Reported loss is quality-index loss. Ordering changes are recorded but do not alone meet materiality; membership/slot consequences do.",
    "- Materiality means changed starting assignment, current assignment, Protect/surplus membership, waiver top choice, trade asset-direction interpretation, or a required cut. No universal numeric threshold is used. Trade reports use the first roster’s perspective; counterparty utility is not evaluated in this reduced study. Gross/net package-index sums are diagnostics only, accompanied by best single asset, selected cuts, open spots and projected roster consequence. They are never a fairness verdict.",
    "- Curve stability compares discrete outcomes; magnitude is reported separately. All curves use the same pool and evidence policy. Any missing/stale/incompatible record blocks a complete quality comparison rather than silently deleting that player. Unresolved required cuts additionally block final projected trade comparison.",
    "",
    "## Decision taxonomy",
    "",
    ...Object.entries(taxonomy).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "## Scenario overview",
    "",
    "| Scenario | Area | Outcome | Curve stability | Categories |",
    "|---|---|---|---|---|",
    ...results.map(
      (r) => `| ${r.id} | ${r.kind} | ${r.outcome} | ${r.stability} | ${r.categories.join(", ")} |`,
    ),
    "",
  ];
  const n = (x: number | null | undefined) => (x == null ? "unknown" : x.toFixed(1));
  for (const r of results) {
    const name = (id: string | null) => (id ? (r.names[id] ?? id) : "empty");
    const names = (ids: string[]) => ids.map(name).join(", ") || "none";
    const lineup = (a: { slot: string; id: string | null }[]) =>
      a.map((x) => `${x.slot}: ${name(x.id)}`).join("; ");
    lines.push(
      `## ${r.id}`,
      "",
      r.note,
      "",
      `Classification: ${r.categories.join(", ")}. Stability: ${r.stability}.`,
      "",
    );
    lines.push(
      "Decision stability: " +
        Object.entries(r.decisionStability)
          .map(([area, state]) => `${area}: ${state}`)
          .join("; ") +
        ".",
      "",
    );
    if (r.blocked.length)
      lines.push(
        `Quality comparison blocked: ${r.blocked.map((x) => `${name(x.id)} (${x.status})`).join(", ")}. Legacy and synthetic projection evidence remain independent.`,
        "",
      );
    if (r.kind === "roster") {
      lines.push(
        "The summary table previews shifted power only, not a preferred curve. All three curves and their memberships are shown below.",
        "",
      );
      lines.push(
        "| Decision area | Legacy | Shadow | Difference | Confidence |",
        "|---|---|---|---|---|",
      );
      const c = r.comparisons[0];
      lines.push(
        `| ROS/all-roster lineup | ${lineup(r.legacy.lineup)} | ${c ? lineup(c.ros.lineup) : "blocked"} | ${c?.effects.lineup ? "Starter/slot change" : "None or blocked"} | Controlled mechanics only |`,
        `| Current usable lineup | ${lineup(r.legacy.current)} | ${c ? lineup(c.current.lineup) : "blocked"} | ${c?.effects.currentLineup ? "Current starter change" : "None or blocked"} | Same availability predicate |`,
        `| Protect | ${names(r.legacy.protect)} | ${c ? names(c.protect) : "blocked"} | ${c ? `Removed: ${names(r.legacy.protect.filter((id) => !c.protect.includes(id)))}; added: ${names(c.protect.filter((id) => !r.legacy.protect.includes(id)))}` : "unknown"} | Low: experimental policy |`,
        `| Extra/tradeable depth candidate set | ${names(r.legacy.surplus)} | ${c ? names(c.surplus) : "blocked"} | ${c?.effects.surplus ? "Membership change" : "None or blocked"} | Low: not a safe-to-move conclusion |`,
        "",
      );
      for (const c of r.comparisons) {
        lines.push(
          `**${c.curve}** — legacy objective difference ${n(c.legacyObjectiveDifference)} structural units; quality objective difference ${n(c.qualityObjectiveDifference)} index units.`,
          ...c.changes.map(
            (x) =>
              `- Slot ${x.slot} #${x.ordinal}: ${name(x.displaced)} → ${name(x.incoming)}; starter affected; legacy difference ${n(x.legacyScoreDifference)}, quality-index difference ${n(x.qualityIndexDifference)}.`,
          ),
          `- Protect: ${names(c.protect)}. Surplus candidates: ${names(c.surplus)}.`,
          `- Replacement ordering (highest loss first): ${c.replacementOrder.map((id) => `${name(id)} ${n(c.replacement.find((x) => x.id === id)!.loss)}`).join("; ")}.`,
          "",
        );
      }
      lines.push(
        `Legacy replacement losses: ${r.legacy.replacement.map((x) => `${name(String(x.player_id))} ${n(Number(x.score_difference))} structural units`).join("; ")}.`,
        "",
      );
    } else if (r.kind === "waiver") {
      lines.push(
        `Projected comparison status: ${r.waiverProjectionStatus}. No projected top choice is inferred from incomplete evidence or an illegal roster.`,
        "",
      );
      lines.push(
        "| Decision area | Legacy | Shadow | Difference | Confidence |",
        "|---|---|---|---|---|",
        `| Structural waiver order | ${names(r.waiverLegacy.map((x) => String(x.player_id)))} | — | Existing need/scarcity/rank ordering | Frozen control |`,
        ...r.comparisons.map(
          (c) =>
            `| Best ROS asset (${c.curve}) | — | ${names(c.waiver.map((x) => x.id))} | Ignores immediate bye, intentionally | Within-pool only |`,
        ),
        `| Existing projected lineup gain | — | ${r.waiverProjection.map((x) => `${name(x.id)} ${n(x.meanDelta)} points`).join("; ")} | Week 10 synthetic usability and roster impact | Mechanics only; invented forecasts |`,
        "",
        "The structural list answers current heuristic priority; the ROS list answers asset strength over the remaining season; the projection list answers this constructed week’s lineup gain. Sutton can lead ROS and still fail to fill the immediate hole. These are different questions, not interchangeable rankings.",
        "",
      );
    } else {
      lines.push(
        `Legacy structural package diagnostic: gross ${n(r.legacyTrade?.gross)}, net ${n(r.legacyTrade?.net)} structural units; direction ${r.legacyTrade?.direction}. This is not the production trade verdict.`,
        `Required cuts: ${r.requiredDrops}; selected: ${names(r.selectedDrops)}; unresolved: ${r.remainingRequiredDrops}; open spots after transaction: ${r.openSpots}. Open spots have no invented points or automatically added players.`,
        `Projected lineup delta: ${n(r.projection?.meanDelta)} points per week. ${r.projection?.blocked ?? ""} Hypothetical pre-cut delta (may be illegal): ${n(r.preCutProjection?.meanDelta)} points.`,
        "",
        "| Curve | Gross package index change | Net after selected cuts | Direction | Best outgoing / incoming index | Cut index |",
        "|---|---:|---:|---|---|---:|",
        ...r.comparisons.map(
          (c) =>
            `| ${c.curve} | ${n(c.trade!.grossAssetDelta)} | ${n(c.trade!.netAssetDelta)} | ${c.trade!.grossDirection} → ${c.trade!.netDirection} | ${n(c.trade!.bestOutgoing)} / ${n(c.trade!.bestIncoming)} | ${n(c.trade!.cutIndex)} |`,
        ),
        "",
        "Asset sums are diagnostic and non-additive in roster utility. A stronger single asset can leave while the starting lineup improves; a package total can flip direction between curves. Required cuts and vacant slots must be evaluated explicitly before any trade conclusion. No production verdict is changed.",
        "",
      );
    }
  }
  lines.push(
    "## Phase 3 recommendation",
    "",
    "Smallest safe production migration candidate: a separate informational ROS waiver asset view, showing source rank, pool, age and missing-evidence status alongside (not replacing) current waiver recommendations. In immediate-wr-bye, all three curves preserve the same ROS order while the synthetic bye makes Sutton provide zero immediate gain and Lane provide the largest gain. A raw-rank view requires no permanent curve selection. This is a narrowly supported presentation candidate, not proof that ECR improves decisions. Production use remains gated on approved deployable evidence access, identity/coverage validation and freshness handling. No Phase 3 implementation is included.",
    "",
    "1. Expand the offline sample to full league configurations, exact scoring formats and roster/waiver pools. Preserve paired availability controls and source timestamps. Test repeated historical snapshots, not only selected examples.",
    "2. Limit the next candidate investigation to fully covered offensive lineup and removal/replacement calculations. Compare discrete outcomes against the current engine and independent projected-lineup evidence. Preserve a structural fallback when quality coverage is incomplete. Do not choose a production curve yet.",
    "3. Keep Protect, Safe to Move, scarce QB/TE handling and multi-player trade pricing out of any initial migration. The starter-only Protect experiment discards the current elite-asset rule; disagreement alone cannot establish that removal is safe.",
    "4. Keep best ROS waiver asset separate from immediate add value. Validate actual byes/availability and legal drops before considering any UI or ranking migration.",
    "5. Establish an approved production evidence source and quality-refresh policy separately. This offline work creates no deployable FantasyPros integration.",
    "",
    "## Reproduce this report",
    "",
    "Run `node --experimental-strip-types tests/quality/phase2/report.mjs` to print the deterministic report without writing files or calling providers. Run `node --experimental-strip-types --test tests/quality/phase2/compare.test.ts` for focused characterization, and `npx tsc -p tests/quality/phase2/tsconfig.json --pretty false` for its typecheck.",
    "",
    "## Validation boundary",
    "",
    "Phase 2 files live only under tests/quality and docs. Regression tests execute the comparison harness between captures of the existing structural/projected snapshot, trade, waiver and compatibility outputs. Phase 1 pre-change hash tests remain intact. No snapshot fields, production modules, provider calls or release labels are changed; snapshot_version remains 3.2.",
    "",
  );
  return lines.join("\n");
}
