import { useEffect, useMemo, useState } from "react";
import catalogue from "../geo/waveCities.json?url";
import type { Quake } from "../data/types";
import { MAX_KM } from "./arrival";
import { nearbyWaveRoutes, type WaveCity, type WaveRoute } from "./waveReplay";

export type FollowWave = (key: string, route: WaveRoute, trigger: HTMLButtonElement) => void;

export function WaveChooser({ quake, onFollow }: { quake: Quake; onFollow: FollowWave }): JSX.Element {
  const [requested, setRequested] = useState(false);
  const [cities, setCities] = useState<readonly WaveCity[] | "error" | null>(null);
  const [choice, setChoice] = useState(0);

  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    void fetch(catalogue, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("City catalogue unavailable");
        return response.json() as Promise<WaveCity[]>;
      })
      .then((rows) => setCities(rows))
      .catch(() => {
        if (!controller.signal.aborted) {
          setCities("error");
          setRequested(false);
        }
      });
    return () => controller.abort();
  }, [requested]);

  const { lon, lat, depthKm } = quake.primary;
  const routes = useMemo(
    () => (cities && cities !== "error" ? nearbyWaveRoutes({ lon, lat, depthKm }, cities) : []),
    [cities, lon, lat, depthKm],
  );
  const route = routes[choice] ?? routes[0];
  return (
    <details
      className="mt-4 border-t border-hairline pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open && cities === null) setRequested(true);
      }}
    >
      <summary className="disclose min-h-11 cursor-pointer py-3 text-xs font-semibold text-ink">
        Follow the wave
      </summary>
      <div className="mt-1">
        <p className="text-xs leading-relaxed text-dim">
          Watch the estimated P and S arrivals at a nearby city.
        </p>
        {route ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-xs text-dim">
              <span>City</span>
              <select
                value={routes.indexOf(route)}
                onChange={(event) => setChoice(Number(event.currentTarget.value))}
                className="mt-1 min-h-11 w-full cursor-pointer border border-hairline bg-raised px-2 text-xs text-ink"
              >
                {routes.map((option, index) => (
                  <option key={index} value={index}>
                    {option.city.name} · {Math.round(option.km)} km
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={(event) => onFollow(quake.key, route, event.currentTarget)}
              className="min-h-11 cursor-pointer border border-hairline px-3 text-xs font-semibold text-ink hover:bg-raised"
            >
              Play wave
            </button>
          </div>
        ) : cities === "error" ? (
          <button
            type="button"
            onClick={() => {
              setCities(null);
              setRequested(true);
            }}
            className="mt-2 min-h-11 cursor-pointer text-xs text-ink underline underline-offset-2"
          >
            Cities couldn’t load. Try again
          </button>
        ) : (
          <p className="mt-2 text-xs text-dim" role="status">
            {cities ? `No cities in the catalogue within ${MAX_KM} km.` : "Looking up nearby cities…"}
          </p>
        )}
      </div>
    </details>
  );
}
