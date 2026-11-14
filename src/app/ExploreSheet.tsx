import { useEffect, useState } from "react";
import { Resizer } from "./Resizer";
import { MobileNavigation } from "./MobileNavigation";
import { sheetStops } from "./sheetLayout";

export function ExploreSheet({
  height,
  onResize,
  panel,
  visible,
}: {
  height: number;
  onResize: (height: number) => void;
  panel: string;
  visible: boolean;
}) {
  const [viewport, setViewport] = useState(window.innerHeight);
  useEffect(() => {
    const resize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const stops = sheetStops(viewport, panel === "Stories");
  const current = Math.min(stops[2]!, Math.max(stops[0]!, height || stops[1]!));
  return (
    <>
      <Resizer
        axis="y"
        label="Sheet height"
        value={current}
        min={stops[0]!}
        max={stops[2]!}
        snap={stops}
        measure={(event) => event.clientY}
        onChange={onResize}
        grip
        className="absolute inset-x-0 z-[2] md:hidden"
        style={{ top: "calc(var(--sheet-position) - 6px)" }}
      />
      {visible && (
        <MobileNavigation
          canvasHeight={current}
          viewportHeight={viewport}
          onResize={onResize}
          panel={panel}
        />
      )}
    </>
  );
}
