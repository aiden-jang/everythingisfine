import { MAG_MAX, MAG_MIN, rampColorAt, type RampName } from "../globe/ramp";

/*
 * What the colours mean.
 *
 * Missing entirely until somebody said the interface was bad and I went looking. The whole product
 * encodes magnitude in hue and radius, the two-palette rule exists to protect that encoding, three
 * documents argue about which ramp to use, and nothing on screen ever said what the colours were.
 *
 * Built from the same table the shader samples, so the legend cannot drift from the data. A legend
 * maintained separately from its ramp is worse than none: it is a caption that used to be true.
 */
export function Legend({ ramp }: { ramp: RampName }): JSX.Element {
  const stops = Array.from({ length: 32 }, (_, i) => rampColorAt(ramp, i / 31));
  const ticks = [MAG_MIN, 3, 5, MAG_MAX];

  /*
   * `data-legend` marks the one place outside the canvas allowed to paint the data ramp.
   *
   * DESIGN.md gives the chrome no hue, and the design-contract test enforces it. A legend obviously
   * has to break that, and the rule the document sets for its other exception applies here too:
   * name it, or it becomes a precedent and the next one is a coloured button. The attribute is what
   * the test excludes, so the exception is a specific element rather than a relaxed threshold.
   */
  return (
    <div data-legend>
      <div className="label">Magnitude</div>
      <div
        className="mt-2 h-[6px] rounded-[1px]"
        style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}
        role="img"
        aria-label={`Colour scale from magnitude ${MAG_MIN} to ${MAG_MAX} and above`}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-faint">
        {ticks.map((t, i) => (
          <span key={t}>{i === ticks.length - 1 ? `${t}+` : t.toFixed(1)}</span>
        ))}
      </div>
      {/* Size carries the same value, so a colourblind viewer and a small screen both still read it. */}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-dim">
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
    </div>
  );
}
