export function StillNotice({
  message,
  download,
  dismiss,
}: {
  message: string | null;
  download: (() => void) | null;
  dismiss: () => void;
}): JSX.Element | null {
  if (!message) return null;
  return (
    <div className="still-notice" role="status">
      <p>{message}</p>
      <div className="flex flex-wrap gap-2">
        {download ? (
          <button type="button" onClick={download}>
            Download image
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            dismiss();
            const capture = document.getElementById("capture-still");
            (capture?.checkVisibility() ? capture : document.getElementById("utility-toggle"))?.focus();
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
