import type { TradeAnalysisResult, TradeRequest, TeamTradeImpact } from "./trade-analyzer.ts";
import type { LeagueSnapshot } from "./types.ts";

export type AnalyzedTradeExport = {
  snapshot: LeagueSnapshot;
  request: TradeRequest;
  result: TradeAnalysisResult;
};

// Keep roster-provided names on one line and prevent Markdown/HTML injection.
function plain(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&");
}
function names(values: string[]): string {
  return values.map(plain).join(", ");
}
function teamImpact(team: TeamTradeImpact): string[] {
  const size = team.rosterSize;
  const reasons = [...team.reasons];
  if (reasons.length < 2) reasons.push(`Active roster size changes from ${size.before} to ${size.after} (limit ${size.expected}).`);
  const lines = [`### ${plain(team.teamName)} — impact`, "", `- Verdict: **${plain(team.verdict)}**`,
    ...reasons.slice(0, 5).map((reason) => `- ${plain(reason)}`),
    `- Active roster size: ${size.before} → ${size.after} (limit ${size.expected}).`];
  if (size.requiredDrops > 0) lines.push(`- Required drops: **${size.requiredDrops}**. Results are provisional until follow-up drops are resolved.`);
  for (const context of ["all_roster", "available"] as const) {
    const changes = team.lineupChanges.filter((change) => change.context === context);
    if (changes.length) lines.push(`- ${context === "all_roster" ? "All-roster lineup" : "Availability-eligible lineup"}: ${changes.map((change) => `${plain(change.slot)}${change.ordinal}: ${plain(change.beforePlayerName ?? "Empty")} → ${plain(change.afterPlayerName ?? "Empty")} (${change.kind})`).join("; ")}.`);
  }
  for (const impact of team.positionImpact) {
    const changes = ([
      ["all-roster need", impact.need], ["all-roster depth", impact.depth],
      ["available-player need", impact.availableNeed], ["available-player depth", impact.availableDepth],
    ] as const).filter(([, direction]) => direction !== "unchanged");
    if (changes.length) lines.push(`- ${impact.position}: ${changes.map(([label, direction]) => `${label} ${direction}`).join("; ")}.`);
  }
  const surplus = team.surplusChanges;
  for (const [label, players] of [
    ["Extra Depth added", surplus.extraDepthAdded], ["Extra Depth removed", surplus.extraDepthRemoved],
    ["Safe to Move added", surplus.safeToMoveAdded], ["Safe to Move removed", surplus.safeToMoveRemoved],
  ] as const) {
    if (players.length) lines.push(`- ${label}: ${names(players)}.`);
  }
  for (const risk of team.replacementRiskChanges) {
    lines.push(`- Replacement risk for ${plain(risk.playerName)}: ${plain(risk.before.replaceAll("_", " "))} → ${plain(risk.after.replaceAll("_", " "))} (${risk.direction}).`);
  }
  for (const move of team.availability.incoming) {
    if (move.availability !== "available" || /questionable/i.test(move.reason)) {
      lines.push(`- Incoming availability: ${plain(move.playerName)} (${plain(move.position)}) — ${plain(move.availability.replaceAll("_", " "))}; ${plain(move.reason.replaceAll("_", " "))}.`);
    }
  }
  return lines;
}

/** Formats an existing result only; it never reruns or changes trade analysis. */
export function buildTradeMarkdown(snapshot: LeagueSnapshot, request: TradeRequest, result: TradeAnalysisResult): string {
  if (!result.valid) return "";
  const sentNames = (rosterId: number, ids: string[]) => {
    const team = snapshot.teams.find((candidate) => candidate.rosterId === rosterId);
    const players = team ? [...team.starters, ...team.bench, ...team.reserve, ...team.taxi] : [];
    return names(ids.map((id) => players.find((player) => player.playerId === id)?.name ?? id));
  };
  return [
    "## Trade Analysis", "", "Hypothetical trade; no Sleeper transaction has been made.", "",
    `- ${plain(result.teamA.teamName)} sends to ${plain(result.teamB.teamName)}: ${sentNames(request.teamAId, request.teamAPlayerIds)}.`,
    `- ${plain(result.teamB.teamName)} sends to ${plain(result.teamA.teamName)}: ${sentNames(request.teamBId, request.teamBPlayerIds)}.`, "",
    ...teamImpact(result.teamA), "", ...teamImpact(result.teamB), "",
    "Phase 1 limitation: future-readiness deltas, including changes to future-week bye coverage, are not yet included.",
  ].join("\n");
}

/** Snapshot identity prevents an older analysis being exported after a refresh. */
export function buildExportMarkdown(snapshot: LeagueSnapshot, trade: AnalyzedTradeExport | null): string {
  if (!trade || trade.snapshot !== snapshot) return snapshot.markdown;
  const section = buildTradeMarkdown(snapshot, trade.request, trade.result);
  return section ? `${snapshot.markdown}\n\n${section}\n` : snapshot.markdown;
}
