import { useEffect, useState, type ReactNode } from "react";
import type { LeagueSnapshot } from "@/lib/sleeper/types";
import { normalizeCapture, type LocalCapture } from "@/lib/local-quality/model";
import type { ProjectedWaivers } from "@/lib/sleeper/waiver-valuation";
import RosAssets from "./ros-assets";
/** Only loaded in explicitly enabled local development; never exported with snapshots. */
export default function LocalRosAssets({
  snapshot,
  projected,
  children,
}: {
  snapshot: LeagueSnapshot;
  projected: ProjectedWaivers;
  children: (annotation?: (id: string) => ReactNode, panel?: ReactNode) => ReactNode;
}) {
  const [capture, setCapture] = useState<LocalCapture | null>(null),
    [invalid, setInvalid] = useState(false),
    [now, setNow] = useState(() => new Date().toISOString()),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/__local-quality", {
          cache: "no-store",
          signal: abort.signal,
        });
        const data = response.ok ? await response.json() : { status: "disabled" };
        if (!active) return;
        setCapture(data.status === "loaded" ? normalizeCapture(data.capture) : null);
        setInvalid(data.status === "invalid");
        setNow(new Date().toISOString());
      } catch {
        if (active) {
          setCapture(null);
          setInvalid(false);
        }
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  if (!capture && !invalid) return children();
  if (invalid)
    return children(
      undefined,
      <section className="rounded-xl bg-card p-4 shadow-border" role="status">
        Local ROS capture could not be read. Re-import a valid capture.
      </section>,
    );
  return <RosAssets snapshot={snapshot} projected={projected} capture={capture!} now={now}
    sourceLabel="Local research" onReload={() => setRefresh(x => x + 1)}>{children}</RosAssets>;
}
