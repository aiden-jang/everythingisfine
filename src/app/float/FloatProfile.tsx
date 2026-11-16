import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { FloatDiveView } from "./floatPlayback";
import { PROFILE_CHART, profileGeometry, type ProfileField } from "./profileGeometry";
import { updateFloatTether } from "../../globe/floatPlacement";

export function FloatProfile({ view }: { view: FloatDiveView }) {
  const { index, inspecting } = useSyncExternalStore(view.subscribe, view.read);
  const { samples } = view.profile;
  const [field, setField] = useState<ProfileField>("temperature");
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  const plot = useMemo(() => profileGeometry(samples, field), [samples, field]);
  useLayoutEffect(() => setPortal(document.getElementById("float-profile-stage")), [view]);
  useLayoutEffect(() => {
    if (inspecting) {
      if (!opener.current) {
        const active = document.activeElement;
        opener.current =
          active instanceof HTMLElement && active !== document.body && active.isConnected
            ? active
            : document.querySelector<HTMLElement>(".float-inspect-toggle");
      }
      close.current?.focus({ preventScroll: true });
    } else {
      if (document.activeElement === document.body && opener.current?.isConnected)
        opener.current.focus({ preventScroll: true });
      opener.current = null;
    }
  }, [inspecting, portal]);
  useLayoutEffect(() => updateFloatTether(), [field, index, inspecting, portal]);
  if (!inspecting) return null;

  const { width, height, left, right, top, bottom } = PROFILE_CHART;
  const digits = field === "temperature" ? 2 : 3;
  const label = field === "temperature" ? "Temperature (°C)" : "Practical salinity";
  const sample = samples[index]!;
  const current = plot.points[index]!;
  const value = `${sample[field].toFixed(digits)}${field === "temperature" ? " °C" : " salinity"}`;
  const selected = `${Math.round(sample.depth).toLocaleString()} m · ${value}`;

  function selectSample(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - bounds.top) / bounds.height) * height;
    const depth = Math.max(0, Math.min(1, (y - top) / (bottom - top))) * plot.deepest;
    let nearest = 0;
    for (let candidate = 1; candidate < samples.length; candidate++) {
      if (Math.abs(samples[candidate]!.depth - depth) < Math.abs(samples[nearest]!.depth - depth))
        nearest = candidate;
    }
    view.seek(nearest);
  }

  const content = (
    <section
      id="float-measured-profile"
      className="float-profile"
      aria-label="Measured float profile"
      data-inline={!portal || undefined}
      onScroll={() => updateFloatTether()}
    >
      <div className="float-profile-heading">
        <h2>The measured profile</h2>
        <button
          type="button"
          ref={close}
          onClick={() => view.inspect(false)}
          aria-label="Close measured profile"
        >
          Close
        </button>
      </div>
      <div className="float-profile-fields" role="group" aria-label="Profile measurement">
        {(["temperature", "salinity"] as const).map((measurement) => (
          <button
            type="button"
            key={measurement}
            aria-pressed={field === measurement}
            onClick={() => setField(measurement)}
          >
            {measurement === "temperature" ? "Temperature" : "Salinity"}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          selectSample(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) selectSample(event);
        }}
        data-ramp
      >
        <title id={`${id}-title`}>{label} by estimated depth</title>
        <desc id={`${id}-description`}>
          {samples.length} measured samples. {label} ranges from {plot.min.toFixed(digits)} to{" "}
          {plot.max.toFixed(digits)}. Depth increases downward from zero to {Math.round(plot.deepest)} metres.{" "}
          {plot.trend} Selected sample: {value} at {Math.round(sample.depth)} metres.
        </desc>
        {[0, 0.5, 1].map((fraction) => {
          const y = top + fraction * (bottom - top);
          return (
            <g key={fraction}>
              <path d={`M${left} ${y}H${right}`} className="float-profile-grid" />
              <text x={left - 8} y={y + 4} textAnchor="end">
                {Math.round(plot.deepest * fraction).toLocaleString()}
              </text>
              <text x={left + fraction * (right - left)} y="187" textAnchor="middle">
                {(plot.low + fraction * (plot.high - plot.low)).toFixed(digits)}
              </text>
            </g>
          );
        })}
        <text x={left} y="13">
          Depth (m)
        </text>
        <text x={(left + right) / 2} y="209" textAnchor="middle">
          {label}
        </text>
        <polyline points={plot.line} className="float-profile-line" data-field={field} />
        <path d={`M${left} ${current.y}H${right}`} className="float-profile-selection" />
        <circle cx={current.x} cy={current.y} r="4.5" className="float-profile-sample" />
      </svg>
      <label className="float-profile-inspect">
        <span>
          Selected sample <strong>{selected}</strong>
        </span>
        <input
          type="range"
          className="scrub-slider"
          min={0}
          max={samples.length - 1}
          step={1}
          value={index}
          onChange={(event) => view.seek(event.currentTarget.valueAsNumber)}
          aria-label="Inspect profile sample"
          aria-valuetext={selected}
          aria-describedby={`${id}-help`}
        />
      </label>
      <p>{plot.trend}</p>
      <p id={`${id}-help`} className="float-profile-help">
        Drag the chart or move the slider. Each selection is a measured sample.
      </p>
    </section>
  );
  return portal ? createPortal(content, portal) : content;
}
