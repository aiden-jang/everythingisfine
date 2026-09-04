import { cloneElement, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const Globe = lazy(() => import("./globe/Globe").then((m) => ({ default: m.Globe })));
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { PLACE_LIMIT, search, type Hit } from "./app/search";
import { useRolling } from "./app/roll";
import { useFloatingChrome, useNarrow } from "./app/useNarrow";
import { store, stored } from "./app/stored";
import { useStoredFlag, useStoredName, useStoredNumber } from "./app/useStored";
import { fetchAurora, type Aurora } from "./sources/aurora";
import { fetchCyclones, type Cyclone } from "./sources/cyclones";
import { fetchVolcanoes, newestEpisode, type Volcano } from "./sources/volcanoes";
import { fetchWildfires, summarise, FEED_CAP, type Wildfire } from "./sources/wildfires";
import { countries, fetchFloods, type Flood } from "./sources/floods";
import { marksFor } from "./app/marks";
import { depthBands } from "./data/depth";
import { drawStill, stillMoment, verdictLine, STILL_HEIGHT, STILL_WIDTH } from "./app/still";
import { findSubject, MarkCard } from "./app/MarkCard";
import { hazardCount, hazardGroups, outsideWindowNote } from "./app/hazards";
import { withinWindow } from "./app/age";
import { countForDay, dayRange, fetchArchive } from "./sources/archive";
import { NOTABLE_DAYS, NOTABLE_NOTE } from "./app/notableDays";
import { sizesOf } from "./app/gutenberg";
import { SizeChart } from "./app/Sizes";
import { ECLIPSE_DAYS, eclipseMoment } from "./app/eclipseDays";
import { fetchHistory, type History } from "./sources/history";
import { tourLabel, tourStops, TOUR_DWELL_MS } from "./app/tour";
import { createSiren, type Siren } from "./app/sound";
import { loadMotion, summariseMotion, type MotionSample } from "./geo/plateMotion";
import { loadSlab, type SlabPoint } from "./geo/slab";
import { loadFigures, type FigureTable } from "./geo/stars";
import { lunarEclipse, solarEclipse } from "./geo/eclipse";
import { closestTo, loadZones, localZone, viewerPlace, type ZoneTable } from "./app/viewer";
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
import { EventList } from "./app/EventList";
import { DetailPanel } from "./app/DetailPanel";
import { MagnitudeFilter } from "./app/MagnitudeFilter";
import { Timeline } from "./app/Timeline";
import {
  clamp as clampScrub,
  dragTo,
  fractionOf,
  LIVE,
  nudge,
  step as stepScrub,
  togglePlay,
  type Scrub,
} from "./app/scrub";
import { Resizer } from "./app/Resizer";
import { CrossSection } from "./app/CrossSection";
import { buildSection, type SectionLine } from "./app/section";
import { BUCKETS, histogram, totalIn } from "./app/histogram";
import { diurnal } from "./app/diurnal";
import { Dial } from "./app/Dial";
import { DAY_LENGTH, isArchivableDay, isRealDay, typedDay } from "./app/day";
import { decode, encode } from "./app/permalink";
import { seconds } from "./app/arrival";
import { timesLabel, versusReference } from "./app/versus";
import { tick } from "./app/touch";
import { recordWhen, SINCE, superlativeFor, UNTIL } from "./app/superlative";
import { MAG_MIN, rampColorAt, type RampName } from "./globe/ramp";
import { matches, windowStart } from "./data/filter";
import type { Filters, Quake, SourceId } from "./data/types";
import type { SourceStatus } from "./sources/types";
import {
  ago,
  agoShort,
  clock,
  compactSpan,
  corroborationNote,
  energyPercent,
  magnitude,
  place,
  quietNote,
  quietParts,
  silentFeeds,
  reachFraction,
  reachNote,
  reachWords,
  SOURCE_NAMES,
  windowLabel,
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

function Row({
  lead,
  label,
  trail,
  share,
  onClick,
}: {
  lead?: string;
  label: string;
  trail: string;
  share?: number;
  onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      {lead ? <span className="w-[34px] shrink-0 font-mono text-[12px] text-ink">{lead}</span> : null}
      <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{label}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-faint">{trail}</span>
      {share === undefined || share <= 0 ? null : (
        <span aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-[3px]">
          <span className="block h-px bg-dim" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </span>
      )}
    </>
  );

  const shared = "relative flex w-full items-baseline gap-3 rounded-[2px] px-1.5 py-[7px] text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} cursor-pointer transition-colors hover:bg-raised`}
    >
      {body}
    </button>
  ) : (
    <div className={shared}>{body}</div>
  );
}

// Read before the first render. In an effect it shows the default globe first, then jumps.
const shared = decode(window.location.hash);

export function App(): JSX.Element {
  const snapshot = useFeed();
  const [filters, setFilters] = useState<Filters>(() => ({
    minMagnitude: shared.minMagnitude ?? DEFAULT_FILTERS.minMagnitude,
    windowMs: shared.windowHours === undefined ? DEFAULT_FILTERS.windowMs : shared.windowHours * 3_600_000,
    sources: new Set(shared.sources ?? [...DEFAULT_FILTERS.sources]),
  }));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [replay, setReplay] = useState<{ at: number; revealed: number } | null>(null);
  // Never goes in the permalink: a cursor mid-playback is a hand on a control, not a view to send.
  const [scrub, setScrub] = useState<Scrub>(
    shared.cursor === undefined ? LIVE : { at: shared.cursor, playing: false },
  );
  // Derived, not a boolean an effect clears. The arriving events are the answer, so a flag beside them
  // would be the same fact written twice.
  const [pendingRev, setPendingRev] = useState<number | null>(null);
  const [missingShared, setMissingShared] = useState<string | null>(shared.event ?? null);
  // Never in the permalink. A link arriving with 23 of its 24 hours dimmed looks broken, not shared.
  const [focusHour, setFocusHour] = useState<number | null>(null);
  /* Ten minutes, not the model's five: the grid is 900kB and the oval barely moves in five. */
  const [aurora, setAurora] = useState<Aurora | null>(null);
  const [cyclones, setCyclones] = useState<readonly Cyclone[]>([]);
  /* Starts as "fine" so a page that has not asked yet never complains, and a later success clears it. */
  const [answered, setAnswered] = useState({
    cyclones: true,
    volcanoes: true,
    fires: true,
    floods: true,
    aurora: true,
  });
  const answerFor = useCallback(
    (layer: keyof typeof answered) =>
      (ok: boolean): void => {
        setAnswered((was) => (was[layer] === ok ? was : { ...was, [layer]: ok }));
      },
    [],
  );
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchAurora(fetch, answerFor("aurora")).then((next) => {
        if (alive && next) setAurora(next);
      });
    };
    load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  /* Once, not on the ten-minute clock: the newest episode is weeks old, so polling learns nothing. */
  const [volcanoes, setVolcanoes] = useState<readonly Volcano[]>([]);
  /* Both parsers must filter on their own dates, not on `iscurrent`. Measured: every fire is flagged
  current, and 81 of a hundred floods were up to a year old. */
  const [fires, setFires] = useState<readonly Wildfire[]>([]);
  const [floods, setFloods] = useState<readonly Flood[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchCyclones(fetch, answerFor("cyclones")).then((next) => {
        if (alive) setCyclones(next);
      });
      void fetchWildfires(fetch, answerFor("fires")).then((next) => {
        if (alive) setFires(next);
      });
      void fetchFloods(fetch, answerFor("floods")).then((next) => {
        if (alive) setFloods(next);
      });
    };
    load();
    void fetchVolcanoes(fetch, answerFor("volcanoes")).then((next) => {
      if (alive) setVolcanoes(next);
    });
    const id = window.setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  /* Keep this above every memo that calls it. Below them it is a temporal dead zone: tsc passes, the build
     passes, and the page renders nothing. See ARCHITECTURE.md#srcapptsx. */
  const clockAt = useCallback(() => feed.snapshot().archive?.to ?? Date.now(), []);
  /* Hidden while an archived day is up, or today's storms are drawn over July's earthquakes. See
     ARCHITECTURE.md. */
  const archived = snapshot.archive !== null;
  const loadedDay = snapshot.archive ? new Date(snapshot.archive.from).toISOString().slice(0, 10) : null;
  // Yesterday. Read by both the date field and the stepper, so the two cannot disagree.
  const newestDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const neighbours =
    snapshot.archive === null
      ? null
      : {
          prev: new Date(snapshot.archive.from - 86_400_000).toISOString().slice(0, 10),
          next: new Date(snapshot.archive.from + 86_400_000).toISOString().slice(0, 10),
        };
  const [archiveHazards, setArchiveHazards] = useState<History | null>(null);
  /* In archive mode this is the end of the archived day, not the wall clock. See ARCHITECTURE.md#srcapptsx. */
  const now = snapshot.archive ? snapshot.archive.to : Date.now();
  const span = { from: now - filters.windowMs, to: now };
  // Clamp on the way out, never write it back: a render must not correct its own state.
  const view = clampScrub(scrub, span);
  /* The cursor reveals these layers too, quantised to the strip's bucket: playing steps it twenty times
     a second, and these feeds are dated to the hour at best. */
  const revealStep = filters.windowMs / BUCKETS;
  const revealAt = view.at === null ? null : Math.floor(view.at / revealStep) * revealStep;
  const onGlobe = useMemo(() => {
    /* Window first, on each layer's own date, then the cursor. `age.ts` has the argument for the dates. */
    const shown = <T,>(list: readonly T[], dateOf: (h: T) => number | null): readonly T[] =>
      list.filter((h) => {
        const at = dateOf(h);
        if (!withinWindow(at, now, filters.windowMs)) return false;
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
    Math.floor(now / 60_000),
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
  const depth = useMemo(() => depthBands(feed.store, filters, clockAt()), [filters, snapshot.revision]);
  const [flat, setFlat] = useStoredFlag("flat", false, shared.section !== undefined || undefined);
  /* Clamp on the way in too. The `Resizer` bounds this while dragging and the restore path went around
     it, so a stored 1 came back as a rail one pixel wide with nothing to grab. */
  const [railWidth, setRailWidth] = useStoredNumber("rail", RAIL_DEFAULT, (n) =>
    Math.min(RAIL_MAX, Math.max(RAIL_MIN, n)),
  );
  /* 0 means "nobody has dragged it", so the stylesheet's `60dvh` stays the only place that decides. */
  const [sheetCanvas, setSheetCanvas] = useState<number>(() => Number(stored("sheet")) || 0);
  useEffect(() => {
    if (sheetCanvas > 0) store("sheet", String(sheetCanvas));
  }, [sheetCanvas]);
  const [regionsHeight, setRegionsHeight] = useStoredNumber("regions", 132);
  const regionsRef = useRef<HTMLDivElement>(null);
  const [sectionLine, setSectionLine] = useState<SectionLine | null>(shared.section ?? null);
  // Read lazily, so the first paint has the right ramp instead of flashing the default one.
  const [ramp, setRamp] = useStoredName<RampName>("ramp", "thermal", shared.ramp);
  const [announceAbove, setAnnounceAbove] = useStoredNumber("announceAbove", 4.5);
  // Dropped when the link also names a day: an archived day withholds the five layers, so the id would
  // resolve to nothing and the card would never open.
  const [markId, setMarkId] = useState<string | null>(shared.day ? null : (shared.mark ?? null));
  /* The request. The span itself lives on the feed snapshot, and every claim of liveness in the chrome
  reads that rather than this. */
  const [archiveDay, setArchiveDay] = useState("");
  /*
   * Coverage, said while the day is still being typed rather than after it has loaded.
   *
   * Before about 1970 the networks were sparse and only large events were recorded anywhere, so a quiet
   * day back there may mean nobody was listening rather than a quiet planet. Two of the notable days
   * below are 1960 and 1964, so this is not a hypothetical.
   */
  const earlyDay = /^\d{4}/.test(archiveDay) && Number(archiveDay.slice(0, 4)) < 1970;
  const [moreOpen, setMoreOpen] = useState(false);
  /* Fetched when the list opens, not on load. `count` answers in forty bytes. */
  const [dayCounts, setDayCounts] = useState<Record<string, number | null>>({});
  const countsAsked = useRef(false);
  const askCounts = useCallback(() => {
    if (countsAsked.current) return;
    countsAsked.current = true;
    void Promise.all(
      NOTABLE_DAYS.map(async (d) => {
        const n = await countForDay(d.day, MAG_MIN);
        setDayCounts((prev) => ({ ...prev, [d.day]: n }));
      }),
    );
  }, []);
  const dayFault =
    archiveDay.length < DAY_LENGTH
      ? null
      : !isRealDay(archiveDay)
        ? `${archiveDay} is not a date.`
        : !isArchivableDay(archiveDay, Date.now())
          ? "That day has not finished yet. The archive draws whole UTC days, so today is the live view."
          : null;
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  // After the live feed has started, not before. `showArchive` stops the sources itself, and racing it
  // lets them refill the archive.
  const arrivedOnADay = useRef(false);
  const loadArchive = useCallback(async (iso: string) => {
    const span = dayRange(iso);
    /* Check the ceiling here, where all four ways in meet: typed, pasted in a link, picked from the
    notable list, stepped to from a neighbour. On the date field it guarded only the first. */
    if (!span || !isArchivableDay(iso, Date.now())) return;
    setArchiveBusy(true);
    setArchiveNote(null);
    setArchiveHazards(null);
    const [got, hazards] = await Promise.all([
      fetchArchive(span.from, span.to, MAG_MIN),
      fetchHistory(span.from, span.to),
    ]);
    feed.showArchive(span, got.readings);
    setArchiveHazards(hazards);
    const said = (["usgs", "emsc"] as const).map((id) => {
      const answer = got.answered[id];
      if (!answer) return `${SOURCE_NAMES[id]} did not answer`;
      return `${SOURCE_NAMES[id]} ${answer.count}${answer.truncated ? " (truncated)" : ""}`;
    });
    if (hazards.answered) {
      const n =
        hazards.cyclones.length + hazards.fires.length + hazards.floods.length + hazards.volcanoes.length;
      said.push(`EONET ${n}`);
    } else said.push("EONET did not answer");
    setArchiveNote(said.join(" · "));
    setArchiveBusy(false);
    setSelected(null);
    setMarkId(null);
  }, []);
  useEffect(() => {
    if (!shared.day || arrivedOnADay.current) return;
    arrivedOnADay.current = true;
    setArchiveDay(shared.day);
    void loadArchive(shared.day);
  }, [loadArchive]);
  // Read the span from the feed, not from the rendered day: it goes stale between a step and its answer.
  const stepDay = useCallback(
    (days: number) => {
      const archive = feed.snapshot().archive;
      if (archive === null) return;
      const iso = new Date(archive.from + days * 86_400_000).toISOString().slice(0, 10);
      setArchiveDay(iso);
      void loadArchive(iso);
    },
    [loadArchive],
  );
  const backToLive = useCallback(() => {
    setArchiveDay("");
    setArchiveNote(null);
    setArchiveHazards(null);
    setSelected(null);
    setMarkId(null);
    feed.resumeLive();
  }, []);
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
    flyTo.current(145, 12, 1);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    // The writer only writes while the hash is the one it last wrote, which is what protects a pasted
    // link. Emptying it without saying so leaves the writer refusing to write again.
    lastWritten.current = window.location.hash;
  }, [backToLive]);
  const [farSideOf, setFarSideOf] = useState<string | null>(null);
  /* Open by default: it has a corner of its own, so opening it pushes nothing. */
  const [keyOpen, setKeyOpen] = useStoredFlag("legendKey", true);
  const [motionOn, setMotionOn] = useStoredFlag("motion", true);
  const [sinkOn, setSinkOn] = useStoredFlag("depthSink", true);
  /* On by default, so the slab's 37kB and 1,583 marks are on every first load. It earns it: a real day
  has two events below 300km, and you cannot see a dipping plane in two dots. */
  const [slabOn, setSlabOn] = useStoredFlag("slab", true);
  const [figuresOn, setFiguresOn] = useStoredFlag("figures", true);
  // Lazy: 13kB of coordinates has no business in the first frame.
  const [zones, setZones] = useState<ZoneTable | null>(null);
  useEffect(() => {
    let alive = true;
    void loadZones()
      .then((next) => {
        if (alive) setZones(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const here = useMemo(() => (zones ? viewerPlace(zones, localZone()) : null), [zones]);
  // Imported on first use. A failed import leaves the array empty, so it draws nothing instead of
  // throwing. Same for the slab below.
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
  const [motionData, setMotionData] = useState<readonly MotionSample[]>([]);
  useEffect(() => {
    if (!motionOn || motionData.length > 0) return;
    let alive = true;
    void loadMotion()
      .then((next) => {
        if (alive) setMotionData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [motionOn, motionData.length]);
  const [slabData, setSlabData] = useState<readonly SlabPoint[]>([]);
  useEffect(() => {
    if (!slabOn || slabData.length > 0) return;
    let alive = true;
    void loadSlab()
      .then((next) => {
        if (alive) setSlabData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slabOn, slabData.length]);
  const [figureData, setFigureData] = useState<FigureTable>([]);
  useEffect(() => {
    if (!figuresOn || figureData.length > 0) return;
    let alive = true;
    void loadFigures()
      .then((next) => {
        if (alive) setFigureData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [figuresOn, figureData.length]);
  const motion = motionOn && motionData.length > 0 ? summariseMotion(motionData) : null;
  const flyTo = useRef<(lon: number, lat: number, zoom?: number, liftPx?: number) => void>(() => {});
  const lastWritten = useRef<string>(window.location.hash);
  const camera = useRef<{ lon: number; lat: number; zoom: number }>({
    lon: shared.lon ?? 145,
    lat: shared.lat ?? 12,
    zoom: shared.zoom ?? 1,
  });
  // Call and read this in the same tick. See `Globe.onCapture`.
  const capture = useRef<() => HTMLCanvasElement | null>(() => null);
  const onCapture = useCallback((fn: () => HTMLCanvasElement | null) => {
    capture.current = fn;
  }, []);
  const onReady = useCallback((fn: typeof flyTo.current) => {
    flyTo.current = fn;
    if (shared.lon !== undefined) fn(shared.lon, shared.lat ?? 12, shared.zoom ?? 1);
  }, []);

  // Replace, never push, or every filter nudge is a history entry and Back never leaves the page.
  useEffect(() => {
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
        event: reading ? `${reading.source}:${reading.id}` : null,
        day: snapshot.archive ? new Date(snapshot.archive.from).toISOString().slice(0, 10) : null,
        mark: markId,
        section: sectionLine,
        // The moment being drawn, not the one the link asked for. `scrub` keeps the asked-for value so the
        // notice can say it was refused; writing that value back out spread it on every re-share.
        cursor: view.at,
      });
      history.replaceState(null, "", `#${fragment}`);
      // Only when a write actually happened. Set beside the call sites, a blocked write still adopts the
      // pasted hash and the swallow above comes back.
      lastWritten.current = window.location.hash;
    };
    write();
    const timer = window.setInterval(write, 1000);
    return () => window.clearInterval(timer);
    // `snapshot.archive` is a dependency: the interval keeps calling the closure it was made with, and
    // without it entering an archive leaves the link saying live.
  }, [filters, selected, ramp, sectionLine, snapshot.archive, markId]);

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
  const litAt = view.at ?? (snapshot.archive === null ? null : clockAt());
  const eclipseKey = litAt ?? Math.floor(Date.now() / 60_000) * 60_000;
  const eclipse = useMemo(() => {
    const solar = solarEclipse(eclipseKey);
    if (solar.touching) return { kind: solar.umbra > 0 ? "total" : "annular" } as const;
    return lunarEclipse(eclipseKey).umbral > 0 ? ({ kind: "lunar" } as const) : null;
  }, [eclipseKey]);
  /* Keep everything between the capture and the `drawImage` synchronous: the globe's drawing buffer is
  gone the moment the browser composites. */
  const [saving, setSaving] = useState(false);
  /* Read the counts at capture. They cannot be dependencies - `headline` is declared far below - and
  leaving them stale gave a poster with a blank evidence line from the first empty render. */
  const stillCounts = useRef({ quakes: 0, cyclones: 0, fires: 0, firesCapped: false, floods: 0 });
  const saveStill = useCallback(() => {
    const source = capture.current();
    if (!source) return;
    const frame = document.createElement("canvas");
    frame.width = STILL_WIDTH;
    frame.height = STILL_HEIGHT;
    const ctx = frame.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    const token = (name: string): string => style.getPropertyValue(`--color-${name}`).trim();
    drawStill(
      ctx,
      source,
      source.width,
      source.height,
      {
        // The day's start, not the clock: `clockAt()` is the next midnight, so a still of the 15th was
        // captioned the 16th.
        moment: stillMoment(
          view.at,
          feed.snapshot().archive?.from ?? clockAt(),
          feed.snapshot().archive !== null,
        ),
        // From `onGlobe`, not the raw feeds, or a still of an archived day counts layers it does not show.
        verdict: verdictLine(stillCounts.current),
        /* The requested window, not the covered one: `windowLabel` printed "nothing yet" onto a still that
      showed a full day. */
        filter: `M${filters.minMagnitude.toFixed(1)}+ · last ${compactSpan(filters.windowMs)}`,
        host: window.location.host,
      },
      { background: token("void"), ink: token("ink"), faint: token("faint"), ramp },
    );

    /*
     * Encoded synchronously, through `toDataURL` rather than `toBlob`.
     *
     * `navigator.share` needs the user gesture that started this to still be live, and `toBlob` hands its
     * result back in a later task - long enough on a phone for the activation to lapse and the share to be
     * refused. This blocks for a few tens of milliseconds and keeps the gesture.
     */
    const name = `everything-is-fine-${new Date(view.at ?? Date.now())
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19)}.png`;
    const url = frame.toDataURL("image/png");
    const bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    const file = new File([bytes], name, { type: "image/png" });

    /*
     * The share sheet where there is one, a download where there is not. A phone cannot do anything useful
     * with `a.download`, which is where this picture is most worth having: it is the whole way the app
     * travels from somebody's screen into a conversation.
     */
    const share = navigator.share !== undefined && (navigator.canShare?.({ files: [file] }) ?? false);
    if (share) {
      setSaving(true);
      // A dismissed sheet rejects with AbortError. That is somebody changing their mind, not a failure.
      void navigator
        .share({ files: [file] })
        .catch(() => {})
        .finally(() => setSaving(false));
      return;
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  }, [filters.minMagnitude, filters.windowMs, view.at]);
  /* What the globe is actually drawing while the cursor is parked. Walked and not read off the bars,
  which are whole hours while the cursor is continuous. */
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
    [filters, snapshot.revision],
  );

  // Captured at the start, not read per tick, so an arrival mid-tour cannot reorder the route.
  const stops = useMemo(() => tourStops(regions), [regions]);
  const busiest = regions[0]?.count ?? 0;
  const [tourAt, setTourAt] = useState<number | null>(null);
  /* Where the camera has reached, not where it is going. Naming the destination made the rail read
  "Japan & Kurils" at longitude -82.8, which is Chile. */
  const tourTarget = useRef<{ lon: number; lat: number; index: number } | null>(null);
  const [tourArrived, setTourArrived] = useState<number | null>(null);
  /* Keep the tour's own button out of the end-on-interaction listener below, or pressing Stop is a
  race between `pointerdown` ending the tour and the click starting it again. */
  const tourButton = useRef<HTMLButtonElement>(null);
  const route = useRef<ReturnType<typeof tourStops>>([]);
  const stopTour = useCallback(() => {
    setTourAt(null);
  }, []);
  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    route.current = stops;
    setTourAt(0);
  }, [stops]);
  // Capture phase, so a click on a rail button ends the tour as well as doing its own job.
  useEffect(() => {
    if (tourAt === null) return undefined;
    const stop = route.current[tourAt];
    if (!stop) {
      setTourAt(null);
      return undefined;
    }
    tourTarget.current = { lon: stop.lon, lat: stop.lat, index: tourAt };
    setTourArrived(null);
    flyTo.current(stop.lon, stop.lat, stop.zoom);
    const next = window.setTimeout(() => {
      setTourAt((at) => (at === null || at + 1 >= route.current.length ? null : at + 1));
    }, TOUR_DWELL_MS);
    const end = (event: Event): void => {
      if (tourButton.current?.contains(event.target as Node)) return;
      setTourAt(null);
    };
    window.addEventListener("pointerdown", end, { capture: true });
    window.addEventListener("wheel", end, { capture: true, passive: true });
    window.addEventListener("keydown", end, { capture: true });
    return () => {
      window.clearTimeout(next);
      window.removeEventListener("pointerdown", end, { capture: true });
      window.removeEventListener("wheel", end, { capture: true });
      window.removeEventListener("keydown", end, { capture: true });
    };
  }, [tourAt]);
  const touring = tourAt !== null && tourArrived === tourAt ? (route.current[tourAt] ?? null) : null;

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

  /* Look the pin up by key every render. The store revises events in place, so an object would pin a
  stale copy and an index would pin whatever later took the slot. */
  // Cannot be done at mount: on a cold load the store is empty for a second or two while both seeds land.
  useEffect(() => {
    if (!missingShared) return;
    const [source, id] = missingShared.split(":") as [SourceId, string];
    const found = feed.store.findByReading(source, id);
    if (found) {
      setSelected(found.key);
      setMissingShared(null);
    } else if (snapshot.stats.quakes > 0 && snapshot.statuses.usgs.kind === "live") {
      setMissingShared((current) => current);
    }
  }, [missingShared, snapshot.revision, snapshot.statuses.usgs.kind, snapshot.stats.quakes]);

  const pinned = selected ? feed.store.get(selected) : undefined;
  // The panel outlives the pin by one exit transition; see where it is rendered.
  const lastPinned = useRef(pinned);
  if (pinned) lastPinned.current = pinned;
  const shownQuake = pinned ?? lastPinned.current;
  /* Must stay below the selection: the far-side figure is one of these marks and needs the pinned
  event's position, and it is gated on that event still being pinned - the toggle is in the panel, so
  dismissed, the arcs would have no explanation and no way off. */
  const traced = farSideOf && farSideOf === selected ? feed.store.get(farSideOf) : undefined;
  const farSide = traced ? { lon: traced.primary.lon, lat: traced.primary.lat } : null;
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
  }, [snapshot.revision, filters, segments, boundaryKmOf]);
  // Looked up at render, not captured on click: the feeds refresh every ten minutes and a captured
  // card keeps describing a storm that is gone.
  const hazards = useMemo(
    () => hazardGroups(onGlobe, now, archived),
    [onGlobe.cyclones, onGlobe.volcanoes, onGlobe.fires, onGlobe.floods, archived, Math.floor(now / 60_000)],
  );
  const markSubject = findSubject(markId, onGlobe);
  /* Read through a ref: `selectMark` is memoised on `liftForPanel`, and the layers change under it. */
  const onGlobeRef = useRef(onGlobe);
  onGlobeRef.current = onGlobe;
  /* How far above the middle a pinned event should sit, so the sheet describing it does not cover it. See
     ARCHITECTURE.md. */
  const liftForPanel = useCallback((): number => {
    if (window.matchMedia("(min-width: 768px)").matches) return 0;
    const canvas = document.querySelector("canvas");
    const zones = document.querySelector(".zones");
    if (!canvas || !zones) return 0;
    /* Where the sheet's top edge will be, worked out rather than measured: the first pin is the one that
       opens it, so there is nothing to measure yet. Do not go back to a fraction of the canvas. Twice
       tried: the bar is the same size on every phone and the canvas is not, so a quarter of a short one put
       the event 6px under the bar. See ARCHITECTURE.md#srcapptsx. */
    const box = canvas.getBoundingClientRect();
    const zoneBox = zones.getBoundingClientRect();
    const share = Number(getComputedStyle(document.documentElement).getPropertyValue("--panel-share")) || 0.7;
    const sheetTop = zoneBox.bottom - Math.min(share * window.innerHeight, zoneBox.height);
    return Math.max(0, Math.round((box.bottom - Math.min(box.bottom, sheetTop)) / 2));
  }, []);
  /* The same rule as an earthquake: pick it and the camera goes, lifted clear of whatever is describing it.
     A flood behind the panel is the same defect as an earthquake behind it. */
  const selectMark = useCallback(
    (id: string | null) => {
      setMarkId(id);
      /*
       * Clearing a mark must not clear an earthquake. The globe reports a hit as `onSelect(quake)` followed
       * by `onSelectMark(null)`, so a `setSelected(null)` up here undid the selection on the same tap: every
       * click on an earthquake flew the camera to it and then showed no panel.
       */
      if (id === null) return;
      setSelected(null);
      const where = findSubject(id, onGlobeRef.current)?.subject;
      if (where) flyTo.current(where.lon, where.lat, Math.max(camera.current.zoom, 2.2), liftForPanel());
    },
    [liftForPanel],
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
      flyTo.current(quake.primary.lon, quake.primary.lat, Math.max(camera.current.zoom, 1.9), liftForPanel());
    },
    [liftForPanel],
  );
  const marks = useMemo(
    () =>
      marksFor({
        ...onGlobe,
        farSide,
        motion: motionOn ? motionData : [],
        here,
      }),
    [
      onGlobe.cyclones,
      onGlobe.volcanoes,
      onGlobe.fires,
      onGlobe.floods,
      farSide?.lon,
      farSide?.lat,
      motionOn,
      motionData,
      here,
    ],
  );
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  /* Twenty ticks a second, not one a frame: every tick re-renders the rail and re-syncs the event layer.
     See ARCHITECTURE.md#srcapptsx. */
  const playedAt = useRef(0);
  useEffect(() => {
    if (!scrub.playing) return undefined;
    playedAt.current = performance.now();
    const id = window.setInterval(() => {
      const tick = performance.now();
      const dt = (tick - playedAt.current) / 1000;
      playedAt.current = tick;
      const at = Date.now();
      setScrub((s) => stepScrub(s, { from: at - filters.windowMs, to: at }, dt));
    }, 50);
    return () => window.clearInterval(id);
  }, [scrub.playing, filters.windowMs]);

  /*
   * Space and the step keys only while nothing is focused, or space stops activating a focused button.
   * Escape is not gated that way: it is an escape.
   */
  useEffect(() => {
    // Read at the press. A span captured when the listener was armed is stale by however long the tab
    // has been open.
    const spanNow = (): { from: number; to: number } => {
      const at = Date.now();
      return { from: at - filters.windowMs, to: at };
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
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
      if (document.activeElement && document.activeElement !== document.body) return;
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
    [filters, snapshot.revision],
  );

  // The later of the two feed edges, not the earlier: a corroboration rate needs the span where both
  // agencies had eyes on it.
  const overlapFrom =
    snapshot.covered.usgs !== null && snapshot.covered.emsc !== null
      ? Math.max(snapshot.covered.usgs, snapshot.covered.emsc)
      : null;

  const { bars, strongest, bucketMs, energyShare, energyTotal, overlap } = useMemo(
    () => histogram(feed.store.forEach, filters, now, snapshot.coveredSince, overlapFrom),
    // `now` is absent on purpose: it ticks every second and the bars only move on a bucket boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.minMagnitude,
      filters.sources,
      filters.windowMs,
      snapshot.revision,
      snapshot.coveredSince,
      overlapFrom,
    ],
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

  const failing = (Object.entries(snapshot.statuses) as [SourceId, SourceStatus][]).flatMap(([id, status]) =>
    status.kind === "failing" ? [[id, status] as const] : [],
  );

  /* A shared cursor the window cannot hold, or the recipient sees the present with no reason why. See
     ARCHITECTURE.md. */
  const staleCursor = shared.cursor !== undefined && scrub.at === shared.cursor && view.at !== shared.cursor;

  const edge = windowStart(now, filters.windowMs, snapshot.coveredSince);

  /*
   * Three gates: only at 24h, because the baseline counts calendar days; only once the window is
   * covered, because a day still filling reads as quiet; and an archived day needs neither.
   */
  const near = useMemo(() => {
    if (replay || here === null) return null;
    return closestTo(feed.store, here, filters, clockAt(), view.at ?? clockAt());
  }, [feed.store, here, filters, snapshot.revision, replay, view.at]);

  /* Do not let `f` fold these: a full screen with a planet and nothing else is a screensaver. Each fold
  is offered only where it buys something - see `useFloatingChrome`. */
  const chromeFloats = useFloatingChrome();
  const [headOpen, setHeadOpen] = useStoredFlag("head", true);
  const [railOpen, setRailOpen] = useStoredFlag("railOpen", true);
  const railShown = railOpen || !chromeFloats;
  const headShown = headOpen || chromeFloats;

  const versus = useMemo(() => versusReference(energyTotal), [energyTotal]);

  const ceiling = useMemo(
    // As of the day on screen: an archived day must not be handed a record from its own future.
    () => superlativeFor(strongest, snapshot.archive ? snapshot.archive.from : clockAt()),
    [strongest, snapshot.archive],
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
       worse than none - but it must still stand down when the filter empties the screen. See
       ARCHITECTURE.md. */
    if ((revealedNow ?? shown) <= 0) return null;
    return rankDay(comparableCount(feed.store, edge.at, now), true, baselineSpan);
  }, [
    feed.store,
    snapshot.archive,
    snapshot.revision,
    filters.windowMs,
    edge.complete,
    edge.at,
    now,
    replay,
    shown,
    revealedNow,
  ]);
  // Not memoised: the reach it names is a distance from now, and keyed on the revision it would freeze
  // at whatever it was when the last event landed.
  const sourceNote = reachNote(snapshot.covered, now, filters.windowMs);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  /* Pick a side rather than using a `hidden`/`block` pair: that would put 445px of text in the document
  twice, and a test counting a phrase across the app cannot tell a copy from a duplicated sentence. */
  const keyOnCanvas = useNarrow() === false;
  /*
   * One element, mounted twice by `part`: the ramp and the feeds in the rail, the key of every mark
   * on the canvas corner. The props are identical, so they are written once here - two copies drifted
   * apart the first time one of them was edited.
   */
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
      /*
      The archived day's clock, not this minute's. `volcanoNote` counts days since the newest
      episode ended, and its `archived` flag only swapped the tense: the number still came
      from Date.now(), so a picture of 2026-05-15 read "ended 99 days ago".
    */
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
      onSink={setSinkOn}
      /*
      Offered wherever it can change something. Hidden on the flat map was right until the
      cross-section started reading the same table, so on the map it appears exactly when a
      section is open - otherwise it is a button that does nothing.
    */
      herePlace={here?.label ?? null}
      sky={!flat}
      eclipse={flat ? null : eclipse}
      figuresOn={flat ? null : figuresOn}
      onFigures={setFiguresOn}
      /* The one of the three that survives flattening: its layer takes the scene's morph and
       lies down with the geography. Depth cannot - the shader multiplies the sink by
       `1.0 - uMorph` - and the figures have no sky. It used to appear on the map only while a
       cross-section was open, which is the one place it was already proven to draw. */
      slabOn={slabOn}
      onSlab={setSlabOn}
      slabCount={slabData.length}
    >
      {/* Passed in as a child so the sources land above the folding key: at the bottom of a scrolling
      column they were off the fold at 1280x720, a control reached by scrolling prose. */}
      {/* The group needs a name, or two toggles are two unexplained pressed-states. */}
      <div className="mt-3">
        <span className="label block">Feeds</span>
        <div role="group" aria-label="Feeds" className="mt-1 flex gap-1.5">
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

  const reaches = (["usgs", "emsc"] as const).map((id) => ({
    id,
    label: SOURCE_NAMES[id],
    fraction: reachFraction(snapshot.covered[id], now, filters.windowMs),
    words: reachWords(snapshot.covered[id], snapshot.statuses[id].kind === "failing", now, filters.windowMs),
  }));
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
        waiting={snapshot.coveredSince === null}
        cursor={fractionOf(view, span)}
        parked={view.at !== null}
        playing={view.playing}
        onScrub={(f) => setScrub(dragTo(f, span))}
        onStep={(buckets) => setScrub(nudge(view, span, buckets))}
        onPlayToggle={() => setScrub(togglePlay(view, span))}
        onLive={() => setScrub(LIVE)}
        cursorLabel={view.at === null ? null : clock(view.at)}
        reaches={reaches}
        notes={timelineNotes}
      >
        <details className="mt-3">
          <summary className="disclose text-[11px] text-faint hover:text-dim">How the sizes stack up</summary>
          <SizeChart sizes={sizes} />
        </details>
      </Timeline>
    </div>
  );

  const archiveBlock = (
    <div data-rail="activity">
      {snapshot.archive ? (
        <div className="stamp mb-3 bg-raised p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="label">Archive</span>
            <button
              type="button"
              onClick={backToLive}
              className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink"
            >
              back to live
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink">
            {new Date(snapshot.archive.from).toISOString().slice(0, 10)}, all day UTC. Nothing here is
            arriving now.
          </p>
          {/* Disabled while a day is in flight: two archive loads race, and the second answer is not
                necessarily the second request. */}
          {neighbours ? (
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                disabled={archiveBusy}
                onClick={() => stepDay(-1)}
                className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink disabled:cursor-default disabled:text-faint"
              >
                ‹ {neighbours.prev}
              </button>
              <button
                type="button"
                disabled={archiveBusy || neighbours.next > newestDay}
                onClick={() => stepDay(1)}
                className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink disabled:cursor-default disabled:text-faint"
              >
                {neighbours.next} ›
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Storms, fires, floods and volcanoes come from NASA rather than the live feeds. No aurora: it is a
            forecast, so there is no past to ask for.
          </p>
          {archiveNote ? (
            <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-faint">{archiveNote}</p>
          ) : null}
        </div>
      ) : (
        /* Label above, not beside: side by side left the date field 60px in the 768px strip. */
        <div className="mb-3">
          <label className="label" htmlFor="archive-day">
            Go to a day
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            {/* ISO text, not `type="date"`: the native widget wants `mm/dd/yyyy`, which this app never prints,
                so a day could not be copied out of the list below and pasted in. */}
            <input
              id="archive-day"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="YYYY-MM-DD"
              aria-describedby={dayFault ? "archive-day-fault" : undefined}
              value={archiveDay}
              onChange={(e) => setArchiveDay(typedDay(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !archiveBusy && isArchivableDay(archiveDay, Date.now())) {
                  e.preventDefault();
                  void loadArchive(archiveDay);
                }
              }}
              className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1 font-mono text-[10.5px] text-dim placeholder:text-faint"
            />
            <span className="relative inline-flex size-[26px] shrink-0 items-center justify-center border border-hairline text-faint hover:text-ink">
              <svg viewBox="0 0 14 14" aria-hidden="true" className="size-[11px]">
                <rect
                  x="1"
                  y="2.5"
                  width="12"
                  height="10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M1 6 H13 M4.5 1 V4 M9.5 1 V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <input
                type="date"
                aria-label="Pick a day from a calendar"
                max={newestDay}
                value={isArchivableDay(archiveDay, Date.now()) ? archiveDay : ""}
                onChange={(e) => {
                  const picked = e.target.value;
                  if (!picked) return;
                  setArchiveDay(picked);
                  if (isArchivableDay(picked, Date.now())) void loadArchive(picked);
                }}
                /* `showPicker` throws where it is unsupported, and the browser's own icon is invisible here. */
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try {
                    el.showPicker?.();
                  } catch {
                    /* the field still takes a typed date */
                  }
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
            <button
              type="button"
              disabled={archiveBusy || !isArchivableDay(archiveDay, Date.now())}
              onClick={() => void loadArchive(archiveDay)}
              className="shrink-0 cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:cursor-default disabled:text-faint"
            >
              {archiveBusy ? "…" : "go"}
            </button>
          </div>
          {/* Said here, not through `archiveNote`: that renders in the other branch of this ternary, so a
                day refused while live set a message nobody ever saw. */}
          {dayFault ? (
            <p id="archive-day-fault" className="mt-1 text-[11px] leading-relaxed text-faint">
              {dayFault}
            </p>
          ) : (
            /* The field takes any day that has ended, which includes the one anybody actually wants
                     and would never think to try. One sentence, because the control for it already
                     exists: a second field beside this one was the same field twice. */
            <p className="mt-1 text-[11px] leading-relaxed text-faint">
              {earlyDay
                ? "Before about 1970 only the large ones were recorded anywhere. A quiet day back" +
                  " there may mean nobody was listening, not that the Earth was still."
                : "Any day that has ended, including the one you were born on."}
            </p>
          )}
        </div>
      )}
      {/* Outside the archived/live branch: inside it the list vanished the moment a day loaded, so going
                from one notable day to another meant going back to live and waiting for the feeds. */}
      <details
        className="mt-2"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) askCounts();
        }}
      >
        <summary className="disclose text-[11px] text-faint hover:text-dim">Days worth seeing</summary>
        <div className="mt-1">
          {NOTABLE_DAYS.map((d) => (
            <button
              key={d.day}
              type="button"
              disabled={archiveBusy}
              onClick={() => {
                setArchiveDay(d.day);
                void loadArchive(d.day);
              }}
              aria-label={
                `${d.what}, magnitude ${d.magnitude}, ${d.day}` +
                (typeof dayCounts[d.day] === "number"
                  ? `, ${dayCounts[d.day]!.toLocaleString("en-GB")} events`
                  : "")
              }
              aria-current={loadedDay === d.day ? "true" : undefined}
              className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left transition-colors hover:bg-raised disabled:cursor-default ${
                loadedDay === d.day ? "bg-raised" : ""
              }`}
            >
              <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">{d.day}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{d.what}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
                M{d.magnitude.toFixed(1)}
              </span>
              <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-faint tabular-nums">
                {dayCounts[d.day] === undefined || dayCounts[d.day] === null
                  ? ""
                  : dayCounts[d.day]!.toLocaleString("en-GB")}
              </span>
            </button>
          ))}
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{NOTABLE_NOTE}</p>
        </div>
      </details>
      {/* Sets the cursor as well as the day: a shadow lasts a few hours and an archived day opens at its
                right edge, so loading only the day lands after the thing the row names. The times are checked
                against the geometry in `eclipseDays.test.ts`, because a wrong minute fails silently. */}
      <details className="mt-2">
        <summary className="disclose text-[11px] text-faint hover:text-dim">Eclipses</summary>
        <div className="mt-1">
          {ECLIPSE_DAYS.map((e) => (
            <button
              key={e.day}
              type="button"
              disabled={archiveBusy}
              onClick={() => {
                setArchiveDay(e.day);
                void loadArchive(e.day);
                setScrub({ at: eclipseMoment(e), playing: false });
              }}
              aria-label={`${e.what}, ${e.kind} eclipse, ${e.day} at ${e.at} UTC`}
              aria-current={loadedDay === e.day ? "true" : undefined}
              className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left text-[11px] transition-colors hover:bg-raised disabled:cursor-default ${
                loadedDay === e.day ? "bg-raised text-ink" : "text-faint"
              }`}
            >
              <span className="w-[62px] shrink-0 font-mono text-[10.5px] tabular-nums">
                {e.day.slice(0, 7)}
              </span>
              <span className="grow">{e.what}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );

  return (
    <div className="frame">
      <header
        id="chrome-head"
        className="zone-head max-md:relative flex items-center gap-6 bg-deck px-5 py-3 xl:border-b xl:border-hairline xl:bg-transparent"
        hidden={!headShown}
      >
        <button
          type="button"
          onClick={resetView}
          aria-label="Everything Is Fine, back to the default view"
          /* `self-start` where the row wraps: `items-center` floated the wordmark between the two rows and
          left "Still" orphaned diagonally opposite. */
          /* 550 rather than 600. Letterspaced uppercase at 13px already reads as emphasis, and the extra
             weight on top of it made the masthead the heaviest thing on a screen whose subject is the
             globe behind it. */
          className="flex min-h-11 cursor-pointer items-center text-[10px] font-[550] tracking-[0.1em] whitespace-nowrap transition-colors hover:text-ink max-md:self-start md:text-[13px] md:tracking-[0.16em]"
        >
          EVERYTHING IS FINE
        </button>
        {/* These ignore the filters, so each has to say whose number it is: at magnitude 4 the headline read
            5 while this row read 160. Wide screens only - from `sm` up they took ~380px of a 768px header. */}
        <div className={`hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "xl:flex"}`}>
          {(
            [
              ["reported", snapshot.stats.quakes.toLocaleString("en-GB")],
              ["seen by both", snapshot.stats.corroborated.toLocaleString("en-GB")],
              ...(snapshot.stats.revised > 0
                ? [["revised", snapshot.stats.revised.toLocaleString("en-GB")] as const]
                : []),
            ] as const
          ).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink tabular-nums">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
          <span className="text-[11px] text-faint">
            USGS{" "}
            <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.usgs.toLocaleString("en-GB")}
            </span>
            {" · EMSC "}
            <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.emsc.toLocaleString("en-GB")}
            </span>{" "}
            readings
          </span>
        </div>
        {/* Never `whitespace-nowrap` here. It does not shrink, it overflows, and one extra button pushed
        the header 120px past a phone viewport. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => setFlat((f) => !f)}
            aria-pressed={flat}
            className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink"
          >
            {flat ? "Globe" : "Map"}
          </button>
          <button
            type="button"
            onClick={() => setRamp((r) => (r === "thermal" ? "cividis" : "thermal"))}
            aria-pressed={ramp === "cividis"}
            className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised ${
              ramp === "cividis" ? "bg-raised text-ink" : "text-faint"
            }`}
          >
            <span className="lg:hidden">Ramp {ramp === "cividis" ? "CB" : "std"}</span>
            <span className="hidden lg:inline">Colourblind ramp {ramp === "cividis" ? "on" : "off"}</span>
          </button>
          {/* A menu, not more header: unhiding in place wrapped the row and grew the header over the canvas.
          `display: contents` from `md` up, so on a desktop these are still plain buttons in this row. */}
          <div
            /* Any press inside closes it, or the next tap lands on the menu instead of what is behind it. */
            onClick={() => setMoreOpen(false)}
            className={`contents max-md:absolute max-md:top-full max-md:right-4 max-md:z-10 max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-1.5 max-md:border max-md:border-hairline max-md:bg-deck max-md:p-2 ${
              moreOpen ? "" : "max-md:hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => setSound((on) => !on)}
              aria-pressed={sound}
              className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
                sound ? "bg-raised text-ink" : "text-faint"
              }`}
            >
              {sound ? "Sound on" : "Sound off"}
            </button>
            {stops.length > 0 ? (
              <button
                ref={tourButton}
                type="button"
                onClick={() => (tourAt === null ? startTour() : stopTour())}
                aria-pressed={tourAt !== null}
                className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
                  tourAt !== null ? "bg-raised text-ink" : "text-faint"
                }`}
              >
                {tourAt !== null ? "Stop" : "Tour"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={saveStill}
              disabled={saving}
              className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-default"
            >
              {saving ? "Saving…" : "Still"}
            </button>
            {/* Keep the fold inside the overflow. As a button of its own at 390 it wrapped onto a line by
          itself and took the header from 46px to 80px, which is the opposite of folding the bar. */}
            {chromeFloats ? null : (
              <button
                type="button"
                onClick={() => setHeadOpen(false)}
                aria-expanded={true}
                aria-controls="chrome-head"
                className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink"
              >
                Hide bar
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            /* Fixed width: "more" and "less" are not the same width, and this row packs from the right, so
            opening the menu slid every button beside it. */
            className="w-[3.25rem] shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-center text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink md:hidden"
          >
            {moreOpen ? "less" : "more"}
          </button>
          <span className="flex items-center gap-2 text-[11px] whitespace-nowrap text-dim">
            <span
              className={`inline-block size-[6px] rounded-full ${
                snapshot.archive ? "bg-faint" : live === 2 ? "bg-ink" : live === 1 ? "bg-dim" : "bg-faint"
              }`}
            />
            {/* The date always shows and only the live phrase folds. "Everything is normal" is reassurance and
            the dot carries it; "this is not what you think" is a correction, and absence is its failure. */}
            {snapshot.archive ? (
              <span className="font-mono">{new Date(snapshot.archive.from).toISOString().slice(0, 10)}</span>
            ) : (
              <span className="hidden sm:inline">
                {live === 2 ? "both feeds live" : live === 1 ? "one feed live" : "connecting"}
              </span>
            )}
          </span>
        </div>
      </header>

      {/* The way back. The fold control goes with the bar, so the unfold cannot live there. */}
      {headShown ? null : (
        <button
          type="button"
          onClick={() => setHeadOpen(true)}
          aria-label="Show the top bar"
          aria-expanded={false}
          aria-controls="chrome-head"
          className="absolute top-3 right-4 z-[3] cursor-pointer bg-deck/40 px-2 py-1 font-mono
            text-[11px] leading-none text-faint backdrop-blur-xl backdrop-saturate-50
            transition-colors hover:text-ink"
        >
          &#8964;
        </button>
      )}

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
        {/* Clamped so the canvas keeps 46dvh - the design contract asks 44%, and a handle that can break a
            build test is not a handle - and 82dvh the other way, past which the sheet cannot hold its own
            heading. */}
        {/* Gone while a panel is up: at `z-[2]` it would be a grip drawn across something it cannot resize. */}
        {markSubject || (shownQuake && pinned) ? null : (
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
        <aside
          id="chrome-rail"
          className="zone-rail rail border-hairline bg-deck p-5 max-xl:border-b xl:border-r"
          hidden={!railShown}
        >
          <div className="titleblock">
            {/* `data-rail="headline"` has no stylesheet rule: it is a browser test's handle for somewhere in
              the rail that is not the strip. Deleting it as dead looked right and broke two tests. */}
            <div className="tb-cell tb-wide" data-rail="headline">
              {/* Before any coverage exists there is no count, and a big 0 over "nothing yet" was two
                disclaimers under a number that meant nothing. */}
              {snapshot.coveredSince === null ? (
                <div className="mt-2 max-w-[30ch] text-[14px] leading-snug text-dim">
                  {/* Reads `archiveDay`, which is set before the fetch starts. `archive` and `coveredSince` are both
                    set by the success handler, so a page opened straight at a past day said "the last day" about 2011
                    until the answer landed. */}
                  {/* "Asking" stops being true once both feeds have answered no: eighteen seconds into a total outage
                    the rail read "Asking USGS and EMSC" above "USGS is not answering". Only when both fail - one feed
                    down is a caveat the notice already carries. */}
                  {snapshot.statuses.usgs.kind === "failing" && snapshot.statuses.emsc.kind === "failing"
                    ? "Neither feed is answering yet."
                    : archiveBusy && archiveDay
                      ? `Asking USGS and EMSC for ${archiveDay}.`
                      : "Asking USGS and EMSC for the last day."}
                </div>
              ) : (
                <>
                  {/* Counts what is on the globe, so during the replay it climbs as the day plays in. See
                    ARCHITECTURE.md. */}
                  {/* The one piece of display type here, so it is set like display type: heavier than the
                    prose under it and closed up slightly, which large figures need and small ones do not.
                    `tabular-nums` still decides the widths, so the tracking cannot make it twitch. */}
                  <div className="mt-1.5 text-[38px] leading-none font-[650] tracking-[-0.015em] tabular-nums">
                    {headline.toLocaleString("en-GB")}
                  </div>
                  {/* One slot, shared by the tour and the replay clock. Every tour stop says where it is and how much
                    is there, which keeps the camera movement from being a screensaver. */}
                  {touring ? (
                    <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-ink tabular-nums">
                        {tourAt !== null ? tourAt + 1 : 0}/{route.current.length}
                      </span>
                      <span className="text-faint">
                        {tourLabel(touring, tourAt ?? 0, route.current.length).replace(/^\d+ of \d+ · /, "")}
                      </span>
                    </div>
                  ) : replay ? (
                    <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-ink">{clock(replay.at)}</span>
                      <span className="text-faint">replaying the last day</span>
                    </div>
                  ) : view.at !== null ? (
                    /*
                    The cursor's own clock. "Last 24 hours" over a count of half of them would describe the
                    window while the number describes the picture.
                  */
                    <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-ink">{clock(view.at)}</span>
                      <span className="text-faint">{view.playing ? "playing" : "held"}</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-dim">
                      {windowLabel(now, filters.windowMs, snapshot.coveredSince, archived)}
                      {edge.complete ? "" : " · still filling"}
                    </div>
                  )}
                </>
              )}
            </div>

            {!strongest && !replay && !flat ? (
              /* Hold the place and say what happened. Letting these vanish collapsed the titleblock from 190px
            to 86px under the cursor that caused it, which reads as a bug. */
              <div className="tb-cell tb-wide" data-rail="largest">
                <span className="label block">Largest</span>
                <span className="text-[11px] text-faint">
                  nothing at or above M{filters.minMagnitude.toFixed(1)}
                </span>
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
                aria-label={
                  `Largest: magnitude ${strongest.primary.magnitude.toFixed(1)}, ` +
                  `${place(strongest.primary.place)}, ${ago(strongest.primary.time, now, archived)}. ` +
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
                <span className="label block">On edge</span>
                <span className="text-[11px] text-faint">nothing in range to measure</span>
              </div>
            ) : null}
            {!replay && !flat && quiet.parts !== null ? (
              <div className="tb-cell tb-wide">
                <span className="label">On edge</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[13px] tabular-nums text-ink">{quiet.parts.percent}%</span>
                  <span className="text-[11px] text-dim">within {QUIET_BAND_KM} km</span>
                </span>
              </div>
            ) : null}
          </div>

          {/* One tenant only: the tablet grid names `.tb-notes` and nothing else, so a second block auto-places
              into a row of its own. One extra paragraph added 54px to a strip already 250px over. */}
          <div className="tb-stack">
            {!replay && quiet.note ? (
              <div className="tb-notes">
                <span className="label">Notes</span>
                <p className="text-[11px] leading-relaxed text-faint">{quiet.note}</p>
              </div>
            ) : null}
            {!archived && silentFeeds(answered) ? (
              <div className="tb-notes">
                <span className="label">Feeds</span>
                <p className="text-[11px] leading-relaxed text-faint">{silentFeeds(answered)}</p>
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
          </div>

          <div data-rail="legend">{marksFilter}</div>
          {/* A phone has no canvas corner to spare, so there the key goes back into the column. */}
          {keyOnCanvas ? null : <div className="mt-4">{marksKey}</div>}

          {archiveBlock}
          {timeline}

          {/* Directly above the region list, because that is where its results are drawn. Under the headline
          the answers landed 700px below the box, off the bottom of the screen. */}
          <div data-rail="when">
            <div role="search" className="mb-1.5 flex flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-2">
              <label htmlFor="find" className="label shrink-0">
                Find
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

          {/* The hazard list stays on the flat map even though the region index does not: a glyph cannot be
          reached by keyboard. */}
          {(regions.length > 0 && !flat) || hazards.length > 0 ? (
            <div data-rail="regions" className="relative">
              {regions.length > 0 && !flat ? (
                <>
                  {/* Label above until the column is wide enough. Sharing a row, the label takes its width first: at
              768px the field was left 87px for a 134px placeholder and read "a region or a pla". */}
                  <div ref={regionsRef} className="rail-regions scroll-fade">
                    {query ? (
                      results.hits.length > 0 ? (
                        <>
                          {results.hits.map((hit) =>
                            hit.kind === "region" ? (
                              <Row
                                key={`r:${hit.region.name}`}
                                label={hit.region.name}
                                trail={`${hit.count}`}
                                onClick={() => pick(hit)}
                              />
                            ) : (
                              <Row
                                key={`p:${hit.name}`}
                                label={hit.name}
                                trail={`${hit.count} · M${hit.strongest.primary.magnitude.toFixed(1)}`}
                                onClick={() => pick(hit)}
                              />
                            ),
                          )}
                          {results.more > 0 ? (
                            <p className="px-1.5 pt-1.5 text-[11px] leading-relaxed text-faint">
                              {`${PLACE_LIMIT} of ${PLACE_LIMIT + results.more} places. `}
                              Narrow the query to see the rest.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        /* Say which nothing this is. There is no gazetteer and cannot be one keylessly, so a real place
                    with no seismicity looks exactly like a typo. */
                        <p className="px-1.5 py-1 text-[11px] leading-relaxed text-faint">
                          Nothing in the {hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}{" "}
                          on screen. This searches the named regions and the places these two agencies put on
                          the events it holds, not a map of the world.
                        </p>
                      )
                    ) : (
                      <>
                        <div className="label">Regions</div>
                        {regions.map(({ region, count }) => (
                          <Row
                            key={region.name}
                            label={region.name}
                            trail={count.toLocaleString("en-GB")}
                            share={busiest > 0 ? count / busiest : 0}
                            onClick={() => flyTo.current(region.lon, region.lat, region.zoom)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                  <Resizer
                    axis="y"
                    label="Regions height"
                    value={regionsHeight}
                    min={64}
                    max={360}
                    measure={(e) => e.clientY - (regionsRef.current?.getBoundingClientRect().top ?? 0)}
                    onChange={setRegionsHeight}
                    className="absolute inset-x-0 -bottom-2 hidden xl:block"
                  />
                </>
              ) : null}

              {/* Inside the regions block, not a rail block of its own: every cell of the tablet grid is named,
              and an unnamed one auto-places into a new row and makes the strip taller. */}
              {hazards.length > 0 ? (
                <details className="mt-3">
                  <summary className="disclose text-[11px] text-faint hover:text-dim">
                    Storms, fires, floods and volcanoes ({hazardCount(hazards)})
                  </summary>
                  <div className="mt-1.5 max-h-[240px] overflow-y-auto pr-1">
                    {hazards.map((group) => (
                      <div key={group.kind} className="mt-1.5 first:mt-0">
                        <div className="label">{group.label}</div>
                        {group.rows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            data-hazard-row={row.id}
                            onClick={() => {
                              setSelected(null);
                              setMarkId(row.id);
                              flyTo.current(row.lon, row.lat, 2.2);
                            }}
                            className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left transition-colors hover:bg-raised ${
                              markId === row.id ? "bg-raised" : ""
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{row.name}</span>
                            {row.measure ? (
                              <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                                {row.measure}
                              </span>
                            ) : null}
                            {row.age ? (
                              <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                                {row.age}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          {failing.length > 0 ? (
            <div
              data-rail="notice"
              className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim"
            >
              {failing.map(([id, status]) => (
                <div key={id}>
                  <span className="text-ink">{SOURCE_NAMES[id]}</span> is not answering: {status.reason}.
                  Retrying at {clock(status.retryAt)}.
                </div>
              ))}
              <div className="mt-1 text-faint">The globe keeps what it has.</div>
            </div>
          ) : null}

          {staleCursor ? (
            <p
              data-rail="notice"
              className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim"
            >
              {/* Two refusals, two sentences: "the present instead" is false when the clamp pinned the cursor to
              the oldest edge rather than releasing it. */}
              {view.at === null
                ? "The moment in this link is outside the window, so this is the present instead."
                : "The moment in this link is older than the window, so this is the oldest moment the " +
                  "buffer still holds."}
            </p>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p
              data-rail="notice"
              className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim"
            >
              {/* An archived day does not slide, so "no longer in the window" is the wrong sentence there. */}
              {archived
                ? `The event in this link is not in ${loadedDay ?? "this day"}. ` +
                  "The whole day is loaded, so this is not a gap in coverage."
                : "The event in this link is no longer in the window. The buffer holds the last day, " +
                  "and it starts when the page opens."}
            </p>
          ) : null}

          <EventList
            quakes={recent}
            selected={selected}
            onSelect={selectQuake}
            announceAbove={announceAbove}
            onAnnounceAboveChange={setAnnounceAbove}
            onNews={onNews}
            waiting={snapshot.coveredSince === null}
            /* Unfiltered on purpose: turning both sources off should be blamed, a quiet day should not. */
            reported={snapshot.stats.quakes}
            now={now}
            archived={archived}
          />
        </aside>

        {/* One control in one place: the handle sits at the rail's outer edge open, and at the frame's
        edge closed, which is where a reader last saw the rail go. */}
        {chromeFloats ? (
          <button
            type="button"
            onClick={() => setRailOpen(!railOpen)}
            aria-label={railOpen ? "Hide the panel" : "Show the panel"}
            aria-expanded={railOpen}
            aria-controls="chrome-rail"
            className="absolute top-[calc(var(--head-h)_+_1rem)] z-[2] cursor-pointer bg-deck/40 px-1.5
              py-2.5 font-mono text-[11px] leading-none text-faint backdrop-blur-xl backdrop-saturate-50
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
          /* Hide it with the rail. The handle is a sibling and not a child, so left behind it is a one-pixel
          bright line down a frame containing nothing but planet. */
          className={railShown ? "absolute inset-y-0 hidden xl:block" : "hidden"}
          style={{ left: railWidth - 6 }}
        />

        {/* Stands down while a panel is up: same edge, and two things claiming it are two answers to one
        question. */}
        {!keyOnCanvas || section || markSubject || (shownQuake && pinned) ? null : (
          <div
            /* Anchored at the bottom, so opening grows it upward out of the corner instead of off the screen.
            Below `xl` the cap is a share of the viewport: at 1024x768 the canvas is about 440px tall and a
            604px panel ran up over the rail. */
            className="pointer-events-auto absolute right-4 bottom-4 z-[1] max-h-[46dvh] w-[300px]
              overflow-y-auto bg-deck/40 p-3 backdrop-blur-2xl backdrop-saturate-50
              xl:max-h-[calc(100dvh_-_var(--head-h)_-_6rem)]"
          >
            {marksKey}
          </div>
        )}

        <main className="zone-canvas relative bg-void">
          {/* Split out so the rail paints before three.js parses. The fallback is the void the globe
              sits on, so nothing appears and is then replaced. */}
          <Suspense fallback={null}>
            <Globe
              feed={feed}
              filters={filters}
              selected={selected}
              ramp={ramp}
              focus={focusSpan}
              aurora={onGlobe.aurora}
              marks={marks}
              scrubAt={view.at}
              /* Which moment the light is of. `clockAt` is the app's answer to what time is on screen, and a
               held cursor overrides it with the same precedence `stillMoment` uses, so the terminator and
               the caption cannot disagree. See ARCHITECTURE.md#srcapptsx. */
              moment={litAt}
              flat={flat}
              depthSink={sinkOn}
              slab={slabOn && slabData.length > 0 ? slabData : null}
              figures={figuresOn && figureData.length > 0 ? figureData : null}
              section={sectionLine}
              onSection={setSectionLine}
              onSelect={selectQuake}
              onReady={onReady}
              onCapture={onCapture}
              onSelectMark={selectMark}
              onCamera={(state) => {
                camera.current = state;
                /*
                Arrival by geometry, not by a timer: the flight is a spring, so its duration depends on how
                far it went. Four degrees of tolerance, because the spring approaches asymptotically and a
                tight threshold leaves the narration permanently unspoken.
              */
                const target = tourTarget.current;
                if (!target) return;
                let dLon = Math.abs(state.lon - target.lon) % 360;
                if (dLon > 180) dLon = 360 - dLon;
                if (dLon < 4 && Math.abs(state.lat - target.lat) < 4) {
                  tourTarget.current = null;
                  setTourArrived(target.index);
                }
              }}
              onReplay={setReplay}
            />
          </Suspense>

          <div
            /* Fixed to the rail's edge, and never moved by a panel. See ARCHITECTURE.md#srcapptsx. */
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-wrap items-end justify-start gap-x-6 gap-y-3 p-4 xl:left-[var(--rail-w)]"
          >
            {/* The section joins the bottom band as a full-width line, last, so it is flush with the bottom
                edge. Placed first it floated mid-canvas and read as the map having been cut in half. */}
            {section ? (
              /*
                Fully desaturated and deeper than the other rail panels, because this one is a drawing. At
                half saturation the map's cluster glowed magenta through it and the slab's 1.6px dots were
                lost outright.
              */
              /* The one thing in this band that still yields to a panel. See ARCHITECTURE.md#srcapptsx. */
              <div
                className={`order-9 -mx-4 -mb-4 w-[calc(100%+2rem)] bg-deck/70 px-4 pt-3 pb-4 backdrop-blur-2xl backdrop-saturate-0 ${
                  markSubject || (shownQuake && pinned) ? "xl:pr-[calc(var(--panel-w)+1rem)]" : ""
                }`}
              >
                <CrossSection
                  data={section}
                  ramp={ramp}
                  store={feed.store}
                  selected={selected}
                  onSelect={selectQuake}
                  onClose={() => setSectionLine(null)}
                />
              </div>
            ) : null}
            {/* Both keep the same `py-1.5`, or their two lines of text sit on different baselines. See
                ARCHITECTURE.md. */}
            <div
              className="relative order-2 flex w-full flex-wrap items-end gap-x-6 gap-y-2
              md:justify-center"
            >
              <p className="py-1.5 text-[11px] text-faint md:absolute md:bottom-0 md:left-0">
                made by{" "}
                <a
                  href="https://www.aidenjang.com"
                  target="_blank"
                  rel="noreferrer"
                  /* `inline-flex`, not inline: `min-height` does nothing to an inline element, so the 44px touch
                minimum slid straight off and the finger test caught it at 14px. */
                  className="pointer-events-auto inline-flex items-center text-faint underline decoration-from-font underline-offset-2 transition-colors hover:text-dim max-md:min-h-11"
                >
                  aiden jang
                </a>
              </p>
              <div className="key-hints pointer-events-auto bg-deck/40 px-2.5 py-1.5 font-mono text-[10.5px] text-faint backdrop-blur-xl backdrop-saturate-50">
                {/* What the keys do in this projection: a row saying orbit while the drag pans is worse than none. */}
                {(
                  [
                    ["arrows", flat ? "pan" : "orbit"],
                    ["+ -", "zoom"],
                    ["0", "reset"],
                    ["space", view.playing ? "pause" : "play"],
                    [", .", "step"],
                    ...(archived ? [["[ ]", "day"] as const] : []),
                    ...(flat ? [["shift-drag", "section"] as const] : []),
                    ["f", "full"],
                    /* Only when there is something to clear, or the app offers `esc` on every first load. `markId`
                belongs in this list and in the ladder: a mark card is a pin. */
                    ...(query || sectionLine || view.at !== null || selected || markId
                      ? [["esc", "clear"] as const]
                      : []),
                  ] as const
                ).map(([key, what]) => (
                  <span key={key} className="mr-3 inline-flex items-baseline gap-1.5">
                    <span className="text-dim">{key}</span>
                    {what}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/*
        Folding the bar must not hide which day this is. It carried all four statements of the date, and
        a fullscreen window has no tab title either, so a viewer saw 2011 with nothing saying it was not
        this morning. Take the day from the snapshot, not the field, which is text somebody is typing.
        */}
        {!headShown && (snapshot.archive !== null || view.at !== null) ? (
          <div className="stamp pointer-events-none absolute bottom-4 left-4 z-[2] bg-deck/40 px-3 py-2 font-mono text-[11px] text-faint backdrop-blur-xl backdrop-saturate-50">
            {stillMoment(
              view.at,
              snapshot.archive ? snapshot.archive.from : clockAt(),
              snapshot.archive !== null,
            )}
          </div>
        ) : null}

        {/* Held past the unpin so the panel can leave: React removes a conditional mount on the same frame,
            and a transition on a removed node never runs. */}
        {/* Never folds with the chrome - this is content. Escape belongs to the browser in fullscreen, so the
            panel's own `esc` control is how it closes there. */}
        {markSubject ? (
          <MarkCard found={markSubject} now={now} archived={archived} onClose={() => setMarkId(null)} />
        ) : shownQuake ? (
          <DetailPanel
            open={pinned !== undefined}
            quake={shownQuake}
            store={feed.store}
            filters={filters}
            ramp={ramp}
            excluded={!matches(shownQuake, filters, now)}
            revision={snapshot.revision}
            now={now}
            archived={archived}
            onClose={() => setSelected(null)}
            onSection={(line) => {
              setSectionLine(line);
              setFlat(true);
              flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 1.6);
            }}
            boundaryKm={boundaryKmOf(shownQuake)}
            onSelect={selectQuake}
            farSide={farSideOf === shownQuake.key}
            /* Out to 0.9: the figure is 40,000km across, and zoomed in you see one arc with no sign it is a
            circle. */
            onFarSide={(on) => {
              setFarSideOf(on ? shownQuake.key : null);
              if (on) flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 0.9);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
