import { makeSnapshot } from "./fixture";
// Test-only alias for the network boundary; analysis, UI and exports remain real.
export async function fetchLeagueRosters({ data }: { data: { leagueId: string; myRosterId?: number } }) {
  await new Promise(resolve => setTimeout(resolve, 300));
  if (new URLSearchParams(location.search).has("refresh-fails")) throw new Error("Simulated refresh failure");
  const snapshot = makeSnapshot();
  snapshot.leagueId = data.leagueId;
  return snapshot; // Fresh identity even with the same timestamp tests stale-result rejection.
}
