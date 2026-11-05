import { useRef } from "react";
import type { useAuroraOverflight } from "./useAuroraOverflight";

export function AuroraOverflightControls({
  aurora,
  ready,
  onReturn,
}: {
  aurora: ReturnType<typeof useAuroraOverflight>;
  ready: boolean;
  onReturn: () => void;
}): JSX.Element {
  const primary = useRef<HTMLButtonElement>(null);
  const other = aurora.routes.find((route) => route.hemisphere !== aurora.run?.route.hemisphere);
  return (
    <div className="aurora-overflight">
      <div className="observatory-actions" role="group" aria-label="Aurora overflight">
        <button
          ref={primary}
          type="button"
          className="observatory-primary"
          disabled={!ready || (!aurora.run && aurora.unavailable !== null)}
          onClick={() => (aurora.run ? aurora.replay() : aurora.start())}
        >
          {aurora.run ? "Replay flight" : "Follow the aurora"}
        </button>
        {aurora.run && (
          <>
            {other && (
              <button
                type="button"
                onClick={() => {
                  aurora.start(other.hemisphere);
                  primary.current?.focus({ preventScroll: true });
                }}
              >
                {other.hemisphere === 1 ? "Northern oval" : "Southern oval"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onReturn();
                primary.current?.focus({ preventScroll: true });
              }}
            >
              Back to stars
            </button>
          </>
        )}
      </div>
      {aurora.run ? (
        <p className="observatory-summary">
          <a
            href="https://www.spaceweather.gov/products/aurora-30-minute-forecast"
            target="_blank"
            rel="noreferrer"
          >
            NOAA OVATION forecast
          </a>
          {" · "}
          {aurora.run.route.hemisphere === 1 ? "Northern oval" : "Southern oval"}
        </p>
      ) : aurora.unavailable ? (
        <p className="observatory-summary" role="status">
          {aurora.unavailable}
        </p>
      ) : null}
    </div>
  );
}
