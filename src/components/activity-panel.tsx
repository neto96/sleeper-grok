import { formatPoints } from "@/lib/sleeper/format";
import type { LeagueSnapshot } from "@/lib/sleeper/types";

export function ActivityPanel({ snapshot }: { snapshot: LeagueSnapshot }) {
  const weeks = [...new Set(snapshot.matchups.map((game) => game.week))].sort((a, b) => b - a);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl bg-card p-4 shadow-border">
        <h2 className="font-display text-xl font-semibold tracking-tight">Matchups</h2>
        <p className="mt-1 text-sm text-muted-foreground">Current week and the two before it.</p>
        {weeks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No matchups returned.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {weeks.map((week) => (
              <div key={week}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Week {week}
                </h3>
                <ul className="mt-2 space-y-2">
                  {snapshot.matchups
                    .filter((game) => game.week === week)
                    .map((game) => {
                      const [a, b] = game.teams;
                      if (!a || !b) return null;
                      return (
                        <li key={game.matchupId} className="text-sm">
                          <span className={a.rosterId === snapshot.myRosterId ? "text-accent" : ""}>
                            {a.teamName}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {" "}
                            {formatPoints(a.points)}
                          </span>
                          <span className="text-muted-foreground"> vs </span>
                          <span className={b.rosterId === snapshot.myRosterId ? "text-accent" : ""}>
                            {b.teamName}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {" "}
                            {formatPoints(b.points)}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl bg-card p-4 shadow-border">
        <h2 className="font-display text-xl font-semibold tracking-tight">Recent transactions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Adds, drops, and waivers from the last three weeks.</p>
        {snapshot.transactions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No transactions returned.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {snapshot.transactions.slice(0, 40).map((tx, index) => (
              <li key={`${tx.created}-${tx.type}-${index}`} className="text-sm">
                <p className="text-muted-foreground">
                  Week {tx.week} · {tx.type.replaceAll("_", " ")}
                  {tx.status && tx.status !== "complete" ? ` · ${tx.status}` : ""}
                </p>
                <p className="mt-0.5 font-medium">{tx.teamNames.join(" / ") || "Unknown team"}</p>
                {tx.adds.length ? (
                  <p className="mt-0.5 text-foreground">Add {tx.adds.map((player) => player.name).join(", ")}</p>
                ) : null}
                {tx.drops.length ? (
                  <p className="text-muted-foreground">
                    Drop {tx.drops.map((player) => player.name).join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
