import { useRef, useState, type ReactNode } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { peakCount, type Bar } from "./histogram";
import { WINDOWS } from "./windows";

/* The window as a strip of bars, with the transport under it. See ARCHITECTURE.md. */

export interface TimelineProps {
  bars: Bar[];
  ramp: RampName;
  /** How long the window is, in hours. */
  hours: number;
  /** The bucket the pointer is holding, in whole buckets before now, or null. */
  focusHour: number | null;
  onFocusHourChange: (bucketsAgo: number | null) => void;
  onHoursChange: (hours: number) => void;
  /** Pins the event a bar stands for. The bar is the control, not the tick: a 2px tick is not a touch
   * target and the bar already clears 44px. */
  onSelect: (key: string) => void;
  /** How long one bar covers, for the readout and the axis. */
  bucketMs: number;
  /** True while a wider backlog is still arriving, so the strip can say so rather than look empty. */
  fetching: boolean;
  /**
   * True before any feed has vouched for the window, so an empty strip is not blamed on the filters. See
   * ARCHITECTURE.md.
   */
  waiting: boolean;
  /** Where the cursor sits across the strip, 0 at the old edge and 1 at now. Live reads as 1. */
  cursor: number;
  /** True when the cursor is standing somewhere rather than following the present. */
  parked: boolean;
  playing: boolean;
  onScrub: (fraction: number) => void;
  /** Moves the cursor by whole buckets, signed. The keyboard path to the transport. */
  onStep: (buckets: number) => void;
  onPlayToggle: () => void;
  onLive: () => void;
  /** The cursor's clock, already formatted, for the readout beside the transport. */
  cursorLabel: string | null;
  /** True on an archived day, which has no right-hand edge called "now". The axis said "now" and the
   * transport said "live" over a picture of a finished day. */
  archived?: boolean;
  /**
   * How far back each feed can vouch, as a fraction of the window and a duration in words. Drawn here
   * because this strip's axis already is the window, labelled at both ends. A bar needs an axis to be read
   * against, and a second one two blocks away would be the same span measured twice.
   */
  reaches: readonly { id: string; label: string; fraction: number; words: string }[];
  /** What the bars mean, when they need saying. A list rather than one prop per sentence: these are all
   * footnotes to the same picture, and a caveat belongs under the picture it is about. */
  notes: readonly string[];
  /**
   * More about the same events, under the footnotes and above the transport. The size distribution goes
   * here: these bars are counts against time and that chart is counts against magnitude, and it used to
   * sit at the bottom of the rail with the play controls between the two.
   */
  children?: ReactNode;
}

const STRIP_PX = 44;

/* The bars answer "how much" and never "which one". Five is countable on a strip this wide. */
const NOTABLE = 5;
/* The tallest bar stops short of the strip, so a peak reads as a peak rather than as clipping. */
const BAR_MAX_PX = 39;

/*
 * Relative, not a clock time. The buckets are anchored to `now`, so the hour five bars back ends at 05:51
 * rather than 05:00, and printing that is false precision about a boundary nobody chose.
 */
const HOUR_MS = 3_600_000;

/**
 * How long ago a bucket was, in the coarsest unit that does not lie about the bucket's own width. A
 * thirty-hour bucket called "30h ago" reads as a precise moment; it is a day and a bit wide.
 */
const bucketAgo = (bucketsAgo: number, bucketMs: number): string => {
  if (bucketsAgo === 0) return "latest";
  const ms = bucketsAgo * bucketMs;
  if (bucketMs >= 24 * HOUR_MS) return `${Math.round(ms / (24 * HOUR_MS))}d ago`;
  const h = Math.round(ms / HOUR_MS);
  return h >= 48 ? `${Math.round(h / 24)}d ago` : `${h}h ago`;
};

/** What one bucket is, named the way `bucketAgo` names a distance. See ARCHITECTURE.md. */
const bucketUnit = (bucketMs: number): { one: string; many: string } => {
  const h = Math.round(bucketMs / HOUR_MS);
  if (h <= 1) return { one: "hour", many: "hours" };
  if (bucketMs >= 24 * HOUR_MS) {
    const d = Math.round(bucketMs / (24 * HOUR_MS));
    return d <= 1 ? { one: "day", many: "days" } : { one: `${d}-day span`, many: `${d}-day spans` };
  }
  return { one: `${h}-hour span`, many: `${h}-hour spans` };
};

/** The axis's left edge. The right is always now. */
const spanLabel = (hours: number): string =>
  (hours >= 48 ? `${Math.round(hours / 24)}d ago` : `${hours}h ago`);

export function Timeline({
  bars, ramp, hours, focusHour, onHoursChange, onFocusHourChange, bucketMs, fetching, waiting,
  cursor, parked, playing, onScrub, onStep, onPlayToggle, onLive, cursorLabel, reaches,
  notes, archived = false, children, onSelect,
}: TimelineProps): JSX.Element {
  const peak = peakCount(bars);
  const tallest = bars.find((b) => b.count === peak && peak > 0);
  const observed = bars.some((b) => b.observed);
  const unobserved = observed && bars.some((b) => !b.observed);
  const held = focusHour === null ? null : bars.find((b) => b.bucketsAgo === focusHour) ?? null;
  const unit = bucketUnit(bucketMs);

  /* The bars are real buttons, so holding an hour is not mouse-only. See ARCHITECTURE.md. */
  const [barAt, setBarAt] = useState(0);
  const barRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusBar = (index: number): void => {
    const next = Math.max(0, Math.min(bars.length - 1, index));
    setBarAt(next);
    barRefs.current[next]?.focus();
  };

  /*
   * Square root, not linear. Counts run from 0 to several hundred once a sequence starts, and linear
   * height turns the other twenty-three hours into a flat line: the strip would show the swarm and hide
   * the day around it. The peak is printed as a number beside them.
   */
  /* Copied before sorting: `bars` is a prop, and sorting it in place reorders the strip itself. Strongest
     chosen, then drawn in time order, because the axis under them is time. */
  const notable = [...bars]
    .filter((b) => b.lead !== null)
    .sort((a, b) => b.lead!.magnitude - a.lead!.magnitude)
    .slice(0, NOTABLE)
    .sort((a, b) => a.lead!.position - b.lead!.position);

  const heightOf = (count: number): number =>
    count === 0 ? 1 : Math.max(3, Math.round(Math.sqrt(count / peak) * BAR_MAX_PX));

  return (
    // Paints the magnitude ramp outside the canvas, so it carries the marker the design contract excludes
    // by name. See DESIGN.md 3.1.
    <div data-ramp>
      <div className="flex items-baseline justify-between gap-3">
        {/* Still a label, just no longer an uppercase badge: the slider below needs an accessible name,
            and swapping the element for a span quietly took it away. */}
        {/* Buttons, not a label for a slider that no longer exists. The group names itself by what its
            options are, which is what makes the word "Activity" redundant rather than missing. */}
        <div className="flex items-center gap-1" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => onHoursChange(w.hours)}
              aria-pressed={hours === w.hours}
              className={`border px-1.5 py-0.5 font-mono text-[10.5px] ${
                hours === w.hours
                  // `border-hair` is not a token, so this fell back to `currentColor` and drew an `ink`
                  // border - the brightest edge in the app, by accident.
                  ? "border-faint bg-raised text-ink"
                  : "border-transparent text-faint hover:text-dim"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {/* The held hour replaces the peak while hovering. Both read the same strip and only one is being
            asked for, so showing them together left two numbers with nothing saying which was which. */}
        <span className="font-mono text-[10.5px] text-faint">
          {fetching
            ? "fetching the backlog"
            : held
              ? `${held.count} ${held.count === 1 ? "event" : "events"} · `
                + `${bucketAgo(held.bucketsAgo, bucketMs)}`
              : peak > 0 && tallest
                ? `peak ${peak} · ${bucketAgo(tallest.bucketsAgo, bucketMs)}`
                /*
                  An empty window says so, in the slot the peak was using. With nothing passing the filter
                  every bucket draws its 1px floor, so the strip becomes a row of twenty-four slivers under
                  an axis: a frame around nothing, which reads as a rendering fault rather than as zero.
                */
                : waiting
                  ? ""
                  : "nothing in this window"}
        </span>
      </div>

      <div
        className="relative mt-2.5"
        style={{ height: `${STRIP_PX}px` }}
        onPointerLeave={() => onFocusHourChange(null)}
      >
        <div
          role="group"
          aria-label={`Activity by ${unit.one}`}
          className="flex h-full items-end gap-px"
          onKeyDown={(e) => {
            const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            if (step !== 0) { e.preventDefault(); focusBar(barAt + step); return; }
            if (e.key === "Home") { e.preventDefault(); focusBar(0); return; }
            if (e.key === "End") { e.preventDefault(); focusBar(bars.length - 1); return; }
            // Let go without leaving the strip, which a pointer does by moving away and a keyboard
            // otherwise could not do at all.
            if (e.key === "Escape") onFocusHourChange(null);
          }}
          /* Released when focus leaves the strip entirely, not when it moves between bars: `relatedTarget`
             is the element gaining focus, and without this every arrow press clears the hold it just set. */
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusHourChange(null);
          }}
        >
          {bars.map((bar, i) => (
            <button
              key={bar.bucketsAgo}
              ref={(node) => { barRefs.current[i] = node; }}
              type="button"
              tabIndex={i === barAt ? 0 : -1}
              /* The same words the readout uses, so the two cannot drift, and an hour the buffer never
                 covered says so rather than reading as a quiet hour. */
              aria-label={bar.observed
                ? `${bar.count} ${bar.count === 1 ? "event" : "events"}, `
                  + `${bucketAgo(bar.bucketsAgo, bucketMs)}`
                  + (bar.lead === null ? "" : `, largest M${bar.lead.magnitude.toFixed(1)}`)
                : `Not covered, ${bucketAgo(bar.bucketsAgo, bucketMs)}`}
              onClick={() => { if (bar.lead !== null) onSelect(bar.lead.key); }}
              onFocus={() => { setBarAt(i); onFocusHourChange(bar.bucketsAgo); }}
              onPointerEnter={() => onFocusHourChange(bar.bucketsAgo)}
              className={`flex h-full flex-1 cursor-pointer items-end ${
                // Chrome, not hue: the held hour is an interface state and the fills beside it are data.
                // A tick at the top of the column plus a lifted backdrop - the backdrop alone was invisible,
                // since the bar fills most of the cell.
                bar.bucketsAgo === focusHour ? "border-t border-ink bg-raised" : "border-t border-transparent"
              }`}
            >
              {bar.observed ? (
                <div
                  className="w-full"
                  style={{
                    height: `${heightOf(bar.count)}px`,
                    background: bar.peak === null
                      ? "var(--color-faint)"
                      : rampColorAt(ramp, (bar.peak - MAG_MIN) / (MAG_MAX - MAG_MIN)),
                    opacity: bar.count === 0 ? 0.35 : 1,
                  }}
                />
              ) : (
                /*
                 * A filled block, not an empty bar. An hour the buffer did not cover drawn as a zero-height
                 * bar says the planet was quiet; it says nothing of the sort, the page was not open.
                 */
                <div className="h-full w-full bg-raised" />
              )}
            </button>
          ))}
        </div>

        {/* The notable events, over the bars they belong to. See ARCHITECTURE.md. */}
        {notable.map((bar) => (
          <span
            key={bar.lead!.key}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-[4px] w-[2px] -translate-x-1/2"
            style={{
              left: `${bar.lead!.position * 100}%`,
              background: rampColorAt(ramp, (bar.lead!.magnitude - MAG_MIN) / (MAG_MAX - MAG_MIN)),
            }}
          />
        ))}
        {/* Everything after the cursor, veiled. The globe is only drawing up to the cursor, and a strip
            showing the whole day beside it would be the two views disagreeing about what time it is.
            Lighter than the window veil, because these hours are coming rather than excluded. */}
        {parked ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-deck/62"
            style={{ width: `${(1 - cursor) * 100}%` }}
          />
        ) : null}
        {/* The cursor itself, on top of its own veil so the line reads as the edge of the fill. */}
        {parked ? (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-ink"
            style={{ left: `${cursor * 100}%` }}
          />
        ) : null}

      </div>

      <div
        id="window-scale"
        className="mt-2 flex justify-between font-mono text-[10.5px] text-faint"
      >
        {/* The axis, and only the axis. It carried "last N hours" in the middle, which is the sentence the
            headline already prints from the same number: two identical phrases in one rail, with nothing
            to tell you which one you had just changed. */}
        <span>{archived ? "day start" : spanLabel(hours)}</span>
        <span>{archived ? "day end" : "now"}</span>
      </div>

      {/* How far back each feed reaches, against the axis above it. See ARCHITECTURE.md. */}
      {/* Folded: provenance, not a control. Opened, still tight to the axis it measures. */}
      {reaches.length > 0 ? (
        <details className="mt-1">
          <summary className="disclose text-[11px] text-faint hover:text-dim">
            How far the feeds reach
          </summary>
          {/* Tight to the axis, because these measure it. At 8 to 10px apart the axis, the two coverage
              rules and the transport read as four peers, when they are one scale, two annotations and a
              control. */}
          <div className="mt-1">
          {reaches.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-[34px] shrink-0 font-mono text-[10.5px] text-faint">{r.label}</span>
              {/*
                A rule, not a track, because this one cannot be dragged. The two readouts were the heavier
                pair - 3px on a filled `raised` track against the transport's 2px hairline - so they looked
                more like controls than the control did. Weight now says what is touchable.
              */}
              <span className="relative h-px min-w-0 flex-1 bg-hairline">
                <span
                  className="absolute inset-y-0 right-0 bg-dim"
                  style={{ width: `${Math.max(r.fraction > 0 ? 1 : 0, r.fraction * 100)}%` }}
                />
              </span>
              {/* `nowrap` so a longer word overflows rather than stacking and moving the rule. */}
              <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] whitespace-nowrap text-faint tabular-nums">
                {r.words}
              </span>
            </div>
          ))}
          {notes.map((note) => (
            <p key={note} className="mt-2 text-[11px] leading-relaxed text-faint">{note}</p>
          ))}
        </div>
        </details>
      ) : null}

      {children}

      {/* The transport, on its own track rather than on the strip. Moving across the strip holds an hour,
          and a drag that both held an hour and moved the cursor would be two meanings for one gesture. */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayToggle}
          aria-label={playing ? "Pause" : "Play the window through"}
          aria-keyshortcuts="Space"
          // Same missing token and the same accident: a `dim` edge on a control whose neighbours are all
          // hairline. The glyph is a symbol rather than a figure, so it sits on the sans step.
          className="h-5 w-5 shrink-0 border border-hairline text-[11px] leading-none text-dim
            hover:text-ink"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(cursor * 1000)}
          onChange={(e) => onScrub(Number(e.target.value) / 1000)}
          /*
           * Arrows step a bucket, not a thousandth of the window. The track is 0 to 1000 so a pointer drag
           * is smooth, which made one arrow press 86 seconds at a day and 43 minutes at a month: the cursor
           * moved and the picture did not.
           */
          onKeyDown={(e) => {
            const by = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
              : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1
                : 0;
            if (by === 0) return;
            e.preventDefault();
            onStep(by);
          }}
          aria-label="Time in the window"
          aria-valuetext={cursorLabel ?? "Live"}
          aria-keyshortcuts="Comma Period"
          className="scrub-slider flex-1"
        />
        {/* Reads "live" rather than a clock when it is live, because null is not a time. On an archived day
            there is no live edge to be at, so the unparked state says where the cursor actually is. */}
        {parked ? (
          <button
            type="button"
            onClick={onLive}
            // The clock is already the headline's job, and printing it twice gave two readings of one
            // number with nothing to say which was which.
            className="shrink-0 font-mono text-[10.5px] text-dim hover:text-ink"
          >
            go live
          </button>
        ) : (
          <span className="shrink-0 font-mono text-[10.5px] text-faint">
            {archived ? "day end" : "live"}
          </span>
        )}
      </div>

      {/* Below the transport, not above: there it wrapped in the tablet column and pushed the transport
          past the fold. Controls above, commentary below. */}
      {notable.length > 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {notable.length === 1
            ? "The tick marks the largest event. "
            : `The ticks mark the ${notable.length} largest. `}
          Click a bar to open the largest in it.
        </p>
      ) : null}

      {/* Only once some hours are observed. A caveat about the blocks, at the moment the whole strip is
          blocks, explains a state the sentence above the rail has already named. */}
      {unobserved ? (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Blocks are {unit.many} the buffer was not open for, not quiet ones.
        </p>
      ) : null}
    </div>
  );
}
