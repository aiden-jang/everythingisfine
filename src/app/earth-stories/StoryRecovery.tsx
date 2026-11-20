export function StoryRecovery({
  reefRecent,
  retry,
  archive,
  holding = false,
}: {
  reefRecent: boolean;
  retry: () => void;
  archive: () => void;
  holding?: boolean;
}) {
  return (
    <div className="observation-note" role="status">
      <p>
        {reefRecent ? "Recent reef data unavailable." : "The selected data could not load."}
        {holding && " Showing the previous observations."}
      </p>
      <div className="observatory-actions observation-chapters">
        <button type="button" onClick={retry}>
          Try again
        </button>
        {reefRecent && (
          <button type="button" onClick={archive}>
            Open 2023 archive
          </button>
        )}
      </div>
    </div>
  );
}
