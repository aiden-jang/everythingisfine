import { useLayoutEffect, useState } from "react";
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
  const [viewport, setViewport] = useState({ height: window.innerHeight, footer: 0 });
  useLayoutEffect(() => {
    const resize = () => {
      const rail = document.getElementById("chrome-rail");
      setViewport({
        height: window.innerHeight,
        footer: rail ? parseFloat(getComputedStyle(rail).marginBottom) || 0 : 0,
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const stops = sheetStops(viewport.height, viewport.footer);
  const [first, half, last] = stops;
  useLayoutEffect(() => {
    const zones = document.querySelector<HTMLElement>(".zones");
    if (!zones) return;
    zones.style.setProperty("--sheet-min", `${first}px`);
    zones.style.setProperty("--sheet-default", `${half}px`);
    zones.style.setProperty("--sheet-max", `${last}px`);
    return () => {
      for (const name of ["--sheet-min", "--sheet-default", "--sheet-max"]) zones.style.removeProperty(name);
    };
  }, [first, half, last]);
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
        className={visible ? "absolute inset-x-0 z-[2] md:hidden" : "hidden"}
        style={{ top: "calc(var(--sheet-position) - 6px)" }}
      />
      {visible && <MobileNavigation canvasHeight={current} stops={stops} onResize={onResize} panel={panel} />}
    </>
  );
}
