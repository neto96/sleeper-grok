import { useEffect, useState } from "react";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { normalizeCapture, rosAssets, type LocalCapture } from "@/lib/local-quality/model";
/** Only loaded in explicitly enabled local development; never exported with snapshots. */
export default function LocalRosAssets({ snapshot }: { snapshot: LeagueSnapshot }) {
  const [capture, setCapture] = useState<LocalCapture | null>(null),
    [invalid, setInvalid] = useState(false),
    [now, setNow] = useState(() => new Date().toISOString()),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch("/__local-quality", {
          cache: "no-store",
          signal: abort.signal,
        });
        const data = response.ok ? await response.json() : { status: "disabled" };
        if (!active) return;
        setCapture(data.status === "loaded" ? normalizeCapture(data.capture) : null);
        setInvalid(data.status === "invalid");
        setNow(new Date().toISOString());
      } catch {
        if (active) {
          setCapture(null);
          setInvalid(false);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  if (!capture && !invalid) return null;
  if (invalid)
    return (
      <section className="rounded-xl bg-card p-4 shadow-border" role="status">
        Local ROS capture could not be read. Re-import a valid capture.
      </section>
    );
  const view = rosAssets(capture!, snapshot, now);
  return (
    <section className="rounded-xl bg-card p-4 shadow-border" data-testid="local-ros-assets">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Best ROS Assets</h2>
        <span className="text-xs text-muted-foreground">Local development</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        ROS asset strength from FantasyPros research. Weekly adds, lineup gains and trade value are
        separate.
      </p>
      <p className="mt-2 text-sm">
        ROS coverage: {view.rows.length} ranked available players / {view.available} offensive free
        agents
      </p>
      <h3 className="mt-3 text-sm font-medium">Best ranked ROS assets</h3>
      {view.rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No current overall ROS evidence for these free agents.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {view.rows.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>
                {p.name}{" "}
                <span className="text-muted-foreground">
                  · {p.position} · {p.team ?? "FA"}
                </span>
              </span>
              <span>
                ROS #{p.rank}
                {p.positionalRank !== null ? ` · ${p.position}${p.positionalRank} (same pool)` : ""}
                <span className="block text-xs text-muted-foreground">
                  Current · {p.freshness} {p.asOf}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">Evidence details</summary>
        <p>
          Current overall PPR ROS ranks only. Missing ranks are unknown. Available means unrostered,
          including players who may be out or on bye. Freshness limit: 72 hours; retrieval-only
          evidence has no verified source-update time.
        </p>
        <p className="mt-1">
          Capture identities unresolved: {view.diagnostics.unresolved}. Available-player evidence
          withheld: {view.diagnostics.stale} stale, {view.diagnostics.missing} missing rank,{" "}
          {view.diagnostics.unsupported} unsupported/conflicting; {view.diagnostics.positionalOnly}{" "}
          positional records kept separate. Counts are evidence records, not distinct players.
        </p>
      </details>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm"
        onClick={() => setRefresh((x) => x + 1)}
      >
        Reload local capture
      </button>
    </section>
  );
}
