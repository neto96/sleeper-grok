import { makeSnapshot, makeBundledQualitySnapshot } from "./fixture";
// Test-only alias for the network boundary; analysis, UI and exports remain real.
export async function fetchLeagueRosters({ data }: { data: { leagueId: string; myRosterId?: number } }) {
  await new Promise(resolve => setTimeout(resolve, 300));
  if (new URLSearchParams(location.search).has("refresh-fails")) throw new Error("Simulated refresh failure");
  const snapshot = new URLSearchParams(location.search).has("bundled-quality-study") ? makeBundledQualitySnapshot(true) : makeSnapshot();
  snapshot.leagueId = data.leagueId;
  return snapshot; // Fresh identity even with the same timestamp tests stale-result rejection.
}
