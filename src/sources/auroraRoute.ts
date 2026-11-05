import { DEG } from "../geo/sphere";
import { subsolarPoint } from "../geo/sun";
import { AURORA_LON, auroraAt, type Aurora } from "./aurora";

export type Hemisphere = 1 | -1;

export interface OvalPoint {
  lon: number;
  lat: number;
  probability: number;
}

export interface AuroraRoute {
  hemisphere: Hemisphere;
  focus: OvalPoint;
  oval: readonly (OvalPoint | null)[];
}

export interface AuroraRun {
  forecast: Aurora;
  route: AuroraRoute;
}

const DARK = Math.sin(-6 * DEG);

export function currentForecast(forecast: Aurora, now: number): boolean {
  return (
    !forecast.estimatedTime &&
    forecast.forecastAt >= now - 90 * 60_000 &&
    forecast.forecastAt <= now + 120 * 60_000
  );
}

export function auroraRoutes(forecast: Aurora): AuroraRoute[] {
  const sun = subsolarPoint(forecast.forecastAt);
  const sinDeclination = Math.sin(sun.lat * DEG);
  const cosDeclination = Math.cos(sun.lat * DEG);
  const lightByLongitude = Array.from({ length: AURORA_LON }, (_, lon) => Math.cos((lon - sun.lon) * DEG));
  const latitude = Array.from({ length: 45 }, (_, i) => {
    const lat = 45 + i;
    return { lat, sin: Math.sin(lat * DEG), cos: Math.cos(lat * DEG) };
  });

  const routes: AuroraRoute[] = [];
  for (const hemisphere of [1, -1] as const) {
    const oval: (OvalPoint | null)[] = [];
    let focus: OvalPoint | null = null;
    let focusLight = 0;
    for (let lon = 0; lon < AURORA_LON; lon++) {
      let column: OvalPoint | null = null;
      let columnLight = 0;
      for (const row of latitude) {
        const lat = row.lat * hemisphere;
        const light =
          row.sin * hemisphere * sinDeclination + row.cos * cosDeclination * lightByLongitude[lon]!;
        if (light > DARK) continue;
        const probability = auroraAt(forecast, lon, lat);
        if (!probability) continue;
        if (
          !column ||
          probability > column.probability ||
          (probability === column.probability && light < columnLight)
        ) {
          column = { lon, lat, probability };
          columnLight = light;
        }
      }
      oval.push(column);
      if (
        column &&
        (!focus ||
          column.probability > focus.probability ||
          (column.probability === focus.probability && columnLight < focusLight))
      ) {
        focus = column;
        focusLight = columnLight;
      }
    }
    if (focus) routes.push({ hemisphere, focus, oval });
  }
  return routes.sort((a, b) => b.focus.probability - a.focus.probability);
}
