import { FANTASY_POSITIONS } from "./constants";
import {
  SNAPSHOT_VERSION,
  buildFantasyAnalysis,
  buildWaiverAnalysis,
  parseRosterConfiguration,
  type AnalysisRecord,
} from "./analysis/engine";
import type { LeagueSnapshot, PlayerSlot, TeamRoster, WaiverPlayer } from "./types";

export function sleeperPoints(whole?: number | null, decimal?: number | null): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

export function formatPoints(n: number): string {
  return n.toFixed(2);
}

export function formatRecord(team: Pick<TeamRoster, "wins" | "losses" | "ties">): string {
  if (team.ties) return `${team.wins}-${team.losses}-${team.ties}`;
  return `${team.wins}-${team.losses}`;
}

export function scoringLabel(rec: number | undefined): string {
  if (rec === 1) return "PPR";
  if (rec === 0.5) return "Half PPR";
  if (rec === 0 || rec === undefined) return "Standard";
  return `${rec} PPR`;
}

export function playerDisplayName(
  player:
    | {
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | null
    | undefined,
  fallbackId: string,
): string {
  if (!player) return fallbackId;
  const full = player.full_name?.trim();
  if (full) return full;
  const joined = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  return joined || fallbackId;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function markdownFilename(leagueName: string, season: string, week: number): string {
  const slug = slugify(leagueName) || "sleeper-league";
  return `${slug}-snapshot-${season}-week-${week}.md`;
}

export function jsonFilename(season: string, week: number): string {
  return `Sleeper_Snapshot_${season}-W${String(week).padStart(2, "0")}.json`;
}

function md(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .trim();
}

function playerLine(player: PlayerSlot): string {
  const team = player.nflTeam ? `, ${player.nflTeam}` : ", FA";
  const injury = player.injuryStatus ? ` (${player.injuryStatus})` : "";
  const pos = player.position && player.position !== player.slot ? ` ${player.position}` : "";
  return `- ${player.slot} — ${player.name}${pos}${team}${injury}`;
}

function analysisPlayer(player: PlayerSlot): AnalysisRecord {
  return {
    player_id: player.playerId,
    name: player.name,
    position: player.position,
    team: player.nflTeam,
    status: player.status,
    injury_status: player.injuryStatus,
    search_rank: player.searchRank,
  };
}

export const WAIVER_ANALYSIS_EXPORT_LIMIT = 40;

export function presentWaiverAnalysis(
  fantasyAnalysis: AnalysisRecord,
  waiverPool: AnalysisRecord[],
  myRosterId: number,
): AnalysisRecord {
  const full = buildWaiverAnalysis(waiverPool, fantasyAnalysis, myRosterId);
  const candidates = Array.isArray(full.candidates) ? full.candidates.slice(0, WAIVER_ANALYSIS_EXPORT_LIMIT) : [];
  return { ...full, candidates };
}

export function buildAnalysisBundle(
  teams: TeamRoster[],
  rosterOrder: number[],
  rosterPositions: string[],
  waiverPlayers: WaiverPlayer[],
  myRosterId: number,
) {
  const byId = new Map(teams.map((team) => [team.rosterId, team]));
  const rosterData: Record<string, AnalysisRecord> = {};
  for (const rosterId of rosterOrder) {
    const team = byId.get(rosterId);
    if (!team) continue;
    const players = [...team.starters, ...team.bench, ...team.reserve, ...team.taxi];
    rosterData[String(rosterId)] = {
      team_name: team.teamName,
      owner: team.ownerName,
      players: players.map(analysisPlayer),
      starters: team.starters.map((player) => ({ player_id: player.playerId })),
      reserve: team.reserve.map((player) => ({ player_id: player.playerId })),
      taxi: team.taxi.map((player) => ({ player_id: player.playerId })),
    };
  }
  const fantasyAnalysis = buildFantasyAnalysis(rosterData, parseRosterConfiguration(rosterPositions));
  const analysisWaiverPool = waiverPlayers
    .filter((player) => player.position === "QB" || player.position === "RB" || player.position === "WR" || player.position === "TE")
    .map((player) => ({
      player_id: player.playerId,
      name: player.name,
      position: player.position,
      team: player.nflTeam,
      status: player.status,
      injury_status: player.injuryStatus,
      search_rank: player.searchRank,
    }));
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    fantasyAnalysis,
    waiverAnalysis: presentWaiverAnalysis(fantasyAnalysis, analysisWaiverPool, myRosterId),
    analysisWaiverPool,
  };
}

function teamAnalysis(snapshot: SnapshotContent, rosterId: number): AnalysisRecord | undefined {
  const teams = snapshot.fantasyAnalysis?.teams as Record<string, AnalysisRecord> | undefined;
  return teams?.[String(rosterId)];
}

function analysisMarkdown(snapshot: SnapshotContent): string[] {
  const analysis = snapshot.fantasyAnalysis;
  if (!analysis) return [];
  const lines: string[] = ["", "## Fantasy Analysis", ""];
  lines.push("Configuration-aware V3.3 analysis. `snapshot_version` remains `3.2`.");
  lines.push("");
  const requirements = analysis.lineup_requirements as Record<string, number> | undefined;
  if (requirements) {
    const slots = Object.entries(requirements)
      .map(([slot, count]) => `${count} ${slot}`)
      .join(", ");
    lines.push(`- Lineup requirements: ${slots}`);
  }
  const flex = analysis.flex_slot_requirements as Record<string, { count?: number; eligible_positions?: string[] }> | undefined;
  if (flex && Object.keys(flex).length > 0) {
    for (const [code, slot] of Object.entries(flex)) {
      lines.push(`- ${code}: ${slot.count} slot(s) for ${(slot.eligible_positions ?? []).join("/")}`);
    }
  }
  const scarcity = analysis.league_position_scarcity as Record<string, AnalysisRecord> | undefined;
  if (scarcity) {
    const text = ["QB", "RB", "WR", "TE"]
      .filter((position) => scarcity[position])
      .map((position) => `${position} ${scarcity[position]?.scarcity}`)
      .join(", ");
    lines.push(`- League scarcity: ${text}`);
  }
  lines.push("");
  const mine = teamAnalysis(snapshot, snapshot.myRosterId);
  if (!mine) {
    lines.push("- Analysis for the selected team was not available.");
    return lines;
  }
  lines.push(`### ${md(String(mine.team_name || "My team"))}`);
  lines.push("");
  const lineup = (mine.optimal_lineup ?? {}) as Record<string, AnalysisRecord[]>;
  lines.push("**Optimal lineup**");
  for (const [slot, players] of Object.entries(lineup)) {
    if (!players?.length) continue;
    lines.push(`- ${slot}: ${players.map((player) => md(String(player.name || player.player_id))).join(", ")}`);
  }
  lines.push("");
  lines.push("**Position need**");
  const need = (mine.position_need ?? {}) as Record<string, AnalysisRecord>;
  for (const position of ["QB", "RB", "WR", "TE"]) {
    const row = need[position];
    if (!row) continue;
    lines.push(`- ${position}: **${row.need}** — ${md(String(row.reason ?? ""))}`);
  }
  lines.push("");
  lines.push("**Lineup strength / starting depth**");
  const strength = (mine.lineup_strength ?? {}) as Record<string, AnalysisRecord>;
  const depth = (mine.starting_depth ?? {}) as Record<string, AnalysisRecord>;
  for (const position of ["QB", "RB", "WR", "TE"]) {
    const rating = strength[position]?.rating;
    const label = depth[position]?.starting_depth;
    if (!rating && !label) continue;
    lines.push(`- ${position}: strength ${rating}, depth ${label}`);
  }
  const protect = ((mine.player_protection ?? []) as AnalysisRecord[]).filter((player) => player.protection === "protect");
  if (protect.length) {
    lines.push("");
    lines.push("**Protect**");
    for (const player of protect.slice(0, 8)) {
      lines.push(`- ${md(String(player.name))} (${player.position}, ${player.fantasy_value_tier}) — ${md(String(player.reason ?? ""))}`);
    }
  }
  const surplus = ((mine.roster_surplus ?? []) as AnalysisRecord[]).filter((player) => player.surplus_type === "surplus");
  if (surplus.length) {
    lines.push("");
    lines.push("**Surplus**");
    for (const player of surplus.slice(0, 8)) {
      lines.push(`- ${md(String(player.name))} (${player.position}, ${player.fantasy_value_tier})`);
    }
  }
  lines.push("");
  return lines;
}

function playerList(label: string, players: PlayerSlot[]) {
  const lines = ["", label];
  if (players.length === 0) {
    lines.push("- (none)");
    return lines;
  }
  for (const player of players) lines.push(playerLine(player));
  return lines;
}

type SnapshotContent = Omit<LeagueSnapshot, "markdown" | "filename" | "jsonFilename">;

export function buildMarkdown(snapshot: SnapshotContent): string {
  const lines: string[] = [];
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
  lines.push(
    `- Starting lineup: ${snapshot.rosterSlots.join(", ")} + ${snapshot.benchSlots} bench`,
  );
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
    lines.push(
      `- Points: ${formatPoints(mine.pointsFor)} PF / ${formatPoints(mine.pointsAgainst)} PA`,
    );
    lines.push(`- Waiver priority: **${mine.waiverPosition}**`);
    lines.push(...playerList("### Starters", mine.starters));
    lines.push(...playerList("### Bench", mine.bench));
    if (mine.reserve.length) lines.push(...playerList("### IR / Reserve", mine.reserve));
    if (mine.taxi.length) lines.push(...playerList("### Taxi", mine.taxi));
    lines.push(...analysisMarkdown(snapshot));
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
    lines.push(
      `| ${index + 1} | ${md(team.teamName)}${mark} | ${formatRecord(team)} | ${formatPoints(team.pointsFor)} | ${formatPoints(team.pointsAgainst)} | ${team.waiverPosition} |`,
    );
  });
  lines.push("");

  lines.push("## Waiver Order");
  lines.push("");
  for (const row of snapshot.waiverOrder) {
    lines.push(`${row.waiverPosition}. **${md(row.teamName)}** (${md(row.ownerName)})`);
  }
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
    lines.push(
      `- Record: ${formatRecord(team)}${team.streak ? ` · streak ${team.streak}` : ""}`,
    );
    lines.push(
      `- Points: ${formatPoints(team.pointsFor)} PF / ${formatPoints(team.pointsAgainst)} PA`,
    );
    lines.push(`- Waiver priority: ${team.waiverPosition}`);
    lines.push(...playerList("**Starters**", team.starters));
    lines.push(...playerList("**Bench**", team.bench));
    if (team.reserve.length) lines.push(...playerList("**IR / Reserve**", team.reserve));
    if (team.taxi.length) lines.push(...playerList("**Taxi**", team.taxi));
  }

  lines.push("");
  lines.push("## Recent Transactions");
  lines.push("");
  if (snapshot.transactions.length === 0) {
    lines.push("- No transactions returned.");
  } else {
    for (const tx of snapshot.transactions.slice(0, 100)) {
      const teams = tx.teamNames.join(" / ") || "Unknown team";
      const adds = tx.adds.map((player) => player.name).join(", ");
      const drops = tx.drops.map((player) => player.name).join(", ");
      let text = `- Week ${tx.week} | **${md(teams)}** | ${tx.type}`;
      if (tx.status && tx.status !== "complete") text += ` (${tx.status})`;
      if (adds) text += ` | ADD: ${md(adds)}`;
      if (drops) text += ` | DROP: ${md(drops)}`;
      lines.push(text);
    }
  }
  lines.push("");

  lines.push("## Available Waiver / Free-Agent Players");
  lines.push("");
  const waiver = snapshot.waiverAnalysis;
  const candidates = Array.isArray(waiver?.candidates) ? (waiver.candidates as AnalysisRecord[]) : [];
  if (waiver?.available && candidates.length > 0) {
    lines.push(`### Suggested adds for ${md(String(waiver.team ?? "my team"))}`);
    lines.push("");
    lines.push("_QB/RB/WR/TE only. Ranked by the V3.3 waiver score (search rank + team need + league scarcity)._");
    lines.push("");
    for (const player of candidates.slice(0, 20)) {
      lines.push(
        `- **${md(String(player.name))}** (${player.position}${player.team ? `, ${player.team}` : ""}) — score ${player.waiver_value_score}, need ${player.team_need}, scarcity ${player.league_scarcity}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "_Primary waiver pool only. Inactive and invalid database entries are filtered out._",
  );
  lines.push("");
  for (const pos of FANTASY_POSITIONS) {
    lines.push(`### ${pos}`);
    lines.push("");
    const list = snapshot.waiverByPosition[pos] ?? [];
    if (list.length === 0) {
      lines.push("- None found.");
    } else {
      for (const player of list) {
        let line = `- **${md(player.name)}**`;
        if (player.nflTeam) line += ` (${player.nflTeam})`;
        if (player.injuryStatus) line += ` [${player.injuryStatus}]`;
        lines.push(line);
      }
    }
    lines.push("");
  }

  lines.push("## Matchups");
  lines.push("");
  const weeks = [...new Set(snapshot.matchups.map((game) => game.week))].sort((a, b) => a - b);
  if (weeks.length === 0) {
    lines.push("- No matchups returned.");
    lines.push("");
  } else {
    for (const week of weeks) {
      lines.push(`### Week ${week}`);
      lines.push("");
      const games = snapshot.matchups.filter((game) => game.week === week);
      for (const game of games) {
        const [a, b] = game.teams;
        if (!a || !b) continue;
        lines.push(
          `- ${md(a.teamName)} (${formatPoints(a.points)}) vs ${md(b.teamName)} (${formatPoints(b.points)})`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Data Notes");
  lines.push("");
  for (const note of snapshot.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function applyMyRoster(snapshot: LeagueSnapshot, myRosterId: number): LeagueSnapshot {
  const next = {
    ...snapshot,
    myRosterId,
    waiverAnalysis: presentWaiverAnalysis(snapshot.fantasyAnalysis, snapshot.analysisWaiverPool ?? [], myRosterId),
  };
  return { ...next, markdown: buildMarkdown(next) };
}

export function snapshotJson(snapshot: LeagueSnapshot) {
  const { markdown: _markdown, analysisWaiverPool: _pool, snapshotVersion, fantasyAnalysis, waiverAnalysis, ...rest } = snapshot;
  return {
    ...rest,
    snapshot_version: snapshotVersion,
    fantasy_analysis: fantasyAnalysis,
    waiver_analysis: waiverAnalysis,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
