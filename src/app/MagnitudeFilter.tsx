import type { ReactElement, ReactNode } from "react";
import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";
import { PLAYBACK } from "../geo/waves";
import {
  auroraNote, cycloneNote, depthNote, floodNote, motionNote, soundNote, splitNote, volcanoNote,
  wildfireNote,
} from "./format";
import { category } from "../sources/cyclones";
import { flame, spiral, volcano, waves } from "../globe/shapes";

/*
 * One row of the key: a glyph, the line that names it, and the reasoning one press away.
 *
 * Every layer used to print its whole paragraph at once, six of them stacked, and the legend became the
 * tallest block of prose on screen. `splitNote` takes the first sentence because that is already the
 * line a key wants, so this changed the container and not a word of the copy.
 *
 * `details` rather than a button and state: it is natively focusable, so the row stays reachable without
 * a keyboard path being invented for it, and it matches the two disclosures the rail already uses.
 */
function KeyRow(
  { glyph, note }: { glyph?: ReactNode; note: string | null },
): ReactElement | null {
  // Takes the null the note functions already return for an empty layer, rather than making each
  // caller prove non-null a second time next to the count it is already gated on.
  if (note === null) return null;
  const { head, rest } = splitNote(note);
  const line = "flex items-start gap-2.5 text-[11px] leading-relaxed text-faint";
  /*
   * A row with no glyph belongs to the row above it - the depth counts under "solid is shallow, hollow
   * is deep" - so it takes the same indent the reasoning does and lines up under that row's text
   * rather than under its swatch.
   */
  const indent = glyph === undefined ? "pl-[23px]" : "";
  if (rest === null) {
    return <div className={`mt-2 ${line} ${indent}`}>{glyph}<span>{head}</span></div>;
  }
  return (
    <details className="mt-2">
      <summary className={`${line} ${indent} cursor-pointer list-none hover:text-dim`}>
        {glyph}
        <span>{head}</span>
      </summary>
      {/* Indented past the glyph so the reasoning reads as belonging to the row it opened from. */}
      <p className="mt-1 pl-[23px] text-[11px] leading-relaxed text-faint">{rest}</p>
    </details>
  );
}

/*
 * The legend and the magnitude filter, which were two blocks and are one control.
 *
 * They were always about the same quantity. The legend said what the colours mean; the filter said
 * which of them to draw. Stacked separately they read as unrelated widgets, and the rail had three
 * control idioms doing two jobs.
 *
 * Running the slider along the ramp makes the encoding and the filter the same object: the track is
 * the scale, the thumb is the threshold, and everything excluded is dimmed in place so you can see
 * exactly which part of the range you have thrown away. Neither half needs a label explaining the
 * other.
 */

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
  /**
   * The arrows' own numbers, or null while the table is still loading or switched off.
   * Passed in rather than read here, so the legend never pulls the table into the eager bundle.
   */
  motion: { arrows: number; fastest: number; converging: number } | null;
  /** The announce threshold the sound follows, or null when sound is off. */
  sound: number | null;
  /** How many events are in each depth band, so the row counts rather than promises. */
  depth: { shallow: number; intermediate: number; deep: number; unknown: number; total: number };
  motionOn: boolean;
  onMotion: (on: boolean) => void;
  /**
   * Any further controls, rendered above the key rather than below it.
   *
   * A slot rather than more props, because what goes here is a control and this component's job is to
   * keep the controls together and above the prose. The source toggles are the only occupant today.
   */
  children?: JSX.Element;
  /** Whether the key below the scale is open. Held outside so it survives a reload. */
  keyOpen: boolean;
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
 * The legend's glyphs, from the same generators the globe draws, so the two cannot drift apart.
 *
 * Latitude negated because SVG counts y downward and the globe counts it up. Without that the volcano
 * points at the ground, which is a different symbol.
 */
function path(points: readonly { lon: number; lat: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.lon.toFixed(2)} ${(-p.lat).toFixed(2)}`).join(" ");
}

export function MagnitudeFilter(
  {
    ramp, value, onChange, aurora, cyclones, volcanoes, volcanoesSince, now,
    fires, fireCap, floods, floodCountries, keyOpen, onKeyOpen, archived = false,
    motion, motionOn, onMotion, depth, sound, children,
  }: MagnitudeFilterProps,
): JSX.Element {
  const stops = Array.from({ length: 32 }, (_, i) => rampColorAt(ramp, i / 31));
  // Where the threshold sits along the scale, as a percentage of the track.
  const cut = Math.max(0, Math.min(100, ((value - MAG_MIN) / (MAG_MAX - MAG_MIN)) * 100));

  return (
    // `data-ramp` marks an element outside the canvas allowed to paint the magnitude ramp, which
    // the design-contract test excludes by name rather than by loosening the rule. See DESIGN.md 3.1.
    <div data-ramp>
      <label className="label block" htmlFor="mag">
        Magnitude {value.toFixed(1)} and above
      </label>

      <div className="relative mt-2.5 h-[10px]">
        <div
          className="absolute inset-0 rounded-[1px]"
          style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}
        />
        {/*
          The excluded range is dimmed rather than removed, so the scale stays whole. Cutting the
          track short would make the legend change length every time the filter moved, and a legend
          that resizes is no longer a scale.
        */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-[1px] bg-deck/78"
          style={{ width: `${cut}%` }}
        />
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

      {children}

      {/*
        Everything below the scale is explanation, and it folds away.

        The split is control against commentary: the slider, the ticks and the source buttons are how you
        change what is on the globe, and the rest is what the marks mean. Five layers' worth of that is
        seven paragraphs, which over the map is a wall in front of the thing it describes.

        **Open by default**, and only remembered once somebody closes it. This app's whole argument is
        that no layer ships without the sentence that explains it, so shipping it folded shut would be
        hiding the argument from everyone who never finds the toggle. The viewer gets to dismiss it; the
        app does not get to pre-dismiss it for them.

        Controlled rather than left to the browser, because the state is persisted. `preventDefault` on
        the summary stops the native toggle so React owns `open` - React 18 does not listen for `toggle`,
        so reading the browser's own state back is not an option here.
      */}
      <details className="mt-2.5" open={keyOpen}>
        <summary
          className="disclose text-[11px] text-faint hover:text-dim"
          onClick={(e) => { e.preventDefault(); onKeyOpen(!keyOpen); }}
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
        <span>size shows it too</span>
      </div>

      {/*
        Depth, explained.
        An encoding nobody can read is decoration, and this one is easy to mistake for a rendering
        artefact: a marker with a hole in it looks like a bug until something says otherwise.
      */}
      <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
        <span className="flex items-baseline gap-1.5">
          {[0, 0.55, 1].map((depth) => (
            <span
              key={depth}
              className="inline-block rounded-full"
              style={{
                width: "12px",
                height: "12px",
                background: rampColorAt(ramp, 0.55),
                // The same carve the shader makes: a hole opening to 0.30 of the sprite at depth.
                mask: depth > 0.02
                  ? `radial-gradient(circle, transparent ${depth * 30 * 2}%, #000 ${depth * 30 * 2 + 8}%)`
                  : undefined,
                WebkitMask: depth > 0.02
                  ? `radial-gradient(circle, transparent ${depth * 30 * 2}%, #000 ${depth * 30 * 2 + 8}%)`
                  : undefined,
              }}
            />
          ))}
        </span>
        <span>solid is shallow, hollow is deep</span>
      </div>

      {/*
        And how many of each are actually here.

        The row above says what the hole means; this says whether there is anything to read. The
        encoding's whole payoff is a subduction margin resolving into rings inland, and on a typical day
        one event out of seventy-nine is deep enough to be a ring. A count is the honest version of that
        promise. See `data/depth.ts`.
      */}
      {/*
        The counts stay, the reasoning folds. Same treatment as the six layer rows below, because this
        was the one paragraph left among them: the sentence that opens with "66 above 70 km, 54 between
        70 and 300" is the part anybody reads, and the slab explanation behind it is two more lines.
      */}
      <KeyRow note={depthNote(depth)} />

      {/*
        The plate boundaries need naming too. An unexplained line on a data visualisation is a
        question mark, and somebody could reasonably read these as a second data layer rather than
        as the geography the events are following.

        The motion toggle hangs off this row rather than getting its own, because it is a second reading
        of these exact lines and not another layer. Off by default: 231 arrows is a mark in every margin
        on the planet, which is worth asking for and not worth being given.
      */}
      <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
        <span className="inline-block h-px w-[38px] shrink-0 bg-plate opacity-90" />
        <span>plate boundaries</span>
        <button
          type="button"
          aria-pressed={motionOn}
          onClick={() => onMotion(!motionOn)}
          className={`ml-auto cursor-pointer border px-2 py-1 text-[11px] transition-colors ${
            motionOn
              ? "border-faint bg-raised text-ink"
              : "border-hairline text-faint hover:bg-raised hover:text-dim"
          }`}
        >
          motion
        </button>
      </div>

      {motion ? (
        <div className="mt-2 flex items-start gap-2.5 text-[11px] leading-relaxed text-faint">
          <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
            <path d="M -7 6 L 5 -6 M 5 -6 L -1 -6 M 5 -6 L 5 0" fill="none" stroke="currentColor"
              strokeWidth={1.6} className="text-dim" />
          </svg>
          <span>{motionNote(motion)}</span>
        </div>
      ) : null}

      {/*
        The rings, which are the signature of the whole design and were the one mark nothing named.
        Every other encoding here is a property of a dot somebody can stare at; a ring appears when an
        event arrives, expands for fifteen seconds and is gone, so a first time viewer gets one look at
        it and no second chance to work out what it was.

        A sentence rather than a label, because unlike "plate boundaries" it cannot be named in two
        words: the multiplier is part of what the mark *is*, and a wavefront moving at twenty times
        real speed with nothing saying so would be the one dishonest thing on screen.

        `items-start`, since this is the only row that wraps, and a glyph centred against two lines
        floats between them.
      */}
      {/*
        Storms, when there are any. A spiral for a swatch, because the mark is a spiral: the rule settled
        with the aurora is that light gets colour and marks get shapes, so this one is shape all the way
        down to its own legend entry.
      */}
      {cyclones.length > 0 ? (
        <KeyRow
          note={cycloneNote(cyclones, category, archived)}
          glyph={<svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
            <path d={SPIRAL_PATH} fill="none" stroke="currentColor" strokeWidth={1.6}
              className="text-dim" />
          </svg>}
        />
      ) : null}

      {/*
        Volcanoes, on the same rule: a triangle, which is what the map draws and cannot be read as a
        magnitude dot. Under the storms because it is the one layer here that is not live, and the line
        beside it says so.
      */}
      {volcanoes > 0 ? (
        <KeyRow
          note={volcanoNote(volcanoes, volcanoesSince, now, archived)}
          glyph={<svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
            <path d={VOLCANO_PATH} fill="none" stroke="currentColor" strokeWidth={1.6}
              className="text-dim" />
          </svg>}
        />
      ) : null}

      {/*
        Fires and floods, same rule again: a flame and the wavy lines water gets, both achromatic. The two
        sentences beside them carry the honesty each feed needs - the fire count is a floor and the flood
        severity does not exist - because a glyph cannot caveat itself.
      */}
      {fires.count > 0 ? (
        <KeyRow
          note={wildfireNote(fires, fireCap, archived)}
          glyph={<svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
            <path d={FLAME_PATH} fill="none" stroke="currentColor" strokeWidth={1.6}
              className="text-dim" />
          </svg>}
        />
      ) : null}

      {floods > 0 ? (
        <KeyRow
          note={floodNote(floods, floodCountries, archived)}
          glyph={
            <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
              {WAVE_PATHS.map((d) => (
                <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1.4}
                  className="text-dim" />
              ))}
            </svg>
          }
        />
      ) : null}

      {/*
        The sound, only while it is on, and it leads with what it is not.

        A tone presented as what an earthquake sounds like would be the one outright falsehood in this
        app - real ground motion is below hearing - so the sentence says so before it says anything else.
        See DESIGN.md 12b.
      */}
      {sound !== null ? (
        <KeyRow
          note={soundNote(sound)}
          glyph={
            <svg viewBox="-11 -11 22 22" className="mt-[2px] size-[13px] shrink-0" aria-hidden="true">
              <path d="M -8 0 L -3 0 L 2 -7 L 2 7 L -3 0 M 5 -4 Q 8 0 5 4" fill="none"
                stroke="currentColor" strokeWidth={1.5} className="text-dim" />
            </svg>
          }
        />
      ) : null}

      {/*
        The sky, when there is any. Below the marks rather than among them, because it is light and they
        are data: the swatch is a wash instead of a glyph for the same reason.
      */}
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

      {/*
        The rings, the one row whose words were JSX rather than a note, so that it could interpolate the
        playback multiplier. A template string carries that just as well and lets this row take the same
        shape as the other five.
      */}
      <KeyRow
        // The pair is the head; why they are sped up and what the gap measures are the body.
        note={"two rings leave each new epicentre. "
          + "The P-wave, and the slower S behind it. "
          + `Sped up \u00d7${PLAYBACK} or they would not appear to move, and the gap between them is `
          + "how distance to a quake is measured."}
        glyph={
          /*
            Two circles, which is literally what is drawn rather than a suggestion of expansion: the
            outer one is the P front and the inner the S. On the ramp like the markers, since a ring
            carries its own event's magnitude colour.
          */
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
      </details>

    </div>
  );
}
