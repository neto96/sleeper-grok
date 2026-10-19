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
