// Display labels only: analysis values and scores retain their existing meaning.
export const AVAILABILITY_LINEUP_NOTE = "Uses current status and roster eligibility, including Questionable players. Byes are not excluded; check Next Moves before setting starters.";
function label(value: unknown, labels: Record<string, string>): string {
  if (value == null || value === "") return "Unknown";
  const key = String(value);
  return labels[key] ?? key.replaceAll("_", " ");
}

export function needLabel(value: unknown): string {
  return label(value, { critical: "Urgent need", high: "High need", thin: "Could use depth", moderate: "Some need", low: "Low need", unknown: "Unknown" });
}

export function depthLabel(value: unknown): string {
  return label(value, { short: "Short on starters", thin: "Thin depth", adequate: "Enough depth", deep: "Strong depth", covered_by_flex: "FLEX cover", unknown: "Unknown" });
}

export function scarcityLabel(value: unknown): string {
  return label(value, { high: "Scarce league depth", moderate: "Limited league depth", low: "Plentiful league depth", unknown: "Unknown" });
}

export const EXTRA_DEPTH_NOTE = "Outside the best full-roster lineup, including unavailable players.";
export const SAFE_TO_MOVE_NOTE = "Eligible bench options, not drop recommendations. Check injuries, byes and FLEX needs before moving anyone.";
export const REPLACEMENT_NOTE = "If removed: lineup rating points lost, not projected fantasy points. Full roster includes unavailable players; Eligible now uses current status and roster eligibility.";
