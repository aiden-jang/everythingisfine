import { BINS, departure, dialPoint, worstNote, type Diurnal as Counts } from "./diurnal";

/* The window folded onto a 24-hour dial. Behind a disclosure because its payload is a null result:
   interesting once, and not something anybody monitors. See ARCHITECTURE.md. */

export interface DialProps {
  counts: Counts;
}

/** The radius the ring sits at, and how far three sigmas of departure reach from it. */
const R0 = 26;
const SPAN = 13;
/** Where the expected scatter is drawn, in sigmas. */
const BAND = 2;
const SIZE = (R0 + SPAN + 4) * 2;

export function Dial({ counts }: DialProps): JSX.Element | null {
  const { counts: bins, total, mean, sigma } = counts;
  const worst = worstNote(counts);
  // Nothing to fold. One event per bin is not a distribution and the band would be wider than the dial.
  if (total < BINS * 2) return null;

  const r = (z: number): number => R0 + (z / 3) * SPAN;
  const ring = (radius: number): string => Array.from({ length: BINS }, (_, h) => {
    const p = dialPoint(h, radius);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");

  const shape = Array.from({ length: BINS }, (_, h) => {
    const p = dialPoint(h, r(departure(bins[h]!, mean, sigma)));
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");

  return (
    <div className="mt-2">
      <svg
        viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
        className="mx-auto block"
        style={{ width: `${SIZE}px`, height: `${SIZE}px` }}
        role="img"
        aria-label={
          worst === null
            ? "Earthquakes by hour of local solar time."
            : `Earthquakes by hour of local solar time. The furthest hour departs an even spread by `
              + `${worst} units of counting noise, against an expected scatter of ${BAND}.`
        }
      >
        {/*
          The band, as a filled annulus between plus and minus two sigma. Drawn as two rings with the
          outer wound one way and the inner the other, so the even-odd rule leaves the middle empty.
        */}
        <path
          d={`M ${ring(r(BAND)).split(" ").join(" L ")} Z M ${
            ring(r(-BAND)).split(" ").reverse().join(" L ")} Z`}
          fill="currentColor"
          fillRule="evenodd"
          className="text-raised"
        />
        {/* An even spread, which is what the bars are being compared against. */}
        <polygon points={ring(R0)} fill="none" stroke="currentColor" strokeWidth={0.5}
          strokeDasharray="2 2" vectorEffect="non-scaling-stroke" className="text-faint" />
        {/* The hours themselves, closed, so a flat day reads as a ring and not as a zigzag. */}
        <polygon points={shape} fill="none" stroke="currentColor" strokeWidth={1.25}
          vectorEffect="non-scaling-stroke" className="text-ink" />
        {/* Midnight, so the dial has an origin without needing four numbers around it. */}
        <line
          x1={0} y1={-(R0 + SPAN + 1)} x2={0} y2={-(R0 + SPAN + 3)}
          stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke"
          className="text-dim"
        />
      </svg>

      {/*
        What the picture is, and no conclusion drawn from it. The band does the arguing: at a day it is
        wide and says the test is weak, and at a month it is narrow and the ring sits inside it.
      */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        Hours of local solar time, midnight at the top. Distance from the dashed ring is how far that
        hour departs from an even spread, in units of counting noise; the shaded band is two of them.
        {worst === null ? null : (
          <>
            {" "}The furthest hour reaches{" "}
            <span className="text-dim tabular-nums">{worst}</span>.
          </>
        )}
        {" "}<span className="tabular-nums">{total.toLocaleString("en-GB")}</span> events.
      </p>
    </div>
  );
}
