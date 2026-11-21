import { useMemo, type Ref } from "react";
import { terrainSource, type sectionSamples } from "./terrainSection";

const x = (index: number) => 38 + index * 2.94;
const y = (meters: number | null) => 12 + Math.max(0, -(meters ?? 0)) * 0.009;

export function TerrainProfile({
  chart,
  samples,
  index,
  select,
  flight,
}: {
  chart: Ref<HTMLElement>;
  samples: ReturnType<typeof sectionSamples>;
  index: number;
  select: (index: number) => void;
  flight: boolean;
}) {
  const total = Math.round(samples.at(-1)!.km);
  const sample = samples[index]!;
  const distance = `${Math.round(sample.km)} km`;
  const depth =
    sample.meters === null
      ? "No grid value"
      : `${Math.abs(sample.meters).toLocaleString()} m ${sample.meters > 0 ? "above sea level" : "deep"}`;
  const source = sample.source === undefined ? "Source unavailable" : terrainSource(sample.source);
  const path = useMemo(
    () => samples.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.meters)}`).join(" "),
    [samples],
  );
  return (
    <figure ref={chart} className="terrain-section" data-flight-profile={flight || undefined}>
      <figcaption>{flight ? "Along the flight path" : "Along your section"} · GEBCO grid depths</figcaption>
      <svg viewBox="0 0 340 150" role="img" aria-label={`Depth section across ${total} kilometres`}>
        <path d="M38 12V120H332" fill="none" stroke="currentColor" opacity=".5" />
        {[0, 5, 10].map((km) => (
          <text key={km} x="1" y={18 + km * 9}>
            {km} km
          </text>
        ))}
        <path d={`${path} L332 120 H38 Z`} fill="currentColor" opacity=".11" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d={`M${x(index)} 12V120`} stroke="currentColor" strokeDasharray="2 4" opacity=".55" />
        <circle cx={x(index)} cy={y(sample.meters)} r="4" className="terrain-profile-point" />
        <text x="38" y="143">
          0
        </text>
        <text x="332" y="143" textAnchor="end">
          {total} km
        </text>
      </svg>
      <label className="terrain-profile-control">
        Distance along section
        <input
          className="scrub-slider"
          type="range"
          min={0}
          max={samples.length - 1}
          value={index}
          aria-valuetext={`${distance} · ${depth} · ${source}`}
          onInput={(event) => select(event.currentTarget.valueAsNumber)}
        />
      </label>
      <output className="terrain-profile-reading">
        <strong>{depth}</strong>
        <span>
          {distance} along section · {source}
        </span>
      </output>
    </figure>
  );
}
