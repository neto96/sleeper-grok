import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RosterAnalysis } from "@/components/roster-analysis";
import { Badge } from "@/components/ui/badge";
import { SLEEPER_AVATAR } from "@/lib/sleeper/constants";
import { formatPoints, formatRecord, initials } from "@/lib/sleeper/format";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";
import type { PlayerSlot, TeamRoster } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

function PlayerRow({ player, dim }: { player: PlayerSlot; dim?: boolean }) {
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
      </span>
      <span className="tabular-nums text-muted-foreground">
        {player.position}
        {player.nflTeam ? ` · ${player.nflTeam}` : " · FA"}
      </span>
    </li>
  );
}

function ExtraList({ label, players }: { label: string; players: PlayerSlot[] }) {
  if (players.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 divide-y divide-border/80">
        {players.map((player) => (
          <PlayerRow key={player.playerId} player={player} dim />
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
  onSetMine,
}: {
  team: TeamRoster;
  rank: number;
  mine?: boolean;
  analysis?: AnalysisRecord;
  onSetMine?: () => void;
}) {
  const [open, setOpen] = useState(Boolean(mine));
  const avatar = team.avatar ? `${SLEEPER_AVATAR}/${team.avatar}` : null;

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
          <PlayerRow key={`${player.slot}-${player.playerId}`} player={player} />
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
            team.bench.map((player) => <PlayerRow key={player.playerId} player={player} dim />)
          )}
        </ul>
      ) : null}

      {open ? (
        <>
          <ExtraList label="IR / Reserve" players={team.reserve} />
          <ExtraList label="Taxi" players={team.taxi} />
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
