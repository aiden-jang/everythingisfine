import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import type { Nearby } from "./nearby";
import { MIN_AFTER, observed, reference, staircase } from "./omori";

/* The pinned event inside its own sequence. See ARCHITECTURE.md. */

export interface SequenceProps {
  nearby: Nearby;
  magnitude: number;
  ramp: RampName;
}

const HEIGHT = 40;
/*
 * The decay plot, on its own line rather than over the ticks. The ticks already use height for magnitude,
 * and a cumulative count in the same box would be a second meaning for the same axis. Sharing the x axis and
 * nothing else is what makes the two comparable.
 */
const DECAY_HEIGHT = 28;
const rampAt = (m: number): number => (m - MAG_MIN) / (MAG_MAX - MAG_MIN);

/** Hours, at the precision of a sequence rather than of a clock. */
function span(ms: number): string {
  const hours = Math.abs(ms) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(Math.abs(ms) / 60_000))}m`;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

export function Sequence({ nearby, magnitude, ramp }: SequenceProps): JSX.Element | null {
  if (nearby.sequence.length === 0) return null;

  const first = Math.min(0, nearby.sequence[0]!.at);
  const last = Math.max(0, nearby.sequence[nearby.sequence.length - 1]!.at);
  const width = last - first || 1;
  // Inset, so a tick at either extreme sits fully inside the plot rather than half over the edge.
  const x = (at: number): number => 1.5 + ((at - first) / width) * 97;
  // The same square root the marker radius uses, so height here and size on the globe mean magnitude the
  // same way. Linear against the ramp position left a swarm of M2s and an M4.9 within seven pixels.
  const height = (m: number): number =>
    Math.max(4, Math.round((Math.sqrt(Math.max(0, m - MAG_MIN)) / Math.sqrt(MAG_MAX - MAG_MIN)) * HEIGHT));

  // Here rather than in `omori.ts`, because turning counts into a polyline is this component's business and
  // the law is not: that module knows nothing about pixels, which is what makes it testable without a DOM.
  const decay = ((): { steps: string; curve: string } | null => {
    const after = observed(nearby.sequence);
    if (after.length < MIN_AFTER) return null;
    const total = after.length;
    const spanMs = after[after.length - 1]!.at;
    const curve = reference(spanMs, total);
    if (curve.length === 0) return null;

    const y = (n: number): number => DECAY_HEIGHT - (n / total) * (DECAY_HEIGHT - 2) - 1;
    const path = (pts: readonly { at: number; n: number }[]): string =>
      pts.map((p) => `${x(p.at)},${y(p.n)}`).join(" ");
    return { steps: path(staircase(after)), curve: path(curve) };
  })();

  return (
    // Paints the magnitude ramp outside the canvas. See DESIGN.md 3.1.
    <div data-ramp className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-faint">Sequence</span>
        {/* A side with nothing on it is not printed, because the axis already says so: this read "3 before ·
            0 after" while the axis rendered "this event" on the right. The count itself earns its place -
            ticks can be counted at three and cannot at three hundred - but a zero is the one value the
            drawing states perfectly well. */}
        <span className="font-mono text-[10.5px] text-faint">
          {[
            nearby.before > 0 ? `${nearby.before} before` : null,
            nearby.after > 0 ? `${nearby.after} after` : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </span>
      </div>

      <div className="relative mt-2" style={{ height: `${HEIGHT}px` }}>
        {nearby.sequence.map((e, i) => (
          <span
            key={`${e.at}-${i}`}
            className="absolute bottom-0 w-[2px] -translate-x-1/2 rounded-[1px]"
            style={{
              left: `${x(e.at)}%`,
              height: `${height(e.magnitude)}px`,
              background: rampColorAt(ramp, rampAt(e.magnitude)),
              opacity: 0.75,
            }}
          />
        ))}
        {/* The pinned event, in chrome. It is where you are, not another reading. */}
        <span
          className="absolute bottom-0 w-[2px] -translate-x-1/2 bg-ink"
          style={{ left: `${x(0)}%`, height: `${HEIGHT}px` }}
        />
      </div>

      {/* Omori's law against what happened. Drawn only when there are enough arrivals afterwards to have a
          shape: below that the staircase is three steps and any curve fits it. See `omori.ts` for why it is
          a reference and never a fit. */}
      {decay ? (
        <div className="relative mt-2" style={{ height: `${DECAY_HEIGHT}px` }}>
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            preserveAspectRatio="none"
            viewBox={`0 0 100 ${DECAY_HEIGHT}`}
          >
            {/* The law, dashed, because it is the thing being claimed rather than the thing observed.
                Behind the staircase for the same reason. */}
            <polyline
              points={decay.curve}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              className="text-faint"
            />
            {/* What happened, as a staircase. Counts step; they do not slope between events. */}
            <polyline
              points={decay.steps}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              className="text-ink"
            />
          </svg>
        </div>
      ) : null}

      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-faint">
        <span>{first < 0 ? `${span(first)} before` : "this event"}</span>
        <span>{last > 0 ? `${span(last)} after` : "this event"}</span>
      </div>

      {/* Named, because two unexplained lines in a box is a decoration. Only the words: which line is which
          is carried by the dash, and a swatch legend for two strokes would be larger than the plot. */}
      {decay ? (
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          The solid line is how the aftershocks actually arrived. The dashed one is Omori's law, which says
          the rate falls as one over the time since, drawn to the same total.
        </p>
      ) : null}

      {nearby.largest !== null && nearby.largestAt !== null && nearby.largest > magnitude ? (
        // Stated, not interpreted. "Larger, and it already happened" is the fact; whether that makes this an
        // aftershock is the reader's call and depends on things no keyless feed carries.
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          The largest nearby was M {nearby.largest.toFixed(1)},{" "}
          {nearby.largestAt < 0
            ? `${span(nearby.largestAt)} before this one`
            : `${span(nearby.largestAt)} after it`}
          .
        </p>
      ) : null}
    </div>
  );
}
