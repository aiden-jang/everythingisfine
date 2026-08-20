import { useEffect, useRef } from "react";
import { matches } from "../data/filter";
import { createGlobe } from "./scene";
import { frontsFor, type Feed, type FeedSnapshot } from "../app/feed";
import { createReplay, REPLAY_FRONT_MIN_MAG, type Replay } from "../app/replay";
import type { Filters } from "../data/types";
import { magnitude } from "../app/format";
import type { RampName } from "./ramp";
import type { SectionLine } from "../app/section";

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
  /** false is the globe, true is the flat map. Eased, not switched. */
  flat?: boolean;
  /**
   * The hour the pointer is holding on the activity strip, in whole hours before now, or null.
   *
   * Linked views: the strip already knows when things happened and the globe already knows where,
   * and neither could answer the other's question. Hovering an hour dims everything outside it, so
   * a swarm that reads as one blob resolves into the ninety minutes it actually happened in.
   */
  focusHour?: number | null;
  /**
   * Origin time the cursor stands at, or null for live.
   *
   * The same lever the entrance replay pulls, handed to the viewer. `null` means no limit rather than
   * "the present", so a live arrival still appears; pinning it to now would stop the app being live
   * while looking exactly like it was.
   */
  scrubAt?: number | null;
  /** The section line, drawn over the map so a reader can see what the panel below is a slice of. */
  section?: SectionLine | null;
  /**
   * A section drawn, or cleared by a shift-click that turned out not to be a drag.
   *
   * Map only, because picking two points on a sphere somebody is rotating is a guess and picking them
   * on a map is a drag. The gesture is shift and drag: a plain drag already pans, and a modal "now
   * draw a line" button would be a mode to get stuck in.
   */
  onSection?: (line: SectionLine | null) => void;
}

export function Globe({
  feed, filters, selected, ramp, onSelect, onReady, onCamera, onReplay, focusHour = null,
  scrubAt = null, flat = false, section = null, onSection,
}: GlobeProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const sectionLine = useRef<SVGSVGElement>(null);
  const hoverRing = useRef<HTMLDivElement>(null);
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
  const live = useRef({ filters, selected, focusHour, scrubAt, flat, section });
  live.current = { filters, selected, focusHour, scrubAt, flat, section };
  const onSectionRef = useRef(onSection);
  onSectionRef.current = onSection;
  /** The line being dragged right now, which the frame loop draws in place of the committed one. */
  const drag = useRef<SectionLine | null>(null);
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
    /*
     * Wrapped, because `flyTo` aims the camera and does not start the loop that moves it.
     *
     * On the globe this hid behind the wavefronts: something is usually animating, so the flight got
     * carried along by a loop that was already running. With the feeds quiet and nothing expanding,
     * clicking a region set a target that nothing ever integrated and the camera sat still.
     */
    onReady((toLon, toLat, toZoom) => {
      globe.controls.flyTo(toLon, toLat, toZoom);
      // Through the ref, not the closure: a shared link calls this during setup, before `wake` further
      // down has been initialised, and a temporal dead zone here takes the whole canvas with it.
      wakeRef.current();
    });

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
      /*
       * The section line, in SVG rather than in the scene.
       *
       * It is two points and a corridor, and putting it in three.js means a geometry, a material, an
       * `aLonLat` attribute and a place in the render order for something that is chrome rather than
       * geography. `project` already turns a coordinate into a screen position for the tooltip, so
       * this is the same call twice.
       */
      const svg = sectionLine.current;
      if (svg) {
        const draft = drag.current;
        // Map only. A great circle projects to a curve on a globe, and drawing it as a straight screen
        // line between two projected points would be a wrong picture rather than a simplified one.
        const line = globe.controls.morph() > 0.5 ? draft ?? live.current.section : null;
        const a = line ? globe.controls.project(line.fromLon, line.fromLat) : null;
        const b = line ? globe.controls.project(line.toLon, line.toLat) : null;
        svg.style.opacity = a && b ? "1" : "0";
        if (a && b) {
          const path = svg.firstElementChild as SVGLineElement | null;
          const cap1 = svg.children[1] as SVGCircleElement | null;
          const cap2 = svg.children[2] as SVGCircleElement | null;
          path?.setAttribute("x1", `${a.x - box.left}`);
          path?.setAttribute("y1", `${a.y - box.top}`);
          path?.setAttribute("x2", `${b.x - box.left}`);
          path?.setAttribute("y2", `${b.y - box.top}`);
          cap1?.setAttribute("cx", `${a.x - box.left}`);
          cap1?.setAttribute("cy", `${a.y - box.top}`);
          cap2?.setAttribute("cx", `${b.x - box.left}`);
          cap2?.setAttribute("cy", `${b.y - box.top}`);
        }
      }

      put(marker.current, live.current.selected, 0);
      /*
       * Which dot the label is about.
       *
       * The tooltip named the event and nothing pointed at it. Among two hundred markers a label
       * floating near the cursor is a guess, and the cursor is not on the marker: the hit test works
       * geographically and accepts a near miss, which is what makes a 3px dot clickable at all and
       * exactly what makes the label ambiguous without this.
       */
      put(hoverRing.current, hovered, 0);
      put(tooltip.current, hovered, -18);
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
    /*
     * The unwrap, eased on the same loop as everything else.
     *
     * Long, at 1.1 seconds, because it is the one moment in the app that explains what a projection
     * costs: Greenland swelling as it leaves the sphere is the whole argument for the globe being the
     * default, and at 300ms nobody sees it happen.
     */
    let morph = flat ? 1 : 0;
    globe.setMorph(morph);
    globe.controls.setMorph(morph);

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
      // Wakes the loop, which is the whole point and was missing. On a load where no feed ever
      // answers there is nothing else moving, so the fallback set the flag and the frame that reads
      // it never ran: the boundaries stayed hidden permanently, on exactly the load they matter most.
      wakeRef.current();
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

      const morphTarget = live.current.flat ? 1 : 0;
      let unwrapping = false;
      if (morph !== morphTarget) {
        const step = reducedMotion.matches ? 1 : dt / 1.1;
        morph = morphTarget > morph ? Math.min(morphTarget, morph + step) : Math.max(morphTarget, morph - step);
        globe.setMorph(morph);
        globe.controls.setMorph(morph);
        unwrapping = morph !== morphTarget;
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
          feed.store, live.current.filters, Date.now(), zoomNow, revealUntil(),
          live.current.focusHour,
        );
      }
      globe.render();
      placeOverlays();
      onCameraRef.current?.(globe.controls.state());
      const revealing = revealStarted && plateReveal < 1;
      if (moving || expanding || replaying || fading || revealing || unwrapping) {
        requestAnimationFrame(frame);
      }
      else running = false;
    };

    /*
     * Shift and drag draws a section. Capture phase, so it takes the gesture before the camera does.
     *
     * `controls` listens on this same canvas for orbit and pan, and a listener registered in the
     * capture phase on an element runs before that element's bubbling listeners whatever order they
     * were added in. Stopping propagation here is therefore the whole of "this drag is not a pan",
     * with no mode held anywhere and nothing for the camera to know about.
     */
    const onSectionDown = (e: PointerEvent): void => {
      if (!e.shiftKey || globe.controls.morph() < 0.5 || !onSectionRef.current) return;
      const start = globe.controls.pick(e.clientX, e.clientY);
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();

      const move = (m: PointerEvent): void => {
        const end = globe.controls.pick(m.clientX, m.clientY);
        if (!end) return;
        drag.current = {
          fromLon: start.lon, fromLat: start.lat, toLon: end.lon, toLat: end.lat,
        };
        wakeRef.current();
      };
      const up = (u: PointerEvent): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const line = drag.current;
        drag.current = null;
        /*
         * A shift-click with no drag clears, rather than making a zero-length section.
         *
         * Its length would be zero, every event would be outside the corridor, and the panel would
         * open to say nothing found. Treating it as a dismissal makes shift-click the undo for
         * shift-drag, which is the guess somebody would make anyway.
         */
        const moved = line
          && Math.hypot(u.clientX - e.clientX, u.clientY - e.clientY) > 12;
        /*
         * Stored left to right, whichever way it was dragged.
         *
         * The panel plots zero at its left edge, so a line dragged east to west put the map's right
         * end on the panel's left and nothing on screen said so. Normalising here means the two
         * pictures always read the same direction and neither has to explain itself.
         */
        const flip = moved && u.clientX < e.clientX;
        onSectionRef.current?.(!moved ? null : flip
          ? { fromLon: line.toLon, fromLat: line.toLat, toLon: line.fromLon, toLat: line.fromLat }
          : line);
        wakeRef.current();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    el.addEventListener("pointerdown", onSectionDown, { capture: true });

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

    /*
     * The entrance wins while it is running, and the cursor takes over after.
     *
     * Both drive the same `revealUntil`, so one of them has to be chosen rather than combined. The
     * entrance is 2.8 seconds long and any interaction skips it, so this is only ever ambiguous for
     * as long as somebody has not touched anything.
     */
    const revealUntil = (): number | undefined =>
      replay?.at() ?? live.current.scrubAt ?? undefined;

    const redraw = (): void => {
      globe.events.sync(
        feed.store, live.current.filters, Date.now(),
        globe.controls.state().zoom, revealUntil(), live.current.focusHour,
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

      /*
       * Carries the cursor and the held hour, because an arrival is not a reason to abandon either.
       *
       * This used to pass neither, and got away with it: the branch below calls `redraw` when nothing
       * spawned a front, which put them straight back. On the frames that did spawn one it woke the
       * loop instead, and the loop only re-syncs on a zoom change, so a live arrival while parked
       * mid-window revealed the whole window until something else moved.
       */
      globe.events.sync(
        feed.store, live.current.filters, Date.now(),
        globe.controls.state().zoom, revealUntil(), live.current.focusHour,
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
      el.removeEventListener("pointerdown", onSectionDown, { capture: true });
      globe.dispose();
    };
  }, [feed, onReady, onSelect]);

  // A filter move, a new selection or a held hour redraws the existing scene rather than rebuilding
  // it. Hover only ever changes whole hours, so this fires once per bar crossed, not per mouse move.
  useEffect(() => {
    redrawRef.current();
    wakeRef.current();
  }, [filters, selected, focusHour, scrubAt, flat]);

  useEffect(() => {
    rampRef.current(ramp);
  }, [ramp]);

  return (
    <div className="relative h-full w-full">
      {/*
        `touch-action: none` so every gesture on the globe belongs to the globe.
        It was `auto`, which lets the browser claim a pinch for page zoom before the pointer events
        reach the pinch handler that has been sitting in controls.ts since the first version. A drag
        happened to work; a pinch was zooming the document.
      */}
      {/*
        The `aria-hidden` moved here from the region around it. The canvas is the decorative part, and
        the region now also holds the legend, which is content and has to stay reachable.
      */}
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
      {/* Chrome, so achromatic: the selection is a ring of Instrument, never a coloured halo,
          because a coloured ring would be a hue that means nothing sitting next to hues that do. */}
      <div
        ref={marker}
        className="pointer-events-none absolute top-0 left-0 size-6 rounded-full border-2 border-ink opacity-0 transition-opacity duration-150"
      />
      {/* Lighter than the selection ring, because hovering is not choosing. */}
      <div
        ref={hoverRing}
        className="pointer-events-none absolute top-0 left-0 size-5 rounded-full border border-dim opacity-0 transition-opacity duration-100"
      />
      {/*
        The line, and a cap at each end. Achromatic like every other piece of chrome: the section's
        own panel carries the ramp, and a coloured line on the map would be a hue meaning nothing
        beside hues that mean magnitude.
      */}
      <svg
        ref={sectionLine}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-150"
      >
        <line stroke="currentColor" strokeWidth={1} className="text-ink" strokeDasharray="5 4" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
      </svg>
      <div
        ref={tooltip}
        className="pointer-events-none absolute top-0 left-0 max-w-[260px] truncate border border-hairline bg-raised px-2 py-1 text-[10px] text-ink opacity-0"
      />
    </div>
  );
}
