import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const Globe = lazy(() => import("./globe/Globe").then((m) => ({ default: m.Globe })));
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { EventList } from "./app/EventList";
import { DetailPanel } from "./app/DetailPanel";
import { MagnitudeFilter } from "./app/MagnitudeFilter";
import { Timeline } from "./app/Timeline";
import { Resizer } from "./app/Resizer";
import { CrossSection } from "./app/CrossSection";
import { buildSection, type SectionLine } from "./app/section";
import { countWithin, histogram } from "./app/histogram";
import { decode, encode } from "./app/permalink";
import { rampColorAt, type RampName } from "./globe/ramp";
import { matches, windowStart } from "./data/filter";
import type { Filters, SourceId } from "./data/types";
import type { SourceStatus } from "./sources/types";
import { PLAYBACK } from "./globe/rings";
import {
  agoShort, clock, place, SOURCE_NAMES, windowLabel,
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
  /** The entrance replay's clock and revealed count, or null when it is not running. */
  const [replay, setReplay] = useState<{ at: number; revealed: number } | null>(null);
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
   * Remembered, because a width somebody chose is a preference and re-choosing it on every visit is
   * the app forgetting something it was told.
   */
  const onMap = useWide();
  /*
   * Not in the permalink, deliberately. A link carries where somebody was looking; which projection
   * they happened to be using while looking is a preference, and one that would arrive as a surprise.
   */
  const [flat, setFlat] = useState(
    () => localStorage.getItem("firstmotion.flat") === "1",
  );
  useEffect(() => {
    localStorage.setItem("firstmotion.flat", flat ? "1" : "0");
  }, [flat]);
  const [railWidth, setRailWidth] = useState<number>(
    () => Number(localStorage.getItem("firstmotion.rail")) || 356,
  );
  useEffect(() => {
    localStorage.setItem("firstmotion.rail", String(railWidth));
  }, [railWidth]);
  const [regionsHeight, setRegionsHeight] = useState<number>(
    () => Number(localStorage.getItem("firstmotion.regions")) || 132,
  );
  useEffect(() => {
    localStorage.setItem("firstmotion.regions", String(regionsHeight));
  }, [regionsHeight]);
  const regionsRef = useRef<HTMLDivElement>(null);
  /*
   * The section line, and the section rebuilt from it.
   *
   * Keyed on the revision rather than the clock, for the reason the neighbour search is: it walks the
   * whole buffer, the panel re-renders every second because the rail ticks, and the answer only
   * changes when an earthquake does.
   */
  const [sectionLine, setSectionLine] = useState<SectionLine | null>(null);
  /*
   * Both persisted, because both are accessibility settings and re-choosing one on every visit is
   * its own barrier. Read lazily so the first paint already has the right ramp rather than
   * flashing the default and correcting itself.
   */
  const [ramp, setRamp] = useState<RampName>(
    () => shared.ramp ?? (localStorage.getItem("firstmotion.ramp") as RampName | null) ?? "thermal",
  );
  const [announceAbove, setAnnounceAbove] = useState<number>(
    () => Number(localStorage.getItem("firstmotion.announceAbove") ?? "4.5"),
  );
  useEffect(() => { localStorage.setItem("firstmotion.ramp", ramp); }, [ramp]);
  useEffect(() => {
    localStorage.setItem("firstmotion.announceAbove", String(announceAbove));
  }, [announceAbove]);
  const flyTo = useRef<(lon: number, lat: number, zoom?: number) => void>(() => {});
  const lastWritten = useRef<string>(window.location.hash);
  const camera = useRef<{ lon: number; lat: number; zoom: number }>(
    { lon: shared.lon ?? 145, lat: shared.lat ?? 12, zoom: shared.zoom ?? 1 },
  );
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
  }, [filters, selected, ramp]);

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
  const regions = useMemo(
    // No cap. It was six, from when four were rendered and the rest were unreachable; the box is
    // sized and scrolls now, so cutting the list would be hiding the quiet regions worth noticing.
    () => countByRegion(feed.store, filters, Date.now()).filter((r) => r.count > 0),
    // Recomputed when the data or the filter moves, which is exactly when the counts can change.
    [filters, snapshot.revision],
  );

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
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // One thing at a time, innermost first. Escape closing the pin and the section together means
      // one press can undo two decisions, and the section is the one somebody just drew.
      if (sectionLine) setSectionLine(null);
      else setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sectionLine]);

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
   * The store hands events back in arrival order, which is the right thing for eviction and the
   * wrong thing for a list headed "newest first". After the daily seed lands, arrival order is
   * whatever order two catalogues happened to answer in, so the list opened on events nineteen
   * hours old under a heading claiming recency. Sorting 400 candidates is nothing; the list is
   * capped at 60 because navigating 50,000 rows would serve nobody.
   */
  const recent = useMemo(
    () => feed.store.latest(400)
      .filter((q) => matches(q, filters, Date.now()))
      .sort((a, b) => b.primary.time - a.primary.time)
      .slice(0, 60),
    [filters, snapshot.revision],
  );

  /*
   * Rebuilt on every revision, and cheap enough to be.
   *
   * It walks the whole buffer, which is up to fifty thousand events, but only ever to add to
   * twenty-four counters. The list above it sorts four hundred objects on the same trigger and that
   * has never been the frame's problem either.
   */
  const { bars, strongest } = useMemo(
    () => histogram(feed.store.forEach, filters, now, snapshot.coveredSince),
    // `now` deliberately absent: it ticks every second and the bars only move on the hour. The
    // revision is what changes them, and the clock catches up the next time an event lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.minMagnitude, filters.sources, snapshot.revision, snapshot.coveredSince],
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
  const shown = countWithin(bars, hours);

  const failing = (Object.entries(snapshot.statuses) as [SourceId, SourceStatus][])
    .flatMap(([id, status]) => (status.kind === "failing" ? [[id, status] as const] : []));

  const edge = windowStart(now, filters.windowMs, snapshot.coveredSince);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  const legend = (
    <>

              <MagnitudeFilter
                ramp={ramp}
                value={filters.minMagnitude}
                onChange={(v) => setFilters((f) => ({ ...f, minMagnitude: v }))}
              />
              {/*
                Sources sit with the magnitude control because both answer "what is on the globe".
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
    </>
  );

  return (
    <div className="frame">
      {/* The header used to hold a wordmark and two small words on a 1280px bar. It now carries
          the arithmetic that makes the reconciliation visible without opening anything. */}
      <header className="zone-head flex items-center gap-6 bg-deck px-5 py-3 xl:bg-transparent">
        <div className="text-[13px] font-semibold tracking-[0.16em] whitespace-nowrap">
          FIRST MOTION
        </div>
        {/* Four zeros are four numbers that mean nothing. Same call as the headline: the status on
            the right already says what is happening while there is nothing to count. */}
        <div className={`hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "sm:flex"}`}>
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
          stay and the two informational labels drop as room runs out, since a display toggle is
          something to press and "wavefront x20" is something to read.
        */}
        <div className="ml-auto flex min-w-0 items-center gap-3">
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
            <span className="md:hidden">Ramp {ramp === "cividis" ? "CB" : "std"}</span>
            <span className="hidden md:inline">
              Colourblind ramp {ramp === "cividis" ? "on" : "off"}
            </span>
          </button>
          <span className="hidden text-[11px] whitespace-nowrap text-faint lg:inline">
            wavefront &times;{PLAYBACK}
          </span>
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
          <div>
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
                <div className="mt-1.5 text-[38px] leading-none font-semibold">
                  {(replay ? replay.revealed : shown).toLocaleString("en-GB")}
                </div>
                {/*
                  During the replay the rail shows the replayed clock, labelled, because the number
                  above it is counting up through a day that has already happened. Saying "since
                  22:35" while the globe fills with yesterday's events would describe one thing and
                  show another.
                */}
                {replay ? (
                  <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-ink">{clock(replay.at)}</span>
                    <span className="text-faint">replaying the last day</span>
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
              onClick={() => {
                setSelected(strongest.key);
                flyTo.current(strongest.primary.lon, strongest.primary.lat, 1.9);
              }}
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

          {onMap ? null : <div>{legend}</div>}

          {/*
            The day, and the control for the window that was previously unreachable. Sits under the
            magnitude filter because they are the same kind of thing: both say what is on the globe.
            The globe answers "where" and cannot answer "when" at all, which is the gap this fills.
          */}
          <Timeline
            bars={bars}
            ramp={ramp}
            hours={hours}
            focusHour={focusHour}
            onFocusHourChange={setFocusHour}
            onHoursChange={(h) => setFilters((f) => ({ ...f, windowMs: h * 3_600_000 }))}
          />

          {/*
            All twelve, in a box you can resize, rather than the top four and no way to the rest.

            The truncation was the wrong half of the fix: a region with two events is exactly the one
            somebody scanning for where today is quiet wants to see, and it was the one being cut. A
            sized scrolling box shows the same four by default and admits the others exist.
          */}
          {regions.length > 0 ? (
            <div className="relative">
              <div ref={regionsRef} className="rail-regions">
                <div className="label">Regions</div>
                {regions.map(({ region, count }) => (
                  <Row
                    key={region.name}
                    label={region.name}
                    trail={`${count}`}
                    onClick={() => flyTo.current(region.lon, region.lat, region.zoom)}
                  />
                ))}
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
            <div className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
              {failing.map(([id, status]) => (
                <div key={id}>
                  <span className="text-ink">{SOURCE_NAMES[id]}</span> is not answering: {status.reason}.
                  Retrying at {clock(status.retryAt)}.
                </div>
              ))}
              <div className="mt-1 text-faint">The globe keeps what it has.</div>
            </div>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p className="border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
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
            focusHour={focusHour}
            flat={flat}
            section={sectionLine}
            onSection={setSectionLine}
            onSelect={setSelected}
            onReady={onReady}
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
            className="pointer-events-none absolute right-0 bottom-0 left-0 z-[1] flex flex-wrap items-end justify-end gap-x-6 gap-y-3 p-4 xl:left-[var(--rail-w)]"
          >
            {/*
              The section joins the bottom band as its own full-width line rather than as a new
              absolutely positioned box, and it goes last so it is flush with the bottom edge. Placed
              first it floated in the middle of the canvas with map still visible underneath, which
              read as the map having been cut in half.
            */}
            {section ? (
              <div className="order-9 -mx-4 -mb-4 w-[calc(100%+2rem)] bg-deck/40 px-4 pt-3 pb-4 backdrop-blur-2xl backdrop-saturate-50">
                <CrossSection data={section} ramp={ramp} onClose={() => setSectionLine(null)} />
              </div>
            ) : null}
            {onMap ? (
              <div className="pointer-events-auto order-1 w-full max-w-[300px] bg-deck/40 p-3 backdrop-blur-2xl backdrop-saturate-50 xl:order-2">
                {legend}
              </div>
            ) : null}
            <div className="pointer-events-auto order-2 font-mono text-[10.5px] text-faint xl:order-1">
              {/*
                What the keys do here, not what they did on the globe. Arrows orbit a sphere and pan a
                map, and a hint row that says orbit while the drag pans is worse than no hint row.
              */}
              {([
                ["arrows", flat ? "pan" : "orbit"],
                ["+ -", "zoom"],
                ["0", "reset"],
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
          />
        ) : null}
      </div>
    </div>
  );
}
