import { useEffect, useRef, useState } from "react";
import type { Quake } from "../data/types";
import { ago, agoShort, coordinates, depth, place, reportedBy, SOURCE_NAMES } from "./format";
import { newsIn } from "./announce";

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
  /**
   * The events that genuinely just arrived, for anything else that wants them.
   *
   * Handed out from here rather than recomputed elsewhere, because `newsIn` is the one place that knows
   * an event being new to a list is not the same as it being new, and a second implementation of that
   * would be a second chance to announce a whole cold-load backlog.
   */
  onNews?: (magnitudes: number[]) => void;
  onAnnounceAboveChange: (value: number) => void;
  /** True before any feed has delivered, so an empty list is not blamed on the filters. */
  waiting: boolean;
  /**
   * The clock every age in this list is measured against.
   *
   * Passed in rather than read here, because on an archived day it is the end of that day and not the
   * present. Reading `Date.now()` put "99d" on every row of a picture of 2026-05-15 while the title
   * block beside it said "13h": one archived day, two clocks, disagreeing on screen at the same time.
   */
  now: number;
}

/** One event, as a sentence rather than a row of fields. */
function sentence(quake: Quake, now: number): string {
  const r = quake.primary;
  const kind = r.kind === "earthquake" ? "earthquake" : r.kind;
  const revised = quake.readings.flatMap((x) => (x.revision
    ? [`${SOURCE_NAMES[x.source]} first reported ${x.revision.fromMagnitude.toFixed(1)}`]
    : []));
  return `Magnitude ${r.magnitude.toFixed(1)} ${kind}, ${place(r.place)}, ${ago(r.time, now)}, `
    + `${depth(r)} deep, reported by ${reportedBy(quake)}.`
    // The announcement carries the value, where the row carries only the word. A row can be pinned
    // to find out what changed; an announcement has already gone by, so "revised" on its own in the
    // live region would be a fact with no way left to follow it up.
    + (revised.length > 0 ? ` Revised: ${revised.join(", ")}.` : "");
}

export function EventList({
  quakes, selected, onSelect, announceAbove, onAnnounceAboveChange, onNews, waiting, now,
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
   * The live region, gated by magnitude and by the clock.
   *
   * A busy feed delivers hundreds of events an hour, and announcing all of them floods a screen reader
   * until the person closes the page. The threshold is the viewer's and the default is deliberately
   * high: silence that can be lowered is recoverable, an unusable page is not.
   *
   * The clock is the other half, and see `announce.ts` for why: an event being new to this list is not
   * the same as it being new, and reading the difference as news announced the whole backlog on every
   * cold load.
   */
  useEffect(() => {
    /*
      The real clock here, deliberately, and not the archived one.
      This decides what genuinely just *arrived*, which only happens while live: an archived day has
      stopped its sources, so nothing is new and this path is dormant. It also stays out of the
      dependency list below, because the displayed clock ticks every second and an announcement effect
      that reran at 1Hz would be doing `newsIn` sixty times a minute to answer "nothing arrived".
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
        : `${fresh.length} new earthquakes above magnitude ${announceAbove.toFixed(1)}. Largest: `
          + sentence([...fresh].sort((a, b) => b.primary.magnitude - a.primary.magnitude)[0]!, spoken),
    );
  }, [quakes, announceAbove, onNews]);

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

  return (
    /*
      A floor under the list, because `flex-1` gives zero when there is nothing left to give.
      The rail scrolls when its content exceeds the window, and in that state `flex-1` resolved this
      section to **height 0**: the rows hung outside a zero-height box, below the rail's own scrollable
      extent, so nothing could bring them into view. Measured on a 720px window with one event held -
      the rail was a 674px box around 752px of content, scrollable by 78px, and the only row sat 86px
      past the bottom edge. Three tests had been failing on exactly that arithmetic.
      `min-h-0` is still what lets the scrollport shrink below its content; it just must not shrink to
      nothing. Three rows is the floor, and if honouring it makes the rail scroll, the rail scrolls.
    */
    <section
      aria-label="Recent earthquakes"
      className="flex min-h-[8.25rem] flex-1 flex-col"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="label">Recent</h2>
        <span className="font-mono text-[11px] text-faint">newest first</span>
      </div>

      {/*
       * The announce threshold sits in a details, not beside the list as a second bare slider.
       *
       * Two identical-looking sliders one above the other, one filtering the globe and one setting
       * a screen-reader threshold, read as one control with a duplicate. It is a setting rather
       * than a filter, almost nobody changes it, and the people it matters most to reach it by
       * keyboard either way.
       */}
      <details className="mt-1.5">
        <summary className="cursor-pointer list-none text-[11px] text-faint hover:text-dim">
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
        // Blaming the filters is only right when there is something for them to exclude. On arrival
        // the list is empty because nothing has arrived, and saying otherwise sends someone to widen
        // a filter that was never the problem.
        <p className="mt-2 text-[12px] text-faint">
          {waiting ? "Waiting for the first events." : "No events match the current filters."}
        </p>
      ) : null}

      {/* One tab stop, then arrows. Tabbing through sixty earthquakes to reach the next control
          would be its own accessibility failure. */}
      {/*
        `contain: paint` is load-bearing, not a hint.

        Without it the sixty rows inflated `documentElement.scrollHeight` to 3,486px against an 820px
        viewport even though this box clips them: a scroll container's content still reached the
        document's layout overflow, so the whole app could be dragged off the top of the screen to
        reveal 2,500px of void. Setting `overflow: clip` here did not fix it and neither did clipping
        the root. Containment is the only thing that says "nothing in this box affects anything
        outside it", which is exactly the claim that was false.
      */}
      <ul
        className="mt-2 min-h-0 flex-1 overflow-y-auto pr-2 [contain:paint]"
        onKeyDown={onKeyDown}
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
              className={`flex w-full cursor-pointer items-start gap-3 rounded-[2px] px-1.5 py-[7px] text-left transition-colors hover:bg-raised ${
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
                  {/*
                    One separator, not two. A metadata line reading "3m · 155 km · USGS EMSC" uses the
                    middle dot as the answer to every relationship on the line; space is the other
                    answer and it does not need to be read. Time and depth are both measurements of
                    the event, so they keep the dot. The agencies are a different kind of fact, so
                    they get distance instead.
                  */}
                  {agoShort(quake.primary.time, now)}
                  {` · ${depth(quake.primary)}`}
                  <span className="pl-3">
                    {quake.readings.map((r) => SOURCE_NAMES[r.source]).join(" ")}
                  </span>
                  {/*
                    Says which rows the header's "revised" count is about. A number in the header
                    with nothing to click is a statistic about an invisible set: you learn that three
                    magnitudes changed and cannot find one of them.

                    A word rather than a mark, because it costs no new visual idiom, sits in the line
                    that already carries the row's metadata, and needs no separate label: the row is
                    a button with no `aria-label`, so its accessible name is computed from exactly
                    this content and the word is spoken along with everything else in it.
                  */}
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

      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </section>
  );
}
