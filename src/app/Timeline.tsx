import { useRef, useState } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { peakCount, type Bar } from "./histogram";
import { WINDOWS } from "./windows";

/*
 * The day as a strip, and the control that selects part of it.
 *
 * Same idea as the magnitude filter: the scale is the track. There the ramp is the legend and the
 * thumb is the threshold; here the histogram is the legend and the thumb is the left edge of the
 * window. Hours outside it dim in place rather than disappear, so the day stays whole and you can
 * see what has been cut instead of inferring it.
 *
 * The window is named, not dragged.
 *
 * It used to be a slider on this strip whose value was the window's left edge, which meant the strip
 * showed a day and the globe showed whatever part of it the thumb had kept: the two views disagreeing
 * by construction. It also fixed the bucket at an hour, and a month of hourly bars is seven hundred
 * and twenty of them in two hundred pixels.
 *
 * Three buttons instead, and the strip is always exactly the window. That frees the strip of one of
 * the three gestures it was carrying, so hovering a bar can belong to the bar rather than to a slider
 * lying over the top of them all.
 */

export interface TimelineProps {
  bars: Bar[];
  ramp: RampName;
  /** How long the window is, in hours. */
  hours: number;
  /** The bucket the pointer is holding, in whole buckets before now, or null. */
  focusHour: number | null;
  onFocusHourChange: (bucketsAgo: number | null) => void;
  onHoursChange: (hours: number) => void;
  /** How long one bar covers, for the readout and the axis. */
  bucketMs: number;
  /** True while a wider backlog is still arriving, so the strip can say so rather than look empty. */
  fetching: boolean;
  /**
   * True before any feed has vouched for the window, so an empty strip is not blamed on the filters.
   *
   * The same distinction the rail already draws between "Waiting for the first events" and "No events
   * match the current filters". `fetching` is not it: that is a pending *window change*, so at first
   * paint it is false while the strip is genuinely empty, and the readout would have claimed nothing
   * matched when in fact nothing had arrived.
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
  /**
   * True on an archived day, which has no right-hand edge called "now".
   *
   * The axis said "now" and the transport said "live" over a picture of a finished day. Both are the
   * same mistake the layer sentences and the ages made: a label describing the present printed against
   * a past span. The archived day's right edge is the end of that day.
   */
  archived?: boolean;
  /**
   * How far back each feed can vouch, as a fraction of the window and a duration in words.
   *
   * Drawn here rather than beside the source buttons because this strip's axis already *is* the
   * window, labelled at both ends, and the blocks on it already mean "not covered". A bar needs an
   * axis to be read against, and inventing a second one two blocks away would be the same span
   * measured twice.
   */
  reaches: readonly { id: string; label: string; fraction: number; words: string }[];
  /**
   * What the bars mean, when they need saying. Empty when they do not.
   *
   * A list rather than one string per sentence, because these are all footnotes to the same picture and
   * the alternative is a new prop each time the bars have something else to admit. Moved here from
   * beside the source buttons, which is where the first one was written and two blocks from the thing it
   * explains: a caveat about an asymmetry belongs under the picture of the asymmetry.
   */
  notes: readonly string[];
}

const STRIP_PX = 44;
/* The tallest bar stops short of the strip, so a peak reads as a peak rather than as clipping. */
const BAR_MAX_PX = 39;

/*
 * Relative, not a clock time.
 *
 * The buckets are anchored to `now`, so the hour five bars back ends at 05:51 rather than 05:00 and
 * printing that reads as false precision about a bucket boundary nobody chose. The axis either side
 * is already relative, so the readout matches it.
 */
const HOUR_MS = 3_600_000;

/**
 * How long ago a bucket was, in the coarsest unit that does not lie about the bucket's own width.
 *
 * A thirty-hour bucket described as "30h ago" reads as a precise moment thirty hours back, when it is
 * a day and a bit wide. Naming it in days at that size says roughly the right thing, and saying
 * roughly the right thing about a bucket is the honest option when the bucket is roughly that wide.
 */
const bucketAgo = (bucketsAgo: number, bucketMs: number): string => {
  if (bucketsAgo === 0) return "latest";
  const ms = bucketsAgo * bucketMs;
  if (bucketMs >= 24 * HOUR_MS) return `${Math.round(ms / (24 * HOUR_MS))}d ago`;
  const h = Math.round(ms / HOUR_MS);
  return h >= 48 ? `${Math.round(h / 24)}d ago` : `${h}h ago`;
};

/**
 * What one bucket is, named the same way `bucketAgo` names a distance.
 *
 * `BUCKETS` is fixed at 24 and the window is 24h, 7d or 30d, so a bucket is an hour on exactly one of
 * the three and seven or thirty hours on the others. Two strings in this file said "hours" flatly - the
 * caveat under the strip and the strip's own accessible name - which made both of them wrong on two
 * windows out of three, directly under a helper whose comment explains that a bucket is not an hour.
 *
 * Rounding to days above 24 hours is `bucketAgo`'s rule rather than a new one: thirty hours called a day
 * is roughly right about something that is roughly that wide, which is the honest reading when the
 * alternative is "30-hour spans" in a sentence a viewer is meant to absorb in passing.
 */
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
  notes, archived = false,
}: TimelineProps): JSX.Element {
  const peak = peakCount(bars);
  const tallest = bars.find((b) => b.count === peak && peak > 0);
  const observed = bars.some((b) => b.observed);
  const unobserved = observed && bars.some((b) => !b.observed);
  const held = focusHour === null ? null : bars.find((b) => b.bucketsAgo === focusHour) ?? null;
  const unit = bucketUnit(bucketMs);

  /*
   * The bars are real buttons, so holding an hour is not a mouse-only gesture.
   *
   * This was on the open-limitations list as an enhancement rather than a feature: hover had no
   * keyboard or touch equivalent, so a keyboard user could not ask "which of these happened at 05:00"
   * the way a pointer user could. That entry also rejected the obvious fix - "no amount of arrow-key
   * cleverness would be discoverable enough to count" - and it was right about cleverness. A focusable
   * group is not cleverness: it is the pattern, it shows a focus ring where the hold is, and on a touch
   * screen a tap does what a tap looks like it should do.
   *
   * **Focus is the hold**, so there is no second state to keep in step with the pointer's. One tab stop
   * for the whole strip on a roving `tabIndex`, the same shape `EventList` uses, because twenty-four tab
   * stops in front of the rest of the rail would be a worse barrier than the one this removes.
   *
   * `STRIP_PX` is 44, which is exactly the touch-target minimum, so this costs no layout at all.
   */
  const [barAt, setBarAt] = useState(0);
  const barRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusBar = (index: number): void => {
    const next = Math.max(0, Math.min(bars.length - 1, index));
    setBarAt(next);
    barRefs.current[next]?.focus();
  };

  /*
   * Square root, not linear.
   *
   * Counts across a day run from 0 to several hundred once a sequence starts, and linear height
   * turns the other twenty-three hours into a flat line: the strip would show the swarm and hide
   * the day around it. The bars answer when the activity was, and the peak is printed as a number
   * beside them so the one quantity worth knowing exactly is read rather than estimated.
   */
  const heightOf = (count: number): number =>
    count === 0 ? 1 : Math.max(3, Math.round(Math.sqrt(count / peak) * BAR_MAX_PX));

  return (
    // Paints the magnitude ramp outside the canvas, so it carries the marker the design contract
    // excludes by name. See DESIGN.md 3.1.
    <div data-ramp>
      <div className="flex items-baseline justify-between gap-3">
        {/* Still a label, just no longer an uppercase badge: the slider below needs an accessible
            name, and swapping the element for a span quietly took it away. */}
        {/*
          Buttons, not a label for a slider that no longer exists. The group names itself by what its
          options are, which is what makes the word "Activity" beside them redundant rather than
          missing.
        */}
        <div className="flex items-center gap-1" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => onHoursChange(w.hours)}
              aria-pressed={hours === w.hours}
              className={`border px-1.5 py-0.5 font-mono text-[10.5px] ${
                hours === w.hours
                  ? "border-hair bg-raised text-ink"
                  : "border-transparent text-faint hover:text-dim"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {/*
          The held hour replaces the peak while hovering. Both are readings of the same strip and
          only one of them is being asked for; showing them together put two numbers side by side
          with nothing to say which the pointer was over.
        */}
        <span className="font-mono text-[10.5px] text-faint">
          {fetching
            ? "fetching the backlog"
            : held
              ? `${held.count} ${held.count === 1 ? "event" : "events"} · `
                + `${bucketAgo(held.bucketsAgo, bucketMs)}`
              : peak > 0 && tallest
                ? `peak ${peak} · ${bucketAgo(tallest.bucketsAgo, bucketMs)}`
                /*
                  An empty window says so, in the slot the peak was using.

                  With nothing passing the filter every bucket draws its 1px floor, so the strip becomes
                  a row of twenty-four slivers under an axis: a frame around nothing, which reads as a
                  rendering fault rather than as zero. The rail says "No events match the current filters"
                  forty pixels below, and this is the same fact about the same window, so it costs a line
                  that was already blank.
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
          /*
            Released when focus leaves the strip entirely, not when it moves between bars: `relatedTarget`
            is the element gaining focus, and without this check every arrow press would clear the hold it
            had just set.
          */
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
              /*
                The same words the readout uses, so the two cannot drift apart, and an hour the buffer
                never covered says so rather than reading as a quiet hour.
              */
              aria-label={bar.observed
                ? `${bar.count} ${bar.count === 1 ? "event" : "events"}, `
                  + `${bucketAgo(bar.bucketsAgo, bucketMs)}`
                : `Not covered, ${bucketAgo(bar.bucketsAgo, bucketMs)}`}
              onFocus={() => { setBarAt(i); onFocusHourChange(bar.bucketsAgo); }}
              onPointerEnter={() => onFocusHourChange(bar.bucketsAgo)}
              className={`flex h-full flex-1 cursor-pointer items-end ${
                // Chrome, not hue: the held hour is an interface state, and the fills beside it are
                // data. Behind the bar so it reads as a backdrop rather than as a value.
                // A tick at the top of the column plus a lifted backdrop. The backdrop alone was
                // invisible: the bar fills most of the cell, so the only part of it anybody could
                // have seen was the few pixels of headroom above a peak.
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
                 * A filled block, not an empty bar.
                 *
                 * An hour the buffer did not cover drawn as a zero-height bar says the planet was
                 * quiet. It says nothing of the sort: the page was not open. The block reads as
                 * territory rather than as a measurement, which is the distinction.
                 */
                <div className="h-full w-full bg-raised" />
              )}
            </button>
          ))}
        </div>

        {/*
          Everything after the cursor, veiled.

          The globe is already only drawing up to the cursor, and a strip that went on showing the
          whole day beside it would be the two views disagreeing about what time it is. Lighter than
          the window veil below, because these hours are coming rather than excluded.
        */}
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
        {/*
          The axis, and only the axis. It carried "last N hours" in the middle, which is the same
          sentence the headline above already prints from the same number: two identical phrases in
          one rail, and nothing to tell you which one you had just changed. The thumb marks the
          window here, the count names it there, and a screen reader gets it from `aria-valuetext`.
        */}
        <span>{archived ? "day start" : spanLabel(hours)}</span>
        <span>{archived ? "day end" : "now"}</span>
      </div>

      {/*
        How far back each feed reaches, against the axis directly above it.

        The header prints a count per agency and this strip marks the hours nothing covered, and between
        them there was no way to see that at a month USGS vouches for thirty days while EMSC vouches for
        the last eighteen hours. The catalogue returns its most recent page whatever is asked of it, so
        widening the window widens one bar and not the other, and that is the dual-source architecture
        made visible rather than described.

        Anchored right, because coverage reaches back from now, which is the direction the axis runs.

        On screen from the first frame, both tracks empty, each filling when its own feed answers. That
        is the same architecture legible in the first second rather than a moment later: the headline says
        the app is asking two agencies and these say which of them has replied. It also means the load
        state and the steady state are one visual instead of a spinner and then a chart.
      */}
      {reaches.length > 0 ? (
        /*
          Tight to the axis, because these measure it.
          The axis, the two coverage rules and the transport all sat 8 to 10px apart, so four lines read
          as four peers when they are one scale, two annotations of it, and a control. Grouping by gap
          costs nothing and does what the weight change alone could not.
        */
        <div className="mt-1">
          {reaches.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-[34px] shrink-0 font-mono text-[10.5px] text-faint">{r.label}</span>
              {/*
                A rule, not a track, because this one cannot be dragged.

                Three horizontal lines used to sit in a row here - USGS coverage, EMSC coverage and the
                cursor - at one weight and with no cue for which of them answers a pointer. The two that
                do not were the *heavier* pair: 3px on a filled `raised` track against the transport's 2px
                hairline, so the readouts looked more like controls than the control did. Weight now says
                what is touchable, which leaves the thumb below as the only track-shaped thing in the rail.
              */}
              <span className="relative h-px min-w-0 flex-1 bg-hairline">
                <span
                  className="absolute inset-y-0 right-0 bg-dim"
                  style={{ width: `${Math.max(r.fraction > 0 ? 1 : 0, r.fraction * 100)}%` }}
                />
              </span>
              <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-faint tabular-nums">
                {r.words}
              </span>
            </div>
          ))}
          {notes.map((note) => (
            <p key={note} className="mt-2 text-[11px] leading-relaxed text-faint">{note}</p>
          ))}
        </div>
      ) : null}

      {/*
        The transport, on its own track rather than on the strip.

        The strip already carries two gestures: dragging sets the window, moving across it holds an
        hour. A third on the same forty-four pixels would be three meanings for one drag, and the one
        that lost would be whichever the pointer happened not to mean. So the cursor gets its own
        line, aligned to the same width so it reads against the bars above it.
      */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayToggle}
          aria-label={playing ? "Pause" : "Play the window through"}
          aria-keyshortcuts="Space"
          className="h-5 w-5 shrink-0 border border-hair text-[9.5px] leading-none text-dim
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
           * Arrows step a bucket, not a thousandth of the window.
           *
           * The track is 0 to 1000 so a pointer drag is smooth, and that made one arrow press
           * 1/1000th of the span: 86 seconds at a day, 43 minutes at a month. Neither corresponds
           * to anything drawn on the strip above, so the cursor moved and the picture did not, at
           * every width. A bucket is the smallest step the bars can show.
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
        {/*
          Reads "live" rather than a clock when it is live, because null is not a time. The button is
          only offered when there is something to come back from.

          On an archived day there is no live edge to be at, so the unparked state says where the cursor
          actually is - the end of the day it is showing - rather than claiming to be live.
        */}
        {parked ? (
          <button
            type="button"
            onClick={onLive}
            // The clock is already the headline's job, and printing it twice in one rail gave two
            // readings of one number with nothing to say which was which.
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

      {/* Only once some hours are observed. A caveat about the blocks, at the moment the whole strip
          is blocks, explains a state the sentence above the rail has already named. */}
      {unobserved ? (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Blocks are {unit.many} the buffer was not open for, not quiet ones.
        </p>
      ) : null}
    </div>
  );
}
