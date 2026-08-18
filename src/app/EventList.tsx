import { useEffect, useRef, useState } from "react";
import type { Quake } from "../data/types";
import { ago, coordinates, depth, place, reportedBy, SOURCE_NAMES } from "./format";

/*
 * The list of recent events. One list, for everybody.
 *
 * This was two things: a visible globe and a screen-reader-only list carrying strictly more
 * information than any sighted person could reach. That is a strange thing to have built. The list
 * is the most useful content in the app, it was already written, and it was hidden.
 *
 * So it is visible now, and it is still the same list a screen reader gets: same order, same
 * content, one tab stop then arrow keys, selection shared with the globe. Nothing was added for
 * sighted users that assistive tech does not get, and nothing was taken away.
 */

export interface EventListProps {
  quakes: readonly Quake[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Events at or above this magnitude are announced. Below it, they arrive silently. */
  announceAbove: number;
  onAnnounceAboveChange: (value: number) => void;
}

/** One event, as a sentence rather than a row of fields. */
function sentence(quake: Quake, now: number): string {
  const r = quake.primary;
  const kind = r.kind === "earthquake" ? "earthquake" : r.kind;
  return `Magnitude ${r.magnitude.toFixed(1)} ${kind}, ${place(r.place)}, ${ago(r.time, now)}, `
    + `${depth(r)} deep, reported by ${reportedBy(quake)}.`;
}

export function EventList({
  quakes, selected, onSelect, announceAbove, onAnnounceAboveChange,
}: EventListProps): JSX.Element {
  const [cursor, setCursor] = useState(0);
  /*
   * The cursor, again, as a ref.
   *
   * Three ArrowDown presses moved the focus one position. React state does not update until the
   * next render, so each synchronous keypress read the same stale value. A key repeat is exactly
   * that: several events before a single frame. The ref is what the handler acts on; the state
   * exists only to drive `tabIndex`.
   */
  const cursorRef = useRef(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");

  /*
   * The live region, gated by magnitude.
   *
   * A busy feed delivers hundreds of events an hour, and announcing all of them floods a screen
   * reader until the person closes the page. The threshold is the viewer's and the default is
   * deliberately high: silence that can be lowered is recoverable, an unusable page is not.
   */
  useEffect(() => {
    const fresh = quakes.filter(
      (q) => q.primary.magnitude >= announceAbove && !announced.current.has(q.key),
    );
    for (const q of quakes) announced.current.add(q.key);
    if (announced.current.size > 4000) announced.current = new Set(quakes.map((q) => q.key));
    if (fresh.length === 0) return;
    const now = Date.now();
    setAnnouncement(
      fresh.length === 1
        ? sentence(fresh[0]!, now)
        : `${fresh.length} new earthquakes above magnitude ${announceAbove.toFixed(1)}. Largest: `
          + sentence([...fresh].sort((a, b) => b.primary.magnitude - a.primary.magnitude)[0]!, now),
    );
  }, [quakes, announceAbove]);

  const focusAt = (index: number): void => {
    const next = Math.max(0, Math.min(quakes.length - 1, index));
    cursorRef.current = next;
    setCursor(next);
    items.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); focusAt(cursorRef.current + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(cursorRef.current - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusAt(0); }
    else if (e.key === "End") { e.preventDefault(); focusAt(quakes.length - 1); }
  };

  const now = Date.now();

  return (
    <section aria-label="Recent earthquakes" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="label">Recent</h2>
        <span className="font-mono text-[11px] text-faint">newest first</span>
      </div>

      <label className="sr-only" htmlFor="announce">
        Announce events at or above magnitude {announceAbove.toFixed(1)}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] whitespace-nowrap text-dim">announce M{announceAbove.toFixed(1)}+</span>
        <input
          id="announce"
          type="range"
          min="1"
          max="7"
          step="0.5"
          value={announceAbove}
          className="slider"
          onChange={(e) => onAnnounceAboveChange(Number(e.target.value))}
        />
      </div>

      {/* One tab stop, then arrows. Tabbing through sixty earthquakes to reach the next control
          would be its own accessibility failure. */}
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto pr-2" onKeyDown={onKeyDown}>
        {quakes.map((quake, i) => (
          <li key={quake.key}>
            <button
              type="button"
              ref={(node) => { items.current[i] = node; }}
              tabIndex={i === cursor ? 0 : -1}
              aria-current={quake.key === selected ? "true" : undefined}
              onFocus={() => { cursorRef.current = i; setCursor(i); }}
              onClick={() => onSelect(quake.key === selected ? null : quake.key)}
              className={`flex w-full cursor-pointer items-start gap-3 border-t border-hairline px-1 py-2.5 text-left transition-colors hover:bg-raised ${
                quake.key === selected ? "bg-raised" : ""
              }`}
            >
              {/*
               * Two lines, not one.
               *
               * A single line measured 31px tall, against this design system's own 44px minimum
               * touch target, and squeezed the place name into 167px so anything longer than
               * "Flores Region, Indonesia" was cut off mid-word. Stacking clears the target, gives
               * the name the full width, and has room for the detail that otherwise required
               * pinning the event to see at all.
               */}
              <span className="w-[34px] shrink-0 pt-px font-mono text-[14px] leading-none text-ink">
                {quake.primary.magnitude.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] leading-tight text-ink">
                  {place(quake.primary.place)}
                </span>
                <span className="mt-1 block truncate font-mono text-[10.5px] leading-none text-faint">
                  {ago(quake.primary.time, now)
                    .replace(" ago", "").replace(/ minutes?/, "m")
                    .replace(/ hours?/, "h").replace(/ days?/, "d")}
                  {` · ${depth(quake.primary)}`}
                  {` · ${quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" ")}`}
                </span>
              </span>
              {/* Read aloud, never shown: on screen the globe already says where. */}
              <span className="sr-only">
                {`. ${coordinates(quake.primary)}, reported by ${reportedBy(quake)}.`}
                {quake.key === selected ? " Currently pinned." : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {quakes.length === 0 ? (
        <p className="mt-2 text-[12px] text-faint">No events match the current filters.</p>
      ) : null}

      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </section>
  );
}
