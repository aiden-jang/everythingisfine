import { storyShare } from "../observations/storyShare";
import type { StoryMoment } from "../observations/storyMoment";
import { pressureAt, stations, timeIso, timeLabel } from "./tongaTimeline";

export function pressureShare(moment: StoryMoment, href: string) {
  const fallback = storyShare(moment, href);
  const station = stations.find(({ id }) => id === moment.choice);
  if (moment.id !== "tonga" || !station || moment.at === undefined) return fallback;
  const minute = Math.floor((moment.at - Date.parse(timeIso(0))) / 60_000);
  const value = pressureAt(station, minute);
  if (value === null) return fallback;
  const url = new URL(
    storyShare({ ...moment, at: Date.parse(timeIso(minute)), chapter: "pressure" }, href).url,
  );
  url.pathname = `/share/tonga/${station.id}/${minute}/`;
  url.search = "";
  return {
    url: url.href,
    title: `Tonga’s shockwave, recorded in ${station.name}.`,
    text: `${value.toFixed(2)} hPa at ${timeLabel(minute)} UTC on 15 January 2022. One-minute station pressure from ASOS / Iowa Environmental Mesonet.`,
  };
}

export function pressureMoment(pathname: string): StoryMoment | undefined {
  const match = /^\/share\/tonga\/([A-Z]+)\/(\d{1,4})\/?$/.exec(pathname);
  if (!match) return;
  const station = stations.find(({ id }) => id === match[1]);
  const minute = Number(match[2]);
  if (!station || pressureAt(station, minute) === null) return;
  return {
    id: "tonga",
    at: Date.parse(timeIso(minute)),
    choice: station.id,
    chapter: "pressure",
    map: false,
  };
}
