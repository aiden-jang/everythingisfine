import { lunarTraverses } from "../src/sources/moonfall/traverses.ts";
import { storyPreviewPage, storyPreviewPlugin } from "./story-preview-pages.mjs";

export function moonfallPages(shell) {
  return lunarTraverses.flatMap((traverse, eva) =>
    traverse.stations.map((stop, station) =>
      storyPreviewPage(shell, {
        path: `/share/moonfall/${eva + 1}/${station + 1}/`,
        title: `${stop} · Apollo 17`,
        description: `Explore ${stop} on Apollo 17 traverse ${eva + 1} to ${traverse.title}, ${traverse.day} 1972. Open the rover route paused at this stop.`,
        image: `/share/moonfall-${eva + 1}-${station + 1}.jpg`,
        alt: `Lunar Reconnaissance Orbiter imagery of Taurus–Littrow with Apollo 17 traverse ${eva + 1} and the ${stop} stop marked.`,
      }),
    ),
  );
}

export const moonfallSharePages = () => storyPreviewPlugin("moonfall-share-pages", moonfallPages);
