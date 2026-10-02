import { createFileRoute } from "@tanstack/react-router";
import { RosterApp } from "@/components/roster-app";
import { DEFAULT_LEAGUE_ID, DEFAULT_MY_ROSTER_ID } from "@/lib/sleeper/constants";
import { fetchLeagueRosters } from "@/lib/sleeper/fetch.functions";

export const Route = createFileRoute("/")({
  loader: () =>
    fetchLeagueRosters({
      data: { leagueId: DEFAULT_LEAGUE_ID, myRosterId: DEFAULT_MY_ROSTER_ID },
    }),
  component: Home,
});

function Home() {
  const initialSnapshot = Route.useLoaderData();
  return <RosterApp initialSnapshot={initialSnapshot} />;
}
