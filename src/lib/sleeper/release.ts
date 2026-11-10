/** App release version; separate from the backward-compatible snapshot format. */
export const APP_VERSION = "3.6.1";
/** Structural fantasy-analysis engine; projection policy is versioned separately. */
export const ANALYSIS_ENGINE_VERSION = "3.5.1";

export const CHANGELOG = [
  {
    version: APP_VERSION,
    changes: ["Shorter next moves, with repeated depth warnings grouped by week.", "Decision-first trade summaries and expandable roster detail.", "Clearer app and analysis-engine versions."],
  },
  {
    version: "3.6",
    changes: ["Added Trade Analyzer and projection-based trade and waiver valuation."],
  },
  {
    version: ANALYSIS_ENGINE_VERSION,
    changes: [
      "Fixed empty starter-slot alignment.",
      "Improved future-week waiver recommendations and bye checks.",
      "Simplified recommendation language and added recommended-drop guidance.",
      "Reduced unnecessary kicker and defense alerts.",
      "Improved depth alerts when players can shift into FLEX.",
    ],
  },
  {
    version: "3.5",
    changes: [
      "Added future-week roster readiness and bye planning.",
      "Added ACT NOW, PLAN AHEAD, and WATCH guidance.",
      "Added weekly matchup and opportunity context.",
    ],
  },
  {
    version: "3.4",
    changes: [
      "Added availability checks and an availability-eligible lineup.",
      "Added available depth, replacement risk, and safe-to-move guidance.",
    ],
  },
  {
    version: "3.3",
    changes: [
      "Added roster analysis based on your league's lineup settings.",
      "Added lineup and depth analysis that accounts for FLEX slots.",
    ],
  },
] as const;
