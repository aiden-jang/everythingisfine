import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { HOURS, peakCount, type Bar } from "./histogram";

/*
 * The day as a strip, and the control that selects part of it.
 *
 * Same idea as the magnitude filter: the scale is the track. There the ramp is the legend and the
 * thumb is the threshold; here the histogram is the legend and the thumb is the left edge of the
 * window. Hours outside it dim in place rather than disappear, so the day stays whole and you can
 * see what has been cut instead of inferring it.
 *
 * The slider's value is the **left edge**, not the length. Sliding right shrinks the window, which
 * is the only mapping where the thumb is where it looks like it is. A slider whose value counted
 * hours would have to run backwards to stay spatially truthful, and the last control in this app
 * that inverted a direction to be clever took three attempts to get right.
 */

export interface TimelineProps {
  bars: Bar[];
  ramp: RampName;
  /** Hours, 1 to 24. */
  hours: number;
  /** The hour the pointer is holding, in whole hours before now, or null. */
  focusHour: number | null;
  onFocusHourChange: (hoursAgo: number | null) => void;
  onHoursChange: (hours: number) => void;
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
const hoursAgo = (h: number): string => (h === 0 ? "this hour" : `${h}h ago`);

export function Timeline({
  bars, ramp, hours, focusHour, onHoursChange, onFocusHourChange,
}: TimelineProps): JSX.Element {
  const peak = peakCount(bars);
  const tallest = bars.find((b) => b.count === peak && peak > 0);
  const observed = bars.some((b) => b.observed);
  const unobserved = observed && bars.some((b) => !b.observed);
  const held = focusHour === null ? null : bars.find((b) => b.hoursAgo === focusHour) ?? null;

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
        <label className="text-[11px] text-faint" htmlFor="window">Activity</label>
        {/*
          The held hour replaces the peak while hovering. Both are readings of the same strip and
          only one of them is being asked for; showing them together put two numbers side by side
          with nothing to say which the pointer was over.
        */}
        <span className="font-mono text-[10.5px] text-faint">
          {held
            ? `${held.count} ${held.count === 1 ? "event" : "events"} · ${hoursAgo(held.hoursAgo)}`
            : peak > 0 && tallest
              ? `peak ${peak} · ${hoursAgo(tallest.hoursAgo)}`
              : ""}
        </span>
      </div>

      <div className="relative mt-2.5" style={{ height: `${STRIP_PX}px` }}>
        <div className="flex h-full items-end gap-px">
          {bars.map((bar) => (
            <div
              key={bar.hoursAgo}
              className={`flex h-full flex-1 items-end ${
                // Chrome, not hue: the held hour is an interface state, and the fills beside it are
                // data. Behind the bar so it reads as a backdrop rather than as a value.
                // A tick at the top of the column plus a lifted backdrop. The backdrop alone was
                // invisible: the bar fills most of the cell, so the only part of it anybody could
                // have seen was the few pixels of headroom above a peak.
                bar.hoursAgo === focusHour ? "border-t border-ink bg-raised" : "border-t border-transparent"
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
            </div>
          ))}
        </div>

        {/*
          The excluded hours, dimmed in place. Not interactive: the slider under it is.
          Heavier than the magnitude track's veil, because these bars are saturated fills rather
          than a gradient, and at 78% they came through muddy rather than off.
        */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-deck/88"
          style={{ width: `${((HOURS - hours) / HOURS) * 100}%` }}
        />

        {/*
          One element carries both interactions, because it is already covering the bars: dragging
          sets the window, moving across it holds an hour. Reading hover from the individual bars
          would mean the slider swallowing every pointer event that was supposed to reach them.

          Whole hours only, so this fires once per bar crossed rather than once per pixel, and the
          globe re-syncs at the rate the strip has bars.
        */}
        <input
          id="window"
          type="range"
          min={0}
          max={HOURS - 1}
          step={1}
          value={HOURS - hours}
          onChange={(e) => onHoursChange(HOURS - Number(e.target.value))}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const at = Math.floor(((e.clientX - box.left) / box.width) * HOURS);
            const next = HOURS - 1 - Math.max(0, Math.min(HOURS - 1, at));
            if (next !== focusHour) onFocusHourChange(next);
          }}
          onPointerLeave={() => onFocusHourChange(null)}
          // A touch drag sets the window and should not leave an hour held behind it.
          onPointerUp={() => onFocusHourChange(null)}
          aria-valuetext={`Last ${hours} ${hours === 1 ? "hour" : "hours"}`}
          className="timeline-slider absolute inset-0 h-full w-full"
          aria-describedby="window-scale"
        />
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
        <span>24h ago</span>
        <span>now</span>
      </div>

      {/* Only once some hours are observed. A caveat about the blocks, at the moment the whole strip
          is blocks, explains a state the sentence above the rail has already named. */}
      {unobserved ? (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Blocks are hours the buffer was not open for, not quiet hours.
        </p>
      ) : null}
    </div>
  );
}
