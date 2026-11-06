import { eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import { skyCities } from "../../app/tonight/cities";
import { ObservationDataError } from "../../app/observations/types";
import type { ObservationSource } from "../../app/observations/types";
import { horizontal } from "../../geo/tonight";
import { DEG, toVec3 } from "../../geo/sphere";
import { subsolarPoint, sunElevation } from "../../geo/sun";
import { HOUR, MINUTE, request } from "./common";

const ORBIT = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";

function position(satellite: SatRec, at: number) {
  const date = new Date(at);
  const next = propagate(satellite, date);
  if (!next || !next.position) return null;
  const point = eciToGeodetic(next.position, gstime(date));
  const lat = point.latitude / DEG;
  const lon = point.longitude / DEG;
  const sun = subsolarPoint(at);
  const a = toVec3(lon, lat, 1 + point.height / 6371);
  const b = toVec3(sun.lon, sun.lat, 1);
  const dot = a.reduce((sum, value, index) => sum + value * b[index]!, 0);
  const lit = dot >= 0 || Math.hypot(...a) ** 2 - dot ** 2 > 1;
  return { at, lat, lon, height: point.height, lift: point.height / 6371, lit };
}

export const orbit: ObservationSource = {
  options: skyCities.map(({ name }) => ({ id: name, label: name })),
  refreshMs: 3 * HOUR,
  async load(option, signal) {
    const city = skyCities.find(({ name }) => name === option) ?? skyCities[0]!;
    const tle = (await (await request(ORBIT, signal)).text()).split(/\r?\n/);
    const first = tle.find((line) => line.startsWith("1 25544"));
    const second = tle.find((line) => line.startsWith("2 25544"));
    if (!first || !second) throw new ObservationDataError("CelesTrak returned no usable ISS orbital data.");
    const epoch =
      Date.UTC(2000 + Number(first.slice(18, 20)), 0, 1) + (Number(first.slice(20, 32)) - 1) * 24 * HOUR;
    const now = Math.floor(Date.now() / MINUTE) * MINUTE;
    if (!Number.isFinite(epoch) || Math.abs(now - epoch) > 7 * 24 * HOUR)
      throw new ObservationDataError("The ISS orbital data is too old to predict a pass.");
    const sat = twoline2satrec(first, second);
    let pass: number | undefined;
    let overhead: number | undefined;
    let overheadPeak = -90;
    let overheadDone = false;
    let peak = -90;
    const daylight = (at: number) => sunElevation(city.lon, city.lat, at);
    for (let at = now; at < now + 48 * HOUR; at += 30_000) {
      const pos = position(sat, at);
      if (!pos) continue;
      const sky = horizontal(city, pos, 1 + pos.lift);
      if (!overheadDone && sky.altitude >= 10 && sky.altitude > overheadPeak) {
        overheadPeak = sky.altitude;
        overhead = at;
      } else if (overhead !== undefined && sky.altitude < 10) overheadDone = true;
      const visible = sky.altitude >= 10 && pos.lit && daylight(at) < -6;
      if (visible && sky.altitude > peak) {
        peak = sky.altitude;
        pass = at;
      } else if (pass !== undefined && !visible) break;
    }
    const start = (pass ?? overhead ?? now + 48 * MINUTE) - 48 * MINUTE;
    const points = Array.from({ length: 193 }, (_, index) => position(sat, start + index * 30_000)).filter(
      (x) => x !== null,
    );
    const ground = points.map(({ lon, lat }) => ({ lon, lat }));
    const frames = points.map((point, index) => {
      const look = horizontal(city, point, 1 + point.lift);
      const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(look.azimuth / 45) % 8];
      return {
        at: point.at,
        localSky: { city, look },
        paths: [
          { points: ground, color: 0x577284 },
          {
            points: points.slice(Math.max(0, index - 17), index + 1),
            color: point.lit ? 0x87dee6 : 0x777fa7,
          },
          { points: [{ lon: point.lon, lat: point.lat }, point], color: 0x7797a6 },
        ],
        marks: [
          { ...city, size: 14 },
          { ...point, size: 21, color: point.lit ? 0xb0f1ee : 0x979ed1 },
        ],
        measurements: [
          { label: "Altitude above Earth", value: `${Math.round(point.height)} km` },
          {
            label: "From city",
            value: look.altitude < 0 ? "Below horizon" : `${Math.round(look.altitude)}° high · ${compass}`,
          },
          { label: "Sunlight", value: point.lit ? "Sunlit" : "In Earth’s shadow" },
        ],
      };
    });
    return {
      target: { lon: city.lon, lat: city.lat, zoom: 1.18 },
      mapTarget: { lon: city.lon, lat: 0, zoom: 0.78 },
      frames,
      chapters:
        pass !== undefined || overhead !== undefined
          ? [
              {
                index: 96,
                label: pass !== undefined ? "Jump to visible pass" : "Jump to next pass above 10°",
              },
            ]
          : [],
      note: `Calculated from ISS elements dated ${new Date(epoch).toISOString().slice(0, 10)}. ${pass === undefined ? "No sunlit pass above 10° found in the next 48 hours." : "Predicted visibility assumes clear skies and a level horizon."}`,
    };
  },
};
