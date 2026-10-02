import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessAvailability } from "./availability.ts";
import type { AnalysisRecord } from "./engine.ts";

function makePlayer(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    player_id: "fixture-player",
    position: "RB",
    status: "Active",
    injury_status: null,
    roster_status: "bench",
    ...overrides,
  };
}

function expectAssessment(
  input: Partial<AnalysisRecord>,
  availability: string,
  reason: string,
  currentlyUsable: boolean,
): void {
  assert.deepEqual(assessAvailability(makePlayer(input)), {
    availability,
    reason,
    currently_usable: currentlyUsable,
  });
}

describe("assessAvailability status matrix", () => {
  const cases: Array<[string, Partial<AnalysisRecord>, string, string, boolean]> = [
    ["Active with null injury", { status: "Active", injury_status: null }, "available", "active", true],
    ["Active with empty injury", { status: "Active", injury_status: "" }, "available", "active", true],
    ["Active with empty-string injury", { status: "Active", injury_status: "" }, "available", "active", true],
    ["Active with Questionable", { status: "Active", injury_status: "Questionable" }, "uncertain", "questionable", true],
    ["Active with Out", { status: "Active", injury_status: "Out" }, "unavailable", "injury_out", false],
    ["Active with IR", { status: "Active", injury_status: "IR" }, "unavailable", "injury_ir", false],
    ["Active with NA", { status: "Active", injury_status: "NA" }, "unavailable", "injury_na", false],
    ["Active with PUP", { status: "Active", injury_status: "PUP" }, "unavailable", "injury_pup", false],
    ["Active with DNR", { status: "Active", injury_status: "DNR" }, "unavailable", "injury_dnr", false],
    ["Active with Doubtful", { status: "Active", injury_status: "Doubtful" }, "unavailable", "injury_out", false],
    ["Active with Sus", { status: "Active", injury_status: "Sus" }, "unavailable", "injury_out", false],
    ["Inactive with IR", { status: "Inactive", injury_status: "IR" }, "unavailable", "status_inactive", false],
    ["Inactive with PUP", { status: "Inactive", injury_status: "PUP" }, "unavailable", "status_inactive", false],
    ["Retired", { status: "Retired", injury_status: null }, "unavailable", "status_inactive", false],
    ["Practice Squad with NA", { status: "Practice Squad", injury_status: "NA" }, "unavailable", "status_practice_squad", false],
    ["unknown status and injury", { status: "Other", injury_status: "Other" }, "unknown", "unknown_status", false],
    ["missing status", { status: null, injury_status: null }, "unknown", "unknown_status", false],
  ];

  for (const [name, input, availability, reason, usable] of cases) {
    it(name, () => expectAssessment(input, availability, reason, usable));
  }
});

describe("assessAvailability roster status precedence", () => {
  it("keeps a healthy starter usable", () => {
    expectAssessment({ roster_status: "starter" }, "available", "active", true);
  });

  it("keeps a healthy bench player usable", () => {
    expectAssessment({ roster_status: "bench" }, "available", "active", true);
  });

  it("makes a healthy reserve unavailable", () => {
    expectAssessment({ roster_status: "reserve" }, "unavailable", "roster_reserve", false);
  });

  it("makes a healthy taxi player unavailable", () => {
    expectAssessment({ roster_status: "taxi" }, "unavailable", "roster_taxi", false);
  });

  it("gives reserve precedence over Questionable", () => {
    expectAssessment(
      { roster_status: "reserve", injury_status: "Questionable" },
      "unavailable",
      "roster_reserve",
      false,
    );
  });

  it("gives taxi precedence over Out", () => {
    expectAssessment(
      { roster_status: "taxi", injury_status: "Out" },
      "unavailable",
      "roster_taxi",
      false,
    );
  });
});

describe("assessAvailability defense null-status exception", () => {
  it("treats a defense with null status and injury as available", () => {
    expectAssessment(
      { position: "DEF", status: null, injury_status: null },
      "available",
      "active",
      true,
    );
  });

  it("does not treat an offensive player with null status as available", () => {
    expectAssessment(
      { position: "WR", status: null, injury_status: null },
      "unknown",
      "unknown_status",
      false,
    );
  });
});

describe("assessAvailability concrete league fixtures", () => {
  const fixtures: Array<[string, string, string | null, string, string, boolean]> = [
    ["Josh Jacobs", "Active", "NA", "RB", "injury_na", false],
    ["Jadarian Price", "Active", "Out", "RB", "injury_out", false],
    ["Rachaad White", "Active", "Out", "RB", "injury_out", false],
    ["A.J. Brown", "Inactive", "IR", "WR", "status_inactive", false],
    ["Joe Burrow", "Active", null, "QB", "active", true],
    ["Jaylen Waddle", "Active", "Questionable", "WR", "questionable", true],
    ["Baker Mayfield", "Active", "Out", "QB", "injury_out", false],
    ["Joe Forson", "Practice Squad", "NA", "RB", "status_practice_squad", false],
  ];

  for (const [name, status, injuryStatus, position, reason, usable] of fixtures) {
    it(name, () => {
      const result = assessAvailability(
        makePlayer({
          player_id: name,
          status,
          injury_status: injuryStatus,
          position,
        }),
      );
      assert.equal(result.reason, reason);
      assert.equal(result.currently_usable, usable);
      assert.equal(result.availability, usable ? (reason === "questionable" ? "uncertain" : "available") : "unavailable");
    });
  }
});
