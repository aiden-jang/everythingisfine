import { useStoryNavigation } from "../journeys/StoryNavigation";
import { searchStories } from "../storyIndex";
import type { Visit } from "./library";
import "./visitor.css";

const title = (id: string) => searchStories.find((story) => story.id === id)?.title ?? id;
export function visitNote(visit: Visit) {
  if (visit.position.sky?.lunar) return `Traverse ${visit.position.sky.lunar.eva + 1} · Apollo 17, 1972`;
  if (visit.position.sky) return `${visit.position.sky.city} · saved sky`;
  const at = visit.position.moment?.at ?? visit.position.radar?.at;
  if (at !== undefined) return `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  if (visit.position.float) return "Saved float profile and depth";
  return "Opens the latest available view";
}
export function VisitShelf() {
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  const { library } = navigation;
  if (!library.recent.length && !library.saved.length) return null;
  const row = (visit: Visit, saved: boolean) => (
    <div className="visit-row" key={visit.id}>
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
      </button>
      {saved && (
        <button
          type="button"
          aria-label={`Remove saved ${title(visit.id)}`}
          onClick={() => library.remove(visit.id)}
        >
          Remove
        </button>
      )}
    </div>
  );
  return (
    <section className="visit-shelf" aria-label="Your visits">
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
      <span role="status" aria-label="Visit library status">
        {library.notice}
      </span>
    </section>
  );
}
export function SaveVisit() {
  const navigation = useStoryNavigation();
  if (!navigation?.active) return null;
  return (
    <div className="visit-save">
      <button
        type="button"
        onClick={() => {
          const visit = navigation.current();
          if (visit) navigation.library.save(visit);
        }}
      >
        {navigation.library.saved.some(({ id }) => id === navigation.active)
          ? "Update saved view"
          : "Save view"}
      </button>
      <span role="status" aria-label="Saved view status">
        {navigation.library.notice}
      </span>
    </div>
  );
}
