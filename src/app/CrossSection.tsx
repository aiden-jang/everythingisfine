import { useState } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { SECTION_HALF_WIDTH_KM, type Section as SectionData, type SectionHinge } from "./section";
import { SLAB_FROM, SLAB_TO } from "../geo/slab";
import type { Store } from "../data/store";
import { depth, magnitude, place } from "./format";
import { useNarrow } from "./useNarrow";
import { useSectionFold } from "./useSectionFold";

/* The crust seen from the side: distance across, depth down, drawn at 1:1. Never stretch the depth axis
   quietly. The dip of the slab is the whole content, and stretching invents a steeper one. See ARCHITECTURE.md#srcappcrosssectiontsx. */

export interface CrossSectionProps {
  data: SectionData;
  hinge: SectionHinge | undefined;
  inset: boolean;
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

export function CrossSection({
  data,
  hinge,
  inset,
  ramp,
  store,
  selected,
  onSelect,
  onClose,
}: CrossSectionProps): JSX.Element {
  const { panelRef, plotRef } = useSectionFold(hinge);
  const [listOpen, setListOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredReading = hovered ? store.get(hovered)?.primary : undefined;
  const { lengthKm, points, deepestKm, withoutDepth, crossings, slab } = data;
  /*
   * What is on screen, which stopped being the same as this window's events once the slab arrived. A
   * corridor across Tonga said "nothing inside this corridor" while the deep record ran its full length.
   */
  const drawn = points.length + slab.length;
  /*
   * The floor is the deeper of the data and 70km. Without one, a section through shallow crustal events
   * gets an axis a few kilometres tall and every event lands on the surface line: a picture of a fault
   * where there is only a scatter.
   */
  const floorKm = Math.max(70, Math.ceil(deepestKm / 50) * 50);
  /*
   * The drawing is always 1000 units wide and its height is the true one, clamped. Sizing the box from the
   * aspect ratio made the panel's height a function of the line somebody dragged: a 200km section became
   * eight hundred pixels tall. Fixing the width puts the exaggeration in one number that can be printed.
   */
  const trueHeight = (floorKm / lengthKm) * 1000;
  /* The floor is taller where the panel is narrow, because these units are a fraction of its width. See ARCHITECTURE.md#srcappcrosssectiontsx. */
  const narrow = useNarrow();
  const height = Math.round(Math.max(narrow ? 256 : 96, Math.min(300, trueHeight)));
  const exaggeration = height / trueHeight;

  const x = (km: number): number => (km / lengthKm) * 1000;
  const y = (km: number): number => (km / floorKm) * height;
  // The same square root the marker radius uses on the globe, so size means magnitude identically in both
  // pictures rather than each view having its own idea of how big an M4 is.
  const r = (m: number): number =>
    1.6 + (Math.sqrt(Math.max(0, m - MAG_MIN)) / Math.sqrt(MAG_MAX - MAG_MIN)) * 9;

  return (
    <div
      ref={panelRef}
      data-section-panel
      className={`pointer-events-auto order-9 -mx-4 -mb-4 max-h-[40dvh] w-[calc(100%+2rem)] overflow-y-auto overscroll-contain bg-deck/70 px-4 pt-3 pb-4 backdrop-blur-2xl backdrop-saturate-0 ${
        inset ? "xl:pr-[calc(var(--panel-w)+1rem)]" : ""
      }`}
    >
      <div data-ramp className="pointer-events-auto w-full">
        <div data-section-ink className="mb-1.5 flex items-baseline gap-3">
          <span className="label">Cross-section</span>
          {/* The hovered mark takes the metadata line's place rather than getting a floating tooltip. A label
            following the cursor inside a 120px band covers the marks either side of the one it names. */}
          {hoveredReading ? (
            <span className="min-w-0 truncate font-mono text-[10.5px] text-dim">
              <span className="text-ink">{magnitude(hoveredReading)}</span> · {depth(hoveredReading)} ·{" "}
              {place(hoveredReading.place)}
            </span>
          ) : (
            /* The length is on the axis below, so it is not up here as well. This printed "1,438 km long"
             while the axis printed "1,438 km" at its right end. */
            <span className="font-mono text-[10.5px] text-faint">
              {SECTION_HALF_WIDTH_KM} km either side ·{" "}
              {exaggeration < 1.05 && exaggeration > 0.95
                ? "1:1"
                : `${exaggeration.toFixed(exaggeration < 10 ? 1 : 0)}\u00d7 vertical`}
            </span>
          )}
          <span className="ml-auto flex items-baseline gap-3">
            {withoutDepth > 0 ? (
              // Named rather than dropped. A section is a claim about depth, so events with no depth published
              // are the one omission a reader has to be told about.
              <span className="text-[11px] text-faint">{withoutDepth} without a published depth</span>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="min-h-8 cursor-pointer rounded-md border border-hairline px-2 text-xs text-dim hover:text-ink"
            >
              Close section
            </button>
          </span>
        </div>

        {points.length === 0 && slab.length > 0 ? (
          /*
           * Said out loud, because this picture can lie by looking busy: a corridor with no events this window
           * and a slab running its length draws a dense arc, and every other drawing here is about the window.
           */
          <p className="mb-1.5 max-w-[52ch] text-[11px] leading-relaxed text-dim">
            No matching earthquakes along this line. Showing historical deep earthquakes from {SLAB_FROM} to{" "}
            {SLAB_TO}.
          </p>
        ) : null}
        {drawn === 0 ? (
          <p className="max-w-[52ch] text-[11px] leading-relaxed text-dim">
            No matching earthquakes along this line. Try drawing across a plate boundary.
          </p>
        ) : (
          <div ref={plotRef} className="relative w-full">
            <svg
              viewBox={`0 0 1000 ${height}`}
              className="block h-auto w-full"
              /*
               * Out of the reading order, like the canvas. The event list is the accessible view of the same
               * events and shares this panel's selection, so a second keyboard path through a scatter plot
               * would be a worse version of a list that already exists.
               */
              aria-hidden="true"
            >
              {/* Depth gridlines, under everything. Only the surface at zero gets full weight: it is the
                datum, the rest are a scale. */}
              <line
                data-section-datum
                x1={0}
                x2={1000}
                y1={0}
                y2={0}
                stroke="currentColor"
                strokeWidth={1.2}
                className="text-coast"
                vectorEffect="non-scaling-stroke"
              />
              <g data-section-ink>
                {grid(floorKm)
                  .filter((d) => d > 0)
                  .map((d) => (
                    <line
                      key={d}
                      x1={0}
                      x2={1000}
                      y1={y(d)}
                      y2={y(d)}
                      stroke="currentColor"
                      strokeWidth={0.6}
                      className="text-hairline"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                {/* Where the line crosses a plate boundary. Full height and brighter than the distance grid,
                because it is the reason the picture has a shape. */}
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
                {/* The slab first, so this window's events sit on top of it. Drawn as geography, exactly as on
                the globe: one dim tone, one fixed radius, no ramp and no hit area. It is five years of deep
                seismicity, and the one thing it must not look like is the marks above it. */}
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
                {/* Deepest last, so a 600km event is not hidden behind the shallow swarm above it. By depth
                rather than by magnitude, because depth is what this picture is for. */}
                {[...points]
                  .sort((a, b) => a.depthKm - b.depthKm)
                  .map((p) => (
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
                       * Clickable, like every other view of an event. The hit area is the mark itself and marks
                       * overlap, so the deepest is on top for the same reason it is drawn last.
                       */
                      className="cursor-pointer"
                      onPointerEnter={() => setHovered(p.key)}
                      onPointerLeave={() => setHovered((h) => (h === p.key ? null : h))}
                      onClick={() => onSelect(p.key === selected ? null : p.key)}
                    />
                  ))}
                {/* The pinned and hovered marks, ringed. Achromatic: a coloured ring would be a hue meaning
                nothing beside hues that mean magnitude. */}
                {points
                  .filter((p) => p.key === selected || p.key === hovered)
                  .map((p) => (
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
              </g>
            </svg>

            {/* Labels in HTML rather than SVG, so they keep one size whatever the aspect ratio does to the
              drawing. Positioned in percentages of the same box. */}
            {grid(floorKm)
              .filter((d) => d > 0 && d < floorKm)
              .map((d) => (
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
          // In flow rather than absolutely positioned: the panel is flush with the bottom of the window, so
          // anything hanging under it hangs off the screen.
          <div data-section-ink className="mt-1 flex justify-between font-mono text-[9.5px] text-faint">
            <span>0 km</span>
            <span>
              {crossings.length > 0 ? (
                // Only when there are any. A permanent key for a mark that is not on screen is a line of
                // chrome explaining nothing.
                <span className="mr-3 text-plate">
                  {crossings.length === 1 ? "plate boundary" : "plate boundaries"}
                </span>
              ) : null}
              {Math.round(lengthKm).toLocaleString("en-GB")} km · {floorKm} km deep
            </span>
          </div>
        ) : null}
        {points.length > 0 && (
          <details className="mt-2" onToggle={(event) => setListOpen(event.currentTarget.open)}>
            <summary className="disclose text-xs text-dim">
              Earthquakes in this section ({points.length})
            </summary>
            {listOpen && (
              <ol className="mt-1 max-h-[min(9rem,28dvh)] overflow-y-auto overscroll-contain">
                {points.map((point) => {
                  const reading = store.get(point.key)?.primary;
                  return (
                    reading && (
                      <li key={point.key} className="[content-visibility:auto]">
                        <button
                          type="button"
                          className="min-h-8 w-full cursor-pointer rounded px-2 text-left text-xs text-dim hover:bg-raised hover:text-ink"
                          aria-current={point.key === selected || undefined}
                          onClick={() => onSelect(point.key === selected ? null : point.key)}
                        >
                          {place(reading.place)} · {magnitude(reading)} · {depth(reading)}
                        </button>
                      </li>
                    )
                  );
                })}
              </ol>
            )}
          </details>
        )}
      </div>
    </div>
  );
}
