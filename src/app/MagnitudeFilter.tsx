import { LayerToggle } from "./LayerToggle";
import { DepthKey } from "./DepthKey";
import type { ReactElement, ReactNode } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { PLAYBACK } from "../geo/waves";
import { SLAB_FROM, SLAB_MIN_DEPTH_KM, SLAB_MIN_MAGNITUDE, SLAB_TO } from "../geo/slab";
import {
  auroraNote,
  cycloneNote,
  depthNote,
  floodNote,
  motionNote,
  soundNote,
  splitNote,
  volcanoNote,
  wildfireNote,
} from "./format";
import { category } from "../sources/cyclones";
import { flame, spiral, volcano, waves } from "../globe/shapes";

/* One row of the key: a glyph, the line that names it, and the reasoning one press away. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */

function KeyRow({ glyph, note }: { glyph?: ReactNode; note: string | null }): ReactElement | null {
  // Takes the null the note functions already return for an empty layer, so no caller has to prove
  // non-null twice next to the count it is already gated on.
  if (note === null) return null;
  const { head, rest } = splitNote(note);
  const line = "flex items-start gap-2.5 text-[11px] leading-relaxed text-faint";
  // A row with no glyph belongs to the row above it, so it lines up under that row's text rather than
  // under its swatch.
  const indent = glyph === undefined ? "pl-[23px]" : "";
  if (rest === null) {
    return (
      <div className={`mt-2 ${line} ${indent}`}>
        {glyph}
        <span>{head}</span>
      </div>
    );
  }
  return (
    <details className="mt-2">
      <summary className={`${line} ${indent} cursor-pointer list-none hover:text-dim`}>
        {glyph}
        <span>{head}</span>
      </summary>
      {/* Indented past the glyph, so the reasoning reads as belonging to the row it opened from. */}
      <p className="mt-1 pl-[23px] text-[11px] leading-relaxed text-faint">{rest}</p>
    </details>
  );
}

/* The legend and the magnitude filter, which were two blocks and are one control. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */

export interface MagnitudeFilterProps {
  ramp: RampName;
  value: number;
  onChange: (value: number) => void;
  /** Tonight's aurora, for the one line that explains it. Null when there is none to explain. */
  aurora: { peak: number; forecastAt: number } | null;
  /** The storms running now, for the same reason: no layer without the thing that explains it. */
  cyclones: readonly { name: string; peakKmh: number | null }[];
  /** How many volcanoes are drawn. */
  volcanoes: number;
  /** Which layers the window emptied, as a sentence, or null when it emptied none. */
  outsideWindow?: string | null;
  /** When the newest of their eruption episodes ended, which the line has to admit is not now. */
  volcanoesSince: number | null;
  /** The fires burning, already summarised, because the caveat needs the leader and the median. */
  fires: { count: number; km2: number; medianDays: number | null; leader: string | null };
  /** The clock the notes date themselves against: the archived day's end, or this minute. */
  now: number;
  /** Where the feed stops, which is the difference between this count and a census. */
  fireCap: number;
  floods: number;
  floodCountries: number;
  /** The arrows' own numbers, or null. Passed in rather than read here, so the legend never pulls the
   * table into the eager bundle. */
  motion: { arrows: number; fastest: number; converging: number } | null;
  /** The announce threshold the sound follows, or null when sound is off. */
  sound: number | null;
  /** How many events are in each depth band, so the row counts rather than promises. */
  depth: { shallow: number; intermediate: number; deep: number; unknown: number; total: number };
  motionOn: boolean;
  onMotion: (on: boolean) => void;
  /** Whether earthquakes are drawn at their own depth. Null hides the control, on the flat map. */
  sinkOn: boolean | null;
  onSink: (on: boolean) => void;
  /** Whether there is a sky at all, which the flat map has not. Gates the two rows that describe it. */
  sky?: boolean;
  /** The city the reader's timezone resolved to, or null. Names the ticks on the globe. */
  herePlace?: string | null;
  /** Set only while one of the two shadows is falling, which is a handful of days a year. */
  eclipse?: { kind: "total" | "annular" | "lunar" } | null;
  /** Whether the constellation lines are drawn. Null hides the control, on the flat map. */
  figuresOn?: boolean | null;
  onFigures?: (on: boolean) => void;
  /** Whether five years of deep seismicity are drawn. Null hides the control, on the flat map. */
  slabOn: boolean | null;
  onSlab: (on: boolean) => void;
  /** How many points arrived, so the row counts rather than promises. 0 while it is still loading. */
  slabCount: number;
  /** Any further controls, rendered above the key rather than below it. A slot rather than more props:
   * this component's job is to keep the controls together and above the prose. */
  children?: JSX.Element;
  /** Whether the key below the scale is open. Held outside so it survives a reload. */
  keyOpen: boolean;
  /** Which half to draw. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */
  part?: "controls" | "key";
  onKeyOpen: (open: boolean) => void;
  /** True on an archived day, which changes the tense of every layer sentence. */
  archived?: boolean;
}

const TICKS = [MAG_MIN, 3, 5, MAG_MAX];

const SPIRAL_PATH = path(spiral(0, 0, 9));
const VOLCANO_PATH = path(volcano(0, -3, 6));
const FLAME_PATH = path(flame(0, -8, 5));
const WAVE_PATHS = waves(0, -4, 4).map(path);

/**
 * The legend's glyphs, from the same generators the globe draws, so the two cannot drift apart. Latitude
 * is negated because SVG counts y downward and the globe counts it up - without that the volcano points
 * at the ground, which is a different symbol.
 */
function path(points: readonly { lon: number; lat: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.lon.toFixed(2)} ${(-p.lat).toFixed(2)}`).join(" ");
}

export function MagnitudeFilter({
  ramp,
  value,
  onChange,
  aurora,
  cyclones,
  volcanoes,
  volcanoesSince,
  now,
  outsideWindow = null,
  fires,
  fireCap,
  floods,
  floodCountries,
  keyOpen,
  onKeyOpen,
  archived = false,
  motion,
  motionOn,
  onMotion,
  sinkOn,
  onSink,
  slabOn,
  onSlab,
  slabCount,
  figuresOn,
  onFigures,
  sky = false,
  eclipse = null,
  herePlace = null,
  depth,
  sound,
  children,
  part = "controls",
}: MagnitudeFilterProps): JSX.Element {
  const stops = Array.from({ length: 32 }, (_, i) => rampColorAt(ramp, i / 31));
  // Flat maps have neither an interior nor a sky; omit layers they cannot show.
  const switches = [
    sinkOn === null ? null : <LayerToggle key="depth" label="depth" on={sinkOn} onChange={onSink} />,
    <LayerToggle key="motion" label="Plate movement" on={motionOn} onChange={onMotion} />,
    slabOn === null ? null : (
      <LayerToggle key="slab" label="Deep earthquakes" on={slabOn} onChange={onSlab} />
    ),
    figuresOn === null || figuresOn === undefined || !onFigures ? null : (
      <LayerToggle key="figures" label="Constellations" on={figuresOn} onChange={onFigures} />
    ),
  ].filter((v) => v !== null);
  // Where the threshold sits along the scale, as a percentage of the track.
  const cut = Math.max(0, Math.min(100, ((value - MAG_MIN) / (MAG_MAX - MAG_MIN)) * 100));

  if (part === "key") {
    return (
      <div data-ramp>
        {/* Everything below the scale is explanation and folds away. Controls above, commentary below. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */}
        <details open={keyOpen}>
          <summary
            className="disclose text-[11px] text-faint hover:text-dim"
            onClick={(e) => {
              e.preventDefault();
              onKeyOpen(!keyOpen);
            }}
          >
            What the marks mean
          </summary>

          {/* Size carries the same value, so a colourblind viewer and a small screen both still read it. */}
          <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-faint">
            <span className="flex items-baseline gap-1.5">
              {[2, 4, 6].map((m) => (
                <span
                  key={m}
                  className="inline-block rounded-full"
                  style={{
                    width: `${2 * (1.7 + 2.9 * Math.sqrt(m - 1))}px`,
                    height: `${2 * (1.7 + 2.9 * Math.sqrt(m - 1))}px`,
                    background: rampColorAt(ramp, (m - MAG_MIN) / (MAG_MAX - MAG_MIN)),
                  }}
                />
              ))}
            </span>
            <span>Larger marks = higher magnitude</span>
          </div>

          <DepthKey ramp={ramp} />

          {/* The counts stay, the reasoning folds. "66 above 70 km, 54 between 70 and 300" is the part anybody
          reads, and the slab explanation behind it is two more lines. */}
          <KeyRow note={depthNote(depth)} />

          {sinkOn ? (
            <KeyRow note="Deep events sit inside the globe. Orbit to see their distance below the surface." />
          ) : null}

          {/* An unexplained line on a data visualisation is a question mark, and somebody could read these as
          a second data layer rather than as the geography the events follow.

          The motion toggle hangs off this row because it is a second reading of these exact lines, not
          another layer. Off by default: 231 arrows is a mark in every margin on the planet. */}
          <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
            <span className="inline-block h-px w-[38px] shrink-0 bg-plate opacity-90" />
            <span>plate boundaries</span>
          </div>

          {motion ? (
            <details className="mt-2">
              <summary className="disclose text-[11px] text-faint">Plate motion</summary>
              <div className="mt-2 flex items-start gap-2.5 text-[11px] leading-relaxed text-faint">
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  <path
                    d="M -7 6 L 5 -6 M 5 -6 L -1 -6 M 5 -6 L 5 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className="text-dim"
                  />
                </svg>
                <span>{motionNote(motion)}</span>
              </div>
            </details>
          ) : null}

          {/* Its own row, not hung off the boundaries: this is a second population of events - older,
          differently thresholded, not from today - which is exactly what a viewer must not mistake for the
          marks beside it. So the row says how many, how deep, how big, and over what years. */}
          {slabOn ? (
            <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
              <span
                className="inline-block size-[7px] shrink-0 rounded-full"
                style={{ background: "var(--color-plate)" }}
              />
              {/* Dated, not relative: the table stops at 2025-08-01 and does not move, so "over five years"
              is wrong by however long since the generator ran, and silently gets wronger. */}
              <span>
                the deep ones, {SLAB_FROM} to {SLAB_TO}
              </span>
            </div>
          ) : null}

          {slabOn && slabCount > 0 ? (
            <KeyRow
              note={
                `${slabCount.toLocaleString("en")} events below ${SLAB_MIN_DEPTH_KM} km, ` +
                `M${SLAB_MIN_MAGNITUDE} and up. Nothing that deep happens ` +
                `outside a subducting plate, so this is where the plates went. Not today's earthquakes, ` +
                `which is why they carry no colour.`
              }
            />
          ) : null}

          {/* The rings were the one mark nothing named. A ring appears when an event arrives, expands for
          fifteen seconds and is gone, so a first-time viewer gets one look at it. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */}
          {/* A spiral for a swatch, because the mark is a spiral. Light gets colour and marks get shapes, so
          this one is shape all the way down to its legend entry. */}
          {cyclones.length > 0 ? (
            <KeyRow
              note={cycloneNote(cyclones, category, archived)}
              glyph={
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  <path
                    d={SPIRAL_PATH}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className="text-dim"
                  />
                </svg>
              }
            />
          ) : null}

          {/* A triangle, which cannot be read as a magnitude dot. Under the storms because it is the one layer
          here that is not live, and the line beside it says so. */}
          {volcanoes > 0 ? (
            <KeyRow
              note={volcanoNote(volcanoes, volcanoesSince, now, archived)}
              glyph={
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  <path
                    d={VOLCANO_PATH}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className="text-dim"
                  />
                </svg>
              }
            />
          ) : null}

          {/* A flame and the wavy lines water gets, both achromatic. The sentences carry the honesty each feed
          needs - the fire count is a floor, the flood severity does not exist - because a glyph cannot
          caveat itself. */}
          {fires.count > 0 ? (
            <KeyRow
              note={wildfireNote(fires, fireCap, archived)}
              glyph={
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  <path
                    d={FLAME_PATH}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className="text-dim"
                  />
                </svg>
              }
            />
          ) : null}

          {floods > 0 ? (
            <KeyRow
              note={floodNote(floods, floodCountries, archived)}
              glyph={
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  {WAVE_PATHS.map((d) => (
                    <path
                      key={d}
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.4}
                      className="text-dim"
                    />
                  ))}
                </svg>
              }
            />
          ) : null}

          {/* Last of the layer rows, and the only one that appears because a layer is absent. Without it, a
          24-hour window silently deletes all four and the globe just looks empty. */}
          <KeyRow note={outsideWindow} />

          {/* The sound leads with what it is not. A tone presented as what an earthquake sounds like would be
          the one outright falsehood here: real ground motion is below hearing. */}
          {sound !== null ? (
            <KeyRow
              note={soundNote(sound)}
              glyph={
                <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
                  <path
                    d="M -8 0 L -3 0 L 2 -7 L 2 7 L -3 0 M 5 -4 Q 8 0 5 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="text-dim"
                  />
                </svg>
              }
            />
          ) : null}

          {/* Below the marks rather than among them, because it is light and they are data. The swatch is a
          wash instead of a glyph for the same reason. */}
          {aurora ? (
            <KeyRow
              note={auroraNote(aurora.peak, aurora.forecastAt, Date.now())}
              glyph={
                <span
                  className="mt-[3px] inline-block h-[9px] w-[13px] shrink-0 rounded-[2px]"
                  style={{ background: "linear-gradient(180deg, #7fc9a6 0%, rgba(127,201,166,0) 100%)" }}
                />
              }
            />
          ) : null}

          {/* Required, not optional: a dark patch appearing on the planet with nothing naming it is the exact
          case this panel's rule exists for. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */}
          {eclipse ? (
            <div className="mt-2 flex items-start gap-2.5 text-[11px] leading-relaxed text-faint">
              <span
                className="mt-[4px] inline-block size-[7px] shrink-0 rounded-full"
                style={{
                  background: eclipse.kind === "lunar" ? "var(--color-eclipsed)" : "var(--color-void)",
                }}
              />
              <span>
                {eclipse.kind === "total"
                  ? "the dark spot is the moon's shadow, placed to a few hundred km"
                  : eclipse.kind === "annular"
                    ? "the moon's shadow, too far out to cover the sun: a ring, not a blackout"
                    : "the moon is red because it is in the Earth's shadow, lit through our sunsets"}
              </span>
            </div>
          ) : null}

          {/* Both rows say the fact a viewer would otherwise get wrong. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */}
          {sky ? (
            <>
              <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
                <span
                  className="inline-block size-[5px] shrink-0 rounded-full"
                  style={{ background: "var(--color-star)" }}
                />
                <span>the stars are the real ones, down to magnitude 6</span>
              </div>
              {/* The planets are drawn as stars on purpose, so the sentence has to carry what the picture
              deliberately does not: five of them are not stars and will have moved by next week. */}
              <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
                <span
                  className="inline-block size-[7px] shrink-0 rounded-full"
                  style={{ background: "var(--color-star)" }}
                />
                <span>five of them are planets, and they wander</span>
              </div>
              <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
                <span
                  className="inline-block size-[9px] shrink-0 rounded-full"
                  style={{ background: "var(--color-moon)" }}
                />
                <span>the small disc is the moon, at its real size</span>
              </div>
            </>
          ) : null}

          {/* The only row here describing something nobody measured. There is no honest number to print beside
          a constellation, so the row says whose idea it is rather than what it counts. */}
          {figuresOn ? (
            <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
              <span className="inline-block h-[1px] w-[7px] shrink-0 bg-current opacity-60" />
              <span>the lines are the constellations people drew</span>
            </div>
          ) : null}

          {/* The rings' words were JSX rather than a note, so the row could interpolate the playback
          multiplier. A template string carries that and lets the row take the same shape as the rest. */}
          <KeyRow
            // The pair is the head; why they are sped up and what the gap measures are the body.
            note={
              "two rings leave each new epicentre. " +
              "The P-wave, and the slower S behind it. " +
              `Sped up \u00d7${PLAYBACK} or they would not appear to move, and the gap between them is ` +
              "how distance to a quake is measured."
            }
            glyph={
              /* Two circles, which is literally what is drawn: the outer is the P front and the inner the S.
             On the ramp like the markers, since a ring carries its own event's magnitude colour. */
              <span className="relative mt-[3px] inline-block size-[13px] shrink-0">
                <span
                  className="absolute inset-[3.5px] rounded-full border"
                  style={{ borderColor: rampColorAt(ramp, 0.55) }}
                />
                <span
                  className="absolute inset-0 rounded-full border opacity-45"
                  style={{ borderColor: rampColorAt(ramp, 0.55) }}
                />
              </span>
            }
          />

          {/* The city goes in the row rather than in a tooltip, because a tooltip needs the mark found first
          and this mark exists to be found. "Roughly" is not modesty: a timezone can be a thousand
          kilometres wide, so somebody in Vancouver gets a tick over Los Angeles. */}
          {herePlace ? (
            <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
              <span className="inline-block size-[9px] shrink-0 border border-current opacity-70" />
              <span>the four ticks are roughly you, near {herePlace}</span>
            </div>
          ) : null}
        </details>
      </div>
    );
  }

  return (
    // `data-ramp` marks an element outside the canvas allowed to paint the magnitude ramp, which the
    // design-contract test excludes by name rather than by loosening the rule. See DESIGN.md 3.1.
    <div data-ramp>
      <label className="label block" htmlFor="mag">
        Magnitude {value.toFixed(1)} and above
      </label>

      <div className="relative mt-2.5 h-[10px]">
        <div
          className="absolute inset-0 rounded-[1px]"
          style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}
        />
        {/* The excluded range is dimmed, not removed, so the scale stays whole. Cutting the track short
            would make the legend change length every time the filter moved. */}
        <div className="absolute inset-y-0 left-0 rounded-l-[1px] bg-deck/78" style={{ width: `${cut}%` }} />
        <input
          id="mag"
          type="range"
          min={MAG_MIN}
          max={MAG_MAX}
          step="0.1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ramp-slider absolute inset-0 h-full w-full"
          aria-describedby="mag-scale"
        />
      </div>

      <div id="mag-scale" className="mt-2 flex justify-between font-mono text-[10.5px] text-faint">
        {TICKS.map((t, i) => (
          <span key={t}>{i === TICKS.length - 1 ? `${t}+` : t.toFixed(1)}</span>
        ))}
      </div>

      {/* Feeds and layers fold, because they are set once and then never touched, and the rail is short by
          about 400px with the timeline back in it. The ramp above stays open - that one gets dragged. See ARCHITECTURE.md#srcappmagnitudefiltertsx. */}
      <details className="mt-3">
        <summary className="label cursor-pointer select-none">Feeds and layers</summary>
        <div className="mt-2">
          {children}
          {switches.length === 0 ? null : (
            <div className="mt-3">
              <span className="label block">Layers</span>
              <div role="group" aria-label="Layers" className="layer-options mt-1">
                {switches}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* The split, drawn. Without a rule the source buttons sat 10px above the commentary with the same
          gap that separates the slider from its ticks, so the panel read as one undifferentiated stack. */}
      <hr className="mt-3.5 border-t border-hairline" />
    </div>
  );
}
