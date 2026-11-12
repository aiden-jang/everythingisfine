import { lazy, Suspense } from "react";
import type { Stop } from "../tour";
import { SOURCE_NAMES, place } from "../format";
import type { SkyCity } from "../../geo/tonight";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import type { useAuroraOverflight } from "../useAuroraOverflight";
import "./visitor.css";

const SkyDiscovery = lazy(() =>
  import("./SkyDiscovery").then(({ SkyDiscovery }) => ({ default: SkyDiscovery })),
);

export interface DiscoveriesData {
  now: number;
  quake: Stop | null;
  inspect: (key: string) => void;
}
export function recentHighlight(stop: Stop | null, now: number) {
  const reading = stop?.reading;
  if (!stop?.key || !reading || reading.time > now || now - reading.time > 86_400_000) return null;
  return {
    key: stop.key,
    title: `${reading.scale || "M"} ${reading.magnitude.toFixed(1)} near ${place(reading.place)}`,
    note: `${SOURCE_NAMES[reading.source]} · ${new Date(reading.time).toISOString().slice(0, 16).replace("T", " ")} UTC · largest displayed earthquake in your current filters`,
  };
}
export function Discoveries({
  data,
  aurora,
  city,
}: {
  data: DiscoveriesData;
  aurora: ReturnType<typeof useAuroraOverflight>;
  city: SkyCity;
}) {
  const navigation = useStoryNavigation();
  const quake = recentHighlight(data.quake, data.now);
  if (!navigation) return null;
  return (
    <section className="discovery-list" aria-label="Worth looking at today">
      <h3>Worth looking at today</h3>
      {quake && (
        <button type="button" onClick={() => data.inspect(quake.key)}>
          <span>
            {quake.title}
            <span aria-hidden="true">→</span>
          </span>
          <small>{quake.note}</small>
        </button>
      )}
      {!aurora.unavailable && aurora.forecastAt !== undefined && (
        <button
          type="button"
          onClick={() => navigation.open("aurora", "open-observations")}
          disabled={!!navigation.unavailable("aurora")}
        >
          <span>
            Follow the current aurora forecast<span aria-hidden="true">→</span>
          </span>
          <small>
            NOAA OVATION · forecast for{" "}
            {new Date(aurora.forecastAt).toISOString().slice(0, 16).replace("T", " ")} UTC. A model
            prediction, not a sighting.
          </small>
        </button>
      )}
      <Suspense fallback={<p>Calculating the sky above {city.name}…</p>}>
        <SkyDiscovery city={city} now={data.now} />
      </Suspense>
    </section>
  );
}
