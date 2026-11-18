import { lazy, useEffect, useState, type ComponentProps } from "react";
import RosAssets from "./ros-assets";
import { bundledCapture, bundledSourceNote } from "@/lib/ros-quality/bundled";

const LocalRosAssets = import.meta.env.LOCAL_QUALITY_ENABLED
  ? lazy(() => import("./local-ros-assets")) : null;
type Props = Pick<ComponentProps<typeof RosAssets>, "snapshot" | "projected" | "children">;

export default function WaiverRosAssets(props: Props) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    setNow(new Date().toISOString());
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, [props.snapshot]);
  if (LocalRosAssets) return <LocalRosAssets {...props} />;
  return <RosAssets {...props} capture={bundledCapture} now={now}
    sourceLabel="Bundled research" sourceNote={bundledSourceNote(now)} />;
}
