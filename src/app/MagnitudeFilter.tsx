import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";

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
}

const TICKS = [MAG_MIN, 3, 5, MAG_MAX];

export function MagnitudeFilter({ ramp, value, onChange }: MagnitudeFilterProps): JSX.Element {
  const stops = Array.from({ length: 32 }, (_, i) => rampColorAt(ramp, i / 31));
  // Where the threshold sits along the scale, as a percentage of the track.
  const cut = Math.max(0, Math.min(100, ((value - MAG_MIN) / (MAG_MAX - MAG_MIN)) * 100));

  return (
    // `data-legend` marks the one element outside the canvas allowed to paint the data ramp, which
    // the design-contract test excludes by name rather than by loosening the rule. See DESIGN.md 3.1.
    <div data-legend>
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
        The plate boundaries need naming too. An unexplained line on a data visualisation is a
        question mark, and somebody could reasonably read these as a second data layer rather than
        as the geography the events are following.
      */}
      <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
        <span className="inline-block h-px w-[38px] shrink-0 bg-plate opacity-90" />
        <span>plate boundaries</span>
      </div>
    </div>
  );
}
