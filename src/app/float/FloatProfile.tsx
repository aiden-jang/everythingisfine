import { useId, useMemo, useState } from "react";
import type { ArgoSample } from "../../sources/argo";
import { profileGeometry, type ProfileField } from "./profileGeometry";

export function FloatProfile({ samples, index }: { samples: readonly ArgoSample[]; index: number }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ProfileField>("temperature");
  const id = useId();
  const plot = useMemo(() => profileGeometry(samples, field), [samples, field]);
  const digits = field === "temperature" ? 2 : 3;
  const label = field === "temperature" ? "Temperature (°C)" : "Practical salinity";
  const current = plot.points[index]!;
  return (
    <details className="float-profile" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>View measured profile</summary>
      {open && (
        <>
          <div className="float-profile-fields" role="group" aria-label="Profile measurement">
            {(["temperature", "salinity"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={field === value}
                onClick={() => setField(value)}
              >
                {value === "temperature" ? "Temperature" : "Salinity"}
              </button>
            ))}
          </div>
          <svg viewBox="0 0 310 216" role="img" aria-labelledby={`${id}-title ${id}-description`} data-ramp>
            <title id={`${id}-title`}>{label} by estimated depth</title>
            <desc id={`${id}-description`}>
              {samples.length} measured samples. {label} ranges from {plot.min.toFixed(digits)} to{" "}
              {plot.max.toFixed(digits)}. Depth increases downward from zero to {Math.round(plot.deepest)}{" "}
              metres. Selected sample: {samples[index]![field].toFixed(digits)} at{" "}
              {Math.round(samples[index]!.depth)} metres.
            </desc>
            {[0, 0.5, 1].map((fraction) => {
              const y = 24 + fraction * 142;
              return (
                <g key={fraction}>
                  <path d={`M54 ${y}H278`} className="float-profile-grid" />
                  <text x="46" y={y + 4} textAnchor="end">
                    {Math.round(plot.deepest * fraction)}
                  </text>
                  <text x={54 + fraction * 224} y="187" textAnchor="middle">
                    {(plot.low + fraction * (plot.high - plot.low)).toFixed(digits)}
                  </text>
                </g>
              );
            })}
            <text x="54" y="13">
              Depth (m)
            </text>
            <text x="166" y="209" textAnchor="middle">
              {label}
            </text>
            <polyline points={plot.line} className="float-profile-line" data-field={field} />
            <circle cx={current.x} cy={current.y} r="4" className="float-profile-sample" />
          </svg>
          <p>
            Each point is a measured sample; the highlighted point matches playback.
            {field === "salinity" && " Higher salinity values indicate saltier water."}
          </p>
        </>
      )}
    </details>
  );
}
