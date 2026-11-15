import "./wordmark.css";

export function Wordmark({ onHome }: { onHome: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label="Everything is fine. Earth, ocean & sky, back to the Observatory"
      className="wordmark"
    >
      <span className="wordmark-name">
        Everything
        <br />
        is fine.
      </span>
    </button>
  );
}
