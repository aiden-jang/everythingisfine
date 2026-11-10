import { useEffect, useState } from "react";

export function FullscreenButton(): JSX.Element | null {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const sync = () => setActive(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <>
      <button
        type="button"
        className="observatory-save observatory-fullscreen"
        aria-label={active ? "Exit fullscreen" : "Fullscreen"}
        aria-pressed={active}
        onClick={() => {
          setError(false);
          const task = document.fullscreenElement
            ? document.exitFullscreen()
            : document.querySelector("main")?.requestFullscreen();
          void task?.catch(() => setError(true));
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
        </svg>
        <span>{active ? "Exit fullscreen" : "Fullscreen"}</span>
      </button>
      {error && (
        <span role="status" className="fullscreen-error">
          Fullscreen is unavailable.
        </span>
      )}
    </>
  );
}
