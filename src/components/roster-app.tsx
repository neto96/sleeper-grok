import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Download, FileJson, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ActivityPanel } from "@/components/activity-panel";
import { RosterCard } from "@/components/roster-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WaiverPanel } from "@/components/waiver-panel";
import { copyText, downloadJson, downloadMarkdown } from "@/lib/clipboard";
import {
  DEFAULT_LEAGUE_ID,
  DEFAULT_MY_ROSTER_ID,
  LEAGUE_ID_STORAGE_KEY,
  MY_ROSTER_STORAGE_KEY,
} from "@/lib/sleeper/constants";
import { fetchLeagueRosters } from "@/lib/sleeper/fetch.functions";
import { applyMyRoster, snapshotJson } from "@/lib/sleeper/format";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { cn } from "@/lib/utils";

type Tab = "rosters" | "waivers" | "activity" | "markdown";

const TABS: [Tab, string][] = [
  ["rosters", "Rosters"],
  ["waivers", "Waivers"],
  ["activity", "Activity"],
  ["markdown", "Markdown"],
];

function readStoredLeagueId(): string {
  if (typeof window === "undefined") return DEFAULT_LEAGUE_ID;
  return window.localStorage.getItem(LEAGUE_ID_STORAGE_KEY) || DEFAULT_LEAGUE_ID;
}

function readStoredMyRoster(): number {
  if (typeof window === "undefined") return DEFAULT_MY_ROSTER_ID;
  const raw = window.localStorage.getItem(MY_ROSTER_STORAGE_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_MY_ROSTER_ID;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MY_ROSTER_ID;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Could not reach Sleeper. Try again.";
}

function formatFetchedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function RosterApp({ initialSnapshot }: { initialSnapshot: LeagueSnapshot }) {
  const [leagueId, setLeagueId] = useState(DEFAULT_LEAGUE_ID);
  const [myRosterId, setMyRosterId] = useState(initialSnapshot.myRosterId);
  const [tab, setTab] = useState<Tab>("rosters");
  const [snapshot, setSnapshot] = useState<LeagueSnapshot | null>(initialSnapshot);
  const [copied, setCopied] = useState(false);

  const fetchMutation = useMutation({
    mutationFn: (input: { leagueId: string; myRosterId: number }) =>
      fetchLeagueRosters({ data: input }),
    onSuccess: (data) => {
      setSnapshot(data);
      setMyRosterId(data.myRosterId);
      window.localStorage.setItem(LEAGUE_ID_STORAGE_KEY, data.leagueId);
      window.localStorage.setItem(MY_ROSTER_STORAGE_KEY, String(data.myRosterId));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  useEffect(() => {
    const storedLeague = readStoredLeagueId();
    const storedMine = readStoredMyRoster();
    setLeagueId(storedLeague);
    setMyRosterId(storedMine);
    if (storedLeague !== initialSnapshot.leagueId) {
      fetchMutation.mutate({ leagueId: storedLeague, myRosterId: storedMine });
    } else if (storedMine !== initialSnapshot.myRosterId) {
      setSnapshot((current) => (current ? applyMyRoster(current, storedMine) : current));
    }
    // First paint is SSR'd for the default league; only refetch if the saved ID differs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = fetchMutation.isPending && !snapshot;
  const refreshing = fetchMutation.isPending && Boolean(snapshot);
  const myTeam = snapshot?.teams.find((team) => team.rosterId === myRosterId);
  const otherTeams = snapshot?.teams.filter((team) => team.rosterId !== myRosterId) ?? [];

  function setMine(rosterId: number) {
    setMyRosterId(rosterId);
    window.localStorage.setItem(MY_ROSTER_STORAGE_KEY, String(rosterId));
    setSnapshot((current) => (current ? applyMyRoster(current, rosterId) : current));
  }

  async function handleCopy() {
    if (!snapshot) return;
    const ok = await copyText(snapshot.markdown);
    if (ok) {
      setCopied(true);
      toast.success("Markdown copied");
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      setTab("markdown");
      toast.error("Copy blocked — open the Markdown tab and copy it there.");
    }
  }

  function handleDownload() {
    if (!snapshot) return;
    downloadMarkdown(snapshot.filename, snapshot.markdown);
    toast.success("Markdown file saved");
  }

  function handleJson() {
    if (!snapshot) return;
    downloadJson(snapshot.jsonFilename, snapshotJson(snapshot));
    toast.success("JSON snapshot saved");
  }

  function handleFetch(event?: FormEvent) {
    event?.preventDefault();
    fetchMutation.mutate({ leagueId: leagueId.trim(), myRosterId });
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="h-1 bg-accent" />
      <div className="mx-auto min-w-0 max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pb-12">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
            Sleeper · Snapshot v2
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {snapshot?.leagueName ?? "Nuevo León Football League"}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
            Live rosters, waiver order, free agents, matchups, and recent moves — exported as
            Markdown you can attach to an LLM.
          </p>
        </header>

        <form
          onSubmit={handleFetch}
          className="mt-8 flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 shadow-border sm:flex-row sm:items-end"
        >
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
            League ID
            <Input
              value={leagueId}
              onChange={(event) => setLeagueId(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 font-mono"
              aria-label="Sleeper league ID"
            />
          </label>
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
            My team
            <select
              value={myRosterId}
              onChange={(event) => setMine(Number(event.target.value))}
              className="mt-1.5 h-11 w-full rounded-md bg-muted px-3 text-sm text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_12%,transparent)] outline-none transition-[box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-ring)]"
              aria-label="My team"
            >
              {(snapshot?.teams ?? []).map((team) => (
                <option key={team.rosterId} value={team.rosterId}>
                  {team.teamName}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={fetchMutation.isPending} className="sm:w-44">
            {fetchMutation.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            {snapshot ? "Refresh" : "Fetch"}
          </Button>
        </form>

        {snapshot ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Badge variant="accent">{snapshot.scoring}</Badge>
            <Badge>{snapshot.waiverSystem}</Badge>
            <Badge>Season {snapshot.season}</Badge>
            <Badge>NFL week {snapshot.week}</Badge>
            <Badge>{snapshot.teams.length} teams</Badge>
            <span className="text-xs text-muted-foreground">
              Updated {formatFetchedAt(snapshot.fetchedAt)}
              {refreshing ? " · refreshing" : ""}
            </span>
          </div>
        ) : null}

        {snapshot ? (
          <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid min-w-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">
                {TABS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "h-10 min-w-0 rounded-md px-2 text-sm font-medium transition-[background-color,color] duration-150 sm:px-4",
                      tab === id
                        ? "bg-card text-foreground shadow-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex">
                <Button type="button" variant="secondary" onClick={handleCopy} disabled={!snapshot}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy .md"}
                </Button>
                <Button type="button" onClick={handleDownload} disabled={!snapshot}>
                  <Download />
                  Save .md
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleJson}
                  disabled={!snapshot}
                  className="col-span-2 sm:col-span-1"
                >
                  <FileJson />
                  Save JSON
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8">
            <p className="mb-4 text-sm text-muted-foreground">
              Fetching rosters, waivers, and recent activity from Sleeper…
            </p>
            <LoadingGrid />
          </div>
        ) : null}

        {fetchMutation.isError && !snapshot ? (
          <p className="mt-10 max-w-md text-sm text-destructive">{errorMessage(fetchMutation.error)}</p>
        ) : null}

        {snapshot && tab === "rosters" ? (
          <div className="mt-6 min-w-0 space-y-4">
            {myTeam ? (
              <RosterCard
                key={myTeam.rosterId}
                team={myTeam}
                rank={(snapshot.teams.findIndex((team) => team.rosterId === myTeam.rosterId) ?? 0) + 1}
                mine
              />
            ) : null}
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {otherTeams.map((team) => (
                <RosterCard
                  key={team.rosterId}
                  team={team}
                  rank={(snapshot.teams.findIndex((row) => row.rosterId === team.rosterId) ?? 0) + 1}
                  onSetMine={() => setMine(team.rosterId)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {snapshot && tab === "waivers" ? <WaiverPanel snapshot={snapshot} /> : null}
        {snapshot && tab === "activity" ? <ActivityPanel snapshot={snapshot} /> : null}

        {snapshot && tab === "markdown" ? (
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Attach this file</h2>
              <p className="truncate font-mono text-xs text-muted-foreground">{snapshot.filename}</p>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-pretty text-muted-foreground">
              Your team, standings, waiver order, free agents, matchups, and transactions — ready
              for a chat. Download the .md or copy the text below.
            </p>
            <pre className="max-h-[70vh] overflow-auto rounded-xl bg-card p-4 font-mono text-xs leading-relaxed text-foreground shadow-border sm:text-sm">
              {snapshot.markdown}
            </pre>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl bg-card p-4 shadow-border">
          <div className="flex gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-10" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
