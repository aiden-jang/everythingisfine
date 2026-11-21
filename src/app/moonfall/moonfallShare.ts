import { localNight, openingSky } from "../../geo/tonight";
import { lunarTraverses } from "../../sources/moonfall/traverses";
import { storyShare } from "../observations/storyShare";
import { readStoryMoment, type StoryMoment } from "../observations/storyMoment";
import { skyCities } from "../tonight/cities";
import { skyStoryMoment } from "../tonight/skyMoment";

export function moonfallShare(moment: StoryMoment, href: string) {
  const fallback = storyShare(moment, href);
  const lunar = moment.sky?.lunar;
  if (moment.id !== "moonfall" || !lunar || lunar.station === null) return fallback;
  const traverse = lunarTraverses[lunar.eva];
  const stop = traverse?.stations[lunar.station];
  if (!stop) return fallback;
  const url = new URL(fallback.url);
  url.pathname = `/share/moonfall/${lunar.eva + 1}/${lunar.station + 1}/`;
  url.search = "";
  return {
    url: url.href,
    title: `${stop} · Apollo 17 · meanwhile.`,
    text: `Open ${stop} on traverse ${lunar.eva + 1} to ${traverse.title}, ${traverse.day} 1972.`,
  };
}

export function moonfallMoment(
  pathname: string,
  params: URLSearchParams,
  now: number,
): StoryMoment | undefined {
  const route = /^\/share\/moonfall\/([1-3])\/([1-4])\/?$/.exec(pathname);
  if (!route) return;
  const eva = Number(route[1]) - 1;
  const station = Number(route[2]) - 1;
  if (!lunarTraverses[eva]?.stations[station]) return;

  const linked = readStoryMoment(params);
  const lunar = linked?.sky?.lunar;
  if (linked?.id === "moonfall" && lunar?.eva === eva && lunar.station === station) return linked;

  const city = skyCities[0]!;
  const night = localNight(city, now);
  const sky = openingSky(city, night.start, night.end);
  return skyStoryMoment("moonfall", {
    city: city.name,
    at: sky.at,
    look: sky.look,
    nightStart: night.start,
    lunar: { eva, station, meters: 0, mapped: true },
  });
}
