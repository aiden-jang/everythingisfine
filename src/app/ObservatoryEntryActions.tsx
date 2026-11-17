import { useStoryNavigation } from "./journeys/StoryNavigation";

export function ObservatoryEntryActions({
  landing,
  solar,
  explore,
  closeSun,
}: {
  landing: boolean;
  solar: boolean;
  explore: () => void;
  closeSun: () => void;
}) {
  const navigation = useStoryNavigation();
  return (
    <div className="observatory-actions observatory-entry-actions">
      <button
        type="button"
        onClick={landing ? () => navigation?.browse() : explore}
        className="observatory-primary"
      >
        {landing ? "Explore stories" : "Explore the globe"}
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="m5 15 10-10M5 5h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {landing && (
        <button type="button" onClick={explore}>
          Explore the layers
        </button>
      )}
      {solar && (
        <button type="button" id="back-to-stars" onClick={closeSun}>
          {navigation?.returnLabel ?? "Back to stars"}
        </button>
      )}
    </div>
  );
}
