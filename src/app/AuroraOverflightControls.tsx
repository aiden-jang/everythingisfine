import { useRef } from "react";
import type { useAuroraOverflight } from "./useAuroraOverflight";

export function AuroraOverflightControls({
  aurora,
  ready,
  solar,
  onReturn,
  onSunWatch,
}: {
  aurora: ReturnType<typeof useAuroraOverflight>;
  ready: boolean;
  solar: boolean;
  onSunWatch: () => void;
  onReturn: () => void;
}): JSX.Element {
  const primary = useRef<HTMLButtonElement>(null);
  const other = aurora.routes.find((route) => route.hemisphere !== aurora.run?.route.hemisphere);
  return (
    <div className="aurora-overflight">
      <div className="observatory-actions" role="group" aria-label="After Dark views">
        <button
          ref={primary}
          type="button"
          className="observatory-primary"
          disabled={!ready || (!aurora.run && aurora.unavailable !== null)}
          onClick={() => {
            if (solar) onSunWatch();
            if (aurora.run) aurora.replay();
            else aurora.start();
          }}
        >
          {aurora.run ? "Replay flight" : "Follow the aurora"}
        </button>
        <button type="button" onClick={onSunWatch} aria-expanded={solar} data-sun-toggle="">
          {solar ? "Back to stars" : "Sun Watch"}
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
      ) : aurora.unavailable && !solar ? (
        <p className="observatory-summary" role="status">
          {aurora.unavailable}
        </p>
      ) : null}
    </div>
  );
}
