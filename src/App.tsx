import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "./globe/Globe";
import { createFeed, DEFAULT_FILTERS, type FeedSnapshot } from "./app/feed";
import { countByRegion } from "./app/regions";
import { windowStart } from "./data/filter";
import type { Filters, Quake, SourceId } from "./data/types";
import { PLAYBACK } from "./globe/rings";
import {
  ago, clock, coordinates, depth, magnitude, SOURCE_NAMES, windowLabel,
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
      <span className="ml-3 shrink-0 font-mono text-[10px] text-ink">{value}</span>
    </>
  );
  const shared = "flex w-full items-center justify-between border-t border-hairline py-1.5 text-[10.5px] text-dim";
  return onClick
    ? <button type="button" onClick={onClick} className={`${shared} cursor-pointer text-left hover:text-ink`}>{body}</button>
    : <div className={shared}>{body}</div>;
}

function Reading({ quake, index }: { quake: Quake; index: number }): JSX.Element {
  const reading = quake.readings[index]!;
  const drawn = reading === quake.primary;
  return (
    <div className={`border-t border-hairline py-2 ${drawn ? "border-l-2 border-l-ink pl-2" : ""}`}>
      <div className="label mb-1.5">
        {SOURCE_NAMES[reading.source]}
        {drawn ? <span className="ml-1.5 tracking-normal text-ink normal-case">drawn</span> : null}
      </div>
      <div className="font-mono text-[10px] leading-relaxed text-ink">
        <div>{magnitude(reading)} <span className="text-faint">{reading.scale}</span></div>
        <div>{coordinates(reading)}</div>
        <div>{depth(reading)} deep</div>
        <div>{clock(reading.time)} <span className="text-faint">{ago(reading.time, Date.now())}</span></div>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const snapshot = useFeed();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const flyTo = useRef<(lon: number, lat: number, zoom?: number) => void>(() => {});
  const onReady = useCallback((fn: typeof flyTo.current) => { flyTo.current = fn; }, []);

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

  const edge = windowStart(now, filters.windowMs, snapshot.stats.since);
  const live = Object.values(snapshot.statuses).filter((s) => s.kind === "live").length;

  return (
    <div className="frame">
      <header className="flex items-center gap-4 border-b border-hairline bg-deck px-4 py-2.5">
        <div className="text-[11px] font-semibold tracking-[0.18em]">FIRST MOTION</div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-[9.5px] tracking-[0.1em] text-faint">
            WAVEFRONT &times;{PLAYBACK}
          </span>
          <span className="text-[9.5px] tracking-[0.1em] text-dim">
            {live === 2 ? "BOTH FEEDS LIVE" : live === 1 ? "ONE FEED LIVE" : "CONNECTING"}
          </span>
        </div>
      </header>

      <div className="zones">
        <aside className="zone-rail rail border-hairline bg-deck p-4 max-xl:border-b xl:border-r">
          <div>
            <div className="label">Events</div>
            <div className="mt-1 text-[31px] leading-none font-semibold">
              {snapshot.stats.quakes.toLocaleString("en-GB")}
            </div>
            {/* The window states its own left edge. "last 24 hours" is a lie for the first 24. */}
            <div className="mt-1 text-[9.5px] text-dim">
              {windowLabel(now, filters.windowMs, snapshot.stats.since)}
              {edge.complete ? "" : " (still filling)"}
            </div>
          </div>

          <div>
            {(["usgs", "emsc"] as const).map((id) => {
              const status = snapshot.statuses[id];
              return (
                <Row
                  key={id}
                  label={`${SOURCE_NAMES[id]} ${id === "usgs" ? "poll" : "push"}`}
                  value={
                    status.kind === "live" ? `${snapshot.stats.readings[id]}`
                      : status.kind === "failing" ? "retrying" : "--"
                  }
                />
              );
            })}
            {/* Deduplication is labelled, never hidden inside one total: the two raw counts sit
                above, the distinct total below, and the overlap between them is named. */}
            <Row label="distinct events" value={`${snapshot.stats.quakes}`} />
            <Row label="both agencies" value={`${snapshot.stats.corroborated}`} />
          </div>

          <div>
            <div className="label">Regions</div>
            {regions.length === 0
              ? <div className="border-t border-hairline py-1.5 text-[10.5px] text-faint">none in this window</div>
              : regions.map(({ region, count }) => (
                <Row
                  key={region.name}
                  label={region.name}
                  value={`${count}`}
                  onClick={() => flyTo.current(region.lon, region.lat, region.zoom)}
                />
              ))}
          </div>

          <div>
            <label className="label block" htmlFor="mag">
              Magnitude {filters.minMagnitude.toFixed(1)}+
            </label>
            {/* No apply button: the globe answers the slider as it moves. */}
            <input
              id="mag"
              type="range"
              min="0"
              max="7"
              step="0.1"
              value={filters.minMagnitude}
              className="slider mt-2"
              onChange={(e) => setFilters((f) => ({ ...f, minMagnitude: Number(e.target.value) }))}
            />
            <div className="mt-2 flex gap-1.5">
              {(["usgs", "emsc"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSource(id)}
                  aria-pressed={filters.sources.has(id)}
                  className={`label cursor-pointer border px-2 py-1 transition-colors ${
                    filters.sources.has(id)
                      ? "border-hairline bg-raised text-ink"
                      : "border-hairline text-faint"
                  }`}
                >
                  {SOURCE_NAMES[id]}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Hidden from assistive tech. The parallel accessible feed in step B is the real
            interface for a screen reader; the canvas is never it. */}
        <main className="zone-canvas bg-void" aria-hidden="true">
          <Globe
            feed={feed}
            filters={filters}
            selected={selected}
            onSelect={setSelected}
            onReady={onReady}
          />
        </main>

        {pinned ? (
          <aside className="zone-panel flex w-[360px] flex-col gap-2 border-l border-hairline bg-deck p-4 max-xl:w-full">
            <div className="flex items-start justify-between">
              <div className="label">Pinned event</div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="label cursor-pointer hover:text-ink"
              >
                Esc
              </button>
            </div>
            <div className="text-[23px] leading-none font-semibold">{magnitude(pinned.primary)}</div>
            <div className="text-[11px] leading-snug text-dim">{pinned.primary.place}</div>
            {pinned.primary.kind !== "earthquake" ? (
              // Named rather than drawn as an earthquake. A quarry blast is a real seismic event
              // and calling it something it is not would be the quiet kind of lie.
              <div className="text-[10px] text-faint">recorded as a {pinned.primary.kind}</div>
            ) : null}

            <div className="label mt-2">
              Source readings
              {pinned.readings.length > 1 ? " (both agencies reported this)" : ""}
            </div>
            {pinned.readings.map((_, i) => <Reading key={i} quake={pinned} index={i} />)}
            {pinned.readings.length > 1 ? (
              <div className="mt-auto pt-3 text-[9.5px] leading-relaxed text-faint">
                Neither reading is discarded. The marker is drawn from USGS, the global catalogue of
                record, so it does not move depending on which feed arrived first.
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
