import { DEFAULT_MY_ROSTER_ID, FANTASY_POSITIONS, SLEEPER_API, type FantasyPosition } from "./constants";
import { buildAnalysisBundle, buildMarkdown, jsonFilename, markdownFilename, playerDisplayName, scoringLabel, sleeperPoints } from "./format";
import type {
  LeagueSnapshot,
  LeagueTransaction,
  PlayerSlot,
  TeamRoster,
  WaiverOrderRow,
  WaiverPlayer,
  WeekMatchup,
} from "./types";

type SleeperLeague = {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  status: string;
  sport: string;
  avatar?: string | null;
  roster_positions?: string[];
  scoring_settings?: { rec?: number };
  settings?: {
    waiver_budget?: number;
    playoff_teams?: number;
    num_teams?: number;
    waiver_type?: number;
  };
};

type SleeperUser = {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar?: string | null;
  is_owner?: boolean;
  metadata?: { team_name?: string } | null;
};

type SleeperRoster = {
  roster_id: number;
  owner_id: string | null;
  players?: string[] | null;
  starters?: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
  settings?: {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    waiver_position?: number;
    waiver_budget_used?: number;
  };
  metadata?: { streak?: string; team_name?: string } | null;
};

type SleeperState = {
  week?: number;
  display_week?: number;
  season?: string;
  season_type?: string;
};

type SleeperPlayer = {
  player_id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  status?: string | null;
  injury_status?: string | null;
  number?: number | null;
  search_rank?: number | null;
};

type SleeperTransaction = {
  transaction_id?: string;
  type?: string;
  status?: string;
  created?: number;
  creator?: string;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
};

type SleeperMatchup = {
  roster_id: number;
  matchup_id: number | null;
  points?: number;
};

type PlayerCache = {
  at: number;
  map: Record<string, SleeperPlayer>;
};

const PLAYER_TTL_MS = 24 * 60 * 60 * 1000;
const WAIVER_PER_POSITION = 30;
let playerCache: PlayerCache | null = null;

async function sleeperGet<T>(path: string): Promise<T> {
  const response = await fetch(`${SLEEPER_API}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    throw new Error("League not found on Sleeper. Check the league ID.");
  }
  if (!response.ok) {
    throw new Error(`Sleeper request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

async function sleeperGetOptional<T>(path: string, fallback: T): Promise<T> {
  try {
    return await sleeperGet<T>(path);
  } catch {
    return fallback;
  }
}

async function getPlayerMap(): Promise<Record<string, SleeperPlayer>> {
  if (playerCache && Date.now() - playerCache.at < PLAYER_TTL_MS) {
    return playerCache.map;
  }
  const map = await sleeperGet<Record<string, SleeperPlayer>>("/players/nfl");
  playerCache = { at: Date.now(), map };
  return map;
}

function cleanName(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveTeamName(user: SleeperUser | undefined, roster: SleeperRoster): string {
  return (
    cleanName(user?.metadata?.team_name) ||
    cleanName(roster.metadata?.team_name) ||
    cleanName(user?.display_name) ||
    cleanName(user?.username) ||
    `Roster ${roster.roster_id}`
  );
}

function toSlot(
  playerId: string | null | undefined,
  slot: string,
  players: Record<string, SleeperPlayer>,
): PlayerSlot | null {
  if (!playerId || playerId === "0") return null;
  const player = players[playerId];
  const isDef = /^[A-Z]{2,3}$/.test(playerId);
  return {
    playerId,
    name: playerDisplayName(player, playerId),
    position: player?.position ?? (isDef ? "DEF" : "—"),
    slot,
    nflTeam: player?.team ?? (isDef ? playerId : null),
    injuryStatus: player?.injury_status ?? null,
    status: player?.status ?? null,
    number: player?.number ?? null,
    searchRank: typeof player?.search_rank === "number" ? player.search_rank : null,
  };
}

function toWaiverPlayer(id: string, player: SleeperPlayer): WaiverPlayer {
  return {
    playerId: id,
    name: playerDisplayName(player, id),
    position: player.position ?? "—",
    nflTeam: player.team ?? null,
    injuryStatus: player.injury_status ?? null,
    status: player.status ?? null,
    searchRank: player.search_rank ?? null,
  };
}

function isUsefulFantasyPlayer(player: SleeperPlayer): player is SleeperPlayer & { position: FantasyPosition } {
  if (!FANTASY_POSITIONS.includes(player.position as FantasyPosition)) return false;
  const name = playerDisplayName(player, "").toLowerCase();
  if (!name) return false;
  if (name.includes("player invalid") || name === "duplicate player") return false;
  return true;
}

function isActiveEnoughForWaivers(player: SleeperPlayer): boolean {
  if (player.position !== "K" && !player.team) return false;
  const status = String(player.status || "").toLowerCase();
  return status !== "inactive" && status !== "retired";
}

function positionSortValue(position: string): number {
  const order: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };
  return order[position] ?? 99;
}

function standingsSort(a: TeamRoster, b: TeamRoster): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.ties !== a.ties) return b.ties - a.ties;
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
  return a.teamName.localeCompare(b.teamName);
}

function recentWeeks(currentWeek: number): number[] {
  return [...new Set([Math.max(1, currentWeek - 2), Math.max(1, currentWeek - 1), currentWeek])];
}

export async function loadLeagueSnapshot(
  leagueId: string,
  myRosterId = DEFAULT_MY_ROSTER_ID,
): Promise<LeagueSnapshot> {
  const id = leagueId.trim();
  const [league, users, rosters, state] = await Promise.all([
    sleeperGet<SleeperLeague | null>(`/league/${id}`),
    sleeperGet<SleeperUser[]>(`/league/${id}/users`),
    sleeperGet<SleeperRoster[]>(`/league/${id}/rosters`),
    sleeperGet<SleeperState>("/state/nfl"),
  ]);

  if (!league) {
    throw new Error("League not found on Sleeper. Check the league ID.");
  }

  const week = state.week ?? 1;
  const weeks = recentWeeks(week);

  const [players, txByWeek, matchupByWeek] = await Promise.all([
    getPlayerMap().catch(() => ({}) as Record<string, SleeperPlayer>),
    Promise.all(
      weeks.map(async (w) => ({
        week: w,
        rows: await sleeperGetOptional<SleeperTransaction[]>(`/league/${id}/transactions/${w}`, []),
      })),
    ),
    Promise.all(
      weeks.map(async (w) => ({
        week: w,
        rows: await sleeperGetOptional<SleeperMatchup[]>(`/league/${id}/matchups/${w}`, []),
      })),
    ),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const starterSlots = (league.roster_positions ?? []).filter((slot) => slot !== "BN");
  const benchSlots = (league.roster_positions ?? []).filter((slot) => slot === "BN").length;
  const faabBudget = league.settings?.waiver_budget ?? 100;

  const teams: TeamRoster[] = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const starterIds = (roster.starters ?? []).map(String).filter((playerId) => playerId !== "0");
    const starterSet = new Set(starterIds);
    const reserveIds = (roster.reserve ?? []).map(String);
    const taxiIds = (roster.taxi ?? []).map(String);
    const heldOut = new Set([...starterSet, ...reserveIds, ...taxiIds]);

    const starters = starterIds
      .map((playerId, index) => toSlot(playerId, starterSlots[index] ?? `S${index + 1}`, players))
      .filter((slot): slot is PlayerSlot => slot !== null);

    const bench = (roster.players ?? [])
      .map(String)
      .filter((playerId) => playerId !== "0" && !heldOut.has(playerId))
      .map((playerId) => toSlot(playerId, "BN", players))
      .filter((slot): slot is PlayerSlot => slot !== null)
      .sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name));

    return {
      rosterId: roster.roster_id,
      teamName: resolveTeamName(owner, roster),
      ownerName: cleanName(owner?.display_name) || cleanName(owner?.username) || "Open roster",
      username:
        cleanName(owner?.username) ||
        cleanName(owner?.display_name) ||
        owner?.user_id ||
        "unknown",
      avatar: owner?.avatar ?? null,
      isCommissioner: Boolean(owner?.is_owner),
      wins: roster.settings?.wins ?? 0,
      losses: roster.settings?.losses ?? 0,
      ties: roster.settings?.ties ?? 0,
      pointsFor: sleeperPoints(roster.settings?.fpts, roster.settings?.fpts_decimal),
      pointsAgainst: sleeperPoints(
        roster.settings?.fpts_against,
        roster.settings?.fpts_against_decimal,
      ),
      waiverPosition: roster.settings?.waiver_position ?? 0,
      faabUsed: roster.settings?.waiver_budget_used ?? 0,
      faabBudget,
      streak: roster.metadata?.streak ?? null,
      starters,
      bench,
      reserve: reserveIds
        .map((playerId) => toSlot(playerId, "IR", players))
        .filter((slot): slot is PlayerSlot => slot !== null),
      taxi: taxiIds
        .map((playerId) => toSlot(playerId, "TAXI", players))
        .filter((slot): slot is PlayerSlot => slot !== null),
    };
  });

  teams.sort(standingsSort);

  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));

  const waiverOrder: WaiverOrderRow[] = [...teams]
    .sort((a, b) => a.waiverPosition - b.waiverPosition)
    .map((team) => ({
      waiverPosition: team.waiverPosition,
      rosterId: team.rosterId,
      teamName: team.teamName,
      ownerName: team.ownerName,
    }));

  const rosteredIds = new Set<string>();
  for (const roster of rosters) {
    for (const list of [roster.players, roster.reserve, roster.taxi]) {
      for (const playerId of list ?? []) rosteredIds.add(String(playerId));
    }
  }

  const waiverPlayers: WaiverPlayer[] = [];
  for (const [playerId, player] of Object.entries(players)) {
    if (rosteredIds.has(playerId)) continue;
    if (!isUsefulFantasyPlayer(player)) continue;
    if (!isActiveEnoughForWaivers(player)) continue;
    waiverPlayers.push(toWaiverPlayer(playerId, player));
  }

  waiverPlayers.sort((a, b) => {
    const pos = positionSortValue(a.position) - positionSortValue(b.position);
    if (pos !== 0) return pos;
    const ar = Number.isFinite(Number(a.searchRank)) ? Number(a.searchRank) : 999999;
    const br = Number.isFinite(Number(b.searchRank)) ? Number(b.searchRank) : 999999;
    return ar - br;
  });

  const waiverByPosition: Record<string, WaiverPlayer[]> = {};
  for (const pos of FANTASY_POSITIONS) {
    waiverByPosition[pos] = waiverPlayers
      .filter((player) => player.position === pos)
      .slice(0, WAIVER_PER_POSITION);
  }

  const transactions: LeagueTransaction[] = [];
  for (const { week: txWeek, rows } of txByWeek) {
    for (const tx of rows) {
      const rosterIds = tx.roster_ids ?? [];
      transactions.push({
        week: txWeek,
        type: tx.type ?? "unknown",
        status: tx.status ?? "",
        created: tx.created ?? 0,
        rosterIds,
        teamNames: rosterIds.map(
          (rosterId) => teamsByRosterId.get(rosterId)?.teamName ?? `Roster ${rosterId}`,
        ),
        adds: Object.keys(tx.adds ?? {}).map((playerId) => ({
          playerId,
          name: playerDisplayName(players[playerId], playerId),
        })),
        drops: Object.keys(tx.drops ?? {}).map((playerId) => ({
          playerId,
          name: playerDisplayName(players[playerId], playerId),
        })),
      });
    }
  }
  transactions.sort((a, b) => b.created - a.created);

  const matchups: WeekMatchup[] = [];
  for (const { week: matchWeek, rows } of matchupByWeek) {
    const seen = new Set<number>();
    for (const row of rows) {
      if (row.matchup_id == null || seen.has(row.matchup_id)) continue;
      seen.add(row.matchup_id);
      const pair = rows.filter((item) => item.matchup_id === row.matchup_id);
      if (pair.length < 2) continue;
      matchups.push({
        week: matchWeek,
        matchupId: row.matchup_id,
        teams: pair.map((item) => ({
          rosterId: item.roster_id,
          teamName: teamsByRosterId.get(item.roster_id)?.teamName ?? `Roster ${item.roster_id}`,
          points: Number(item.points || 0),
        })),
      });
    }
  }

  const notes = [
    "Waiver priority is authoritative for this league.",
    "FAAB is intentionally ignored.",
    "NFL team assignments are taken directly from Sleeper.",
    "Waiver/free-agent players are derived from players not currently rostered.",
    "Inactive and invalid database entries are filtered from the primary waiver pool.",
    "Points use Sleeper's fpts + fpts_decimal / 100 (not the decimal field alone).",
    "Fantasy analysis is the V3.3 configuration-driven model. snapshot_version stays 3.2 for compatibility.",
    "Meaningful players are elite, strong, or useful (search rank 1-250). K, DEF, and IDP are outside the offensive optimizer.",
    "Waiver analysis ranks QB, RB, WR, and TE only, using configuration-aware team need and league scarcity.",
  ];

  const fetchedAt = new Date().toISOString();
  const analysis = buildAnalysisBundle(
    teams,
    rosters.map((roster) => roster.roster_id),
    league.roster_positions ?? [],
    waiverPlayers,
    myRosterId,
  );
  const base = {
    fetchedAt,
    leagueId: league.league_id || id,
    leagueName: league.name,
    season: league.season,
    seasonType: league.season_type,
    status: league.status,
    sport: league.sport,
    scoring: scoringLabel(league.scoring_settings?.rec),
    week,
    displayWeek: state.display_week ?? 0,
    rosterSlots: starterSlots,
    benchSlots,
    playoffTeams: league.settings?.playoff_teams ?? 0,
    avatar: league.avatar ?? null,
    myRosterId,
    waiverSystem: "Waiver Priority",
    teams,
    waiverOrder,
    waiverByPosition,
    transactions,
    matchups,
    notes,
    ...analysis,
  };

  return {
    ...base,
    markdown: buildMarkdown(base),
    filename: markdownFilename(base.leagueName, base.season, base.week || base.displayWeek),
    jsonFilename: jsonFilename(base.season, base.week || base.displayWeek),
  };
}
