import { Badge } from "@/components/ui/badge";
import type { AnalysisRecord } from "@/lib/sleeper/analysis/engine";
import { presentRecommendations, type PresentedRecommendation } from "@/lib/sleeper/recommendation-presentation";

export function RecommendationList({ actions, currentWeek }: { actions: AnalysisRecord[]; currentWeek?: number }) {
  const rows = presentRecommendations(actions, currentWeek);
  const count = Math.max(5, rows.filter(row => row.urgency === "act_now").length);
  const list = (items: PresentedRecommendation[]) => <ul className="mt-2 space-y-2">
    {items.map((row, index) => <li key={`${row.title}-${row.week}-${index}`} className="flex items-start gap-2 text-sm">
      <Badge variant={row.urgency === "act_now" ? "injury" : "default"} className="shrink-0">
        {row.urgency.replaceAll("_", " ").toUpperCase()}
      </Badge>
      <span className="min-w-0"><span className="font-medium">{row.title}. </span><span className="text-muted-foreground">{row.reason}</span></span>
    </li>)}
  </ul>;
  if (!rows.length) return <p className="mt-1 text-sm text-muted-foreground">No urgent lineup or bye-week moves identified.</p>;
  return <>{list(rows.slice(0, count))}{rows.length > count ? <details className="mt-2">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">More planning ({rows.length - count})</summary>
    {list(rows.slice(count))}
  </details> : null}</>;
}
