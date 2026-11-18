import { lunarTraverses } from "../../sources/moonfall/traverses";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { searchStories } from "../storyIndex";
import { savedVisitKey, type Visit } from "./library";
import "./visitor.css";
import { layerTime } from "../layerTime";
import { useRef } from "react";

const title = (id: string) => searchStories.find((story) => story.id === id)?.title ?? id;
export function visitNote(visit: Visit) {
  if (visit.observation) {
    const { at, depth, temperature, salinity } = visit.observation;
    return `${layerTime(at)} · ${Math.round(depth).toLocaleString()} m · ${temperature.toFixed(2)} °C · ${salinity.toFixed(3)} salinity`;
  }
  const solar = visit.position.solar;
  if (solar) return `${solar.value} km/s · ${solar.source} · ${layerTime(solar.at)}`;
  const lunar = visit.position.sky?.lunar;
  if (lunar)
    return `${lunarTraverses[lunar.eva]?.stations[lunar.station ?? -1] ?? `Traverse ${lunar.eva + 1}`} · Apollo 17, 1972`;
  if (visit.position.sky) return `${visit.position.sky.city} · saved sky`;
  const moment = visit.position.moment;
  if (visit.id === "rupture" && moment?.chapter === "waves" && moment.at !== undefined)
    return `Recorded waves · ${new Date(moment.at).toISOString().slice(11, 19)} UTC`;
  if (visit.id === "megaflash" && moment?.chapter === "inspect" && moment.at !== undefined)
    return `Optical detections · ${((moment.at - Date.parse("2017-10-22T08:56:45.834Z")) / 1000).toFixed(2)} s`;
  if (visit.id === "kilauea" && moment?.chapter === "compare")
    return `Kapoho Bay · Shoreline divider at ${moment.choice ?? "50"}%`;
  const at = moment?.at ?? visit.position.radar?.at;
  if (at !== undefined) return layerTime(at);
  if (visit.position.float) return "Saved float profile and depth";
  return "Opens the latest available view";
}
export function VisitShelf() {
  const feedback = useRef<HTMLDivElement>(null);
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  const { library } = navigation;
  const row = (visit: Visit, saved: boolean) => (
    <div className="visit-row" key={saved ? savedVisitKey(visit) : visit.id}>
      <button
        type="button"
        onClick={() => navigation.resume(visit)}
        disabled={!!navigation.unavailable(visit.id)}
      >
        <span>
          {title(visit.id)}
          <span aria-hidden="true">→</span>
        </span>
        <small>{navigation.unavailable(visit.id) ?? visitNote(visit)}</small>
        {(visit.note || visit.observation?.note) && (
          <small className="visit-observation-note">{visit.note ?? visit.observation?.note}</small>
        )}
      </button>
      {saved && (
        <button
          type="button"
          aria-label={`Remove saved ${title(visit.id)}`}
          onClick={() => library.remove(savedVisitKey(visit))}
        >
          Remove
        </button>
      )}
    </div>
  );
  return (
    <section className="visit-shelf" aria-label="Your visits">
      {!library.recent.length && !library.saved.length && (
        <p>Stories you open and views you save will appear here, only on this device.</p>
      )}
      {library.recent.length > 0 && (
        <>
          <h3>Pick up where you left off</h3>
          {library.recent.slice(0, 2).map((visit) => row(visit, false))}
        </>
      )}
      <details>
        <summary>Saved views ({library.saved.length})</summary>
        {library.saved.length ? (
          library.saved.map((visit) => row(visit, true))
        ) : (
          <p>Use Save view in a story to keep it here.</p>
        )}
        <p>Only on this device.</p>
        {library.recent.length > 0 && (
          <button type="button" onClick={library.clearRecent}>
            Clear recent visits
          </button>
        )}
      </details>
      <div ref={feedback} className="visit-feedback" tabIndex={-1}>
        <span role="status" aria-label="Visit library status">
          {library.notice}
        </span>
        {library.canUndo && (
          <button
            type="button"
            onClick={() => {
              library.undo();
              feedback.current?.focus({ preventScroll: true });
            }}
          >
            Undo
          </button>
        )}
      </div>
    </section>
  );
}
export function SaveVisit() {
  const navigation = useStoryNavigation();
  if (!navigation?.active || ["float", "tonga", "sun"].includes(navigation.active)) return null;
  const lunar = navigation.active === "moonfall" ? navigation.current()?.position.sky?.lunar : undefined;
  if (lunar && lunar.station !== null) return null;
  return (
    <div className="visit-save">
      <button
        type="button"
        onClick={() => {
          const visit = navigation.current();
          const previous =
            visit && navigation.library.saved.find((entry) => savedVisitKey(entry) === savedVisitKey(visit));
          if (visit)
            navigation.library.save({ ...visit, ...(previous?.note ? { note: previous.note } : {}) });
        }}
      >
        {navigation.library.saved.some((entry) => savedVisitKey(entry) === navigation.active)
          ? "Update saved view"
          : "Save view"}
      </button>
      <span role="status" aria-label="Saved view status">
        {navigation.library.notice}
      </span>
    </div>
  );
}
