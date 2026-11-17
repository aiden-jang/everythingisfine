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
  onRestoreOval,
  onTonight,
  city,
}: {
  aurora: ReturnType<typeof useAuroraOverflight>;
  ready: boolean;
  solar: boolean;
  onSunWatch: () => void;
  onRestoreOval: () => void;
  onTonight: () => void;
  city: SkyCityPreference;
  onReturn: () => void;
  returnLabel?: string | undefined;
}): JSX.Element {
  const primary = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!aurora.run || aurora.run.held || solar) return;
    const frame = requestAnimationFrame(() => primary.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [aurora.run, solar]);
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
            if (solar) {
              if (!aurora.run) aurora.start();
              onRestoreOval();
            } else if (aurora.run) aurora.replay();
            else aurora.start();
          }}
        >
          {solar && aurora.run ? "Back to the oval" : aurora.run ? "Replay flight" : "Follow the aurora"}
        </button>
        <button type="button" id="open-tonight-sky" onClick={onTonight} disabled={!ready}>
          Tonight’s Sky
        </button>
        {aurora.run && !solar && (
          <>
            <button type="button" id="visit-sun-watch" onClick={onSunWatch}>
              Visit Sun Watch
            </button>
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
      {aurora.run && !solar ? (
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
          {aurora.forecastAt && aurora.forecastAt !== aurora.run.forecast.forecastAt && (
            <button type="button" onClick={() => aurora.start(aurora.run?.route.hemisphere)}>
              Open latest forecast
            </button>
          )}
        </p>
      ) : aurora.unavailable && !solar ? (
        <p className="observatory-summary" role="status">
          {aurora.unavailable}
        </p>
      ) : null}
    </div>
  );
}
