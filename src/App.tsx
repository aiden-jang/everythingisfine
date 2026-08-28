import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const Globe = lazy(() => import("./globe/Globe").then((m) => ({ default: m.Globe })));
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { PLACE_LIMIT, search, type Hit } from "./app/search";
import { useRolling } from "./app/roll";
import { store, stored } from "./app/stored";
import { fetchAurora, type Aurora } from "./sources/aurora";
import { fetchCyclones, type Cyclone } from "./sources/cyclones";
import { fetchVolcanoes, newestEpisode, type Volcano } from "./sources/volcanoes";
import { fetchWildfires, summarise, FEED_CAP, type Wildfire } from "./sources/wildfires";
import { countries, fetchFloods, type Flood } from "./sources/floods";
import { marksFor } from "./app/marks";
import { depthBands } from "./data/depth";
import { drawStill, stillMoment, verdictLine, STILL_HEIGHT, STILL_WIDTH } from "./app/still";
import { findSubject, MarkCard } from "./app/MarkCard";
import { hazardCount, hazardGroups } from "./app/hazards";
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
import {
  closestTo, loadZones, localZone, viewerPlace, type ZoneTable,
} from "./app/viewer";
import {
  BASELINE_DAYS, BASELINE_FROM, BASELINE_MIN_MAGNITUDE, BASELINE_TO, comparableCount, rankDay,
  sharePercent,
} from "./data/baseline";
import {
  boundarySegments, nearestBoundaryKm, QUIET_BAND_KM, QUIET_BAND_SHARE,
} from "./geo/boundaryDistance";
import { EventList } from "./app/EventList";
import { DetailPanel } from "./app/DetailPanel";
import { MagnitudeFilter } from "./app/MagnitudeFilter";
import { Timeline } from "./app/Timeline";
import { clamp as clampScrub, dragTo, fractionOf, LIVE, nudge, step as stepScrub, togglePlay,
  type Scrub } from "./app/scrub";
import { Resizer } from "./app/Resizer";
import { CrossSection } from "./app/CrossSection";
import { buildSection, type SectionLine } from "./app/section";
import { histogram, totalIn } from "./app/histogram";
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
  ago, agoShort, clock, compactSpan, corroborationNote, energyPercent, magnitude, place, quietNote, quietParts, silentFeeds,
  reachFraction, reachNote,
  reachWords, SOURCE_NAMES, windowLabel,
} from "./app/format";

/**
 * Renders once, in one place or the other. Two copies with one hidden would put a second `#mag` slider
 * and a second pair of source toggles in the accessibility tree.
 */
function useWide(): boolean {
  const query = "(min-width: 1280px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (): void => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/*
 * The feed is created once, outside the component. A fifty-thousand-event ring buffer has to survive a
 * re-render and a StrictMode double-mount; built in an effect it opens two WebSockets in development.
 */
const feed = createFeed();

/** Subscribes to the feed without re-rendering per earthquake: announcements are already coalesced. */
function useFeed(): FeedSnapshot {
  const [snapshot, setSnapshot] = useState(() => feed.snapshot());
  useEffect(() => feed.subscribe(setSnapshot), []);
  return snapshot;
}

function Row({ lead, label, trail, share, onClick }: {
  lead?: string; label: string; trail: string; share?: number; onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      {lead ? (
        <span className="w-[34px] shrink-0 font-mono text-[12px] text-ink">{lead}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{label}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-faint">{trail}</span>
      {share === undefined || share <= 0 ? null : (
        <span aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-[3px]">
          {/* A floor of 2%, so a region with one event is a mark rather than nothing. */}
          <span className="block h-px bg-dim" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </span>
      )}
    </>
  );

  // The share bar is normalised to the largest region, never to a total, because there is no total:
  // regions overlap, so `countByRegion` can sum past the number of events on screen.
  const shared = "relative flex w-full items-baseline gap-3 rounded-[2px] px-1.5 py-[7px] text-left";
  return onClick
    ? (
      <button
        type="button"
        onClick={onClick}
        className={`${shared} cursor-pointer transition-colors hover:bg-raised`}
      >
        {body}
      </button>
    )
    : <div className={shared}>{body}</div>;
}

// Read at module load, before anything renders. Applied in an effect it would show the default globe
// first and correct itself a frame later.
const shared = decode(window.location.hash);

export function App(): JSX.Element {
  const snapshot = useFeed();
  const [filters, setFilters] = useState<Filters>(() => ({
    minMagnitude: shared.minMagnitude ?? DEFAULT_FILTERS.minMagnitude,
    windowMs: (shared.windowHours ?? 24) * 3_600_000,
    sources: new Set(shared.sources ?? [...DEFAULT_FILTERS.sources]),
  }));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [replay, setReplay] = useState<{ at: number; revealed: number } | null>(null);
  // Not in the permalink. A cursor mid-playback is a hand on a control, not a view somebody would send.
  /*
   * A shared moment, held rather than played. `clampScrub` refuses a cursor the window cannot hold in
   * both directions - ahead releases to live, older pins to the oldest moment left - and `staleCursor`
   * below says which happened.
   */
  const [scrub, setScrub] = useState<Scrub>(
    shared.cursor === undefined ? LIVE : { at: shared.cursor, playing: false },
  );
  // Derived into `fetching` rather than cleared by an effect. Events landing is what answers the
  // request and what bumps the revision, so a boolean beside it would be the same fact stored twice.
  const [pendingRev, setPendingRev] = useState<number | null>(null);
  // A shared event the rolling window no longer holds. Opening no panel would look like a broken link.
  const [missingShared, setMissingShared] = useState<string | null>(shared.event ?? null);
  // Not in the permalink: this is where the pointer is, and a link arriving with 23 of its 24 hours
  // dimmed would look broken rather than shared.
  const [focusHour, setFocusHour] = useState<number | null>(null);
  /*
   * Tonight's aurora, fetched beside the seismic feeds and not through them. A probability field has no
   * identity to reconcile and no magnitude to carry, so `GeoEventSource` is the wrong shape for it.
   *
   * Ten minutes, not the model's five: the grid is 900kB and the oval barely moves in that time.
   */
  const [aurora, setAurora] = useState<Aurora | null>(null);
  // The storms happening now. Beside the aurora rather than through it: they share a refresh interval
  // and nothing else.
  const [cyclones, setCyclones] = useState<readonly Cyclone[]>([]);
  /*
   * Which of the five layers actually answered. Optimistic until told otherwise, so a page that has not
   * asked yet never cries wolf, and a later success clears the complaint instead of leaving it stale.
   */
  const [answered, setAnswered] = useState({
    cyclones: true, volcanoes: true, fires: true, floods: true, aurora: true,
  });
  const answerFor = useCallback(
    (layer: keyof typeof answered) => (ok: boolean): void => {
      setAnswered((was) => (was[layer] === ok ? was : { ...was, [layer]: ok }));
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchAurora(fetch, answerFor("aurora"))
        .then((next) => { if (alive && next) setAurora(next); });
    };
    load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  /*
   * Volcanoes with a logged eruption episode. Fetched once, not on the ten-minute clock: the newest
   * episode is weeks old, so polling a two-year archive every ten minutes learns nothing.
   */
  const [volcanoes, setVolcanoes] = useState<readonly Volcano[]>([]);
  /*
   * Fires and floods, on the storms' clock. Both parsers filter on `iscurrent` because it was measured:
   * every fire is flagged current, and 81 of the hundred floods are up to a year old.
   */
  const [fires, setFires] = useState<readonly Wildfire[]>([]);
  const [floods, setFloods] = useState<readonly Flood[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchCyclones(fetch, answerFor("cyclones"))
        .then((next) => { if (alive) setCyclones(next); });
      void fetchWildfires(fetch, answerFor("fires")).then((next) => { if (alive) setFires(next); });
      void fetchFloods(fetch, answerFor("floods")).then((next) => { if (alive) setFloods(next); });
    };
    load();
    void fetchVolcanoes(fetch, answerFor("volcanoes"))
      .then((next) => { if (alive) setVolcanoes(next); });
    const id = window.setInterval(load, 10 * 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  /*
   * Declared above every memo that calls it. Defined further down it sits in a temporal dead zone, which
   * is a runtime error and not a type error: tsc passes, the build passes, and the page renders nothing.
   */
  /*
   * The same clock as a stable function, for the memos that filter.
   *
   * They read the time inline instead of depending on `now`, which changes every render and would
   * recompute a fifty-thousand-event sweep every second. They key on `snapshot.revision`, which
   * `showArchive` bumps, so entering or leaving an archive recomputes them exactly once.
   */
  const clockAt = useCallback(() => feed.snapshot().archive?.to ?? Date.now(), []);
  /*
   * The other five layers, withheld while an archived day is on screen.
   *
   * Fetched live and unconditionally, an archived July drew today's storms and fires over July's
   * earthquakes. Withheld rather than backdated because there is nothing to backdate to: GDACS lists are
   * flagged current, not queryable by date. So this is an earthquake archive, which is what the banner says.
   */
  const archived = snapshot.archive !== null;
  /** The archived day as the notable list writes it, so a row can say it is the one on screen. */
  const loadedDay = snapshot.archive
    ? new Date(snapshot.archive.from).toISOString().slice(0, 10)
    : null;
  // The newest day the archive accepts, which is yesterday: a day still running is what the live view
  // already is. Read by the date field's `max` and by the stepper, so the two cannot disagree.
  const newestDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  /*
   * The days either side, each button naming the date it leads to rather than a direction.
   *
   * A sequence does not stop at midnight UTC - Tōhoku's aftershocks keep arriving into the next day -
   * and before this, leaving a loaded day meant going back to live and retyping a date.
   */
  const neighbours = snapshot.archive === null ? null : {
    prev: new Date(snapshot.archive.from - 86_400_000).toISOString().slice(0, 10),
    next: new Date(snapshot.archive.from + 86_400_000).toISOString().slice(0, 10),
  };
  // Held apart from the live arrays: different upstream, different unit, and nothing downstream should
  // mistake one for the other. `onGlobe` picks between them, which is where that decision belongs.
  const [archiveHazards, setArchiveHazards] = useState<History | null>(null);
  /*
   * What is actually drawn: the live feeds, or an archived day's four layers.
   *
   * The aurora has no archived branch and never will. NOAA publishes a forecast for a stamped minute, so
   * drawing tonight's oval over last July is exactly the falsehood this mode exists to avoid.
   */
  const onGlobe = {
    cyclones: archived ? archiveHazards?.cyclones ?? [] : cyclones,
    volcanoes: archived ? archiveHazards?.volcanoes ?? [] : volcanoes,
    fires: archived ? archiveHazards?.fires ?? [] : fires,
    floods: archived ? archiveHazards?.floods ?? [] : floods,
    aurora: archived ? null : aurora,
  };
  const fireSummary = useMemo(() => summarise(onGlobe.fires), [onGlobe.fires]);
  // Keyed on the store revision, not the clock. The rail re-renders every second and these counts only
  // move when an earthquake does.
  const depth = useMemo(
    () => depthBands(feed.store, filters, clockAt()), [filters, snapshot.revision],
  );
  const onMap = useWide();
  /*
   * Not in the permalink: which projection somebody happened to be using is a preference.
   *
   * A shared cross-section is not that rule bending. A section only exists on the map, so the link is
   * naming a slice, not a projection, and without the map there would be nothing to draw it on.
   */
  const [flat, setFlat] = useState(
    () => shared.section !== undefined || stored("flat") === "1",
  );
  useEffect(() => {
    store("flat", flat ? "1" : "0");
  }, [flat]);
  const [railWidth, setRailWidth] = useState<number>(
    () => Number(stored("rail")) || 356,
  );
  useEffect(() => {
    store("rail", String(railWidth));
  }, [railWidth]);
  const [regionsHeight, setRegionsHeight] = useState<number>(
    () => Number(stored("regions")) || 132,
  );
  useEffect(() => {
    store("regions", String(regionsHeight));
  }, [regionsHeight]);
  const regionsRef = useRef<HTMLDivElement>(null);
  // Keyed on the revision rather than the clock: it walks the whole buffer, the panel re-renders every
  // second because the clock ticks, and the answer only changes when an earthquake does.
  const [sectionLine, setSectionLine] = useState<SectionLine | null>(shared.section ?? null);
  // Both persisted, because both are accessibility settings. Read lazily so the first paint already has
  // the right ramp instead of flashing the default.
  const [ramp, setRamp] = useState<RampName>(
    () => shared.ramp ?? (stored("ramp") as RampName | null) ?? "thermal",
  );
  const [announceAbove, setAnnounceAbove] = useState<number>(
    () => Number(stored("announceAbove") ?? "4.5"),
  );
  // Stored as the closed state, so an absent key reads as the default rather than as a choice.
  // An id, not a flag, so selecting a different event drops the figure instead of quietly re-pointing it
  // at the new one and drawing the wrong epicentre's geometry.
  // Held beside the pinned earthquake rather than folded into it: same click, different things.
  // Resolved back to the mark at render, so one that has aged out simply stops having a card.
  // Ignored when the link also names a day: an archived day withholds the five layers, so the id would
  // resolve to nothing and the card would never open.
  const [markId, setMarkId] = useState<string | null>(shared.day ? null : shared.mark ?? null);
  /*
   * An archived day, or null for live. The span lives on the feed snapshot; this is the request.
   *
   * Loading a day stops the live sources and replaces the set, and every claim of liveness in the chrome
   * reads `snapshot.archive` and stands down. A scrubber that quietly makes "right now" false is the
   * version worth refusing.
   */
  const [archiveDay, setArchiveDay] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  /*
   * How many events each notable day holds, which is the fact that separates them: 1960-05-22 is an M9.5
   * with 6 events and 2011-03-11 is an M9.1 with 684. Magnitude alone makes them read as equivalent.
   *
   * Fetched when the list is opened, not on load. `count` answers in forty bytes.
   */
  const [dayCounts, setDayCounts] = useState<Record<string, number | null>>({});
  const countsAsked = useRef(false);
  const askCounts = useCallback(() => {
    if (countsAsked.current) return;
    countsAsked.current = true;
    void Promise.all(NOTABLE_DAYS.map(async (d) => {
      const n = await countForDay(d.day, MAG_MIN);
      setDayCounts((prev) => ({ ...prev, [d.day]: n }));
    }));
  }, []);
  // Only once ten characters are in. Complaining at "2011-0" would be scolding somebody mid-word.
  const dayFault = archiveDay.length < DAY_LENGTH
    ? null
    : !isRealDay(archiveDay)
      ? `${archiveDay} is not a date.`
      : !isArchivableDay(archiveDay, Date.now())
        ? "That day has not finished yet. The archive draws whole UTC days, so today is the live view."
        : null;
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  // A link carrying `d=` arrives in that day. Fired after the live feed has started, because
  // `showArchive` stops the sources itself: racing ahead of it would let them refill the archive.
  const arrivedOnADay = useRef(false);
  const loadArchive = useCallback(async (iso: string) => {
    const span = dayRange(iso);
    /*
     * The ceiling lives here, because every path calls this. As the date field's `max` attribute it
     * guarded exactly one of the four ways a day gets loaded - typed, pasted in a link, picked from the
     * notable list, stepped to from a neighbour.
     */
    if (!span || !isArchivableDay(iso, Date.now())) return;
    setArchiveBusy(true);
    setArchiveNote(null);
    setArchiveHazards(null);
    // Together: the earthquake archive and the hazard archive are different hosts and neither waits.
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
      const n = hazards.cyclones.length + hazards.fires.length
        + hazards.floods.length + hazards.volcanoes.length;
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
  // Reads the span from the feed rather than closing over the rendered day, so it cannot go stale
  // between a step and the answer landing. `archive.from` is midnight UTC, so a day is exactly 86.4Ms.
  const stepDay = useCallback((days: number) => {
    const archive = feed.snapshot().archive;
    if (archive === null) return;
    const iso = new Date(archive.from + days * 86_400_000).toISOString().slice(0, 10);
    setArchiveDay(iso);
    void loadArchive(iso);
  }, [loadArchive]);
  const backToLive = useCallback(() => {
    setArchiveDay("");
    setArchiveNote(null);
    setArchiveHazards(null);
    setSelected(null);
    setMarkId(null);
    feed.resumeLive();
  }, []);
  const [farSideOf, setFarSideOf] = useState<string | null>(null);
  /*
   * The key starts open only where the rail runs the full height of the window.
   *
   * 1280, not 768. The 768-1279 strip is 34dvh, and the key measures 719px in it: 2.1 times the visible
   * height, worse than the phone's 1.9. Picking 768 would have left the app's worst case untouched.
   *
   * A stored answer always wins in both directions, and this is read once at mount rather than on
   * resize, so resizing a window never overrules a choice somebody already made.
   */
  const [keyOpen, setKeyOpen] = useState<boolean>(() => {
    const saved = stored("legendKey");
    if (saved !== null) return saved !== "0";
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  // Written on the press, never in an effect on the value. As an effect it fired on mount and persisted
  // the width-derived default, as though somebody had chosen it. Only a real toggle is a choice.
  const changeKeyOpen = useCallback((next: boolean) => {
    setKeyOpen(next);
    store("legendKey", next ? "1" : "0");
  }, []);
  const [motionOn, setMotionOn] = useState<boolean>(() => stored("motion") === "1");
  useEffect(() => { store("motion", motionOn ? "1" : "0"); }, [motionOn]);
  /*
   * The one view preference that defaults to on. The arrows add 231 marks; this moves marks already on
   * screen to where the events actually were, and a scatter resolving into a dipping plane is the
   * strongest thing the globe does. Off by default, nobody would find it.
   */
  const [sinkOn, setSinkOn] = useState<boolean>(() => stored("depthSink") !== "0");
  useEffect(() => { store("depthSink", sinkOn ? "1" : "0"); }, [sinkOn]);
  // Off until asked for: 37kB of static table and 1,583 marks. What it buys is a shape - a real day
  // carries two events below 300km, which is right and far too thin to see anything in.
  const [slabOn, setSlabOn] = useState<boolean>(() => stored("slab") === "1");
  useEffect(() => { store("slab", slabOn ? "1" : "0"); }, [slabOn]);
  const [figuresOn, setFiguresOn] = useState<boolean>(() => stored("figures") === "1");
  useEffect(() => { store("figures", figuresOn ? "1" : "0"); }, [figuresOn]);
  // Not a toggle: the zone is readable by any page without a prompt and nothing is sent anywhere.
  // Fetched lazily all the same, because 13kB of coordinates has no business in the first frame.
  const [zones, setZones] = useState<ZoneTable | null>(null);
  useEffect(() => {
    let alive = true;
    void loadZones().then((next) => { if (alive) setZones(next); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const here = useMemo(() => (zones ? viewerPlace(zones, localZone()) : null), [zones]);
  // Fetched on first use, not imported: 7.1kB behind a toggle that is off by default. A failed import
  // leaves the array empty, which draws nothing rather than throwing.
  // Not deferred, unlike the motion arrows: every event in the panel gets a distance, and the globe
  // draws these same boundaries on the first frame anyway.
  const segments = useMemo(() => boundarySegments(), []);
  // Memoised per event key, not per render. Every event in a thirty-day window against every segment is
  // a million tests, on a rail that re-renders once a second. An epicentre never moves.
  const boundaryCache = useRef(new Map<string, number>());
  const boundaryKmOf = useCallback((quake: Quake): number | null => {
    if (segments.length === 0) return null;
    const cached = boundaryCache.current.get(quake.key);
    if (cached !== undefined) return cached;
    const km = nearestBoundaryKm(quake.primary.lon, quake.primary.lat, segments);
    if (km === null) return null;
    boundaryCache.current.set(quake.key, km);
    return km;
  }, [segments]);
  /*
   * The AudioContext is built on the press that enables it, never before. Created without a user gesture
   * it starts suspended and drops every later tone silently: the toggle reads on and nothing is heard.
   */
  const [sound, setSound] = useState(false);
  const siren = useRef<Siren | null>(null);
  useEffect(() => {
    if (!sound) {
      siren.current?.close();
      siren.current = null;
      return undefined;
    }
    try { siren.current = createSiren(); } catch { siren.current = null; }
    return () => { siren.current?.close(); siren.current = null; };
  }, [sound]);
  // Follows the live region's definition of news, so a cold load can never be audible: sixty seeded
  // events are all unseen and none of them just happened.
  const onNews = useCallback((magnitudes: number[]) => {
    siren.current?.play(magnitudes);
  }, []);
  const [motionData, setMotionData] = useState<readonly MotionSample[]>([]);
  useEffect(() => {
    if (!motionOn || motionData.length > 0) return;
    let alive = true;
    void loadMotion().then((next) => { if (alive) setMotionData(next); }).catch(() => {});
    return () => { alive = false; };
  }, [motionOn, motionData.length]);
  // Fetched once on first use. A failed import leaves it empty, which draws nothing rather than throwing.
  const [slabData, setSlabData] = useState<readonly SlabPoint[]>([]);
  useEffect(() => {
    if (!slabOn || slabData.length > 0) return;
    let alive = true;
    void loadSlab().then((next) => { if (alive) setSlabData(next); }).catch(() => {});
    return () => { alive = false; };
  }, [slabOn, slabData.length]);
  const [figureData, setFigureData] = useState<FigureTable>([]);
  useEffect(() => {
    if (!figuresOn || figureData.length > 0) return;
    let alive = true;
    void loadFigures().then((next) => { if (alive) setFigureData(next); }).catch(() => {});
    return () => { alive = false; };
  }, [figuresOn, figureData.length]);
  const motion = motionOn && motionData.length > 0 ? summariseMotion(motionData) : null;
  useEffect(() => { store("ramp", ramp); }, [ramp]);
  useEffect(() => {
    store("announceAbove", String(announceAbove));
  }, [announceAbove]);
  const flyTo = useRef<(lon: number, lat: number, zoom?: number) => void>(() => {});
  const lastWritten = useRef<string>(window.location.hash);
  const camera = useRef<{ lon: number; lat: number; zoom: number }>(
    { lon: shared.lon ?? 145, lat: shared.lat ?? 12, zoom: shared.zoom ?? 1 },
  );
  // The still's capture handle. Must be called and read synchronously; see `Globe.onCapture`.
  const capture = useRef<() => HTMLCanvasElement | null>(() => null);
  const onCapture = useCallback((fn: () => HTMLCanvasElement | null) => {
    capture.current = fn;
  }, []);
  const onReady = useCallback((fn: typeof flyTo.current) => {
    flyTo.current = fn;
    // A shared camera arrives rather than flies. Somebody following a link wanted the view in it.
    if (shared.lon !== undefined) fn(shared.lon, shared.lat ?? 12, shared.zoom ?? 1);
  }, []);

  // Rewritten in place, never pushed. Otherwise every filter nudge is a history entry and Back walks
  // somebody through a hundred of them instead of leaving the page.
  useEffect(() => {
    const write = (): void => {
      const pinnedNow = selected ? feed.store.get(selected) : undefined;
      const reading = pinnedNow?.primary;
      const fragment = encode({
        ...camera.current,
        minMagnitude: filters.minMagnitude,
        windowHours: filters.windowMs / 3_600_000,
        sources: [...filters.sources],
        ramp,
        event: reading ? `${reading.source}:${reading.id}` : null,
        day: snapshot.archive
          ? new Date(snapshot.archive.from).toISOString().slice(0, 10)
          : null,
        mark: markId,
        section: sectionLine,
        // The moment, not the playing state: a link that arrives already running is motion the recipient
        // did not ask for.
        //
        // And the moment being shown, not the one asked for. `scrub` keeps the link's original value so
        // the notice above can tell it was refused; writing that value back out made the link advertise
        // a moment the app was not drawing, and re-sharing spread it.
        cursor: view.at,
      });
      history.replaceState(null, "", `#${fragment}`);
    };
    write();
    lastWritten.current = window.location.hash;
    const timer = window.setInterval(() => {
      /*
       * Never overwrite a hash this app did not write.
       *
       * Pasting a link changes the fragment and queues a `hashchange`, and the handler below reloads on it.
       * Without this guard the interval could land in between: `replaceState` would put the app's own state
       * back over the pasted link, and the handler would then compare that against `lastWritten`, find them
       * equal, and skip the reload. The link is swallowed and the tab keeps showing the old view.
       *
       * Caught as a 1-in-6 flake in the browser test for a shared cross-section, which is the field most
       * likely to expose it: it is the one nobody's current state would happen to reproduce.
       */
      if (window.location.hash !== lastWritten.current) return;
      write();
      lastWritten.current = window.location.hash;
    }, 1000);
    return () => window.clearInterval(timer);
    // `snapshot.archive` is a dependency because `write` closes over it and the interval below keeps
    // calling the closure it was created with. Without it, entering an archive left the link saying live.
  }, [filters, selected, ramp, sectionLine, snapshot.archive, markId]);

  /*
   * Someone pasting a different link into an open tab. A fragment change does not reload and the
   * permalink is read once at module load, so the address bar would say one thing and the globe another.
   * Safe because `replaceState` does not fire `hashchange`, so the rewrite above cannot trigger this.
   */
  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash !== lastWritten.current) window.location.reload();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /*
   * The clock everything filters against, which in archive mode is the end of the archived day.
   *
   * Every window, strip and count here means "the last N hours before now", so against the wall clock an
   * archived day filtered to nothing: 702 events in the store and a headline of 0.
   *
   * The cost is that "3h ago" is relative to that day. The banner naming the date is load-bearing.
   */
  const now = snapshot.archive ? snapshot.archive.to : Date.now();

  // `to` is the wall clock, so the window slides out from under a parked cursor. Both the clock and the
  // clamp are handed over fresh for that reason.
  const span = { from: now - filters.windowMs, to: now };
  // Clamped on the way out, never written back. A cursor the window has slid past has to read as live,
  // and a render must not correct its own state.
  const fetching = pendingRev !== null && snapshot.revision === pendingRev;
  const view = clampScrub(scrub, span);
  /*
   * The moment the globe is lit by, and whether the moon's shadow is on it. One expression for both the
   * scene and the key, because a sentence disagreeing with the shadow beside it is worse than no sentence.
   *
   * Null on the live view rather than a timestamp, so the scene keeps its minute throttle instead of
   * re-aiming the sun every render for a change no eye could see.
   */
  const litAt = view.at ?? (snapshot.archive === null ? null : clockAt());
  const eclipseKey = litAt ?? Math.floor(Date.now() / 60_000) * 60_000;
  const eclipse = useMemo(() => {
    // Solar first. Both can never be true at once - one needs a new moon and the other a full moon - so
    // the order is for the reader: a shadow on the planet outranks a shadow on the moon.
    const solar = solarEclipse(eclipseKey);
    if (solar.touching) return { kind: solar.umbra > 0 ? "total" : "annular" } as const;
    return lunarEclipse(eclipseKey).umbral > 0 ? ({ kind: "lunar" } as const) : null;
  }, [eclipseKey]);
  /*
   * Everything between the capture and the `drawImage` must stay synchronous: the globe's drawing buffer
   * is gone the moment the browser composites. Encoding only starts once the pixels are on another canvas.
   */
  const [saving, setSaving] = useState(false);
  /*
   * The counts are read at capture, not listed as dependencies.
   *
   * They cannot be listed: `headline` is declared hundreds of lines below, so naming it is a
   * use-before-declaration. Leaving them out gave a poster with a blank evidence line from the first
   * render's empty planet. A still states what is on screen when the button is pressed.
   */
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
    drawStill(ctx, source, source.width, source.height, {
      // The day's start, not the clock. `clockAt()` returns `archive.to`, which `dayRange` makes
      // exclusive - the next day's midnight - so a still of the 15th was captioned the 16th.
      moment: stillMoment(
        view.at, feed.snapshot().archive?.from ?? clockAt(), feed.snapshot().archive !== null,
      ),
      // From `onGlobe`, the gated set, not the raw feeds. An archived day withholds the five layers, so a
      // still counting them would describe a different picture than the one above the caption.
      verdict: verdictLine(stillCounts.current),
      /*
       * The requested window, not the covered one. `windowLabel` qualifies itself by what the agencies
       * have vouched for, which printed "nothing yet" onto a still showing a full day. Coverage is a live
       * fact about the app and has no business stamped on an image.
       */
      filter: `M${filters.minMagnitude.toFixed(1)}+ · last ${compactSpan(filters.windowMs)}`,
      host: window.location.host,
    }, { background: token("void"), ink: token("ink"), faint: token("faint"), ramp });

    setSaving(true);
    frame.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // The moment in the filename, so a folder of these is sortable and none of them are ambiguous.
      a.download = `everything-is-fine-${new Date(view.at ?? Date.now()).toISOString()
        .replace(/[:.]/g, "-").slice(0, 19)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [filters.minMagnitude, filters.windowMs, view.at]);
  /*
   * What is actually on the globe while the cursor is parked. A held total above a globe drawing half of
   * it is a true number describing something else.
   *
   * Walked rather than read off the bars: the bars are whole hours and the cursor is continuous.
   */
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

  // The stops are captured when the tour starts, not read per tick, so a new arrival mid-tour cannot
  // reorder the route under the camera.
  const stops = useMemo(() => tourStops(regions), [regions]);
  const busiest = regions[0]?.count ?? 0;
  const [tourAt, setTourAt] = useState<number | null>(null);
  /*
   * Which stop the camera has reached, not which one it is flying to. The label and the flight change on
   * the same tick, so the rail named the destination while the globe still showed the last one: sampled
   * mid-tour it read "Japan & Kurils" at longitude -82.8, which is Chile.
   *
   * A ref and a stable setter, because `onCamera` is captured once when the scene is built.
   */
  const tourTarget = useRef<{ lon: number; lat: number; index: number } | null>(null);
  const [tourArrived, setTourArrived] = useState<number | null>(null);
  /*
   * The tour's own control is excluded from the end-on-interaction listener below. Otherwise pressing Stop
   * with a mouse is a race: `pointerdown` ends the tour, then the click handler reads whichever `tourAt`
   * React has committed - the stale one stops it, the fresh one starts it again.
   */
  const tourButton = useRef<HTMLButtonElement>(null);
  const route = useRef<ReturnType<typeof tourStops>>([]);
  const stopTour = useCallback(() => { setTourAt(null); }, []);
  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    route.current = stops;
    setTourAt(0);
  }, [stops]);
  // Any interaction ends the tour, which is the entrance replay's rule. Capture phase, so a click on a
  // rail button ends the tour as well as doing its own job.
  useEffect(() => {
    if (tourAt === null) return undefined;
    const stop = route.current[tourAt];
    if (!stop) { setTourAt(null); return undefined; }
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
  // Only once the camera is there. In transit the line would be describing somewhere else.
  const touring = tourAt !== null && tourArrived === tourAt ? route.current[tourAt] ?? null : null;

  const section = useMemo(
    // The slab only when it is switched on, so the axis and the drawing match what the globe is showing.
    () => (sectionLine
      ? buildSection(feed.store, sectionLine, filters, clockAt(), undefined,
        slabOn && slabData.length > 0 ? slabData : [])
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.store, sectionLine, filters, snapshot.revision, slabOn, slabData],
  );

  /*
   * The pinned event is looked up by key every render, never held as an object. The store revises a quake
   * in place, so a key stays valid while the contents change; an object would pin a stale snapshot and an
   * index would pin whatever later took the slot.
   */
  // Cannot be done at mount: on a cold load the store is empty for a second or two while both seeds land.
  useEffect(() => {
    if (!missingShared) return;
    const [source, id] = missingShared.split(":") as [SourceId, string];
    const found = feed.store.findByReading(source, id);
    if (found) {
      setSelected(found.key);
      setMissingShared(null);
    } else if (snapshot.stats.quakes > 0 && snapshot.statuses.usgs.kind === "live") {
      // Both feeds have answered and it is not here, so it aged out rather than not arriving yet.
      setMissingShared((current) => current);
    }
  }, [missingShared, snapshot.revision, snapshot.statuses.usgs.kind, snapshot.stats.quakes]);

  const pinned = selected ? feed.store.get(selected) : undefined;
  // The panel outlives the pin by one exit transition; see where it is rendered.
  const lastPinned = useRef(pinned);
  if (pinned) lastPinned.current = pinned;
  const shownQuake = pinned ?? lastPinned.current;
  /*
   * Every mark that is not an earthquake, shaped once here rather than inside the frame loop.
   *
   * Below the selection, because the far-side figure is one of these and needs the traced event's
   * position. Keyed on the id, so a figure whose event aged out goes with it rather than staying drawn
   * around an epicentre the app can no longer name.
   *
   * Gated on that event still being selected: the toggle lives in the panel, so with the panel dismissed
   * the arcs would sit there with no explanation and no way to turn them off.
   */
  const traced = farSideOf && farSideOf === selected ? feed.store.get(farSideOf) : undefined;
  const farSide = traced ? { lon: traced.primary.lon, lat: traced.primary.lat } : null;
  /*
   * How concentrated the window is along the plate edges. Keyed on the revision, not the clock. The band
   * and its 9.4% area share are measured in `boundaryDistance.ts` on a cos-weighted grid, so the figure
   * means area rather than a count of cells.
   */
  const quiet = useMemo((): {
    note: string | null; parts: { percent: number; times: number } | null;
  } => {
    // Vestigial now the boundary file is a static import. Kept so an empty file degrades to no note at
    // all rather than to a percentage of nothing.
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
  // Looked up at render, not captured on click. The feeds refresh every ten minutes, and a card built
  // from a snapshot would keep describing a storm the feed had dropped.
  // Built from `onGlobe` so the list holds exactly what is drawn: an archived day withholds the layers
  // and the list goes with them rather than offering rows that point at nothing.
  const hazards = useMemo(() => hazardGroups(onGlobe),
    [onGlobe.cyclones, onGlobe.volcanoes, onGlobe.fires, onGlobe.floods]);
  const markSubject = findSubject(markId, onGlobe);
  // Pinning an earthquake from anywhere clears the mark card. The rail's rows and the panel's sequence
  // steps all call `setSelected` directly, and a storm's card left beside it is two answers to one question.
  const selectQuake = useCallback((key: string | null) => {
    // Only on the way in. Dismissing is already confirmed by the panel leaving.
    if (key !== null) tick();
    setMarkId(null);
    setSelected(key);
  }, []);
  const marks = useMemo(
    () => marksFor({
      ...onGlobe, farSide, motion: motionOn ? motionData : [], here,
    }),
    [onGlobe.cyclones, onGlobe.volcanoes, onGlobe.fires, onGlobe.floods,
      farSide?.lon, farSide?.lat, motionOn, motionData, here],
  );
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  /*
   * Twenty ticks a second, not one per frame. Every tick re-renders the rail and re-syncs the event
   * layer, and a cursor is read rather than animated.
   *
   * Stepped by measured time, never by the interval it asked for: each tick drags a React render behind
   * it, so it fires late and a twelve second window took past fourteen.
   *
   * Deliberately not clamped. A backgrounded tab wakes to find the cursor has caught the present.
   */
  const playedAt = useRef(0);
  useEffect(() => {
    if (!scrub.playing) return undefined;
    playedAt.current = performance.now();
    const id = window.setInterval(() => {
      const tick = performance.now();
      const dt = (tick - playedAt.current) / 1000;
      playedAt.current = tick;
      // Fresh: `to` has moved since the interval was armed.
      const at = Date.now();
      setScrub((s) => stepScrub(s, { from: at - filters.windowMs, to: at }, dt));
    }, 50);
    return () => window.clearInterval(id);
  }, [scrub.playing, filters.windowMs]);

  /*
   * Escape's ladder, and the transport's keys.
   *
   * `,` and `.` rather than the arrows: the arrows are the camera, and that binding is not worth taking
   * off them. On the transport itself the arrows step a bucket too, where focus makes them unambiguous.
   *
   * Space and the step keys only while nothing is focused, the same rule the camera keys use, so space
   * keeps activating a focused button. Escape is not gated that way: it is an escape.
   */
  useEffect(() => {
    // Read at the press, not captured. `to` is the wall clock, so a span closed over when the listener
    // was armed is stale by however long the tab has been open.
    const spanNow = (): { from: number; to: number } => {
      const at = Date.now();
      return { from: at - filters.windowMs, to: at };
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        // One rung at a time, innermost first. Escape closing the pin and the section together would undo
        // two decisions with one press. The query box is innermost of all while it has text, which is why
        // it sits above the focus guard below rather than under it.
        if (query) setQuery("");
        else if (sectionLine) setSectionLine(null);
        else if (scrub.at !== null) setScrub(LIVE);
        else setSelected(null);
        return;
      }
      if (document.activeElement && document.activeElement !== document.body) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        const live = spanNow();
        setScrub((sc) => togglePlay(clampScrub(sc, live), live));
      } else if (e.key === "," || e.key === ".") {
        // No shift multiplier. Shift-comma is `<` on this layout and something else on the next, so it
        // could not be printed in the hint strip.
        const live = spanNow();
        setScrub((sc) => nudge(clampScrub(sc, live), live, e.key === "." ? 1 : -1));
      } else if (e.key === "f" || e.key === "F") {
        /*
         * The browser's chrome and the app's, together: either alone is half the gesture.
         *
         * Safe to hide the controls here because Escape is the way back and the browser provides it. The
         * app listens for the change rather than tracking a flag, so every exit route lands in one place.
         *
         * Requested on the frame, not on `documentElement`, so letterboxing takes the page's background.
         */
        const el = document.querySelector(".frame");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else if (el) void (el as HTMLElement).requestFullscreen?.().catch(() => {});
      } else if (e.key === "[" || e.key === "]") {
        // Days, where the comma and the full stop do buckets. No mode check: `stepDay` reads the feed and
        // returns when no archived day is loaded, so this is inert on the live view by construction.
        e.preventDefault();
        stepDay(e.key === "]" ? 1 : -1);
      } else return;
      // Space scrolls a page. Preventing it here means the transport does not depend on `overflow: hidden`
      // staying true.
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

  /*
   * What the globe shows, filtered identically, ordered by origin time.
   *
   * The store hands events back in arrival order, which is right for eviction and wrong for a list headed
   * "newest first". Sorting a pool of the 400 most recently arrived was silently wrong once a month's seed
   * became eleven thousand: USGS lists newest first, so the last 400 to arrive are the oldest.
   *
   * The store takes the filter too, so filtering cannot happen after a cap has thrown the answer away.
   */
  const recent = useMemo(
    () => feed.store.newest(60, (q) => matches(q, filters, clockAt())),
    [filters, snapshot.revision],
  );

  // Walks the whole buffer on every revision, but only ever to add to twenty-four counters.
  // The later of the two feed edges, not the earlier. `coveredSince` is the min, which is the honest left
  // edge of what the app holds; a corroboration rate needs the span where both agencies had eyes on.
  const overlapFrom = snapshot.covered.usgs !== null && snapshot.covered.emsc !== null
    ? Math.max(snapshot.covered.usgs, snapshot.covered.emsc)
    : null;

  const { bars, strongest, bucketMs, energyShare, energyTotal, overlap } = useMemo(
    () => histogram(feed.store.forEach, filters, now, snapshot.coveredSince, overlapFrom),
    // `now` is absent on purpose: it ticks every second and the bars only move on the bucket boundary.
    // `windowMs` is present because it decides the bucket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision,
      snapshot.coveredSince, overlapFrom],
  );

  // With the other buffer walk rather than in a render. `now` is absent on purpose: a second passing does
  // not change what matches a query, and depending on it re-walks fifty thousand events every second.
  const results = useMemo(
    () => search(query, feed.store, filters, clockAt()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  // One path for Enter and for a click. A region flies to its own framing; a place flies to its strongest
  // event and pins it, so arriving explains itself instead of leaving somebody on a patch of ocean.
  const pick = (hit: Hit): void => {
    if (hit.kind === "region") {
      flyTo.current(hit.region.lon, hit.region.lat, hit.region.zoom);
      return;
    }
    setSelected(hit.strongest.key);
    flyTo.current(hit.strongest.primary.lon, hit.strongest.primary.lat, 2.2);
  };

  // A full walk with a solar-time calculation per event: 10.8ms for a 50,000 event buffer, the same order
  // as the histogram walk beside it.
  const clockBins = useMemo(
    () => diurnal(feed.store.forEach, filters, clockAt()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  /*
   * The held bucket as a span, converted here, where the bucket width lives. A bucket is `windowMs / 24`,
   * so at a month it is thirty hours: the event layer used to multiply the index by an hour and every bar
   * lit the same recent hour. The strip keeps the index, which is what an index is for.
   */
  const focusSpan = useMemo(
    () => (focusHour === null
      ? null
      : { from: now - (focusHour + 1) * bucketMs, to: now - focusHour * bucketMs }),
    // `now` is absent for the reason the bars exclude it: re-deriving this per second would re-sync the
    // marker layer per second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusHour, bucketMs],
  );

  // On the revision, not every render: it walks the whole buffer and sorts it, and the rail re-renders
  // once a second for the clock.
  const sizes = useMemo(
    () => sizesOf(feed.store, filters, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.store, filters, snapshot.revision],
  );
  const hours = Math.round(filters.windowMs / 3_600_000);
  // Counts what is on the globe, not what is in the buffer. As `stats.quakes` it never moved: dragging
  // magnitude to 5.0 emptied the globe and the number beside it stayed put.
  // The strip spans exactly the window, so its total is the window's total. One walk, one number, and
  // the strip and the headline cannot disagree.
  const shown = totalIn(bars);

  // `useRolling` is handed the animate-or-jump distinction rather than inferring it, because the two
  // cases look identical from the value alone.
  const driven = replay !== null || view.at !== null;
  const headline = useRolling(replay ? replay.revealed : revealedNow ?? shown, !driven);

  /*
   * The count in the tab, so leaving the page open is worth something.
   *
   * Not during the replay: the count climbs through a whole day in 2.8 seconds, which is a flickering tab
   * rather than a readout, and it is showing yesterday anyway.
   *
   * An archived day says which day, or the tab reads as a live figure for a date chosen hours ago.
   *
   * Number first, because a tab is truncated from the right.
   */
  useEffect(() => {
    const base = "Everything Is Fine";
    if (replay || snapshot.coveredSince === null) {
      document.title = base;
      return;
    }
    // The day that is loaded, not the day in the box. `archiveDay` is the field's own text, so typing a
    // new date put half a date in the tab for a day nobody was looking at.
    const at = snapshot.archive;
    const day = at ? `${new Date(at.from).toISOString().slice(0, 10)} · ` : "";
    document.title = `(${headline.toLocaleString("en-GB")}) ${day}${base}`;
  }, [headline, replay, snapshot.coveredSince, snapshot.archive]);
  // `headline`, not the raw total, so the number stamped on the image is the number that was on screen.
  // While the cursor is parked the rolled value is what the globe is actually drawing.
  stillCounts.current = {
    quakes: headline,
    cyclones: onGlobe.cyclones.length,
    fires: fireSummary.count,
    firesCapped: fireSummary.count >= FEED_CAP,
    floods: onGlobe.floods.length,
  };

  const failing = (Object.entries(snapshot.statuses) as [SourceId, SourceStatus][])
    .flatMap(([id, status]) => (status.kind === "failing" ? [[id, status] as const] : []));

  /*
   * A shared cursor the window cannot hold. Without this the recipient sees the present and no reason why.
   *
   * Read off `scrub` against `view`, so it speaks only while the two disagree: once the cursor is moved by
   * hand, the link's moment is no longer what is being looked at.
   */
  /*
   * Both ways the clamp can refuse a moment. Testing `view.at === null` catches only the future branch;
   * a moment older than the window is pinned to `span.from`, still held, just not where the link asked.
   * That is the common case and the silent one. Comparing against the shared value covers both.
   */
  const staleCursor = shared.cursor !== undefined
    && scrub.at === shared.cursor
    && view.at !== shared.cursor;

  const edge = windowStart(now, filters.windowMs, snapshot.coveredSince);

  /*
   * Today against five years of days, or null when the comparison would not be true. Three gates: only at
   * 24h, because the baseline counts calendar days; only once the window is covered, because a day still
   * filling reads as quiet; and an archived day needs neither, being a finished day already.
   */
  // Held back during the replay: the window is being filled in front of the viewer, so "the closest
  // today" would name whichever event the animation had reached.
  const near = useMemo(() => {
    if (replay || here === null) return null;
    // `view.at` is the parked cursor, or null when live: the moment the globe is actually drawing.
    return closestTo(feed.store, here, filters, clockAt(), view.at ?? clockAt());
  }, [feed.store, here, filters, snapshot.revision, replay, view.at]);

  // Read from the browser, never remembered. A flag of our own drifts the moment somebody leaves by a
  // route the app did not start: Escape, the browser's control, another tab claiming the display.
  const [cinema, setCinema] = useState(false);
  useEffect(() => {
    const sync = (): void => setCinema(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const versus = useMemo(() => versusReference(energyTotal), [energyTotal]);

  // Keyed off `strongest`, which the histogram already found while walking the buffer, so this is a box
  // test and a table lookup rather than a pass of its own.
  const ceiling = useMemo(
    // As of the day on screen, not today: an archived day must not be handed a record from its own future.
    () => superlativeFor(strongest, snapshot.archive ? snapshot.archive.from : clockAt()),
    [strongest, snapshot.archive],
  );

  const baseline = useMemo(() => {
    if (replay) return null;
    if (snapshot.archive) {
      const { from, to } = snapshot.archive;
      return rankDay(comparableCount(feed.store, from, to), true);
    }
    if (filters.windowMs !== 24 * 3_600_000 || !edge.complete) return null;
    /*
     * Nothing drawn, nothing to rank.
     *
     * The count ignores the magnitude filter on purpose - a ranking the reader could change by dragging a
     * slider is worse than none - and that holds until the filter empties the screen. Filtering to M7
     * against a largest of 4.9 left the headline at 0 and this line asserting "5 at M4.5+".
     *
     * On the displayed count, not the window's: parking the cursor at the start of the window put "103 at
     * M4.5+" under a headline reading 0. `revealedNow ?? shown` is what the headline itself prints.
     */
    if ((revealedNow ?? shown) <= 0) return null;
    return rankDay(comparableCount(feed.store, edge.at, now), true);
  }, [feed.store, snapshot.archive, snapshot.revision, filters.windowMs, edge.complete, edge.at, now, replay, shown, revealedNow]);
  // On the clock, not memoised. It reads `now`, and the reach it names is a moving distance from the
  // present: keyed on the revision it would freeze "18h" at whatever it was when the last event landed.
  const sourceNote = reachNote(snapshot.covered, now, filters.windowMs);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  const legend = (
    <>

              <MagnitudeFilter
                ramp={ramp}
                value={filters.minMagnitude}
                onChange={(v) => setFilters((f) => ({ ...f, minMagnitude: v }))}
                aurora={onGlobe.aurora}
                cyclones={onGlobe.cyclones}
                volcanoes={onGlobe.volcanoes.length}
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
                onKeyOpen={changeKeyOpen}
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
                slabOn={flat && sectionLine === null ? null : slabOn}
                onSlab={setSlabOn}
                slabCount={slabData.length}
              >
              {/*
                Passed in as a child so the sources land above the folding key. At the bottom of a
                scrolling column they were off the fold at 1280x720: a control reached by scrolling prose.
              */}
              {/* Two toggles need a name. Without one a screen reader meets two unexplained pressed-states
                  and a sighted reader meets two large unlabelled buttons. */}
              <div className="mt-3">
              <span className="label block">Feeds</span>
              <div role="group" aria-label="Feeds" className="mt-1 flex gap-1.5">
                {(["usgs", "emsc"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleSource(id)}
                    aria-pressed={filters.sources.has(id)}
                    /*
                      Sized to their labels, not to the panel. `flex-1` gave each half the key's width,
                      making two secondary filters the heaviest things in it.

                      Pressed is `border-faint`, matching the detail panel and the window buttons. On
                      hover instead, the state you were about to enter looked like the state you were in.
                    */
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

    </>
  );

  return (
    <div className="frame">
      {/* A top edge, so the frame closes. The rail has `xl:border-r` and the panel a `border-l`, and above
          1280 this header is transparent: without the hairline the chrome has two walls and no lid. */}
      <header className="zone-head flex items-center gap-6 bg-deck px-5 py-3 xl:border-b xl:border-hairline xl:bg-transparent" hidden={cinema}>
        <div
          /*
            Aligned to the first row of controls, not to the middle of them. The group wraps to two rows on
            a phone, and `items-center` then floated the wordmark between them, leaving "Still" orphaned
            diagonally opposite. Scoped to `max-md`, which is exactly where the wrap happens.
          */
          className="text-[13px] font-semibold tracking-[0.16em] whitespace-nowrap max-md:self-start max-md:pt-1"
        >
          {/* "FINE" on a phone, the full sentence from `md` up. One extra button already pushed this
              header 120px past a phone viewport, and this wordmark is half again as long. */}
          <span className="md:hidden">FINE</span>
          <span className="hidden md:inline">EVERYTHING IS FINE</span>
        </div>
        {/* Four zeros are four numbers that mean nothing. The status on the right already says what is
            happening while there is nothing to count. */}
        {/*
          The counts wait for a wide screen. From `sm` up they took ~380px of a 768px header and forced the
          control group into four rows, a 150px bar over a tablet's canvas. The rail carries them too.
        */}
        {/*
          Whose number it is, said out loud.

          These are ingest totals and they ignore the filters. Set magnitude to 4 and the headline reads 5
          while this row says 160: two numbers a factor of thirty apart in one viewport. So the globe's
          count lives in the title block under "last 24 hours", and this row says "reported".

          The per-agency figures are readings, not events - one event seen twice is two readings - so they
          sit at the end as provenance.
        */}
        <div className={`hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "xl:flex"}`}>
          {([
            // Grouped like the readings beside it: "1600 reported" next to "USGS 1,600" was one row
            // formatting the same kind of number two ways.
            ["reported", snapshot.stats.quakes.toLocaleString("en-GB")],
            ["seen by both", snapshot.stats.corroborated.toLocaleString("en-GB")],
            // Only once it has happened. A permanent "0 revised" reserves a header slot for nothing.
            ...(snapshot.stats.revised > 0
              ? [["revised", snapshot.stats.revised.toLocaleString("en-GB")] as const]
              : []),
          ] as const).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink tabular-nums">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
          {/* Figures in mono, words in sans, like the pair beside this. The mono spans sit on the mono
              step: 10.5 beside 11 is the optical match, because mono digits read larger. */}
          <span className="text-[11px] text-faint">
            USGS <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.usgs.toLocaleString("en-GB")}
            </span>
            {" · EMSC "}
            <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.emsc.toLocaleString("en-GB")}
            </span> readings
          </span>
        </div>
        {/*
          Never `whitespace-nowrap` here: it does not shrink, it overflows, and one extra button pushed the
          header 120px past a phone viewport. Controls stay and informational labels drop as room runs out.
        */}
        {/*
          Wraps on a narrow screen. At 375px the last of five buttons was clipped off the right edge rather
          than scrolling into reach, and horizontal scroll is a build failure here anyway. A second header
          row on a phone is the cheaper loss than a button nobody can press.
        */}
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
            {/* Short form up to `lg`, not `md`: at 768 the long label is 140px of a header that now has
                five controls in it. */}
            <span className="lg:hidden">Ramp {ramp === "cividis" ? "CB" : "std"}</span>
            <span className="hidden lg:inline">
              Colourblind ramp {ramp === "cividis" ? "on" : "off"}
            </span>
          </button>
          {/*
            Sound. No slider of its own: it follows the announce threshold, because "tell me about events
            above this" is one idea and the rail already has the control for it. See DESIGN.md 12b.
          */}
          <button
            type="button"
            onClick={() => setSound((on) => !on)}
            aria-pressed={sound}
            className={`${moreOpen ? "" : "max-md:hidden"} shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
              sound ? "bg-raised text-ink" : "text-faint"
            }`}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          {/* Only when there is somewhere to go. Over an empty window the tour is a camera flying around a
              planet with nothing on it. */}
          {stops.length > 0 ? (
            <button
              ref={tourButton}
              type="button"
              onClick={() => (tourAt === null ? startTour() : stopTour())}
              aria-pressed={tourAt !== null}
              className={`${moreOpen ? "" : "max-md:hidden"} shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
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
            className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-default ${moreOpen ? "" : "max-md:hidden"}`}
          >
            {saving ? "Saving…" : "Still"}
          </button>
          {/* The three above fold away on a phone. Five controls want 419px of a 390px header, and the wrap
              left "Still" and the status dot alone on a second line. Map and the ramp stay out: one is the
              projection, the other an accessibility control, and neither should cost a tap. */}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink md:hidden"
          >
            {moreOpen ? "less" : "more"}
          </button>
          <span className="flex items-center gap-2 text-[11px] whitespace-nowrap text-dim">
            <span
              className={`inline-block size-[6px] rounded-full ${
                snapshot.archive ? "bg-faint" : live === 2 ? "bg-ink" : live === 1 ? "bg-dim" : "bg-faint"
              }`}
            />
            {/*
              While an archived day is on screen this says the day, not the feeds. Read from the snapshot,
              so one place decides whether the app is claiming to be live.

              The two halves hide differently on purpose. "Everything is normal" is reassurance and the dot
              carries it; "this is not what you think" is a correction, and absence is its failure mode. So
              the date always shows and only the live phrase folds.
            */}
            {snapshot.archive ? (
              <span className="font-mono">
                {new Date(snapshot.archive.from).toISOString().slice(0, 10)}
              </span>
            ) : (
              <span className="hidden sm:inline">
                {live === 2 ? "both feeds live" : live === 1 ? "one feed live" : "connecting"}
              </span>
            )}
          </span>
        </div>
      </header>

      <div
        className="zones"
        style={{
          "--rail-w": `${railWidth}px`,
          "--regions-h": `${regionsHeight}px`,
        } as React.CSSProperties}
      >
        <aside className="zone-rail rail border-hairline bg-deck p-5 max-xl:border-b xl:border-r" hidden={cinema}>
          <div className="titleblock">
          <div className="tb-cell tb-wide" data-rail="headline">
            {/* Before any coverage exists there is no count, and a big 0 over "nothing yet" was two
                disclaimers under a number that meant nothing. */}
            {snapshot.coveredSince === null ? (
              <div className="mt-2 max-w-[30ch] text-[14px] leading-snug text-dim">
                {/* Which day, when the day is not today. `archive` and `coveredSince` are both set by the
                    same success handler, so a page opened straight at a past day said "the last day" about
                    2011 until the answer landed. `archiveDay` is set before the fetch starts. */}
                {/*
                  "Asking" stops being true once both feeds have answered no. Eighteen seconds into a total
                  outage the rail read "Asking USGS and EMSC" above "USGS is not answering. Retrying at
                  17:30". Only when both are failing: one feed down is a caveat the notice already carries.
                */}
                {snapshot.statuses.usgs.kind === "failing" && snapshot.statuses.emsc.kind === "failing"
                  ? "Neither feed is answering yet."
                  : archiveBusy && archiveDay
                    ? `Asking USGS and EMSC for ${archiveDay}.`
                    : "Asking USGS and EMSC for the last day."}
              </div>
            ) : (
              <>
                {/* During the replay this counts what is on the globe, climbing as the day plays in. The
                    held total sat unchanged while the globe filled beneath it. */}
                {/*
                  Rolled only when the change is discrete. The replay and the parked cursor already climb it
                  a frame at a time, and there the number has to be exactly what is drawn. What was left
                  snapping is a live arrival and a window change from 872 to 11,363.
                */}
                <div className="mt-1.5 text-[38px] leading-none font-semibold tabular-nums">
                  {headline.toLocaleString("en-GB")}
                </div>
                {/* During the replay the rail shows the replayed clock, labelled: "since 22:35" over a
                    globe filling with yesterday would describe one thing and show another. */}
                {/* The tour narrates in the replay's own slot. Every stop says where it is and how much is
                    there, which is what keeps the camera movement from being a screensaver. */}
                {touring ? (
                  <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-ink tabular-nums">
                      {tourAt !== null ? tourAt + 1 : 0}/{route.current.length}
                    </span>
                    <span className="text-faint">
                      {tourLabel(touring, tourAt ?? 0, route.current.length)
                        .replace(/^\d+ of \d+ · /, "")}
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

          {/* The list is newest first, so a magnitude 6 from eight hours ago sits forty rows below forty
              magnitude 2s. This is the one fact a person actually wants. */}
          {strongest && !replay ? (
            <button
              type="button"
              /*
                An entry point that is not "now". At a month, this minute is the least interesting moment
                in the buffer. The cursor parks at the event's own origin - the moment it was the newest
                thing on Earth - so the sequence strip shows what came next before the globe has drawn it.
              */
              onClick={() => {
                setSelected(strongest.key);
                flyTo.current(strongest.primary.lon, strongest.primary.lat, 1.9);
                // Through `clamp`, so an event that is already the most recent hands back to live rather
                // than parking a moment behind the present.
                setScrub(clampScrub({ at: strongest.primary.time, playing: false }, span));
              }}
              aria-label={`Largest: magnitude ${strongest.primary.magnitude.toFixed(1)}, `
                + `${place(strongest.primary.place)}, ${ago(strongest.primary.time, now, archived)}. `
                + "Go there and hold the window at that moment."}
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
              {/* On the ramp, and marked as such, because a coloured number in the rail is hue outside the
                  canvas. One number is a focal point; the sixty in the list below would be a rainbow, and
                  that list carries magnitude by position and figure instead. */}
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
          {/* One cell, because it is one fact. `QUIET_BAND_KM` is not a control, it is the width the
              percentage is a percentage of, so it reads as part of the sentence rather than as a fourth
              measurement of equal standing. */}
          {!replay && quiet.parts !== null ? (
            <div className="tb-cell tb-wide">
              <span className="label">On edge</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-[13px] tabular-nums text-ink">
                  {quiet.parts.percent}%
                </span>
                <span className="text-[11px] text-dim">within {QUIET_BAND_KM} km</span>
              </span>
            </div>
          ) : null}
          </div>

          {/* Magnitude is logarithmic and almost nobody carries that around: two points is a thousandfold
              of energy, so one large event routinely accounts for 99 percent of a month. The clause after
              the share is there because a number that high otherwise reads as a bug. */}
          {/* Held back until the window is covered. At a month with only the hourly poll in, the rail
              printed "86% of the energy released in the window" under "Asking USGS and EMSC for the last
              day": a claim about thirty days computed from one hour of it. */}
          {/*
            One tenant for the notes area, because the grid has one slot. Only `.tb-notes` is named, so
            anything else here auto-places into an implicit row: measured at 900x1000, one extra paragraph
            added 54px to a strip already overflowing by 250. The rail scrolls, so nothing looks broken
            while the transport goes under the fold.
          */}
          <div className="tb-stack">
            {!replay && quiet.note ? (
              <div className="tb-notes">
                <span className="label">Notes</span>
                <p className="text-[11px] leading-relaxed text-faint">{quiet.note}</p>
              </div>
            ) : null}
            {/* Beside the notes, not in the legend: an explanation of an absent layer cannot live inside
                the layer's own absent row. */}
            {!archived && silentFeeds(answered) ? (
              <div className="tb-notes">
                <span className="label">Feeds</span>
                <p className="text-[11px] leading-relaxed text-faint">{silentFeeds(answered)}</p>
              </div>
            ) : null}
            {strongest && !replay && edge.complete && energyShare !== null && energyShare > 0.5 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                That one event is{" "}
                <span className="text-dim tabular-nums">{energyPercent(energyShare)}</span> of the energy
                released in the window. Magnitude is logarithmic: two points of it is a thousand times the
                energy.
              </p>
            ) : null}
            {/*
              Whether any of that is a lot, which nothing else on this screen said.

              It states its own threshold because it has to: how many small events get detected depends on
              how many instruments are nearby, so an all-magnitude count differs between 2020 and 2025 for
              reasons of funding rather than of geology.
            */}
            {baseline ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                <span className="text-dim tabular-nums">{baseline.count}</span>
                {" at M"}<span className="tabular-nums">{BASELINE_MIN_MAGNITUDE}</span>{"+: "}
                {baseline.direction} than{" "}
                <span className="text-dim tabular-nums">{sharePercent(baseline.share)}%</span> of the{" "}
                <span className="tabular-nums">{BASELINE_DAYS.toLocaleString("en")}</span> days from{" "}
                {BASELINE_FROM} to {BASELINE_TO}.
              </p>
            ) : null}
            {/*
              A magnitude with nothing beside it is the same defect as a bare count: "M6.1, Japan & Kurils"
              reads as enormous and is an ordinary week there.

              Two forms. Most days this states the region's ceiling; on the day the window clears it, the app
              has a real superlative. "Since at least 2000" is where the generated table starts.
            */}
            {/* Silent when nothing is drawn: the region comes from the window's strongest event, so a
                cursor parked before anything arrived named Indonesia beside an empty globe. */}
            {ceiling && strongest && !replay && edge.complete && (revealedNow ?? shown) > 0 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                {ceiling.beaten ? (
                  <>
                    {"Larger than anything in "}{ceiling.region}{" from "}{SINCE}{" to "}{UNTIL}
                    {". Previous best: M"}
                    <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
                    {", "}{recordWhen(ceiling.day)}{"."}
                  </>
                ) : (
                  <>
                    {"Largest in "}{ceiling.region}{", "}{SINCE}{" to "}{UNTIL}{": M"}
                    <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
                    {", "}{recordWhen(ceiling.day)}{"."}
                  </>
                )}
              </p>
            ) : null}
            {/* The share teaches the logarithm inside one window and has nothing outside itself to be
                measured against, so a quiet day and a catastrophic one both read as "one event was most of
                it". This is the same fact with an outside reference. */}
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
            {/*
              It names a city, not a person. A timezone is a region - Asia/Shanghai covers all of China - so
              "310 km from you" would be a confident claim about somebody built from a reference point.

              The arrival time appears only inside 700km, because past that the wave is diving through the
              mantle and a crustal speed stops describing its path.
            */}
            {near && here ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Closest to {here.label} was{" "}
                <span className="text-dim tabular-nums">{magnitude(near.quake.primary)}</span>{" "}
                {place(near.quake.primary.place)},{" "}
                <span className="text-dim tabular-nums">
                  {Math.round(near.km).toLocaleString("en")}
                </span>
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

          <details data-rail="diurnal">
            <summary className="disclose text-[11px] text-faint hover:text-dim">
              Time of day
            </summary>
            <Dial counts={clockBins} />
          </details>

          {/*
            The key floats only where there is somewhere for it to float. On the globe that corner is ocean.
            The flat map fills its whole rectangle, so a panel over it permanently hides part of the Pacific
            and panning cannot get out from under it - so flattened, the key goes back to the rail.
          */}
          {onMap && !flat ? null : <div data-rail="legend">{legend}</div>}

          {/*
            Under the strip, not in the header: the window buttons choose how much of the recent past to
            show and this chooses a different past entirely. In the header it would read as a view option.

            The banner is what stands between this feature and a globe showing last March while the
            interface says live, so it is the widest thing in the rail while it is up.
          */}
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
                  {new Date(snapshot.archive.from).toISOString().slice(0, 10)}, all day UTC. Nothing here
                  is arriving now.
                </p>
                {/* Disabled while a day is in flight: two overlapping archive loads race, and the second
                    answer is not necessarily the second request. Forward stops at yesterday. */}
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
                {/* What is genuinely absent is the aurora, and permanently: a forecast for a stamped
                    minute has no past to ask for. The other four come from a different upstream. */}
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  Storms, fires, floods and volcanoes come from NASA rather than the live feeds. No aurora:
                  it is a forecast, so there is no past to ask for.
                </p>
                {archiveNote ? (
                  <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-faint">{archiveNote}</p>
                ) : null}
              </div>
            ) : (
              /* Label above, not beside. Side by side the label and "go" took the fixed width and left the
                 date field 60px in the 768px strip, under the touch minimum. */
              <div className="mb-3">
                <label className="label" htmlFor="archive-day">Go to a day</label>
                <div className="mt-1 flex items-center gap-1.5">
                {/*
                  ISO text, not `type="date"`. The native widget asks for `mm/dd/yyyy`, a format this app
                  never prints, so a day could not be copied out of the notable list and pasted in. The
                  loss is the touch calendar, and the notable list is the way in for anybody without a date.
                */}
                <input
                  id="archive-day"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="YYYY-MM-DD"
                  aria-describedby={dayFault ? "archive-day-fault" : undefined}
                  value={archiveDay}
                  // Digits in, hyphens ours. See `typedDay`.
                  onChange={(e) => setArchiveDay(typedDay(e.target.value))}
                  onKeyDown={(e) => {
                    // Enter is what a text field promises and a date picker did not have to.
                    if (e.key === "Enter" && !archiveBusy && isArchivableDay(archiveDay, Date.now())) {
                      e.preventDefault();
                      void loadArchive(archiveDay);
                    }
                  }}
                  className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1 font-mono text-[10.5px] text-dim placeholder:text-faint"
                />
                <button
                  type="button"
                  disabled={archiveBusy || !isArchivableDay(archiveDay, Date.now())}
                  onClick={() => void loadArchive(archiveDay)}
                  className="shrink-0 cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:cursor-default disabled:text-faint"
                >
                  {archiveBusy ? "…" : "go"}
                </button>
                </div>
                {/* Said where it was caused: `archiveNote` renders in the archived banner, which is the
                    other branch of this ternary, so a day refused while live set a message nobody saw. */}
                {dayFault ? (
                  <p id="archive-day-fault" className="mt-1 text-[11px] leading-relaxed text-faint">
                    {dayFault}
                  </p>
                ) : null}
              </div>
            )}
                {/*
                  Outside the archived/live branch on purpose. Inside it the list vanished the moment a day
                  loaded, so Valdivia to Tōhoku meant going back to live and waiting for the feeds to seed.
                  Closed by default: it is a way in, not a menu.
                */}
                <details
                  className="mt-2"
                  onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) askCounts(); }}
                >
                  <summary className="disclose text-[11px] text-faint hover:text-dim">
                    Days worth seeing
                  </summary>
                  <div className="mt-1">
                    {NOTABLE_DAYS.map((d) => (
                      <button
                        key={d.day}
                        type="button"
                        disabled={archiveBusy}
                        onClick={() => { setArchiveDay(d.day); void loadArchive(d.day); }}
                        aria-label={`${d.what}, magnitude ${d.magnitude}, ${d.day}`
                          + (typeof dayCounts[d.day] === "number"
                            ? `, ${dayCounts[d.day]!.toLocaleString("en-GB")} events`
                            : "")}
                        /* Marks the day on screen. `aria-current` says it to a screen reader rather than
                           leaving the tint to carry it alone. */
                        aria-current={loadedDay === d.day ? "true" : undefined}
                        className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left transition-colors hover:bg-raised disabled:cursor-default ${
                          loadedDay === d.day ? "bg-raised" : ""
                        }`}
                      >
                        <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                          {d.day}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{d.what}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
                          M{d.magnitude.toFixed(1)}
                        </span>
                        {/* Blank until it answers, and blank if it never does. A dash or a zero would be a
                            claim about the day rather than about the request. */}
                        <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-faint tabular-nums">
                          {dayCounts[d.day] === undefined || dayCounts[d.day] === null
                            ? ""
                            : dayCounts[d.day]!.toLocaleString("en-GB")}
                        </span>
                      </button>
                    ))}
                    {/* Required, not decoration: 1960 returns six events against Tōhoku's 685, and a true
                        number here reads as a claim about the planet. */}
                    <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{NOTABLE_NOTE}</p>
                  </div>
                </details>
                {/*
                  Its own list, because the one above requires a magnitude and an eclipse has none.

                  Sets the cursor as well as the day. The shadow lasts a few hours and an archived day opens
                  at its right edge, so loading only the day lands after the thing the row names. The times
                  are checked against the geometry in `eclipseDays.test.ts`: a wrong minute fails silently.
                */}
                <details className="mt-2">
                  <summary className="disclose text-[11px] text-faint hover:text-dim">
                    Eclipses
                  </summary>
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

            {/* A rule between choosing a day and reading one. Without it, "Days worth seeing" sat 12px
                above the 24h/7d/30d buttons and read as their label. */}
            <hr className="my-3.5 border-t border-hairline" />
            <Timeline
              bars={bars}
              archived={archived}
              ramp={ramp}
              hours={hours}
              focusHour={focusHour}
              onFocusHourChange={setFocusHour}
              onHoursChange={(h) => {
                const windowMs = h * 3_600_000;
                setFilters((f) => ({ ...f, windowMs }));
                /*
                 * The cursor goes live rather than being clamped: 40% through a day and 40% through a month
                 * are not the same moment, and keeping the number would move the viewer in time without
                 * them touching the cursor.
                 */
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
              reaches={(["usgs", "emsc"] as const).map((id) => ({
                id,
                label: SOURCE_NAMES[id],
                fraction: reachFraction(snapshot.covered[id], now, filters.windowMs),
                words: reachWords(
                  snapshot.covered[id],
                  snapshot.statuses[id].kind === "failing",
                  now,
                  filters.windowMs,
                ),
              }))}
              notes={[
                sourceNote,
                corroborationNote(overlap, overlapFrom, now, filters.windowMs),
              ].filter((n): n is string => n !== null)}
            >
              <details className="mt-3">
                <summary className="disclose text-[11px] text-faint hover:text-dim">
                  How the sizes stack up
                </summary>
                <SizeChart sizes={sizes} />
              </details>
            </Timeline>
          </div>

          {/* All twelve in a resizable box. Truncating to four cut exactly the region with two events,
              which is what somebody scanning for where today is quiet came to see. */}
          {/* Open when there is either kind of thing to list. Gated on the region rows alone it tied the
              hazard list to the earthquake feed, and the five layers do not depend on the two agencies. */}
          {regions.length > 0 || hazards.length > 0 ? (
            <div data-rail="regions" className="relative">
              {regions.length > 0 ? (
                <>
              {/*
                Label above the field until the column is wide enough to spare the room. A label sharing a
                row takes its width first: at 768px this column is ~180px and the field was left with 87px
                for a 134px placeholder, so it read "a region or a pla".
              */}
              <div role="search" className="mb-1.5 flex flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-2">
                <label htmlFor="find" className="label shrink-0">Find</label>
                <input
                  id="find"
                  /*
                    Text, not `type="search"`: that brings a user-agent cancel button with user-agent styling
                    into chrome whose rule is that it carries none. Escape already clears this.
                  */
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  /* Enter takes the first result. Without it the only way through was Tab, and a field that
                     swallows Enter reads as one that did not understand the query. */
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const first = results.hits[0];
                    if (first) pick(first);
                  }}
                  placeholder="a region or a place"
                  autoComplete="off"
                  spellCheck={false}
                  /*
                    The same box and the same focus ring as the day field. This one replaced the global focus
                    outline with a border tint, which a keyboard user has to hunt for.

                    Font and size stay different: a day is a formatted number and reads in mono, a place name
                    is prose and does not.
                  */
                  className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1
                    text-[12px] text-ink placeholder:text-faint"
                />
              </div>
              <div ref={regionsRef} className="rail-regions">
                {query ? (
                  results.hits.length > 0 ? (
                    <>
                      {results.hits.map((hit) => (hit.kind === "region" ? (
                        <Row
                          key={`r:${hit.region.name}`}
                          label={hit.region.name}
                          trail={`${hit.count}`}
                          onClick={() => pick(hit)}
                        />
                      ) : (
                          /* Both numbers, because either alone misleads: a count with no size, or a size
                             with no idea whether it stands for one event or three hundred. */
                        <Row
                          key={`p:${hit.name}`}
                          label={hit.name}
                          trail={`${hit.count} · M${hit.strongest.primary.magnitude.toFixed(1)}`}
                          onClick={() => pick(hit)}
                        />
                      )))}
                      {/* A cap that does not say so reads as "that is everything". */}
                      {results.more > 0 ? (
                        <p className="px-1.5 pt-1.5 text-[11px] leading-relaxed text-faint">
                          {`${PLACE_LIMIT} of ${PLACE_LIMIT + results.more} places. `}
                          Narrow the query to see the rest.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    /* Which of the two nothings this is. There is no gazetteer behind this and cannot be
                       one keylessly, so a real place with no seismicity looks exactly like a typo. */
                    <p className="px-1.5 py-1 text-[11px] leading-relaxed text-faint">
                      Nothing in the {hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}
                      {" "}on screen. This searches the named regions and the places these two agencies
                      put on the events it holds, not a map of the world.
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

              {/*
                Inside the regions block, not a rail block of its own: the 768-1279px strip is a four-column
                grid with every cell named, and an unnamed sixth block auto-places into a new row and makes
                the strip taller.

                Closed by default. A hundred and thirty rows would bury everything below, and "133 marks"
                in the summary is the part most people want.
              */}
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
                            <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
                              {row.name}
                            </span>
                            {row.measure ? (
                              <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                                {row.measure}
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
            <div data-rail="notice" className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
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
            <p data-rail="notice" className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
              {/* Two refusals, two sentences: "this is the present instead" is false when the clamp pinned
                  the cursor to the buffer's oldest edge rather than releasing it. */}
              {view.at === null
                ? "The moment in this link is outside the window, so this is the present instead."
                : "The moment in this link is older than the window, so this is the oldest moment the "
                  + "buffer still holds."}
            </p>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p data-rail="notice" className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
              {/* An archived day is not a rolling buffer. "No longer in the window" describes a day that
                  slides, and on a loaded past day the event was never in it rather than having fallen out. */}
              {archived
                ? `The event in this link is not in ${loadedDay ?? "this day"}. `
                  + "The whole day is loaded, so this is not a gap in coverage."
                : "The event in this link is no longer in the window. The buffer holds the last day, "
                  + "and it starts when the page opens."}
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
            /* Unfiltered on purpose: deselecting both sources is a filter and should be blamed, while a day
               that reported nothing at all should not be. */
            reported={snapshot.stats.quakes}
            now={now}
            archived={archived}
          />

          {/* Styled rather than left to the browser: an unstyled `a` takes the user-agent blue, in the one
              app whose chrome is held under a chroma ceiling and tested for it. */}
          <p className="mt-4 pt-1 text-[11px] text-faint">
            made by{" "}
            <a
              href="https://www.aidenjang.com"
              target="_blank"
              rel="noreferrer"
              /*
                `inline-flex`, not inline. `min-height` has no effect on a non-replaced inline element, so
                the 44px touch minimum slid straight off an inline `a` and the finger test caught it at 14px.
              */
              className="inline-flex items-center text-faint underline decoration-from-font underline-offset-2 transition-colors hover:text-dim"
            >
              aiden jang
            </a>
          </p>
        </aside>

        <Resizer
          axis="x"
          label="Rail width"
          value={railWidth}
          min={264}
          max={620}
          measure={(e) => e.clientX}
          onChange={setRailWidth}
          /* Hidden with the rail it resizes. The handle is a sibling, not a child, because the border lives
             on it - so left behind it is a one-pixel bright line down a frame containing nothing but planet. */
          className={cinema ? "hidden" : "absolute inset-y-0 hidden xl:block"}
          style={{ left: railWidth - 6 }}
        />

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
            /*
              Which moment the light is of. `clockAt` is the app's answer to what time is on screen, and a
              held cursor overrides it with the same precedence `stillMoment` uses, so the terminator and the
              caption cannot disagree.

              Null on the live view rather than a timestamp, so the scene keeps its minute throttle instead
              of re-aiming the sun every render for a change no eye could see.
            */
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
            onSelectMark={setMarkId}
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
            /*
              Stops where whichever panel is open starts, the same way it stops at the rail. Full width, it
              truncated the key hints and hid a fifth of the cross-section behind the panel.
             *
              Both panels, not just the pinned earthquake. They share one slot, so a mark card is exactly as
              wide and exactly as much in the way - and the band is right-aligned, so the legend is the first
              thing under it. Clicking a flood covered "MAGNITUDE 2.0 AND ABOVE" entirely.
             *
              `pinned` rather than `shownQuake` on the earthquake side, because that panel is held past the
              unpin to animate out and the band should give the width back at once. A mark card unmounts on
              the spot, so `markSubject` alone is the same rule.
            */
            className={`pointer-events-none absolute bottom-0 left-0 z-[1] flex flex-wrap items-end justify-end gap-x-6 gap-y-3 p-4 xl:left-[var(--rail-w)] ${
              markSubject || (shownQuake && pinned) ? "right-0 xl:right-[var(--panel-w)]" : "right-0"
            }`}
            hidden={cinema}
          >
            {/* The section joins the bottom band as a full-width line, last, so it is flush with the bottom
                edge. Placed first it floated mid-canvas and read as the map having been cut in half. */}
            {section ? (
              /*
                Fully desaturated and deeper than the other rail panels, because this one is a drawing. At
                half saturation the map's cluster glowed magenta through it and the slab's 1.6px dots were
                lost outright.
              */
              <div className="order-9 -mx-4 -mb-4 w-[calc(100%+2rem)] bg-deck/70 px-4 pt-3 pb-4 backdrop-blur-2xl backdrop-saturate-0">
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
            {onMap && !flat ? (
              /*
                Capped and scrolling, because the legend outgrew the screen. At 1280x720 the panel reached
                845px, putting the magnitude slider 104px above the top of the window with nothing in the
                ancestor chain to catch it. The control is at the top and the prose below, so capping keeps
                the slider in view and scrolls the explanation.

                Underscores in the `calc`: CSS needs whitespace around the `-` or `-4.5rem` parses as a
                negative number and the whole declaration is dropped, silently. `dvh`, not `vh`.
              */
              <div className="pointer-events-auto order-1 max-h-[calc(100dvh_-_4.5rem)] w-full max-w-[300px] overflow-y-auto bg-deck/40 p-3 backdrop-blur-2xl backdrop-saturate-50 xl:order-2">
                {legend}
              </div>
            ) : null}
            <div
              /*
                A ground under it, like the legend and the section band, so a row of monospace keys is a chip
                of chrome rather than console output lying on the planet. Square and unbordered: the corners
                in this app are ticks or nothing.
              */
              className="key-hints pointer-events-auto order-2 bg-deck/40 px-2.5 py-1.5 font-mono text-[10.5px] text-faint backdrop-blur-xl backdrop-saturate-50 xl:order-1"
            >
              {/* What the keys do here, not on the globe. Arrows orbit a sphere and pan a map, and a hint
                  row that says orbit while the drag pans is worse than none. */}
              {([
                ["arrows", flat ? "pan" : "orbit"],
                ["+ -", "zoom"],
                ["0", "reset"],
                ["space", view.playing ? "pause" : "play"],
                [", .", "step"],
                // Only on a loaded day. Naming an inert key is worse than being short.
                ...(archived ? [["[ ]", "day"] as const] : []),
                ...(flat ? [["shift-drag", "section"] as const] : []),
                // Last but for `esc`: it changes the window rather than the view, so somebody scanning for
                // camera keys should not trip over it first.
                ["f", "full"],
                /*
                 * Only when there is something to clear. `esc` walks one rung at a time - search box,
                 * section, held cursor, pin - and with all four empty it does nothing, which is the app's
                 * state on every first load.
                 */
                ...(query || sectionLine || view.at !== null || selected
                  ? [["esc", "clear"] as const]
                  : []),
              ] as const).map(([key, what]) => (
                <span key={key} className="mr-3 inline-flex items-baseline gap-1.5">
                  <span className="text-dim">{key}</span>
                  {what}
                </span>
              ))}
            </div>

          </div>
        </main>

        {/*
          Cinema hides the chrome. It must not hide which day this is.
          Pressing `f` hid all four statements of the date, and a fullscreen window has no tab title either,
          so a viewer saw 2011's earthquakes with nothing saying it was not this morning. Hide controls and
          commentary; keep any sentence that stops the picture being misread. A held cursor counts too.
          Take the wording from `stillMoment` and the day from the snapshot, not the field, which is text
          somebody is still typing.
        */}
        {cinema && (snapshot.archive !== null || view.at !== null) ? (
          <div className="stamp pointer-events-none absolute bottom-4 left-4 z-[2] bg-deck/40 px-3 py-2 font-mono text-[11px] text-faint backdrop-blur-xl backdrop-saturate-50">
            {stillMoment(view.at, snapshot.archive ? snapshot.archive.from : clockAt(), snapshot.archive !== null)}
          </div>
        ) : null}

        {/* Held past the unpin so the panel can leave. A conditional mount has no exit: React removes the
            node on the same frame, and a transition on a removed node never runs. */}
        {/* One zone, not two. The layout has a slot for "the thing being asked about", and two panels
            racing for it would be two things claiming to be the answer. */}
        {markSubject ? (
          <MarkCard
            found={markSubject}
            now={now}
            archived={archived}
            onClose={() => setMarkId(null)}
            onFlyTo={(lon, lat, zoom) => flyTo.current(lon, lat, zoom)}
          />
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
            onFlyTo={(lon, lat, zoom) => flyTo.current(lon, lat, zoom)}
            /* A section has nowhere to be drawn but the map, so taking this goes there. Same as a shared
               link carrying one. */
            onSection={(line) => {
              setSectionLine(line);
              setFlat(true);
              flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 1.6);
            }}
            boundaryKm={boundaryKmOf(shownQuake)}
            onSelect={selectQuake}
            farSide={farSideOf === shownQuake.key}
            /* Pulls the camera out to 0.9, because the figure is 40,000km across and a viewer zoomed into a
               margin would see a single arc with no sign it was part of a circle. */
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
