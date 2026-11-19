import "./wordmark.css";

export function Wordmark({ onHome }: { onHome: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label="meanwhile. Earth, ocean & sky, back to the Observatory"
      className="wordmark"
    >
      <span className="wordmark-name">meanwhile.</span>
    </button>
  );
}
