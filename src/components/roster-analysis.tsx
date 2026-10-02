import { Badge } from "@/components/ui/badge";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";

const OFFENSE = ["QB", "RB", "WR", "TE"] as const;

function needVariant(need: unknown) {
  if (need === "high") return "injury" as const;
  if (need === "low") return "accent" as const;
  return "default" as const;
}

function ratingVariant(rating: unknown) {
  if (rating === "weak") return "injury" as const;
  if (rating === "strong") return "accent" as const;
  return "default" as const;
}

export function RosterAnalysis({ team, open }: { team: AnalysisRecord; open: boolean }) {
  const strength = (team.lineup_strength ?? {}) as Record<string, AnalysisRecord>;
  const need = (team.position_need ?? {}) as Record<string, AnalysisRecord>;
  const lineup = (team.optimal_lineup ?? {}) as Record<string, AnalysisRecord[]>;
  const coverage = ((team.lineup_coverage ?? {}) as AnalysisRecord).summary as AnalysisRecord | undefined;
  const protect = ((team.player_protection ?? []) as AnalysisRecord[]).filter((player) => player.protection === "protect");
  const surplus = ((team.roster_surplus ?? []) as AnalysisRecord[]).filter((player) => player.surplus_type === "surplus");

  return (
    <section className="mt-4 border-t border-border/80 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Analysis</span>
        {OFFENSE.map((position) => (
          <Badge key={position} variant={ratingVariant(strength[position]?.rating)}>
            {position} {String(strength[position]?.rating ?? "—")}
          </Badge>
        ))}
      </div>
      {open ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {OFFENSE.map((position) => (
              <Badge key={position} variant={needVariant(need[position]?.need)}>
                {position} need {String(need[position]?.need ?? "—")}
              </Badge>
            ))}
            {coverage ? (
              <Badge>
                {String(coverage.covered_slots)}/{String(coverage.supported_configured_slots)} slots
              </Badge>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Optimal lineup</p>
            <ul className="mt-1 space-y-1">
              {Object.entries(lineup).map(([slot, players]) =>
                players.length === 0 ? null : (
                  <li key={slot} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                    <span className="text-muted-foreground">{slot}</span>
                    <span className="min-w-0 truncate">
                      {players.map((player) => String(player.name || player.player_id)).join(", ")}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
          {protect.length > 0 ? (
            <p className="text-pretty text-muted-foreground">
              Protect {protect.slice(0, 4).map((player) => String(player.name)).join(", ")}.
            </p>
          ) : null}
          {surplus.length > 0 ? (
            <p className="text-pretty text-muted-foreground">
              Surplus {surplus.slice(0, 4).map((player) => `${player.name} (${player.position})`).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
