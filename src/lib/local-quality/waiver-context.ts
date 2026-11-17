/** Local presentation only: never changes recommendation or valuation inputs. */
import type { rosAssets } from "./model.ts";
import type { LeagueSnapshot } from "../sleeper/types.ts";
import type { ProjectedWaivers } from "../sleeper/waiver-valuation.ts";
import { assessAvailability } from "../sleeper/analysis/availability.ts";
export type RosView = ReturnType<typeof rosAssets>;
export const ROS_POSITIONS = ["All", "RB", "WR", "TE", "QB"] as const;
export type RosPosition = (typeof ROS_POSITIONS)[number];
export function visibleAssets(view: RosView, position: RosPosition, expanded: boolean) {
  const filtered = view.rows.filter((p) => position === "All" || p.position === position);
  return { rows: filtered.slice(0, expanded ? 25 : 10), total: filtered.length };
}
export function rosAnnotation(view: RosView, id: string): string {
  const p = view.rows.find((p) => p.id === id);
  return p
    ? `ROS #${p.rank}${p.positionalRank === null ? "" : ` · ${p.position}${p.positionalRank}`}`
    : "ROS: no current matched rank";
}
export function availabilityLabel(snapshot: LeagueSnapshot, id: string): string | null {
  const raw = snapshot.analysisWaiverPool.find((p) => String(p.player_id) === id);
  if (!raw) return null;
  const a = assessAvailability(raw);
  if (a.availability === "unavailable") return "Currently unavailable";
  if (a.availability === "uncertain") return "Questionable";
  return null;
}
export function decisionContext(
  view: RosView,
  snapshot: LeagueSnapshot,
  projected: ProjectedWaivers,
) {
  const ros = view.rows[0];
  const known =
    projected.status === "ready"
      ? projected.rows.filter((p) => p.delta !== null && Number.isFinite(p.delta))
      : [];
  // Existing projected rows are already ranked; do not recompute their objective.
  const gain = known[0];
  const candidates =
    snapshot.actionableWaiverAnalysis?.available &&
    Array.isArray(snapshot.actionableWaiverAnalysis.candidates)
      ? snapshot.actionableWaiverAnalysis.candidates
      : [];
  const rawModel = candidates[0],
    rawSecond = candidates[1];
  const model =
    rawModel && typeof rawModel === "object" && !Array.isArray(rawModel) ? rawModel : null;
  const second =
    rawSecond && typeof rawSecond === "object" && !Array.isArray(rawSecond) ? rawSecond : null;
  const sources: { id: string; name: string; label: string; detail: string }[] = [];
  if (ros)
    sources.push({
      id: ros.id,
      name: ros.name,
      label: "Best ranked ROS asset",
      detail: rosAnnotation(view, ros.id),
    });
  if (gain)
    sources.push({
      id: gain.playerId,
      name: gain.name,
      label: "Best measured lineup change",
      detail: `${gain.delta! >= 0 ? "+" : ""}${gain.delta!.toFixed(2)} pts/week`,
    });
  if (model && typeof model.player_id === "string" && typeof model.name === "string")
    sources.push({
      id: model.player_id,
      name: model.name,
      label: "Current waiver model",
      detail: "",
    });
  const incompleteRos = view.rows.length < view.available;
  const incompleteProjection =
    projected.status !== "ready" ||
    known.length === 0 ||
    projected.rows.some((p) => p.delta === null);
  const tied =
    (!!ros && view.rows[1]?.rank === ros.rank) ||
    (!!gain && known[1]?.delta === gain.delta) ||
    (typeof model?.waiver_value_score === "number" &&
      second?.waiver_value_score === model.waiver_value_score);
  const canCollapse = !incompleteRos && !incompleteProjection && !tied;
  const lines: string[] = [];
  if (canCollapse && sources.length === 3 && new Set(sources.map((s) => s.id)).size === 1) {
    lines.push(
      `All three views agree: ${sources[0].name} · ${sources[0].detail} · ${sources[1].detail}`,
    );
  } else {
    const labels = ["ROS", "projected", "waiver model"];
    const used = new Set<string>();
    for (const s of sources) {
      if (used.has(s.id)) continue;
      const group = canCollapse ? sources.filter((x) => x.id === s.id) : [s];
      if (canCollapse) used.add(s.id);
      const label =
        group.length > 1
          ? group
              .map(
                (x) =>
                  labels[
                    x.label === "Best ranked ROS asset"
                      ? 0
                      : x.label === "Best measured lineup change"
                        ? 1
                        : 2
                  ],
              )
              .join(" + ") + " leader"
          : s.label;
      lines.push(
        `${label}: ${s.name}${group
          .map((x) => x.detail)
          .filter(Boolean)
          .map((x) => ` · ${x}`)
          .join("")}`,
      );
    }
  }
  const notes: string[] = [];
  if (ros && availabilityLabel(snapshot, ros.id) === "Currently unavailable")
    notes.push("ROS leader is currently unavailable; ROS order is unchanged.");
  if (ros && gain && ros.id !== gain.playerId)
    notes.push("ROS asset strength and projected lineup change favor different players.");
  if (incompleteRos)
    notes.push("ROS evidence is incomplete; missing or unmatched ranks are unknown.");
  if (projected.status === "ready" && incompleteProjection)
    notes.push("Projected leader is among measured candidates only.");
  if (tied)
    notes.push("A leading rank, lineup change or waiver score is tied; no unique consensus.");
  return { lines, notes };
}
