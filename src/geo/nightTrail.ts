import { moonPosition, moonRadii } from "./moon";
import { planetPositions } from "./planets";
import { horizontal, type SkyCity, type SkyLook } from "./tonight";

export function nightTrail(city: SkyCity, name: string, start: number, end: number): SkyLook[] {
  function position(at: number) {
    if (name === "Moon") {
      const moon = moonPosition(at);
      return horizontal(city, moon, moonRadii(moon.distanceKm));
    }
    const planet = planetPositions(at).find((candidate) => candidate.name === name);
    return planet && horizontal(city, planet);
  }

  const points: SkyLook[] = [];
  const steps = Math.max(1, Math.ceil((end - start) / 600_000));
  let previousAt = start;
  for (let i = 0; i <= steps; i++) {
    const at = start + ((end - start) * i) / steps;
    const look = position(at);
    if (!look) return [];
    const previous = points.at(-1);
    if (previous && previous.altitude > 0 !== look.altitude > 0) {
      let lo = previousAt;
      let hi = at;
      while (hi - lo > 1000) {
        const middle = (lo + hi) / 2;
        if (position(middle)!.altitude > 0 === previous.altitude > 0) lo = middle;
        else hi = middle;
      }
      points.push({ azimuth: position((lo + hi) / 2)!.azimuth, altitude: 0 });
    }
    points.push(look);
    previousAt = at;
  }
  return points;
}
