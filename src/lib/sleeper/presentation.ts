// Display labels only: analysis values and scores retain their existing meaning.
export const AVAILABILITY_LINEUP_NOTE = "Based on player status and roster eligibility; bye weeks are not excluded. Check Recommended Next Moves for week-specific gaps, including byes.";
function label(value: unknown, labels: Record<string, string>): string {
  if (value == null || value === "") return "Unknown";
  const key = String(value);
  return labels[key] ?? key.replaceAll("_", " ");
}

export function needLabel(value: unknown): string {
  return label(value, { critical: "Urgent need", high: "High need", thin: "Could use depth", moderate: "Some need", low: "Low need", unknown: "Unknown" });
}

export function depthLabel(value: unknown): string {
  return label(value, { short: "Short on starters", thin: "Limited backup depth", adequate: "Enough depth", deep: "Strong depth", covered_by_flex: "Covered through FLEX", unknown: "Unknown" });
}

export function scarcityLabel(value: unknown): string {
  return label(value, { high: "Scarce league depth", moderate: "Limited league depth", low: "Plentiful league depth", unknown: "Unknown" });
}

export const EXTRA_DEPTH_NOTE = "Players outside the best lineup when everyone on the roster is considered, including unavailable players.";
export const SAFE_TO_MOVE_NOTE = "Available players outside the availability-based lineup. Check injuries, byes, and FLEX eligibility before a trade or drop; this is not a drop recommendation.";
export const REPLACEMENT_NOTE = "Lineup-rating drop estimates how much the model's lineup score falls if a player is removed. These are rating units, not projected fantasy points. All roster includes unavailable players; available players uses current availability.";
