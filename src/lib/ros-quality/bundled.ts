import data from "./week11-2026.json" with { type: "json" };
import { normalizeCapture } from "../local-quality/model.ts";

export const BUNDLED_ROS_DATE = "2026-11-17";
// Fixed capture provenance, never refreshed by a Sleeper request or a build.
export const bundledCapture = normalizeCapture(data, "2026-11-18T00:00:00.000Z");
for (const record of bundledCapture.records) {
  record.evidence.sourceNote = "Bundled Week 11 research capture; source date 2026-11-17. Retrieval timestamp uses preserved capture-file creation time.";
}
export function bundledSourceNote(now: string): string {
  const stale = Date.parse(now) - Date.parse(BUNDLED_ROS_DATE) > 72 * 3600_000;
  return `ROS data · Nov 17, 2026 · Fixed Week 11 capture. Refresh updates Sleeper only.${stale ? " ROS evidence is stale; expired ranks are withheld." : ""}`;
}
