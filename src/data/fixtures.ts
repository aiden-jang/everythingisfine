import type { Reading, SourceId } from "./types";

/* A deterministic pretend planet, for the questions recorded responses cannot answer: what the store does
   over four simulated hours, what happens when two agencies report the same rupture with the disagreement
   real feeds show, and what happens at capacity. See ARCHITECTURE.md. */

/** mulberry32. Small, fast, and good enough for placing fake earthquakes. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly where earthquakes are, so tests exercise real longitudes rather than a uniform sphere. */
const SEISMIC_BELTS: readonly (readonly [number, number])[] = [
  [142, 38],
  [130, -5],
  [-72, -33],
  [-122, 38],
  [155, 52],
  [26, 38],
  [70, 36],
  [-86, 12],
];

export interface SyntheticOptions {
  /** Epoch ms of the first event. */
  start: number;
  /** How long the run covers, in ms. */
  durationMs: number;
  /** Mean seconds between events. */
  everySeconds: number;
  /** Fraction of events that both agencies report. */
  corroboration: number;
  seed?: number;
}

/**
 * A stream of readings in arrival order, with the disagreement the real feeds have: a different identifier, an
 * origin time a few seconds off, an epicentre tens of kilometres away, a magnitude a couple of tenths apart
 * and a different scale name. Generating agreement would make the association logic look correct while
 * testing nothing.
 */
export function* syntheticReadings(opts: SyntheticOptions): Generator<Reading> {
  const rand = seeded(opts.seed ?? 1);
  let t = opts.start;
  let n = 0;
  const end = opts.start + opts.durationMs;

  while (t < end) {
    const belt = SEISMIC_BELTS[Math.floor(rand() * SEISMIC_BELTS.length)]!;
    const lon = belt[0] + (rand() - 0.5) * 8;
    const lat = belt[1] + (rand() - 0.5) * 8;
    // Gutenberg-Richter is exponential: small events vastly outnumber large ones.
    const magnitude = Math.round((1.5 + -Math.log10(Math.max(1e-6, rand())) * 1.4) * 10) / 10;
    const depthKm = Math.round(rand() * 300);
    n += 1;

    const base = (source: SourceId, id: string, dt: number, dm: number, jitterKm: number): Reading => ({
      source,
      id,
      magnitude: Math.round((magnitude + dm) * 10) / 10,
      scale: source === "usgs" ? "Mww" : "mb",
      // Degrees per kilometre at the equator, near enough for a fixture.
      lon: lon + jitterKm / 111,
      lat: lat + jitterKm / 111,
      depthKm,
      time: t + dt,
      place: `${Math.round(Math.abs(lat))} km from belt ${belt[0]}`,
      kind: "earthquake",
      receivedAt: t + dt + 20_000,
    });

    yield base("usgs", `us${n.toString(36)}`, 0, 0, 0);
    if (rand() < opts.corroboration) {
      yield base(
        "emsc",
        `em${n.toString(36)}`,
        Math.round((rand() - 0.5) * 20_000),
        Math.round((rand() - 0.5) * 6) / 10,
        (rand() - 0.5) * 90,
      );
    }

    // Poisson-ish spacing, so events do not arrive on a metronome.
    t += Math.max(1_000, -Math.log(Math.max(1e-6, rand())) * opts.everySeconds * 1000);
  }
}
