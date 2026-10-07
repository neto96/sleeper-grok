import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RosterAnalysis } from "@/components/roster-analysis";
import { Badge } from "@/components/ui/badge";
import { SLEEPER_AVATAR } from "@/lib/sleeper/constants";
import { formatPoints, formatRecord, initials } from "@/lib/sleeper/format";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";
import type { PlayerSlot, TeamRoster } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

function availabilityByPlayerId(analysis?: AnalysisRecord): Map<string, AnalysisRecord> {
  const availability = analysis?.availability;
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) return new Map();
  const players = availability.players;
  if (!Array.isArray(players)) return new Map();

  const byId = new Map<string, AnalysisRecord>();
  for (const player of players as AnalysisRecord[]) {
    if (player.player_id != null) byId.set(String(player.player_id), player);
  }
  return byId;
}

function availabilityLabel(assessment?: AnalysisRecord): string | null {
  switch (assessment?.availability) {
    case "unavailable":
      return "Unavailable";
    case "uncertain":
      return "Questionable";
    case "unknown":
      return "Unknown";
    default:
      return null;
  }
}

function contextSummary(value: AnalysisRecord | undefined, position: string): string | null {
  if (!value || value.match_status !== "matched") return null;
  const context = value.context && typeof value.context === "object" ? value.context as AnalysisRecord : {};
  const projection = context.projection && typeof context.projection === "object"
    ? context.projection as AnalysisRecord
    : {};
  const matchup = context.matchup && typeof context.matchup === "object"
    ? context.matchup as AnalysisRecord
    : {};
  const pieces: string[] = [];
  if (context.opponent) pieces.push(`vs ${String(context.opponent)}`);
  if (typeof projection.consensus_points === "number") pieces.push(`Proj ${projection.consensus_points.toFixed(1)}`);
  if (typeof context.positional_rank === "number") pieces.push(`${position}${context.positional_rank}`);
  else if (typeof context.weekly_rank === "number") pieces.push(`Rank #${context.weekly_rank}`);
  if (matchup.rating && matchup.rating !== "unknown") {
    pieces.push(`${String(matchup.rating).replaceAll("_", " ")} matchup`);
  }
  return pieces.length ? pieces.join(" · ") : null;
}

function PlayerRow({
  player,
  dim,
  assessment,
  weeklyContext,
}: {
  player: PlayerSlot;
  dim?: boolean;
  assessment?: AnalysisRecord;
  weeklyContext?: AnalysisRecord;
}) {
  const label = availabilityLabel(assessment);
  const context = contextSummary(weeklyContext, player.position);
  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-2 py-1.5 text-sm",
        dim && "text-muted-foreground",
      )}
    >
      <span className="font-medium tabular-nums text-muted-foreground">{player.slot}</span>
      <span className="min-w-0 truncate text-foreground">
        {player.name}
        {player.injuryStatus ? (
          <Badge variant="injury" className="ml-2 align-middle">
            {player.injuryStatus}
          </Badge>
        ) : null}
        {label ? (
          <span
            className={cn(
              "ml-2 text-xs text-muted-foreground",
              assessment?.availability === "unavailable" && "font-medium",
              assessment?.availability === "uncertain" && "italic",
            )}
            aria-label={
              label === "Questionable"
                ? "Availability: questionable"
                : "Availability: " + label.toLowerCase()
            }
          >
            {label}
          </span>
        ) : null}
        {context ? <span className="ml-2 text-xs text-muted-foreground">{context}</span> : null}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {player.position}
        {player.nflTeam ? ` · ${player.nflTeam}` : " · FA"}
      </span>
    </li>
  );
}

function ExtraList({
  label,
  players,
  availability,
  weeklyContextByPlayer,
}: {
  label: string;
  players: PlayerSlot[];
  availability: Map<string, AnalysisRecord>;
  weeklyContextByPlayer: Record<string, AnalysisRecord>;
}) {
  if (players.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 divide-y divide-border/80">
        {players.map((player) => (
          <PlayerRow
            key={player.playerId}
            player={player}
            dim
            assessment={availability.get(player.playerId)}
            weeklyContext={weeklyContextByPlayer[player.playerId]}
          />
        ))}
      </ul>
    </div>
  );
}

export function RosterCard({
  team,
  rank,
  mine,
  analysis,
  weeklyContextByPlayer = {},
  onSetMine,
}: {
  team: TeamRoster;
  rank: number;
  mine?: boolean;
  analysis?: AnalysisRecord;
  weeklyContextByPlayer?: Record<string, AnalysisRecord>;
  onSetMine?: () => void;
}) {
  const [open, setOpen] = useState(Boolean(mine));
  const avatar = team.avatar ? `${SLEEPER_AVATAR}/${team.avatar}` : null;
  const playerAvailability = availabilityByPlayerId(analysis);

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl bg-card p-4 shadow-border",
        mine && "shadow-[0_0_0_1px_var(--color-accent)]",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="size-full object-cover outline outline-1 -outline-offset-1 outline-foreground/10"
            />
          ) : (
            <span className="flex size-full items-center justify-center font-display text-lg tracking-wide text-muted-foreground">
              {initials(team.teamName)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-xs text-muted-foreground">{rank}</span>
            <h2 className="truncate font-display text-xl font-semibold leading-tight tracking-tight text-balance">
              {team.teamName}
            </h2>
            {mine ? <Badge variant="accent">Your team</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {team.ownerName}
            {team.isCommissioner ? " · commissioner" : ""}
            {` · waiver ${team.waiverPosition}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg tabular-nums leading-none">{formatRecord(team)}</p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {formatPoints(team.pointsFor)} PF
          </p>
        </div>
      </header>

      <ul className="mt-4 divide-y divide-border/80">
        {team.starters.map((player) => (
          <PlayerRow
            key={`${player.slot}-${player.playerId}`}
            player={player}
            assessment={playerAvailability.get(player.playerId)}
            weeklyContext={weeklyContextByPlayer[player.playerId]}
          />
        ))}
      </ul>

      <button
        type="button"
        className="mt-3 flex h-11 items-center justify-between rounded-md bg-muted px-3 text-sm text-muted-foreground transition-[color,background-color] duration-150 hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Bench · {team.bench.length}</span>
        <ChevronDown className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open ? (
        <ul className="mt-1 divide-y divide-border/80 px-1">
          {team.bench.length === 0 ? (
            <li className="py-2 text-sm text-muted-foreground">No bench players</li>
          ) : (
            team.bench.map((player) => (
              <PlayerRow
                key={player.playerId}
                player={player}
                dim
                assessment={playerAvailability.get(player.playerId)}
                weeklyContext={weeklyContextByPlayer[player.playerId]}
              />
            ))
          )}
        </ul>
      ) : null}

      {open ? (
        <>
          <ExtraList label="IR / Reserve" players={team.reserve} availability={playerAvailability} weeklyContextByPlayer={weeklyContextByPlayer} />
          <ExtraList label="Taxi" players={team.taxi} availability={playerAvailability} weeklyContextByPlayer={weeklyContextByPlayer} />
        </>
      ) : null}

      {analysis ? <RosterAnalysis team={analysis} open={open} /> : null}

      {!mine && onSetMine ? (
        <button
          type="button"
          className="mt-3 h-11 rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          onClick={onSetMine}
        >
          Set as my team
        </button>
      ) : null}
    </article>
  );
}
