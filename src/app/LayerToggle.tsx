const descriptions: Record<string, string> = {
  "Regional cutaway":
    "Open the pinned region, or the view centre. Orbit to inspect true depth; 300 km guide rings.",
  "Place markers at depth": "Place deep events below the surface.",
  "Plate movement": "Arrows show how tectonic plates move.",
  "Historical deep earthquakes": "Historical seismicity traces descending plates.",
  Constellations: "Connect stars into named figures.",
};

export function LayerToggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element {
  const descriptionId = `layer-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="layer-option">
      <button
        type="button"
        aria-pressed={on}
        aria-describedby={descriptionId}
        onClick={() => onChange(!on)}
        className={`cursor-pointer border px-2 py-1 text-[11px] transition-colors ${
          on ? "border-faint bg-raised text-ink" : "border-hairline text-faint hover:bg-raised hover:text-dim"
        }`}
      >
        {label}
      </button>
      <p id={descriptionId}>{descriptions[label]}</p>
    </div>
  );
}
