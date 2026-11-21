import type { ObservationFrame, ObservationView } from "../observations/types";
import type { EarthStoryData, StorySite } from "./types";

export function StoryOverlay({
  localSky,
  data,
  frame,
  site,
  chooseSite,
}: {
  localSky?: ObservationView["sky"];
  data: EarthStoryData;
  frame: ObservationFrame;
  site: string;
  chooseSite: (id: string) => void;
}): JSX.Element {
  return (
    <>
      {localSky && (
        <div className="tonight-labels comet-labels" data-sky-labels="" aria-hidden="true">
          {localSky.bodies.map(({ name }) => (
            <span key={name} data-body={name}>
              {(name === "NEOWISE" || name === "Apophis") && <i />}
              {name}
            </span>
          ))}
        </div>
      )}
      {data.sites && (
        <div className="story-sites">
          {data.sites
            .filter((p) => p.at <= frame.at)
            .map((p, i) => (
              <button
                key={p.id}
                type="button"
                data-observation-anchor=""
                data-lon={p.lon}
                data-lat={p.lat}
                onClick={() => chooseSite(p.id)}
                aria-label={`Inspect ${p.label}`}
                aria-pressed={site === p.id}
              >
                {i + 1}
              </button>
            ))}
        </div>
      )}
    </>
  );
}

export function StorySitePicker({
  sites,
  site,
  choose,
  value,
}: {
  sites: readonly StorySite[];
  site: string;
  choose: (id: string) => void;
  value: string | undefined;
}) {
  return (
    <>
      <label className="observation-picker">
        <span>Survey measurement</span>
        <select value={site} onChange={(event) => choose(event.currentTarget.value)}>
          <option value="">Choose a marked site</option>
          {sites.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {value && <p className="observation-note">{value}</p>}
    </>
  );
}
