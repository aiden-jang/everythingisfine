/* Where the sun is overhead, right now. See ARCHITECTURE.md. */

const DEG = Math.PI / 180;

export interface Subsolar {
  /** Longitude where the sun is directly overhead, in degrees east. */
  lon: number;
  /** Latitude where the sun is directly overhead: the solar declination. */
  lat: number;
}

/** Julian centuries since J2000.0. */
function julianCentury(at: number): number {
  return (at / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
}

export function subsolarPoint(at: number): Subsolar {
  const t = julianCentury(at);

  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const centre =
    Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * meanAnomaly * DEG) * 0.000289;

  const trueLongitude = meanLongitude + centre;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG);

  const declination = Math.asin(
    Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG),
  ) / DEG;

  // The equation of time, in minutes. A naive version drops it, which puts the terminator up to a quarter
  // of an hour out - about four degrees of longitude, visible and wrong for a reason nobody would find.
  const y = Math.tan((obliquity / 2) * DEG) ** 2;
  const equationOfTime = 4 * (
    y * Math.sin(2 * meanLongitude * DEG)
    - 2 * eccentricity * Math.sin(meanAnomaly * DEG)
    + 4 * eccentricity * y * Math.sin(meanAnomaly * DEG) * Math.cos(2 * meanLongitude * DEG)
    - 0.5 * y * y * Math.sin(4 * meanLongitude * DEG)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG)
  ) / DEG;

  // Solar noon is where the true sun crosses the meridian: UTC noon shifted by the equation of time.
  const minutesUtc = ((at % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  const lon = -((minutesUtc + equationOfTime) / 4 - 180);

  return { lon: ((((lon + 180) % 360) + 360) % 360) - 180, lat: declination };
}

/* Two things the terminator already knew and nothing read. See ARCHITECTURE.md. */

/**
 * Local apparent solar time at a longitude, in hours from midnight. Noon is where the true sun crosses the
 * meridian, so this is anchored on the subsolar longitude. Apparent rather than mean, because
 * `subsolarPoint` already carries the equation of time.
 */
export function solarHour(lon: number, at: number): number {
  const { lon: sub } = subsolarPoint(at);
  let east = lon - sub;
  // Wrapped, or a point either side of the antimeridian from the sun reads a day away from the truth.
  east -= Math.round(east / 360) * 360;
  const hour = 12 + east / 15;
  return ((hour % 24) + 24) % 24;
}

/**
 * How high the sun stood over a place, in degrees above the horizon. The zenith angle is the angular
 * distance to the subsolar point, so this is one spherical cosine. Negative below the horizon.
 */
export function sunElevation(lon: number, lat: number, at: number): number {
  const sub = subsolarPoint(at);
  const phi = lat * DEG;
  const dec = sub.lat * DEG;
  let east = lon - sub.lon;
  east -= Math.round(east / 360) * 360;
  const cosZenith =
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(east * DEG);
  return Math.asin(Math.max(-1, Math.min(1, cosZenith))) / DEG;
}

/** Daylight, twilight or dark, on the conventional boundaries. See ARCHITECTURE.md. */
export function daylight(elevationDeg: number): "daylight" | "twilight" | "dark" {
  if (elevationDeg > 0) return "daylight";
  if (elevationDeg > -6) return "twilight";
  return "dark";
}

/** `03:12`, on a 24-hour clock, from an hour that may be fractional. */
export function solarClock(hour: number): string {
  const total = Math.round(((hour % 24) + 24) % 24 * 60);
  // Rounding 23:59:40 up must give 00:00 rather than 24:00, which is not a time.
  const m = total % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
