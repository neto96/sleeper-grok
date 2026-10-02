import type { AnalysisRecord } from "./engine.ts";

export type Availability = "available" | "uncertain" | "unavailable" | "unknown";

export type AvailabilityReason =
  | "active"
  | "questionable"
  | "injury_out"
  | "injury_ir"
  | "injury_na"
  | "injury_pup"
  | "injury_dnr"
  | "status_inactive"
  | "status_practice_squad"
  | "roster_reserve"
  | "roster_taxi"
  | "unknown_status";

export type AvailabilityAssessment = {
  availability: Availability;
  reason: AvailabilityReason;
  currently_usable: boolean;
};

type AvailabilityInput = Pick<
  AnalysisRecord,
  "position" | "status" | "injury_status" | "roster_status"
>;

function normalizeEmpty(value: unknown): unknown {
  return value === "" ? null : value;
}

function unavailable(reason: AvailabilityReason): AvailabilityAssessment {
  return { availability: "unavailable", reason, currently_usable: false };
}

/**
 * Interpret health availability separately from roster slot status.
 * Reserve and taxi precedence is applied here; starter and bench status do not
 * make an otherwise available player unavailable.
 */
export function assessAvailability(player: AvailabilityInput): AvailabilityAssessment {
  const status = normalizeEmpty(player.status);
  const injuryStatus = normalizeEmpty(player.injury_status);

  if (player.roster_status === "reserve") return unavailable("roster_reserve");
  if (player.roster_status === "taxi") return unavailable("roster_taxi");

  if (status === "Inactive" || status === "Retired") {
    return unavailable("status_inactive");
  }
  if (status === "Practice Squad") {
    return unavailable("status_practice_squad");
  }

  if (injuryStatus === "Out" || injuryStatus === "Doubtful" || injuryStatus === "Sus") {
    // Doubtful and Sus have no dedicated public reasons in the agreed result type.
    return unavailable("injury_out");
  }
  if (injuryStatus === "IR") return unavailable("injury_ir");
  if (injuryStatus === "NA") return unavailable("injury_na");
  if (injuryStatus === "PUP") return unavailable("injury_pup");
  if (injuryStatus === "DNR") return unavailable("injury_dnr");

  if (injuryStatus === "Questionable") {
    return { availability: "uncertain", reason: "questionable", currently_usable: true };
  }

  if (
    injuryStatus === null &&
    (status === "Active" || (status === null && player.position === "DEF"))
  ) {
    return { availability: "available", reason: "active", currently_usable: true };
  }

  return { availability: "unknown", reason: "unknown_status", currently_usable: false };
}
