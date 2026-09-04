import type { Store } from "../data/store";
import type { Filters } from "../data/types";
import { matches } from "../data/filter";

/* Named seismic regions, so the rail has somewhere to fly to. See ARCHITECTURE.md. */

export interface Region {
  name: string;
  /** Where the camera goes. The middle of the box, not the middle of the events. */
  lon: number;
  lat: number;
  /** west, south, east, north. West > east means the box crosses the antimeridian. */
  bounds: readonly [number, number, number, number];
  zoom: number;
}

export const REGIONS: readonly Region[] = [
  { name: "Japan & Kurils", lon: 142, lat: 39, bounds: [128, 30, 158, 52], zoom: 2 },
  { name: "Kamchatka", lon: 160, lat: 53, bounds: [155, 48, 172, 60], zoom: 2.2 },
  { name: "Indonesia", lon: 118, lat: -4, bounds: [95, -11, 141, 6], zoom: 1.9 },
  { name: "Philippines", lon: 124, lat: 12, bounds: [117, 4, 130, 20], zoom: 2.3 },
  { name: "Tonga & Kermadec", lon: -175, lat: -22, bounds: [-180, -38, -170, -14], zoom: 2.2 },
  { name: "Alaska & Aleutians", lon: -155, lat: 57, bounds: [-180, 50, -130, 66], zoom: 1.8 },
  { name: "California", lon: -120, lat: 37, bounds: [-126, 32, -114, 42], zoom: 2.4 },
  { name: "Chile & Peru", lon: -71, lat: -25, bounds: [-80, -45, -65, -5], zoom: 1.8 },
  { name: "Mediterranean & Turkey", lon: 28, lat: 38, bounds: [10, 32, 45, 44], zoom: 2.1 },
  { name: "Hindu Kush & Himalaya", lon: 75, lat: 34, bounds: [60, 25, 95, 40], zoom: 2.1 },
  { name: "Mid-Atlantic Ridge", lon: -30, lat: 10, bounds: [-45, -55, -10, 65], zoom: 1.5 },
];

/** Boxes that straddle the date line have west > east, so the test splits rather than compares. */
export function contains(region: Region, lon: number, lat: number): boolean {
  const [w, s, e, n] = region.bounds;
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

export interface RegionCount {
  region: Region;
  count: number;
}

/** Counts per region, largest first, over exactly what is on screen. See ARCHITECTURE.md. */
export function countByRegion(store: Store, filters: Filters, now: number): RegionCount[] {
  const counts = new Array<number>(REGIONS.length).fill(0);
  store.forEach((quake) => {
    if (!matches(quake, filters, now)) return;
    const { lon, lat } = quake.primary;
    for (let i = 0; i < REGIONS.length; i += 1) {
      if (contains(REGIONS[i]!, lon, lat)) counts[i] = counts[i]! + 1;
    }
  });
  return REGIONS.map((region, i) => ({ region, count: counts[i]! })).sort((a, b) => b.count - a.count);
}
