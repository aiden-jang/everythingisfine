import { useLayoutEffect, useRef } from "react";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import { SkyCityPicker, type SkyCityPreference } from "./tonight/SkyCityPicker";
import { meteorDate, nextMeteor } from "./tonight/meteorCalendar";

export function AuroraOverflightControls({
  aurora,
  ready,
  solar,
  onReturn,
  returnLabel = "Back to stars",
  onSunWatch,
  onTonight,
  city,
}: {
  aurora: ReturnType<typeof useAuroraOverflight>;
  ready: boolean;
  solar: boolean;
  onSunWatch: () => void;
  onTonight: () => void;
  city: SkyCityPreference;
  onReturn: () => void;
  returnLabel?: string | undefined;
}): JSX.Element {
  const primary = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!aurora.run) return;
    const frame = requestAnimationFrame(() => primary.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [aurora.run]);
  const other = aurora.routes.find((route) => route.hemisphere !== aurora.run?.route.hemisphere);
  const next = nextMeteor(Date.now());
  return (
    <div className="aurora-overflight">
      <div className="observatory-actions" role="group" aria-label="After Dark views">
        <button
          ref={primary}
          id="open-aurora-overflight"
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
        <button type="button" id="open-tonight-sky" onClick={onTonight} disabled={!ready}>
          Tonight’s Sky
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
            <button type="button" onClick={onReturn}>
              {returnLabel}
            </button>
          </>
        )}
      </div>
      {!solar && !aurora.run && (
        <div className="after-dark-city">
          <SkyCityPicker city={city.name} select={city.select} />
          {next && (
            <p className="observation-note">
              Next meteor viewing night · {next.name} · {meteorDate.format(Date.parse(next.day))}
            </p>
          )}
        </div>
      )}
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
