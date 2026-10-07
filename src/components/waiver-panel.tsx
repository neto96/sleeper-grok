import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/sleeper/constants";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

const OFFENSE = ["QB", "RB", "WR", "TE"] as const;

function weeklyContextLabel(value: unknown, position: string): string | null {
  if (!value || typeof value !== "object") return null;
  const resolution = value as AnalysisRecord;
  if (resolution.match_status !== "matched" || !resolution.context || typeof resolution.context !== "object") return null;
  const context = resolution.context as AnalysisRecord;
  const projection = context.projection && typeof context.projection === "object" ? context.projection as AnalysisRecord : {};
  const matchup = context.matchup && typeof context.matchup === "object" ? context.matchup as AnalysisRecord : {};
  const pieces: string[] = [];
  if (typeof projection.consensus_points === "number") pieces.push(`Proj ${projection.consensus_points.toFixed(1)}`);
  if (typeof context.positional_rank === "number") pieces.push(`${position}${context.positional_rank}`);
  if (matchup.rating && matchup.rating !== "unknown") pieces.push(`${String(matchup.rating).replaceAll("_", " ")} matchup`);
  return pieces.length ? pieces.join(" · ") : null;
}

function needVariant(need: unknown) {
  if (need === "high" || need === "critical") return "injury" as const;
  if (need === "low") return "accent" as const;
  return "default" as const;
}

function display(value: unknown): string {
  return value == null || value === "" ? "—" : String(value);
}

export function WaiverPanel({ snapshot }: { snapshot: LeagueSnapshot }) {
  const [position, setPosition] = useState<FantasyPosition>("RB");
  const players = snapshot.waiverByPosition[position] ?? [];
  const analysis = snapshot.fantasyAnalysis;
  const weeklyContextByPlayer = (analysis.weekly_context_by_player ?? {}) as Record<string, AnalysisRecord>;
  const structuralScarcity = (analysis?.league_position_scarcity ?? {}) as Record<string, AnalysisRecord>;
  const usableScarcity = (analysis?.league_usable_scarcity ?? {}) as Record<string, AnalysisRecord>;
  const mine = (analysis?.teams as Record<string, AnalysisRecord> | undefined)?.[String(snapshot.myRosterId)];
  const structuralNeed = (mine?.position_need ?? {}) as Record<string, AnalysisRecord>;
  const availability = (mine?.availability ?? {}) as AnalysisRecord;
  const usableNeed = (availability.usable_position_need ?? {}) as Record<string, AnalysisRecord>;
  const recommendations = Array.isArray((mine?.recommendations as AnalysisRecord | undefined)?.actions)
    ? (((mine?.recommendations as AnalysisRecord).actions as AnalysisRecord[]))
    : [];
  const actionable = snapshot.actionableWaiverAnalysis;
  const actionableCandidates = Array.isArray(actionable?.candidates)
    ? (actionable.candidates as AnalysisRecord[])
    : [];
  const structuralCandidates = Array.isArray(snapshot.waiverAnalysis?.candidates)
    ? (snapshot.waiverAnalysis.candidates as AnalysisRecord[])
    : [];

  return (
    <div className="mt-6 grid gap-4">
      <section className="rounded-xl bg-card p-4 shadow-border">
        <h2 className="font-display text-xl font-semibold tracking-tight">Waiver analysis</h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {actionable?.available
            ? `Actionable adds for ${String(actionable.team)}. Recommendations use currently usable team need and usable league scarcity.`
            : "Select a roster that is in this league to score waiver adds."}
        </p>

        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended Next Moves</h3>
          {recommendations.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No urgent lineup or bye-week moves identified.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {recommendations.slice(0, 5).map((action, index) => (
                <li key={`${action.position_or_slot}-${action.week}-${index}`} className="text-sm">
                  <span className="mr-2 font-semibold">{String(action.urgency).replaceAll("_", " ").toUpperCase()}</span>
                  <span className="font-medium">{String(action.title)}</span>
                  <span className="ml-1 text-muted-foreground">{String(action.reason)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your Team Need</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {OFFENSE.map((pos) => (
              <Badge key={pos} variant={needVariant(usableNeed[pos]?.need)}>
                {pos} need · Structural {display(structuralNeed[pos]?.need)} · Usable {display(usableNeed[pos]?.need)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Actionable Recommendations
          </h3>
          <ul className="mt-1 divide-y divide-border/80">
            {!actionable?.available || actionableCandidates.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                {actionable?.available ? "No actionable offensive waiver candidates." : "No actionable recommendations available."}
              </li>
            ) : (
              actionableCandidates.slice(0, 12).map((player) => (
                <li key={String(player.player_id)} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-muted-foreground">{String(player.position)}</span>
                    {String(player.name)}
                    {weeklyContextLabel(weeklyContextByPlayer[String(player.player_id)], String(player.position)) ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {weeklyContextLabel(weeklyContextByPlayer[String(player.player_id)], String(player.position))}
                      </span>
                    ) : null}
                    {player.availability === "uncertain" ? (
                      <span className="ml-2 text-xs italic text-muted-foreground" aria-label="Availability: questionable">
                        Questionable
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {String(player.waiver_value_score)} · {String(player.team_need)} need · {String(player.league_scarcity)} scarcity
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-3 border-t border-border/80 pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Structural Context</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {structuralCandidates.length} structural candidate{structuralCandidates.length === 1 ? "" : "s"} may be valuable roster adds; structural analysis can include players who are unavailable now.
          </p>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">League Scarcity</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {OFFENSE.map((pos) => (
              <li key={pos} className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="w-7 font-medium">{pos}</span>
                <span className="text-muted-foreground">
                  Structural: {display(structuralScarcity[pos]?.scarcity)}
                </span>
                <span className="text-muted-foreground">
                  · Usable: {display(usableScarcity[pos]?.scarcity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <section className="rounded-xl bg-card p-4 shadow-border">
          <h2 className="font-display text-xl font-semibold tracking-tight">Waiver order</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {snapshot.waiverSystem}. FAAB is ignored.
          </p>
          <ol className="mt-4 space-y-2">
            {snapshot.waiverOrder.map((row) => (
              <li key={row.rosterId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-2 tabular-nums text-muted-foreground">{row.waiverPosition}.</span>
                  {row.teamName}
                </span>
                {row.rosterId === snapshot.myRosterId ? <Badge variant="accent">You</Badge> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl bg-card p-4 shadow-border">
          <h2 className="font-display text-xl font-semibold tracking-tight">Free agents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unrostered players, ranked by Sleeper search rank. Top 30 per position.
          </p>
          <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {FANTASY_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setPosition(pos)}
                className={cn(
                  "h-10 min-w-11 flex-1 rounded-md px-3 text-sm font-medium transition-[background-color,color] duration-150",
                  position === pos
                    ? "bg-card text-foreground shadow-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {pos}
              </button>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-border/80">
            {players.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">None found.</li>
            ) : (
              players.map((player) => (
                <li key={player.playerId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {player.name}
                    {player.injuryStatus ? (
                      <Badge variant="injury" className="ml-2 align-middle">
                        {player.injuryStatus}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {player.nflTeam ?? "FA"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
