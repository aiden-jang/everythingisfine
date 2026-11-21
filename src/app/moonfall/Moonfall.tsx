import { StoryDock } from "../observations/StoryDock";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createMoonfall, type MoonfallProgress, type MoonfallView } from "../../globe/moonfall/scene";
import { loadLunarSurvey, lunarSources, traverses } from "../../sources/moonfall/apollo17";
import type { TonightPresentation } from "../../globe/scenePresentation";
import { lunarStationNotes } from "../../sources/moonfall/stationNotes";
import type { TonightView } from "../../geo/tonight";

const motion = "(prefers-reduced-motion: reduce)";
const km = new Intl.NumberFormat("en", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function Moonfall({
  sky,
  onView,
  resume,
}: {
  sky: TonightView;
  resume?: MoonfallProgress | undefined;
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
        if (resume) {
          created.select(resume.eva);
          created.project(resume.mapped, true);
          if (resume.station !== null) created.stopAt(resume.station);
          else created.seek(resume.meters);
        }
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
  }, [sky, onView, attempt, resume]);

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
  const { eva, flying, meters, playing, station } = useSyncExternalStore(view.subscribe, view.read);
  const id = useId();
  const navigation = useStoryNavigation();
  const route = traverses[eva]!;
  const length = Math.round(route.km * 1000);
  const stop = station === null ? null : route.stations[station];
  const note = stop && lunarStationNotes[stop.name];
  const kept = !!navigation?.library.saved.some(
    ({ id, position }) =>
      id === "moonfall" && position.sky?.lunar?.eva === eva && position.sky.lunar.station === station,
  );
  useStoryCompletion(!flying && !playing && meters >= length);
  const distance = `${km.format(meters / 1000)} of ${km.format(route.km)} km`;
  const act = (update: () => void) => {
    update();
    wake();
  };
  return (
    <>
      <div className="moonfall-finding">
        <h3>
          {flying
            ? "Toward the Moon."
            : (stop?.name ?? (meters <= 0 ? "Landing site" : "Along the traverse"))}
        </h3>
        <p className="moonfall-description">
          {flying
            ? "The approach leads to the Apollo 17 landing site."
            : `Apollo 17 · ${route.day} 1972 · Traverse ${eva + 1} to ${route.title}`}
        </p>
        {note && !flying && (
          <div className="moonfall-station-note">
            <p>{note.text}</p>
            <a href={note.journal} target="_blank" rel="noreferrer">
              Read the mission journal
            </a>
          </div>
        )}
        {stop && navigation && !flying && (
          <div className="observatory-actions moonfall-actions">
            <button
              type="button"
              disabled={kept}
              onClick={() => {
                const visit = navigation.current();
                if (visit) navigation.library.save(visit);
              }}
            >
              {kept ? "Stop kept" : "Keep this stop"}
            </button>
          </div>
        )}
      </div>
      <div className="observatory-actions moonfall-actions">
        <button
          type="button"
          className={flying ? "observatory-primary" : undefined}
          data-moonfall-replay={!flying || undefined}
          onClick={() => act(flying ? view.skip : view.replay)}
        >
          {flying ? "Skip descent" : "Replay descent"}
        </button>
      </div>
      {!flying && (
        <>
          <label className="tonight-city">
            Rover traverse
            <select
              value={eva}
              onChange={(event) => act(() => view.select(Number(event.currentTarget.value)))}
            >
              {traverses.map(({ title }, i) => (
                <option key={title} value={i}>
                  {i + 1} · {title}
                </option>
              ))}
            </select>
          </label>
          <label className="tonight-city">
            Geology stop
            <select
              value={station ?? ""}
              onChange={(event) => act(() => view.stopAt(Number(event.currentTarget.value)))}
            >
              <option value="" disabled>
                Inspect a stop
              </option>
              {route.stations.map(({ name }, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <StoryDock label="Rover playback">
            <div className="tonight-time moonfall-transport">
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
              <div className="observatory-actions moonfall-actions">
                <PlaybackButton
                  playing={playing}
                  ended={meters >= length}
                  onClick={() => act(view.toggleRoute)}
                />
              </div>
            </div>
          </StoryDock>
        </>
      )}
      <details className="tonight-objects">
        <summary>
          <span>Terrain &amp; routes</span>
        </summary>
        <p>
          Apollo 17 landed at 20.19° N, 30.77° E. Rover playback is paced by mapped distance. Elevations come
          from LRO stereo imagery registered to laser altimetry. The descent and low-angle light are
          illustrative. Haase and colleagues reconstructed the paths and stops from the mission map, surface
          photographs, and orbital images.
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
