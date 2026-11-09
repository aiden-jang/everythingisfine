import { gmstDeg } from "../../geo/stars";
import { aimAt, horizontal, skyBodies, type SkyCity } from "../../geo/tonight";
import { sunElevation } from "../../geo/sun";
import type { EarthStoryData } from "./types";
import type { ObservationView } from "../observations/types";
import samples from "../../sources/earth-stories/comet.json";

export function cometPosition(at: number) {
  const index = Math.max(
    0,
    Math.min(samples.samples.length - 2, Math.floor((at - samples.samples[0]![0]!) / 3600000)),
  );
  const a = samples.samples[index]!;
  const b = samples.samples[index + 1]!;
  const t = Math.max(0, Math.min(1, (at - a[0]!) / (b[0]! - a[0]!)));
  const mix = (i: number) => a[i]! + (b[i]! - a[i]!) * t;
  return { lon: ((mix(1) - gmstDeg(at) + 540) % 360) - 180, lat: mix(2), au: mix(3), elongation: mix(4) };
}

export function cometSky(city: SkyCity, at: number): NonNullable<ObservationView["sky"]> {
  const body = { ...horizontal(city, cometPosition(at)), name: "NEOWISE", magnitude: 1, lit: null };
  return {
    kind: "tonight",
    city,
    at,
    look: aimAt(body),
    bodies: [...skyBodies(city, at), body],
    targetName: body.name,
  };
}

export function cometStory(city: SkyCity): EarthStoryData {
  const frames = samples.samples.map(([at, , , au, elongation]) => {
    const location = cometPosition(at!);
    const look = horizontal(city, location);
    const sun = sunElevation(city.lon, city.lat, at!);
    return {
      at: at!,
      caption: "NEOWISE above the rotating Earth",
      marks: [{ ...location, size: 15, color: 0xd6e8ea }],
      measurements: [
        { label: "Distance from Earth", value: `${au!.toFixed(3)} AU` },
        {
          label: `${city.name} · altitude`,
          value: `${look.altitude.toFixed(1)}° · ${look.altitude > 0 ? "above horizon" : "below horizon"}`,
        },
        { label: "Local sky", value: sun > -0.833 ? "Daylight" : sun > -18 ? "Twilight" : "Dark sky" },
        { label: "Separation from Sun", value: `${elongation!.toFixed(1)}°` },
      ],
    };
  });
  const evenings = frames.filter((f) => {
    const sun = sunElevation(city.lon, city.lat, f.at);
    return sun < -6 && horizontal(city, cometPosition(f.at)).altitude > 5;
  });
  const best = evenings.reduce<(typeof frames)[number] | undefined>(
    (best, f) =>
      !best ||
      horizontal(city, cometPosition(f.at)).altitude > horizontal(city, cometPosition(best.at)).altitude
        ? f
        : best,
    undefined,
  );
  return {
    frames,
    sky: (at) => cometSky(city, at),
    target: { lon: city.lon, lat: city.lat, zoom: 1.2 },
    chapters: [
      { at: Date.parse("2020-07-03T12:00:00Z"), label: "Near the Sun" },
      { at: Date.parse("2020-07-15T12:00:00Z"), label: "Mid-July" },
      { at: Date.parse("2020-07-23T12:00:00Z"), label: "Closest to Earth" },
      ...(best ? [{ at: best.at, label: "Above my horizon" }] : []),
    ],
  };
}
