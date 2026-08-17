/*
 * What an earthquake is, once two feeds have both had a go at describing it.
 *
 * The shape here is the whole reason the $0 constraint turned out well. With one source an event
 * would be a flat record. With two overlapping sources it cannot be, because they disagree: USGS
 * and EMSC report the same rupture minutes apart, under different identifiers, on different
 * magnitude scales, from epicentres tens of kilometres apart. A single flattened record forces a
 * winner to be picked at parse time and throws the disagreement away, and the disagreement is the
 * most interesting thing on the screen.
 *
 * So a Reading is what one agency said, and a Quake is the ground moving. Nothing collapses the two.
 */

export type SourceId = "usgs" | "emsc";

/** One agency's account of one earthquake. */
export interface Reading {
  source: SourceId;
  /** The agency's own identifier. Unique within that source, meaningless across sources. */
  id: string;
  magnitude: number;
  /**
   * Which magnitude scale, verbatim: `Mww`, `mb`, `ml`, `mwc`.
   *
   * Never dropped and never normalised away. The two feeds routinely differ by a couple of tenths
   * because they are not measuring the same quantity, and a bare number implies a precision and an
   * agreement that do not exist. DESIGN.md section 10 requires it on screen for the same reason.
   */
  scale: string;
  lon: number;
  lat: number;
  /** Kilometres below the surface. Positive downward. */
  depthKm: number;
  /** Origin time: when the ground moved, epoch ms. An estimate produced by the agency. */
  time: number;
  /** Free text from the agency, already human-readable. */
  place: string;
  /**
   * What the agency says this was: `earthquake`, `quarry blast`, `explosion`, `ice quake`.
   *
   * Carried rather than filtered out. USGS's hourly feed is a seismic feed, not an earthquake feed,
   * and a quarry blast is a real thing a seismometer recorded. Dropping them loses data; drawing
   * them without saying so labels a mine as an earthquake, which is the kind of quiet
   * mislabelling DESIGN.md section 10 exists to prevent. Kept, and named on screen.
   */
  kind: string;
  /**
   * When this reading reached us, epoch ms.
   *
   * Distinct from `time` and both are needed. `time` orders the world; `receivedAt` orders our
   * knowledge of it, and it is what the honest "since 21:40" window in the rail is measured against.
   */
  receivedAt: number;
}

/** One earthquake, as far as we can tell, with every account of it kept. */
export interface Quake {
  /** Ours, not an agency's. Derived from the first reading that arrived. */
  key: string;
  /**
   * Every source's account. At most one per source: a later reading from the same agency is a
   * revision and replaces its predecessor rather than accumulating beside it.
   */
  readings: Reading[];
  /** The reading the marker is drawn from. Never silently chosen: see `choosePrimary`. */
  primary: Reading;
}

export interface Filters {
  /** Inclusive floor on the primary reading's magnitude. */
  minMagnitude: number;
  /** Milliseconds back from `now`. Compared against origin time, not arrival. */
  windowMs: number;
  /** Sources whose events are shown. Empty means nothing is shown, which is a real state. */
  sources: ReadonlySet<SourceId>;
}
