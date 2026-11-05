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
      ? "Waiting for NOAA’s forecast…"
      : !current
        ? "A current NOAA forecast is unavailable."
        : routes.length === 0
          ? "This forecast has no aurora on the dark side."
          : null;

  return {
    run,
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
