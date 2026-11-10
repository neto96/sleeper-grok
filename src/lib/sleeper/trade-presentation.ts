import type { LineupChange } from "./trade-analyzer.ts";

/** Label differing lineup contexts without changing which changes affect a verdict. */
export function lineupChangeReason(change: LineupChange, changes: LineupChange[]): string {
  const counterpart = changes.find((other) => other.context !== change.context
    && other.slot === change.slot && other.ordinal === change.ordinal);
  const sameChange = counterpart && counterpart.kind === change.kind
    && counterpart.beforePlayerId === change.beforePlayerId
    && counterpart.afterPlayerId === change.afterPlayerId;
  const mixed = changes.some((other) => other.context !== change.context);
  const prefix = sameChange ? "Both lineups: " : mixed
    ? change.context === "available" ? "Available lineup: " : "All-roster lineup: "
    : "";
  const slot = `${change.slot}${change.ordinal}`;
  switch (change.kind) {
    case "filled": return `${prefix}${slot} is filled by ${change.afterPlayerName}.`;
    case "uncovered": return `${prefix}${slot} is left without a starter.`;
    case "upgraded": return `${prefix}${slot} improves from ${change.beforePlayerName} to ${change.afterPlayerName}.`;
    case "downgraded": return `${prefix}${slot} drops from ${change.beforePlayerName} to ${change.afterPlayerName}.`;
    case "changed": return `${prefix}${slot} changes from ${change.beforePlayerName} to ${change.afterPlayerName}.`;
  }
}

/** A display-only shortlist. All original evidence remains available in detail. */
export function tradeSummary(impact: import("./trade-analyzer.ts").TeamTradeImpact): string[] {
  const reasons = [...new Set(impact.reasons)];
  const basis = reasons.find(reason => /^(Structural fallback:|Projected offensive lineup change:)/.test(reason));
  const dropFallback = basis === "Structural fallback: Resolve follow-up drops before using projected valuation." && impact.rosterSize.requiredDrops > 0;
  const summary: string[] = dropFallback ? [`Structural fallback: choose ${impact.rosterSize.requiredDrops} follow-up cut${impact.rosterSize.requiredDrops === 1 ? "" : "s"} before projected valuation.`] : basis ? [basis] : [];
  if (impact.rosterSize.requiredDrops > 0 && !dropFallback) summary.push(`Needs ${impact.rosterSize.requiredDrops} follow-up cut${impact.rosterSize.requiredDrops === 1 ? "" : "s"}; choose them before relying on this result.`);
  const unavailable = impact.availability.incoming.filter(move => move.availability !== "available");
  const questionable = impact.availability.incoming.filter(move => move.availability === "available" && /questionable/i.test(move.reason));
  const statusLabel = (reason: string) => ({injury_out:"Out",injury_ir:"IR",injury_na:"NA",injury_pup:"PUP",injury_dnr:"DNR",roster_reserve:"Reserve",roster_taxi:"Taxi",status_inactive:"Inactive",status_practice_squad:"Practice squad",unknown_status:"Status unknown",questionable:"Questionable"}[reason.replaceAll(" ", "_")] ?? reason.replaceAll("_", " "));
  const status = [...unavailable.map(move => `${move.playerName} (${statusLabel(move.reason)})`),
    ...questionable.map(move => `${move.playerName} (Questionable)`)].join(", ");
  if (status) summary.push(`Incoming status: ${status}.`);
  for (const reason of reasons) {
    if (summary.length >= 3) break;
    if (reason === basis || /Requires \d+ follow-up drop|while currently unavailable/.test(reason)) continue;
    summary.push(reason.replace(/^The current analysis sees little starting-lineup or depth change\.$/, "Little change to your starters or depth."));
  }
  return summary;
}
