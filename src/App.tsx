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
import { fetchHistory, type History } from "./sources/history";
import { tourLabel, tourStops, TOUR_DWELL_MS } from "./app/tour";
import { createSiren, type Siren } from "./app/sound";
import { loadMotion, summariseMotion, type MotionSample } from "./geo/plateMotion";
import { loadSlab, type SlabPoint } from "./geo/slab";
import { loadFigures, type FigureTable } from "./geo/stars";
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
  /*
 * No rule under every row.
 *
 * Sixty rows each with a hairline beneath it is the densest possible way to say "these are separate",
 * and it is the thing that makes a list look like a spreadsheet from 2009. The mono magnitude column
 * already aligns them and the hover state already separates them; the rules were doing nothing the
 * layout was not already doing, and were doing it sixty times.
 */
/*
 * A share, drawn with no track under it.
 *
 * Four right-aligned counts made the region list a table of figures when the thing worth seeing is the
 * distribution: 117 against 46 against 31 is a shape, and reading it off three numbers is work the
 * drawing could do. The `trail` keeps the exact figure, so the bar adds a reading rather than replacing
 * one, and it is `aria-hidden` because the count is already in the row for anyone listening.
 *
 * **Normalised to the largest, not to a total, because there is no total.** `countByRegion` increments
 * every region that contains a point and the regions overlap, so the counts can sum past the number of
 * events on screen. A percentage-of-total bar would have been arithmetic nobody could reproduce.
 *
 * No track, which is what keeps the note above true. A hairline under all eleven rows is the uniform
 * rule this component refuses by name; a fill with nothing behind it is ragged down the left, so it
 * reads as a chart rather than as somebody's spreadsheet. A region with nothing in it draws no line at
 * all, which is the honest amount of ink for zero.
 */
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
   * `clampScrub` on the way out already refuses a cursor the window cannot hold, so a link opened days
   * later degrades on its own rather than pointing at nothing. It refuses in two directions, which is
   * the part this comment used to get wrong: ahead of the window releases to live, and older than the
   * window pins to the oldest moment the buffer still has. Either way the viewer is looking at a
   * different moment than they were sent, so `staleCursor` below says which one happened.
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
  /*
   * Which of the five layers actually answered.
   *
   * Optimistic until told otherwise: before the first request nothing has failed, and a page that opens
   * by listing feeds it has not asked yet would be crying wolf. A layer flips to false only when its own
   * fetch reports a failure, and back to true when a later poll succeeds - so a blip clears itself
   * instead of leaving a stale complaint on screen.
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
   * Declared here, above every memo that calls it.
   *
   * It was defined next to `now`, two hundred lines below the first `useMemo` that uses it, and a `const`
   * in a temporal dead zone is a runtime error rather than a type error - so `tsc` passed, the build
   * passed, and the page rendered nothing at all. `Globe.tsx` has a note about the same trap taking the
   * whole canvas with it.
   */
  /*
   * The same clock, as a stable function, for the memos that filter.
   *
   * They read the time inline rather than depending on `now`, deliberately: `now` changes on every
   * render, so listing it as a dependency would recompute a fifty-thousand-event sweep every second.
   * They key on `snapshot.revision` instead - and `showArchive` bumps the revision, so entering or
   * leaving an archive recomputes all of them exactly once.
   *
   * Reading the archive from the feed rather than closing over it keeps this identity stable, which is
   * the property the dependency arrays are relying on.
   */
  const clockAt = useCallback(() => feed.snapshot().archive?.to ?? Date.now(), []);
  /*
   * The other five layers, withheld while an archived day is on screen.
   *
   * They are fetched live and unconditionally, so an archived July drew **today's** storms, fires, floods,
   * volcanoes and aurora over July's earthquakes - the same "day that never happened" the archive stops
   * the socket to prevent. Closing that door on one feed and leaving it open for five was the bug.
   *
   * Withheld rather than backdated, because there is nothing to backdate to: GDACS's hazard lists are
   * flagged current rather than queryable by date, and the aurora is a forecast for the next minutes. No
   * keyless feed here can say what was burning on a Tuesday in July. So the archive is an earthquake
   * archive, which is what its banner says.
   */
  const archived = snapshot.archive !== null;
  /** The archived day as the notable list writes it, so a row can say it is the one on screen. */
  const loadedDay = snapshot.archive
    ? new Date(snapshot.archive.from).toISOString().slice(0, 10)
    : null;
  /*
   * The newest day the archive accepts, which is yesterday.
   *
   * Today is not offered because a day still in progress is what the live view already is, and the
   * banner claims "all day UTC" about whatever it loads. Read by the date field's `max` and by the
   * stepper's ceiling, so the two cannot disagree about where the archive ends.
   */
  const newestDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  /*
   * The two days either side of the loaded one, named rather than implied.
   *
   * The archive could reach any day and, once inside one, could only leave: the date field lives in the
   * live branch of this panel, so seeing 12 March meant going back to live, retyping a date and pressing
   * go. That is the wrong shape for what this app is good at, because a sequence does not stop at
   * midnight UTC - the aftershocks of Tōhoku keep arriving into the next day, and the day after a
   * mainshock is the most interesting neighbour any day has.
   *
   * Both buttons carry the date they lead to instead of "previous" and "next". A viewer on 2011-03-11
   * reads "2011-03-12" and knows what they are about to load, which a direction word cannot say.
   */
  const neighbours = snapshot.archive === null ? null : {
    prev: new Date(snapshot.archive.from - 86_400_000).toISOString().slice(0, 10),
    next: new Date(snapshot.archive.from + 86_400_000).toISOString().slice(0, 10),
  };
  /*
   * The archived day's storms, fires, floods and volcanoes.
   *
   * Held apart from the live arrays rather than pushed into them, because they come from a different
   * upstream with a different unit and must not be mistaken for the live layers by anything downstream.
   * `onGlobe` picks between the two, which is the one place that decision belongs.
   */
  const [archiveHazards, setArchiveHazards] = useState<History | null>(null);
  /*
   * What is actually drawn: the live feeds, or an archived day's four layers.
   *
   * The aurora has no archived branch and never will. NOAA publishes a *forecast* for a stamped minute, so
   * there is no past oval to ask for, and drawing tonight's over last July would be the one falsehood this
   * whole mode was built to avoid.
   *
   * An empty array when a day is loading or the archive did not answer, which draws nothing and says
   * nothing rather than leaving today's storms over a picture of July.
   */
  const onGlobe = {
    cyclones: archived ? archiveHazards?.cyclones ?? [] : cyclones,
    volcanoes: archived ? archiveHazards?.volcanoes ?? [] : volcanoes,
    fires: archived ? archiveHazards?.fires ?? [] : fires,
    floods: archived ? archiveHazards?.floods ?? [] : floods,
    aurora: archived ? null : aurora,
  };
  /** Computed here rather than in the legend, so the sentence is a render of a number and not a scan. */
  const fireSummary = useMemo(() => summarise(onGlobe.fires), [onGlobe.fires]);
  /*
   * The depth bands, on the store revision rather than the clock: the rail re-renders every second and
   * these counts only move when an earthquake does.
   */
  const depth = useMemo(
    () => depthBands(feed.store, filters, clockAt()), [filters, snapshot.revision],
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
  /*
   * The non-earthquake mark being asked about, as `kind:id`, or null.
   *
   * Held beside the pinned earthquake rather than folded into it: they are picked from the same click but
   * they are different things, and one selection that could be either would need unpacking everywhere it
   * is read. Resolved back to the thing itself at render, so a mark that has aged out of its feed since
   * being clicked simply stops having a card rather than freezing the last one.
   */
  /*
   * A shared mark, unless the link also names a day: an archived day withholds the five layers, so the id
   * would resolve to nothing and the card would never open. The card appears when the feed carrying it
   * arrives rather than at first paint, which is the same way a shared earthquake behaves.
   */
  const [markId, setMarkId] = useState<string | null>(shared.day ? null : shared.mark ?? null);
  /*
   * An archived day, or null for live. The span itself lives on the feed snapshot; this is the request.
   *
   * ARCHITECTURE.md recorded this as impossible without a backend, which was wrong - both agencies take
   * an arbitrary `starttime` and `endtime` keylessly. What the note was right about is the danger: a
   * scrubber that quietly makes "this is happening right now" false is the version worth refusing. So
   * loading a day stops the live sources, replaces the set, and every claim of liveness in the chrome
   * reads `snapshot.archive` and stands down. One button returns.
   */
  const [archiveDay, setArchiveDay] = useState("");
  /** Phone only: the three secondary header toggles, folded so the row fits one line. */
  const [moreOpen, setMoreOpen] = useState(false);
  /*
   * How many events each notable day holds, so the list carries the comparison it exists to make.
   *
   * The list named twelve days by magnitude, which is the one number that does *not* separate them: two
   * M9.1s sit next to an M9.5 and read as equivalent. The count is the fact worth seeing - 1960-05-22 is
   * an M9.5 with **6 events** and 2011-03-11 is an M9.1 with **684** - and `NOTABLE_NOTE` directly below
   * already explains why, so the number lands next to its own caveat instead of implying a quiet planet.
   *
   * Fetched when the list is opened, not on load: twelve requests for a panel nobody has looked at is
   * twelve requests too many, and `count` answers in forty bytes so opening it costs less than one day.
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
  /*
   * Why a complete date was refused, or null while one is still being typed.
   *
   * Only once ten characters are in: complaining at "2011-0" would be scolding somebody mid-word.
   */
  const dayFault = archiveDay.length < DAY_LENGTH
    ? null
    : !isRealDay(archiveDay)
      ? `${archiveDay} is not a date.`
      : !isArchivableDay(archiveDay, Date.now())
        ? "That day has not finished yet. The archive draws whole UTC days, so today is the live view."
        : null;
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  /*
   * A link carrying `d=` arrives in that day rather than live.
   *
   * Fired once on mount, after the live feed has started: `showArchive` stops the sources itself, so the
   * ordering costs one wasted seed request and buys not having a second startup path. Racing it ahead of
   * the feed would mean the live sources starting *after* the archive loaded and quietly refilling it.
   */
  const arrivedOnADay = useRef(false);
  const loadArchive = useCallback(async (iso: string) => {
    const span = dayRange(iso);
    /*
     * The ceiling lives here now, because this is what every path calls.
     *
     * It used to be the date field's `max` attribute, which is to say it was enforced by the browser on
     * exactly one of the four ways a day gets loaded - typed, pasted in a link, picked from the notable
     * list, or stepped to from a neighbour. Replacing that field with a text input would have removed the
     * only guard the typed path had.
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
  /*
   * A day either side, loaded the same way any other day is.
   *
   * Reads the span from the feed rather than closing over the rendered day, so this stays a callback with
   * one dependency and cannot go stale between a step and the answer landing. `archive.from` is midnight
   * UTC, so a day is exactly 86,400,000ms with no zone to get wrong.
   */
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
   * 1280, not 768, and the first attempt at this got it wrong in an instructive way. A phone's rail is a
   * 240px window onto 1,403px of content and the key was **448px of it**, so folding it there was
   * obvious. But the 768-1279 strip is 34dvh - 348px on a 1024-tall screen - and the key measures
   * **719px** in it: 2.1 times the visible height, which is worse than the phone's 1.9. Picking
   * `min-width: 768px` therefore left the worst case in the app untouched while looking like a fix.
   *
   * The real question is not screen width, it is whether the rail has room, and the rail only stops
   * being a strip at 1280 where it runs the full height. A key is read once; the events are why the
   * page is open.
   *
   * A stored answer always wins, in both directions, because somebody who folded it away or opened it
   * up has said what they want and a width is not an argument against that. This only decides the first
   * visit. Read once at mount rather than on resize for the same reason: re-deciding it when a window
   * changes size would overrule a choice the person had already made.
   */
  const [keyOpen, setKeyOpen] = useState<boolean>(() => {
    const saved = stored("legendKey");
    if (saved !== null) return saved !== "0";
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  /*
   * Written on the press, not in an effect on the value.
   *
   * As an effect it fired on mount and persisted the width-derived default, so a phone's first visit
   * saved "closed" as though somebody had chosen it - and the comment above, promising a stored answer
   * always wins, would have been describing its own footprint. Only a real toggle is a choice.
   */
  const changeKeyOpen = useCallback((next: boolean) => {
    setKeyOpen(next);
    store("legendKey", next ? "1" : "0");
  }, []);
  /*
   * The plate-motion arrows, persisted like the other view preferences and deliberately not in the
   * permalink: it is a reading of static geography, so a link that carried it would be sharing a setting
   * rather than sharing anything anybody is looking at. Off unless it has been asked for once.
   */
  const [motionOn, setMotionOn] = useState<boolean>(() => stored("motion") === "1");
  useEffect(() => { store("motion", motionOn ? "1" : "0"); }, [motionOn]);
  /*
   * Earthquakes drawn at their own depth, and the one view preference that defaults to on.
   *
   * The permalink stays out of it for the same reason the arrows do: it is a way of drawing what is
   * already there rather than a thing anybody is looking at. But it defaults on where the arrows
   * default off, because the two toggles cost different amounts. The arrows add 231 marks; this moves
   * marks that were already on screen to where the events actually were, and a scatter over a
   * subduction margin resolving into a dipping plane is the strongest thing the globe does. Off by
   * default, nobody would ever find it.
   */
  const [sinkOn, setSinkOn] = useState<boolean>(() => stored("depthSink") !== "0");
  useEffect(() => { store("depthSink", sinkOn ? "1" : "0"); }, [sinkOn]);
  /*
   * The slab, off until asked for, like the motion arrows and for the same two reasons.
   *
   * It is 37kB of static table that nothing on the first frame needs, and it is 1,583 marks on a globe
   * that is meant to be showing today. What it buys is the thing the depth sink cannot buy on its own: a
   * real day carries two events below 300km, so the geometry is right and the sample is far too thin to
   * be a shape. Five years of them is the shape.
   */
  const [slabOn, setSlabOn] = useState<boolean>(() => stored("slab") === "1");
  useEffect(() => { store("slab", slabOn ? "1" : "0"); }, [slabOn]);
  /*
   * Off by default, like the slab and the arrows.
   *
   * The sky itself is not a choice - it is the background - but joining the stars up is somebody's idea
   * about them, and a globe that opened as a star chart would be competing with its own subject.
   */
  const [figuresOn, setFiguresOn] = useState<boolean>(() => stored("figures") === "1");
  useEffect(() => { store("figures", figuresOn ? "1" : "0"); }, [figuresOn]);
  /*
   * The reader's own timezone, resolved once against a table fetched once.
   *
   * Not a toggle, because there is nothing to ask: the zone is already readable by any page without a
   * prompt, nothing is sent anywhere, and a line naming a city is not a setting anybody would want to
   * turn off. Fetched lazily all the same - 13kB of coordinates has no business in the first frame.
   */
  const [zones, setZones] = useState<ZoneTable | null>(null);
  useEffect(() => {
    let alive = true;
    void loadZones().then((next) => { if (alive) setZones(next); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const here = useMemo(() => (zones ? viewerPlace(zones, localZone()) : null), [zones]);
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
   * Not optional the way the motion arrows are - every event in the panel gets a distance - and not
   * deferred either, because the globe draws these same boundaries on the first frame. It used to be a
   * promise and two renders, the first of which had no distances in it, to defer a file the build had
   * already decided was first-paint geometry.
   */
  const segments = useMemo(() => boundarySegments(), []);
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
  // Same shape as the arrows above: fetched once on first use, and a failed import leaves it empty,
  // which draws nothing and says nothing rather than throwing.
  const [slabData, setSlabData] = useState<readonly SlabPoint[]>([]);
  useEffect(() => {
    if (!slabOn || slabData.length > 0) return;
    let alive = true;
    void loadSlab().then((next) => { if (alive) setSlabData(next); }).catch(() => {});
    return () => { alive = false; };
  }, [slabOn, slabData.length]);
  // And the same again for the constellation lines: 5kB, fetched the first time anybody asks.
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
        // The archived day, so the link stops claiming live the moment the app does.
        day: snapshot.archive
          ? new Date(snapshot.archive.from).toISOString().slice(0, 10)
          : null,
        // The selected storm, fire, flood or volcano, by the agency's own id.
        mark: markId,
        section: sectionLine,
        /*
          The moment, not the playing state.

          A link that arrives already running would be motion the recipient did not ask for, which is
          the same objection DESIGN.md makes to ambient rotation. It arrives held, and pressing play is
          theirs.
        */
        /*
         * The moment being shown, not the one that was asked for.
         *
         * `scrub` keeps the link's original value so the notice above can tell it was refused, and
         * writing that value back out made the link advertise a moment the app was not drawing - so
         * re-sharing propagated it. What you copy out matches what you are looking at, which is the same
         * rule the archived day and the mark key already follow.
         */
        cursor: view.at,
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
    /*
     * `snapshot.archive` is a dependency because `write` closes over it, and the interval below keeps
     * calling the closure it was created with. Without it, entering an archive left the link saying live
     * until some other dependency happened to change - which is the bug this whole field exists to fix,
     * one layer down.
     */
  }, [filters, selected, ramp, sectionLine, snapshot.archive, markId]);

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

  /*
   * The clock everything filters against, which is not always the wall clock.
   *
   * In archive mode it is the **end of the archived day**. Every window, strip, dial and count in this
   * app is defined as "the last N hours before now", so with the wall clock an archived day filtered to
   * nothing: the store held 702 events from July and the headline read 0. Substituting the span's end
   * makes "the last 24 hours" mean the last 24 hours *of that day*, which is exactly what was fetched,
   * and every derived reading follows without a second code path.
   *
   * The cost is that relative labels - "3h ago" - become relative to that day rather than to today,
   * which is honest inside a mode whose banner says the date and "nothing here is arriving now", and
   * would be a plain falsehood without it. That banner is load-bearing, not decoration.
   */
  const now = snapshot.archive ? snapshot.archive.to : Date.now();

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
  /*
   * The counts, read at the moment of capture rather than depended upon.
   *
   * Listing them in the callback's dependencies is not available: `headline` is declared several hundred
   * lines below this, so naming it in the array is a use-before-declaration rather than a closure. And
   * leaving them out is what produced a poster with a blank evidence line, computed from the first
   * render's empty planet. Same mirror `Globe.tsx` keeps for `live`, and for the same reason: a still
   * should state what is on screen when the button is pressed, not what was on screen when this callback
   * was last rebuilt.
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
      /*
        The day's start, not the clock.
        `clockAt()` hands back `archive.to`, and `dayRange` makes that *exclusive* - `from + 86400000`,
        which is the next day's midnight. So a still of 2026-05-15 was captioned "Archived day
        2026-05-16" while the rail beside it said the 15th: two places, one day, two answers, and the
        wrong one on the only artefact that leaves the app.
      */
      moment: stillMoment(
        view.at, feed.snapshot().archive?.from ?? clockAt(), feed.snapshot().archive !== null,
      ),
      /*
       * The evidence, from the gated set rather than the raw feeds.
       *
       * `onGlobe` is what is actually drawn, so an archived day states its earthquakes and claims no
       * storms - the layers are withheld on that path, and a still that counted them would be describing
       * a different picture than the one above the caption.
       */
      verdict: verdictLine(stillCounts.current),
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
      // The ramp the marks were drawn in, so the still can print the scale it used.
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
    () => countByRegion(feed.store, filters, clockAt()).filter((r) => r.count > 0),
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
  /** The head of the region list, which is what every share bar in it is a share of. */
  const busiest = regions[0]?.count ?? 0;
  const [tourAt, setTourAt] = useState<number | null>(null);
  /*
   * Which stop the camera has actually reached, as opposed to which one it is flying to.
   *
   * The narration is what makes this feature legal under DESIGN.md 13 - the ban is on motion that means
   * nothing, and the line answers it by saying where the camera is and how much is there. Measured, it was
   * not doing that: the label and the flight both change on the same tick, so for the first few seconds of
   * every stop the rail named the destination while the globe still showed the last one. Sampled mid-tour,
   * it read "Japan & Kurils · 685 events" at longitude -82.8, which is Chile.
   *
   * A ref for the target and a stable setter, because `onCamera` is captured once when the scene is built:
   * an inline closure over `tourAt` would compare against whatever the value was on the first render, which
   * is the same reason the camera itself is written to a ref rather than to state.
   */
  const tourTarget = useRef<{ lon: number; lat: number; index: number } | null>(null);
  const [tourArrived, setTourArrived] = useState<number | null>(null);
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
  const quiet = useMemo((): {
    note: string | null; parts: { percent: number; times: number } | null;
  } => {
    // Vestigial now that the boundary file is a static import, kept so an empty file degrades to
    // "no cell, no note" rather than a percentage of nothing.
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
  /*
   * The clicked mark, resolved from the arrays that are already held.
   *
   * Looked up at render rather than captured on click: the feeds refresh every ten minutes, and a card
   * built from a snapshot would keep describing a storm the feed had dropped. If it is gone, so is the
   * card.
   */
  /*
   * The list is built from `onGlobe`, not from the raw feeds, so it holds exactly what is drawn: in an
   * archived day the layers are withheld and the list goes with them rather than offering rows that
   * point at nothing.
   */
  const hazards = useMemo(() => hazardGroups(onGlobe),
    [onGlobe.cyclones, onGlobe.volcanoes, onGlobe.fires, onGlobe.floods]);
  const markSubject = findSubject(markId, onGlobe);
  /*
   * Pinning an earthquake from anywhere clears the mark card.
   *
   * The globe's own click already does this, but the rail's rows, the largest-event row and the panel's
   * sequence steps all call `setSelected` directly, and any of them leaving a storm's card on screen
   * beside a newly pinned earthquake would be two answers to one question.
   */
  const selectQuake = useCallback((key: string | null) => {
    // Only on the way in. Dismissing is already confirmed by the panel leaving.
    if (key !== null) tick();
    setMarkId(null);
    setSelected(key);
  }, []);
  const marks = useMemo(
    () => marksFor({
      ...onGlobe, farSide, motion: motionOn ? motionData : [],
    }),
    [onGlobe.cyclones, onGlobe.volcanoes, onGlobe.fires, onGlobe.floods,
      farSide?.lon, farSide?.lat, motionOn, motionData],
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
      } else if (e.key === "f" || e.key === "F") {
        /*
         * The whole window, and only the planet in it.
         *
         * Two things at once, because either alone is half the gesture: the browser's own chrome goes,
         * and so does the app's. What is left is the globe, which is what somebody is doing when they
         * turn a screen round to show it to the person next to them.
         *
         * **Escape is the way back and the browser provides it**, which is why hiding the controls here
         * is safe when it would not be otherwise: there is no state to get stuck in, because leaving
         * fullscreen is a key every viewer already knows and the chrome returns with it. The app listens
         * for the change rather than tracking its own flag, so exiting by any route - the key, the
         * browser's button, another tab taking over - lands in the same place.
         *
         * Requested on the frame rather than on `documentElement`, so the black letterboxing a display
         * with a different aspect ratio adds belongs to the page's own background rather than to the
         * browser's.
         */
        const el = document.querySelector(".frame");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else if (el) void (el as HTMLElement).requestFullscreen?.().catch(() => {});
      } else if (e.key === "[" || e.key === "]") {
        /*
         * Days, where the comma and the full stop do buckets.
         *
         * No mode check here: `stepDay` reads the feed and returns when no archived day is loaded, so
         * this is inert on the live view by construction rather than by a condition that could drift
         * from the one in the button. The ceiling is `loadArchive`'s, so `]` on yesterday does nothing
         * rather than loading a day that has not finished.
         */
        e.preventDefault();
        stepDay(e.key === "]" ? 1 : -1);
      } else return;
      // Space scrolls a page, and this one is `overflow: hidden` for exactly that reason already.
      // Preventing it here as well means the transport does not depend on that staying true.
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
    () => feed.store.newest(60, (q) => matches(q, filters, clockAt())),
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

  const { bars, strongest, bucketMs, energyShare, energyTotal, overlap } = useMemo(
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
    () => search(query, feed.store, filters, clockAt()),
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
    () => diurnal(feed.store.forEach, filters, clockAt()),
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

  /*
   * The count in the tab, so leaving it open is worth something.
   *
   * This app is built to be left running - the entrance exists because "somebody opens the page for ten
   * seconds" was the case worth designing for - and a tab that says the same four words all day gives a
   * reader no reason to glance back at it. The number is already the answer the whole rail is arranged
   * around; the title is the one place it was missing.
   *
   * **Not during the replay.** The count climbs through a whole day in 2.8 seconds, and a title rewritten
   * on every frame of that is a flickering tab rather than a readout. It is also not information: the
   * replay is showing yesterday.
   *
   * **The archived day says which day.** Otherwise the tab reads as a live figure for a date the reader
   * chose hours ago, which is the same misstatement the banner exists to prevent on screen.
   *
   * Leading, because a tab is truncated from the right and the number is the part worth keeping.
   */
  useEffect(() => {
    const base = "Everything Is Fine";
    if (replay || snapshot.coveredSince === null) {
      document.title = base;
      return;
    }
    /*
     * The day that is loaded, not the day in the box.
     *
     * `archiveDay` is the field's own text, so it changes on every keystroke: typing a new date while an
     * archive was already open put half a date in the tab for a day nobody was looking at. The snapshot's
     * own span is what is actually drawn.
     */
    const at = snapshot.archive;
    const day = at ? `${new Date(at.from).toISOString().slice(0, 10)} · ` : "";
    document.title = `(${headline.toLocaleString("en-GB")}) ${day}${base}`;
  }, [headline, replay, snapshot.coveredSince, snapshot.archive]);
  /*
   * Mirrored for the still, right where the count it needs finally exists.
   *
   * `headline` rather than the raw total, so the number stamped on the image is the number that was on
   * screen: while the entrance is replaying or the cursor is parked, the rolled value is what the globe
   * is actually showing, and a poster claiming the window total over a half-drawn planet is the same lie
   * the replay counter was added to stop.
   */
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
  /*
   * Both ways the clamp can refuse a moment, not just one.
   *
   * This tested `view.at === null`, which is only the *future* branch: `clamp` sends a moment at or past
   * the window's end to live, and a moment **older** than the window to `span.from` - still held, just at
   * a different time than the link asked for. The second is the common case, since any link shared longer
   * ago than the window falls into it, and it was the silent one: the recipient saw "held" at a moment
   * nobody sent them. Comparing against the shared value covers both.
   */
  const staleCursor = shared.cursor !== undefined
    && scrub.at === shared.cursor
    && view.at !== shared.cursor;

  const edge = windowStart(now, filters.windowMs, snapshot.coveredSince);

  /*
   * Today against five years of days, or null when the comparison would not be true.
   *
   * Three gates, and each one is a claim that would otherwise be false. **Only at 24h**, because the
   * baseline counts calendar days and ranking a thirty-day total against them would say the planet was
   * busier than every day on record, every time. **Only once the window is covered**, because a day still
   * filling reads as quiet by construction - the same gate the energy line uses, for the same reason.
   * **An archived day needs neither**, since it is a whole finished day already and its own bounds are
   * the exact span the baseline is made of.
   */
  /*
   * The closest event in the window to the reader's city, or null when there is nothing to say.
   *
   * Held back during the replay for the same reason every other note is: the window is being filled in
   * front of the viewer, so "the closest today" would name whichever event the animation had reached.
   */
  const near = useMemo(() => {
    if (replay || here === null) return null;
    // `view.at` is the parked cursor, or null when live: the moment the globe is actually drawing.
    return closestTo(feed.store, here, filters, clockAt(), view.at ?? clockAt());
    // `snapshot.revision` moves on every ingest; the rest are what the answer depends on.
  }, [feed.store, here, filters, snapshot.revision, replay, view.at]);

  /*
   * Whether the browser is in fullscreen, read from the browser rather than remembered.
   *
   * Tracking a flag of our own would drift the moment somebody leaves by a route the app did not
   * initiate, and there are several: the Escape key, the browser's own control, another tab claiming the
   * display. The event is the single source, so every exit lands in the same state.
   */
  const [cinema, setCinema] = useState(false);
  useEffect(() => {
    const sync = (): void => setCinema(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const versus = useMemo(() => versusReference(energyTotal), [energyTotal]);

  /*
   * The window's largest against what its region has managed this century.
   *
   * Keyed off `strongest`, which the histogram already found while walking the buffer, so this is a box
   * test and a table lookup rather than a pass of its own.
   */
  const ceiling = useMemo(
    // As of the day on screen, not as of today: an archived day must not be handed a record from its
    // own future. `archive.from` is that day's own midnight.
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
     * The count here deliberately ignores the magnitude filter - a ranking the reader could change by
     * dragging a slider would be worse than none - and that is right until the filter empties the screen
     * altogether. Caught by filtering to M7 against a feed whose largest was 4.9: the headline read 0, the
     * list read "No events match the current filters", and this line asserted "5 at M4.5+". True of the
     * day, and the header's own note forbids exactly that shape - "a true number describing something
     * other than the picture".
     *
     * Gated on nothing at all rather than on any filter, because with a few events drawn the reader can
     * see the two populations differ; with none, the screen actively contradicts the sentence.
     *
     * On the *displayed* count rather than the window's, which is the same distinction one layer down. The
     * first version read `shown`, the window total, so parking the cursor at the start of the window put
     * "103 at M4.5+" under a headline reading 0. `revealedNow ?? shown` is exactly what the headline
     * itself prints, so the two can no longer disagree about whether there is anything on screen.
     */
    if ((revealedNow ?? shown) <= 0) return null;
    return rankDay(comparableCount(feed.store, edge.at, now), true);
    // `snapshot.revision` is what moves when an event lands; the rest are the gates above.
  }, [feed.store, snapshot.archive, snapshot.revision, filters.windowMs, edge.complete, edge.at, now, replay, shown, revealedNow]);
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
                aurora={onGlobe.aurora}
                cyclones={onGlobe.cyclones}
                volcanoes={onGlobe.volcanoes.length}
                volcanoesSince={newestEpisode(volcanoes)}
                /*
                  The archived day's clock, not this minute's.
                  `volcanoNote` counts the days since the newest eruption episode ended, and its
                  `archived` flag only swapped the tense clause: the number itself came from
                  `Date.now()`, so a picture of 2026-05-15 read "ended 99 days ago, so none of this was
                  erupting then". `EventList` and `DetailPanel` both carry a comment about fixing this
                  same fault; the key was the third place and nothing brought the three together.
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
                  Offered wherever it can change something, which is no longer just the globe.

                  It was hidden on the flat map because a plane has no inside and the layer collapses -
                  correct until the cross-section started reading the same table. A section is a depth
                  plot and only exists on the map, so on the map the control now appears exactly when a
                  section is open: otherwise it would be a button that does nothing, which is the thing
                  hiding it was avoiding in the first place.
                */
                figuresOn={flat ? null : figuresOn}
                onFigures={setFiguresOn}
                slabOn={flat && sectionLine === null ? null : slabOn}
                onSlab={setSlabOn}
                slabCount={slabData.length}
              >
              {/*
                Sources sit with the magnitude control because both answer "what is on the globe".

                Passed in as a child so they land *above* the folding key. Once the panel gained a
                max-height they were at the bottom of a scrolling column and off the fold at 1280x720 -
                a control the viewer had to scroll prose to reach. All the controls are above all the
                commentary now, which is the split the fold already claimed to make.
              */}
              {/*
                Two toggles with nothing naming them.

                The window buttons in the strip carry `role="group"` and a name; these carried neither, so
                a screen reader met two unexplained pressed-states and a sighted reader met two of the
                largest elements in the panel with no label at all. The slider above says what it filters
                in its own label, and now so does this.
              */}
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
                      Sized to their labels rather than to the panel.

                      `flex-1` gave each of them half the key's width, which made two secondary filters
                      the largest, heaviest objects in a panel whose subject is what the marks mean. They
                      out-weighed the magnitude slider above them and every row of the key below.

                      Pressed is `border-faint`, which is what a pressed control wears in the detail panel
                      and on the window buttons. This one had it on hover instead, so the state you were
                      about to enter looked like the state you were in.
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
      {/* The header used to hold a wordmark and two small words on a 1280px bar. It now carries
          the arithmetic that makes the reconciliation visible without opening anything. */}
      {/*
        A top edge, so the frame closes.

        The rail carries `xl:border-r` and the panel a `border-l`, and above 1280 this header goes
        transparent and carries nothing - so the chrome had a left wall and a right wall and no lid, and
        the wordmark and the controls floated loose over the canvas. A hairline is the same rule weight
        every other boundary here uses; it seats the row without drawing a bar across the top of the
        planet.
      */}
      <header className="zone-head flex items-center gap-6 bg-deck px-5 py-3 xl:border-b xl:border-hairline xl:bg-transparent" hidden={cinema}>
        <div
          /*
            Aligned to the first row of controls, not to the middle of them.

            The control group wraps to two rows on a phone, which is a decision the note below defends,
            and `items-center` on the header then floated this wordmark between those two rows: an
            L-shape with "Still" orphaned diagonally opposite it. Scoped to `max-md` because that is
            exactly where the wrap happens, so every wider header keeps the centring it was designed
            with. `pt-1` matches the buttons' own top padding, so the two sit on one line rather than
            merely starting at the same pixel.
          */
          className="text-[13px] font-semibold tracking-[0.16em] whitespace-nowrap max-md:self-start max-md:pt-1"
        >
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
        {/*
          Four numbers, no grammar, and the wrong frame of reference.

          They read "160 USGS 37 EMSC 160 distinct 37 both": value before label, four times, so the eye
          takes a number and then goes hunting for what it counted. Two of the labels were jargon
          fragments - "distinct" and "both" are the ends of sentences nobody wrote.

          **And they ignore the filters, which is the part that actually misleads.** These are ingest
          totals. Set the magnitude filter to 4 and the headline reads 5 while this row still says 160:
          two numbers a factor of thirty apart in one viewport, with nothing to say they answer different
          questions. The headline's own note forbids exactly this - "a true number describing something
          other than the picture" - and it was written about a counter that was wrong for a few seconds
          during the replay, while this one is wrong for as long as a filter is set.

          So the labels now say whose number it is. The globe's count is in the title block under "last 24
          hours"; this row is what the agencies sent, whatever is drawn, and "reported" says so. The
          per-agency figures are readings rather than events - one event seen twice is two readings - and
          they move to the end as provenance, which is the question they answer.
        */}
        <div className={`hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "xl:flex"}`}>
          {([
            // Grouped like the readings beside them: "1600 reported" next to "USGS 1,600" was one row
            // formatting the same kind of number two ways.
            ["reported", snapshot.stats.quakes.toLocaleString("en-GB")],
            ["seen by both", snapshot.stats.corroborated.toLocaleString("en-GB")],
            // Only once it has happened. A permanent "0 revised" is a slot in the header reserved
            // for nothing, and this is the one stat that is interesting precisely because it moves.
            ...(snapshot.stats.revised > 0
              ? [["revised", snapshot.stats.revised.toLocaleString("en-GB")] as const]
              : []),
          ] as const).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink tabular-nums">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
          {/*
            Figures in mono, words in sans, which is what the pair beside this already does.

            I wrote this line yesterday and set the whole thing in sans, so the one provenance line in the
            header disagreed with the two labelled figures 20px to its left. The mono spans sit on the mono
            step rather than the sans one: 10.5 beside 11 is the optical match the rest of the chrome uses,
            because mono digits read larger than sans text at the same pixel size.
          */}
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
            className={`${moreOpen ? "" : "max-md:hidden"} shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
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
          {/*
            The three above fold away on a phone, behind this.

            Measured: five controls want 419px of a 390px header, so the row wrapped and left "Still" plus
            the status dot alone on a second line with the rest empty - 120px of an 844pt viewport for one
            button and a dot. The note on the wrap defends it against the alternative it was weighed
            against, which was clipping a control out of reach; this is the third option neither considered.
            Map and the ramp stay out of the fold: one is the projection, the other is an accessibility
            control, and neither should cost a tap.

            Nothing is clipped and nothing is unreachable. The row fits, and the rest is one tap away.
          */}
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
              While an archived day is on screen this says the day, not the feeds.

              The whole risk in this feature is a chrome that goes on saying "both feeds live" over a
              globe showing last March. The status is read from the snapshot, so there is one place that
              decides whether this app is claiming to be live.

              **The two halves hide differently, and that asymmetry is the point.** Both used to sit
              behind `hidden sm:inline` for header width, which meant a phone showed a globe of last May
              with a faint dot and no words - the same failure the paragraph above is about, with nothing
              on screen to argue with. A status that says "everything is normal" is reassurance and can
              be dropped when space is tight, because the dot carries it. One that says "this is not what
              you think" is a correction, and absence is its failure mode. So the date always shows and
              the live phrase is the only part that folds.
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
          {/*
            The title block, which is where the four stacked prose blocks went.

            Count, window and largest are values, so they sit in framed cells the way a drawing sheet
            carries them. The reasoning that used to be three more paragraphs is one NOTES row below.
          */}
          <div className="titleblock">
          <div className="tb-cell tb-wide" data-rail="headline">
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
                {/*
                  Which day, when the day is not today.
                  `archive` and `coveredSince` are both set by the same success handler, so a page
                  opened straight at a past day - every link in the notable-days list - looks live
                  until the answer lands, and this line said "the last day" about 2011. The request
                  knows better than the answer does: `archiveDay` is set before the fetch starts.
                */}
                {/*
                  "Asking" stops being true once both feeds have already answered no.

                  Caught by refusing every request: eighteen seconds in, the largest line in the rail read
                  "Asking USGS and EMSC for the last day" while the notice directly under it read "USGS is
                  not answering... Retrying at 17:30". Nothing was being asked - the app was waiting out a
                  backoff - so the most prominent text on screen described an activity that had stopped.

                  Only when *both* are failing. One feed down is a caveat the notice already carries, and
                  the app is genuinely still asking the other one.
                */}
                {snapshot.statuses.usgs.kind === "failing" && snapshot.statuses.emsc.kind === "failing"
                  ? "Neither feed is answering yet."
                  : archiveBusy && archiveDay
                    ? `Asking USGS and EMSC for ${archiveDay}.`
                    : "Asking USGS and EMSC for the last day."}
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
                    {windowLabel(now, filters.windowMs, snapshot.coveredSince, archived)}
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
          {/*
            One cell, because it was always one fact.

            The note this replaces had already worked out the relationship - "the band is the
            percentage's unit, so on its own it frames a measurement nobody took" - and then rendered the
            unit as a labelled cell of its own, beside the reading, at the same weight. Three cells in
            this block held four facts of apparently equal standing, and one of them was a constant
            nobody measured. `QUIET_BAND_KM` is not a control; it is the width the percentage is a
            percentage *of*, so it now reads as part of the sentence the percentage is making.

            The figure keeps the mono and the ink because it is the reading. The qualifier is body text
            in `dim`, which is the same division the largest-event row makes between its magnitude and
            its place.
          */}
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
          {/*
            One tenant for the notes area, because the grid only has one.

            Four separate paragraphs used to sit here as siblings, and on the tablet strip that is
            four bugs. Only `.tb-notes` is named, and it is named twice - the notes block and the
            silent-feeds block both match it, so a dead feed stacked one on top of the other. The two
            bare paragraphs matched nothing and auto-placed into implicit rows: measured at 900x1000,
            the ranking line alone added 54px to a strip already overflowing by 250.

            That is the same failure the grid comment upstream describes from last time, and the same
            reason no test caught it: this rail scrolls, so everything stayed technically reachable
            while the transport went under the fold.
          */}
          <div className="tb-stack">
            {!replay && quiet.note ? (
              <div className="tb-notes">
                <span className="label">Notes</span>
                <p className="text-[11px] leading-relaxed text-faint">{quiet.note}</p>
              </div>
            ) : null}
            {/*
              The layers that could not be asked.

              Beside the notes rather than in the legend, because it is a statement about the window like the
              others here, and because the legend's rows are the very things that vanish when a feed dies -
              an explanation of an absent layer cannot live inside the layer's own absent row. Archived days
              withhold these feeds by design, so this stays out of their way.
            */}
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
              Ordered to follow the card above, not the order they were written in.

              Each of these is a footnote to one of the figures in the title block: the ranking explains
              the headline count, the region's ceiling explains the largest event beside it, and the note
              above explains the edge percentage. They arrived in the order they were built, which put the
              ranking three paragraphs from the number it is about.

              The energy comparison sits after the ceiling because the two answer the same question - how
              big is big - on different axes, and the personal line goes last because it is the only one
              that is not about the window.
            */}
            {/*
              Whether any of that is a lot, which nothing on this screen said.

              The headline is a count with no scale attached, and section 13 bans exactly that shape of claim
              everywhere else in the app. This is the scale.

              It states its own threshold because it has to: the ranking is of magnitude 4.5 and up, which is
              not necessarily the population drawn on the globe beside it. That is not a caveat, it is the
              only way the comparison means anything - how many small events get detected depends on how many
              instruments are nearby, so an all-magnitude count differs between 2020 and 2025 for reasons of
              funding rather than of geology.
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
              And what that region is actually capable of.

              The rail names the largest event and its magnitude, and a magnitude with nothing beside it is
              the same defect as a bare count: "M6.1, Japan & Kurils" reads as enormous to anybody who has
              not spent time with the scale, and it is an ordinary week there.

              Two forms, and the rare one is the point. Most days this states the ceiling and leaves the
              comparison to the reader. On the day the window's largest clears it, the app has a genuine
              superlative to report - and "since at least 2000" is where the generated table starts, so the
              claim is bounded rather than overstated. Valdivia is older than the table and larger than
              anything in it.
            */}
            {/*
              Silent when nothing is drawn, for the reason the ranking above is.

              The region it names is derived from the window's strongest event, so with the cursor parked
              before anything has arrived it was naming Indonesia beside an empty globe - a place made
              relevant by an earthquake the reader cannot see. The Valdivia line below needs no such gate:
              it says "in this window" out loud, so its scope is on the page.
            */}
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
            {/*
              And whether the window itself is large, which the line above cannot say.

              The share teaches the logarithm inside one window; it has nothing outside itself to be
              measured against, so a quiet day and a catastrophic one both read as "one event was most of
              it". This is the same fact given an outside reference, and on the energy axis the answer is
              worth printing: an ordinary day sits five or six orders of magnitude below one 1960.

              One event against a whole window is asymmetric, so the wording carries the asymmetry rather
              than hiding it. It also makes the claim conservative - the real day was larger than its
              mainshock, and no feed reaches 1960 to say by how much.
            */}
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
              The one line on this screen that is about the reader.

              It names a city rather than a person, and that is not hedging, it is the only true version of
              the sentence. A timezone is a region: Asia/Shanghai covers all of China, so "310 km from you"
              would be a confident claim about somebody, built from a value that only ever described a
              reference point. Named, it is true for every reader of that zone and still their own city for
              most of them.

              The arrival time appears only inside the 700km that `arrival.ts` already caps at, because
              past that the wave is diving through the mantle and a crustal speed stops describing its
              path. Most days the closest event is further away than that, so the distance stands alone.
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

          {/*
            The same window, folded onto the clock.

            Under the activity strip because both answer "when" and neither answers it the other's way:
            the strip is elapsed time and this is time of day, and the interesting thing about this one
            is that it has nothing in it. Behind a disclosure for that reason, and next to the strip so
            the two readings of one word sit together.
          */}
          <details data-rail="diurnal">
            <summary className="disclose text-[11px] text-faint hover:text-dim">
              Time of day
            </summary>
            <Dial counts={clockBins} />
          </details>

          {/*
            The key floats only where there is somewhere for it to float.

            `onMap` is `useWide`, so the floating copy appears at 1280 and up whatever is being drawn. On
            the globe that corner is ocean and empty space, which is why it works there. The flat map has
            no such corner: it fills its whole rectangle, so a panel over it permanently hides part of the
            Pacific and the Americas, and panning cannot get out from under it.

            Flattened, the key comes back to the rail - the same place it lives below 1280 - and the map
            gets its whole rectangle.
          */}
          {onMap && !flat ? null : <div data-rail="legend">{legend}</div>}

          {/*
            The day, and the control for the window that was previously unreachable. Sits under the
            magnitude filter because they are the same kind of thing: both say what is on the globe.
            The globe answers "where" and cannot answer "when" at all, which is the gap this fills.
          */}
          {/*
            A day that has already happened, next to the controls that say "when".

            Under the strip rather than in the header, because it belongs with the window buttons: those
            choose how much of the recent past to show, and this chooses a different past entirely. In the
            header it would have read as a view option beside the projection toggle.

            The banner is not decoration. It is the one thing standing between this feature and the
            version the design notes refused - a globe showing last March while the interface says live -
            so it states the day, what each agency actually answered, and how to get back, and it is the
            widest thing in the rail while it is up.
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
                {/*
                  The neighbours, under the day they are neighbours of.

                  Disabled while a day is in flight, because two overlapping archive loads would race and
                  the second answer is not necessarily the second request. The forward button also stops
                  at yesterday, which is the same ceiling the date field has: past it is the live view.
                */}
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
                {/*
                  Said out loud, because absence is the one thing a viewer cannot notice.

                  This used to read "earthquakes only", which was true of the feeds the app had and false
                  as a claim: GDACS holds no history but NASA's EONET does, so the four layers arrive from
                  a different upstream on an archived day. What is genuinely absent is the aurora, and that
                  one is permanent - a forecast for a stamped minute has no past to ask for.
                */}
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  Storms, fires, floods and volcanoes come from NASA rather than the live feeds. No aurora:
                  it is a forecast, so there is no past to ask for.
                </p>
                {archiveNote ? (
                  <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-faint">{archiveNote}</p>
                ) : null}
              </div>
            ) : (
              /*
                Label above rather than beside the field.

                Side by side, the label and the "go" button took the fixed width and the date field got
                what was left, which in the 768px strip was 60px: a date input showing "mm / d" and a
                calendar icon, too narrow to read and under the touch minimum. A native date field has
                a floor its own locale sets, so it gets the row and the label gets its own line.
              */
              <div className="mb-3">
                <label className="label" htmlFor="archive-day">Go to a day</label>
                <div className="mt-1 flex items-center gap-1.5">
                {/*
                  A field in the same hand as everything around it.

                  `type="date"` was the one browser widget left in the rail: a platform calendar button, a
                  locale-dependent order, and a `mm/dd/yyyy` prompt asking for a format this app never
                  prints. Every date on screen here is ISO, so the field now asks for what the app shows
                  and a day can be copied out of the notable list and pasted straight in.

                  The native picker is a real loss on a touch screen, and the notable list is the answer to
                  it: that is the way in, and this field is documented as being for somebody who arrived
                  with a date in mind. What they lose is a calendar grid; what they gain is a field that
                  takes the string the rest of the interface hands them.
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
                {/*
                  Said where it was caused, because the note that would have said it cannot be seen here.

                  `archiveNote` renders inside the archived banner, which is the other branch of this
                  ternary: a day refused while live would have set a message nobody could read, and a
                  disabled "go" with no reason is the same silence the filters used to keep. Derived rather
                  than stored, so it cannot outlive the value that caused it.
                */}
                {dayFault ? (
                  <p id="archive-day-fault" className="mt-1 text-[11px] leading-relaxed text-faint">
                    {dayFault}
                  </p>
                ) : null}
              </div>
            )}
                {/*
                  Days worth seeing, because a blank date field asks for a date nobody knows.

                  Outside the archived/live branch on purpose. Inside it, the list vanished the moment a
                  day loaded, so going from Valdivia to Tōhoku meant "back to live", waiting for the live
                  feeds to seed, reopening this and picking again - clumsy for the one thing the list
                  exists to make easy. `loadArchive` replaces a loaded day as readily as it loads the
                  first, so hopping is a click.

                  Behind a disclosure and closed by default: it is a way in, not a menu, and the field
                  above stays the answer for somebody who came with a date already in mind.
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
                        /*
                          Sets the field as well as loading, so the control that says which day is on
                          screen agrees with the day on screen.
                        */
                        onClick={() => { setArchiveDay(d.day); void loadArchive(d.day); }}
                        aria-label={`${d.what}, magnitude ${d.magnitude}, ${d.day}`
                          + (typeof dayCounts[d.day] === "number"
                            ? `, ${dayCounts[d.day]!.toLocaleString("en-GB")} events`
                            : "")}
                        /*
                          Marks the day on screen, the way the hazard rows mark the selected mark.
                          Worth having only since the list stopped vanishing when a day loads: a list you
                          can hop around in should say where you are, and `aria-current` says it to a
                          screen reader rather than leaving the tint to carry it alone.
                        */
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
                        {/*
                          Blank until it answers, and blank if it never does. A dash or a zero here would
                          be a claim about the day rather than about the request.
                        */}
                        <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-faint tabular-nums">
                          {dayCounts[d.day] === undefined || dayCounts[d.day] === null
                            ? ""
                            : dayCounts[d.day]!.toLocaleString("en-GB")}
                        </span>
                      </button>
                    ))}
                    {/*
                      Required, not decoration: 1960 returns six events against Tōhoku's 685, and
                      without this a reader takes a true number as a claim about the planet.
                    */}
                    <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{NOTABLE_NOTE}</p>
                  </div>
                </details>
            {/*
              The seam between choosing a day and reading one.

              This block holds three jobs at one indent - pick a past day, pick the window, read and
              scrub time - and the middle one starts with a row of buttons directly beneath a closed
              disclosure. Proximity was the only relationship on offer, so "Days worth seeing" read as
              the label for 24h/7d/30d: two unrelated controls glued into one by a 12px gap. A rule
              costs one line and says which side of it a control belongs to.
            */}
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
              waiting={snapshot.coveredSince === null}
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
          {/*
            Open when there is either kind of thing to list.
            It was gated on the region rows alone, which quietly tied the hazard list to the earthquake
            feed: with USGS and EMSC still answering, the storms and fires were on the globe and the list
            of them was not in the DOM at all. The five layers do not depend on the two agencies.
          */}
          {regions.length > 0 || hazards.length > 0 ? (
            <div data-rail="regions" className="relative">
              {/*
                Somewhere to search, and the results stand in the region rows rather than beside them.
                Four region rows were the entire navigation: a person who wants Japan had to either
                find it among whichever four are showing or drag the globe until it appeared. Results
                replacing the rows keeps the rail the same height and asks the same question the rows
                already answer, with a filter on it.
              */}
              {regions.length > 0 ? (
                <>
              {/*
                Label above the field from the phone up to the desktop rail, beside it only where the
                column is wide enough to spare the room.

                Third instance of one mistake: a label sharing a row with the value it names takes its
                width first. In the 768px strip this column is ~180px, the label took what it needed, and
                the field was left with 87px for a placeholder that measures 134 - so it read "a region
                or a pla". The other two were the day field and the largest-event row.
              */}
              <div role="search" className="mb-1.5 flex flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-2">
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
                  /*
                    The same box as the day field, and the same focus ring as everything else.

                    Two text inputs sat in this rail wearing different clothes: that one a hairline box,
                    this one a bottom border, which is two conventions for one kind of control within a
                    few hundred pixels. Worse, this field replaced the global focus outline with a border
                    tint - `outline: none` and a colour shift a keyboard user has to hunt for - so the two
                    also disagreed about what "focused" looks like. Nothing in the notes above defended
                    either choice, so both go.

                    Font and size stay different on purpose. A day is a formatted number and reads in mono;
                    a place name is prose and does not.
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
                        trail={count.toLocaleString("en-GB")}
                        // Sorted largest first by `countByRegion`, so the head of the list is the scale.
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
                The five layers as a list, in the column that already answers "where should I look".

                Inside the regions block rather than as a rail block of its own: the strip layout between
                768 and 1279px is a four-column grid with every cell named, and an unnamed sixth block
                would auto-place into a new row and make the strip taller - which the design test about
                the globe keeping a real share of the screen exists to catch. This column already scrolls.

                Behind a disclosure, closed by default.

                A hundred and thirty rows expanded under the region list would bury everything below it,
                and the count in the summary is the part most people want: "133 marks" answers the
                question without opening anything. Same idiom as "Time of day" and the legend's key.
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
                            /*
                              Selects and flies, which is what a row in this rail has always meant. It
                              opens the same card the glyph does, from the same id, so the list and the
                              globe cannot disagree about what a thing is.
                            */
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
              {/*
                Two refusals, two sentences, because "this is the present instead" is false when the clamp
                pinned the cursor to the buffer's oldest edge rather than releasing it to live.
              */}
              {view.at === null
                ? "The moment in this link is outside the window, so this is the present instead."
                : "The moment in this link is older than the window, so this is the oldest moment the "
                  + "buffer still holds."}
            </p>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p data-rail="notice" className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
              {/*
                An archived day is not a rolling buffer, and this sentence described one.
                "No longer in the window" and "starts when the page opens" are both about a day that
                slides, so on a loaded past day the notice explained a mechanism that was not running:
                the event was never in that day rather than having fallen out of it.
              */}
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
            /*
              Whether the filters are even in a position to be blamed.
              Unfiltered on purpose: deselecting both sources is a filter and should be blamed, while a
              day that reported nothing at all should not be. See the note beside the empty state.
            */
            reported={snapshot.stats.quakes}
            now={now}
            archived={archived}
          />

          {/*
            The credit, last in the rail and styled rather than left to the browser.
            An unstyled `a` takes the user-agent link colour, which is a saturated blue in the one app
            whose chrome is held under a chroma ceiling and tested for it - so it borrows `faint` and an
            underline, the way the other apps here do it.
          */}
          <p className="mt-4 pt-1 text-[11px] text-faint">
            made by{" "}
            <a
              href="https://www.aidenjang.com"
              target="_blank"
              rel="noreferrer"
              /*
                `inline-flex`, not inline, so the coarse-pointer rule can reach it.
                `min-height` has no effect on a non-replaced inline element, so the 44px touch minimum
                slid straight off an inline `a` and the finger test caught it at 14px. The test was right
                twice over: a 14px link in a footer is exactly the "control or a dare" distinction that
                rule was written about.
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
          /*
            Hidden with the rail it resizes.

            The handle is a sibling rather than a child, because the border lives on it so it can light up
            on hover. That also means hiding the rail leaves it behind: measured in cinema mode as a
            one-pixel bright line at x=356, running the full height, with identical pixels either side. A
            hairline down a frame whose whole point is that there is nothing in it but planet.
          */
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
                Arrival, by geometry rather than by a timer: the flight is a spring, so how long it takes
                depends on how far it went. Four degrees of tolerance because the spring approaches its
                target asymptotically and a tight threshold would leave the narration permanently unspoken.
                Cleared on arrival so this stops calling `setState` on every subsequent frame.
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
            /* The bottom band is chrome too: the key, the hint row and the scale all live in here. */
            hidden={cinema}
          >
            {/*
              The section joins the bottom band as its own full-width line rather than as a new
              absolutely positioned box, and it goes last so it is flush with the bottom edge. Placed
              first it floated in the middle of the canvas with map still visible underneath, which
              read as the map having been cut in half.
            */}
            {section ? (
              /*
                A deeper, fully desaturated ground than the other rail panels, because this one is a
                drawing rather than type.

                At bg-deck/40 and half saturation the map's own cluster came through the panel as a
                magenta glow, which was survivable behind text and not behind the slab: 1.6px dots at a
                quarter opacity lost to it outright. Hue is banned in the interface anyway, so the
                saturation goes to zero rather than half, and the scrim deepens enough to give a depth
                plot a floor to sit on.
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
            <div
              /*
                Sat on the planet with nothing under it, which is what made it read as console output
                rather than as part of the interface. Every other floating element down here already has
                a ground: the legend is 44% deck under a hard blur, and the section band is 40% under
                another. This is the same treatment at the same strength, so a row of monospace keys
                becomes a chip of chrome on the map instead of text lying on it.

                Square, and no border. The corners in this app are ticks or nothing, and a hairline box
                round eight words would be more furniture than the words are worth.
              */
              className="key-hints pointer-events-auto order-2 bg-deck/40 px-2.5 py-1.5 font-mono text-[10.5px] text-faint backdrop-blur-xl backdrop-saturate-50 xl:order-1"
            >
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
                // Only on a loaded day, because the keys do nothing on the live view and a hint row
                // that names an inert key is worse than one that is short.
                ...(archived ? [["[ ]", "day"] as const] : []),
                ...(flat ? [["shift-drag", "section"] as const] : []),
                // Last but for `esc`, because it is the only one here that changes the window rather
                // than the view, and somebody scanning for camera keys should not trip over it first.
                ["f", "full"],
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
          The one thing cinema is not allowed to hide.

          Pressing `f` hides the header, the rail and the bottom band, which is the point - but on an
          archived day it also hid every statement of which day this is. Measured: four mentions of the
          date on screen, all four hidden, including the banner that says "Nothing here is arriving now".
          The tab title carries the day too and a fullscreen window has no tab. So a viewer was looking at
          2011's earthquakes with nothing anywhere saying it was not this morning, which is the exact
          misstatement the banner exists to prevent.

          The rule cinema follows is therefore not "hide the chrome" but "hide the controls and the
          commentary". A sentence that stops the picture being misread is neither.

          A held cursor needs it for the same reason an archived day does, and that was the first version's
          mistake: it covered the archive only. Parked mid-window, cinema hid the word "held" and the clock
          beside it, so 3,542 of 6,000 events were on screen with nothing saying the globe was stopped.

          The wording comes from `stillMoment`, which already exists to state this app's moment on an
          artefact that has to stand alone: the still had this exact bug first - it once said "Live" about a
          day in July - and its fix is the sentence to reuse rather than to write again. One place decides
          how this app names the moment, so the poster and the fullscreen view cannot drift apart.

          The day comes from the snapshot rather than from the field, the same source the tab title uses:
          `archiveDay` is the text somebody is typing and changes on every keystroke.
        */}
        {cinema && (snapshot.archive !== null || view.at !== null) ? (
          <div className="stamp pointer-events-none absolute bottom-4 left-4 z-[2] bg-deck/40 px-3 py-2 font-mono text-[11px] text-faint backdrop-blur-xl backdrop-saturate-50">
            {stillMoment(view.at, snapshot.archive ? snapshot.archive.from : clockAt(), snapshot.archive !== null)}
          </div>
        ) : null}

        {/*
          Held past the unpin, so the panel can leave.

          A conditional mount has no exit: React removes the node on the same frame the selection
          clears, and a transition on a removed node never runs, so closing was a cut where opening
          was a slide. Keeping the last one alive lets it animate out still saying what it said.
        */}
        {/*
          The mark card takes the panel's place when a mark is what was clicked.

          One zone, not two: the layout has a slot for "the thing being asked about", and two panels
          racing for it would be two things claiming to be the answer. Picking an earthquake clears the
          mark and vice versa, so only one of these can be true at a time.
        */}
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
            onSelect={selectQuake}
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
