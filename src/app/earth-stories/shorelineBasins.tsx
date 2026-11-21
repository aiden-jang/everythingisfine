import { EvidenceConnector } from "../observations/EvidenceConnector";

export interface ShorelineBasin {
  id: string;
  label: string;
  lon: number;
  lat: number;
}

export type BasinReadings = Readonly<Record<string, { water: number | null; missing: number }>>;

export function BasinMarkers({
  basins,
  selected,
  select,
  separating,
}: {
  basins: readonly ShorelineBasin[];
  selected: string;
  select: (id: string) => void;
  separating: boolean;
}) {
  return (
    <>
      <div
        className="shoreline-basins"
        aria-label="Aral Sea basins"
        data-separating={separating || undefined}
      >
        {basins.map(({ id, label, lon, lat }) => (
          <button
            key={id}
            type="button"
            data-basin={id}
            data-observation-anchor=""
            data-compact-anchor=""
            data-lon={lon}
            data-lat={lat}
            data-evidence-source={id === selected ? "true" : undefined}
            data-projection-anchor={id === selected || undefined}
            aria-pressed={id === selected}
            aria-label={`Inspect ${label}`}
            onClick={() => select(id)}
          >
            <span aria-hidden="true">{label}</span>
          </button>
        ))}
      </div>
      {selected && <EvidenceConnector key={selected} trace />}
    </>
  );
}

export function BasinReading({
  basins,
  selected,
  select,
  readings,
  year,
}: {
  basins: readonly ShorelineBasin[];
  selected: string;
  select: (id: string) => void;
  readings: BasinReadings | undefined;
  year: number;
}) {
  const basin = basins.find(({ id }) => id === selected);
  const reading = readings?.[selected];
  return (
    <section className="basin-reading" aria-label="Basin reading" data-evidence-body="">
      <label className="observation-picker">
        <span>Inspect a basin</span>
        <select value={selected} onChange={(event) => select(event.currentTarget.value)}>
          <option value="">All basins</option>
          {basins.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {basin && reading && (
        <>
          <h3 data-evidence-point="">
            {basin.label} · {year}
          </h3>
          <dl className="observation-values">
            <div>
              <dt>Observed water</dt>
              <dd>
                {reading.water === null || reading.missing >= 50 ? "Sparse coverage" : `${reading.water}%`}
              </dd>
            </div>
            <div>
              <dt>No observation</dt>
              <dd>{reading.missing}%</dd>
            </div>
          </dl>
          <p className="observation-note">
            Water share is calculated from observed cells in this part of the 1984–86 footprint. Hatched cells
            show gaps in the archive.
          </p>
        </>
      )}
    </section>
  );
}
