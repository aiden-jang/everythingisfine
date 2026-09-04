import { useEffect, useRef, useState } from "react";
import type { Quake } from "../data/types";
import { ago, agoShort, coordinates, depth, place, reportedBy, SOURCE_NAMES } from "./format";
import { newsIn } from "./announce";

/* The list of recent events. One list, for everybody. See ARCHITECTURE.md. */

export interface EventListProps {
  quakes: readonly Quake[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Events at or above this magnitude are announced. Below it, they arrive silently. */
  announceAbove: number;
  /** The events that genuinely just arrived. Handed out from here rather than recomputed elsewhere,
   * because `newsIn` is the one place that knows an event being new to a list is not the same as it
   * being new, and a second implementation is a second chance to announce a cold-load backlog. */
  onNews?: (magnitudes: number[]) => void;
  onAnnounceAboveChange: (value: number) => void;
  /** True before any feed has delivered, so an empty list is not blamed on the filters. */
  waiting: boolean;
  /**
   * How many events the span holds before any filter is applied. Zero and "excluded by the filters" read
   * identically without this: an archived 1960s day where both agencies answered nothing said "No events
   * match the current filters", sending a viewer to widen a control that was never the problem.
   */
  reported: number;
  /** The clock every age in this list is measured against. Passed in, because on an archived day it is
   * the end of that day: `Date.now()` put "99d" on every row while the title block said "13h". */
  now: number;
  /** True on an archived day, so "just now" does not describe a finished one. */
  archived?: boolean;
}

/** One event, as a sentence rather than a row of fields. */
function sentence(quake: Quake, now: number, archived = false): string {
  const r = quake.primary;
  const kind = r.kind === "earthquake" ? "earthquake" : r.kind;
  const revised = quake.readings.flatMap((x) =>
    x.revision ? [`${SOURCE_NAMES[x.source]} first reported ${x.revision.fromMagnitude.toFixed(1)}`] : [],
  );
  return (
    `Magnitude ${r.magnitude.toFixed(1)} ${kind}, ${place(r.place)}, ${ago(r.time, now, archived)}, ` +
    `${depth(r)} deep, reported by ${reportedBy(quake)}.` +
    // The announcement carries the value where the row carries only the word. A row can be pinned to find
    // out what changed; an announcement has already gone by.
    (revised.length > 0 ? ` Revised: ${revised.join(", ")}.` : "")
  );
}

export function EventList({
  quakes,
  selected,
  onSelect,
  announceAbove,
  onAnnounceAboveChange,
  onNews,
  waiting,
  reported,
  now,
  archived = false,
}: EventListProps): JSX.Element {
  const [cursor, setCursor] = useState(0);
  /*
   * The cursor, again, as a ref. Three ArrowDown presses moved the focus one position: state does not
   * update until the next render, so each synchronous keypress read the same stale value, and a key repeat
   * is several events before one frame. The state exists only to drive `tabIndex`.
   */
  const cursorRef = useRef(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");

  /* The live region, gated by magnitude and by the clock. See ARCHITECTURE.md. */
  useEffect(() => {
    /*
      The real clock here, not the archived one: this decides what genuinely arrived, which only happens
      while live. It stays out of the dependency list below, because the displayed clock ticks every second
      and an effect that reran at 1Hz would run `newsIn` sixty times a minute to answer "nothing arrived".
    */
    const fresh = newsIn(quakes, announced.current, announceAbove, Date.now());
    for (const q of quakes) announced.current.add(q.key);
    if (announced.current.size > 4000) announced.current = new Set(quakes.map((q) => q.key));
    if (fresh.length === 0) return;
    onNews?.(fresh.map((q) => q.primary.magnitude));
    const spoken = Date.now();
    setAnnouncement(
      fresh.length === 1
        ? sentence(fresh[0]!, spoken)
        : `${fresh.length} new earthquakes above magnitude ${announceAbove.toFixed(1)}. Largest: ` +
            sentence([...fresh].sort((a, b) => b.primary.magnitude - a.primary.magnitude)[0]!, spoken),
    );
  }, [quakes, announceAbove, onNews]);

  const focusAt = (index: number): void => {
    const next = Math.max(0, Math.min(quakes.length - 1, index));
    cursorRef.current = next;
    setCursor(next);
    items.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(cursorRef.current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(cursorRef.current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(quakes.length - 1);
    }
  };

  return (
    /* A floor under the list, because `flex-1` gives zero when there is nothing left to give. See
       ARCHITECTURE.md. */
    <section
      aria-label="Recent earthquakes"
      /* A share of the viewport in the two single-column layouts, not just a floor. See ARCHITECTURE.md. */
      className="flex min-h-[8.25rem] flex-1 flex-col max-md:min-h-[30dvh] xl:min-h-0 xl:flex-none"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="label">Recent</h2>
        <span className="font-mono text-[10.5px] text-faint">newest first</span>
      </div>

      {/* The announce threshold sits in a details, not beside the list as a second bare slider. Two
          identical-looking sliders, one filtering the globe and one setting a screen-reader threshold,
          read as one control with a duplicate. */}
      <details className="mt-1.5">
        <summary className="disclose text-[11px] text-faint hover:text-dim">
          Announce at M{announceAbove.toFixed(1)} and above
        </summary>
        <label className="sr-only" htmlFor="announce">
          Announce events at or above magnitude {announceAbove.toFixed(1)}
        </label>
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
      </details>

      {quakes.length === 0 ? (
        // Blaming the filters is only right when there is something for them to exclude. Three states,
        // three sentences, and only the last is about the controls.
        <p className="mt-2 text-[12px] text-faint">
          {waiting
            ? "Waiting for the first events."
            : reported === 0
              ? `Nothing was reported ${archived ? "on this day" : "in this window"}.`
              : "No events match the current filters."}
        </p>
      ) : null}

      {/* One tab stop, then arrows. Tabbing through sixty earthquakes to reach the next control would be
          its own accessibility failure. */}
      {/*
        `contain: paint` is load-bearing, not a hint. Without it the sixty rows inflated
        `documentElement.scrollHeight` to 3,486px against an 820px viewport even though this box clips
        them, so the whole app could be dragged off the top of the screen. `overflow: clip` did not fix it.
      */}
      <ul
        /*
         * Its own scroller everywhere but the desktop rail. There the rail is already a tall column that
         * scrolls, and a second scroller inside it is a trap: the rail's bar reached its end with 2,386px
         * of list still inside, so it lied about how much was left, and which one a wheel moved depended
         * on where the pointer happened to be.
         *
         * The `xl:` height on the section above is what does it - with no minimum and no `flex-1` the box
         * is as tall as its rows and never overflows. This states the intent; that one enforces it.
         */
        className="scroll-fade mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2 [contain:paint]
          xl:overflow-y-visible xl:[contain:none]"
        onKeyDown={onKeyDown}
      >
        {quakes.map((quake, i) => (
          <li key={quake.key}>
            <button
              type="button"
              ref={(node) => {
                items.current[i] = node;
              }}
              tabIndex={i === cursor ? 0 : -1}
              aria-current={quake.key === selected ? "true" : undefined}
              onFocus={() => {
                cursorRef.current = i;
                setCursor(i);
              }}
              onClick={() => onSelect(quake.key === selected ? null : quake.key)}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-[2px] px-1.5 py-[7px] text-left transition-colors hover:bg-raised ${
                quake.key === selected ? "bg-raised" : ""
              }`}
            >
              {/* Two lines, not one. A single line measured 31px against this design's own 44px touch
                  minimum, and squeezed the place name into 167px so anything longer than "Flores Region,
                  Indonesia" was cut off mid-word. */}
              <span className="w-[34px] shrink-0 pt-px font-mono text-[14px] leading-none text-ink">
                {quake.primary.magnitude.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] leading-tight text-ink">
                  {place(quake.primary.place)}
                </span>
                <span className="mt-1 block truncate font-mono text-[10.5px] leading-none text-faint">
                  {/* One separator, not two. Time and depth are both measurements of the event, so they
                      keep the dot; the agencies are a different kind of fact, so they get distance. */}
                  {agoShort(quake.primary.time, now, archived)}
                  {` · ${depth(quake.primary)}`}
                  <span className="pl-3">{quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" ")}</span>
                  {/* Says which rows the header's "revised" count is about. A word rather than a mark: the
                      row is a button with no `aria-label`, so its accessible name is computed from this
                      content and the word is spoken with the rest of it. */}
                  {quake.readings.some((r) => r.revision) ? " · revised" : ""}
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

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
