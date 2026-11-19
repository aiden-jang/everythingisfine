export function ObservatoryEntryActions({ explore, browse }: { explore: () => void; browse: () => void }) {
  return (
    <div className="observatory-actions observatory-entry-actions">
      <button type="button" className="observatory-primary" onClick={explore}>
        Explore the globe
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="m5 15 10-10M5 5h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button type="button" id="browse-stories" onClick={browse}>
        Browse stories
      </button>
    </div>
  );
}
