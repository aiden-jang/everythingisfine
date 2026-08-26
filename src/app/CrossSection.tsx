import { useEffect, useState } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { SECTION_HALF_WIDTH_KM, type Section as SectionData } from "./section";
import type { Store } from "../data/store";
import { depth, magnitude, place } from "./format";

/*
 * The crust, side on.
 *
 * Distance across, depth down, drawn at 1:1. Vertical exaggeration is the default in textbook
 * sections and it is the one thing this picture must not do: the dip of a slab is the whole content,
 * and stretching the depth axis invents a steeper one. A section across Japan at 1:1 is a wide, thin
 * strip with a line of dots running down to the left at about forty-five degrees, and that angle is
 * a real measurement somebody could check.
 *
 * 1:1 when it fits, and exaggerated with the factor printed when it does not. A 3,700km line against
 * 150km of depth is a band four pixels tall at true scale: correct, and a picture of nothing. Every
 * geological section in print handles this the same way, by stretching the depth axis and saying by
 * how much, because a stated exaggeration is a fact a reader can undo in their head and an unstated
 * one is a lie about the dip.
 *
 * The depth axis stops at the deepest event rather than at a constant 700km for the same reason: a
 * section with nothing below 40km should not spend nine tenths of its height on empty mantle.
 */

export interface CrossSectionProps {
  data: SectionData;
  ramp: RampName;
  store: Store;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onClose: () => void;
}

const rampAt = (m: number): number => (m - MAG_MIN) / (MAG_MAX - MAG_MIN);

/** Depth gridlines a seismologist would expect, thinned to whatever the section actually reaches. */
function grid(deepestKm: number): number[] {
  const all = [0, 35, 70, 150, 300, 500, 700];
  return all.filter((d) => d <= deepestKm * 1.05);
}

/** Round numbers for the distance axis, at a spacing that fits the length. */
function ticks(lengthKm: number): number[] {
  const step = [100, 200, 500, 1000, 2000, 5000].find((s) => lengthKm / s <= 6) ?? 10_000;
  const out: number[] = [];
  for (let d = step; d < lengthKm; d += step) out.push(d);
  return out;
}

/**
 * True where this panel is the full width of a phone, which is where the drawing collapses.
 *
 * The same breakpoint the layout uses to stop floating things over the canvas. Read from `matchMedia`
 * rather than from a width prop, because nothing above this component knows or should know how tall its
 * axis wants to be.
 */
function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function CrossSection({
  data, ramp, store, selected, onSelect, onClose,
}: CrossSectionProps): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredReading = hovered ? store.get(hovered)?.primary : undefined;
  const { lengthKm, points, deepestKm, withoutDepth, crossings, slab } = data;
  /*
   * What is on screen, which stopped being the same thing as this window's events.
   *
   * The empty state used to ask whether `points` was empty, and that was the same question until the
   * slab arrived. Caught with a corridor across Tonga: the deep record ran the full length of it and the
   * panel said "nothing inside this corridor", because the only thing it knew how to count was the part
   * that happened this week. The gate is about whether there is a picture, not about whose data it is.
   */
  const drawn = points.length + slab.length;
  /*
   * The floor is the deeper of the data and 70km.
   *
   * Without a floor a section through nothing but shallow crustal events gets a depth axis a few
   * kilometres tall, and every one of them lands on the surface line: a picture of a fault where
   * there is only a scatter. 70km is the base of the crust either way, so the axis always says
   * something true about how deep this is.
   */
  const floorKm = Math.max(70, Math.ceil(deepestKm / 50) * 50);
  /*
   * The drawing is always 1000 units wide, and its height is the true one clamped to a readable band.
   *
   * Sizing the box from the aspect ratio instead was the first version, and it made the panel's height
   * a function of the line somebody dragged: a 200km section became eight hundred pixels tall and a
   * 4,000km one became four. Fixing the width and clamping the height puts the exaggeration in one
   * number that can be printed, which is the part a reader needs.
   */
  const trueHeight = (floorKm / lengthKm) * 1000;
  /*
   * The floor is taller where the panel is narrow, because these units are a fraction of its width.
   *
   * The drawing is 1000 units wide and scales to the box, so its rendered height is `width * height /
   * 1000`. At 96 units that is a comfortable 110px across a desktop panel and **37px on a 390px phone** -
   * short enough that the depth labels, 9.5px tall, land about nine pixels apart and collide, with the
   * axis footer running through the marks underneath them.
   *
   * Raising the floor rather than hiding the labels, because the exaggeration this costs is already
   * printed in the header: the panel says "1:1" or "x4 vertical" and stays true either way. Hiding the
   * labels would have bought the same space by removing the thing that makes the axis readable.
   */
  const narrow = useNarrow();
  const height = Math.round(Math.max(narrow ? 256 : 96, Math.min(300, trueHeight)));
  const exaggeration = height / trueHeight;

  const x = (km: number): number => (km / lengthKm) * 1000;
  const y = (km: number): number => (km / floorKm) * height;
  // The same square root the marker radius uses on the globe, so size means magnitude identically in
  // both pictures rather than each view having its own idea of how big an M4 is.
  const r = (m: number): number =>
    1.6 + (Math.sqrt(Math.max(0, m - MAG_MIN)) / Math.sqrt(MAG_MAX - MAG_MIN)) * 9;

  return (
    // Paints the magnitude ramp outside the canvas. See DESIGN.md 3.1.
    <div data-ramp className="pointer-events-auto w-full">
      <div className="mb-1.5 flex items-baseline gap-3">
        <span className="label">Cross-section</span>
        {/*
          The hovered mark takes the metadata line's place rather than getting a floating tooltip.
          A label following the cursor inside a 120px band covers the marks either side of the one it
          is naming, and the geometry of the section is not what somebody is reading while pointing at
          a dot.
        */}
        {hoveredReading ? (
          <span className="min-w-0 truncate font-mono text-[10.5px] text-dim">
            <span className="text-ink">{magnitude(hoveredReading)}</span> ·{" "}
            {depth(hoveredReading)} · {place(hoveredReading.place)}
          </span>
        ) : (
          /*
            The length is on the axis below, so it is not up here as well.

            This printed "1,438 km long" while the axis under the plot printed "1,438 km" at its right
            end: the same figure twice in one panel, which is the exact fault the activity strip already
            fixed and wrote down - "the axis, and only the axis". What is left is the pair of facts
            nothing else states.
          */
          <span className="font-mono text-[10.5px] text-faint">
            {SECTION_HALF_WIDTH_KM} km either
            side ·{" "}
            {exaggeration < 1.05 && exaggeration > 0.95
              ? "1:1"
              : `${exaggeration.toFixed(exaggeration < 10 ? 1 : 0)}\u00d7 vertical`}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-3">
          {withoutDepth > 0 ? (
            // Named rather than dropped. A section is a claim about depth, so events with no depth
            // published are the one omission a reader has to be told about.
            <span className="text-[11px] text-faint">
              {withoutDepth} without a published depth
            </span>
          ) : null}
          {/*
            The third of these, and the one the earlier pass missed.

            The detail panel and the mark card both had a key name wearing `.label`, which uppercases and
            tracks it; both were moved to the lowercase mono the hint row uses, and this one was not
            looked for. Keys are written the way they are printed on a keyboard, and the touch target is
            top-aligned for the same reason as the others: a button centres its content, and on a coarse
            pointer that content sits in a 44px box.
          */}
          <button
            type="button"
            onClick={onClose}
            className="flex cursor-pointer items-start font-mono text-[10.5px] text-faint transition-colors hover:text-ink"
          >
            esc
          </button>
        </span>
      </div>

      {points.length === 0 && slab.length > 0 ? (
        /*
         * Said out loud, because this picture is the one that can lie by looking busy.
         *
         * A corridor with no events this window and a slab running the length of it draws a dense arc,
         * and every other drawing in this app is about the window on screen. Without this line a reader
         * has no way to tell that none of it is from the last day.
         */
        <p className="mb-1.5 max-w-[52ch] text-[11px] leading-relaxed text-dim">
          Nothing from this window is inside the corridor. Everything drawn is the five-year deep record.
        </p>
      ) : null}
      {drawn === 0 ? (
        <p className="max-w-[52ch] text-[11px] leading-relaxed text-dim">
          Nothing inside this corridor in the current window. Margins are where the depth is: try a
          line across a plate boundary, at right angles to it.
        </p>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 1000 ${height}`}
            className="block h-auto w-full"
            /*
             * Out of the reading order, like the canvas. The event list is the accessible view of the
             * same events, with one tab stop and arrow keys, and it shares this panel's selection: a
             * mark ringed here is the row highlighted there. A second keyboard path through a scatter
             * plot would be a worse version of a list that already exists.
             */
            aria-hidden="true"
          >
            {/* Depth gridlines, under everything. The surface at zero is the only one given full
                weight: it is the datum, the rest are a scale. */}
            {grid(floorKm).map((d) => (
              <line
                key={d}
                x1={0}
                x2={1000}
                y1={y(d)}
                y2={y(d)}
                stroke="currentColor"
                strokeWidth={d === 0 ? 1.2 : 0.6}
                className={d === 0 ? "text-coast" : "text-hairline"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/*
              Where the line crosses a plate boundary.
              Drawn full height and brighter than the distance grid, because it is the reason the
              picture has a shape: earthquakes begin at the boundary and descend away from it.
            */}
            {crossings.map((d, i) => (
              <line
                key={`x${i}`}
                x1={x(d)}
                x2={x(d)}
                y1={0}
                y2={height}
                stroke="currentColor"
                strokeWidth={1}
                className="text-plate"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {ticks(lengthKm).map((d) => (
              <line
                key={d}
                x1={x(d)}
                x2={x(d)}
                y1={0}
                y2={height}
                stroke="currentColor"
                strokeWidth={0.6}
                className="text-hairline"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/*
              The slab first, so this window's own events sit on top of it.

              Drawn as geography, exactly as it is on the globe: one dim neutral tone, one small fixed
              radius, no ramp and no hit area. It is five years of deep seismicity rather than anything in
              this window, and the one thing it must not look like is the marks above it. Not clickable
              either - there is no event behind these to open, only a row in a committed table.
            */}
            {data.slab.map((p) => (
              <circle
                key={p.key}
                cx={x(p.alongKm)}
                cy={y(p.depthKm)}
                r={1.6}
                fill="currentColor"
                className="text-plate"
                opacity={0.25 + 0.35 * (1 - Math.abs(p.offsetKm) / data.halfWidthKm)}
                pointerEvents="none"
              />
            ))}
            {/*
              Deepest last, so a 600km event is not hidden behind the shallow swarm above it. By depth
              rather than by magnitude, because depth is what this picture is for.
            */}
            {[...points].sort((a, b) => a.depthKm - b.depthKm).map((p) => (
              <circle
                key={p.key}
                cx={x(p.alongKm)}
                cy={y(p.depthKm)}
                r={r(p.magnitude)}
                fill={rampColorAt(ramp, rampAt(p.magnitude))}
                /* Fades with how far off the line it is, so the corridor reads as a corridor rather
                   than as a slice with hard edges. */
                opacity={0.35 + 0.55 * (1 - Math.abs(p.offsetKm) / data.halfWidthKm)}
                /*
                 * Clickable, like every other view of an event here.
                 *
                 * The section was read-only for a version: it would show a magnitude 5 at 400km and
                 * offer no way to find out what it was, while the same event was one click away in
                 * the list. The hit area is the mark itself and marks overlap, so the deepest is on
                 * top for the same reason it is drawn last.
                 */
                className="cursor-pointer"
                onPointerEnter={() => setHovered(p.key)}
                onPointerLeave={() => setHovered((h) => (h === p.key ? null : h))}
                onClick={() => onSelect(p.key === selected ? null : p.key)}
              />
            ))}
            {/* The pinned and hovered marks, ringed. Achromatic, per DESIGN.md 3: a coloured ring
                would be a hue meaning nothing beside hues that mean magnitude. */}
            {points.filter((p) => p.key === selected || p.key === hovered).map((p) => (
              <circle
                key={`r${p.key}`}
                cx={x(p.alongKm)}
                cy={y(p.depthKm)}
                r={r(p.magnitude) + 3}
                fill="none"
                stroke="currentColor"
                strokeWidth={p.key === selected ? 1.6 : 1}
                className={p.key === selected ? "text-ink" : "text-dim"}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          </svg>

          {/* Labels in HTML rather than in the SVG, so they keep one size whatever the section's
              aspect ratio does to the drawing. Positioned in percentages of the same box. */}
          {grid(floorKm).filter((d) => d > 0 && d < floorKm).map((d) => (
            <span
              key={d}
              className="pointer-events-none absolute left-1 -translate-y-1/2 font-mono text-[9.5px] text-faint"
              style={{ top: `${(y(d) / height) * 100}%` }}
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {drawn > 0 ? (
        // In flow rather than absolutely positioned below the drawing: the panel is flush with the
        // bottom of the window, so anything hanging under it hangs off the screen.
        <div className="mt-1 flex justify-between font-mono text-[9.5px] text-faint">
          <span>0 km</span>
          <span>
            {crossings.length > 0 ? (
              // Only when there are any. A permanent key for a mark that is not on screen is a line
              // of chrome explaining nothing.
              <span className="mr-3 text-plate">
                {crossings.length === 1 ? "plate boundary" : "plate boundaries"}
              </span>
            ) : null}
            {Math.round(lengthKm).toLocaleString("en-GB")} km · {floorKm} km deep
          </span>
        </div>
      ) : null}
    </div>
  );
}
