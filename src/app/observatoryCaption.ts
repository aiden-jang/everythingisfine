import { isGlobalRadar } from "./radar/radarCamera";
import type { useObservatory } from "./useObservatory";
import type { StillCaption } from "./still";
import { searchStories } from "./storyIndex";
import { earthStories, isEarthStory } from "./earth-stories/catalogue";
import { observations } from "./observations/catalogue";

type Observatory = ReturnType<typeof useObservatory>;
type CaptionView = Pick<Observatory, "observing" | "night"> & {
  radar: Pick<Observatory["radar"], "active" | "view">;
  tonight: Pick<Observatory["tonight"], "view">;
  floatDive: Pick<Observatory["floatDive"], "view">;
  observations: Pick<Observatory["observations"], "entry" | "view">;
  aurora: Pick<Observatory["aurora"], "run">;
};

const recordedSources: Partial<Record<NonNullable<CaptionView["observations"]["entry"]>, string>> = {
  rupture: "USGS finite fault / ShakeMap",
  katrina: "NOAA HURDAT2 best track",
  tonga: "NOAA GOES-17 / ground pressure observations",
  megaflash: "NOAA GOES-16 GLM · approximate pulse timing",
  kilauea: "USGS lava flow maps · 2018",
  lights: "NASA Black Marble HD",
  shadow: "NASA eclipse prediction · 2 August 2027",
};

const stamp = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export function observatoryCaption(
  view: CaptionView,
  displayedAt = Date.now(),
): Omit<StillCaption, "host"> | null {
  const caption = (title: string, moment: string, source: string) => ({
    subject: title,
    moment,
    verdict: null,
    filter: source,
    magnitudeScale: false,
  });
  if (!view.observing) return null;
  if (view.radar.active) {
    return caption(
      "Storm Radar",
      view.radar.view?.at === undefined ? "Scan unavailable" : stamp(view.radar.view.at),
      isGlobalRadar(view.radar.view?.region)
        ? "Weather data by RainViewer · observed radar composite"
        : "NOAA MRMS · radar reflectivity",
    );
  }
  const sky = view.tonight.view;
  if (sky?.moonfall) {
    const state = sky.moonfall.read();
    return caption(
      "Moonfall",
      `Apollo 17 · December 1972 · Traverse ${state.eva + 1}`,
      "LRO / USGS terrain · Haase et al. rover tracks",
    );
  }
  if (sky) return caption("Tonight’s Sky", stamp(sky.at), `${sky.city.name} · calculated sky positions`);
  const float = view.floatDive.view;
  if (float)
    return caption("Float Dive", stamp(float.profile.at), `Argo WMO ${float.profile.wmo} · schematic ascent`);
  const { entry, view: observation } = view.observations;
  if (entry && observation) {
    const title = searchStories.find((story) => story.id === entry)?.title ?? entry;
    const source = isEarthStory(entry)
      ? earthStories[entry].source
      : entry in observations
        ? observations[entry as keyof typeof observations].source
        : (recordedSources[entry] ?? "Recorded science story · sources in the app");
    return caption(title, observation.frame.timeLabel ?? stamp(observation.frame.at), source);
  }
  if (view.aurora.run)
    return caption(
      "Aurora Overflight",
      `Forecast for ${stamp(view.aurora.run.forecast.forecastAt)}`,
      "NOAA OVATION · modeled aurora probability",
    );
  if (view.night) return caption("After Dark", stamp(displayedAt), "Catalogue sky · calculated positions");
  return null;
}
