import { lunarTraverses } from "../../sources/moonfall/traverses";
import type { Visit } from "./library";
import { searchStories } from "../storyIndex";
import { layerTime } from "../layerTime";
import tonga from "../tonga/tonga.json";
import { skyCities } from "../tonight/cities";
import { skyBodies } from "../../geo/tonight";
import { globalRadarRegions, radarRegions, isGlobalRadar } from "../radar/radarCamera";

export interface VisitEvidence {
  title: string;
  place: string;
  time: string;
  kind: string;
  reading: string;
  detail: string;
  source: string;
  url: string;
  trace?: { values: number[]; selected: number; unit: string; start: string; end: string };
}

export function visitEvidence(visit: Visit): VisitEvidence {
  const title = searchStories.find(({ id }) => id === visit.id)?.title ?? visit.id;
  const base = {
    title,
    place: "Saved view",
    time: "Latest available on reopening",
    kind: "View",
    reading: "A place to return to",
    detail: "Playback settings kept on this device.",
    source: "meanwhile.",
    url: "https://everythingisfine.aidenjang.com/",
  };
  if (visit.observation && visit.position.float) {
    const o = visit.observation;
    const [, wmo, cycle] = visit.position.float.profile.split("/");
    return {
      ...base,
      kind: "Measured profile",
      place: `Argo ${wmo} · cycle ${cycle}`,
      time: layerTime(o.at),
      reading: `${o.temperature.toFixed(2)} °C`,
      detail: `${Math.round(o.depth).toLocaleString()} m · ${o.salinity.toFixed(3)} salinity. Depth estimated from pressure.`,
      source: "Argo / Marine Institute",
      url: "https://doi.org/10.17882/42182",
    };
  }
  const moment = visit.position.moment;
  if (visit.id === "tonga" && moment?.at !== undefined) {
    const station = tonga.stations.find(({ id }) => id === moment.choice);
    const minute = Math.floor((moment.at - Date.parse(`${tonga.date}T00:00:00Z`)) / 60_000);
    const index = station ? minute - station.start : -1;
    const raw = station?.values[index];
    if (station && raw != null) {
      const values = station.values.map((v) => (v * 33.8638867) / 1000);
      const time = (m: number) => layerTime(Date.parse(`${tonga.date}T00:00:00Z`) + m * 60_000);
      return {
        ...base,
        kind: "Measured station pressure",
        place: station.name,
        time: time(minute),
        reading: `${values[index]!.toFixed(2)} hPa`,
        detail:
          "One-minute station reading. The expanding wave is an illustration; this pressure is measured.",
        source: "ASOS / Iowa Environmental Mesonet",
        url: "https://mesonet.agron.iastate.edu/request/asos/1min.phtml",
        trace: {
          values,
          selected: index,
          unit: "hPa",
          start: time(station.start),
          end: time(station.start + values.length - 1),
        },
      };
    }
    return {
      ...base,
      time: layerTime(moment.at),
      place: station?.name ?? "Hunga Tonga–Hunga Haʻapai",
      detail: "No station reading at this saved time. Reopen the journey to inspect the available record.",
    };
  }
  const solar = visit.position.solar;
  if (solar)
    return {
      ...base,
      kind: "Spacecraft observation",
      time: layerTime(solar.at),
      place: "Solar wind upstream of Earth",
      reading: `${solar.value} km/s`,
      detail: solar.density === null ? "Proton speed" : `Proton speed · ${solar.density} p/cm³`,
      source: `NOAA · ${solar.source}`,
      url: "https://www.swpc.noaa.gov/products/solar-wind",
    };
  const sky = visit.position.sky;
  if (sky && !sky.lunar) {
    const city = skyCities.find(({ name }) => name === sky.city);
    const moon = city ? skyBodies(city, sky.at).find(({ name }) => name === "Moon") : undefined;
    return {
      ...base,
      kind: "Calculated sky",
      place: sky.city,
      time: layerTime(sky.at),
      reading: moon ? `Moon ${moon.altitude.toFixed(1)}°` : "Saved sky direction",
      detail: moon
        ? `Altitude above the horizon · ${moon.lit}% illuminated. Calculated positions, not a weather or visibility forecast.`
        : "The city, time and viewing direction are kept.",
      source: "meanwhile. · lunar model",
      url: "https://github.com/aiden-jang/everythingisfine/blob/main/src/geo/moon.ts",
    };
  }
  const radar = visit.position.radar;
  if (radar) {
    const global = isGlobalRadar(radar.region);
    return {
      ...base,
      kind: "Saved scan time",
      place: [...globalRadarRegions, ...radarRegions].find(({ id }) => id === radar.region)?.name ?? "World",
      time: radar.at === undefined ? "Latest available on reopening" : layerTime(radar.at),
      reading: "Storm Radar",
      detail:
        "The scan time and coverage are kept, not the radar image. Expired scans reopen the nearest available scan.",
      source: global ? "RainViewer" : "NOAA / National Weather Service",
      url: global ? "https://www.rainviewer.com/" : "https://radar.weather.gov/",
    };
  }
  return {
    ...base,
    ...(moment?.at !== undefined ? { time: layerTime(moment.at) } : {}),
    ...(sky?.lunar
      ? {
          place: "Apollo 17",
          time: "December 1972",
          kind: "Mapped rover route",
          reading:
            lunarTraverses[sky.lunar.eva]?.stations[sky.lunar.station ?? -1] ??
            `Traverse ${sky.lunar.eva + 1}`,
          source: "Haase et al. · Apollo 17 traverse reconstruction",
          url: "https://doi.org/10.1029/2018EA000408",
          detail: `${Math.round(sky.lunar.meters).toLocaleString()} m along the recorded rover route.`,
        }
      : {}),
  };
}
