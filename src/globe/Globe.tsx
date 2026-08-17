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
      // A seam for driving the camera from outside during development and, later, from Playwright.
      // Both members are real interface rather than test-only scaffolding: hover needs `pick` and
      // permalinks need `state`.
      Object.assign(window, { __globe: globe.controls });
    }

    /*
     * The loop runs only while something is moving, and stops itself when nothing is.
     *
     * DESIGN.md bans ambient rotation, which means an idle globe has nothing to redraw, which means
     * a permanent animation frame loop would spend every frame of every idle minute drawing an
     * identical picture. So a drag, a flick, a zoom or a reset starts the loop, and the frame after
     * the motion settles ends it. On a page meant to be left open for an hour that is the
     * difference between a background tab that costs nothing and one that costs a core.
     */
    let running = false;
    let last = 0;

    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05); // clamped, or a backgrounded tab lurches
      last = now;
      const moving = globe.controls.step(dt);
      globe.controls.apply();
      globe.render();
      if (moving) requestAnimationFrame(frame);
      else running = false;
    };

    const wake = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };

    const detach = globe.controls.attach(wake);

    const ro = new ResizeObserver(() => {
      globe.resize();
      globe.render();
    });
    const parent = el.parentElement;
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      detach();
      globe.dispose();
    };
  }, []);

  return <canvas ref={canvas} className="block h-full w-full cursor-grab active:cursor-grabbing" />;
}
