import "./wordmark.css";

export function Wordmark({ onHome }: { onHome: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label="Everything is fine. Earth, ocean & sky, back to the Observatory"
      className="wordmark"
    >
      <img src="/icon.svg" alt="" width="32" height="32" />
      <span className="wordmark-copy">
        <span className="wordmark-name">Everything is fine.</span>
        <span className="wordmark-context" aria-hidden="true">
          Earth, ocean &amp; sky
        </span>
      </span>
    </button>
  );
}
