import type { FlyTo } from "./globe/cameraTarget";
import { WaveReplayControls } from "./app/WaveReplayControls";
import { useEventInspection } from "./app/useEventInspection";
import { SequenceReplayControls } from "./app/SequenceReplayControls";
import { CanvasFooter } from "./app/CanvasFooter";
import { Observatory } from "./app/Observatory";
import { journeyFor, observatorySummary, observatoryFeedNote } from "./app/journeys";
import { GlobeHeader } from "./app/GlobeHeader";
import { earthSceneTarget, useObservatory, type EarthScene } from "./app/useObservatory";
import { useAuroraOverflight } from "./app/useAuroraOverflight";
import { useCutaway } from "./app/useCutaway";
import { liftForPanel } from "./app/panelLift";
import { useReplayAnalytics } from "./app/useReplayAnalytics";
import { reportAnalytics } from "../analytics/browser";
import { useGlobeResources } from "./app/useGlobeResources";
import { useGlobeTour } from "./app/useGlobeTour";
import { GlobeLoading } from "./globe/GlobeLoading";
import { stillMoment } from "./app/still";
import { useStill } from "./app/useStill";
import { RegionalResults } from "./app/RegionalResults";
import { APRIL_ECLIPSE_DAY } from "./geo/aprilEclipse";
import { eclipseClock } from "./app/eclipseReplay";
import { EclipseReplayControls } from "./app/EclipseReplayControls";
import { useEclipsePlayback } from "./app/useEclipsePlayback";
import { useTimelinePlayback } from "./app/useTimelinePlayback";
import { ArchiveControls } from "./app/ArchiveControls";
import { useArchive } from "./app/useArchive";
import {
  cloneElement,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
const Globe = lazy(() => import("./globe/Globe").then((m) => ({ default: m.Globe })));
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { search, type Hit } from "./app/search";
import { useRolling } from "./app/roll";
import { useFloatingChrome, useNarrow } from "./app/useNarrow";
import { useStoredFlag, useStoredName, useStoredNumber } from "./app/useStored";
import { newestEpisode } from "./sources/volcanoes";
import { summarise, FEED_CAP } from "./sources/wildfires";
import { countries } from "./sources/floods";
import { marksFor } from "./app/marks";
import { depthBands } from "./data/depth";
import { findSubject, MarkCard } from "./app/MarkCard";
import { hazardGroups, outsideWindowNote } from "./app/hazards";
import { withinWindow } from "./app/age";
import { sizesOf } from "./app/gutenberg";
import { SizeChart } from "./app/Sizes";
import { createSiren, type Siren } from "./app/sound";
import { lunarEclipse, solarEclipse } from "./geo/eclipse";
import { closestTo, localZone, viewerPlace } from "./app/viewer";
import {
  BASELINE_DAYS,
  BASELINE_FROM,
  BASELINE_MIN_MAGNITUDE,
  BASELINE_TO,
  BASELINE_WEEKS,
  comparableCount,
  rankDay,
  type Span as BaselineSpan,
  sharePercent,
} from "./data/baseline";
import { boundarySegments, nearestBoundaryKm, QUIET_BAND_KM, QUIET_BAND_SHARE } from "./geo/boundaryDistance";
import { MobileNavigation } from "./app/MobileNavigation";
import { ViewNotices } from "./app/ViewNotices";
import { sharedEarthquakeNotice, sharedHazardNotice } from "./app/linkNotices";
import { EventList } from "./app/EventList";
import { earthquakeCoverage, earthquakeEmpty, earthquakeReach } from "./app/earthquakeStatus";
import { feedStatus } from "./app/feedStatus";
import { useHazardLayers } from "./app/useHazardLayers";
import { DetailPanel } from "./app/DetailPanel";
import { MagnitudeFilter } from "./app/MagnitudeFilter";
import { Timeline } from "./app/Timeline";
import { clamp as clampScrub, dragTo, fractionOf, LIVE, nudge, togglePlay, type Scrub } from "./app/scrub";
import { Resizer } from "./app/Resizer";
import { CrossSection } from "./app/CrossSection";
import { buildSection, type SectionHinge, type SectionLine } from "./app/section";
import { BUCKETS, histogram, totalIn } from "./app/histogram";
import { diurnal } from "./app/diurnal";
import { Dial } from "./app/Dial";
import { decode, encode } from "./app/permalink";
import { replaceViewLocation } from "./app/viewLocation";
import { seconds } from "./app/arrival";
import { timesLabel, versusReference } from "./app/versus";
import { tick } from "./app/touch";
import { recordWhen, SINCE, superlativeFor, UNTIL } from "./app/superlative";
import { rampColorAt, type RampName } from "./globe/ramp";
import { matches, windowStart } from "./data/filter";
import type { Filters, Quake, SourceId } from "./data/types";
import {
  ago,
  agoShort,
  clock,
  corroborationNote,
  energyPercent,
  magnitude,
  place,
  quietNote,
  quietParts,
  compactSpan,
  SOURCE_NAMES,
} from "./app/format";

/* Built here and not in an effect. In an effect, StrictMode mounts twice and you get two WebSockets. */
const feed = createFeed();

/* Both the drag handle and the restore path have to use these. When they did not, a stored 1 got
through and the rail came back one pixel wide. */
const RAIL_MIN = 264;
const RAIL_MAX = 620;
const RAIL_DEFAULT = 356;

function useFeed(): FeedSnapshot {
  const [snapshot, setSnapshot] = useState(() => feed.snapshot());
  useEffect(() => feed.subscribe(setSnapshot), []);
  return snapshot;
}

// Read before the first render. In an effect it shows the default globe first, then jumps.
const shared = decode(window.location.hash);

export function App(): JSX.Element {
  const snapshot = useFeed();
  const historyIntent = useRef<string | null>(null);
  const observatory = useObservatory(shared);
  const { enterExplore, enterObserve, chooseScene, setReady: setGlobeReady } = observatory;
  const [liveFilters, setFilters] = useState<Filters>(() => ({
    minMagnitude: shared.minMagnitude ?? DEFAULT_FILTERS.minMagnitude,
    windowMs: shared.windowHours === undefined ? DEFAULT_FILTERS.windowMs : shared.windowHours * 3_600_000,
    sources: new Set(shared.sources ?? [...DEFAULT_FILTERS.sources]),
  }));
  const { archive } = snapshot;
  const filters = useMemo(
    () => (archive ? { ...liveFilters, windowMs: archive.to - archive.from } : liveFilters),
    [archive, liveFilters],
  );
  const partialArchive =
    archive?.answered && Object.values(archive.answered).some((answer) => !answer || answer.truncated);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [replay, setReplay] = useState<{ at: number; revealed: number } | null>(null);
  const receiveReplay = useReplayAnalytics(setReplay);
  const [scrub, setScrub] = useState<Scrub>(
    shared.cursor === undefined ? LIVE : { at: shared.cursor, playing: false },
  );
  const [pendingRev, setPendingRev] = useState<number | null>(null);
  const [missingShared, setMissingShared] = useState<string | null>(shared.event ?? null);
  const [focusHour, setFocusHour] = useState<number | null>(null);
  const { aurora, cyclones, fires, floods, volcanoes, answered, checked } = useHazardLayers();
  const clockAt = useCallback(() => feed.snapshot().archive?.to ?? Date.now(), []);
  const archived = snapshot.archive !== null;
  const initialArchiveMark = useRef(shared.day ? (shared.mark ?? null) : null);
  const archiveState = useArchive(feed, snapshot.archive, shared.day, (returnedToLive) => {
    const archive = feed.snapshot().archive;
    setSelected(null);
    setMarkId(
      !returnedToLive && archive?.from === Date.parse(shared.day ?? "") ? initialArchiveMark.current : null,
    );
    initialArchiveMark.current = null;
    if (returnedToLive) setScrub(LIVE);
    const day = historyIntent.current;
    historyIntent.current = null;
    if (day && !returnedToLive && archive && new Date(archive.from).toISOString().slice(0, 10) === day) {
      let largest: Quake | null = null;
      feed.store.forEach((q) => {
        if (!largest || q.primary.magnitude > largest.primary.magnitude) largest = q;
      });
      const key = (largest as Quake | null)?.key;
      if (key) selectQuake(key);
    }
  });
  const { archiveHazards, backToLive, stepDay, archiveBusy, archiveDay, loadedDay } = archiveState;
  const earthquakeFeedsDown =
    !archived &&
    !archiveBusy &&
    snapshot.statuses.usgs.kind === "failing" &&
    snapshot.statuses.emsc.kind === "failing";
  const [mapOn, setFlat] = useStoredFlag("flat", false, shared.section ? true : shared.flat);
  const flat = observatory.observing ? observatory.observations.map : mapOn;
  const chase = useEclipsePlayback(
    loadedDay === APRIL_ECLIPSE_DAY && !archiveBusy && !flat && !observatory.observing,
    setScrub,
  );
  const inspection = useEventInspection(
    selected,
    !observatory.observing && !flat && !archiveBusy && !chase.frame,
  );
  const now = snapshot.archive ? snapshot.archive.to : Date.now();
  const minuteClock = Math.floor(now / 60_000) * 60_000;
  const overflight = useAuroraOverflight(
    aurora,
    answered.aurora,
    observatory.aurora,
    observatory.night && !archived,
    minuteClock,
  );
  const span = snapshot.archive ?? { from: now - filters.windowMs, to: now };
  const view = chase.frame ? { at: chase.frame.at, playing: chase.playing } : clampScrub(scrub, span);
  const viewClock = view.at === null ? null : chase.frame ? eclipseClock(view.at) : clock(view.at);
  /* The cursor reveals these layers too, quantised to the strip's bucket: playing steps it twenty times
     a second, and these feeds are dated to the hour at best. */
  const revealStep = filters.windowMs / BUCKETS;
  const revealAt = view.at === null ? null : Math.floor(view.at / revealStep) * revealStep;
  const onGlobe = useMemo(() => {
    /* Window first, on each layer's own date, then the cursor. `age.ts` has the argument for the dates. */
    const shown = <T,>(list: readonly T[], dateOf: (h: T) => number | null): readonly T[] =>
      list.filter((h) => {
        const at = dateOf(h);
        if (!withinWindow(at, minuteClock, filters.windowMs)) return false;
        return revealAt === null || at === null || at <= revealAt;
      });
    const started = (h: { startedAt: number | null }): number | null => h.startedAt;
    return {
      cyclones: shown(archived ? (archiveHazards?.cyclones ?? []) : cyclones, started),
      volcanoes: shown(archived ? (archiveHazards?.volcanoes ?? []) : volcanoes, (v) => v.endedAt),
      fires: shown(archived ? (archiveHazards?.fires ?? []) : fires, started),
      floods: shown(archived ? (archiveHazards?.floods ?? []) : floods, started),
      aurora: archived ? null : aurora,
    };
  }, [
    archived,
    archiveHazards,
    cyclones,
    volcanoes,
    fires,
    floods,
    aurora,
    filters.windowMs,
    revealAt,
    minuteClock,
  ]);
  const hazardTally = useMemo(() => {
    const held = archived
      ? {
          cyclones: archiveHazards?.cyclones ?? [],
          volcanoes: archiveHazards?.volcanoes ?? [],
          fires: archiveHazards?.fires ?? [],
          floods: archiveHazards?.floods ?? [],
        }
      : { cyclones, volcanoes, fires, floods };
    const newestOf = <T,>(list: readonly T[], dateOf: (h: T) => number | null): number | null =>
      list.reduce<number | null>((best, h) => {
        const at = dateOf(h);
        return at === null ? best : best === null ? at : Math.max(best, at);
      }, null);
    const started = (h: { startedAt: number | null }): number | null => h.startedAt;
    return [
      {
        kind: "cyclone" as const,
        held: held.cyclones.length,
        shown: onGlobe.cyclones.length,
        newest: newestOf(held.cyclones, started),
      },
      {
        kind: "fire" as const,
        held: held.fires.length,
        shown: onGlobe.fires.length,
        newest: newestOf(held.fires, started),
      },
      {
        kind: "flood" as const,
        held: held.floods.length,
        shown: onGlobe.floods.length,
        newest: newestOf(held.floods, started),
      },
      {
        kind: "volcano" as const,
        held: held.volcanoes.length,
        shown: onGlobe.volcanoes.length,
        newest: newestOf(held.volcanoes, (v) => v.endedAt),
      },
    ];
  }, [
    archived,
    archiveHazards,
    cyclones,
    volcanoes,
    fires,
    floods,
    onGlobe.cyclones,
    onGlobe.fires,
    onGlobe.floods,
    onGlobe.volcanoes,
  ]);
  const fireSummary = useMemo(() => summarise(onGlobe.fires), [onGlobe.fires]);
  // Keyed on the revision, not the clock: the rail re-renders every second and these only move when an
  // earthquake arrives. Same reason everywhere else in this file that keys on `snapshot.revision`.
  const depth = useMemo(
    () => depthBands(feed.store, filters, clockAt()),
    // Data revisions invalidate depth bands while the store identity stays fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, snapshot.revision, clockAt],
  );
  /* Clamp on the way in too. The `Resizer` bounds this while dragging and the restore path went around
     it, so a stored 1 came back as a rail one pixel wide with nothing to grab. */
  const [railWidth, setRailWidth] = useStoredNumber("rail", RAIL_DEFAULT, (n) =>
    Math.min(RAIL_MAX, Math.max(RAIL_MIN, n)),
  );
  /* 0 means "nobody has dragged it", so the stylesheet's `60dvh` stays the only place that decides. */
  const [sheetCanvas, setSheetCanvas] = useStoredNumber("sheet", 0, (n) => Math.max(0, n));
  const [regionsHeight, setRegionsHeight] = useStoredNumber("regions", 132);
  const [sectionLine, setSectionLine] = useState<(SectionLine & { hinge?: SectionHinge }) | null>(
    shared.section ?? null,
  );
  // Read lazily, so the first paint has the right ramp instead of flashing the default one.
  const [ramp, setRamp] = useStoredName<RampName>("ramp", "thermal", ["thermal", "cividis"], shared.ramp);
  const [announceAbove, setAnnounceAbove] = useStoredNumber("announceAbove", 4.5);
  const [markId, setMarkId] = useState<string | null>(shared.day ? null : (shared.mark ?? null));
  /* Never reload here. There is no backend, so the buffer is every event on screen. */
  const resetView = useCallback(() => {
    setQuery("");
    setSectionLine(null);
    setScrub(LIVE);
    setSelected(null);
    setMarkId(null);
    setFarSideOf(null);
    setFilters({ ...DEFAULT_FILTERS, sources: new Set(DEFAULT_FILTERS.sources) });
    // Only when there is an archive to leave: `resumeLive` clears the store.
    if (feed.snapshot().archive !== null) backToLive();
    if (feed.setWindow(DEFAULT_FILTERS.windowMs)) setPendingRev(feed.snapshot().revision);
    flyTo.current(145, 12, 1, 0, true);
    replaceViewLocation(window.location.pathname + window.location.search);
    // The writer only writes while the hash is the one it last wrote, which is what protects a pasted
    // link. Emptying it without saying so leaves the writer refusing to write again.
    lastWritten.current = window.location.hash;
  }, [backToLive]);
  const [farSideOf, setFarSideOf] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useStoredFlag("legendKey", false);
  const [motionOn, setMotionOn] = useStoredFlag("motion", false);
  const [sinkOn, setSinkOn] = useStoredFlag("depthSink", true);
  // Load the slab only when requested; the depth markers alone need no extra geometry.
  const [slabOn, setSlabOn] = useStoredFlag("slab", false);
  const [figuresOn, setFiguresOn] = useStoredFlag("figures", false);
  const { zones, motionData, motion, slabData, figureData } = useGlobeResources({
    motionOn,
    slabOn: slabOn || observatory.depth,
    figuresOn: figuresOn || observatory.night,
  });
  const here = useMemo(() => (zones ? viewerPlace(zones, localZone()) : null), [zones]);
  const segments = useMemo(() => boundarySegments(), []);
  // Cached per event, not per render: a month of events against every segment is a million tests, and
  // an epicentre never moves.
  const boundaryCache = useRef(new Map<string, number>());
  const boundaryKmOf = useCallback(
    (quake: Quake): number | null => {
      if (segments.length === 0) return null;
      const cached = boundaryCache.current.get(quake.key);
      if (cached !== undefined) return cached;
      const km = nearestBoundaryKm(quake.primary.lon, quake.primary.lat, segments);
      if (km === null) return null;
      boundaryCache.current.set(quake.key, km);
      return km;
    },
    [segments],
  );
  /* Build the AudioContext on the press. Built without a user gesture it starts suspended and drops
  every later tone in silence: the toggle says on and nothing is heard. */
  const [sound, setSound] = useState(false);
  const siren = useRef<Siren | null>(null);
  useEffect(() => {
    if (!sound) {
      siren.current?.close();
      siren.current = null;
      return undefined;
    }
    try {
      siren.current = createSiren();
    } catch {
      siren.current = null;
    }
    return () => {
      siren.current?.close();
      siren.current = null;
    };
  }, [sound]);
  const onNews = useCallback((magnitudes: number[]) => {
    siren.current?.play(magnitudes);
  }, []);
  const flyTo = useRef<FlyTo>(() => {});
  const lastWritten = useRef<string>(window.location.hash);
  const camera = useRef<{ lon: number; lat: number; zoom: number }>({
    lon: shared.lon ?? 145,
    lat: shared.lat ?? 12,
    zoom: shared.zoom ?? 1,
  });
  const { cutaway, onCutaway, onSink } = useCutaway(
    () => (selected ? feed.store.get(selected)?.primary : null) ?? camera.current,
    setSinkOn,
  );
  // Call and read this in the same tick. See `Globe.onCapture`.
  const onReady = useCallback(
    (fn: typeof flyTo.current) => {
      flyTo.current = fn;
      setGlobeReady(true);
      fn(camera.current.lon, camera.current.lat, camera.current.zoom);
    },
    [setGlobeReady],
  );

  const heldCursor = view.playing ? null : view.at;
  const sharedCursor = useRef(view.at);
  sharedCursor.current = view.at;

  useLayoutEffect(() => {
    /* Never overwrite a hash this app did not write. See ARCHITECTURE.md#srcapptsx. */
    const write = (): void => {
      if (window.location.hash !== lastWritten.current) return;
      const pinnedNow = selected ? feed.store.get(selected) : undefined;
      const reading = pinnedNow?.primary;
      const fragment = encode({
        ...camera.current,
        minMagnitude: filters.minMagnitude,
        windowHours: filters.windowMs / 3_600_000,
        sources: [...filters.sources],
        ramp,
        flat: mapOn,
        presentation: observatory.presentation,
        event: reading ? `${reading.source}:${reading.id}` : null,
        day: snapshot.archive ? new Date(snapshot.archive.from).toISOString().slice(0, 10) : null,
        mark: markId,
        section: sectionLine,
        // The moment being drawn, not the one the link asked for. `scrub` keeps the asked-for value so the
        // notice can say it was refused; writing that value back out spread it on every re-share.
        cursor: sharedCursor.current,
      });
      if (`#${fragment}` !== window.location.hash) replaceViewLocation(`#${fragment}`);
      // Skip no-op writes: the SPA beacon counts each replacement as a page view.
      lastWritten.current = window.location.hash;
    };
    write();
    const timer = window.setInterval(write, 1000);
    return () => window.clearInterval(timer);
    // `snapshot.archive` is a dependency: the interval keeps calling the closure it was made with, and
    // without it entering an archive leaves the link saying live.
  }, [
    filters,
    selected,
    ramp,
    sectionLine,
    snapshot.archive,
    markId,
    heldCursor,
    mapOn,
    observatory.presentation,
  ]);

  /* Somebody pasting a link into an open tab. A fragment change does not reload, and the permalink is
  read once at module load, so the address bar and the globe would disagree. */
  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash !== lastWritten.current) window.location.reload();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const fetching = pendingRev !== null && snapshot.revision === pendingRev;
  /* Null on the live view, not a timestamp: the scene keeps its minute throttle instead of re-aiming
  the sun every render for a change no eye could see. */
  const litAt = observatory.viewAt ?? view.at ?? (archived ? clockAt() : null);
  const eclipseKey = litAt ?? Math.floor(Date.now() / 60_000) * 60_000;
  const eclipse = useMemo(() => {
    const solar = solarEclipse(eclipseKey);
    if (solar.touching) return { kind: solar.umbra > 0 ? "total" : "annular" } as const;
    return lunarEclipse(eclipseKey).umbral > 0 ? ({ kind: "lunar" } as const) : null;
  }, [eclipseKey]);
  const { saving, stillCounts, saveStill, onCapture, notice, download, dismiss } = useStill(
    feed,
    filters,
    ramp,
    overflight.run?.forecast.forecastAt ?? view.at,
    overflight.run
      ? "NOAA OVATION · illustrative veil"
      : (cutaway || observatory.depthFocus) && !flat
        ? "reference cutaway · true scale"
        : null,
  );
  // Count the displayed subset, not whole timeline bins.
  const revealedNow = ((): number | null => {
    if (view.at === null) return null;
    const limit = view.at;
    let n = 0;
    feed.store.forEach((quake) => {
      if (quake.primary.time > limit) return;
      if (matches(quake, filters, now)) n += 1;
    });
    return n;
  })();
  const regions = useMemo(
    () => countByRegion(feed.store, filters, clockAt()).filter((r) => r.count > 0),
    // Arrivals change regional counts without replacing the external store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, snapshot.revision, clockAt],
  );

  const journey = useMemo(
    () => journeyFor(feed.store, filters, clockAt(), regions, view.at),
    // Data revisions own the external store's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, snapshot.revision, regions, clockAt, view.at],
  );
  const {
    tourAt,
    touring,
    tourButton,
    startTour: beginTour,
    stopTour,
    tourControls,
    paused: tourPaused,
    nextTour,
    previousTour,
    togglePause,
    tourLength,
    onCamera: observeTourCamera,
  } = useGlobeTour(journey.stops, flyTo, observatory.setTourStop);
  const startTour = useCallback(() => {
    chooseScene("live");
    setSelected(null);
    setMarkId(null);
    setSectionLine(null);
    setQuery("");
    enterObserve();
    beginTour();
  }, [beginTour, chooseScene, enterObserve]);
  const openExplorer = () => observatory.exploreScene(stopTour);
  const closeReading = (kind: "quake" | "hazard" | "section") => {
    const selector =
      kind === "quake"
        ? '#recent-earthquakes [aria-current="true"]'
        : kind === "hazard"
          ? '[data-hazard-row][aria-current="true"]'
          : null;
    const returnTo = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (kind === "quake") setSelected(null);
    else if (kind === "hazard") setMarkId(null);
    else setSectionLine(null);
    requestAnimationFrame(() =>
      (returnTo?.checkVisibility() ? returnTo : document.getElementById("globe-view"))?.focus({
        preventScroll: true,
      }),
    );
  };
  const chooseEarthScene = (scene: EarthScene): void => {
    stopTour();
    const next = earthSceneTarget(scene, journey.deepest, view.at ?? clockAt());
    chooseScene(next.scene, next.focus);
    if (next.scene === "live" && archived) backToLive();
    flyTo.current(...next.camera);
  };

  const section = useMemo(
    () =>
      sectionLine
        ? buildSection(
            feed.store,
            sectionLine,
            filters,
            clockAt(),
            undefined,
            slabOn && slabData.length > 0 ? slabData : [],
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.store, sectionLine, filters, snapshot.revision, slabOn, slabData],
  );

  useEffect(() => {
    if (!missingShared) return;
    const [source, id] = missingShared.split(":") as [SourceId, string];
    const found = feed.store.findByReading(source, id);
    if (found) {
      setSelected(found.key);
      setMissingShared(null);
    }
  }, [missingShared, snapshot.revision]);

  const pinned = selected ? feed.store.get(selected) : undefined;
  // The panel outlives the pin by one exit transition; see where it is rendered.
  const lastPinned = useRef(pinned);
  if (pinned) lastPinned.current = pinned;
  const shownQuake = pinned ?? lastPinned.current;
  /* Must stay below the selection: the far-side figure is one of these marks and needs the pinned
  event's position, and it is gated on that event still being pinned - the toggle is in the panel, so
  dismissed, the arcs would have no explanation and no way off. */
  const traced = farSideOf && farSideOf === selected ? feed.store.get(farSideOf) : undefined;
  const tracedReading = traced?.primary;
  const farSide = useMemo(
    () => (tracedReading ? { lon: tracedReading.lon, lat: tracedReading.lat } : null),
    [tracedReading],
  );
  /* The 9.4% area share is measured on a cos-weighted grid in `boundaryDistance.ts`, so it means area
  and not a count of cells. */
  const quiet = useMemo((): {
    note: string | null;
    parts: { percent: number; times: number } | null;
  } => {
    if (segments.length === 0) return { note: null, parts: null };
    let near = 0;
    let total = 0;
    feed.store.forEach((quake) => {
      if (!matches(quake, filters, clockAt())) return;
      total += 1;
      const km = boundaryKmOf(quake);
      if (km !== null && km <= QUIET_BAND_KM) near += 1;
    });
    return {
      note: quietNote(near, total, QUIET_BAND_KM, QUIET_BAND_SHARE),
      parts: quietParts(near, total, QUIET_BAND_SHARE),
    };
    // New readings change this spatial tally under unchanged filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.revision, filters, segments, boundaryKmOf, clockAt]);
  // Looked up at render, not captured on click: the feeds refresh every ten minutes and a captured
  // card keeps describing a storm that is gone.
  const hazards = useMemo(
    () => hazardGroups(onGlobe, minuteClock, archived),
    [onGlobe, archived, minuteClock],
  );
  const markSubject = observatory.observing ? null : findSubject(markId, onGlobe);
  /* Read through a ref: `selectMark` is stable, and the layers change under it. */
  const onGlobeRef = useRef(onGlobe);
  onGlobeRef.current = onGlobe;
  /* The same rule as an earthquake: pick it and the camera goes, lifted clear of whatever is describing it.
     A flood behind the panel is the same defect as an earthquake behind it. */
  const observingRef = useRef(observatory.observing);
  observingRef.current = observatory.observing;
  const selectMark = useCallback(
    (id: string | null) => {
      setMarkId(id);
      /*
       * Clearing a mark must not clear an earthquake. The globe reports a hit as `onSelect(quake)` followed
       * by `onSelectMark(null)`, so a `setSelected(null)` up here undid the selection on the same tap: every
       * click on an earthquake flew the camera to it and then showed no panel.
       */
      if (id === null) return;
      if (observingRef.current) enterExplore();
      setSelected(null);
      const where = findSubject(id, onGlobeRef.current)?.subject;
      if (where) {
        reportAnalytics({ name: "event_opened" });
        flyTo.current(where.lon, where.lat, Math.max(camera.current.zoom, 2.2), liftForPanel());
      }
    },
    [enterExplore],
  );
  const selectQuake = useCallback(
    (key: string | null) => {
      if (key !== null) tick();
      setMarkId(null);
      setSelected(key);
      /* `Math.max`, so pinning never zooms somebody out of the view they chose. */
      if (key === null) return;
      const quake = feed.store.get(key);
      if (!quake) return;
      if (observingRef.current) enterExplore();
      reportAnalytics({ name: "event_opened" });
      flyTo.current(quake.primary.lon, quake.primary.lat, Math.max(camera.current.zoom, 1.9), liftForPanel());
    },
    [enterExplore],
  );
  const marks = useMemo(
    () =>
      marksFor({
        ...onGlobe,
        farSide,
        motion: motionOn && !observatory.observing ? motionData : [],
        here,
      }),
    [onGlobe, farSide, motionOn, motionData, here, observatory.observing],
  );
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  useTimelinePlayback(
    scrub.playing && !chase.frame && !observatory.observing,
    filters.windowMs,
    setScrub,
    snapshot.archive,
  );

  /*
   * Space and the step keys only while nothing is focused, or space stops activating a focused button.
   * Escape is not gated that way: it is an escape.
   */
  useEffect(() => {
    // Read at the press. A span captured when the listener was armed is stale by however long the tab
    // has been open.
    const spanNow = (): { from: number; to: number } => {
      const at = Date.now();
      return feed.snapshot().archive ?? { from: at - filters.windowMs, to: at };
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !document.querySelector("[data-feed-popover]:popover-open")) {
        // One rung at a time, innermost first: closing the pin and the section together undoes two decisions
        // with one press.
        if (query) setQuery("");
        else if (sectionLine) setSectionLine(null);
        else if (scrub.at !== null) setScrub(LIVE);
        /* Both panels on one rung, cleared without being read. See ARCHITECTURE.md#srcapptsx. */
        else {
          setMarkId(null);
          setSelected(null);
        }
        return;
      }
      const active = document.activeElement;
      if (active && active !== document.body && active.id !== "globe-view") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        const live = spanNow();
        setScrub((sc) => togglePlay(clampScrub(sc, live), live));
      } else if (e.key === "," || e.key === ".") {
        // No shift multiplier: shift-comma is `<` here and something else on the next layout, so the hint
        // strip could not print it.
        const live = spanNow();
        setScrub((sc) => nudge(clampScrub(sc, live), live, e.key === "." ? 1 : -1));
      } else if (e.key === "f" || e.key === "F") {
        /* Requested on the frame, not on `documentElement`, so the letterboxing takes the page's background. */
        const el = document.querySelector(".frame");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else if (el) void (el as HTMLElement).requestFullscreen?.().catch(() => {});
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        stepDay(e.key === "]" ? 1 : -1);
      } else return;
      // Space scrolls a page, so the transport must not depend on `overflow: hidden` staying true.
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sectionLine, scrub.at, filters.windowMs, query, stepDay]);

  const toggleSource = (id: SourceId): void => {
    reportAnalytics({ name: "source_filter_changed" });
    setFilters((f) => {
      const sources = new Set(f.sources);
      if (sources.has(id)) sources.delete(id);
      else sources.add(id);
      return { ...f, sources };
    });
  };

  /* The store hands events back in arrival order, which is right for eviction and wrong for a list headed
     "newest first". See ARCHITECTURE.md#srcapptsx. */
  const recent = useMemo(
    () => feed.store.newest(60, (q) => matches(q, filters, clockAt())),
    // A revision invalidates this selection of the newest arrivals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, snapshot.revision, clockAt],
  );

  // The later of the two feed edges, not the earlier: a corroboration rate needs the span where both
  // agencies had eyes on it.
  const overlapFrom =
    snapshot.covered.usgs !== null && snapshot.covered.emsc !== null
      ? Math.max(snapshot.covered.usgs, snapshot.covered.emsc)
      : null;

  const coverage = earthquakeCoverage(snapshot, filters, now);
  const { bars, strongest, bucketMs, energyShare, energyTotal, overlap, reported } = useMemo(
    () => histogram(feed.store.forEach, filters, now, coverage.from, overlapFrom),
    // `now` is absent on purpose: it ticks every second and the bars only move on a bucket boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision, coverage.from, overlapFrom],
  );

  // `now` is absent on purpose: a second passing does not change what matches a query, and depending on
  // it re-walks fifty thousand events every second.
  const results = useMemo(
    () => search(query, feed.store, filters, clockAt()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  const pick = (hit: Hit): void => {
    if (hit.kind === "region") {
      flyTo.current(hit.region.lon, hit.region.lat, hit.region.zoom);
      return;
    }
    setSelected(hit.strongest.key);
    flyTo.current(hit.strongest.primary.lon, hit.strongest.primary.lat, 2.2);
  };

  const clockBins = useMemo(
    () => diurnal(feed.store.forEach, filters, clockAt()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  /* A bucket is `windowMs / 24`, not an hour. Multiplying the index by an hour lit the same recent hour
  for every bar at a month. */
  const focusSpan = useMemo(
    () =>
      focusHour === null ? null : { from: now - (focusHour + 1) * bucketMs, to: now - focusHour * bucketMs },
    // `now` is absent for the reason the bars exclude it: it would re-sync the marker layer every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusHour, bucketMs],
  );

  const sizes = useMemo(
    () => sizesOf(feed.store, filters, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.store, filters, snapshot.revision],
  );
  const hours = Math.round(filters.windowMs / 3_600_000);
  // Counts what is on the globe, not what is in the buffer: dragging magnitude to 5.0 emptied the globe
  // and `stats.quakes` beside it stayed put. The strip spans exactly the window, so its total is the
  // window's total - one walk, one number, and the strip and the headline cannot disagree.
  const shown = totalIn(bars);
  const emptyEarthquakes = earthquakeEmpty({
    waiting: coverage.waiting || (archiveBusy && !archived),
    unavailable:
      !archived &&
      !archiveBusy &&
      [...filters.sources].every((id) => snapshot.statuses[id].kind === "failing"),
    reported,
    earlierUnavailable: !archived && !archiveBusy && coverage.from === null && !coverage.waiting,
    archived,
    partial: coverage.partial,
    hasSources: filters.sources.size > 0,
  });

  // `useRolling` is handed the animate-or-jump distinction rather than inferring it, because the two
  // cases look identical from the value alone.
  const driven = replay !== null || view.at !== null;
  const headline = useRolling(replay ? replay.revealed : (revealedNow ?? shown), !driven);

  /* The count in the tab, so leaving the page open is worth something. Not during the replay: the count
     climbs through a whole day in 2.8 seconds, which is a flickering tab rather than a readout, and it is
     showing yesterday anyway. See ARCHITECTURE.md#srcapptsx. */
  useEffect(() => {
    const base = "Everything Is Fine";
    if (replay || snapshot.coveredSince === null) {
      document.title = base;
      return;
    }
    // The day that is loaded, not the text in the box: typing put half a date in the tab title.
    const at = snapshot.archive;
    const day = at ? `${new Date(at.from).toISOString().slice(0, 10)} · ` : "";
    document.title = `(${headline.toLocaleString("en-GB")}) ${day}${base}`;
  }, [headline, replay, snapshot.coveredSince, snapshot.archive]);
  // `headline`, not the raw total, so the number on the image is the number that was on screen.
  stillCounts.current = {
    quakes: headline,
    cyclones: onGlobe.cyclones.length,
    fires: fireSummary.count,
    firesCapped: fireSummary.count >= FEED_CAP,
    floods: onGlobe.floods.length,
  };

  /* A shared cursor the window cannot hold, or the recipient sees the present with no reason why. See ARCHITECTURE.md#srcapptsx. */
  const staleCursor = shared.cursor !== undefined && scrub.at === shared.cursor && view.at !== shared.cursor;

  const edge = windowStart(now, filters.windowMs, partialArchive ? null : snapshot.coveredSince);

  /*
   * Three gates: only at 24h, because the baseline counts calendar days; only once the window is
   * covered, because a day still filling reads as quiet; and an archived day needs neither.
   */
  const near = useMemo(() => {
    if (replay || here === null) return null;
    return closestTo(feed.store, here, filters, clockAt(), view.at ?? clockAt());
    // The nearest event can change on a feed revision while the viewer stays still.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, filters, snapshot.revision, replay, view.at, clockAt]);

  /* Do not let `f` fold these: a full screen with a planet and nothing else is a screensaver. Each fold
  is offered only where it buys something - see `useFloatingChrome`. */
  const chromeFloats = useFloatingChrome();
  const [headOpen, setHeadOpen] = useStoredFlag("head", true);
  const [railOpen, setRailOpen] = useStoredFlag("railOpen", true);
  const railShown = !observatory.observing && (railOpen || !chromeFloats);
  const headShown = observatory.observing || headOpen || chromeFloats;

  const versus = useMemo(() => versusReference(energyTotal), [energyTotal]);

  const ceiling = useMemo(
    // As of the day on screen: an archived day must not be handed a record from its own future.
    () => superlativeFor(strongest, snapshot.archive ? snapshot.archive.from : clockAt()),
    [strongest, snapshot.archive, clockAt],
  );

  const baselineSpan: BaselineSpan | null =
    filters.windowMs === 24 * 3_600_000 ? "day" : filters.windowMs === 7 * 24 * 3_600_000 ? "week" : null;
  const baseline = useMemo(() => {
    if (replay) return null;
    if (snapshot.archive) {
      const { from, to } = snapshot.archive;
      return rankDay(comparableCount(feed.store, from, to), true, "day");
    }
    if (baselineSpan === null || !edge.complete) return null;
    /* The ranking ignores the magnitude filter on purpose - one a reader can change by dragging a slider is
       worse than none - but it must still stand down when the filter empties the screen. See ARCHITECTURE.md#srcapptsx. */
    if ((revealedNow ?? shown) <= 0) return null;
    return rankDay(comparableCount(feed.store, edge.at, now), true, baselineSpan);
    // Catalogue revisions affect the rank even when filters have not changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.archive,
    snapshot.revision,
    baselineSpan,
    edge.complete,
    edge.at,
    now,
    replay,
    shown,
    revealedNow,
  ]);
  const feeds = feedStatus(snapshot.statuses, answered, { ...snapshot.checked, ...checked });

  const keyOnCanvas = useNarrow() === false;
  // Compose shared legend props once so the rail and canvas cannot drift apart.
  const marksFilter = (
    <MagnitudeFilter
      ramp={ramp}
      value={filters.minMagnitude}
      onChange={(v) => setFilters((f) => ({ ...f, minMagnitude: v }))}
      aurora={onGlobe.aurora}
      cyclones={onGlobe.cyclones}
      volcanoes={onGlobe.volcanoes.length}
      outsideWindow={outsideWindowNote(hazardTally, now)}
      volcanoesSince={newestEpisode(volcanoes)}
      // Use the archived day's clock so volcano ages do not advance with today.
      now={now}
      fires={fireSummary}
      fireCap={FEED_CAP}
      floods={onGlobe.floods.length}
      floodCountries={countries(onGlobe.floods)}
      keyOpen={keyOpen}
      onKeyOpen={setKeyOpen}
      archived={archived}
      motion={motion}
      depth={depth}
      sound={sound ? announceAbove : null}
      motionOn={motionOn}
      onMotion={setMotionOn}
      sinkOn={flat ? null : sinkOn}
      onSink={onSink}
      cutawayOn={flat ? null : cutaway !== null}
      onCutaway={onCutaway}
      herePlace={here?.label ?? null}
      sky={!flat}
      eclipse={flat ? null : eclipse}
      figuresOn={flat ? null : figuresOn}
      onFigures={setFiguresOn}
      slabOn={slabOn}
      onSlab={setSlabOn}
      slabCount={slabData.length}
    >
      <div className="mt-3">
        <span className="label block">Earthquake sources</span>
        <div role="group" aria-label="Earthquake sources" className="mt-1 flex gap-1.5">
          {(["usgs", "emsc"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleSource(id)}
              aria-pressed={filters.sources.has(id)}
              /* Sized to their labels, not to the panel. `flex-1` gave each half the key's width, making two
           secondary filters the heaviest things in it. See ARCHITECTURE.md#srcapptsx. */
              className={`cursor-pointer border px-2.5 py-1 text-[11px] transition-colors ${
                filters.sources.has(id)
                  ? "border-faint bg-raised text-ink"
                  : "border-hairline text-faint hover:bg-raised hover:text-dim"
              }`}
            >
              {SOURCE_NAMES[id]}
            </button>
          ))}
        </div>
      </div>
    </MagnitudeFilter>
  );

  const marksKey = cloneElement(marksFilter, { part: "key" });

  const { rows: reaches, note: sourceNote } = earthquakeReach(snapshot, now, filters.windowMs);
  const timelineNotes = [sourceNote, corroborationNote(overlap, overlapFrom, now, filters.windowMs)].filter(
    (n): n is string => n !== null,
  );
  const timeline = (
    <div data-activity>
      <Timeline
        bars={bars}
        onSelect={selectQuake}
        archived={archived}
        ramp={ramp}
        hours={hours}
        focusHour={focusHour}
        onFocusHourChange={setFocusHour}
        onHoursChange={(h) => {
          const windowMs = h * 3_600_000;
          setFilters((f) => ({ ...f, windowMs }));
          /* Release the cursor rather than clamping it: 40% through a day and 40% through a month are not the
                same moment, so keeping the number moves the viewer in time without them touching anything. */
          setScrub(LIVE);
          if (feed.setWindow(windowMs)) setPendingRev(snapshot.revision);
        }}
        bucketMs={bucketMs}
        fetching={fetching}
        empty={emptyEarthquakes.short}
        cursor={fractionOf(view, span)}
        parked={view.at !== null}
        playing={view.playing}
        onScrub={(f) => setScrub(dragTo(f, span))}
        onStep={(buckets) => setScrub(nudge(view, span, buckets))}
        onPlayToggle={() => setScrub(togglePlay(view, span))}
        onLive={() => setScrub(LIVE)}
        cursorLabel={viewClock}
        reaches={reaches}
        notes={timelineNotes}
      >
        <details className="mt-3">
          <summary className="disclose text-[11px] text-faint hover:text-dim">
            Earthquakes by magnitude
          </summary>
          <SizeChart sizes={sizes} />
        </details>
      </Timeline>
    </div>
  );

  const archiveControls = (
    <ArchiveControls
      archive={snapshot.archive}
      state={archiveState}
      openRadar={observatory.radar.open}
      onCursor={(at) => setScrub({ at, playing: false })}
      watchEclipse={
        flat
          ? "Switch to Globe to watch."
          : !observatory.ready
            ? "Waiting for the globe."
            : (event) => {
                if (chase.frame) return chase.close(true);
                onCutaway(false);
                setFilters((current) =>
                  current.windowMs >= 86_400_000 ? current : { ...current, windowMs: 86_400_000 },
                );
                chase.start(camera.current, event.currentTarget);
              }
      }
    />
  );
  const regionalResults = (
    <RegionalResults
      {...{ flat, query, results, regions, hazards, markId, regionsHeight, pick }}
      empty={
        emptyEarthquakes.kind === "loading" || emptyEarthquakes.kind === "unavailable"
          ? emptyEarthquakes.text
          : null
      }
      onRegion={(region) => flyTo.current(region.lon, region.lat, region.zoom)}
      onHazard={selectMark}
      onResize={setRegionsHeight}
    />
  );

  return (
    <main className="frame" data-presentation={observatory.presentation}>
      <a
        className="skip-controls"
        href={observatory.observing ? "#observatory-intro" : "#chrome-rail"}
        onClick={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLElement>(
              observatory.observing
                ? "#observatory-intro"
                : railShown
                  ? "#chrome-rail"
                  : "#show-top-bar, [aria-controls=chrome-rail]",
            )
            ?.focus();
        }}
      >
        Skip to controls
      </a>
      <h1 className="sr-only">Everything Is Fine</h1>
      <GlobeHeader
        ready={observatory.canCapture}
        observing={observatory.observing}
        onHome={() =>
          observatory.observeScene(() => {
            stopTour();
            chooseScene("live");
          })
        }
        onReset={resetView}
        {...{
          headShown,
          chromeFloats,
          setHeadOpen,
          snapshot,
          flat,
          setFlat,
          ramp,
          setRamp,
          sound,
          setSound,
          tourAt,
          startTour,
          stopTour,
          tourButton,
          saving,
          saveStill,
          feeds,
          notice,
          download,
          dismiss,
        }}
        tourDisabled={journey.stops.length === 0 || !observatory.ready}
      />
      <div
        className="zones"
        style={
          {
            /* Zero when folded. Everything else is placed from these, so leaving them holds a gap open where
          the folded thing used to be. */
            ...(headShown ? {} : { "--head-h": "0px" }),
            "--rail-w": railShown ? `${railWidth}px` : "0px",
            "--regions-h": `${regionsHeight}px`,
            ...(sheetCanvas > 0 ? { "--canvas-h": `${sheetCanvas}px` } : {}),
          } as React.CSSProperties
        }
      >
        {observatory.observing ? (
          <Observatory
            scene={observatory.scene}
            at={overflight.run?.forecast.forecastAt ?? litAt ?? minuteClock}
            ready={observatory.ready}
            empty={emptyEarthquakes}
            summary={
              shown === 0 && emptyEarthquakes.kind !== "empty"
                ? emptyEarthquakes.text
                : observatorySummary(shown, filters, coverage, loadedDay)
            }
            feedNote={observatoryFeedNote(snapshot.statuses, feeds.silent)}
            deepAvailable={journey.deepest !== null}
            onScene={chooseEarthScene}
            onExplore={openExplorer}
            onPickDate={() => {
              openExplorer();
              setRailOpen(true);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>("#archive-day, #archive-return")?.focus(),
              );
            }}
            aurora={overflight}
            views={observatory}
            radar={observatory.radar}
            onHistory={(day) => {
              stopTour();
              enterExplore();
              const eclipseDay = day === APRIL_ECLIPSE_DAY;
              historyIntent.current = eclipseDay ? null : day;
              if (eclipseDay) setFlat(false);
              setScrub(LIVE);
              setSectionLine(null);
              archiveState.setArchiveDay(day);
              void archiveState.loadArchive(day);
            }}
            tour={{
              at: tourAt,
              stop: touring,
              length: tourLength,
              paused: tourPaused,
              button: tourButton,
              controls: tourControls,
              start: startTour,
              stopTour,
              next: nextTour,
              previous: previousTour,
              pause: togglePause,
              available: journey.stops.length > 0,
              inspect:
                touring?.key && feed.store.get(touring.key)
                  ? () => {
                      const key = touring.key!;
                      stopTour();
                      enterExplore();
                      selectQuake(key);
                    }
                  : null,
            }}
          />
        ) : null}
        {observatory.observing || markSubject || (shownQuake && pinned) ? null : (
          <Resizer
            axis="y"
            label="Sheet height"
            value={sheetCanvas > 0 ? sheetCanvas : Math.round(window.innerHeight * 0.6)}
            min={Math.round(window.innerHeight * 0.46)}
            max={Math.round(window.innerHeight * 0.82)}
            measure={(e) => e.clientY}
            onChange={setSheetCanvas}
            grip
            className="absolute inset-x-0 z-[2] md:hidden"
            style={{ top: `calc(var(--canvas-h, 60dvh) - 6px)` }}
          />
        )}
        {!markSubject && !(shownQuake && pinned) && railShown ? (
          <MobileNavigation canvasHeight={sheetCanvas} flat={flat} onResize={setSheetCanvas} />
        ) : null}
        <aside
          aria-label="Event filters and recent activity"
          id="chrome-rail"
          tabIndex={-1}
          className="zone-rail rail border-hairline p-5 max-md:border-b md:border-r"
          hidden={!railShown}
        >
          <div className="titleblock">
            <p className="view-mode">
              <span className="sr-only">View time </span>
              {archived
                ? `Archive · ${loadedDay ?? archiveDay} UTC`
                : view.at === null
                  ? "Live"
                  : view.playing
                    ? "Replaying"
                    : `Paused at ${viewClock}`}
            </p>
            <div className="tb-cell tb-wide" data-rail="headline">
              {snapshot.coveredSince === null ? (
                <div className="mt-2 max-w-[30ch] text-[14px] leading-snug text-dim">
                  {earthquakeFeedsDown
                    ? "Neither feed is answering yet."
                    : archiveBusy && archiveDay
                      ? `Asking USGS and EMSC for ${archiveDay}.`
                      : `Loading earthquake reports for the last ${compactSpan(filters.windowMs)}…`}
                </div>
              ) : (
                <>
                  <div
                    data-event-count
                    className="mt-1.5 text-[38px] leading-none font-[650] tracking-[-0.015em] tabular-nums"
                  >
                    {headline.toLocaleString("en-GB")}
                  </div>
                  {replay ? (
                    <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-ink">{clock(replay.at)}</span>
                      <span className="text-faint">replaying the last day</span>
                    </div>
                  ) : view.at !== null ? (
                    <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-ink">{viewClock}</span>
                      <span className="text-faint">{view.playing ? "Replaying" : "Paused"}</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-dim">{coverage.label}</div>
                  )}
                </>
              )}
            </div>

            {!strongest && !replay && !flat ? (
              <div className="tb-cell tb-wide" data-rail="largest">
                <span className="label block">Largest</span>
                <span className="text-[11px] text-faint">{emptyEarthquakes.short}</span>
              </div>
            ) : null}
            {strongest && !replay && !flat ? (
              <button
                type="button"
                onClick={() => {
                  setSelected(strongest.key);
                  flyTo.current(strongest.primary.lon, strongest.primary.lat, 1.9);
                  // Through `clamp`, or pinning the newest event parks the cursor a moment behind the present.
                  setScrub(clampScrub({ at: strongest.primary.time, playing: false }, span));
                }}
                aria-description={
                  `Magnitude ${strongest.primary.magnitude.toFixed(1)}, ${ago(strongest.primary.time, now, archived)}. ` +
                  "Go there and hold the window at that moment."
                }
                data-rail="largest"
                className="tb-cell tb-wide cursor-pointer text-left transition-colors hover:bg-raised"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="label">Largest</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-faint">
                    {agoShort(strongest.primary.time, now, archived)}
                  </span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    data-ramp
                    className="font-mono text-[14px] leading-none"
                    style={{ color: rampColorAt(ramp, (strongest.primary.magnitude - 1) / 6.5) }}
                  >
                    {strongest.primary.magnitude.toFixed(1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
                    {place(strongest.primary.place)}
                  </span>
                </span>
              </button>
            ) : null}
            {!replay && !flat && quiet.parts === null ? (
              <div className="tb-cell tb-wide">
                <span className="label block">Near plate boundaries</span>
                <span className="text-[11px] text-faint">
                  {shown ? "No events in range" : emptyEarthquakes.short}
                </span>
              </div>
            ) : null}
            {!replay && !flat && quiet.parts !== null ? (
              <div className="tb-cell tb-wide">
                <span className="label">Near plate boundaries</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[13px] tabular-nums text-ink">{quiet.parts.percent}%</span>
                  <span className="text-[11px] text-dim">within {QUIET_BAND_KM} km</span>
                </span>
              </div>
            ) : null}
          </div>

          {!archived && feeds.silent ? (
            <div className="tb-notes">
              <span className="label">Feeds</span>
              <p className="text-[11px] leading-relaxed text-faint">{feeds.silent}</p>
            </div>
          ) : null}
          <ViewNotices
            statuses={snapshot.statuses}
            archiveDay={archived ? loadedDay : null}
            cursor={view.at}
            staleCursor={!archiveBusy && staleCursor}
            earthquakeNotice={sharedEarthquakeNotice(
              pinned ? null : missingShared,
              snapshot,
              loadedDay,
              archiveBusy,
            )}
            hazardNotice={sharedHazardNotice(
              markId === shared.mark && !markSubject ? markId : null,
              archived,
              archiveHazards,
              answered,
            )}
          />

          <div data-rail="legend">{marksFilter}</div>
          {/* A phone has no canvas corner to spare, so there the key goes back into the column. */}
          {keyOnCanvas ? null : <div className="mt-4">{marksKey}</div>}

          {archived && archiveControls}
          {timeline}

          {/* Directly above the region list, because that is where its results are drawn. Under the headline
          the answers landed 700px below the box, off the bottom of the screen. */}
          <div data-rail="when">
            <div role="search" className="mb-1.5 flex flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-2">
              <label htmlFor="find" className="label shrink-0">
                Find earthquake reports
              </label>
              <input
                id="find"
                /* Text, not `type="search"`: that brings a user-agent cancel button into chrome whose whole rule
                is that it carries none. */
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const first = results.hits[0];
                  if (first) pick(first);
                }}
                placeholder="a region or a place"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1
                  text-[12px] text-ink placeholder:text-faint"
              />
            </div>
            <details>
              <summary className="disclose text-[11px] text-faint hover:text-dim">Time of day</summary>
              <Dial counts={clockBins} />
            </details>
          </div>

          {query && regionalResults}
          <EventList
            quakes={recent}
            selected={selected}
            onSelect={selectQuake}
            announceAbove={announceAbove}
            onAnnounceAboveChange={setAnnounceAbove}
            onNews={onNews}
            empty={emptyEarthquakes}
            now={now}
            archived={archived}
            onClearFilters={() => {
              setFilters((current) => ({
                ...current,
                minMagnitude: DEFAULT_FILTERS.minMagnitude,
                sources: new Set(DEFAULT_FILTERS.sources),
              }));
              document.getElementById("mag")?.focus();
            }}
          />
          {!query && regionalResults}
          {!archived && archiveControls}
          <details className="context-fold">
            <summary className="disclose text-dim">More context</summary>
            {!replay && quiet.note ? (
              <div className="tb-notes">
                <span className="label">Notes</span>
                <p className="text-[11px] leading-relaxed text-faint">{quiet.note}</p>
              </div>
            ) : null}
            {strongest && !replay && edge.complete && energyShare !== null && energyShare > 0.5 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                That one event is <span className="text-dim tabular-nums">{energyPercent(energyShare)}</span>{" "}
                of the energy released in the window. Magnitude is logarithmic: two points of it is a thousand
                times the energy.
              </p>
            ) : null}
            {baseline ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                <span className="text-dim tabular-nums">{baseline.count}</span>
                {" at M"}
                <span className="tabular-nums">{BASELINE_MIN_MAGNITUDE}</span>
                {"+: "}
                {baseline.direction} than{" "}
                <span className="text-dim tabular-nums">{sharePercent(baseline.share)}%</span> of the{" "}
                <span className="tabular-nums">
                  {(baselineSpan === "week" ? BASELINE_WEEKS : BASELINE_DAYS).toLocaleString("en")}
                </span>{" "}
                {baselineSpan === "week" ? "weeks" : "days"} from {BASELINE_FROM} to {BASELINE_TO}.
              </p>
            ) : null}
            {/* Silent when nothing is drawn, or a cursor parked before anything arrived names a region beside
            an empty globe. */}
            {ceiling && strongest && !replay && edge.complete && (revealedNow ?? shown) > 0 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                {ceiling.beaten ? (
                  <>
                    {"Larger than anything in "}
                    {ceiling.region}
                    {" from "}
                    {SINCE}
                    {" to "}
                    {UNTIL}
                    {". Previous best: M"}
                    <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
                    {", "}
                    {recordWhen(ceiling.day)}
                    {"."}
                  </>
                ) : (
                  <>
                    {"Largest in "}
                    {ceiling.region}
                    {", "}
                    {SINCE}
                    {" to "}
                    {UNTIL}
                    {": M"}
                    <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
                    {", "}
                    {recordWhen(ceiling.day)}
                    {"."}
                  </>
                )}
              </p>
            ) : null}
            {versus && !replay && edge.complete ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                {versus.exceeded
                  ? "This window has released "
                  : `${versus.day.what}, ${versus.day.day.slice(0, 4)}, released `}
                <span className="text-dim tabular-nums">{timesLabel(versus.times)}</span>
                {versus.exceeded
                  ? ` times the energy of ${versus.day.what} in ${versus.day.day.slice(0, 4)}, the largest ever recorded.`
                  : " times the energy of everything in this window, from one earthquake."}
              </p>
            ) : null}
            {near && here ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Closest to {here.label} was{" "}
                <span className="text-dim tabular-nums">{magnitude(near.quake.primary)}</span>{" "}
                {place(near.quake.primary.place)},{" "}
                <span className="text-dim tabular-nums">{Math.round(near.km).toLocaleString("en")}</span>
                {" km away."}
                {near.p === null ? null : (
                  <>
                    {" The shaking would have reached it in "}
                    <span className="text-dim">{seconds(near.p)}</span>
                    {"."}
                  </>
                )}
              </p>
            ) : null}
          </details>
        </aside>

        {/* Keep the toggle at the edge where the rail folds. */}
        {chromeFloats && !observatory.observing ? (
          <button
            type="button"
            onClick={() => setRailOpen(!railOpen)}
            aria-label={railOpen ? "Hide the panel" : "Show the panel"}
            aria-expanded={railOpen}
            aria-controls="chrome-rail"
            className="absolute top-[calc(var(--head-h)_+_1rem)] z-[2] cursor-pointer bg-deck/60 px-2.5
              py-3 font-mono text-[15px] leading-none text-dim backdrop-blur-xl backdrop-saturate-50
              transition-colors hover:text-ink"
            /* Clear of the resize handle, or the button eats the top of the drag target. */
            style={{ left: railOpen ? railWidth + 6 : 0 }}
          >
            {railOpen ? "\u2039" : "\u203a"}
          </button>
        ) : null}

        <Resizer
          axis="x"
          label="Rail width"
          value={railWidth}
          min={RAIL_MIN}
          max={RAIL_MAX}
          measure={(e) => e.clientX}
          onChange={setRailWidth}
          className={railShown ? "absolute inset-y-0 hidden xl:block" : "hidden"}
          style={{ left: railWidth - 6 }}
        />

        {observatory.observing || !keyOnCanvas || section || markSubject || (shownQuake && pinned) ? null : (
          <div
            className="pointer-events-auto absolute right-4 bottom-4 z-[1] max-h-[46dvh] w-[300px]
              overflow-y-auto bg-deck/40 p-3 backdrop-blur-2xl backdrop-saturate-50
              md:max-h-[calc(100dvh_-_var(--head-h)_-_6rem)]"
          >
            {marksKey}
          </div>
        )}

        <section id="globe-view" tabIndex={-1} aria-label="Globe" className="zone-canvas relative bg-void">
          <Suspense fallback={<GlobeLoading />}>
            <Globe
              feed={feed}
              filters={filters}
              selected={observatory.localReadings ? null : selected}
              ramp={ramp}
              focus={focusSpan}
              aurora={overflight.run?.forecast ?? onGlobe.aurora}
              marks={marks}
              scrubAt={view.at}
              /* Which moment the light is of. `clockAt` is the app's answer to what time is on screen, and a
               held cursor overrides it with the same precedence `stillMoment` uses, so the terminator and
               the caption cannot disagree. See ARCHITECTURE.md#srcapptsx. */
              moment={overflight.run?.forecast.forecastAt ?? chase.frame ?? litAt}
              inspection={inspection.run}
              flat={flat}
              globePresentation={observatory.globe(tourAt !== null)}
              depthSink={observatory.depth || sinkOn}
              cutaway={observatory.observing ? observatory.depthFocus : flat ? null : cutaway}
              slab={
                ((!observatory.observing && slabOn) || observatory.depth) && slabData.length > 0
                  ? slabData
                  : null
              }
              figures={
                ((!observatory.observing && figuresOn) || observatory.night) && figureData.length > 0
                  ? figureData
                  : null
              }
              section={sectionLine}
              onSection={(line, hinge) => setSectionLine(line && hinge ? { ...line, hinge } : line)}
              onSelect={selectQuake}
              onReady={onReady}
              onCapture={onCapture}
              onSelectMark={selectMark}
              onCamera={(state) => {
                camera.current = state;
                observeTourCamera(state);
              }}
              onReplay={receiveReplay}
            />
          </Suspense>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-wrap items-end justify-start gap-x-6 gap-y-3 p-4 xl:left-[var(--rail-w)]">
            <EclipseReplayControls playback={chase} />
            <WaveReplayControls replay={inspection} />
            <SequenceReplayControls replay={inspection} />
            {section && !observatory.observing && !chase.frame && !inspection.run ? (
              <CrossSection
                data={section}
                hinge={sectionLine?.hinge}
                inset={Boolean(markSubject || (shownQuake && pinned))}
                ramp={ramp}
                store={feed.store}
                selected={selected}
                onSelect={selectQuake}
                onClose={() => closeReading("section")}
              />
            ) : null}
            {chase.frame || inspection.run ? null : (
              <CanvasFooter
                flat={flat}
                playing={view.playing}
                archived={archived}
                clearable={Boolean(query || sectionLine || view.at !== null || selected || markId)}
              />
            )}
          </div>
        </section>

        {!headShown && (snapshot.archive !== null || view.at !== null) ? (
          <div className="stamp pointer-events-none absolute bottom-4 left-4 z-[2] bg-deck/40 px-3 py-2 font-mono text-[11px] text-faint backdrop-blur-xl backdrop-saturate-50">
            {stillMoment(
              view.at,
              snapshot.archive ? snapshot.archive.from : clockAt(),
              snapshot.archive !== null,
            )}
          </div>
        ) : null}

        {markSubject ? (
          <MarkCard
            found={markSubject}
            now={now}
            archived={archived}
            onClose={() => closeReading("hazard")}
          />
        ) : shownQuake && !observatory.observing ? (
          <DetailPanel
            open={pinned !== undefined && !inspection.run}
            quake={shownQuake}
            store={feed.store}
            filters={filters}
            ramp={ramp}
            excluded={!matches(shownQuake, filters, now)}
            revision={snapshot.revision}
            now={now}
            archived={archived}
            onClose={() => closeReading("quake")}
            onInspect={
              observatory.ready
                ? (run, opener) => {
                    setFlat(false);
                    onCutaway(false);
                    setFarSideOf(null);
                    setScrub((current) => (current.playing ? { ...current, playing: false } : current));
                    inspection.start(run, opener);
                  }
                : null
            }
            onSection={(line) => {
              setSectionLine(line);
              setFlat(true);
              flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 1.6);
            }}
            boundaryKm={boundaryKmOf(shownQuake)}
            onSelect={selectQuake}
            farSide={farSideOf === shownQuake.key}
            onFarSide={(on) => {
              setFarSideOf(on ? shownQuake.key : null);
              if (on) flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 0.9);
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
