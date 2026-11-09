import { useEffect, useRef } from "react";
import footage from "./ocean-entry.webp?url";
import { drawLavaFootage } from "./drawLava";
import { useObservationImage } from "../observations/useObservationData";

export function KilaueaFootage(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { element, status } = useObservationImage(footage);
  useEffect(() => {
    if (!element || !canvas.current) return;
    const target = canvas.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let elapsed = 0;
    let previous: number | undefined;
    function draw(now: number) {
      if (document.hidden || !element) return;
      if (previous !== undefined) elapsed += now - previous;
      previous = now;
      const finished = drawLavaFootage(target, element, motion.matches ? 1000 : elapsed);
      if (!finished && !motion.matches) frame = requestAnimationFrame(draw);
    }
    function sync() {
      cancelAnimationFrame(frame);
      previous = undefined;
      if (!document.hidden) frame = requestAnimationFrame(draw);
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, [element]);

  return (
    <div className="kilauea-footage">
      <canvas
        ref={canvas}
        width={640}
        height={360}
        role="img"
        aria-label="USGS field footage of lava entering Kapoho Bay"
      />
      {status !== "ready" && (
        <p role="status">
          {status === "failed" ? "The field footage couldn’t load." : "Loading field footage…"}
        </p>
      )}
    </div>
  );
}
