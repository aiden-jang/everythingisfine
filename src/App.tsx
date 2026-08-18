import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "./globe/Globe";
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { EventList } from "./app/EventList";
import { DetailPanel } from "./app/DetailPanel";
import { Legend } from "./app/Legend";
import { decode, encode } from "./app/permalink";
import type { RampName } from "./globe/ramp";
import { matches, windowStart } from "./data/filter";
import type { Filters, SourceId } from "./data/types";
import { PLAYBACK } from "./globe/rings";
import {
  SOURCE_NAMES, windowLabel,
} from "./app/format";

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

function Row({ label, value, onClick }: {
  label: string; value: string; onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      <span className="truncate">{label}</span>
      <span className="ml-3 shrink-0 font-mono text-[12px] text-ink">{value}</span>
    </>
  );
  const shared = "flex w-full items-center justify-between border-t border-hairline py-1.5 text-[12px] text-dim";
  return onClick
    ? <button type="button" onClick={onClick} className={`${shared} cursor-pointer text-left hover:text-ink`}>{body}</button>
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
  /*
   * A shared event that is no longer in the window.
   *
   * The buffer is a rolling day, so a link shared yesterday names an earthquake this page will
   * never hold. Silently opening no panel would look like the link was broken. Saying so is the
   * same honesty the window's left edge gets: the app knows why, so it says why.
   */
  const [missingShared, setMissingShared] = useState<string | null>(shared.event ?? null);
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
    () => countByRegion(feed.store, filters, Date.now()).filter((r) => r.count > 0).slice(0, 6),
    // Recomputed when the data or the filter moves, which is exactly when the counts can change.
    [filters, snapshot.revision],
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
  useEffect(() => {
    // Only if it genuinely fell out of the buffer. A refresh must never clear the panel.
    if (selected && !feed.store.get(selected)) setSelected(null);
  }, [selected, snapshot.revision]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const edge = windowStart(now, filters.windowMs, snapshot.stats.since);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  return (
    <div className="frame">
      {/* The header used to hold a wordmark and two small words on a 1280px bar. It now carries
          the arithmetic that makes the reconciliation visible without opening anything. */}
      <header className="flex items-center gap-6 border-b border-hairline bg-deck px-5 py-3">
        <div className="text-[13px] font-semibold tracking-[0.16em] whitespace-nowrap">
          FIRST MOTION
        </div>
        <div className="hidden items-baseline gap-5 sm:flex">
          {([
            ["USGS", `${snapshot.stats.readings.usgs}`],
            ["EMSC", `${snapshot.stats.readings.emsc}`],
            ["distinct", `${snapshot.stats.quakes}`],
            ["both", `${snapshot.stats.corroborated}`],
          ] as const).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4 whitespace-nowrap">
          <span className="text-[11px] text-faint">wavefront &times;{PLAYBACK}</span>
          <span className="flex items-center gap-2 text-[11px] text-dim">
            <span
              className={`inline-block size-[6px] rounded-full ${
                live === 2 ? "bg-ink" : live === 1 ? "bg-dim" : "bg-faint"
              }`}
            />
            {live === 2 ? "both feeds live" : live === 1 ? "one feed live" : "connecting"}
          </span>
        </div>
      </header>

      <div className="zones">
        <aside className="zone-rail rail border-hairline bg-deck p-5 max-xl:border-b xl:border-r">
          <div>
            <div className="label">Events</div>
            <div className="mt-1.5 text-[38px] leading-none font-semibold">
              {snapshot.stats.quakes.toLocaleString("en-GB")}
            </div>
            {/* The window states its own left edge. "last 24 hours" is a lie for the first 24. */}
            <div className="mt-1.5 text-[11px] text-dim">
              {windowLabel(now, filters.windowMs, snapshot.stats.since)}
              {edge.complete ? "" : " · still filling"}
            </div>
          </div>

          {/* What the colours mean. Missing entirely until somebody said the interface was bad. */}
          <Legend ramp={ramp} />

          <div>
            <label className="label block" htmlFor="mag">
              Showing M{filters.minMagnitude.toFixed(1)} and above
            </label>
            {/* No apply button: the globe answers the slider as it moves. */}
            <input
              id="mag"
              type="range"
              min="0"
              max="7"
              step="0.1"
              value={filters.minMagnitude}
              className="slider mt-1"
              onChange={(e) => setFilters((f) => ({ ...f, minMagnitude: Number(e.target.value) }))}
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(["usgs", "emsc"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSource(id)}
                  aria-pressed={filters.sources.has(id)}
                  className={`cursor-pointer border px-2.5 py-1 text-[11px] transition-colors ${
                    filters.sources.has(id)
                      ? "border-hairline bg-raised text-ink"
                      : "border-hairline text-faint hover:text-dim"
                  }`}
                >
                  {SOURCE_NAMES[id]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRamp((r) => (r === "thermal" ? "cividis" : "thermal"))}
                aria-pressed={ramp === "cividis"}
                className={`cursor-pointer border border-hairline px-2.5 py-1 text-[11px] transition-colors ${
                  ramp === "cividis" ? "bg-raised text-ink" : "text-faint hover:text-dim"
                }`}
              >
                Colourblind ramp {ramp === "cividis" ? "on" : "off"}
              </button>
            </div>
          </div>

          {regions.length > 0 ? (
            <div>
              <div className="label">Regions</div>
              {regions.slice(0, 4).map(({ region, count }) => (
                <Row
                  key={region.name}
                  label={region.name}
                  value={`${count}`}
                  onClick={() => flyTo.current(region.lon, region.lat, region.zoom)}
                />
              ))}
            </div>
          ) : null}

          {missingShared && !pinned && snapshot.stats.quakes > 0 ? (
            <p className="border border-hairline bg-raised p-2.5 text-[11px] leading-relaxed text-dim">
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
          />
        </aside>

        {/* Hidden from assistive tech. The parallel accessible feed in step B is the real
            interface for a screen reader; the canvas is never it. */}
        <main className="zone-canvas bg-void" aria-hidden="true">
          <Globe
            feed={feed}
            filters={filters}
            selected={selected}
            ramp={ramp}
            onSelect={setSelected}
            onReady={onReady}
            onCamera={(state) => { camera.current = state; }}
          />
        </main>

        {pinned ? (
          <DetailPanel
            quake={pinned}
            store={feed.store}
            filters={filters}
            onClose={() => setSelected(null)}
            onFlyTo={(lon, lat, zoom) => flyTo.current(lon, lat, zoom)}
          />
        ) : null}
      </div>
    </div>
  );
}
