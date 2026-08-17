import { useEffect, useRef } from "react";
import { createGlobe } from "./scene";
import { frontsFor, type Feed, type FeedSnapshot } from "../app/feed";
import type { Filters } from "../data/types";
import { magnitude } from "../app/format";
import type { RampName } from "./ramp";

/*
 * The canvas, and the smallest possible amount of React around it.
 *
 * three.js owns everything inside; React owns the element and the lifetime. The pinned ring and the
 * hover tooltip are plain DOM updated imperatively from the frame loop, not React state, because
 * they move every frame the camera does, and a state update per frame would re-render the rail, the
 * filters and the detail panel sixty times a second to move a two-pixel outline.
 */

export interface GlobeProps {
  feed: Feed;
  filters: Filters;
  selected: string | null;
  ramp: RampName;
  onSelect: (key: string | null) => void;
  /** Handed a fly function once, so the rail can send the camera to a region. */
  onReady: (flyTo: (lon: number, lat: number, zoom?: number) => void) => void;
  /** Called as the camera moves, so the permalink can carry where somebody is looking. */
  onCamera?: (state: { lon: number; lat: number; zoom: number }) => void;
}

export function Globe({
  feed, filters, selected, ramp, onSelect, onReady, onCamera,
}: GlobeProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const rampRef = useRef<(name: RampName) => void>(() => {});
  /*
   * Read from inside the frame loop, which outlives any single render.
   *
   * Without this the effect would have to list filters and selection as dependencies, which means
   * tearing down the WebGL context, the 300,000-triangle globe and both feed subscriptions every
   * time somebody nudges a magnitude slider.
   */
  const live = useRef({ filters, selected });
  live.current = { filters, selected };
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;

    const globe = createGlobe(el);
    globe.resize();
    globe.render();
    onReady(globe.controls.flyTo);

    if (import.meta.env.DEV) {
      console.info("[globe] geometry", globe.stats);
      Object.assign(window, {
        __globe: globe.controls, __feed: feed, __events: globe.events, __rings: globe.rings,
      });
    }

    let hovered: string | null = null;

    /** Puts the pinned outline and the hover tooltip over whatever they are attached to. */
    const placeOverlays = (): void => {
      const box = el.getBoundingClientRect();
      const put = (node: HTMLDivElement | null, key: string | null, offsetY: number): void => {
        if (!node) return;
        const quake = key ? feed.store.get(key) : undefined;
        const at = quake ? globe.controls.project(quake.primary.lon, quake.primary.lat) : null;
        node.style.opacity = at ? "1" : "0";
        if (!at || !quake) return;
        if (node === tooltip.current) {
          node.textContent = `${magnitude(quake.primary)} ${quake.primary.place}`;
        }
        node.style.transform =
          `translate(${at.x - box.left}px, ${at.y - box.top + offsetY}px) ` +
          `translate(-50%, ${offsetY === 0 ? "-50%" : "-100%"})`;
      };
      put(marker.current, live.current.selected, 0);
      put(tooltip.current, hovered, -14);
    };

    /*
     * The loop runs only while something is moving, and stops itself when nothing is.
     *
     * DESIGN.md bans ambient rotation, so an idle globe has nothing to redraw and a permanent frame
     * loop would spend every frame of every idle minute drawing an identical picture. A drag, a
     * flick, a zoom, a fly or a live wavefront starts it; the frame after they all settle ends it.
     */
    let running = false;
    let last = 0;

    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05); // clamped, or a backgrounded tab lurches
      last = now;
      const moving = globe.controls.step(dt);
      globe.controls.apply();
      const expanding = globe.rings.step(dt) > 0;
      globe.render();
      placeOverlays();
      onCameraRef.current?.(globe.controls.state());
      if (moving || expanding) requestAnimationFrame(frame);
      else running = false;
    };

    const wake = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };

    const redraw = (): void => {
      globe.events.sync(feed.store, live.current.filters, Date.now());
      globe.render();
      placeOverlays();
    };
    redrawRef.current = redraw;
    rampRef.current = (name) => {
      // Both layers, or a wavefront would stay warm while its own marker turned blue.
      globe.events.setRamp(name);
      globe.rings.setRamp(name);
      redraw();
    };

    const redrawFromData = (snapshot: FeedSnapshot): void => {
      globe.events.sync(feed.store, live.current.filters, Date.now());
      // A front per arrival, except on the seed. See `frontsFor`.
      const fronts = frontsFor(snapshot);
      for (const quake of fronts) {
        globe.rings.spawn(quake.primary.lon, quake.primary.lat, quake.primary.magnitude);
      }
      if (fronts.length > 0) wake();
      else redraw();
    };

    const onMove = (e: PointerEvent): void => {
      const key = globe.hitTest(e.clientX, e.clientY, feed.store, live.current.filters, Date.now());
      if (key !== hovered) {
        hovered = key;
        el.style.cursor = key ? "pointer" : "";
      }
      placeOverlays();
    };

    /*
     * A click selects; a click that was really a drag does not.
     *
     * Without the distance check, every time someone spins the globe and happens to release over an
     * earthquake, the detail panel opens on an event they were not looking at.
     */
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent): void => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent): void => {
      if (!downAt) return;
      const travelled = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (travelled > 5) return;
      onSelect(globe.hitTest(e.clientX, e.clientY, feed.store, live.current.filters, Date.now()));
    };
    const onLeave = (): void => {
      hovered = null;
      placeOverlays();
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    const detach = globe.controls.attach(() => {
      wake();
      placeOverlays();
    });
    const unsubscribe = feed.subscribe(redrawFromData);
    feed.start();
    redraw();

    // The one entrance, started after the first draw so the globe is already painted when it moves.
    globe.controls.enter();
    wake();

    const ro = new ResizeObserver(() => {
      globe.resize();
      redraw();
    });
    const parent = el.parentElement;
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      unsubscribe();
      detach();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      globe.dispose();
    };
  }, [feed, onReady, onSelect]);

  // A filter move or a new selection redraws the existing scene rather than rebuilding it.
  useEffect(() => {
    redrawRef.current();
  }, [filters, selected]);

  useEffect(() => {
    rampRef.current(ramp);
  }, [ramp]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full cursor-grab active:cursor-grabbing" />
      {/* Chrome, so achromatic: the selection is a ring of Instrument, never a coloured halo,
          because a coloured ring would be a hue that means nothing sitting next to hues that do. */}
      <div
        ref={marker}
        className="pointer-events-none absolute top-0 left-0 size-6 rounded-full border-2 border-ink opacity-0 transition-opacity duration-150"
      />
      <div
        ref={tooltip}
        className="pointer-events-none absolute top-0 left-0 max-w-[260px] truncate border border-hairline bg-raised px-2 py-1 text-[10px] text-ink opacity-0"
      />
    </div>
  );
}
