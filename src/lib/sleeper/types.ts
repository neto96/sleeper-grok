import type { AnalysisRecord } from "./analysis/engine";

export type PlayerSlot = {
  playerId: string;
  name: string;
  position: string;
  slot: string;
  nflTeam: string | null;
  injuryStatus: string | null;
  status: string | null;
  number: number | null;
  searchRank: number | null;
};

export type TeamRoster = {
  rosterId: number;
  teamName: string;
  ownerName: string;
  username: string;
  avatar: string | null;
  isCommissioner: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  waiverPosition: number;
  faabUsed: number;
  faabBudget: number;
  streak: string | null;
  starters: PlayerSlot[];
  bench: PlayerSlot[];
  reserve: PlayerSlot[];
  taxi: PlayerSlot[];
};

export type WaiverPlayer = {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: string | null;
  status: string | null;
  searchRank: number | null;
};

export type WaiverOrderRow = {
  waiverPosition: number;
  rosterId: number;
  teamName: string;
  ownerName: string;
};

export type LeagueTransaction = {
  week: number;
  type: string;
  status: string;
  created: number;
  rosterIds: number[];
  teamNames: string[];
  adds: { playerId: string; name: string }[];
  drops: { playerId: string; name: string }[];
};

export type WeekMatchup = {
  week: number;
  matchupId: number;
  teams: { rosterId: number; teamName: string; points: number }[];
};

export type LeagueSnapshot = {
  fetchedAt: string;
  leagueId: string;
  leagueName: string;
  season: string;
  seasonType: string;
  status: string;
  sport: string;
  scoring: string;
  week: number;
  displayWeek: number;
  rosterSlots: string[];
  benchSlots: number;
  playoffTeams: number;
  avatar: string | null;
  myRosterId: number;
  waiverSystem: string;
  teams: TeamRoster[];
  waiverOrder: WaiverOrderRow[];
  waiverByPosition: Record<string, WaiverPlayer[]>;
  transactions: LeagueTransaction[];
  matchups: WeekMatchup[];
  notes: string[];
  snapshotVersion: "3.2";
  fantasyAnalysis: AnalysisRecord;
  waiverAnalysis: AnalysisRecord;
  /** Offensive free agents used to rescore waivers when the selected team changes. Omitted from the JSON download. */
  analysisWaiverPool: AnalysisRecord[];
  markdown: string;
  filename: string;
  jsonFilename: string;
};
