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
  const recent = navigation?.library.recent[0];
  const kept = navigation?.library.saved.find((entry) => entry.id === recent?.id && entry.observation);
  const visit = kept ?? recent;
  const invitation = navigation?.invitation;
  return (
    <div className="observatory-actions observatory-entry-actions">
      <button
        type="button"
        id={landing ? "follow-story" : undefined}
        disabled={landing && !!navigation?.unavailable(visit?.id ?? invitation?.id ?? "float")}
        onClick={
          landing
            ? () => {
                if (visit) navigation?.resume(visit, "follow-story", !kept);
                else if (invitation) navigation?.open(invitation.id, "follow-story");
              }
            : explore
        }
        className="observatory-primary"
      >
        {landing ? (visit ? "Return to your story" : "Follow this story") : "Explore the globe"}
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
