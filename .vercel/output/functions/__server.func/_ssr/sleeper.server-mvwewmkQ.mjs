import { a as SLEEPER_API, n as FANTASY_POSITIONS } from "./constants-DPyzQQN_.mjs";
import { c as playerDisplayName, l as scoringLabel, n as buildMarkdown, o as jsonFilename, s as markdownFilename, u as sleeperPoints } from "./format-E4LyuNse.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sleeper.server-mvwewmkQ.js
var PLAYER_TTL_MS = 864e5;
var WAIVER_PER_POSITION = 30;
var playerCache = null;
async function sleeperGet(path) {
	const response = await fetch(`${SLEEPER_API}${path}`, { headers: { Accept: "application/json" } });
	if (response.status === 404) throw new Error("League not found on Sleeper. Check the league ID.");
	if (!response.ok) throw new Error(`Sleeper request failed (${response.status}).`);
	return await response.json();
}
async function sleeperGetOptional(path, fallback) {
	try {
		return await sleeperGet(path);
	} catch {
		return fallback;
	}
}
async function getPlayerMap() {
	if (playerCache && Date.now() - playerCache.at < PLAYER_TTL_MS) return playerCache.map;
	const map = await sleeperGet("/players/nfl");
	playerCache = {
		at: Date.now(),
		map
	};
	return map;
}
function cleanName(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}
function resolveTeamName(user, roster) {
	return cleanName(user?.metadata?.team_name) || cleanName(roster.metadata?.team_name) || cleanName(user?.display_name) || cleanName(user?.username) || `Roster ${roster.roster_id}`;
}
function toSlot(playerId, slot, players) {
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
		number: player?.number ?? null
	};
}
function toWaiverPlayer(id, player) {
	return {
		playerId: id,
		name: playerDisplayName(player, id),
		position: player.position ?? "—",
		nflTeam: player.team ?? null,
		injuryStatus: player.injury_status ?? null,
		status: player.status ?? null,
		searchRank: player.search_rank ?? null
	};
}
function isUsefulFantasyPlayer(player) {
	if (!FANTASY_POSITIONS.includes(player.position)) return false;
	const name = playerDisplayName(player, "").toLowerCase();
	if (!name) return false;
	if (name.includes("player invalid") || name === "duplicate player") return false;
	return true;
}
function isActiveEnoughForWaivers(player) {
	if (player.position !== "K" && !player.team) return false;
	const status = String(player.status || "").toLowerCase();
	return status !== "inactive" && status !== "retired";
}
function positionSortValue(position) {
	return {
		QB: 1,
		RB: 2,
		WR: 3,
		TE: 4,
		K: 5,
		DEF: 6
	}[position] ?? 99;
}
function standingsSort(a, b) {
	if (b.wins !== a.wins) return b.wins - a.wins;
	if (b.ties !== a.ties) return b.ties - a.ties;
	if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
	return a.teamName.localeCompare(b.teamName);
}
function recentWeeks(currentWeek) {
	return [.../* @__PURE__ */ new Set([
		Math.max(1, currentWeek - 2),
		Math.max(1, currentWeek - 1),
		currentWeek
	])];
}
async function loadLeagueSnapshot(leagueId, myRosterId = 3) {
	const id = leagueId.trim();
	const [league, users, rosters, state] = await Promise.all([
		sleeperGet(`/league/${id}`),
		sleeperGet(`/league/${id}/users`),
		sleeperGet(`/league/${id}/rosters`),
		sleeperGet("/state/nfl")
	]);
	if (!league) throw new Error("League not found on Sleeper. Check the league ID.");
	const week = state.week ?? 1;
	const weeks = recentWeeks(week);
	const [players, txByWeek, matchupByWeek] = await Promise.all([
		getPlayerMap().catch(() => ({})),
		Promise.all(weeks.map(async (w) => ({
			week: w,
			rows: await sleeperGetOptional(`/league/${id}/transactions/${w}`, [])
		}))),
		Promise.all(weeks.map(async (w) => ({
			week: w,
			rows: await sleeperGetOptional(`/league/${id}/matchups/${w}`, [])
		})))
	]);
	const usersById = new Map(users.map((user) => [user.user_id, user]));
	const starterSlots = (league.roster_positions ?? []).filter((slot) => slot !== "BN");
	const benchSlots = (league.roster_positions ?? []).filter((slot) => slot === "BN").length;
	const faabBudget = league.settings?.waiver_budget ?? 100;
	const teams = rosters.map((roster) => {
		const owner = roster.owner_id ? usersById.get(roster.owner_id) : void 0;
		const starterIds = (roster.starters ?? []).map(String).filter((playerId) => playerId !== "0");
		const starterSet = new Set(starterIds);
		const reserveIds = (roster.reserve ?? []).map(String);
		const taxiIds = (roster.taxi ?? []).map(String);
		const heldOut = /* @__PURE__ */ new Set([
			...starterSet,
			...reserveIds,
			...taxiIds
		]);
		const starters = starterIds.map((playerId, index) => toSlot(playerId, starterSlots[index] ?? `S${index + 1}`, players)).filter((slot) => slot !== null);
		const bench = (roster.players ?? []).map(String).filter((playerId) => playerId !== "0" && !heldOut.has(playerId)).map((playerId) => toSlot(playerId, "BN", players)).filter((slot) => slot !== null).sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name));
		return {
			rosterId: roster.roster_id,
			teamName: resolveTeamName(owner, roster),
			ownerName: cleanName(owner?.display_name) || cleanName(owner?.username) || "Open roster",
			username: cleanName(owner?.username) || cleanName(owner?.display_name) || owner?.user_id || "unknown",
			avatar: owner?.avatar ?? null,
			isCommissioner: Boolean(owner?.is_owner),
			wins: roster.settings?.wins ?? 0,
			losses: roster.settings?.losses ?? 0,
			ties: roster.settings?.ties ?? 0,
			pointsFor: sleeperPoints(roster.settings?.fpts, roster.settings?.fpts_decimal),
			pointsAgainst: sleeperPoints(roster.settings?.fpts_against, roster.settings?.fpts_against_decimal),
			waiverPosition: roster.settings?.waiver_position ?? 0,
			faabUsed: roster.settings?.waiver_budget_used ?? 0,
			faabBudget,
			streak: roster.metadata?.streak ?? null,
			starters,
			bench,
			reserve: reserveIds.map((playerId) => toSlot(playerId, "IR", players)).filter((slot) => slot !== null),
			taxi: taxiIds.map((playerId) => toSlot(playerId, "TAXI", players)).filter((slot) => slot !== null)
		};
	});
	teams.sort(standingsSort);
	const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));
	const waiverOrder = [...teams].sort((a, b) => a.waiverPosition - b.waiverPosition).map((team) => ({
		waiverPosition: team.waiverPosition,
		rosterId: team.rosterId,
		teamName: team.teamName,
		ownerName: team.ownerName
	}));
	const rosteredIds = /* @__PURE__ */ new Set();
	for (const roster of rosters) for (const list of [
		roster.players,
		roster.reserve,
		roster.taxi
	]) for (const playerId of list ?? []) rosteredIds.add(String(playerId));
	const waiverPlayers = [];
	for (const [playerId, player] of Object.entries(players)) {
		if (rosteredIds.has(playerId)) continue;
		if (!isUsefulFantasyPlayer(player)) continue;
		if (!isActiveEnoughForWaivers(player)) continue;
		waiverPlayers.push(toWaiverPlayer(playerId, player));
	}
	waiverPlayers.sort((a, b) => {
		const pos = positionSortValue(a.position) - positionSortValue(b.position);
		if (pos !== 0) return pos;
		return (Number.isFinite(Number(a.searchRank)) ? Number(a.searchRank) : 999999) - (Number.isFinite(Number(b.searchRank)) ? Number(b.searchRank) : 999999);
	});
	const waiverByPosition = {};
	for (const pos of FANTASY_POSITIONS) waiverByPosition[pos] = waiverPlayers.filter((player) => player.position === pos).slice(0, WAIVER_PER_POSITION);
	const transactions = [];
	for (const { week: txWeek, rows } of txByWeek) for (const tx of rows) {
		const rosterIds = tx.roster_ids ?? [];
		transactions.push({
			week: txWeek,
			type: tx.type ?? "unknown",
			status: tx.status ?? "",
			created: tx.created ?? 0,
			rosterIds,
			teamNames: rosterIds.map((rosterId) => teamsByRosterId.get(rosterId)?.teamName ?? `Roster ${rosterId}`),
			adds: Object.keys(tx.adds ?? {}).map((playerId) => ({
				playerId,
				name: playerDisplayName(players[playerId], playerId)
			})),
			drops: Object.keys(tx.drops ?? {}).map((playerId) => ({
				playerId,
				name: playerDisplayName(players[playerId], playerId)
			}))
		});
	}
	transactions.sort((a, b) => b.created - a.created);
	const matchups = [];
	for (const { week: matchWeek, rows } of matchupByWeek) {
		const seen = /* @__PURE__ */ new Set();
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
					points: Number(item.points || 0)
				}))
			});
		}
	}
	const base = {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
		notes: [
			"Waiver priority is authoritative for this league.",
			"FAAB is intentionally ignored.",
			"NFL team assignments are taken directly from Sleeper.",
			"Waiver/free-agent players are derived from players not currently rostered.",
			"Inactive and invalid database entries are filtered from the primary waiver pool.",
			"Points use Sleeper's fpts + fpts_decimal / 100 (not the decimal field alone)."
		]
	};
	return {
		...base,
		markdown: buildMarkdown(base),
		filename: markdownFilename(base.leagueName, base.season, base.week || base.displayWeek),
		jsonFilename: jsonFilename(base.season, base.week || base.displayWeek)
	};
}
//#endregion
export { loadLeagueSnapshot };
