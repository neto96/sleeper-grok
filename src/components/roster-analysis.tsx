import { Badge } from "@/components/ui/badge";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";

const OFFENSE = ["QB", "RB", "WR", "TE"] as const;
const AVAILABILITY_LABELS: Record<string, string> = {
  active: "Active",
  questionable: "Questionable",
  injury_out: "Out",
  injury_ir: "IR",
  injury_na: "NA",
  injury_pup: "PUP",
  injury_dnr: "DNR",
  status_inactive: "Inactive",
  status_practice_squad: "Practice Squad",
  roster_reserve: "Reserve",
  roster_taxi: "Taxi",
  unknown_status: "Status unknown",
};

function ratingVariant(rating: unknown) {
  if (rating === "weak") return "injury" as const;
  if (rating === "strong") return "accent" as const;
  return "default" as const;
}

function display(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value).replaceAll("_", " ");
}

function records(value: unknown): AnalysisRecord[] {
  return Array.isArray(value) ? (value as AnalysisRecord[]) : [];
}

function record(value: unknown): AnalysisRecord {
  return value && typeof value === "object" ? (value as AnalysisRecord) : {};
}

function configuredCount(slot: string, coverage: AnalysisRecord): number {
  if (slot === "FLEX" || slot.endsWith("_FLEX")) {
    const flex = record(record(coverage.flex_slots)[slot]);
    return Number(flex.supported_required ?? 0);
  }
  return Number(record(coverage[slot]).required ?? 0);
}

function Lineup({
  title,
  lineup,
  coverage,
}: {
  title: string;
  lineup: Record<string, AnalysisRecord[]>;
  coverage: AnalysisRecord;
}) {
  const groups = Object.entries(lineup).filter(([slot, players]) => {
    const count = configuredCount(slot, coverage);
    return count > 0 || players.length > 0;
  });

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {groups.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No supported offensive slots configured.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {groups.map(([slot, players]) => {
            const missing = Math.max(configuredCount(slot, coverage) - players.length, 0);
            return (
              <li key={slot} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <span className="text-muted-foreground">{slot}</span>
                <span className="min-w-0 truncate">
                  {players.length > 0
                    ? players.map((player) => String(player.name || player.player_id)).join(", ")
                    : missing > 0
                      ? `Empty${missing > 1 ? ` · ${missing} slots` : ""}`
                      : "—"}
                  {players.length > 0 && missing > 0 ? (
                    <span className="ml-2 text-muted-foreground">
                      + {missing} empty {missing === 1 ? "slot" : "slots"}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function replacementText(row: AnalysisRecord | undefined): string {
  if (!row) return "—";
  const level = display(row.replacement_cost);
  const replacement = row.replacement_player == null ? "none" : String(row.replacement_player);
  return `${level} · ${replacement}`;
}

export function RosterAnalysis({ team, open }: { team: AnalysisRecord; open: boolean }) {
  const availability = record(team.availability);
  const unavailable = records(availability.players).filter((player) => player.currently_usable === false);
  const usableNeed = record(availability.usable_position_need);
  const usableStrength = record(availability.usable_lineup_strength);
  const usableDepth = record(availability.usable_starting_depth);
  const structuralStrength = record(team.lineup_strength);
  const structuralDepth = record(team.starting_depth);
  const structuralLineup = record(team.optimal_lineup) as Record<string, AnalysisRecord[]>;
  const usableLineup = record(availability.usable_lineup) as Record<string, AnalysisRecord[]>;
  const coverage = record(team.lineup_coverage);
  const protect = records(team.player_protection).filter((player) => player.protection === "protect");
  const unavailableById = new Map(
    unavailable.map((player) => [String(player.player_id), player]),
  );
  const structuralSurplus = records(team.roster_surplus).filter((player) => player.surplus_type === "surplus");
  const actionableSurplus = records(availability.actionable_surplus).filter((player) => player.surplus_type === "surplus");

  const structuralCosts = records(team.roster_replacement_cost);
  const usableCosts = records(availability.usable_replacement_cost);
  const costRows = new Map<string, { player: AnalysisRecord; structural?: AnalysisRecord; usable?: AnalysisRecord }>();
  for (const row of structuralCosts) {
    const key = String(row.player_id ?? row.name);
    costRows.set(key, { player: row, structural: row });
  }
  for (const row of usableCosts) {
    const key = String(row.player_id ?? row.name);
    const existing = costRows.get(key);
    costRows.set(key, { player: existing?.player ?? row, structural: existing?.structural, usable: row });
  }

  return (
    <section className="mt-4 border-t border-border/80 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Analysis</span>
        {OFFENSE.map((position) => (
          <Badge key={position} variant={ratingVariant(record(structuralStrength[position]).rating)}>
            {position} {display(record(structuralStrength[position]).rating)}
          </Badge>
        ))}
      </div>
      {open ? (
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Availability</p>
            {unavailable.length === 0 ? (
              <p className="mt-1 text-muted-foreground">No currently unusable rostered players.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {unavailable.map((player, index) => (
                  <li key={String(player.player_id ?? `${player.name}-${index}`)}>
                    <span>{String(player.name || player.player_id || "Unknown player")}</span>
                    <span className="ml-1 text-muted-foreground">
                      · {AVAILABILITY_LABELS[String(player.reason)] ?? display(player.reason)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Position Need</p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {OFFENSE.map((position) => (
                <li key={position} className="flex flex-wrap items-center gap-x-2">
                  <span className="w-7 font-medium">{position}</span>
                  <span className="text-muted-foreground">Structural: {display(record(team.position_need && record(team.position_need)[position]).need)}</span>
                  <span className="text-muted-foreground">· Usable: {display(record(usableNeed[position]).need)}</span>
                </li>
              ))}
            </ul>
            {coverage.summary ? (
              <Badge className="mt-2">
                {String(record(coverage.summary).covered_slots)}/{String(record(coverage.summary).supported_configured_slots)} slots covered
              </Badge>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Strength &amp; Depth</p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {OFFENSE.map((position) => (
                <li key={position} className="flex flex-wrap items-center gap-x-2">
                  <span className="w-7 font-medium">{position}</span>
                  <span className="text-muted-foreground">
                    Structural: {display(record(structuralStrength[position]).rating)} / {display(record(structuralDepth[position]).starting_depth)}
                  </span>
                  <span className="text-muted-foreground">
                    · Usable: {display(record(usableStrength[position]).rating)} / {display(record(usableDepth[position]).starting_depth)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Lineup title="Structural Optimal Lineup" lineup={structuralLineup} coverage={coverage} />
          <Lineup title="Currently Usable Lineup" lineup={usableLineup} coverage={coverage} />

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Replacement Risk</p>
            {costRows.size === 0 ? (
              <p className="mt-1 text-muted-foreground">No replacement-cost rows.</p>
            ) : (
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {[...costRows.values()].map(({ player, structural, usable }, index) => (
                  <li key={String(player.player_id ?? `${player.name}-${index}`)} className="min-w-0">
                    <span className="font-medium">{String(player.name ?? player.player_id ?? "Unknown player")}</span>
                    <span className="ml-2 text-muted-foreground">Structural: {replacementText(structural)}</span>
                    <span className="ml-2 text-muted-foreground">· Usable: {replacementText(usable)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Protect</p>
            {protect.length === 0 ? (
              <p className="mt-1 text-muted-foreground">None.</p>
            ) : (
              <p className="mt-1 text-pretty text-muted-foreground">
                {protect.slice(0, 4).map((player, index) => {
                  const status = unavailableById.get(String(player.player_id));
                  const context = status
                    ? ` · ${AVAILABILITY_LABELS[String(status.reason)] ?? display(status.reason)}`
                    : "";
                  return `${index > 0 ? ", " : ""}${String(player.name)} · ${display(player.protection)}${context}`;
                })}
                .
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Structural Surplus</p>
              <p className="mt-1 text-muted-foreground">
                {structuralSurplus.length > 0
                  ? structuralSurplus.slice(0, 4).map((player) => `${player.name} (${player.position})`).join(", ")
                  : "None."}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actionable Surplus</p>
              <p className="mt-1 text-muted-foreground">
                {actionableSurplus.length > 0
                  ? actionableSurplus.slice(0, 4).map((player) => `${player.name} (${player.position})`).join(", ")
                  : "None."}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
