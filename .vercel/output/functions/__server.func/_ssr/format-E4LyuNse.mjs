import { n as FANTASY_POSITIONS } from "./constants-DPyzQQN_.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/format-E4LyuNse.js
function sleeperPoints(whole, decimal) {
	return (whole ?? 0) + (decimal ?? 0) / 100;
}
function formatPoints(n) {
	return n.toFixed(2);
}
function formatRecord(team) {
	if (team.ties) return `${team.wins}-${team.losses}-${team.ties}`;
	return `${team.wins}-${team.losses}`;
}
function scoringLabel(rec) {
	if (rec === 1) return "PPR";
	if (rec === .5) return "Half PPR";
	if (rec === 0 || rec === void 0) return "Standard";
	return `${rec} PPR`;
}
function playerDisplayName(player, fallbackId) {
	if (!player) return fallbackId;
	const full = player.full_name?.trim();
	if (full) return full;
	return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || fallbackId;
}
function slugify(value) {
	return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function markdownFilename(leagueName, season, week) {
	return `${slugify(leagueName) || "sleeper-league"}-snapshot-${season}-week-${week}.md`;
}
function jsonFilename(season, week) {
	return `Sleeper_Snapshot_${season}-W${String(week).padStart(2, "0")}.json`;
}
function md(value) {
	return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}
function playerLine(player) {
	const team = player.nflTeam ? `, ${player.nflTeam}` : ", FA";
	const injury = player.injuryStatus ? ` (${player.injuryStatus})` : "";
	const pos = player.position && player.position !== player.slot ? ` ${player.position}` : "";
	return `- ${player.slot} — ${player.name}${pos}${team}${injury}`;
}
function playerList(label, players) {
	const lines = ["", label];
	if (players.length === 0) {
		lines.push("- (none)");
		return lines;
	}
	for (const player of players) lines.push(playerLine(player));
	return lines;
}
function buildMarkdown(snapshot) {
	const lines = [];
	const fetched = new Date(snapshot.fetchedAt).toISOString();
	const mine = snapshot.teams.find((team) => team.rosterId === snapshot.myRosterId);
	lines.push(`# ${snapshot.leagueName}`);
	lines.push("");
	lines.push("Sleeper league snapshot formatted for an LLM.");
	lines.push("");
	lines.push(`- League: ${snapshot.leagueName}`);
	lines.push(`- League ID: \`${snapshot.leagueId}\``);
	lines.push(`- Season: ${snapshot.season} ${snapshot.sport.toUpperCase()} ${snapshot.seasonType} season`);
	lines.push(`- Status: ${snapshot.status.replaceAll("_", " ")}`);
	lines.push(`- Scoring: ${snapshot.scoring}`);
	lines.push(`- Waiver system: **${snapshot.waiverSystem}**`);
	lines.push(`- Starting lineup: ${snapshot.rosterSlots.join(", ")} + ${snapshot.benchSlots} bench`);
	lines.push(`- Playoff teams: ${snapshot.playoffTeams}`);
	lines.push(`- NFL week: ${snapshot.week} (Sleeper display week ${snapshot.displayWeek})`);
	lines.push(`- Snapshot generated: ${fetched}`);
	lines.push("");
	lines.push("## My Team");
	lines.push("");
	if (mine) {
		lines.push(`**${md(mine.teamName)}**`);
		lines.push(`- Owner: ${md(mine.ownerName)}`);
		lines.push(`- Record: ${formatRecord(mine)}`);
		lines.push(`- Points: ${formatPoints(mine.pointsFor)} PF / ${formatPoints(mine.pointsAgainst)} PA`);
		lines.push(`- Waiver priority: **${mine.waiverPosition}**`);
		lines.push(...playerList("### Starters", mine.starters));
		lines.push(...playerList("### Bench", mine.bench));
		if (mine.reserve.length) lines.push(...playerList("### IR / Reserve", mine.reserve));
		if (mine.taxi.length) lines.push(...playerList("### Taxi", mine.taxi));
		lines.push("");
	} else {
		lines.push("- My team was not found for the selected roster ID.");
		lines.push("");
	}
	lines.push("## Standings");
	lines.push("");
	lines.push("| Rank | Team | Record | PF | PA | Waiver |");
	lines.push("|---:|---|---|---:|---:|---:|");
	snapshot.teams.forEach((team, index) => {
		const mark = team.rosterId === snapshot.myRosterId ? " (my team)" : "";
		lines.push(`| ${index + 1} | ${md(team.teamName)}${mark} | ${formatRecord(team)} | ${formatPoints(team.pointsFor)} | ${formatPoints(team.pointsAgainst)} | ${team.waiverPosition} |`);
	});
	lines.push("");
	lines.push("## Waiver Order");
	lines.push("");
	for (const row of snapshot.waiverOrder) lines.push(`${row.waiverPosition}. **${md(row.teamName)}** (${md(row.ownerName)})`);
	lines.push("");
	lines.push("## Rosters");
	for (const team of snapshot.teams) {
		const mineLabel = team.rosterId === snapshot.myRosterId ? " — my team" : "";
		lines.push("");
		lines.push(`### ${md(team.teamName)}${mineLabel}`);
		lines.push("");
		lines.push(`- Owner: ${md(team.ownerName)}`);
		if (team.isCommissioner) lines.push("- Role: commissioner");
		lines.push(`- Roster ID: ${team.rosterId}`);
		lines.push(`- Record: ${formatRecord(team)}${team.streak ? ` · streak ${team.streak}` : ""}`);
		lines.push(`- Points: ${formatPoints(team.pointsFor)} PF / ${formatPoints(team.pointsAgainst)} PA`);
		lines.push(`- Waiver priority: ${team.waiverPosition}`);
		lines.push(...playerList("**Starters**", team.starters));
		lines.push(...playerList("**Bench**", team.bench));
		if (team.reserve.length) lines.push(...playerList("**IR / Reserve**", team.reserve));
		if (team.taxi.length) lines.push(...playerList("**Taxi**", team.taxi));
	}
	lines.push("");
	lines.push("## Recent Transactions");
	lines.push("");
	if (snapshot.transactions.length === 0) lines.push("- No transactions returned.");
	else for (const tx of snapshot.transactions.slice(0, 100)) {
		const teams = tx.teamNames.join(" / ") || "Unknown team";
		const adds = tx.adds.map((player) => player.name).join(", ");
		const drops = tx.drops.map((player) => player.name).join(", ");
		let text = `- Week ${tx.week} | **${md(teams)}** | ${tx.type}`;
		if (tx.status && tx.status !== "complete") text += ` (${tx.status})`;
		if (adds) text += ` | ADD: ${md(adds)}`;
		if (drops) text += ` | DROP: ${md(drops)}`;
		lines.push(text);
	}
	lines.push("");
	lines.push("## Available Waiver / Free-Agent Players");
	lines.push("");
	lines.push("_Primary waiver pool only. Inactive and invalid database entries are filtered out._");
	lines.push("");
	for (const pos of FANTASY_POSITIONS) {
		lines.push(`### ${pos}`);
		lines.push("");
		const list = snapshot.waiverByPosition[pos] ?? [];
		if (list.length === 0) lines.push("- None found.");
		else for (const player of list) {
			let line = `- **${md(player.name)}**`;
			if (player.nflTeam) line += ` (${player.nflTeam})`;
			if (player.injuryStatus) line += ` [${player.injuryStatus}]`;
			lines.push(line);
		}
		lines.push("");
	}
	lines.push("## Matchups");
	lines.push("");
	const weeks = [...new Set(snapshot.matchups.map((game) => game.week))].sort((a, b) => a - b);
	if (weeks.length === 0) {
		lines.push("- No matchups returned.");
		lines.push("");
	} else for (const week of weeks) {
		lines.push(`### Week ${week}`);
		lines.push("");
		const games = snapshot.matchups.filter((game) => game.week === week);
		for (const game of games) {
			const [a, b] = game.teams;
			if (!a || !b) continue;
			lines.push(`- ${md(a.teamName)} (${formatPoints(a.points)}) vs ${md(b.teamName)} (${formatPoints(b.points)})`);
		}
		lines.push("");
	}
	lines.push("## Data Notes");
	lines.push("");
	for (const note of snapshot.notes) lines.push(`- ${note}`);
	lines.push("");
	return lines.join("\n");
}
function applyMyRoster(snapshot, myRosterId) {
	const next = {
		...snapshot,
		myRosterId
	};
	return {
		...next,
		markdown: buildMarkdown(next)
	};
}
function snapshotJson(snapshot) {
	const { markdown: _markdown, ...rest } = snapshot;
	return rest;
}
function initials(name) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
//#endregion
export { initials as a, playerDisplayName as c, snapshotJson as d, formatRecord as i, scoringLabel as l, buildMarkdown as n, jsonFilename as o, formatPoints as r, markdownFilename as s, applyMyRoster as t, sleeperPoints as u };
