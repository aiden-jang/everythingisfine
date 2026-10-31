import { rampColorAt, type RampName } from "../globe/ramp";

export function DepthKey({ ramp }: { ramp: RampName }): JSX.Element {
  return (
    <>
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
                // Keep the maximum hole equal to the globe shader's 0.30 of the sprite.
                mask:
                  depth > 0.02
                    ? `radial-gradient(circle, transparent ${depth * 30 * 2}%, #000 ${depth * 30 * 2 + 8}%)`
                    : undefined,
                WebkitMask:
                  depth > 0.02
                    ? `radial-gradient(circle, transparent ${depth * 30 * 2}%, #000 ${depth * 30 * 2 + 8}%)`
                    : undefined,
              }}
            />
          ))}
        </span>
        <span>solid is shallow, hollow is deep</span>
      </div>
      <details className="mt-2 text-[11px] text-faint">
        <summary className="disclose hover:text-dim">Depth, in section</summary>
        <figure className="mt-2 border border-hairline p-3">
          <svg viewBox="0 0 240 112" className="w-full text-dim" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M14 44q106-45 212 0" />
              <path d="M76 28v61m-4-57 4-4 4 4m-8 53 4 4 4-4" />
              <path d="M80 28h50M80 89h50" strokeDasharray="3 4" />
              <circle cx="130" cy="89" r="5" />
            </g>
            <g fill="currentColor" fontSize="11">
              <text x="160" y="23">
                surface
              </text>
              <text x="17" y="63">
                depth
              </text>
              <text x="144" y="94">
                below surface
              </text>
            </g>
          </svg>
          <figcaption className="mt-1 leading-relaxed">
            Depth view · schematic, not to scale. On the globe, turn on depth to position events inside it.
          </figcaption>
        </figure>
      </details>
    </>
  );
}
