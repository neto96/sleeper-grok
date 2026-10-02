import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MY_ROSTER_ID } from "./constants";
import type { LeagueSnapshot } from "./types";

const inputSchema = z.object({
  leagueId: z
    .string()
    .trim()
    .min(4, "Enter a Sleeper league ID.")
    .regex(/^[0-9]+$/, "League ID should be numbers only."),
  myRosterId: z.number().int().positive().optional(),
});

export const fetchLeagueRosters = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }): Promise<LeagueSnapshot> => {
    const { loadLeagueSnapshot } = await import("./sleeper.server");
    return loadLeagueSnapshot(data.leagueId, data.myRosterId ?? DEFAULT_MY_ROSTER_ID);
  });
