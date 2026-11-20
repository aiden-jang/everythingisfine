import { isLandingPresentation } from "../app/weatherLayers";
import { overlayPlacement } from "./overlayPlacement";
import { exposeScene } from "./debugScene";
import { watchGraphics, restoreGraphics } from "./graphicsRecovery";
import type { InspectionRun } from "../app/useEventInspection";
import { useGlobeLayers } from "./useGlobeLayers";
import { createFlightTarget } from "./cameraTarget";
import { createOrbitReadout } from "./orbitReadout";
import { type CutawayFocus } from "./cutaway";
import type { CameraGuidance } from "./cameraGuidance";
import { GlobeOverlays } from "./GlobeOverlays";
import { GlobeUnavailable } from "./GlobeUnavailable";
import { animationDelta } from "./animation";
import { createAnimationFrame } from "./animationFrame";
import { attachMarkerInspection, type MarkerTarget } from "./markerInspection";
import { observeViewport } from "./observeViewport";
import { useLandingRotation } from "./useLandingRotation";
import { attachSectionDrawing } from "./sectionDrawing";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { matches } from "../data/filter";
import { loadStars, type FigureTable } from "../geo/stars";
import { createGlobe, type GlobeMoment } from "./scene";
import { isRecordedFlight, isShadowChase, type GlobePresentation } from "./scenePresentation";
import { frontsFor, type FeedSnapshot } from "../app/feed";
import { createReplay, replayFrom, REPLAY_FRONT_MIN_MAG, type Replay } from "../app/replay";
import type { RampName } from "./ramp";
import { type SectionLine } from "../app/section";
import type { Aurora } from "../sources/aurora";
import type { SlabPoint } from "../geo/slab";
import type { Mark } from "./marks";
import type { GlobeProps } from "./GlobeProps";

/* The canvas, and the smallest possible amount of React around it. three.js owns everything inside it. See ARCHITECTURE.md#srcglobeglobetsx. */

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
  onPlace,
  placePin,
  onCamera,
  onReplay,
  focus = null,
  aurora = null,
  marks = [],
  scrubAt = null,
  flat = false,
  globePresentation = null,
  landing = false,
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
  const rotation = useLandingRotation(globePresentation, rotateLanding);
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
  // The frame loop reads current props without rebuilding the scene or its feed subscriptions.
  const live = useRef({
    filters,
    onFrame,
    onPlace,
    selected,
    focus,
    scrubAt,
    flat,
    globePresentation,
    landing,
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
    onPlace,
    selected,
    focus,
    scrubAt,
    flat,
    globePresentation,
    landing,
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
  const clearInspection = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    if (!landing) clearInspection.current();
  }, [landing]);
  const onSectionRef = useRef(onSection);
  onSectionRef.current = onSection;
  const drag = useRef<SectionLine | null>(null);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  const onReplayRef = useRef(onReplay);
  onReplayRef.current = onReplay;

  const [unavailable, setUnavailable] = useState<"startup" | "lost" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [guide, setGuide] = useState<CameraGuidance | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;

    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(el);
    } catch {
      setUnavailable("startup");
      return undefined;
    }
    setUnavailable(null);
    setGuide(globe.controls.guidance);
    const detachRotation = rotation.attach(el, globe.controls, () => wakeRef.current());
    const readout = createOrbitReadout(orbit.current);
    const draw = (full = false) => {
      globe.render(full || !!live.current.onFrame);
      live.current.onFrame?.(el);
    };
    globe.resize();
    draw();
    onReady(
      createFlightTarget(globe.controls, () => wakeRef.current(), globe.beginArrival),
      globe.controls.state,
    );

    let archiveTo = feed.snapshot().archive?.to;
    const clockAt = () => archiveTo ?? Date.now();
    let contextLost = false;
    onCapture?.(() => {
      const el2 = canvas.current;
      if (!el2 || contextLost) return null;
      // Apply wavefront visibility before the synchronous capture.
      globe.rings.step(0, visibleRing);
      draw(true);
      return el2;
    });

    if (import.meta.env.DEV) exposeScene(globe, feed, () => live.current, draw, clockAt);

    // Read live rather than captured: somebody can turn reduced motion on while the page is open.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    /*
     * What the pointer is over, which is no longer only an earthquake. Tagged rather than a bare string,
     * because a quake key and a mark id are different namespaces that both contain colons.
     */
    let hovered: MarkerTarget | null = null;

    const placeOverlays = overlayPlacement({
      el,
      globe,
      feed,
      read: () => live.current,
      clockAt,
      hover: () => hovered,
      drag,
      tooltip,
      hoverRing,
      marker,
      sectionLine,
      scaleBar,
      scaleRule,
      scaleText,
    });

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
        if (matches(quake, live.current.filters, clockAt())) {
          points.push({ lon: quake.primary.lon, lat: quake.primary.lat });
        }
      });
      globe.plates.orderFrom(points);
      // The render loop can be idle if every feed is unavailable.
      wakeRef.current();
    };

    // No data means no replay to finish, and the boundaries are geography either way.
    const revealFallback = window.setTimeout(startReveal, 8_000);

    const frame = (now: number): void => {
      if (contextLost) return;
      // Playback follows wall time; visual motion caps pauses before integrating the camera springs.
      const rawDt = (now - last) / 1000;
      const dt = animationDelta(rawDt);
      last = now;
      const moving = globe.controls.step(dt);
      const rotating = hovered === null && rotation.step(dt, moving || globe.controls.morph() > 0);
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
            globe.rings.spawn(quake.primary.lon, quake.primary.lat, quake.primary.magnitude, quake.key);
          });
        }
        replaying = true;
        globe.events.sync(
          feed.store,
          live.current.filters,
          clockAt(),
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

      const expanding = globe.rings.step(dt, visibleRing) > 0;
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
          clockAt(),
          zoomNow,
          revealUntil(),
          live.current.focus,
        );
      }
      const presenting = globe.stepPresentation(dt, reducedMotion.matches, rawDt);
      draw();
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
      if (document.hidden || contextLost) return;
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
    const visibleRing = (key: string | undefined): boolean => {
      const quake = key ? feed.store.get(key) : undefined;
      return (
        !!quake &&
        matches(quake, live.current.filters, clockAt()) &&
        quake.primary.time <= (revealUntil() ?? Infinity)
      );
    };
    const redraw = (): void => {
      if (contextLost) return;
      globe.rings.step(0, visibleRing);
      globe.cancelRegroup();
      globe.events.sync(
        feed.store,
        live.current.filters,
        clockAt(),
        globe.controls.state().zoom,
        revealUntil(),
        live.current.focus,
      );
      draw();
      placeOverlays();
    };
    redrawRef.current = redraw;
    auroraRef.current = globe.setAurora;
    markRef.current = (next) => {
      globe.setMarks(next);
    };
    globe.setMarkZoom(globe.controls.state().zoom);
    // Seed layers that arrived before scene creation; unchanged props will not rerun their effects.
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
      globe.events.setRamp(name);
      globe.rings.setRamp(name);
      globe.setGeography(name);
      redraw();
    };

    const redrawFromData = (snapshot: FeedSnapshot): void => {
      if (archiveTo !== snapshot.archive?.to) {
        replay?.skip();
        onReplayRef.current?.(null);
      }
      archiveTo = snapshot.archive?.to;
      globe.cancelRegroup();
      if (snapshot.seeding && snapshot.arrived.length > 0 && !replay && !reduced.matches) {
        let oldest = Infinity;
        feed.store.forEach((q) => {
          oldest = Math.min(oldest, q.primary.time);
        });
        if (Number.isFinite(oldest)) {
          const startedAt = clockAt();
          const from = replayFrom(oldest, startedAt);
          replay = createReplay({ from, to: startedAt });
          // Wider windows already show events older than the replay; include them in its initial count.
          revealed = 0;
          feed.store.forEach((q) => {
            if (q.primary.time <= from) revealed += 1;
          });
          // Announce before the first frame so the rail and globe start at the same count.
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
        clockAt(),
        globe.controls.state().zoom,
        revealUntil(),
        live.current.focus,
      );
      // A front per arrival, except on the seed. See `frontsFor`.
      const fronts = frontsFor(snapshot);
      for (const quake of fronts) {
        globe.rings.spawn(quake.primary.lon, quake.primary.lat, quake.primary.magnitude, quake.key);
      }
      if (fronts.length > 0) wake();
      else redraw();
    };

    const inspectionInput = attachMarkerInspection(
      el,
      globe,
      feed,
      () => live.current,
      clockAt,
      revealUntil,
      (next) => {
        hovered = next;
        el.style.cursor = next ? "pointer" : "";
        globe.setMarkHover(next?.kind === "mark" ? next.id : null);
        redraw();
        wake();
      },
      onSelect,
      onSelectMark,
      () => {
        if (!replay || replay.done()) return;
        replay.skip();
        onReplayRef.current?.(null);
        redraw();
      },
    );
    clearInspection.current = inspectionInput.clear;
    presentationRef.current = globe.setPresentation;

    const detach = globe.controls.attach(() => {
      readout.show();
      wake();
      placeOverlays();
    });
    const unsubscribe = feed.subscribe(redrawFromData);
    redraw();
    if (!isLandingPresentation(live.current.globePresentation)) globe.controls.enter();
    wake();

    const detachViewport = observeViewport(el, globe, redraw, wake, () => {
      animation.cancel();
      running = false;
    });

    const detachGraphics = watchGraphics(
      el,
      () => {
        contextLost = true;
        animation.cancel();
        running = false;
        setUnavailable("lost");
      },
      () => {
        contextLost = false;
        setUnavailable(null);
        redraw();
        wake();
      },
    );

    return () => {
      detachGraphics();
      animation.cancel();
      wakeRef.current = () => {};
      window.clearTimeout(revealFallback);
      detachViewport();
      detachRotation();
      unsubscribe();
      detach();
      clearInspection.current = () => {};
      inspectionInput.dispose();
      detachSection();
      gone = true; // Reject late table writes before disposing the scene.
      readout.dispose();
      globe.dispose();
    };
  }, [feed, onReady, onSelect, onCapture, onSelectMark, attempt, rotation]);

  useLayoutEffect(() => {
    redrawRef.current();
    wakeRef.current();
  }, [filters, selected, focus, scrubAt, flat, placePin]);

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

  const inspectable = landing && !unavailable;
  return (
    <div className="globe-scene relative h-full w-full [--scene-hud-top:76px]">
      {unavailable ? (
        <GlobeUnavailable
          lost={unavailable === "lost"}
          onRetry={() => {
            if (!restoreGraphics(canvas.current)) setAttempt((n) => n + 1);
          }}
        />
      ) : null}
      <canvas
        ref={canvas}
        aria-hidden={!inspectable}
        tabIndex={inspectable ? 0 : undefined}
        role={inspectable ? "button" : undefined}
        aria-label="Explore visible observations"
        aria-description="Use the left and right arrows to choose an observation. Press Enter to open it or Escape to dismiss."
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
      <GlobeOverlays
        guide={unavailable ? null : guide}
        wake={() => wakeRef.current()}
        selected={selected}
        placePin={placePin ?? null}
        marks={marks}
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
