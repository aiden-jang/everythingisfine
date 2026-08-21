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
import { drawStill, stillMoment, STILL_HEIGHT, STILL_WIDTH } from "./app/still";
import { tourLabel, tourStops, TOUR_DWELL_MS } from "./app/tour";
import { createSiren, type Siren } from "./app/sound";
import { loadMotion, summariseMotion, type MotionSample } from "./geo/plateMotion";
import {
  loadBoundarySegments, nearestBoundaryKm, QUIET_BAND_KM, QUIET_BAND_SHARE, type Segment,
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
import { decode, encode } from "./app/permalink";
import { rampColorAt, type RampName } from "./globe/ramp";
import { matches, windowStart } from "./data/filter";
import type { Filters, Quake, SourceId } from "./data/types";
import type { SourceStatus } from "./sources/types";
import {
  ago, agoShort, clock, compactSpan, corroborationNote, energyPercent, place, quietNote,
  reachFraction, reachNote,
  reachWords, SOURCE_NAMES, windowLabel,
} from "./app/format";

/**
 * Renders once, in one place or the other.
 *
 * The legend belongs on the map at desktop and in the rail on a phone, where a floating panel covers
 * half a 60dvh globe. Two copies with one hidden is the usual way and it puts a second `#mag` slider
 * and a second pair of source toggles in the accessibility tree, which is a worse bug than the one it
 * solves.
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
 * The feed is created once, outside the component.
 *
 * Two sources and a fifty-thousand-event ring buffer are not React state and must survive a
 * re-render, a StrictMode double-mount and every filter change. Creating it in an effect would open
 * two WebSockets in development and quietly leave one of them running.
 */
const feed = createFeed();

/** Subscribes to the feed without re-rendering per earthquake: announcements are already coalesced. */
function useFeed(): FeedSnapshot {
  const [snapshot, setSnapshot] = useState(() => feed.snapshot());
  useEffect(() => feed.subscribe(setSnapshot), []);
  return snapshot;
}

/*
 * One row, used by both lists.
 *
 * The rail had three control idioms doing two jobs: bordered chips, borderless rows and bare
 * sliders, arranged by when each was written rather than by what each does. Regions and recent
 * events are the same gesture, click a thing and go to it, so they are the same row: a value on
 * the left, a name, a figure on the right.
 */
function Row({ lead, label, trail, onClick }: {
  lead?: string; label: string; trail: string; onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      {lead ? (
        <span className="w-[34px] shrink-0 font-mono text-[12px] text-ink">{lead}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-faint">{trail}</span>
    </>
  );
  /*
 * No rule under every row.
 *
 * Sixty rows each with a hairline beneath it is the densest possible way to say "these are separate",
 * and it is the thing that makes a list look like a spreadsheet from 2009. The mono magnitude column
 * already aligns them and the hover state already separates them; the rules were doing nothing the
 * layout was not already doing, and were doing it sixty times.
 */
const shared = "flex w-full items-baseline gap-3 rounded-[2px] px-1.5 py-[7px] text-left";
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

/*
 * Read once, at module load, before anything renders.
 *
 * A permalink that applied in an effect would show the default view first and correct itself a
 * frame later, which is a flash of somebody else's globe on the way to the one they shared.
 */
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
  /** The entrance replay's clock and revealed count, or null when it is not running. */
  const [replay, setReplay] = useState<{ at: number; revealed: number } | null>(null);
  /*
   * Where the viewer is standing in the window, and whether it is running.
   *
   * Not in the permalink. A link carries where somebody was looking, and a cursor mid-playback is a
   * moment in a gesture rather than a view: shared, it would arrive as a globe with most of its day
   * missing and no way to tell that from an empty day. The camera and the section are views; this is
   * a hand on a control.
   */
  /*
   * A shared moment, held rather than played.
   *
   * `clampScrub` on the way out already turns a cursor the window has slid past into live, so a link
   * opened days later degrades to the present on its own rather than pointing at nothing. Whether that
   * happened is worth saying, which is what `staleCursor` below is for.
   */
  const [scrub, setScrub] = useState<Scrub>(
    shared.cursor === undefined ? LIVE : { at: shared.cursor, playing: false },
  );
  /*
   * The revision a wider backlog was asked at, or null.
   *
   * Derived into `fetching` rather than cleared by an effect: the request is answered by events
   * landing, and events landing is exactly what bumps the revision. A boolean plus a subscription to
   * turn it off would be the same fact stored twice, with the two able to disagree.
   */
  const [pendingRev, setPendingRev] = useState<number | null>(null);
  /*
   * A shared event that is no longer in the window.
   *
   * The buffer is a rolling day, so a link shared yesterday names an earthquake this page will
   * never hold. Silently opening no panel would look like the link was broken. Saying so is the
   * same honesty the window's left edge gets: the app knows why, so it says why.
   */
  const [missingShared, setMissingShared] = useState<string | null>(shared.event ?? null);
  /*
   * Deliberately not in the permalink.
   *
   * Everything else the rail holds is a state somebody chose and would want to send. This one is
   * where the pointer is, which lasts as long as the pointer is there, and a link that arrived with
   * twenty-three of its twenty-four hours dimmed would look broken rather than shared.
   */
  const [focusHour, setFocusHour] = useState<number | null>(null);
  /*
   * Tonight's aurora, fetched beside the seismic feeds rather than through them.
   *
   * Not a `GeoEventSource`: that contract is built around readings that a second agency might dispute,
   * and a probability field has no identity to reconcile and no magnitude to carry. Forcing it through
   * would be the mistake section I names, where the store is the earthquake-shaped part and the sources
   * are not.
   *
   * Ten minutes, not the model's five. The grid is 900kB and the oval does not move far in that time, so
   * halving the traffic costs a resolution nobody is reading off a wash of light.
   */
  const [aurora, setAurora] = useState<Aurora | null>(null);
  /*
   * The storms happening now. Three of the ninety-nine GDACS lists, and their tracks.
   *
   * Beside the aurora rather than through it: they share a refresh interval and nothing else. A cyclone is
   * a mark with a position and a history, and a probability field is light, and the only thing they have
   * in common is that neither is a reading two agencies might dispute.
   */
  const [cyclones, setCyclones] = useState<readonly Cyclone[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchAurora().then((next) => { if (alive && next) setAurora(next); });
    };
    load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  /*
   * Volcanoes with a logged eruption episode. Fetched once, not on the ten-minute clock the others run on.
   *
   * Once because the newest episode in the list is weeks old, not minutes: GDACS flags none of them
   * current, and polling a two-year archive every ten minutes is traffic spent to learn nothing. The
   * layer earns its place on the boundaries it sits along rather than on being live, and the legend says
   * so instead of implying otherwise.
   */
  const [volcanoes, setVolcanoes] = useState<readonly Volcano[]>([]);
  /*
   * Fires and floods, both live and both on the storms' clock.
   *
   * Live is measured, not assumed: all hundred fires are flagged current with today's end date, and 19 of
   * the hundred floods ended within three days while the other 81 are up to a year old. The 81 are why
   * both parsers filter on `iscurrent` rather than drawing what arrives.
   */
  const [fires, setFires] = useState<readonly Wildfire[]>([]);
  const [floods, setFloods] = useState<readonly Flood[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchCyclones().then((next) => { if (alive) setCyclones(next); });
      void fetchWildfires().then((next) => { if (alive) setFires(next); });
      void fetchFloods().then((next) => { if (alive) setFloods(next); });
    };
    load();
    void fetchVolcanoes().then((next) => { if (alive) setVolcanoes(next); });
    const id = window.setInterval(load, 10 * 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  /** Computed here rather than in the legend, so the sentence is a render of a number and not a scan. */
  const fireSummary = useMemo(() => summarise(fires), [fires]);
  /*
   * The depth bands, on the store revision rather than the clock: the rail re-renders every second and
   * these counts only move when an earthquake does.
   */
  const depth = useMemo(
    () => depthBands(feed.store, filters, Date.now()), [filters, snapshot.revision],
  );
  /*
   * Remembered, because a width somebody chose is a preference and re-choosing it on every visit is
   * the app forgetting something it was told.
   */
  const onMap = useWide();
  /*
   * Not in the permalink, deliberately. A link carries where somebody was looking; which projection
   * they happened to be using while looking is a preference, and one that would arrive as a surprise.
   *
   * A link carrying a cross-section is the exception, and it is not that rule bending: a section only
   * exists on the map, so the link is not saying "use the map", it is naming a slice that has nowhere
   * else to be drawn. Without this the panel would open over a globe with no line on it.
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
  /*
   * The section line, and the section rebuilt from it.
   *
   * Keyed on the revision rather than the clock, for the reason the neighbour search is: it walks the
   * whole buffer, the panel re-renders every second because the rail ticks, and the answer only
   * changes when an earthquake does.
   */
  const [sectionLine, setSectionLine] = useState<SectionLine | null>(shared.section ?? null);
  /*
   * Both persisted, because both are accessibility settings and re-choosing one on every visit is
   * its own barrier. Read lazily so the first paint already has the right ramp rather than
   * flashing the default and correcting itself.
   */
  const [ramp, setRamp] = useState<RampName>(
    () => shared.ramp ?? (stored("ramp") as RampName | null) ?? "thermal",
  );
  const [announceAbove, setAnnounceAbove] = useState<number>(
    () => Number(stored("announceAbove") ?? "4.5"),
  );
  /*
   * The legend's key, open unless somebody has closed it.
   *
   * Persisted for the reason the rail width is: a panel somebody folded away is a preference, and
   * unfolding it on every visit is the app forgetting what it was told. Stored as the closed state so the
   * absence of the key reads as the default rather than as a choice.
   */
  /*
   * The event whose far side is drawn, held as an id rather than a flag.
   *
   * An id, so selecting a different event drops the figure instead of silently re-pointing it at the new
   * one: five circles that stayed put while the selection moved would be drawing the wrong epicentre's
   * geometry with nothing on screen saying so. Not persisted and not in the permalink - it is a thing
   * somebody is looking at right now, not a preference and not a view.
   */
  const [farSideOf, setFarSideOf] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useState<boolean>(() => stored("legendKey") !== "0");
  useEffect(() => { store("legendKey", keyOpen ? "1" : "0"); }, [keyOpen]);
  /*
   * The plate-motion arrows, persisted like the other view preferences and deliberately not in the
   * permalink: it is a reading of static geography, so a link that carried it would be sharing a setting
   * rather than sharing anything anybody is looking at. Off unless it has been asked for once.
   */
  const [motionOn, setMotionOn] = useState<boolean>(() => stored("motion") === "1");
  useEffect(() => { store("motion", motionOn ? "1" : "0"); }, [motionOn]);
  /*
   * The samples themselves, fetched on first use rather than imported.
   *
   * 7.1kB of static table behind a toggle that is off by default has no business in the bundle that has
   * to paint the first frame. Held here because both the globe and the legend's sentence need it, and a
   * failed import leaves the array empty, which draws nothing and says nothing rather than throwing.
   */
  /*
   * The plate boundary geometry, for measuring how far each event is from an edge.
   *
   * Loaded once on mount rather than behind a toggle, unlike the motion table: every event in the panel
   * gets a distance, so this is not optional the way arrows are. Still a dynamic import, because 28kB of
   * coastline-grade geometry does not belong in the bundle that paints the first frame.
   */
  const [segments, setSegments] = useState<readonly Segment[]>([]);
  useEffect(() => {
    let alive = true;
    void loadBoundarySegments().then((next) => { if (alive) setSegments(next); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  /*
   * Memoised per event key, not per render.
   *
   * One distance is 1,631 segment tests, which is nothing; every event in a thirty-day window against
   * every segment is a million of them, on a rail that re-renders once a second because the clock ticks.
   * An epicentre never moves, so the answer is cached against the key forever.
   */
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
   * Sound, off until asked for.
   *
   * The context is built on the press that enables it and not before: an `AudioContext` created without a
   * user gesture starts suspended, and every later tone is dropped silently - the toggle reads on and
   * nothing is ever heard. Closed again when switched off rather than left running, since a suspended
   * context is still a device handle.
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
  /*
   * Follows the live region's own definition of news, so a cold load can never be audible: sixty seeded
   * events are all unseen and none of them just happened. See `announce.ts`.
   */
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
  /*
   * The still's capture handle. Must be called and read synchronously; see `Globe.onCapture`.
   */
  const capture = useRef<() => HTMLCanvasElement | null>(() => null);
  const onCapture = useCallback((fn: () => HTMLCanvasElement | null) => {
    capture.current = fn;
  }, []);
  const onReady = useCallback((fn: typeof flyTo.current) => {
    flyTo.current = fn;
    // A shared camera arrives rather than flies. Somebody following a link wanted the view in it,
    // not a second of travel toward it from a place they never asked to see.
    if (shared.lon !== undefined) fn(shared.lon, shared.lat ?? 12, shared.zoom ?? 1);
  }, []);

  /*
   * The link is rewritten in place, never pushed.
   *
   * Every filter nudge and every camera settle would otherwise be a history entry, and Back would
   * walk somebody through a hundred of them instead of leaving the page.
   */
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
        section: sectionLine,
        /*
          The moment, not the playing state.

          A link that arrives already running would be motion the recipient did not ask for, which is
          the same objection DESIGN.md makes to ambient rotation. It arrives held, and pressing play is
          theirs.
        */
        cursor: scrub.at,
      });
      history.replaceState(null, "", `#${fragment}`);
    };
    write();
    lastWritten.current = window.location.hash;
    const timer = window.setInterval(() => {
      write();
      lastWritten.current = window.location.hash;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [filters, selected, ramp, sectionLine]);

  /*
   * Someone pasting a different link into an open tab.
   *
   * Changing only the fragment does not reload, and the permalink is read once at module load, so
   * without this a pasted link silently does nothing: the address bar says one thing and the globe
   * shows another. Reloading is the honest response, and it is safe because `replaceState` does not
   * fire `hashchange`, so the app's own once-a-second rewrite cannot trigger it.
   */
  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash !== lastWritten.current) window.location.reload();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const now = Date.now();
  /*
   * The window the cursor moves in.
   *
   * `to` is the wall clock, so this slides out from under a parked cursor the whole time. Both the
   * clock and the clamp are handed it fresh for that reason rather than remembering one.
   */
  const span = { from: now - filters.windowMs, to: now };
  /*
   * Clamped on the way out rather than written back.
   *
   * A cursor the window has slid past has to read as live, and correcting the state from a render is
   * not allowed. Every reader downstream goes through this, so the stale value behind it never
   * reaches anything.
   */
  const fetching = pendingRev !== null && snapshot.revision === pendingRev;
  const view = clampScrub(scrub, span);
  /*
   * Writes the still.
   *
   * Everything between the capture and the `drawImage` has to stay synchronous, because the globe's
   * drawing buffer is gone the moment the browser composites. So the compose happens first and the
   * asynchronous part - encoding and handing over the file - only starts once the pixels are safely on
   * another canvas.
   */
  const [saving, setSaving] = useState(false);
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
      moment: stillMoment(view.at, Date.now()),
      /*
       * The requested window, not the covered one.
       *
       * `windowLabel` qualifies itself by what the agencies have vouched for, which is right in the rail
       * and wrong here: it printed "nothing yet" onto a still showing a full day of earthquakes, because
       * `coveredSince` is null until a source reports its seed. The caption describes the filter that
       * produced the picture, and that filter is 24 hours whatever any agency has confirmed. Coverage is
       * a live fact about the app and has no business stamped on an image.
       */
      filter: `M${filters.minMagnitude.toFixed(1)}+ · last ${compactSpan(filters.windowMs)}`,
      host: window.location.host,
    }, { background: token("void"), ink: token("ink"), faint: token("faint") });

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
   * What is actually on the globe while the cursor is parked.
   *
   * The held total sitting unchanged above a globe drawing half of it is a true number describing
   * something other than the picture, which is the thing the replay's own count was added to stop.
   * The cursor is the replay made steerable, so it inherits the rule.
   *
   * Walked rather than derived from the bars. The bars are whole hours and the cursor is continuous,
   * so reading it off them would be right only twenty-four times a day. One pass over a buffer this
   * size costs less than the render it is feeding.
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
    // No cap. It was six, from when four were rendered and the rest were unreachable; the box is
    // sized and scrolls now, so cutting the list would be hiding the quiet regions worth noticing.
    () => countByRegion(feed.store, filters, Date.now()).filter((r) => r.count > 0),
    // Recomputed when the data or the filter moves, which is exactly when the counts can change.
    [filters, snapshot.revision],
  );

  /*
   * The tour. An index into the stops, or null when it is not running.
   *
   * The stops are recomputed from live counts, so they are captured when the tour starts rather than read
   * per tick: a new arrival mid-tour must not reorder the route under the camera. Not persisted and not in
   * the permalink - it is a thing happening now, not a preference or a view.
   */
  const stops = useMemo(() => tourStops(regions), [regions]);
  const [tourAt, setTourAt] = useState<number | null>(null);
  /*
   * The tour's own control, excluded from the end-on-interaction listener below.
   *
   * Without this, pressing Stop with a mouse is a race: `pointerdown` ends the tour, and then the click
   * handler reads whichever value of `tourAt` React has committed by that instant - the stale one stops
   * it and the fresh one starts it again. It resolved benignly every time it was tried, which is the
   * worst way for a race to behave. Operating the tour is not reaching for the globe.
   */
  const tourButton = useRef<HTMLButtonElement>(null);
  const route = useRef<ReturnType<typeof tourStops>>([]);
  const stopTour = useCallback(() => { setTourAt(null); }, []);
  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    route.current = stops;
    setTourAt(0);
  }, [stops]);
  /*
   * Advances the tour, and ends it on any interaction.
   *
   * "Any interaction ends it" is the entrance replay's rule and it is what keeps this on the right side of
   * DESIGN.md 13: motion the viewer did not ask for stops the moment they reach for the controls. Capture
   * phase, because a click on a rail button must end the tour as well as do its own job.
   */
  useEffect(() => {
    if (tourAt === null) return undefined;
    const stop = route.current[tourAt];
    if (!stop) { setTourAt(null); return undefined; }
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
  const touring = tourAt !== null ? route.current[tourAt] ?? null : null;

  const section = useMemo(
    () => (sectionLine ? buildSection(feed.store, sectionLine, filters, Date.now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.store, sectionLine, filters, snapshot.revision],
  );

  /*
   * The pinned event is looked up by key on every render, never held as an object.
   *
   * This is the whole reason a selection survives a refresh. The store updates a quake in place
   * when an agency revises it, so a key stays valid while the contents change; holding the object
   * would pin a snapshot, and holding an index would pin whatever later took that slot.
   */
  /*
   * Resolve a shared event once the feed has something to resolve it against.
   *
   * It cannot be done at mount: on a cold load the store is empty for a second or two while both
   * seeds land, so a link's event only becomes findable after the first announcement.
   */
  useEffect(() => {
    if (!missingShared) return;
    const [source, id] = missingShared.split(":") as [SourceId, string];
    const found = feed.store.findByReading(source, id);
    if (found) {
      setSelected(found.key);
      setMissingShared(null);
    } else if (snapshot.stats.quakes > 0 && snapshot.statuses.usgs.kind === "live") {
      // Both feeds have answered and it is not here, so it has aged out of the window rather than
      // not arrived yet.
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
   * Below the selection rather than up with the fetches, because the far-side figure is one of these and
   * it needs the traced event's position. Keyed on the id: if the id no longer resolves - the event aged
   * out of the ring buffer while its figure was up - the figure goes with it rather than staying drawn
   * around an epicentre the app can no longer name.
   *
   * Gated on the figure's event still being the selected one, which closes a trap rather than adding a
   * rule: the toggle lives in the panel, so with the panel dismissed the arcs would have stayed on screen
   * with no explanation beside them and no visible way to turn them off. It also keeps this app's standing
   * rule intact - the sentence is present exactly whenever the figure is. Reselecting the same event
   * brings it back, since nothing has been forgotten, only hidden.
   */
  const traced = farSideOf && farSideOf === selected ? feed.store.get(farSideOf) : undefined;
  const farSide = traced ? { lon: traced.primary.lon, lat: traced.primary.lat } : null;
  /*
   * How concentrated the window is along the plate edges.
   *
   * Keyed on the store revision, not the clock: the rail re-renders every second and this answer only
   * changes when an earthquake does. The band and its area share are the measured constants from
   * `boundaryDistance.ts` - 100km covers 9.4% of the surface, computed on a cos-weighted grid so the
   * figure means area rather than a count of cells.
   */
  const quiet = useMemo(() => {
    if (segments.length === 0) return null;
    let near = 0;
    let total = 0;
    feed.store.forEach((quake) => {
      if (!matches(quake, filters, Date.now())) return;
      total += 1;
      const km = boundaryKmOf(quake);
      if (km !== null && km <= QUIET_BAND_KM) near += 1;
    });
    return quietNote(near, total, QUIET_BAND_KM, QUIET_BAND_SHARE);
  }, [snapshot.revision, filters, segments, boundaryKmOf]);
  const marks = useMemo(
    () => marksFor({
      cyclones, volcanoes, fires, floods, farSide, motion: motionOn ? motionData : [],
    }),
    [cyclones, volcanoes, fires, floods, farSide?.lon, farSide?.lat, motionOn, motionData],
  );
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  /*
   * Twenty ticks a second, not one per frame.
   *
   * Every tick re-renders the rail and re-syncs the event layer, which is the same work the entrance
   * replay does per frame and the reason that one is only 2.8 seconds long. A cursor is read, not
   * animated: twenty is smooth enough to follow and a third of the cost of sixty.
   *
   * Stepped by measured time, never by the interval it was asked for. Passing a flat 50ms makes the
   * playback speed a function of how often the timer actually fires, and each tick here drags a React
   * render and a full re-sync behind it, so it fires late and a twelve second window took past
   * fourteen. `replay.ts` has the same note for the same reason: this plays a fixed span against the
   * wall clock, so the wall clock is what it has to read.
   *
   * Deliberately not clamped. A tab left in the background wakes up and finds the cursor has caught
   * the present, which is exactly what happened while nobody was watching.
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
   * The cursor and its play control shipped reachable by pointer only, against DESIGN.md's rule that
   * the app is operable from the keyboard. Tab reaches both, but tabbing to a clock to move it one
   * bucket is not a path anybody uses, and the hint strip did not admit either of them existed.
   *
   * `,` and `.` rather than the arrows. The arrows are the camera, in `globe/controls.ts`, and that
   * is not a binding worth taking off them for this. These two are the scrub convention, they are
   * free, and they can be printed in the hint strip without the strip lying: on the transport itself
   * the arrows step a bucket too, where they are unambiguous because it has focus.
   *
   * Space and the step keys only while nothing is focused, the same one rule the camera keys use, so
   * space keeps activating a focused button and the transport keeps its own arrows. Escape is not
   * gated that way: it is an escape.
   */
  useEffect(() => {
    /*
     * Read at the press, not captured.
     *
     * `to` is the wall clock, so a span closed over when the listener was armed is stale by however
     * long the tab has been open. `playedAt` above has the same note for the same reason.
     */
    const spanNow = (): { from: number; to: number } => {
      const at = Date.now();
      return { from: at - filters.windowMs, to: at };
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        // One thing at a time, innermost first. Escape closing the pin and the section together means
        // one press can undo two decisions, and the section is the one somebody just drew.
        //
        // The query is innermost of all while it has text: if somebody has just typed into a box,
        // Escape means that box, and clearing their pin instead would be answering a different
        // question. It is the one rung reachable while a field has focus, which is why it is above the
        // guard below rather than below it.
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
        // No shift multiplier. Shift-comma is `<` on this layout and something else on the next, so
        // a bigger step would be a key that exists on some keyboards and cannot be printed in the
        // hint strip. One press is one bar; the window is twenty-four of them.
        const live = spanNow();
        setScrub((sc) => nudge(clampScrub(sc, live), live, e.key === "." ? 1 : -1));
      } else return;
      // Space scrolls a page, and this one is `overflow: hidden` for exactly that reason already.
      // Preventing it here as well means the transport does not depend on that staying true.
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sectionLine, scrub.at, filters.windowMs, query]);

  const toggleSource = (id: SourceId): void => {
    setFilters((f) => {
      const sources = new Set(f.sources);
      if (sources.has(id)) sources.delete(id);
      else sources.add(id);
      return { ...f, sources };
    });
  };

  /*
   * The list shows what the globe shows, filtered identically, **ordered by origin time**.
   *
   * The store hands events back in arrival order, which is the right thing for eviction and the wrong
   * thing for a list headed "newest first". This was fixed once by sorting a pool of the 400 most
   * recently arrived, which was enough while a day's seed was three hundred events and silently wrong
   * from the moment a month's became eleven thousand: USGS lists a feed newest first, so the last 400 to
   * arrive from a month are its four hundred *oldest*, and the list showed events 28.8 days old under a
   * heading claiming recency.
   *
   * So the store selects by origin time instead, and takes the filter so that filtering cannot happen
   * after a cap has already thrown the answer away. Sixty because navigating fifty thousand rows would
   * serve nobody.
   */
  const recent = useMemo(
    () => feed.store.newest(60, (q) => matches(q, filters, Date.now())),
    [filters, snapshot.revision],
  );

  /*
   * Rebuilt on every revision, and cheap enough to be.
   *
   * It walks the whole buffer, which is up to fifty thousand events, but only ever to add to
   * twenty-four counters. The list above it walks the same buffer on the same trigger and that has
   * never been the frame's problem either.
   */
  /*
   * Where both feeds were looking, which is the later of their two edges and not the earlier.
   *
   * `coveredSince` is the min, because that is the honest left edge of what the app holds at all. A
   * corroboration rate needs the opposite: the span where *both* agencies had eyes on, since neither can
   * confirm the other outside it.
   */
  const overlapFrom = snapshot.covered.usgs !== null && snapshot.covered.emsc !== null
    ? Math.max(snapshot.covered.usgs, snapshot.covered.emsc)
    : null;

  const { bars, strongest, bucketMs, energyShare, overlap } = useMemo(
    () => histogram(feed.store.forEach, filters, now, snapshot.coveredSince, overlapFrom),
    // `now` deliberately absent: it ticks every second and the bars only move on the bucket. The
    // revision is what changes them, and the clock catches up the next time an event lands.
    // `windowMs` is present because it decides the bucket, so changing it reshapes every bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision,
      snapshot.coveredSince, overlapFrom],
  );

  /*
   * Searched on the same triggers as the region counts, and for the same reason.
   *
   * It walks the buffer, so it belongs with the other walk rather than in a render. `now` is
   * deliberately absent: a second passing does not change what matches a query, and depending on it
   * would re-walk fifty thousand events once a second while somebody reads the results.
   */
  const results = useMemo(
    () => search(query, feed.store, filters, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  /*
   * One path to a result, so Enter and a click cannot drift apart.
   *
   * A region is a box and flies to its own framing; a place flies to its strongest event and pins it,
   * so arriving explains itself rather than leaving somebody on a patch of ocean wondering which dot
   * they came for.
   */
  const pick = (hit: Hit): void => {
    if (hit.kind === "region") {
      flyTo.current(hit.region.lon, hit.region.lat, hit.region.zoom);
      return;
    }
    setSelected(hit.strongest.key);
    flyTo.current(hit.strongest.primary.lon, hit.strongest.primary.lat, 2.2);
  };

  /*
   * Folded onto the clock, on the same triggers as the strip beside it.
   *
   * A full walk with a solar-time calculation per event, measured at 10.8ms for a 50,000 event buffer,
   * which is the same order as the histogram walk that already runs here. `now` is deliberately absent
   * from the deps for the reason the histogram gives: it ticks every second and the bins move on the
   * data, not on the clock.
   */
  const clockBins = useMemo(
    () => diurnal(feed.store.forEach, filters, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, filters.windowMs, snapshot.revision],
  );

  /*
   * The held bucket as a span of time, converted once, here, where the bucket width lives.
   *
   * The event layer used to take the bucket's index and multiply it by an hour. That was the same thing
   * while a day was the only window and wrong from the moment 7d and 30d shipped, because a bucket is
   * `windowMs / 24`: at a month it is thirty hours, so every bar on the strip lit the same recent hour
   * whichever one the pointer was on. `bucketMs` comes from the histogram that drew the bars, so the two
   * cannot disagree about what a bar covers.
   *
   * The strip keeps the index, because comparing a bar to the held bar is what an index is for.
   */
  const focusSpan = useMemo(
    () => (focusHour === null
      ? null
      : { from: now - (focusHour + 1) * bucketMs, to: now - focusHour * bucketMs }),
    // `now` deliberately absent, for the reason the bars exclude it: it ticks every second, the buckets
    // do not move with it, and re-deriving this per second would re-sync the marker layer per second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusHour, bucketMs],
  );

  const hours = Math.round(filters.windowMs / 3_600_000);
  /*
   * The headline counts what is on the globe, not what is in the buffer.
   *
   * It was `stats.quakes`, the held total, which every filter left untouched: dragging magnitude to
   * 5.0 emptied the globe and the number beside it did not move. The comment on the replay below
   * already calls that out as a true number describing something other than the picture next to it,
   * and it was written about the replay while the same thing was permanently true of the filters.
   */
  /*
   * The strip spans exactly the window now, so its total is the window's total.
   *
   * It used to select hours out of a day-long strip, which is why this took a count. One number from
   * one walk, and the strip and the headline cannot disagree because there is only one of them.
   */
  const shown = totalIn(bars);

  /*
   * The count on the headline, and whether it is ours to animate.
   *
   * Driven frame by frame during the replay and while the cursor is parked, and a discrete jump
   * otherwise. `useRolling` is handed that distinction rather than inferring it, because inferring it
   * means guessing from the value alone and the two cases look identical from there.
   */
  const driven = replay !== null || view.at !== null;
  const headline = useRolling(replay ? replay.revealed : revealedNow ?? shown, !driven);

  const failing = (Object.entries(snapshot.statuses) as [SourceId, SourceStatus][])
    .flatMap(([id, status]) => (status.kind === "failing" ? [[id, status] as const] : []));

  /*
   * A shared cursor the window cannot hold.
   *
   * The link carried a moment, the clamp quietly moved it to live, and without this the recipient sees
   * the present and no reason why. Same failure and same answer as a shared event that has aged out,
   * which already has a notice a few lines below this one.
   *
   * Read off `scrub` against `view`, so it says so only while the two disagree: once the cursor is
   * moved by hand the link's moment is no longer what is being looked at and the notice has nothing to
   * explain.
   */
  const staleCursor = shared.cursor !== undefined
    && scrub.at === shared.cursor
    && view.at === null;

  const edge = windowStart(now, filters.windowMs, snapshot.coveredSince);
  /*
   * Recomputed on the clock rather than memoised.
   *
   * It reads `now`, which ticks every second, and the whole point of the sentence is that the reach
   * it names is a moving distance from the present. Memoising it against the revision would freeze
   * "18h" at whatever it was when the last event landed.
   */
  const sourceNote = reachNote(snapshot.covered, now, filters.windowMs);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  const legend = (
    <>

              <MagnitudeFilter
                ramp={ramp}
                value={filters.minMagnitude}
                onChange={(v) => setFilters((f) => ({ ...f, minMagnitude: v }))}
                aurora={aurora}
                cyclones={cyclones}
                volcanoes={volcanoes.length}
                volcanoesSince={newestEpisode(volcanoes)}
                fires={fireSummary}
                fireCap={FEED_CAP}
                floods={floods.length}
                floodCountries={countries(floods)}
                keyOpen={keyOpen}
                onKeyOpen={setKeyOpen}
                motion={motion}
                depth={depth}
                sound={sound ? announceAbove : null}
                motionOn={motionOn}
                onMotion={setMotionOn}
              >
              {/*
                Sources sit with the magnitude control because both answer "what is on the globe".

                Passed in as a child so they land *above* the folding key. Once the panel gained a
                max-height they were at the bottom of a scrolling column and off the fold at 1280x720 -
                a control the viewer had to scroll prose to reach. All the controls are above all the
                commentary now, which is the split the fold already claimed to make.
              */}
              <div className="mt-3 flex gap-1.5">
                {(["usgs", "emsc"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleSource(id)}
                    aria-pressed={filters.sources.has(id)}
                    className={`flex-1 cursor-pointer border px-2.5 py-1.5 text-[11.5px] transition-colors ${
                      filters.sources.has(id)
                        ? "border-hairline bg-raised text-ink hover:border-faint"
                        : "border-hairline text-faint hover:bg-raised hover:text-dim"
                    }`}
                  >
                    {SOURCE_NAMES[id]}
                  </button>
                ))}
              </div>
              </MagnitudeFilter>

    </>
  );

  return (
    <div className="frame">
      {/* The header used to hold a wordmark and two small words on a 1280px bar. It now carries
          the arithmetic that makes the reconciliation visible without opening anything. */}
      <header className="zone-head flex items-center gap-6 bg-deck px-5 py-3 xl:bg-transparent">
        <div className="text-[13px] font-semibold tracking-[0.16em] whitespace-nowrap">
          {/*
            "FINE" on a phone, and the full sentence from `md` up.

            Not only a layout dodge, though it is that too: the header's own note records one extra
            button pushing it 120px past a phone viewport, and this wordmark is half again as long as the
            one it replaces. It is also the better joke at that size.
          */}
          <span className="md:hidden">FINE</span>
          <span className="hidden md:inline">EVERYTHING IS FINE</span>
        </div>
        {/* Four zeros are four numbers that mean nothing. Same call as the headline: the status on
            the right already says what is happening while there is nothing to count. */}
        {/*
          The counts wait for a wide screen now, not a small one.

          They appeared from `sm` up, which was fine when the header held two controls. With Sound, Tour
          and Still added they took ~380px of a 768px header and forced the control group to wrap into
          **four rows**, a 150px-tall bar over a tablet's canvas. The rail carries the same counts, so
          this is the half to drop - the same call the wordmark and the ramp label already make.
        */}
        <div className={`hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "xl:flex"}`}>
          {([
            ["USGS", `${snapshot.stats.readings.usgs}`],
            ["EMSC", `${snapshot.stats.readings.emsc}`],
            ["distinct", `${snapshot.stats.quakes}`],
            ["both", `${snapshot.stats.corroborated}`],
            // Only once it has happened. A permanent "0 revised" is a slot in the header reserved
            // for nothing, and this is the one stat that is interesting precisely because it moves.
            ...(snapshot.stats.revised > 0
              ? [["revised", `${snapshot.stats.revised}`] as const]
              : []),
          ] as const).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
        </div>
        {/*
          Was `whitespace-nowrap`, which meant adding one button pushed the header 120px past a
          phone viewport and 42px past a tablet: nowrap does not shrink, it overflows. The controls
          stay and the informational labels drop as room runs out, since a display toggle is
          something to press and a status line is something to read.

          "wavefront x20" used to sit here, and the legend now says the same number inside the
          sentence that explains what it is a multiplier *of*. Two identical figures in one viewport
          with only one of them meaning anything is the trap the activity axis already fell into. It
          was also `hidden lg:inline`, so on anything smaller than a laptop there was never a
          persistent readout to lose.
        */}
        {/*
          Wraps on a narrow screen, because this row grew by three buttons.

          It held Map and the ramp toggle; Sound, Tour and Still joined it, and at 375px the last of them
          was clipped off the right edge rather than scrolling into reach - an unreachable control, and
          horizontal scroll would have been a build failure under DESIGN.md 11 anyway. Wrapping costs a
          second header row on a phone, which is the cheaper loss than a button nobody can press.
          `gap-y-2` so the two rows do not touch, and `justify-end` so the wrapped row stays right-aligned
          with the one above it.
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
            {/* The short label is not an abbreviation of the long one, it is the same words with
                the ones a narrow screen cannot afford removed. */}
            {/* Short form up to `lg`, not `md`: at 768 the long label is 140px of a header that now has
                five controls in it. */}
            <span className="lg:hidden">Ramp {ramp === "cividis" ? "CB" : "std"}</span>
            <span className="hidden lg:inline">
              Colourblind ramp {ramp === "cividis" ? "on" : "off"}
            </span>
          </button>
          {/*
            The still, beside the other things that describe the whole view rather than one event.

            Not in the panel with "Copy link", even though both are sharing: that button shares an
            earthquake and this one shares a framing, and the panel is only open when something is
            pinned. A view-level action belongs in the view-level strip.
          */}
          {/*
            Sound. No slider of its own: it follows the announce threshold, because "tell me about events
            above this" is one idea and the rail already has the control for it. See DESIGN.md 12b.
          */}
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
          {/*
            Offered only when there is somewhere to go. With an empty window the tour would be a camera
            flying around a planet with nothing on it, which is exactly the motion-that-means-nothing the
            design bans.
          */}
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
          <span className="flex items-center gap-2 text-[11px] whitespace-nowrap text-dim">
            <span
              className={`inline-block size-[6px] rounded-full ${
                live === 2 ? "bg-ink" : live === 1 ? "bg-dim" : "bg-faint"
              }`}
            />
            <span className="hidden sm:inline">
              {live === 2 ? "both feeds live" : live === 1 ? "one feed live" : "connecting"}
            </span>
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
        <aside className="zone-rail rail border-hairline bg-deck p-5 max-xl:border-b xl:border-r">
          <div data-rail="headline">
            {/*
              No "EVENTS" label above this.

              Eleven small uppercase labels stacked down one rail is the thing that reads as dated: a
              templated rhythm where every block wears a name badge. A 38px number over the words "last
              24 hours" needs no heading, and the ones that survive are the ones naming something a
              reader could not otherwise work out.
            */}
            {/*
              Before any coverage exists there is no count to show, and a big 0 above "nothing yet ·
              still filling" was two disclaimers stacked under a number that meant nothing. This says
              what the app is doing instead, which is the only true thing available at that point.
            */}
            {snapshot.coveredSince === null ? (
              <div className="mt-2 max-w-[30ch] text-[14px] leading-snug text-dim">
                Asking USGS and EMSC for the last day.
              </div>
            ) : (
              <>
                {/*
                  During the replay this counts what is actually on the globe, climbing to the total
                  as the day plays in. The held total sat there unchanged while the globe filled
                  beneath it, which is a true number describing something other than the picture.
                */}
                {/*
                  Rolled, but only when the change is a discrete one.

                  The count moves for three reasons and only one of them looked like anything. The
                  entrance replay already climbs it a frame at a time, and so does the cursor while it is
                  parked or playing; in both cases the number has to be exactly what is drawn, so easing
                  would make it a late copy of something already correct. What was left snapping was a
                  live arrival and, far more visibly, a window change from 872 to 11,363 rendered as a
                  flicker. See `roll.ts` for why the rate is a solved time constant.
                */}
                <div className="mt-1.5 text-[38px] leading-none font-semibold tabular-nums">
                  {headline.toLocaleString("en-GB")}
                </div>
                {/*
                  During the replay the rail shows the replayed clock, labelled, because the number
                  above it is counting up through a day that has already happened. Saying "since
                  22:35" while the globe fills with yesterday's events would describe one thing and
                  show another.
                */}
                {/*
                  The tour narrates here, in the replay's own slot and shape.

                  This line is not decoration, it is the thing that makes the camera movement legal under
                  DESIGN.md 13: the ban is on motion that means nothing, so every stop says where it is and
                  how much is there while the camera is sitting on it. Take the words away and this
                  becomes the screensaver the rule exists to prevent.
                */}
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
                   * The cursor's own clock, in the replay's shape rather than the window label's.
                   *
                   * "Last 24 hours" above a count of half of them would be describing the window
                   * while the number describes the picture. Both lines answer the cursor here, and
                   * the word says which of the two states this is.
                   */
                  <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-ink">{clock(view.at)}</span>
                    <span className="text-faint">{view.playing ? "playing" : "held"}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-dim">
                    {windowLabel(now, filters.windowMs, snapshot.coveredSince)}
                    {edge.complete ? "" : " · still filling"}
                  </div>
                )}
              </>
            )}
          </div>

          {/*
            The one fact a person actually wants, which the list buries.
            The list is newest first, so a magnitude 6 from eight hours ago sits forty rows down while
            forty magnitude 2s sit above it. The rail had a single focal point, the count, and then a
            wall of small grey text with the interesting thing hidden in it.
          */}
          {strongest && !replay ? (
            <button
              type="button"
              /*
                An entry point that is not "now".
                The app opens on the present, which at a month is the least interesting moment in the
                buffer: whatever is happening this minute is an M2 somewhere, and the M6 worth looking
                at was eleven days ago. This row already named it and flew to it, and left the cursor
                live, so arriving showed the end state of the whole window with the event buried in
                thirty days of everything else.
                So it moves in time as well as in space. The cursor parks at the event's own origin,
                which is the moment it was the newest thing on Earth, and the sequence strip in the
                panel then shows what came next while the globe has not drawn it yet. Pressing play
                from there is the aftershock sequence arriving.
              */
              onClick={() => {
                setSelected(strongest.key);
                flyTo.current(strongest.primary.lon, strongest.primary.lat, 1.9);
                // Through `clamp`, so an event that is already the most recent thing held hands back
                // to live rather than parking a moment behind the present.
                setScrub(clampScrub({ at: strongest.primary.time, playing: false }, span));
              }}
              /*
                Named in full, because the row is four fragments and a click that moves the clock has
                to say so before it is pressed rather than after.
              */
              aria-label={`Largest: magnitude ${strongest.primary.magnitude.toFixed(1)}, `
                + `${place(strongest.primary.place)}, ${ago(strongest.primary.time, now)}. `
                + "Go there and hold the window at that moment."}
              data-rail="largest"
              className="-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2.5 border-t border-hairline px-1 pt-2.5 text-left transition-colors hover:bg-raised"
            >
              <span className="label shrink-0">Largest</span>
              {/*
                On the ramp, and marked as such.

                The design contract caught this immediately, which is the contract working: a coloured
                number in the rail is hue outside the canvas. It stays because the hue means exactly
                what hue always means here, and the marker is what says so.

                Why this one and not the sixty in the list below: one number is a focal point and
                sixty are a rainbow. The list carries magnitude by position and figure, which is what
                a list is for; this is a single value that has to be readable at a glance from across
                the rail.
              */}
              <span
                data-ramp
                className="font-mono text-[15px] leading-none"
                style={{ color: rampColorAt(ramp, (strongest.primary.magnitude - 1) / 6.5) }}
              >
                {strongest.primary.magnitude.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">
                {place(strongest.primary.place)}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">
                {agoShort(strongest.primary.time, now)}
              </span>
            </button>
          ) : null}

          {/*
            What that magnitude actually means, once.

            Magnitude is logarithmic and almost nobody carries that around: two points is a thousandfold
            of energy, so one large event routinely accounts for better than 99 percent of a month while
            sitting in a list of thousands. The share is the fact that teaches it, and the clause after
            it is there because a number that high reads as a bug otherwise.

            Outside the button, because it is a statement about the window rather than a thing to press,
            and pressing it should not fly anywhere.
          */}
          {/*
            Held back until the window is actually covered.

            The share is a fact about a window, and until the backlog has landed there is no window to
            have a share of. Caught live: at a month, with only the hourly poll in, the rail printed "that
            one event is 86% of the energy released in the window" directly under "Asking USGS and EMSC
            for the last day", which is a claim about thirty days computed from one hour of it. The
            headline beside it already says "still filling" in that state, so the machinery to know was
            there and this was not asking.
          */}
          {/*
            The negative space, measured.

            Item 8 wanted the cratons lit, which is a claim about geological time this app cannot make with
            a thirty-day buffer. What survives is the same shape of fact as a ratio, and it belongs here
            beside the energy line because both are one sentence about the whole window rather than about
            any event in it.
          */}
          {!replay && quiet ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{quiet}</p>
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
            The same window, folded onto the clock.

            Under the activity strip because both answer "when" and neither answers it the other's way:
            the strip is elapsed time and this is time of day, and the interesting thing about this one
            is that it has nothing in it. Behind a disclosure for that reason, and next to the strip so
            the two readings of one word sit together.
          */}
          <details data-rail="diurnal" className="mt-3">
            <summary className="cursor-pointer list-none text-[11px] text-faint hover:text-dim">
              Time of day
            </summary>
            <Dial counts={clockBins} />
          </details>

          {onMap ? null : <div data-rail="legend">{legend}</div>}

          {/*
            The day, and the control for the window that was previously unreachable. Sits under the
            magnitude filter because they are the same kind of thing: both say what is on the globe.
            The globe answers "where" and cannot answer "when" at all, which is the gap this fills.
          */}
          <div data-rail="activity">
            <Timeline
              bars={bars}
              ramp={ramp}
              hours={hours}
              focusHour={focusHour}
              onFocusHourChange={setFocusHour}
              onHoursChange={(h) => {
                const windowMs = h * 3_600_000;
                setFilters((f) => ({ ...f, windowMs }));
                /*
                 * The cursor goes live, because it was a fraction of a window that no longer exists.
                 *
                 * `clamp` would keep it inside the new span, which is right for a window sliding under
                 * a parked cursor and wrong here: 40% through a day and 40% through a month are not
                 * the same moment, and silently keeping the number would move the viewer in time
                 * without them touching the cursor.
                 */
                setScrub(LIVE);
                if (feed.setWindow(windowMs)) setPendingRev(snapshot.revision);
              }}
              bucketMs={bucketMs}
              fetching={fetching}
              cursor={fractionOf(view, span)}
              parked={view.at !== null}
              playing={view.playing}
              onScrub={(f) => setScrub(dragTo(f, span))}
              onStep={(buckets) => setScrub(nudge(view, span, buckets))}
              onPlayToggle={() => setScrub(togglePlay(view, span))}
              onLive={() => setScrub(LIVE)}
              cursorLabel={view.at === null ? null : clock(view.at)}
              /*
                Present from the first frame, empty, and filling as each feed answers.

                This is the dual-source architecture legible in the first second: the headline says the
                app is asking two agencies, and these say which of them has replied. An empty track that
                fills is also the same shape the reach bars take a moment later, so the load state and
                the steady state are one visual rather than two.
              */
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
              /*
                Both footnotes to the bars, in the order they are read: what the bars are, then what the
                header's `both` count means once you know they differ.
              */
              notes={[
                sourceNote,
                corroborationNote(overlap, overlapFrom, now, filters.windowMs),
              ].filter((n): n is string => n !== null)}
            />
          </div>

          {/*
            All twelve, in a box you can resize, rather than the top four and no way to the rest.

            The truncation was the wrong half of the fix: a region with two events is exactly the one
            somebody scanning for where today is quiet wants to see, and it was the one being cut. A
            sized scrolling box shows the same four by default and admits the others exist.
          */}
          {regions.length > 0 ? (
            <div data-rail="regions" className="relative">
              {/*
                Somewhere to search, and the results stand in the region rows rather than beside them.
                Four region rows were the entire navigation: a person who wants Japan had to either
                find it among whichever four are showing or drag the globe until it appeared. Results
                replacing the rows keeps the rail the same height and asks the same question the rows
                already answer, with a filter on it.
              */}
              <div role="search" className="mb-1.5 flex items-baseline gap-2">
                <label htmlFor="find" className="label shrink-0">Find</label>
                <input
                  id="find"
                  /*
                    Text, not search. `type="search"` brings a user-agent cancel button with
                    user-agent styling into chrome whose rule is that it carries none, and the app
                    already has a way to clear this: Escape, which is the innermost rung of the
                    ladder while there is a query. `role="search"` on the wrapper is the part that
                    was actually worth having.
                  */
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  /*
                    Enter takes the first result, which is the reflex everybody has in a search box.
                    Without it the only way through was Tab, and a field that swallows Enter reads as
                    a field that did not understand the query.
                  */
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const first = results.hits[0];
                    if (first) pick(first);
                  }}
                  placeholder="a region or a place"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 border-b border-hairline bg-transparent pb-0.5
                    text-[12px] text-ink placeholder:text-faint focus:border-faint focus:outline-none"
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
                        /*
                          The trail carries both numbers because either alone is misleading: a count
                          with no size, or a size with no idea whether it stands for one event or
                          three hundred.
                        */
                        <Row
                          key={`p:${hit.name}`}
                          label={hit.name}
                          trail={`${hit.count} · M${hit.strongest.primary.magnitude.toFixed(1)}`}
                          onClick={() => pick(hit)}
                        />
                      )))}
                      {/*
                        A cap that does not say so reads as "that is everything", which is the one
                        thing it is not.
                      */}
                      {results.more > 0 ? (
                        <p className="px-1.5 pt-1.5 text-[11px] leading-relaxed text-faint">
                          {`${PLACE_LIMIT} of ${PLACE_LIMIT + results.more} places. `}
                          Narrow the query to see the rest.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    /*
                      Which of the two nothings this is.
                      There is no gazetteer behind this and there cannot be one under the key
                      constraint, so a real place with no seismicity looks exactly like a typo. Saying
                      what was searched is the difference between a limit and a bug.
                    */
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
                        trail={`${count}`}
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
            </div>
          ) : null}

          {/*
            DESIGN.md section 6: "A failing source degrades to a hairline notice in the rail naming the
            source and the retry." Specified, and never built. `SourceStatus` has carried the reason
            and the retry time since the first source was written, and the header said "one feed live"
            whether the other was still connecting or had been refused for ten minutes.
          */}
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
              The moment in this link is older than the window, so this is the present instead.
            </p>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p data-rail="notice" className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
              The event in this link is no longer in the window. The buffer holds the last day, and
              it starts when the page opens.
            </p>
          ) : null}

          <EventList
            quakes={recent}
            selected={selected}
            onSelect={setSelected}
            announceAbove={announceAbove}
            onAnnounceAboveChange={setAnnounceAbove}
            onNews={onNews}
            waiting={snapshot.coveredSince === null}
          />

        </aside>

        <Resizer
          axis="x"
          label="Rail width"
          value={railWidth}
          min={264}
          max={620}
          measure={(e) => e.clientX}
          onChange={setRailWidth}
          className="absolute inset-y-0 hidden xl:block"
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
            aurora={aurora}
            marks={marks}
            scrubAt={view.at}
            flat={flat}
            section={sectionLine}
            onSection={setSectionLine}
            onSelect={setSelected}
            onReady={onReady}
            onCapture={onCapture}
            onCamera={(state) => { camera.current = state; }}
            onReplay={setReplay}
          />
          </Suspense>

          {/*
            The legend lives on the map, not in a column beside it.

            It explains what the marks mean, and it spent its life in a sidebar two hundred pixels from
            the nearest mark. Over the globe it sits next to the thing it is describing, and the rail
            gets its height back for the things that are actually a list.
          */}
          <div
            /*
              Stops where the pinned panel starts, the same way it stops where the rail starts.
              It ran the full width before, which truncated the key hints under the panel and, once the
              cross-section joined the band, hid a fifth of the section behind the event it was opened
              from. Only at xl: below that the panel is a row of its own and nothing is over anything.
            */
            className={`pointer-events-none absolute bottom-0 left-0 z-[1] flex flex-wrap items-end justify-end gap-x-6 gap-y-3 p-4 xl:left-[var(--rail-w)] ${
              shownQuake && pinned ? "right-0 xl:right-[var(--panel-w)]" : "right-0"
            }`}
          >
            {/*
              The section joins the bottom band as its own full-width line rather than as a new
              absolutely positioned box, and it goes last so it is flush with the bottom edge. Placed
              first it floated in the middle of the canvas with map still visible underneath, which
              read as the map having been cut in half.
            */}
            {section ? (
              <div className="order-9 -mx-4 -mb-4 w-[calc(100%+2rem)] bg-deck/40 px-4 pt-3 pb-4 backdrop-blur-2xl backdrop-saturate-50">
                <CrossSection
                  data={section}
                  ramp={ramp}
                  store={feed.store}
                  selected={selected}
                  onSelect={setSelected}
                  onClose={() => setSectionLine(null)}
                />
              </div>
            ) : null}
            {onMap ? (
              /*
                Capped and scrolling, because the legend outgrew the screen.
                Measured at 1280x720, a very ordinary laptop: the panel had reached 845px in a 720px
                viewport, so the bottom band's top sat at -157 and the **magnitude slider was 104px above
                the top of the window** - the app's primary control, unreachable, with nothing in the
                ancestor chain having a max-height or an overflow to catch it. Adding the storm, volcano,
                fire, flood, motion, depth and sound rows did that a row at a time and no single one of
                them looked like the culprit.
                The control is at the top of this panel and the prose below it, so capping here keeps the
                slider and the ramp in view and scrolls the explanation, which is the right half to lose.
                `dvh` and not `vh`, per DESIGN.md 11. And underscores in the `calc`, because CSS needs
                whitespace around the `-` or `-4.5rem` parses as a negative number and the whole
                declaration is dropped - which is the trap `xl:left-[calc(var(--rail-w)+1rem)]` fell into
                once already, and which I walked straight back into here: the first version of this cap
                silently did nothing and the panel was still 806px tall.
              */
              <div className="pointer-events-auto order-1 max-h-[calc(100dvh_-_4.5rem)] w-full max-w-[300px] overflow-y-auto bg-deck/40 p-3 backdrop-blur-2xl backdrop-saturate-50 xl:order-2">
                {legend}
              </div>
            ) : null}
            <div className="key-hints pointer-events-auto order-2 font-mono text-[10.5px] text-faint xl:order-1">
              {/*
                What the keys do here, not what they did on the globe. Arrows orbit a sphere and pan a
                map, and a hint row that says orbit while the drag pans is worse than no hint row.
              */}
              {([
                ["arrows", flat ? "pan" : "orbit"],
                ["+ -", "zoom"],
                ["0", "reset"],
                ["space", view.playing ? "pause" : "play"],
                [", .", "step"],
                ...(flat ? [["shift-drag", "section"] as const] : []),
                ["esc", "clear"],
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
          Held past the unpin, so the panel can leave.

          A conditional mount has no exit: React removes the node on the same frame the selection
          clears, and a transition on a removed node never runs, so closing was a cut where opening
          was a slide. Keeping the last one alive lets it animate out still saying what it said.
        */}
        {shownQuake ? (
          <DetailPanel
            open={pinned !== undefined}
            quake={shownQuake}
            store={feed.store}
            filters={filters}
            ramp={ramp}
            excluded={!matches(shownQuake, filters, now)}
            revision={snapshot.revision}
            onClose={() => setSelected(null)}
            onFlyTo={(lon, lat, zoom) => flyTo.current(lon, lat, zoom)}
            /*
              A section has nowhere to be drawn but the map, so taking this goes there.
              Same reasoning as a shared link that carries one, which already forces the map on
              arrival rather than opening the panel over a globe with no line on it.
            */
            onSection={(line) => {
              setSectionLine(line);
              setFlat(true);
              flyTo.current(shownQuake.primary.lon, shownQuake.primary.lat, 1.6);
            }}
            boundaryKm={boundaryKmOf(shownQuake)}
            onSelect={setSelected}
            farSide={farSideOf === shownQuake.key}
            /*
              Pulls the camera out to 0.9 when it goes on, because the figure is 40,000km across at its
              widest and a viewer zoomed into a margin would have a single arc crossing the screen with
              no indication it was part of a circle.
            */
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
