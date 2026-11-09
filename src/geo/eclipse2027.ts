import { DEG } from "./sphere";

export const greatestEclipse = Date.UTC(2027, 7, 2, 10, 6, 37, 700);
const reference = Date.UTC(2027, 7, 2, 10);
const deltaT = 71.7;
const flattening = 0.99664719;
export const eclipseSlopes = [0.00460638, 0.00458344] as const;

function polynomial(t: number, a: number, b: number, c: number, d = 0) {
  return a + t * (b + t * (c + t * d));
}

// Elements from the NASA GSFC 2027 interactive path map, in terrestrial time.
export function eclipseElements(at: number) {
  const t = ((at - reference) / 1000 + deltaT) / 3600;
  return {
    x: polynomial(t, -0.01964458, 0.54471046, -0.00004438, -0.0000091),
    y: polynomial(t, 0.16006303, -0.21115686, -0.00012167, 0.00000369),
    declination: polynomial(t, 17.76247215, -0.01018139, -0.00000372) * DEG,
    hourAngle: polynomial(t, 328.42248535, 15.00209332, 0.00001343) * DEG - deltaT / 13713.44,
    l1: polynomial(t, 0.53059578, 0.0000138, -0.00001281),
    l2: polynomial(t, -0.01546428, 0.00001374, -0.00001277),
  };
}

function overlap(distance: number, moon: number, sun: number) {
  if (distance >= sun + moon) return 0;
  if (distance <= moon - sun) return 1;
  const arc = (cosine: number) => Math.acos(Math.max(-1, Math.min(1, cosine)));
  const a = arc((distance ** 2 + sun ** 2 - moon ** 2) / (2 * distance * sun));
  const b = arc((distance ** 2 + moon ** 2 - sun ** 2) / (2 * distance * moon));
  return (
    (sun ** 2 * (a - Math.sin(2 * a) / 2) + moon ** 2 * (b - Math.sin(2 * b) / 2)) / (Math.PI * sun ** 2)
  );
}

export function eclipseFrom(at: number, { lat, lon }: { lat: number; lon: number }) {
  const { x, y, declination, hourAngle, l1, l2 } = eclipseElements(at);
  const latitude = lat * DEG;
  const h = hourAngle + lon * DEG;
  const reduced = Math.atan(flattening * Math.tan(latitude));
  const rhoSin = flattening * Math.sin(reduced);
  const rhoCos = Math.cos(reduced);
  const north = Math.sin(declination);
  const equator = Math.cos(declination);
  const z = rhoSin * north + rhoCos * Math.cos(h) * equator;
  const u = x - rhoCos * Math.sin(h);
  const v = y - (rhoSin * equator - rhoCos * Math.cos(h) * north);
  const penumbra = l1 - z * eclipseSlopes[0];
  const umbra = l2 - z * eclipseSlopes[1];
  const sun = (penumbra + umbra) / 2;
  const moon = (penumbra - umbra) / 2;
  const separation = Math.hypot(u, v);
  const altitude = Math.asin(north * Math.sin(latitude) + equator * Math.cos(latitude) * Math.cos(h)) / DEG;
  const azimuth =
    (Math.atan2(
      -Math.sin(h) * equator,
      north * Math.cos(latitude) - Math.cos(h) * equator * Math.sin(latitude),
    ) /
      DEG +
      360) %
    360;
  return {
    altitude,
    azimuth,
    moonX: -u / sun,
    moonY: -v / sun,
    moonRadius: moon / sun,
    separation: separation / sun,
    cover: altitude >= 0 ? overlap(separation, moon, sun) : 0,
    total: altitude >= 0 && separation <= -umbra,
  };
}

const windowStart = Date.UTC(2027, 7, 2, 7, 25);
const windowEnd = Date.UTC(2027, 7, 2, 12, 50);

function bisect(left: number, right: number, inside: (at: number) => boolean) {
  const before = inside(left);
  while (right - left > 100) {
    const mid = (left + right) / 2;
    if (inside(mid) === before) left = mid;
    else right = mid;
  }
  return (left + right) / 2;
}

function closestApproach(read: (at: number) => ReturnType<typeof eclipseFrom>, left: number, right: number) {
  while (right - left > 100) {
    const a = (left * 2 + right) / 3;
    const b = (left + right * 2) / 3;
    if (read(a).separation < read(b).separation) right = b;
    else left = a;
  }
  return (left + right) / 2;
}

export function localEclipse(city: { lat: number; lon: number }) {
  const read = (at: number) => eclipseFrom(at, city);
  const visible = (at: number) => read(at).cover > 0;
  const total = (at: number) => read(at).total;
  const step = 15_000;
  let start: number | null = null;
  let end = windowEnd;
  let closest = Infinity;
  let best = greatestEclipse;
  let nearest = greatestEclipse;
  let nearestDistance = Infinity;
  for (let at = windowStart; at <= windowEnd; at += step) {
    const frame = read(at);
    if (frame.separation < nearestDistance) {
      nearest = at;
      nearestDistance = frame.separation;
    }
    if (frame.cover > 0) {
      start ??= bisect(at - step, at, visible);
      if (frame.separation < closest) {
        best = at;
        closest = frame.separation;
      }
    } else if (start !== null) {
      end = bisect(at - step, at, visible);
      break;
    }
  }
  if (start === null) {
    const reference = closestApproach(
      read,
      Math.max(windowStart, nearest - step),
      Math.min(windowEnd, nearest + step),
    );
    return { reference, visible: null };
  }
  const peak = closestApproach(read, Math.max(start, best - step), Math.min(end, best + step));
  const frame = read(peak);
  const totality = frame.total ? ([bisect(start, peak, total), bisect(peak, end, total)] as const) : null;
  return { reference: peak, visible: { start, end, peak, cover: frame.cover, totality } };
}
