export const DEFAULT_LEAGUE_ID = "1389736505374691328";
export const DEFAULT_MY_ROSTER_ID = 3;
export const SLEEPER_API = "https://api.sleeper.app/v1";
export const SLEEPER_SCHEDULE_API = "https://api.sleeper.com/schedule";
export const SLEEPER_AVATAR = "https://sleepercdn.com/avatars/thumbs";
export const LEAGUE_ID_STORAGE_KEY = "roster-brief:league-id";
export const MY_ROSTER_STORAGE_KEY = "roster-brief:my-roster-id";

export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];
