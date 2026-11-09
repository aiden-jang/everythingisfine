import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createMoonfall, type MoonfallView } from "../../globe/moonfall/scene";
import { loadLunarSurvey, lunarSources, traverses } from "../../sources/moonfall/apollo17";
import type { TonightPresentation } from "../../globe/scenePresentation";
import type { TonightView } from "../../geo/tonight";

const motion = "(prefers-reduced-motion: reduce)";
const km = new Intl.NumberFormat("en", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function Moonfall({
  sky,
  onView,
}: {
  sky: TonightView;
  onView: (view: TonightPresentation) => void;
}): JSX.Element {
  const [experience, setExperience] = useState<MoonfallView | "failed" | null>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let created: MoonfallView | undefined;
    void loadLunarSurvey(abort.signal)
      .then((survey) => {
        if (abort.signal.aborted) return;
        created = createMoonfall(survey, matchMedia(motion).matches);
        setExperience(created);
        onView({ ...sky, moonfall: created });
      })
      .catch(() => {
        if (!abort.signal.aborted) setExperience("failed");
      });
    return () => {
      abort.abort();
      created?.dispose();
    };
  }, [sky, onView, attempt]);

  if (experience === null) return <p role="status">Loading the lunar survey…</p>;
  if (experience === "failed") {
    return (
      <>
        <p role="status">The lunar survey couldn’t load.</p>
        <div className="observatory-actions moonfall-actions">
          <button
            type="button"
            onClick={() => {
              setExperience(null);
              retry((count) => count + 1);
            }}
          >
            Retry survey
          </button>
        </div>
      </>
    );
  }
  return <TraverseControls view={experience} wake={() => onView({ ...sky, moonfall: experience })} />;
}

function TraverseControls({ view, wake }: { view: MoonfallView; wake: () => void }): JSX.Element {
  const { eva, flying, meters, playing, station, mapped } = useSyncExternalStore(view.subscribe, view.read);
  const id = useId();
  const route = traverses[eva]!;
  const length = Math.round(route.km * 1000);
  const distance = `${km.format(meters / 1000)} of ${km.format(route.km)} km`;
  const act = (update: () => void) => {
    update();
    wake();
  };
  return (
    <>
      <div className="observatory-actions moonfall-actions" role="group" aria-label="Lunar projection">
        <button type="button" aria-pressed={!mapped} onClick={() => act(() => view.project(false))}>
          Terrain
        </button>
        <button type="button" aria-pressed={mapped} onClick={() => act(() => view.project(true))}>
          Landing map
        </button>
      </div>
      <div className="observatory-actions moonfall-actions">
        {flying ? (
          <button type="button" onClick={() => act(view.skip)}>
            Skip descent
          </button>
        ) : (
          <button type="button" data-moonfall-replay="" onClick={() => act(view.replay)}>
            Replay descent
          </button>
        )}
        <button type="button" onClick={() => act(view.toggleRoute)}>
          {playing ? "Pause traverse" : "Play traverse"}
        </button>
      </div>
      <label className="tonight-city">
        Rover traverse
        <select value={eva} onChange={(event) => act(() => view.select(Number(event.currentTarget.value)))}>
          {traverses.map(({ title }, i) => (
            <option key={title} value={i}>
              {i + 1} · {title}
            </option>
          ))}
        </select>
      </label>
      <div className="tonight-time">
        <div className="tonight-clock">
          <label htmlFor={id}>Mapped distance</label>
          <output htmlFor={id}>{distance}</output>
        </div>
        <input
          id={id}
          type="range"
          className="scrub-slider tonight-scrub"
          min={0}
          max={250}
          value={Math.round((250 * meters) / length)}
          aria-valuetext={distance}
          onChange={(event) => act(() => view.seek((length * event.currentTarget.valueAsNumber) / 250))}
        />
        <div className="tonight-clock tonight-edges">
          <span>{route.day} 1972 · UTC</span>
          <span>Traverse {eva + 1} of 3</span>
        </div>
      </div>
      <label className="tonight-city">
        Geology stop
        <select
          value={station ?? ""}
          onChange={(event) => act(() => view.stopAt(Number(event.currentTarget.value)))}
        >
          <option value="" disabled>
            Choose a stop
          </option>
          {route.stations.map(({ name }, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p className="moonfall-description">
        Apollo 17 in Taurus–Littrow. Follow the rover’s mapped tracks across terrain measured from lunar
        orbit.
      </p>
      <details className="tonight-objects">
        <summary>
          <span>Terrain &amp; routes</span>
        </summary>
        <p>
          The descent is a virtual camera flight. Rover playback is paced by mapped distance. Elevations come
          from LRO stereo imagery registered to laser altimetry. Haase and colleagues reconstructed the paths
          and stops from the mission map, surface photographs, and orbital images.
        </p>
        <div className="moonfall-links">
          <a href={lunarSources.terrain} target="_blank" rel="noreferrer">
            LRO terrain via USGS
          </a>
          <a href={lunarSources.routes} target="_blank" rel="noreferrer">
            Haase et al. rover tracks
          </a>
          <a href={lunarSources.moon} target="_blank" rel="noreferrer">
            NASA Moon mosaic
          </a>
        </div>
      </details>
    </>
  );
}
