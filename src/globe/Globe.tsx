import { GlobeUnavailable } from "./GlobeUnavailable";
import { animationDelta } from "./animation";
import { useEffect, useRef, useState } from "react";
import { matches } from "../data/filter";
import { loadStars, type FigureTable } from "../geo/stars";
import { createGlobe } from "./scene";
import type { FocusSpan } from "./events";
import { frontsFor, type Feed, type FeedSnapshot } from "../app/feed";
import { createReplay, replayFrom, REPLAY_FRONT_MIN_MAG, type Replay } from "../app/replay";
import type { Filters, Quake } from "../data/types";
import { distanceLabel, magnitude } from "../app/format";
import { between, seconds } from "../app/arrival";
import type { RampName } from "./ramp";
import { sectionEdges, type SectionLine } from "../app/section";
import type { Aurora } from "../sources/aurora";
import type { SlabPoint } from "../geo/slab";
import type { Mark } from "./marks";
import { kmPerPixel, latitudeLabel, niceScale } from "./scale";

/* The canvas, and the smallest possible amount of React around it. three.js owns everything inside it. See ARCHITECTURE.md#srcglobeglobetsx. */

export interface GlobeProps {
  feed: Feed;
  filters: Filters;
  selected: string | null;
  ramp: RampName;
  onSelect: (key: string | null) => void;
  onReady: (flyTo: (lon: number, lat: number, zoom?: number, liftPx?: number) => void) => void;
  /** Hands out a function that renders and returns the canvas, for the still. See ARCHITECTURE.md#srcglobeglobetsx. */
  onCapture?: (capture: () => HTMLCanvasElement | null) => void;
  onSelectMark?: (id: string | null) => void;
  onCamera?: (state: { lon: number; lat: number; zoom: number }) => void;
  /** The replay clock and how many *events* have been revealed. Not markers: clustering collapses those,
   * so a day of 789 counted up to 105 under a heading reading EVENTS. */
  onReplay?: (state: { at: number; revealed: number } | null) => void;
  flat?: boolean;
  /** Draw earthquakes at their own depth. Only means anything on the globe, and the shader fades it with
   * the morph, so unwrapping the map lifts every event back to the surface as one motion. */
  depthSink?: boolean;
  figures?: FigureTable | null;
  /** Null rather than `Date.now()` on the live view, so the scene keeps its once-a-minute throttle. */
  moment?: number | null;
  /** Handed in already loaded: whoever pressed the toggle pulls the chunk, and this stays a renderer. */
  slab?: readonly SlabPoint[] | null;
  /** A span, not a bucket index: the strip knows how wide its buckets are and this does not. */
  focus?: FocusSpan | null;
  aurora?: Aurora | null;
  marks?: readonly Mark[];
  /** Origin time the cursor stands at, or null for live. Null means no limit rather than "the present",
   * so a live arrival still appears. */
  scrubAt?: number | null;
  section?: SectionLine | null;
  /** Map only: picking two points on a sphere somebody is rotating is a guess. Shift and drag, because a
   * plain drag already pans and a "now draw a line" button would be a mode to get stuck in. */
  onSection?: (line: SectionLine | null) => void;
}

/* Clear of the credit's line, which is 44px tall because a link has to hold a finger. At 40 the ruler
   was drawn straight through "made by aiden jang". */
const SCALE_BOTTOM = 76;

/* Half of the 44px a finger is reckoned to need, so a marker's own radius makes up the rest. */
const TOUCH_SLOP_PX = 18;

/** The most a panel may swing the camera. Past this the lift costs more than the panel hid. */
const MAX_LIFT_DEG = 22;
/** What the scale bar aims for before rounding to a round number of kilometres. */
const SCALE_TARGET_PX = 110;

export function Globe({
  feed,
  filters,
  selected,
  ramp,
  onSelect,
  onReady,
  onCapture,
  onSelectMark,
  onCamera,
  onReplay,
  focus = null,
  aurora = null,
  marks = [],
  scrubAt = null,
  flat = false,
  depthSink = false,
  slab = null,
  figures = null,
  moment = null,
  section = null,
  onSection,
}: GlobeProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const sectionLine = useRef<SVGSVGElement>(null);
  const hoverRing = useRef<HTMLDivElement>(null);
  const scaleBar = useRef<HTMLDivElement>(null);
  const scaleRule = useRef<HTMLDivElement>(null);
  const scaleText = useRef<HTMLSpanElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const wakeRef = useRef<() => void>(() => {});
  const rampRef = useRef<(name: RampName) => void>(() => {});
  const sinkRef = useRef<(on: boolean) => void>(() => {});
  const figuresRef = useRef<(table: FigureTable | null) => void>(() => {});
  const momentRef = useRef<(at: number | null) => void>(() => {});
  const slabRef = useRef<(points: readonly SlabPoint[] | null) => void>(() => {});
  const auroraRef = useRef<(next: Aurora | null) => void>(() => {});
  const markRef = useRef<(next: readonly Mark[]) => void>(() => {});
  /*
   * Read from inside the frame loop, which outlives any render. Listing filters and selection as effect
   * dependencies would tear down the WebGL context and both feed subscriptions on every slider nudge.
   */
  const live = useRef({
    filters,
    selected,
    focus,
    scrubAt,
    flat,
    depthSink,
    slab,
    figures,
    moment,
    section,
    aurora,
    marks,
  });
  live.current = {
    filters,
    selected,
    focus,
    scrubAt,
    flat,
    depthSink,
    slab,
    figures,
    moment,
    section,
    aurora,
    marks,
  };
  const onSectionRef = useRef(onSection);
  onSectionRef.current = onSection;
  const drag = useRef<SectionLine | null>(null);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  const onReplayRef = useRef(onReplay);
  onReplayRef.current = onReplay;

  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;

    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(el);
    } catch {
      setUnavailable(true);
      return undefined;
    }
    setUnavailable(false);
    globe.resize();
    globe.render();
    /*
     * Wrapped, because `flyTo` aims the camera and does not start the loop that moves it. On the globe
     * something is usually animating and hid this; with the feeds quiet, clicking a region set a target
     * nothing integrated and the camera sat still.
     */
    onReady((toLon, toLat, toZoom, liftPx) => {
      /*
       * `liftPx` puts the target that many pixels above the middle instead of in it, so the sheet describing
       * an event does not cover the event. The camera aims that far south of it.
       */
      let lat = toLat;
      if (liftPx) {
        /* Two traps in one line. Use `degForPx`, not `degPerPx * px`: the second is the flat map's straight
           line, and this camera is about two radii out, so the sphere's curve is what decides. It ran 34%
           long. See ARCHITECTURE.md#srcglobeglobetsx. */
        const deg = Math.min(globe.controls.degForPx(liftPx, toZoom), MAX_LIFT_DEG);
        lat = Math.max(-85, Math.min(85, toLat - deg));
      }
      globe.controls.flyTo(toLon, lat, toZoom);
      // Through the ref, not the closure: a shared link calls this during setup, before `wake` further
      // down has been initialised, and a temporal dead zone here takes the whole canvas with it.
      wakeRef.current();
    });

    onCapture?.(() => {
      const el2 = canvas.current;
      if (!el2) return null;
      // Drawn again right here, so the pixels exist when the caller reads them on the next line.
      globe.render();
      return el2;
    });

    if (import.meta.env.DEV) {
      console.info("[globe] geometry", globe.stats);
      Object.assign(window, {
        __globe: globe.controls,
        __feed: feed,
        __events: globe.events,
        __rings: globe.rings,
        // The pickable marks, so a browser test can point at a storm without knowing where storms are.
        // The hazard feeds are live even when the agencies are stubbed.
        __marks: () => live.current.marks.filter((m) => m.id !== undefined),
        /*
         * The pointer's own question, asked directly. A test cannot aim at a marker any other way:
         * projecting a coordinate gives the surface point and markers are drawn at their depth, so the
         * two are tens of pixels apart for anything deep.
         */
        __hitTest: (x: number, y: number, slopPx?: number) =>
          globe.hitTest(x, y, feed.store, live.current.filters, Date.now(), slopPx),
        /*
         * One full scene draw, on demand, for measuring GPU frame time. The loop sleeps whenever nothing
         * is moving, so there are no frames to instrument otherwise. `DEV` only.
         */
        __drawOnce: () => {
          globe.render();
        },
      });
    }

    // Read live rather than captured: somebody can turn reduced motion on while the page is open.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    /*
     * What the pointer is over, which is no longer only an earthquake. Tagged rather than a bare string,
     * because a quake key and a mark id are different namespaces that both contain colons.
     */
    let hovered: { kind: "quake" | "mark"; id: string } | null = null;

    /** Puts the pinned outline and the hover tooltip over whatever they are attached to. */
    const placeOverlays = (): void => {
      const box = el.getBoundingClientRect();
      // One resolver for both namespaces, so the overlays do not care which layer they point at. A mark's
      // label rides on the mark: this file knows about polylines and has no business knowing about cyclones.
      const locate = (t: {
        kind: "quake" | "mark";
        id: string;
      }): { lon: number; lat: number; label: string; quake: Quake | null } | null => {
        if (t.kind === "quake") {
          const q = feed.store.get(t.id);
          if (!q) return null;
          return {
            lon: q.primary.lon,
            lat: q.primary.lat,
            label: `${magnitude(q.primary)} ${q.primary.place}`,
            quake: q,
          };
        }
        const mark = live.current.marks.find((m) => m.id === t.id && m.anchor !== undefined);
        if (!mark?.anchor || mark.label === undefined) return null;
        return { lon: mark.anchor.lon, lat: mark.anchor.lat, label: mark.label, quake: null };
      };
      const put = (
        node: HTMLDivElement | null,
        target: { kind: "quake" | "mark"; id: string } | null,
        offsetY: number,
      ): void => {
        if (!node) return;
        const found = target ? locate(target) : null;
        const at = found ? globe.controls.project(found.lon, found.lat) : null;
        node.style.opacity = at ? "1" : "0";
        if (!at || !found) return;
        /*
         * The ring and the bracket take their size from the mark they are on. Fixed pixels were chosen when
         * the largest marker was 8.8px, and the scale is wider now and grows with the zoom besides.
         */
        if (node === hoverRing.current || node === marker.current) {
          const mag = found.quake?.primary.magnitude;
          const radius = mag === undefined ? 7 : globe.markerRadius(mag);
          const clear = node === marker.current ? 9 : 5;
          const size = Math.round(radius * 2 + clear * 2);
          node.style.width = `${size}px`;
          node.style.height = `${size}px`;
        }
        if (node === tooltip.current) {
          // Show the distance to a distinct pinned event alongside the hovered place.
          const pinned = live.current.selected ? feed.store.get(live.current.selected) : undefined;
          const pair =
            pinned && pinned.key !== found.quake?.key
              ? between(pinned.primary.lon, pinned.primary.lat, found.lon, found.lat)
              : null;
          node.replaceChildren();
          const name = document.createElement("div");
          name.className = "truncate";
          name.textContent = found.label;
          node.append(name);
          if (pair) {
            const gap = document.createElement("div");
            gap.className = "font-mono text-dim tabular-nums";
            // Distance always, arrival time only between two earthquakes. A cyclone has no arrival time at
            // an earthquake, so printing seconds there would measure something that does not happen.
            gap.textContent =
              pair.p !== null && found.quake !== null
                ? `${distanceLabel(pair.km)} from the pin · ${seconds(pair.p)}`
                : `${distanceLabel(pair.km)} from the pin`;
            node.append(gap);
          }
        }
        node.style.transform =
          `translate(${at.x - box.left}px, ${at.y - box.top + offsetY}px) ` +
          `translate(-50%, ${offsetY === 0 ? "-50%" : "-100%"})`;
      };
      /*
       * The section line in SVG, not in the scene: it is chrome, not geography, and `project` already turns
       * a coordinate into a screen position for the tooltip.
       */
      const svg = sectionLine.current;
      if (svg) {
        const draft = drag.current;
        // Map only. A great circle projects to a curve on a globe, so a straight screen line between two
        // projected points would be a wrong picture rather than a simplified one.
        const line = globe.controls.morph() > 0.5 ? (draft ?? live.current.section) : null;
        const a = line ? globe.controls.project(line.fromLon, line.fromLat) : null;
        const b = line ? globe.controls.project(line.toLon, line.toLat) : null;
        svg.style.opacity = a && b ? "1" : "0";
        if (a && b && line) {
          const span = (i: number, p: { x: number; y: number }, q: { x: number; y: number }): void => {
            const el = svg.children[i] as SVGLineElement | undefined;
            el?.setAttribute("x1", `${p.x - box.left}`);
            el?.setAttribute("y1", `${p.y - box.top}`);
            el?.setAttribute("x2", `${q.x - box.left}`);
            el?.setAttribute("y2", `${q.y - box.top}`);
          };
          // Projected end by end, not offset in screen space: a fixed pixel offset is right at the equator
          // and wrong everywhere else. `sectionEdges` does it on the sphere.
          sectionEdges(line).forEach((edge, i) => {
            const p = globe.controls.project(edge.fromLon, edge.fromLat);
            const q = globe.controls.project(edge.toLon, edge.toLat);
            if (p && q) span(i, p, q);
          });
          span(2, a, b);
          const cap1 = svg.children[3] as SVGCircleElement | null;
          const cap2 = svg.children[4] as SVGCircleElement | null;
          cap1?.setAttribute("cx", `${a.x - box.left}`);
          cap1?.setAttribute("cy", `${a.y - box.top}`);
          cap2?.setAttribute("cx", `${b.x - box.left}`);
          cap2?.setAttribute("cy", `${b.y - box.top}`);
        }
      }

      put(
        marker.current,
        live.current.selected === null ? null : { kind: "quake", id: live.current.selected },
        0,
      );
      // The ring is the earthquakes' highlight only. A circle round a spiral reads as part of the drawing,
      // so a glyph brightens itself in the mark layer instead.
      put(hoverRing.current, hovered?.kind === "quake" ? hovered : null, 0);
      put(tooltip.current, hovered, -18);

      /*
       * The scale bar, quoted at the latitude in the middle of the view rather than at the bar's own row.
       * Zoomed out, the corner the bar sits in is void, so asking what latitude is under it returns nothing
       * and the bar never appeared. The centre is the more useful of the two anyway.
       */
      const bar = scaleBar.current;
      if (bar) {
        const flat = globe.controls.morph() > 0.99;
        const { lat } = globe.controls.state();
        const drawn = flat ? niceScale(kmPerPixel(globe.controls.degPerPx(), lat), SCALE_TARGET_PX) : null;
        // Hidden on the globe, which carries its own scale by being a ball, and mid-morph, where a number
        // read off a half-flattened projection is a number about nothing.
        bar.style.opacity = drawn ? "1" : "0";
        if (drawn && scaleRule.current && scaleText.current) {
          scaleRule.current.style.width = `${Math.round(drawn.px)}px`;
          scaleText.current.textContent = `${distanceLabel(drawn.km)} at ${latitudeLabel(lat)}`;
        }
      }
    };

    // Sleep when nothing moves; redraw only when motion or changed data needs a frame.
    let running = false;
    let last = 0;
    let lastZoom = globe.controls.state().zoom;
    // Eased here rather than in CSS, because the value is a shader uniform. Set on redraw instead, the
    // whole planet cut between two brightness levels in one frame.
    let focusFade = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let morph = live.current.flat ? 1 : 0;
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
      // Wakes the loop. On a load where no feed ever answers nothing else is moving, so the flag was set
      // and the frame that reads it never ran: the boundaries stayed hidden on the load they matter most.
      wakeRef.current();
    };

    // No data means no replay to finish, and the boundaries are geography either way.
    const revealFallback = window.setTimeout(startReveal, 8_000);

    const frame = (now: number): void => {
      // Replay follows wall time; visual motion caps pauses without slowing ordinary low-frame-rate rendering.
      const rawDt = (now - last) / 1000;
      const dt = animationDelta(rawDt);
      last = now;
      const moving = globe.controls.step(dt);
      globe.controls.apply();
      // Only above `REPLAY_FRONT_MIN_MAG`. A day holds several hundred events and a front for each is
      // noise; above 4.5 a day yields fifteen to twenty-five, which lands as a rhythm.
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
          feed.store,
          live.current.filters,
          Date.now(),
          globe.controls.state().zoom,
          replay.at() ?? undefined,
          live.current.focus,
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
        // 1.1 seconds, which is slow. Greenland swelling as it leaves the sphere is the whole argument for
        // the globe being the default view, and at 300ms nobody sees it happen.
        const step = reducedMotion.matches ? 1 : dt / 1.1;
        morph =
          morphTarget > morph ? Math.min(morphTarget, morph + step) : Math.max(morphTarget, morph - step);
        globe.setMorph(morph);
        globe.controls.setMorph(morph);
        unwrapping = morph !== morphTarget;
      }

      const focusTarget = live.current.focus === null ? 0 : 1;
      let fading = false;
      if (focusFade !== focusTarget) {
        const step = reducedMotion.matches ? 1 : dt / 0.13;
        focusFade =
          focusTarget > focusFade
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
        // Cheap: the layer decides for itself whether the change is worth a rebuild.
        globe.setMarkZoom(zoomNow);
        globe.events.sync(
          feed.store,
          live.current.filters,
          Date.now(),
          zoomNow,
          revealUntil(),
          live.current.focus,
        );
      }
      globe.render();
      placeOverlays();
      onCameraRef.current?.(globe.controls.state());
      const revealing = revealStarted && plateReveal < 1;
      if (moving || expanding || replaying || fading || revealing || unwrapping) {
        requestAnimationFrame(frame);
      } else running = false;
    };

    /*
     * Shift and drag draws a section. Capture phase, so it takes the gesture before the camera does:
     * `controls` listens on this same canvas, and capture runs before bubbling whatever order they were
     * added in. Stopping propagation here is the whole of "this drag is not a pan".
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
          fromLon: start.lon,
          fromLat: start.lat,
          toLon: end.lon,
          toLat: end.lat,
        };
        wakeRef.current();
      };
      const up = (u: PointerEvent): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const line = drag.current;
        drag.current = null;
        // A shift-click with no drag clears rather than making a zero-length section, which would open the
        // panel to say nothing found. Shift-click is the undo for shift-drag.
        const moved = line && Math.hypot(u.clientX - e.clientX, u.clientY - e.clientY) > 12;
        // Stored left to right whichever way it was dragged. The panel plots zero at its left edge, so a
        // line dragged east to west put the map's right end on the panel's left with nothing saying so.
        const flip = moved && u.clientX < e.clientX;
        onSectionRef.current?.(
          !moved
            ? null
            : flip
              ? { fromLon: line.toLon, fromLat: line.toLat, toLon: line.fromLon, toLat: line.fromLat }
              : line,
        );
        wakeRef.current();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    el.addEventListener("pointerdown", onSectionDown, { capture: true });

    /* The sky, once its own chunk lands. `stars.json` is 88kB and arrives a beat after the first frame. See ARCHITECTURE.md#srcglobeglobetsx. */
    let gone = false;
    void loadStars().then((table) => {
      if (gone) return;
      globe.setStars(table);
      wakeRef.current();
    });

    const wake = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    // Held here rather than in React because it advances every frame and ends by itself. In state it would
    // re-render the rail sixty times a second to move a clock the rail redraws once a second anyway.
    let replay: Replay | null = null;
    /** Events the replay has passed. Accumulated as it crosses them, never recounted. */
    let revealed = 0;

    // The entrance wins while it is running and the cursor takes over after. Both drive `revealUntil`, so
    // one has to be chosen rather than combined.
    const revealUntil = (): number | undefined => replay?.at() ?? live.current.scrubAt ?? undefined;

    const redraw = (): void => {
      globe.events.sync(
        feed.store,
        live.current.filters,
        Date.now(),
        globe.controls.state().zoom,
        revealUntil(),
        live.current.focus,
      );
      globe.render();
      placeOverlays();
    };
    redrawRef.current = redraw;
    auroraRef.current = (grid) => {
      globe.setAurora(grid);
    };
    markRef.current = (next) => {
      globe.setMarks(next);
    };
    // The glyph scale is a function of zoom, so it has to be right before the first frame.
    globe.setMarkZoom(globe.controls.state().zoom);
    /*
     * Pushed once at setup, not only when the data next changes. The effects below fire on their own
     * dependencies, so a scene built after a fetch has landed never hears about it: the array has not
     * changed, nothing re-runs, and the layer stays empty while the legend describes four storms.
     */
    auroraRef.current(live.current.aurora);
    markRef.current(live.current.marks);
    sinkRef.current = (on) => {
      globe.setDepthSink(on);
      redraw();
    };
    slabRef.current = (points) => {
      globe.setSlab(points);
      redraw();
    };
    // One call carries the table and the toggle, because asking for the layer is what fetches the chunk.
    momentRef.current = (at) => {
      globe.setMoment(at);
      redraw();
    };
    globe.setMoment(live.current.moment ?? null);
    figuresRef.current = (table) => {
      if (table !== null) globe.setFigures(table);
      globe.setFiguresOn(table !== null);
      redraw();
    };
    globe.setSlab(live.current.slab ?? null);
    globe.setDepthSink(live.current.depthSink);
    rampRef.current = (name) => {
      // Both layers, or a wavefront would stay warm while its own marker turned blue.
      globe.events.setRamp(name);
      globe.rings.setRamp(name);
      // The colourblind ramp needs greyer geography: cividis's second stop sits 9.3 dE from the blue plate
      // lines and 12.0 from the neutral ones, and under about 10 two colours stop separating.
      globe.setGeography(name);
      redraw();
    };

    const redrawFromData = (snapshot: FeedSnapshot): void => {
      // Decided before anything is drawn. Syncing first painted one frame of the entire day, which the
      // replay then wiped: a flash of the answer before the question.
      if (snapshot.seeding && snapshot.arrived.length > 0 && !replay && !reduced.matches) {
        let oldest = Infinity;
        feed.store.forEach((q) => {
          oldest = Math.min(oldest, q.primary.time);
        });
        if (Number.isFinite(oldest)) {
          const startedAt = Date.now();
          const from = replayFrom(oldest, startedAt);
          replay = createReplay({ from, to: startedAt });
          /*
           * Primed with what is already on screen, not zero. The replay only plays the last day, so at a
           * wider window everything older is drawn from the first frame, and starting at zero printed 285
           * in the rail beside a globe holding eleven thousand.
           */
          revealed = 0;
          feed.store.forEach((q) => {
            if (q.primary.time <= from) revealed += 1;
          });
          // Announced before the first frame. React otherwise renders one pass with the replay still null,
          // so the rail printed the full held total beside an empty globe for a quarter of a second. The
          // clamped start and the primed count, for the same reason.
          onReplayRef.current?.({ at: from, revealed });
          wake();
          return;
        }
      }

      /*
       * Carries the cursor and the held hour: an arrival is not a reason to abandon either. Without them, a
       * live arrival while parked mid-window revealed the whole window until something else moved.
       */
      globe.events.sync(
        feed.store,
        live.current.filters,
        Date.now(),
        globe.controls.state().zoom,
        revealUntil(),
        live.current.focus,
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
      // Earthquakes first, then the other four, the same order the click uses: the ramp belongs to
      // earthquakes and so does the pointer when both are under it.
      const quake = globe.hitTest(e.clientX, e.clientY, feed.store, live.current.filters, Date.now());
      const next: { kind: "quake" | "mark"; id: string } | null =
        quake !== null
          ? { kind: "quake", id: quake }
          : ((): { kind: "mark"; id: string } | null => {
              const mark = globe.hitMark(e.clientX, e.clientY);
              return mark === null ? null : { kind: "mark", id: mark };
            })();
      if (next?.id !== hovered?.id || next?.kind !== hovered?.kind) {
        hovered = next;
        el.style.cursor = next ? "pointer" : "";
        // A mark is highlighted by its own shape; an earthquake keeps the ring. A dot has no shape to
        // brighten, and a circle round a spiral said nothing the shape was not already saying.
        globe.setMarkHover(next?.kind === "mark" ? next.id : null);
        redraw();
      }
      placeOverlays();
    };

    // A click that was really a drag does not select. Without the distance check, spinning the globe and
    // releasing over an earthquake opens the panel on an event nobody was looking at.
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
      /*
       * A finger gets a bigger target than a mouse. A magnitude 2 marker is about 3px across against 4px
       * of slop, so on a phone the target was a 7px circle - and a miss does not merely do nothing, it
       * falls through to `hitMark` and then clears whatever was open.
       */
      const slop = e.pointerType === "mouse" ? undefined : TOUCH_SLOP_PX;
      // Earthquakes first, then the other marks: the ramp belongs to earthquakes and so does the pointer.
      // A click that hits neither clears both selections.
      const quake = globe.hitTest(e.clientX, e.clientY, feed.store, live.current.filters, Date.now(), slop);
      if (quake) {
        onSelect(quake);
        onSelectMark?.(null);
        return;
      }
      const mark = globe.hitMark(e.clientX, e.clientY, slop);
      onSelectMark?.(mark);
      if (!mark) onSelect(null);
    };
    const onLeave = (): void => {
      hovered = null;
      globe.setMarkHover(null);
      redraw();
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
      // Before dispose, so a table landing after unmount cannot write to a scene that is gone.
      gone = true;
      globe.dispose();
    };
  }, [feed, onReady, onSelect, onCapture, onSelectMark, attempt]);

  // A filter move, a new selection or a held hour redraws rather than rebuilds. Hover only changes whole
  // hours, so this fires once per bar crossed, not per mouse move.
  useEffect(() => {
    redrawRef.current();
    wakeRef.current();
  }, [filters, selected, focus, scrubAt, flat]);

  useEffect(() => {
    rampRef.current(ramp);
  }, [ramp]);

  useEffect(() => {
    sinkRef.current(depthSink);
  }, [depthSink]);

  // Same route and the same reason as the slab: the loop is asleep when a lazy chunk lands.
  useEffect(() => {
    figuresRef.current(figures ?? null);
    wakeRef.current();
  }, [figures]);

  // The loop sleeps when nothing moves, and a new moment moves the light rather than the camera.
  useEffect(() => {
    momentRef.current(moment ?? null);
    wakeRef.current();
  }, [moment]);

  // Same route and the same reason as the marks: the loop is asleep when a lazy chunk lands.
  useEffect(() => {
    slabRef.current(slab ?? null);
  }, [slab]);

  // Handed to the scene rather than held in it, and redrawn once when it lands: the loop stops itself when
  // nothing is moving, so a grid arriving in an idle minute has to ask for a frame.
  useEffect(() => {
    auroraRef.current(aurora);
    redrawRef.current();
  }, [aurora]);

  // Same route and the same reason: the loop is asleep when a ten-minute fetch lands.
  useEffect(() => {
    markRef.current(marks);
    redrawRef.current();
  }, [marks]);

  return (
    <div className="relative h-full w-full">
      {unavailable ? <GlobeUnavailable onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {/* `touch-action: none`, so every gesture on the globe belongs to the globe. On `auto` the browser
          claims a pinch for page zoom before the pointer events reach the pinch handler. */}
      {/* `aria-hidden` sits on the canvas, not the region around it: the region also holds the legend,
          which is content and has to stay reachable. */}
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
      {/* Achromatic: a coloured ring would be a hue meaning nothing beside hues that mean magnitude. */}
      <div
        ref={marker}
        className="pick pointer-events-none absolute top-0 left-0 size-7 opacity-0 transition-opacity duration-150"
      />
      {/* Lighter than the selection ring, because hovering is not choosing. */}
      <div
        ref={hoverRing}
        className="pointer-events-none absolute top-0 left-0 size-5 rounded-full border border-dim opacity-0 transition-opacity duration-100"
      />
      {/* A ruler rather than a readout: the rule is the measurement and the text names it, so the bar's
          width changes and the number stays round. `aria-hidden`, because the feed already gives
          distances per event and a ruler is a thing you hold against a picture. */}
      <div
        ref={scaleBar}
        data-scale
        aria-hidden="true"
        style={{ bottom: `${SCALE_BOTTOM}px` }}
        /* Offset past the rail, like the bottom band. The canvas is full-bleed and the rail floats over
           it, so a bar at the container's own left edge is drawn underneath the rail. */
        className="pointer-events-none absolute left-4 opacity-0 transition-opacity duration-200
          xl:ml-[var(--rail-w)]"
      >
        <span ref={scaleText} className="block font-mono text-[10.5px] text-faint tabular-nums" />
        {/* Ticked at both ends. A bare line has no start or finish, and the eye measures from wherever it
            looks first. */}
        <div ref={scaleRule} className="mt-1 h-[5px] border-x border-b border-dim" />
      </div>
      {/* Achromatic like every other piece of chrome: the section's own panel carries the ramp. */}
      <svg
        ref={sectionLine}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-150"
      >
        {/* The corridor first, so the centre line and its caps paint over it. Undashed: two more dashed
            lines would read as three sections rather than one with a width. See ARCHITECTURE.md#srcglobeglobetsx. */}
        <line stroke="currentColor" strokeWidth={1} className="text-coast" />
        <line stroke="currentColor" strokeWidth={1} className="text-coast" />
        <line stroke="currentColor" strokeWidth={1} className="text-ink" strokeDasharray="5 4" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
        <circle r={3.5} fill="none" stroke="currentColor" strokeWidth={1} className="text-ink" />
      </svg>
      <div
        ref={tooltip}
        /* `truncate` belongs on the name inside, not on the box: on the box it clips to one line and the
           measurement line existed but was never shown. */
        /* On the sans step, like every other piece of prose here. This is the label you read at arm's
           length while the pointer moves, so half a step below body size was the wrong pixel to save. */
        className="pointer-events-none absolute top-0 left-0 max-w-[260px] border border-hairline bg-raised px-2 py-1 text-[11px] leading-snug text-ink opacity-0"
      />
    </div>
  );
}
