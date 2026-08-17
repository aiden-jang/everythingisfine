import { useEffect, useRef } from "react";
import { createGlobe } from "./scene";

/*
 * The canvas, and the smallest possible amount of React around it.
 *
 * three.js owns everything inside; React owns the element and the lifetime. Nothing about the scene
 * is state, so nothing here re-renders. When events arrive in step 7 they go into the scene
 * directly, not through props, for the reason DESIGN.md cares about: ten thousand points changing
 * every second must never touch the React tree.
 */
export function Globe(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;

    const globe = createGlobe(el);
    globe.resize();
    globe.render();

    if (import.meta.env.DEV) {
      // Recorded rather than guessed: the subdivision level in geo/land.ts is a trade against this
      // number, and PLAN.md step 7 gates on it.
      console.info("[globe] geometry", globe.stats);
    }

    // Redraw on resize only. There is no animation loop yet and adding one before there is
    // something to animate is how a still picture ends up costing 60 frames a second.
    const ro = new ResizeObserver(() => {
      globe.resize();
      globe.render();
    });
    const parent = el.parentElement;
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      globe.dispose();
    };
  }, []);

  return <canvas ref={canvas} className="block h-full w-full" />;
}
