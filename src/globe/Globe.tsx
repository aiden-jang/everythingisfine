import { useEffect, useRef } from "react";
import { matches } from "../data/filter";
import { createGlobe } from "./scene";
import { frontsFor, type Feed, type FeedSnapshot } from "../app/feed";
import { createReplay, REPLAY_FRONT_MIN_MAG, type Replay } from "../app/replay";
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
  /**
   * The replay clock and how many events have been revealed, or null once it is over.
   *
   * Events, not markers. The first version reported what the layer drew, which clustering collapses:
   * a day of 789 events counted up to 105 under a heading reading EVENTS. The two numbers answer
   * different questions and only one of them matches the label.
   */
  onReplay?: (state: { at: number; revealed: number } | null) => void;
  /**
   * The hour the pointer is holding on the activity strip, in whole hours before now, or null.
   *
   * Linked views: the strip already knows when things happened and the globe already knows where,
   * and neither could answer the other's question. Hovering an hour dims everything outside it, so
   * a swarm that reads as one blob resolves into the ninety minutes it actually happened in.
   */
  focusHour?: number | null;
}

export function Globe({
  feed, filters, selected, ramp, onSelect, onReady, onCamera, onReplay, focusHour = null,
}: GlobeProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const wakeRef = useRef<() => void>(() => {});
  const rampRef = useRef<(name: RampName) => void>(() => {});
  /*
   * Read from inside the frame loop, which outlives any single render.
   *
   * Without this the effect would have to list filters and selection as dependencies, which means
   * tearing down the WebGL context, the 300,000-triangle globe and both feed subscriptions every
   * time somebody nudges a magnitude slider.
   */
  const live = useRef({ filters, selected, focusHour });
  live.current = { filters, selected, focusHour };
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  const onReplayRef = useRef(onReplay);
  onReplayRef.current = onReplay;

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

    // Read live rather than captured: somebody can turn reduced motion on while the page is open.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    let lastZoom = globe.controls.state().zoom;
    /*
     * Held-hour dimming, eased rather than switched.
     *
     * Setting the uniform on redraw cut the whole planet between two brightness levels in one frame,
     * once on entering the strip and once on leaving. Eased here rather than in CSS because the value
     * is a shader uniform, and driven by the same loop that already owns every other moving thing.
     */
    let focusFade = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    /*
     * The signature moment: the boundaries grow out of the earthquakes once the day has landed.
     *
     * Sequenced after the replay rather than alongside it. Three things moving at once was the
     * previous opening, and the reveal only means anything if the dots have first had a moment to
     * read as scattered.
     */
    let plateReveal = reducedMotion.matches ? 1 : 0;
    let revealStarted = reducedMotion.matches;
    globe.plates.reveal(plateReveal);

    const startReveal = (): void => {
      if (revealStarted) return;
      revealStarted = true;
      const points: { lon: number; lat: number }[] = [];
      feed.store.forEach((quake) => {
        if (matches(quake, live.current.filters, Date.now())) {
          points.push({ lon: quake.primary.lon, lat: quake.primary.lat });
        }
      });
      globe.plates.orderFrom(points);
    };

    /*
     * If no data ever arrives there is no replay to finish, so nothing would ever reveal them.
     * The boundaries are geography and belong on the globe regardless of whether a feed answered.
     */
    const revealFallback = window.setTimeout(startReveal, 8_000);

    const frame = (now: number): void => {
      /*
       * Two deltas, deliberately.
       *
       * The camera's is clamped at 50ms so a backgrounded tab does not lurch when it wakes. The
       * replay's is not: it is playing back a fixed span of history against the wall clock, and
       * clamping made it run at whatever fraction of real time the frame rate happened to hit. On a
       * slow machine the replay ran to 12 seconds against a 7-second setting, which is the
       * difference between an entrance and a wait. It is 2.8 seconds now and the ratio still holds.
       */
      const rawDt = (now - last) / 1000;
      const dt = Math.min(rawDt, 0.05);
      last = now;
      const moving = globe.controls.step(dt);
      globe.controls.apply();
      /*
       * The replay spawns the fronts it crosses, in the order they happened.
       *
       * Only above `REPLAY_FRONT_MIN_MAG`: a day holds several hundred events and a front for each
       * would be noise. Above 4.5 a day yields fifteen to twenty-five worldwide, which lands as a
       * rhythm rather than a firework.
       */
      let replaying = false;
      if (replay && !replay.done()) {
        const crossed = replay.step(rawDt);
        if (crossed) {
          feed.store.forEach((quake) => {
            const t = quake.primary.time;
            if (t <= crossed.from || t > crossed.to) return;
            revealed += 1;
            if (quake.primary.magnitude < REPLAY_FRONT_MIN_MAG) return;
            globe.rings.spawn(quake.primary.lon, quake.primary.lat, quake.primary.magnitude);
          });
        }
        replaying = true;
        globe.events.sync(
          feed.store, live.current.filters, Date.now(),
          globe.controls.state().zoom, replay.at() ?? undefined, live.current.focusHour,
        );
        const at = replay.at();
        onReplayRef.current?.(replay.done() || at === null ? null : { at, revealed });
        if (replay.done()) startReveal();
      }

      if (revealStarted && plateReveal < 1) {
        plateReveal = Math.min(1, plateReveal + dt / 1.5);
        globe.plates.reveal(plateReveal);
      }

      const focusTarget = live.current.focusHour === null ? 0 : 1;
      let fading = false;
      if (focusFade !== focusTarget) {
        const step = reducedMotion.matches ? 1 : dt / 0.13;
        focusFade = focusTarget > focusFade
          ? Math.min(focusTarget, focusFade + step)
          : Math.max(focusTarget, focusFade - step);
        globe.events.setFocusFade(focusFade);
        globe.rings.setDim(1 - 0.85 * focusFade);
        fading = focusFade !== focusTarget;
      }

      const expanding = globe.rings.step(dt) > 0;
      // Clustering depends on zoom, so a zoom has to redraw the layer, not merely the camera.
      const zoomNow = globe.controls.state().zoom;
      if (Math.abs(zoomNow - lastZoom) > 0.001) {
        lastZoom = zoomNow;
        globe.events.sync(
          feed.store, live.current.filters, Date.now(), zoomNow, undefined, live.current.focusHour,
        );
      }
      globe.render();
      placeOverlays();
      onCameraRef.current?.(globe.controls.state());
      const revealing = revealStarted && plateReveal < 1;
      if (moving || expanding || replaying || fading || revealing) requestAnimationFrame(frame);
      else running = false;
    };

    const wake = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    /*
     * The entrance replay.
     *
     * Held here rather than in React because it advances every frame and ends by itself; putting it
     * in state would re-render the rail sixty times a second to move a clock the rail redraws once
     * a second anyway.
     */
    let replay: Replay | null = null;
    /** Events the replay has passed. Accumulated as it crosses them, never recounted. */
    let revealed = 0;

    const redraw = (): void => {
      globe.events.sync(
        feed.store, live.current.filters, Date.now(),
        globe.controls.state().zoom, replay?.at() ?? undefined, live.current.focusHour,
      );
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
      /*
       * The replay is decided before anything is drawn.
       *
       * Syncing first and then starting it painted one frame of the entire day, which the replay
       * then wiped and refilled: a flash of the answer before the question. Whatever else this
       * entrance is, it cannot begin by showing the ending.
       */
      if (snapshot.seeding && snapshot.arrived.length > 0 && !replay && !reduced.matches) {
        let oldest = Infinity;
        feed.store.forEach((q) => { oldest = Math.min(oldest, q.primary.time); });
        if (Number.isFinite(oldest)) {
          replay = createReplay({ from: oldest, to: Date.now() });
          revealed = 0;
          /*
           * Announced before the first frame, not after it.
           *
           * React otherwise renders one pass with the replay still null, so the rail printed the
           * full held total beside an empty globe for a quarter of a second. The heading and the
           * picture have to agree from the first frame, not from the second.
           */
          onReplayRef.current?.({ at: oldest, revealed: 0 });
          wake();
          return;
        }
      }

      globe.events.sync(
        feed.store, live.current.filters, Date.now(),
        globe.controls.state().zoom, replay?.at() ?? undefined,
      );
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
    /** Any deliberate interaction ends the replay: nobody should have to wait out a title card. */
    const interrupt = (): void => {
      if (!replay || replay.done()) return;
      replay.skip();
      onReplayRef.current?.(null);
      redraw();
    };

    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent): void => {
      interrupt();
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
      window.clearTimeout(revealFallback);
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

  // A filter move, a new selection or a held hour redraws the existing scene rather than rebuilding
  // it. Hover only ever changes whole hours, so this fires once per bar crossed, not per mouse move.
  useEffect(() => {
    redrawRef.current();
    wakeRef.current();
  }, [filters, selected, focusHour]);

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
