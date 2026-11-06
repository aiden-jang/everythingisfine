import { useEffect, useLayoutEffect, useRef } from "react";
import { animationDelta } from "../../globe/animation";
import { drawRadar } from "./drawRadar";
import { national, radarFlight, regionCamera, type RadarRegion } from "./radarCamera";

const MOTION = "(prefers-reduced-motion: reduce)";
const DURATION = 2250;

export function RadarMap({
  region,
  image,
}: {
  region: RadarRegion | undefined;
  image: ImageBitmap | null;
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef(national);
  const paint = useRef(() => {});
  const current = useRef(image);

  useLayoutEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let width = 0;
    let height = 0;
    paint.current = () => {
      if (width > 0 && height > 0) drawRadar(ctx, width, height, camera.current, current.current);
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(2, devicePixelRatio);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint.current();
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      paint.current = () => {};
    };
  }, []);

  useLayoutEffect(() => {
    current.current = image;
    paint.current();
  }, [image]);

  useEffect(() => {
    const from = camera.current;
    const target = regionCamera(region);
    if (from === target) return;
    const motion = matchMedia(MOTION);
    let elapsed = 0;
    let previous: number | undefined;
    let request = 0;

    function finish() {
      cancelAnimationFrame(request);
      elapsed = DURATION;
      camera.current = target;
      paint.current();
    }

    function tick(now: number) {
      elapsed += previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000;
      if (elapsed >= DURATION) {
        finish();
        return;
      }
      previous = now;
      camera.current = radarFlight(from, target, elapsed / DURATION);
      paint.current();
      request = requestAnimationFrame(tick);
    }

    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden && elapsed < DURATION) request = requestAnimationFrame(tick);
    }
    function preference(event: MediaQueryListEvent) {
      if (event.matches) finish();
    }
    if (motion.matches) {
      finish();
      return;
    }
    visibility();
    motion.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(request);
      motion.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [region]);

  const place = region?.name ?? "the contiguous United States";
  return (
    <figure className="archive-scene-map radar-map">
      <canvas
        ref={canvas}
        role="img"
        aria-label={image ? `NOAA radar returns over ${place}` : `Map of ${place}`}
      />
      <figcaption>
        <span>NOAA MRMS · Base reflectivity</span>
      </figcaption>
    </figure>
  );
}
