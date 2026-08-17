import { useEffect, useRef, useState } from "react";
import type { Quake } from "../data/types";
import { ago, coordinates, depth, magnitude, reportedBy } from "./format";

/*
 * The other interface.
 *
 * The canvas is `aria-hidden`, so for a screen reader this list is not an accessibility affordance
 * bolted onto the globe: it *is* the product. That framing decides everything below. It carries the
 * same information rather than a summary of it, it is ordered the way the globe is thinking
 * (newest first), and selecting here selects everywhere.
 *
 * Ordered by recency, not by position. Arrow-keying around a sphere spatially is disorienting even
 * when you can see it; "the next most recent earthquake" is a sentence anybody can follow.
 *
 * Visually hidden until focused, then visible. A sighted keyboard user gets the same list rather
 * than tabbing into something they cannot see, and it costs one `focus-within`.
 */

export interface AccessibleFeedProps {
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
  return `Magnitude ${r.magnitude.toFixed(1)} ${kind}, ${r.place}, ${ago(r.time, now)}, `
    + `${depth(r)} deep, reported by ${reportedBy(quake)}.`;
}

export function AccessibleFeed({
  quakes, selected, onSelect, announceAbove, onAnnounceAboveChange,
}: AccessibleFeedProps): JSX.Element {
  const [cursor, setCursor] = useState(0);
  /*
   * The cursor, again, as a ref.
   *
   * Three ArrowDown presses moved the focus one position. React state does not update until the
   * next render, so each synchronous keypress read the same stale value and computed the same
   * destination. A key repeat is exactly this: several events before a single frame. The ref is the
   * value the handler acts on; the state exists only to drive `tabIndex`.
   */
  const cursorRef = useRef(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");

  /*
   * The live region, gated by magnitude.
   *
   * A busy feed delivers hundreds of events an hour, and announcing all of them floods a screen
   * reader until the person turns the whole page off. So the threshold is the viewer's, and the
   * default is deliberately high: silence that can be lowered is recoverable, an unusable page is
   * not.
   */
  useEffect(() => {
    const fresh = quakes.filter(
      (q) => q.primary.magnitude >= announceAbove && !announced.current.has(q.key),
    );
    for (const q of quakes) announced.current.add(q.key);
    // Bounded, like everything else that grows with arrivals.
    if (announced.current.size > 4000) announced.current = new Set(quakes.map((q) => q.key));
    if (fresh.length === 0) return;
    const now = Date.now();
    setAnnouncement(
      fresh.length === 1
        ? sentence(fresh[0]!, now)
        : `${fresh.length} new earthquakes above magnitude ${announceAbove.toFixed(1)}. `
          + `Largest: ${sentence([...fresh].sort((a, b) => b.primary.magnitude - a.primary.magnitude)[0]!, now)}`,
    );
  }, [quakes, announceAbove]);

  const focusAt = (index: number): void => {
    const next = Math.max(0, Math.min(quakes.length - 1, index));
    cursorRef.current = next;
    setCursor(next);
    items.current[next]?.focus();
  };

  const move = (delta: number): void => focusAt(cursorRef.current + delta);

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); focusAt(0); }
    else if (e.key === "End") { e.preventDefault(); focusAt(quakes.length - 1); }
  };

  const now = Date.now();

  return (
    <section
      aria-label="Recent earthquakes"
      className="sr-panel"
    >
      <h2 className="label mb-2">Recent earthquakes</h2>

      <label className="label block" htmlFor="announce">
        Announce events at or above magnitude {announceAbove.toFixed(1)}
      </label>
      <input
        id="announce"
        type="range"
        min="1"
        max="7"
        step="0.5"
        value={announceAbove}
        className="slider mt-1 mb-3"
        onChange={(e) => onAnnounceAboveChange(Number(e.target.value))}
      />

      {/*
        One tab stop for the whole list, then arrow keys. Tabbing through several hundred
        earthquakes to reach the filters below would be its own accessibility failure.
      */}
      <ul
        className="flex flex-col gap-1"
        onKeyDown={onKeyDown}
        aria-label={`${quakes.length} most recent, newest first`}
      >
        {quakes.map((quake, i) => (
          <li key={quake.key}>
            <button
              type="button"
              ref={(node) => { items.current[i] = node; }}
              tabIndex={i === cursor ? 0 : -1}
              aria-current={quake.key === selected ? "true" : undefined}
              onFocus={() => { cursorRef.current = i; setCursor(i); }}
              onClick={() => onSelect(quake.key === selected ? null : quake.key)}
              className="w-full cursor-pointer text-left text-[11px] leading-snug text-dim hover:text-ink focus-visible:text-ink"
            >
              <span className="font-mono text-ink">{magnitude(quake.primary)}</span>{" "}
              {quake.primary.place}
              {/* Coordinates are read out but never shown: on screen the globe says where. */}
              <span className="sr-only">
                {`. ${coordinates(quake.primary)}, ${depth(quake.primary)} deep, `}
                {`${ago(quake.primary.time, now)}, reported by ${reportedBy(quake)}.`}
                {quake.key === selected ? " Currently pinned." : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {quakes.length === 0 ? (
        <p className="text-[11px] text-faint">No events match the current filters.</p>
      ) : null}

      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </section>
  );
}
