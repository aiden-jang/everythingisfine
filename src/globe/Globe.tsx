import type { InspectionRun } from "../app/useEventInspection";
import { useGlobeLayers } from "./useGlobeLayers";
import { createFlightTarget } from "./cameraTarget";
import { createOrbitReadout } from "./orbitReadout";
import { type CutawayFocus } from "./cutaway";
import { GlobeOverlays } from "./GlobeOverlays";
import { GlobeUnavailable } from "./GlobeUnavailable";
import { animationDelta } from "./animation";
import { createAnimationFrame } from "./animationFrame";
import { createTapGesture } from "./tapGesture";
import { observeViewport } from "./observeViewport";
import { useLandingRotation } from "./useLandingRotation";
import { attachSectionDrawing } from "./sectionDrawing";
import { useEffect, useRef, useState } from "react";
import { matches } from "../data/filter";
import { loadStars, type FigureTable } from "../geo/stars";
import { createGlobe, type GlobeMoment } from "./scene";
import { isLocalView, isRecordedFlight, isShadowChase, type GlobePresentation } from "./scenePresentation";
import { sinkFraction } from "./events";
import { frontsFor, type FeedSnapshot } from "../app/feed";
import { createReplay, replayFrom, REPLAY_FRONT_MIN_MAG, type Replay } from "../app/replay";
import type { Quake } from "../data/types";
import { distanceLabel, magnitude } from "../app/format";
import { between, seconds } from "../app/arrival";
import type { RampName } from "./ramp";
import { sectionEdges, type SectionLine } from "../app/section";
import type { Aurora } from "../sources/aurora";
import type { SlabPoint } from "../geo/slab";
import type { Mark } from "./marks";
import { kmPerPixel, latitudeLabel, niceScale } from "./scale";
import type { GlobeProps } from "./GlobeProps";

/* The canvas, and the smallest possible amount of React around it. three.js owns everything inside it. See ARCHITECTURE.md#srcglobeglobetsx. */

/* Half of the 44px a finger is reckoned to need, so a marker's own radius makes up the rest. */
const TOUCH_SLOP_PX = 18;

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
  onFrame,
  onSelectMark,
  onCamera,
  onReplay,
  focus = null,
  aurora = null,
  marks = [],
  scrubAt = null,
  flat = false,
  globePresentation = null,
  rotateLanding = true,
  depthSink = false,
  cutaway = null,
  slab = null,
  figures = null,
  moment = null,
  inspection = null,
  section = null,
  onSection,
}: GlobeProps): JSX.Element {
  const rotation = useLandingRotation(globePresentation === "landing" && rotateLanding);
  const canvas = useRef<HTMLCanvasElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
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
  const cutawayRef = useRef<(focus: CutawayFocus | null) => void>(() => {});
  const sinkRef = useRef<(on: boolean) => void>(() => {});
  const figuresRef = useRef<(table: FigureTable | null) => void>(() => {});
  const presentationRef = useRef<(mode: GlobePresentation) => void>(() => {});
  const inspectionRef = useRef<(run: InspectionRun | null) => void>(() => {});
  const momentRef = useRef<(at: GlobeMoment) => void>(() => {});
  const slabRef = useRef<(points: readonly SlabPoint[] | null) => void>(() => {});
  const auroraRef = useRef<(next: Aurora | null) => void>(() => {});
  const markRef = useRef<(next: readonly Mark[]) => void>(() => {});
  /*
   * Read from inside the frame loop, which outlives any render. Listing filters and selection as effect
   * dependencies would tear down the WebGL context and both feed subscriptions on every slider nudge.
   */
  const live = useRef({
    filters,
    onFrame,
    selected,
    focus,
    scrubAt,
    flat,
    globePresentation,
    depthSink,
    cutaway,
    slab,
    figures,
    moment,
    inspection,
    section,
    aurora,
    marks,
  });
  live.current = {
    filters,
    onFrame,
    selected,
    focus,
    scrubAt,
    flat,
    globePresentation,
    depthSink,
    cutaway,
    slab,
    figures,
    moment,
    inspection,
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
    const detachRotation = rotation.attach(el, globe.controls, () => wakeRef.current());
    const readout = createOrbitReadout(orbit.current);
    globe.resize();
    globe.render();
    live.current.onFrame?.(el);
    onReady(
      createFlightTarget(globe.controls, () => wakeRef.current(), globe.beginArrival),
      globe.controls.state,
    );

    onCapture?.(() => {
      const el2 = canvas.current;
      if (!el2) return null;
      // Drawn again right here, so the pixels exist when the caller reads them on the next line.
      globe.render();
      live.current.onFrame?.(el);
      return el2;
    });

    if (import.meta.env.DEV) {
      console.info("[globe] geometry", globe.stats);
      Object.assign(window, {
        __globe: globe.controls,
        __feed: feed,
        __events: globe.events,
        __rings: globe.rings,
        __slab: globe.slab,
        // The pickable marks, so a browser test can point at a storm without knowing where storms are.
        // The hazard feeds are live even when the agencies are stubbed.
        __marks: () => live.current.marks.filter((m) => m.id !== undefined),
        // Resolve against the drawn markers, including depth, radius and touch slop.
        __hitTest: (x: number, y: number, slopPx?: number) =>
          globe.hitTest(x, y, feed.store, live.current.filters, Date.now(), slopPx),
        /*
         * One full scene draw, on demand, for measuring GPU frame time. The loop sleeps whenever nothing
         * is moving, so there are no frames to instrument otherwise. `DEV` only.
         */
        __drawOnce: () => {
          globe.render();
          live.current.onFrame?.(el);
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
        const found = target && live.current.inspection?.kind !== "sequence" ? locate(target) : null;
        const radius =
          found?.quake && live.current.depthSink
            ? 1 - sinkFraction(found.quake.primary.depthKm) * (1 - globe.controls.morph())
            : 1;
        const at = found ? globe.controls.project(found.lon, found.lat, radius) : null;
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
        const line = globe.controls.morph() === 1 ? (draft ?? live.current.section) : null;
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
        const flat = globe.controls.morph() === 1 && globe.controls.localSky.amount() === 0;
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
    const animation = createAnimationFrame(() => isShadowChase(live.current.globePresentation));
    let last = 0;
    let lastZoom = globe.controls.state().zoom;
    let focusFade = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let morph = live.current.flat ? 1 : 0;
    let projectionTravel = morph;
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
      const rotating = rotation.step(dt, moving || globe.controls.morph() > 0);
      globe.controls.apply();
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
        const step = reducedMotion.matches
          ? 1
          : morphTarget === 1 && (globe.cutawayOpen() || !globe.controls.framingReady())
            ? 0
            : dt / 1.45;
        const travel = projectionTravel + (morphTarget ? step : -step);
        projectionTravel = Math.max(0, Math.min(1, travel));
        morph = projectionTravel * projectionTravel * (3 - 2 * projectionTravel);
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
        globe.beginRegroup(reducedMotion.matches);
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
      const presenting = globe.stepPresentation(dt, reducedMotion.matches);
      globe.render();
      live.current.onFrame?.(el);
      placeOverlays();
      readout.update(globe.controls.state());
      if (!rotating) onCameraRef.current?.(globe.controls.state());
      const revealing = revealStarted && plateReveal < 1;
      if (moving || rotating || expanding || replaying || fading || revealing || unwrapping || presenting) {
        animation.request(frame);
      } else running = false;
    };

    const detachSection = attachSectionDrawing(el, globe.controls, drag, onSectionRef, () =>
      wakeRef.current(),
    );

    /* The sky, once its own chunk lands. `stars.json` is 88kB and arrives a beat after the first frame. See ARCHITECTURE.md#srcglobeglobetsx. */
    let gone = false;
    void loadStars().then((table) => {
      if (gone) return;
      globe.setStars(table);
      wakeRef.current();
    });

    const wake = (): void => {
      if (document.hidden) return;
      if (running) return animation.watch();
      running = true;
      last = performance.now();
      animation.request(frame);
    };
    wakeRef.current = wake;

    // Held here rather than in React because it advances every frame and ends by itself. In state it would
    // re-render the rail sixty times a second to move a clock the rail redraws once a second anyway.
    let replay: Replay | null = null;
    /** Events the replay has passed. Accumulated as it crosses them, never recounted. */
    let revealed = 0;

    const revealUntil = (): number | undefined => replay?.at() ?? live.current.scrubAt ?? undefined;
    const redraw = (): void => {
      globe.cancelRegroup();
      globe.events.sync(
        feed.store,
        live.current.filters,
        Date.now(),
        globe.controls.state().zoom,
        revealUntil(),
        live.current.focus,
      );
      globe.render();
      live.current.onFrame?.(el);
      placeOverlays();
    };
    redrawRef.current = redraw;
    auroraRef.current = globe.setAurora;
    markRef.current = (next) => {
      globe.setMarks(next);
    };
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
    momentRef.current = (at) => {
      globe.setMoment(at);
      if (!isShadowChase(live.current.globePresentation) && !isRecordedFlight(live.current.globePresentation))
        redraw();
    };
    globe.setMoment(live.current.moment ?? null);
    inspectionRef.current = globe.setInspection;
    globe.setInspection(live.current.inspection);
    figuresRef.current = (table) => {
      if (table !== null) globe.setFigures(table);
      globe.setFiguresOn(table !== null);
      globe.stepPresentation(0, reducedMotion.matches);
      redraw();
    };
    presentationRef.current = globe.setPresentation;
    presentationRef.current(live.current.globePresentation);
    cutawayRef.current = (next) => {
      globe.setCutaway(next);
      wake();
    };
    globe.setCutaway(live.current.cutaway);
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
      // Start replay before syncing so events do not flash ahead of the cursor.
      globe.cancelRegroup();
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

    const tap = createTapGesture();
    const onMove = (e: PointerEvent): void => {
      tap.move(e);
      if (live.current.inspection?.kind === "sequence") return;
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

    /** Any deliberate interaction ends the replay: nobody should have to wait out a title card. */
    const interrupt = (): void => {
      if (!replay || replay.done()) return;
      replay.skip();
      onReplayRef.current?.(null);
      redraw();
    };

    const onDown = (e: PointerEvent): void => {
      if (isLocalView(live.current.globePresentation)) return;
      interrupt();
      tap.down(e);
    };
    const onUp = (e: PointerEvent): void => {
      if (!tap.up(e) || (morph > 0 && morph < 1)) return;
      // Fingers need a larger hit area than the few pixels occupied by a small quake.
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
    el.addEventListener("pointercancel", tap.cancel);
    el.addEventListener("pointerleave", onLeave);

    const detach = globe.controls.attach(() => {
      readout.show();
      wake();
      placeOverlays();
    });
    const unsubscribe = feed.subscribe(redrawFromData);
    redraw();

    // Start after the first draw, so the globe is painted before the horizon pullback moves it.
    globe.controls.enter();
    wake();

    const detachViewport = observeViewport(el, globe, redraw, wake, () => {
      animation.cancel();
      running = false;
    });

    return () => {
      animation.cancel();
      wakeRef.current = () => {};
      window.clearTimeout(revealFallback);
      detachViewport();
      detachRotation();
      unsubscribe();
      detach();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", tap.cancel);
      el.removeEventListener("pointerleave", onLeave);
      detachSection();
      // Before dispose, so a table landing after unmount cannot write to a scene that is gone.
      gone = true;
      readout.dispose();
      globe.dispose();
    };
  }, [feed, onReady, onSelect, onCapture, onSelectMark, attempt, rotation]);

  // A filter move, a new selection or a held hour redraws rather than rebuilds. Hover only changes whole
  // hours, so this fires once per bar crossed, not per mouse move.
  useEffect(() => {
    redrawRef.current();
    wakeRef.current();
  }, [filters, selected, focus, scrubAt, flat]);

  useGlobeLayers(
    { ramp, depthSink, cutaway, figures, moment, slab, aurora, marks, globePresentation, inspection },
    {
      ramp: rampRef,
      depthSink: sinkRef,
      cutaway: cutawayRef,
      figures: figuresRef,
      moment: momentRef,
      inspection: inspectionRef,
      slab: slabRef,
      aurora: auroraRef,
      marks: markRef,
      globePresentation: presentationRef,
    },
    { wake: wakeRef, redraw: redrawRef },
  );

  return (
    <div className="relative h-full w-full [--scene-hud-top:76px]">
      {unavailable ? <GlobeUnavailable onRetry={() => setAttempt((n) => n + 1)} /> : null}
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
      <GlobeOverlays
        selected={selected}
        orbit={orbit}
        cutaway={flat ? null : cutaway}
        marker={marker}
        hoverRing={hoverRing}
        scaleBar={scaleBar}
        scaleText={scaleText}
        scaleRule={scaleRule}
        sectionLine={sectionLine}
        tooltip={tooltip}
      />
    </div>
  );
}
