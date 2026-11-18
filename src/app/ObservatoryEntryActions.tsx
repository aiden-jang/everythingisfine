import { useStoryNavigation } from "./journeys/StoryNavigation";

export function ObservatoryEntryActions({
  solar,
  explore,
  browse,
  closeSun,
  fromOval,
}: {
  solar: boolean;
  explore: () => void;
  browse: () => void;
  closeSun: () => void;
  fromOval: boolean;
}) {
  const navigation = useStoryNavigation();
  return (
    <div className="observatory-actions observatory-entry-actions">
      <button type="button" className="observatory-primary" onClick={explore}>
        Explore the globe
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="m5 15 10-10M5 5h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {!solar && (
        <button type="button" id="browse-stories" onClick={browse}>
          Browse stories
        </button>
      )}
      {solar && !fromOval && (
        <button type="button" id="back-to-stars" onClick={closeSun}>
          {navigation?.returnLabel ?? "Back to stars"}
        </button>
      )}
    </div>
  );
}
