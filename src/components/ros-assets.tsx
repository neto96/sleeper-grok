import { useState, type ReactNode } from "react";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { rosAssets, type LocalCapture } from "@/lib/local-quality/model";
import type { ProjectedWaivers } from "@/lib/sleeper/waiver-valuation";
import {
  visibleAssets,
  rosAnnotation,
  decisionContext,
  availabilityLabel,
  ROS_POSITIONS,
  type RosPosition,
} from "@/lib/local-quality/waiver-context";
/** Shared informational view; never modifies the snapshot or decision inputs. */
export default function RosAssets({snapshot, projected, children, capture, now, sourceLabel, sourceNote, onReload}: {
  snapshot: LeagueSnapshot;
  projected: ProjectedWaivers;
  children: (annotation?: (id: string) => ReactNode, panel?: ReactNode) => ReactNode;
  capture: LocalCapture;
  now: string;
  sourceLabel: string;
  sourceNote?: string;
  onReload?: () => void;
}) {
  const [position, setPosition] = useState<RosPosition>("All");
  const [expanded, setExpanded] = useState(false);
  const view = rosAssets(capture, snapshot, now);
  const visible = visibleAssets(view, position, expanded);
  const context = decisionContext(view, snapshot, projected);
  const offensiveIds = new Set(
    snapshot.analysisWaiverPool
      .filter((p) => ["QB", "RB", "WR", "TE"].includes(String(p.position)))
      .map((p) => String(p.player_id)),
  );
  const annotate = (id: string) =>
    offensiveIds.has(id) ? (
      <span
        className="block whitespace-normal text-xs text-muted-foreground"
        data-testid="local-ros-annotation"
      >
        {rosAnnotation(view, id)}
      </span>
    ) : null;
  return children(
    annotate,
    <>
      {context.lines.length > 0 ? (
        <section
          className="rounded-xl bg-card p-4 shadow-border"
          data-testid="local-decision-context"
        >
          <h2 className="font-semibold">
            Decision context{" "}
            <span className="text-xs font-normal text-muted-foreground">· {sourceLabel}</span>
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {context.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {projected.status === "ready" && projected.rows.some((p) => p.delta !== null) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Lineup change: Weeks{" "}
              {snapshot.projections?.effectiveFromWeek ?? snapshot.projections?.fromWeek}–
              {snapshot.projections?.throughWeek}
              {projected.dropName
                ? `, after dropping ${projected.dropName}`
                : ", using the open roster spot"}
              . This is a window average, not this week's gain.
            </p>
          ) : null}
          {context.notes.map((note) => (
            <p key={note} className="mt-1 text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </section>
      ) : null}
      <section className="rounded-xl bg-card p-4 shadow-border" data-testid="local-ros-assets">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">Best ROS Assets</h2>
          <span className="text-xs text-muted-foreground">{sourceLabel}</span>
        </div>
        {sourceNote ? <p className="mt-1 text-xs text-muted-foreground" role="status">{sourceNote}</p> : null}
        <p className="mt-1 text-sm text-muted-foreground">
          ROS asset strength from FantasyPros research. Weekly adds, lineup gains and trade value
          are separate.
        </p>
        <p className="mt-2 text-sm">
          {view.rows.length} ranked of {view.available} offensive free agents
        </p>
        <h3 className="mt-3 text-sm font-medium">Best ranked ROS assets</h3>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="ROS position filter">
          {ROS_POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={position === p}
              className={`min-h-11 min-w-11 rounded-md border px-3 text-sm ${position === p ? "bg-muted border-foreground" : "border-border"}`}
              onClick={() => {
                setPosition(p);
                setExpanded(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {visible.rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No current overall ROS evidence for these free agents.
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-border">
            {visible.rows.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {p.position} · {p.team ?? "FA"}
                    {availabilityLabel(snapshot, p.id)
                      ? ` · ${availabilityLabel(snapshot, p.id)}`
                      : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  ROS #{p.rank}
                  {p.positionalRank !== null
                    ? ` · ${p.position}${p.positionalRank} (same pool)`
                    : ""}
                  <span className="block text-xs text-muted-foreground">
                    Current · {p.freshness} {p.asOf}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {visible.total > 10 ? (
          <button
            type="button"
            className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm"
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        {visible.total > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Showing {visible.rows.length} of {visible.total} ranked options
            {visible.total > 25 ? " (display capped at 25)" : ""}.
          </p>
        ) : null}
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">Evidence details</summary>
          <p>
            Only players present in the current ROS capture can appear here. No current matched rank
            may mean missing, stale, unsupported or unresolved evidence—not low value. Current
            overall PPR ROS ranks only. Missing ranks are unknown. Available means unrostered,
            including players who may be out or on bye. Freshness limit: 72 hours; retrieval-only
            evidence has no verified source-update time.
          </p>
          <p className="mt-1">
            Capture identities unresolved: {view.diagnostics.unresolved}. Available-player evidence
            withheld: {view.diagnostics.stale} stale, {view.diagnostics.missing} missing rank,{" "}
            {view.diagnostics.unsupported} unsupported/conflicting;{" "}
            {view.diagnostics.positionalOnly} positional records kept separate. Counts are evidence
            records, not distinct players.
          </p>
        </details>
        {onReload ? <button
          type="button"
          className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm"
          onClick={onReload}
        >
          Reload local capture
        </button> : null}
      </section>
    </>,
  );
}
