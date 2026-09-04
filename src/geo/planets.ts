import { DEG } from "./sphere";
import { gmstDeg } from "./stars";

/* The five planets anybody can see, in the same frame as the stars behind them. See ARCHITECTURE.md#srcgeoplanetsts. */

/** Julian centuries since J2000.0, matching `sun.ts` and `moon.ts`. */
function julianCentury(at: number): number {
  return (at / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
}

const sin = (deg: number): number => Math.sin(deg * DEG);
const cos = (deg: number): number => Math.cos(deg * DEG);

interface Elements {
  name: string;
  /** Absolute magnitude V(1,0): brightness at one au from both sun and Earth, fully lit. */
  h: number;
  /** Phase coefficients on the phase angle in degrees, as a polynomial. Empty where it is negligible. */
  phase: readonly number[];
  /** Each pair is the J2000 value and its change per Julian century. */
  a: [number, number];
  e: [number, number];
  i: [number, number];
  /** Mean longitude. */
  l: [number, number];
  /** Longitude of perihelion. */
  peri: [number, number];
  /** Longitude of the ascending node. */
  node: [number, number];
}

/*
 * The Earth is in this table and is not offered as a planet. Every position here is geocentric, which means
 * a subtraction against the Earth's own heliocentric position, and keeping it in the same table with the
 * same rates is what stops the two halves of that subtraction coming from different sources.
 */
const EARTH: Elements = {
  name: "Earth",
  h: 0,
  phase: [],
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  i: [-0.00001531, -0.01294668],
  l: [100.46457166, 35_999.37244981],
  peri: [102.93768193, 0.32327364],
  node: [0, 0],
};

const PLANETS: readonly Elements[] = [
  {
    name: "Mercury",
    h: -0.42,
    phase: [0.038, -0.000273, 0.000002],
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    i: [7.00497902, -0.00594749],
    l: [252.2503235, 149_472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  {
    name: "Venus",
    h: -4.4,
    phase: [0.0009, 0.000239, -0.00000065],
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    i: [3.39467605, -0.0007889],
    l: [181.9790995, 58_517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  {
    name: "Mars",
    h: -1.52,
    phase: [0.016],
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    i: [1.84969142, -0.00813131],
    l: [-4.55343205, 19_140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  {
    name: "Jupiter",
    h: -9.4,
    phase: [0.005],
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    i: [1.30439695, -0.00183714],
    l: [34.39644051, 3_034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  {
    name: "Saturn",
    h: -8.88,
    phase: [],
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    i: [2.48599187, 0.00193609],
    l: [49.95424423, 1_222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
];

/** Heliocentric ecliptic rectangular coordinates, in au. */
function heliocentric(el: Elements, t: number): [number, number, number] {
  const a = el.a[0] + el.a[1] * t;
  const e = el.e[0] + el.e[1] * t;
  const i = el.i[0] + el.i[1] * t;
  const l = el.l[0] + el.l[1] * t;
  const peri = el.peri[0] + el.peri[1] * t;
  const node = el.node[0] + el.node[1] * t;

  const arg = peri - node;
  let m = (l - peri) % 360;
  if (m > 180) m -= 360;
  if (m < -180) m += 360;

  // Kepler's equation by Newton. Eccentricities top out at Mercury's 0.206, where six iterations land
  // inside a millionth of a degree. Fixed count rather than a tolerance, so the cost is the same every frame.
  let ecc = m;
  for (let k = 0; k < 6; k += 1) {
    const dm = m - (ecc - (e * Math.sin(ecc * DEG)) / DEG);
    ecc += dm / (1 - e * Math.cos(ecc * DEG));
  }

  // In the orbital plane, with the perihelion on the x axis.
  const px = a * (Math.cos(ecc * DEG) - e);
  const py = a * Math.sqrt(1 - e * e) * Math.sin(ecc * DEG);

  // Then the three rotations that put the orbit in the ecliptic.
  const ca = cos(arg);
  const sa = sin(arg);
  const ci = cos(i);
  const si = sin(i);
  const cn = cos(node);
  const sn = sin(node);
  const xa = px * ca - py * sa;
  const ya = px * sa + py * ca;
  return [cn * xa - sn * ya * ci, sn * xa + cn * ya * ci, ya * si];
}

export interface Planet {
  name: string;
  /** Longitude it stands over, in the app's geographic frame. */
  lon: number;
  /** Latitude it stands over: its declination. */
  lat: number;
  /** Apparent visual magnitude, distance and phase included. Saturn's rings are not. */
  magnitude: number;
  /** Distance from the Earth in au, which is what makes the magnitude vary. */
  distanceAu: number;
}

export function planetPositions(at: number): Planet[] {
  const t = julianCentury(at);
  const earth = heliocentric(EARTH, t);
  const obliquity = 23.439_291 - 0.013_004_2 * t;
  const gmst = gmstDeg(at);

  return PLANETS.map((el) => {
    const p = heliocentric(el, t);
    const x = p[0] - earth[0];
    const y = p[1] - earth[1];
    const z = p[2] - earth[2];

    // Ecliptic rectangular to equatorial, then to right ascension and declination.
    const eqY = y * cos(obliquity) - z * sin(obliquity);
    const eqZ = y * sin(obliquity) + z * cos(obliquity);
    const ra = Math.atan2(eqY, x) / DEG;
    const dec = Math.atan2(eqZ, Math.hypot(x, eqY)) / DEG;

    const distanceAu = Math.hypot(x, y, z);
    const sunDistance = Math.hypot(p[0], p[1], p[2]);
    // The phase angle at the planet, between the sun and us. Straight from the triangle the three bodies
    // make, which is why `EARTH` is in the same table.
    const earthSun = Math.hypot(earth[0], earth[1], earth[2]);
    const cosPhase =
      (sunDistance * sunDistance + distanceAu * distanceAu - earthSun * earthSun) /
      (2 * sunDistance * distanceAu);
    const phaseDeg = Math.acos(Math.max(-1, Math.min(1, cosPhase))) / DEG;
    let lit = 0;
    for (let k = 0; k < el.phase.length; k += 1) lit += el.phase[k]! * phaseDeg ** (k + 1);
    const magnitude = el.h + 5 * Math.log10(sunDistance * distanceAu) + lit;

    let lon = ra - gmst;
    lon = (((lon % 360) + 540) % 360) - 180;
    return { name: el.name, lon, lat: dec, magnitude, distanceAu };
  });
}
