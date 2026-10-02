import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/sleeper/constants";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

export function WaiverPanel({ snapshot }: { snapshot: LeagueSnapshot }) {
  const [position, setPosition] = useState<FantasyPosition>("RB");
  const players = snapshot.waiverByPosition[position] ?? [];

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
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
  );
}
