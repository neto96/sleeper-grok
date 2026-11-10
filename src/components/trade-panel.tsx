import { tradeSummary } from "@/lib/sleeper/trade-presentation";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { simulateTradeRosters, analyzeTrade, type TeamTradeImpact, type TradeAnalysisResult } from "@/lib/sleeper/trade-analyzer";
import type { AnalyzedTradeExport } from "@/lib/sleeper/trade-markdown";
import type { LeagueSnapshot, PlayerSlot, TeamRoster } from "@/lib/sleeper/types";

function rosterPlayers(team: TeamRoster): PlayerSlot[] {
  return [...team.starters, ...team.bench, ...team.reserve, ...team.taxi];
}
function statusText(player: PlayerSlot): string | null {
  return player.injuryStatus || (player.status && player.status !== "Active" ? player.status : null);
}

function PlayerPicker({
  title,
  team,
  selected,
  onToggle,
}: {
  title: string;
  team: TeamRoster;
  selected: string[];
  onToggle: (playerId: string) => void;
}) {
  return (
    <section className="rounded-xl bg-card p-4 shadow-border">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
          <h3 className="mt-1 font-display text-lg font-semibold">{team.teamName}</h3>
        </div>
        <Badge>{selected.length} selected</Badge>
      </div>
      <div className="max-h-80 space-y-2 overflow-auto pr-1">
        {rosterPlayers(team).map((player) => {
          const checked = selected.includes(player.playerId);
          const status = statusText(player);
          return (
            <label
              key={player.playerId}
              className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted/55 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(player.playerId)}
                className="size-4 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{player.name}</span>
                <span className="text-xs text-muted-foreground">
                  {player.position}{player.nflTeam ? ` · ${player.nflTeam}` : ""}
                </span>
              </span>
              {status ? <Badge variant="injury">{status}</Badge> : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function directionLabel(value: string): string {
  return value === "improved" ? "Improves" : value === "worsened" ? "Worsens" : "No change";
}

function ImpactCard({ impact, mine }: { impact: TeamTradeImpact; mine: boolean }) {
  const changedPositions = impact.positionImpact.filter((row) =>
    [row.need, row.depth, row.availableNeed, row.availableDepth].some((value) => value !== "unchanged"),
  );
  const summary = tradeSummary(impact);
  const positive = impact.verdict === "Strong improvement" || impact.verdict === "Improvement";
  return (
    <article className="rounded-xl bg-card p-4 shadow-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {mine ? "Your team" : "Other team"}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold">{impact.teamName}</h3>
        </div>
        <Badge variant={impact.verdict === "Worse" ? "injury" : positive ? "accent" : "default"}>
          {impact.verdict}
        </Badge>
      </div>

      <ul className="mt-4 space-y-1.5 text-sm text-foreground">
        {summary.map((reason) => <li key={reason}>• {reason}</li>)}
      </ul>

      <details className="mt-3 rounded-lg bg-muted/45 px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Roster effects &amp; verdict detail</summary>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {impact.reasons.filter(reason => !summary.includes(reason)).map(reason => <li key={reason}>{reason}</li>)}
        </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/55 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Roster size</p>
          <p className="mt-1 text-sm">{impact.rosterSize.before} → {impact.rosterSize.after} / {impact.rosterSize.expected}</p>
          {impact.rosterSize.requiredDrops > 0 ? (
            <p className="mt-1 text-xs text-destructive">
              Needs {impact.rosterSize.requiredDrops} follow-up drop{impact.rosterSize.requiredDrops === 1 ? "" : "s"}.
              No player is removed automatically.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg bg-muted/55 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Depth changes</p>
          {changedPositions.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No QB/RB/WR/TE depth change.</p>
          ) : (
            <div className="mt-1 space-y-1 text-sm">
              {changedPositions.map((row) => (
                <p key={row.position}>
                  {row.position}: need {directionLabel(row.need).toLowerCase()}, depth {directionLabel(row.depth).toLowerCase()}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      </details>

      {impact.lineupChanges.length > 0 ? (
        <details className="mt-4 rounded-lg bg-muted/45 p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Starting-lineup changes</summary>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            {impact.lineupChanges.map((change, index) => (
              <p key={`${change.context}-${change.slot}-${change.ordinal}-${index}`}>
                {change.context === "available" ? "Available" : "Full roster"} {change.slot}{change.ordinal}:{" "}
                {change.beforePlayerName ?? "Empty"} → {change.afterPlayerName ?? "Empty"} ({change.kind})
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {(impact.surplusChanges.extraDepthAdded.length > 0 ||
        impact.surplusChanges.extraDepthRemoved.length > 0 ||
        impact.surplusChanges.safeToMoveAdded.length > 0 ||
        impact.surplusChanges.safeToMoveRemoved.length > 0 ||
        impact.replacementRiskChanges.length > 0) ? (
        <details className="mt-3 rounded-lg bg-muted/45 p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Depth and replacement detail</summary>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            {impact.surplusChanges.extraDepthAdded.length > 0 ? <p>New extra depth: {impact.surplusChanges.extraDepthAdded.join(", ")}</p> : null}
            {impact.surplusChanges.extraDepthRemoved.length > 0 ? <p>No longer extra depth: {impact.surplusChanges.extraDepthRemoved.join(", ")}</p> : null}
            {impact.surplusChanges.safeToMoveAdded.length > 0 ? <p>New safe-to-move options: {impact.surplusChanges.safeToMoveAdded.join(", ")}</p> : null}
            {impact.surplusChanges.safeToMoveRemoved.length > 0 ? <p>No longer safe to move: {impact.surplusChanges.safeToMoveRemoved.join(", ")}</p> : null}
            {impact.replacementRiskChanges.map((row) => (
              <p key={row.playerId}>{row.playerName}: replacement risk {row.direction} ({row.before} → {row.after})</p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function TradePanel({ snapshot, myRosterId, onAnalyzedTrade, disabled = false }: { snapshot: LeagueSnapshot; myRosterId: number; onAnalyzedTrade: (trade: AnalyzedTradeExport | null) => void; disabled?: boolean }) {
  const myTeam = snapshot.teams.find((team) => team.rosterId === myRosterId) ?? snapshot.teams[0]!;
  const initialPartner = snapshot.teams.find((team) => team.rosterId !== myTeam.rosterId)?.rosterId ?? myTeam.rosterId;
  const [partnerId, setPartnerId] = useState(initialPartner);
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [dropA, setDropA] = useState<string[]>([]);
  const [dropB, setDropB] = useState<string[]>([]);
  const [result, setResult] = useState<TradeAnalysisResult | null>(null);
  const partner =
    snapshot.teams.find((team) => team.rosterId === partnerId) ??
    snapshot.teams.find((team) => team.rosterId !== myTeam.rosterId);

  useEffect(() => {
    if (partnerId === myTeam.rosterId || !snapshot.teams.some((team) => team.rosterId === partnerId)) {
      setPartnerId(snapshot.teams.find((team) => team.rosterId !== myTeam.rosterId)?.rosterId ?? myTeam.rosterId);
    }
    setSendIds([]);
    setReceiveIds([]);
    setDropA([]);
    setDropB([]);
    setResult(null);
    onAnalyzedTrade(null);
  }, [myTeam.rosterId, snapshot, onAnalyzedTrade]);

  useEffect(() => {
    setSendIds([]);
    setReceiveIds([]);
    setDropA([]);
    setDropB([]);
    setResult(null);
    onAnalyzedTrade(null);
  }, [partnerId, onAnalyzedTrade]);

  const canAnalyze = Boolean(!disabled && partner && sendIds.length > 0 && receiveIds.length > 0);
  const selectionSummary = useMemo(() => `${sendIds.length} out · ${receiveIds.length} in`, [sendIds.length, receiveIds.length]);

  function toggle(setter: Dispatch<SetStateAction<string[]>>, playerId: string) {
    setter((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
    setDropA([]);
    setDropB([]);
    setResult(null);
    onAnalyzedTrade(null);
  }

  function clear() {
    setSendIds([]);
    setReceiveIds([]);
    setDropA([]);
    setDropB([]);
    setResult(null);
    onAnalyzedTrade(null);
  }

  function run(nextDropA = dropA, nextDropB = dropB) {
    if (!partner || disabled) return;
    const request = {
      teamAId: myTeam.rosterId,
      teamBId: partner.rosterId,
      teamAPlayerIds: sendIds,
      teamBPlayerIds: receiveIds,
      teamADropIds: nextDropA,
      teamBDropIds: nextDropB,
    };
    const analyzed = analyzeTrade(snapshot, request);
    setResult(analyzed);
    onAnalyzedTrade(analyzed.valid ? { snapshot, request, result: analyzed } : null);
  }

  const transferred = result?.valid && partner ? simulateTradeRosters(myTeam, partner, sendIds, receiveIds) : null;
  function dropPicker(key: 'teamA' | 'teamB') {
    if (!result?.valid || !transferred) return null;
    const chosen = key === 'teamA' ? dropA : dropB;
    const total = result[key].rosterSize.requiredDrops + chosen.length;
    if (!total) return null;
    const team = transferred[key];
    return <fieldset className="rounded-xl bg-card p-4 shadow-border" data-testid={`drops-${key}`}>
      <legend className="px-2 text-sm font-semibold">{team.teamName}: choose {total} follow-up drop{total === 1 ? '' : 's'}</legend>
      <p className="mb-3 text-sm text-muted-foreground">{chosen.length} of {total} selected. Results include these hypothetical drops; nothing is sent to Sleeper.</p>
      <div className="max-h-64 space-y-2 overflow-auto">
        {[...team.starters,...team.bench].map(player=><label key={player.playerId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted/55 px-3 py-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={chosen.includes(player.playerId)}
            disabled={disabled || (!chosen.includes(player.playerId) && chosen.length >= total)}
            onChange={()=>{
              const next=chosen.includes(player.playerId) ? chosen.filter(id=>id!==player.playerId) : [...chosen,player.playerId];
              if(key==='teamA') {setDropA(next);run(next,dropB);} else {setDropB(next);run(dropA,next);}
            }} />
          <span>{player.name} <span className="text-muted-foreground">· {player.position}</span></span>
        </label>)}
      </div>
    </fieldset>;
  }

  if (!partner) {
    return <p className="mt-6 text-sm text-muted-foreground">A second roster is required to analyze a trade.</p>;
  }

  return (
    <section className="mt-6 min-w-0 space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
            Trade partner
            <select
              value={partner.rosterId}
              onChange={(event) => { clear(); setPartnerId(Number(event.target.value)); }}
              className="mt-1.5 h-11 w-full rounded-md bg-muted px-3 text-sm text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_12%,transparent)] outline-none focus-visible:shadow-[0_0_0_2px_var(--color-ring)]"
            >
              {snapshot.teams
                .filter((team) => team.rosterId !== myTeam.rosterId)
                .map((team) => <option key={team.rosterId} value={team.rosterId}>{team.teamName}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Badge>{selectionSummary}</Badge>
            <Button type="button" variant="outline" onClick={clear}><RotateCcw />Clear</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PlayerPicker title="You send" team={myTeam} selected={sendIds} onToggle={(id) => toggle(setSendIds, id)} />
        <PlayerPicker title="You receive" team={partner} selected={receiveIds} onToggle={(id) => toggle(setReceiveIds, id)} />
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Button type="button" onClick={() => run()} disabled={!canAnalyze} className="sm:w-48">
          <ArrowLeftRight />Analyze trade
        </Button>
        {!canAnalyze ? <p className="text-xs text-muted-foreground">{disabled ? "Wait for the roster refresh to finish." : "Select at least one player from each team."}</p> : null}
      </div>

      {result && !result.valid ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive shadow-border">
          {result.errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}

      {result?.valid ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">{dropPicker("teamA")}{dropPicker("teamB")}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ImpactCard impact={result.teamA} mine />
            <ImpactCard impact={result.teamB} mine={false} />
          </div>
          <p className="text-xs text-muted-foreground">{result.note}</p>
        </div>
      ) : null}
    </section>
  );
}
