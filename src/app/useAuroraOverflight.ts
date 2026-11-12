import { useMemo } from "react";
import type { Aurora } from "../sources/aurora";
import { auroraRoutes, currentForecast, type AuroraRun, type Hemisphere } from "../sources/auroraRoute";
import type { LayerAnswer } from "./feedStatus";

export function useAuroraOverflight(
  forecast: Aurora | null,
  answer: LayerAnswer,
  active: { run: AuroraRun | null; setRun: (run: AuroraRun | null) => void },
  enabled: boolean,
  now: number,
) {
  const { run, setRun } = active;
  const current = enabled && forecast !== null && currentForecast(forecast, now) ? forecast : null;
  const routes = useMemo(() => (current ? auroraRoutes(current) : []), [current]);
  const unavailable = !enabled
    ? "Return to live Earth for the current forecast."
    : answer === "pending"
      ? "Loading NOAA’s aurora forecast…"
      : !forecast
        ? "NOAA’s aurora forecast is unavailable."
        : forecast.estimatedTime
          ? "Forecast time unavailable."
          : !current
            ? forecast.forecastAt < now
              ? "The latest aurora forecast has expired."
              : "The forecast is too far ahead for this view."
            : routes.length === 0
              ? "No forecast aurora on Earth’s night side."
              : null;

  return {
    run,
    forecastAt: current?.forecastAt,
    unavailable,
    routes,
    start(hemisphere?: Hemisphere) {
      const route =
        hemisphere === undefined ? routes[0] : routes.find((entry) => entry.hemisphere === hemisphere);
      if (route && current) setRun({ forecast: current, route });
    },
    replay() {
      if (run) setRun({ ...run });
    },
  };
}
