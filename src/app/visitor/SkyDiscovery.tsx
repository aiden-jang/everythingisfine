import { useMemo } from "react";
import { localNight, openingSky, type SkyCity } from "../../geo/tonight";
import { useStoryNavigation } from "../journeys/StoryNavigation";

export function SkyDiscovery({ city, now }: { city: SkyCity; now: number }) {
  const navigation = useStoryNavigation();
  const sky = useMemo(() => {
    const night = localNight(city, now);
    const view = openingSky(city, night.start, night.end);
    const visible = view.bodies.filter(({ altitude }) => altitude > 5).map(({ name }) => name);
    return { at: view.at, look: view.look, names: visible.slice(0, 3).join(", ") };
  }, [city, now]);
  const local = new Intl.DateTimeFormat("en", {
    timeZone: city.zone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(sky.at);
  if (!navigation) return null;
  return (
    <button
      type="button"
      onClick={() =>
        navigation.resume({
          id: "sky",
          seen: now,
          position: { sky: { city: city.name, at: sky.at, look: sky.look } },
        })
      }
      disabled={!!navigation.unavailable("sky")}
    >
      <span>
        {sky.names ? `${sky.names} above ${city.name}` : `Tonight in ${city.name}`}
        <span aria-hidden="true">→</span>
      </span>
      <small>
        {local} local · calculated for a level horizon. Clouds and local obstructions are not included.
      </small>
    </button>
  );
}
