import type { ObservationFrame, ObservationSource } from "../../app/observations/types";
import { HOUR, request } from "./common";
import transit from "./recordings/moon-transit.json";

const EPIC = "https://epic.gsfc.nasa.gov";
const photos = import.meta.glob<string>("./recordings/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});
const transitCamera = { lon: -146, lat: 15, zoom: 0.86 };

interface EpicImage {
  image: string;
  date: string;
  centroid_coordinates: { lon: number; lat: number };
  dscovr_j2000_position?: { x: number; y: number; z: number };
}

export function epicFrames(images: readonly EpicImage[]): ObservationFrame[] {
  return images
    .flatMap((image) => {
      const at = Date.parse(image.date.replace(" ", "T") + "Z");
      const coordinates = image.centroid_coordinates;
      if (
        !Number.isFinite(at) ||
        !/^epic_[a-z0-9_]+$/i.test(image.image) ||
        !Number.isFinite(coordinates?.lon) ||
        !Number.isFinite(coordinates?.lat) ||
        Math.abs(coordinates.lat) > 90 ||
        Math.abs(coordinates.lon) > 180
      )
        return [];
      const day = new Date(at).toISOString().slice(0, 10).replaceAll("-", "/");
      const distance = image.dscovr_j2000_position;
      const km = distance ? Math.hypot(distance.x, distance.y, distance.z) : 0;
      return [
        {
          at,
          camera: { lon: coordinates.lon, lat: coordinates.lat, zoom: 0.86 },
          photograph: {
            url: `${EPIC}/archive/natural/${day}/jpg/${image.image}.jpg`,
            alt: "Sunlit Earth photographed by NASA’s EPIC camera",
          },
          measurements:
            km > 0 && Number.isFinite(km)
              ? [{ label: "Spacecraft distance", value: `${Math.round(km).toLocaleString("en")} km` }]
              : [],
        },
      ];
    })
    .sort((a, b) => a.at - b.at);
}

export const epic: ObservationSource = {
  options: [
    { id: "transit", label: "Moon crossing · 16–17 July 2015" },
    { id: "latest", label: "Latest published Earth images" },
  ],
  refreshMs: 6 * HOUR,
  async load(option, signal) {
    const archive = option !== "latest";
    const frames = archive
      ? transit.map(({ id, at }) => ({
          at: Date.parse(at),
          photograph: {
            url: photos[`./recordings/${id}.webp`]!,
            alt: "NASA EPIC photograph of the Moon crossing the sunlit face of Earth",
          },
        }))
      : epicFrames((await (await request(`${EPIC}/api/natural`, signal)).json()) as EpicImage[]);
    return {
      frames,
      target: transitCamera,
      initial: archive ? 0 : Math.max(0, frames.length - 1),
      note: archive
        ? "NASA EPIC / NOAA DSCOVR · 20 reprocessed frames from the 2015 lunar transit. The Moon’s far side is sunlit from this camera’s position."
        : "NASA EPIC / NOAA DSCOVR · latest published natural-color sequence. The timestamps are image captures, and publication can lag.",
    };
  },
};
