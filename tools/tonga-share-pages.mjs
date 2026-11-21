import { readFileSync } from "node:fs";
import { storyPreviewPage, storyPreviewPlugin } from "./story-preview-pages.mjs";

const data = JSON.parse(readFileSync(new URL("../src/app/tonga/tonga.json", import.meta.url), "utf8"));
const clock = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function pressurePages(shell) {
  return data.stations.flatMap((station) =>
    station.values.flatMap((raw, index) => {
      if (!/^[A-Z]+$/.test(station.id) || !Number.isFinite(raw)) return [];
      const minute = station.start + index;
      return [
        storyPreviewPage(shell, {
          path: `/share/tonga/${station.id}/${minute}/`,
          title: `Tonga’s shockwave, recorded in ${station.name}.`,
          description: `${((raw / 1000) * 33.8638866667).toFixed(2)} hPa at ${clock(minute)} UTC on 15 January 2022. One-minute station pressure from ASOS / Iowa Environmental Mesonet.`,
          image: `/share/tonga-${station.id}.png`,
          alt: `Tonga’s shockwave: ${station.name} station pressure trace, 15 January 2022. The selected reading is described in the link text.`,
        }),
      ];
    }),
  );
}

export const tongaSharePages = () => storyPreviewPlugin("tonga-share-pages", pressurePages);
