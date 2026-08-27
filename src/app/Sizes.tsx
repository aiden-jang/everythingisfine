import type { JSX } from "react";
import { fitLine, type Sizes } from "./gutenberg";

/*
 * The size distribution, drawn: log of how many, against how big.
 *
 * The app already says magnitude is logarithmic and that two points of it is a thousand times the energy.
 * This is that sentence with today's own events on it, and the point is that they land on a straight
 * line - ten times as many, each magnitude down, everywhere on Earth, since 1944.
 *
 * **Log up the side and nothing else.** No gridlines, no axis box, no second colour. The two things a
 * reader has to see are that the points are straight and where they stop being straight, and everything
 * else drawn here would be furniture in front of that.
 *
 * **The bend at the left is about us, not the Earth.** Below the completeness magnitude the counts fall
 * short of the line because the network stopped hearing the small ones. The chart marks where that turn
 * is and the sentence underneath says whose fault it is, because a reader who took the bend for physics
 * would have learned something false from an app that exists to avoid exactly that.
 */

const W = 260;
const H = 96;

export function SizeChart({ sizes }: { sizes: Sizes }): JSX.Element | null {
  const { points, complete, b, largest } = sizes;
  if (points.length < 4) return null;

  const loMag = points[0]!.magnitude;
  const hiMag = Math.max(largest, loMag + 1);
  const hiLog = Math.log10(points[0]!.atOrAbove);
  const x = (m: number): number => ((m - loMag) / (hiMag - loMag)) * W;
  // Zero is one event, which is the bottom of the useful range: log10(1) is 0.
  const y = (logN: number): number => H - (logN / Math.max(hiLog, 0.5)) * H;

  const line = fitLine(sizes);

  return (
    <div className="mt-2">
      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={
          b === null
            ? "How many earthquakes there were at each size, on a logarithmic scale."
            : `How many earthquakes at each size. Ten to the power ${b.toFixed(2)} times as many `
              + `for each magnitude smaller, complete above magnitude ${complete.toFixed(1)}.`
        }
      >
        {/*
          The straight line the law predicts, drawn under the points so they sit on it rather than
          behind it. Only from completeness rightward: the stretch to its left is where the catalogue
          is missing events, and a line drawn through that would be predicting the network's deafness.
        */}
        {line ? (
          <line
            x1={x(line.from[0])}
            y1={y(line.from[1])}
            x2={x(line.to[0])}
            y2={y(line.to[1])}
            stroke="currentColor"
            className="text-plate"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Where the catalogue stops being complete: a tick, which is what this app marks things with. */}
        {b !== null ? (
          <line
            x1={x(complete)}
            y1={H}
            x2={x(complete)}
            y2={H - 7}
            stroke="currentColor"
            className="text-faint"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {points.map((p) => (
          <circle
            key={p.magnitude}
            cx={x(p.magnitude)}
            cy={y(Math.log10(p.atOrAbove))}
            r={1.5}
            fill="currentColor"
            className={p.magnitude + 0.001 < complete ? "text-faint" : "text-dim"}
          />
        ))}

        <text x={0} y={H + 11} className="fill-current text-faint" style={{ fontSize: 9 }}>
          M {loMag.toFixed(1)}
        </text>
        <text x={W} y={H + 11} textAnchor="end" className="fill-current text-faint" style={{ fontSize: 9 }}>
          M {hiMag.toFixed(1)}
        </text>
      </svg>

      {/*
        Two sentences, and the second one is the whole reason the first is trustworthy.

        The slope is the fact; where the data stops supporting it is the caveat, and this app puts the
        caveat next to the number everywhere else it quotes one.
      */}
      {b === null ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          Too few to fit a slope. The shape needs a few hundred events before it means anything.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          About <span className="text-dim tabular-nums">{Math.round(10 ** b)}</span> times as many, each
          magnitude smaller. Straight since 1944 and on every catalogue anybody has drawn.
          {" "}
          <span className="text-dim">The bend below M{complete.toFixed(1)}</span> is not the Earth: it is
          where these two agencies stop hearing everything.
        </p>
      )}
    </div>
  );
}
