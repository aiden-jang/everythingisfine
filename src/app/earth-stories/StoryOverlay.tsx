import type { ObservationFrame, ObservationView } from "../observations/types";
import type { EarthStoryData } from "./types";

export function StoryOverlay({
  slice,
  localSky,
  data,
  frame,
  site,
  chooseSite,
}: {
  slice: boolean;
  localSky?: ObservationView["sky"];
  data: EarthStoryData;
  frame: ObservationFrame;
  site: string;
  chooseSite: (id: string) => void;
}): JSX.Element {
  return (
    <>
      {slice && (
        <div className="story-section-caption">
          <strong>CALIPSO · 23 June 2020</strong>
          <span>0–15 km · height exaggerated 80×</span>
          <span>Warm colors: stronger laser backscatter. Clouds also scatter light.</span>
        </div>
      )}
      {localSky && (
        <div className="tonight-labels comet-labels" data-sky-labels="" aria-hidden="true">
          {localSky.bodies.map(({ name }) => (
            <span key={name} data-body={name}>
              {name === "NEOWISE" && <i />}
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
