import { DEG, EARTH_RADIUS_KM } from "../../geo/sphere";
import { coastRaster, destination } from "../observations/replayGeometry";
import type { ObservationPath, ObservationView } from "../observations/types";
import { coast, FIXES, type stormFrame } from "./stormTrack";

type Frame = ReturnType<typeof stormFrame>;
const track = FIXES.map(({ lon, lat }) => ({ lon, lat }));
export const stormTarget = { lon: -88.2, lat: 27.25, zoom: 2.25 };
export const stormLens = { globe: 2.85, map: 9 };
export const gulf = coastRaster(
  coast.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => ({ lon: lon!, lat: lat! })))),
  [-112, 10, -65, 45],
);

function windPath(storm: Frame["storm"], radii: number[], color: number): ObservationPath {
  const points = radii.flatMap((radius, quadrant) =>
    Array.from({ length: 13 }, (_, i) =>
      destination(
        storm.lon,
        storm.lat,
        (radius * 1.852) / EARTH_RADIUS_KM,
        ((quadrant + i / 12) * Math.PI) / 2,
      ),
    ),
  );
  return { color, points: [...points, points[0]!] };
}

export function stormGeography(
  { storm, camera }: Frame,
  cinematic: boolean,
): Pick<ObservationView, "frame" | "follow"> {
  const center = { lon: storm.lon, lat: storm.lat };
  const paths: ObservationPath[] = [
    { color: 0x8d785f, points: track },
    { color: 0xffce8f, points: [...track.slice(0, storm.fixIndex + 1), center] },
  ];
  if (storm.r34) paths.push(windPath(storm, storm.r34, 0xa5c9d9));
  if (storm.r64) paths.push(windPath(storm, storm.r64, 0xf1bd77));
  return {
    frame: {
      at: storm.at,
      raster: gulf,
      paths,
      marks: [
        ...track.map((point, index) => ({
          ...point,
          size: 8,
          color: index <= storm.fixIndex ? 0xe2b67e : 0x947c66,
        })),
        { ...center, lift: 0.015, size: 25, color: 0xffdfac },
      ],
    },
    follow: {
      lon: camera.lon,
      lat: camera.lat,
      zoom: 2.25 + (0.255 - camera.distance) * 2,
      bank: cinematic ? camera.bank * DEG : 0,
      pitch: cinematic ? camera.pitch * DEG * 0.085 : 0,
    },
  };
}
