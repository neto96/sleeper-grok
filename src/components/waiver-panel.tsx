import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/sleeper/constants";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

const OFFENSE = ["QB", "RB", "WR", "TE"] as const;

function needVariant(need: unknown) {
  if (need === "high") return "injury" as const;
  if (need === "low") return "accent" as const;
  return "default" as const;
}

export function WaiverPanel({ snapshot }: { snapshot: LeagueSnapshot }) {
  const [position, setPosition] = useState<FantasyPosition>("RB");
  const players = snapshot.waiverByPosition[position] ?? [];
  const analysis = snapshot.fantasyAnalysis;
  const scarcity = (analysis?.league_position_scarcity ?? {}) as Record<string, AnalysisRecord>;
  const mine = (analysis?.teams as Record<string, AnalysisRecord> | undefined)?.[String(snapshot.myRosterId)];
  const need = (mine?.position_need ?? {}) as Record<string, AnalysisRecord>;
  const candidates = Array.isArray(snapshot.waiverAnalysis?.candidates)
    ? (snapshot.waiverAnalysis.candidates as AnalysisRecord[])
    : [];

  return (
    <div className="mt-6 grid gap-4">
      <section className="rounded-xl bg-card p-4 shadow-border">
        <h2 className="font-display text-xl font-semibold tracking-tight">Waiver analysis</h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {snapshot.waiverAnalysis?.available
            ? `Adds for ${String(snapshot.waiverAnalysis.team)}. QB, RB, WR, and TE only, scored from search rank, your configured need, and league scarcity.`
            : "Select a roster that is in this league to score waiver adds."}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {OFFENSE.map((pos) => (
            <Badge key={pos} variant={needVariant(need[pos]?.need)}>
              {pos} need {String(need[pos]?.need ?? "—")}
              {scarcity[pos]?.scarcity ? ` · ${String(scarcity[pos]?.scarcity)} scarcity` : ""}
            </Badge>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-border/80">
          {candidates.length === 0 ? (
            <li className="py-3 text-sm text-muted-foreground">No offensive waiver candidates.</li>
          ) : (
            candidates.slice(0, 12).map((player) => (
              <li key={String(player.player_id)} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted-foreground">{String(player.position)}</span>
                  {String(player.name)}
                  {player.injury_status ? (
                    <Badge variant="injury" className="ml-2 align-middle">
                      {String(player.injury_status)}
                    </Badge>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {String(player.waiver_value_score)} · {String(player.team_need)}
                </span>
              </li>
            ))
          )}
        </ul>
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
