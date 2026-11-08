import survey from "./recordings/traverses.json";
import elevationUrl from "./recordings/taurus-littrow.bin?url";
import terrainUrl from "./recordings/taurus-littrow.webp";
import moonUrl from "./recordings/moon.webp";

export const lunarSources = {
  terrain: "https://astrogeology.usgs.gov/search/map/moon_apollo_17_lroc_nac_landing_site_orthomosaic_50cm",
  routes: "https://doi.org/10.1029/2018EA000408",
  moon: "https://svs.gsfc.nasa.gov/4720/",
};

// Easting and southward offset in km, in the survey's transverse Mercator grid.
export type LunarPoint = readonly [x: number, z: number];
export const valley = { left: -7.5, right: 6, near: 6, far: -5.3, columns: 210, rows: 176 };
const pointAt = (point: number[]): LunarPoint => [point[0]!, point[1]!];
export const landing = pointAt(survey.landing);

const days = [
  { day: "11–12 Dec", title: "Steno Crater", stations: ["Steno Crater"] },
  { day: "12–13 Dec", title: "South Massif", stations: ["Nansen", "Lara", "Shorty Crater", "Camelot"] },
  { day: "13–14 Dec", title: "North Massif", stations: ["Station 6", "Station 7", "Station 8", "Van Serg"] },
] as const;

export const traverses = days.map((day, i) => {
  const paths = survey.tracks[i]!.map((path) => path.map(pointAt));
  let km = 0;
  const segments = paths.flatMap((path) =>
    path.slice(1).flatMap((to, index) => {
      const from = path[index]!;
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (length === 0) return [];
      const start = km;
      km += length;
      return [{ from, to, start, end: km }];
    }),
  );
  const stations = day.stations.map((name, index) => {
    const point = pointAt(survey.stations[i]![index]!);
    let closest = Infinity;
    let distance = 0;
    for (const { from, to, start, end } of segments) {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const along = ((point[0] - from[0]) * dx + (point[1] - from[1]) * dz) / (dx * dx + dz * dz);
      const fraction = Math.min(1, Math.max(0, along));
      const offset = Math.hypot(from[0] + dx * fraction - point[0], from[1] + dz * fraction - point[1]);
      if (offset < closest) {
        closest = offset;
        distance = start + (end - start) * fraction;
      }
    }
    return { name, point, distance };
  });
  return { ...day, segments, km, stations };
});

async function decode(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadLunarSurvey(signal: AbortSignal) {
  const [data, terrain, moon] = await Promise.all([
    fetch(elevationUrl, { signal }).then((response) => {
      if (!response.ok) throw new Error("Lunar elevation grid unavailable");
      return response.arrayBuffer();
    }),
    decode(terrainUrl),
    decode(moonUrl),
  ]);
  const elevations = new Int16Array(data);
  if (elevations.length !== valley.columns * valley.rows) throw new Error("Incomplete lunar elevation grid");
  return { elevations, terrain, moon };
}
